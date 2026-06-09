import { Track, getIdealRacingLineOffset } from "./tracksData";

interface TelemetryPoint {
  index: number;
  x: number;
  y: number;
  s: number; // Cumulative distance (meters)
  radius: number; // Curvature radius (meters)
  targetSpeed: number; // Friction-limited speed (km/h)
  speed: number; // Simulated speed (km/h)
  accelG: number; // Dynamic acceleration/braking G
  lateralG: number; // Lateral G-force
  isBraking: boolean;
  throttle: number; // 0..100
  offsetX: number; // offset from centerline
  offsetY: number; // offset from centerline
}

export interface TelemetrySummary {
  lapTime: number;
  avgSpeed: number;
  maxSpeed: number;
  maxG: number;
  throttleRatio: number;
  brakingPointsCount: number;
  averageDeviation: number;
  idealLapTime: number;
  points: TelemetryPoint[];
}

export function simulateLap(
  track: Track,
  racerPoints: { x: number; y: number }[]
): TelemetrySummary {
  const steps = racerPoints.length;
  if (steps < 4) {
    throw new Error("Telemetry requires at least 4 nodes along the track.");
  }

  // 1. Calculate cumulative distance and radius of curvature
  const rawPoints: { x: number; y: number; s: number; radius: number }[] = [];
  let cumulativeDist = 0;

  // Let's first smooth the racer points with a small low-pass filter to swallow jitter from paper drawing
  const smoothedPoints: { x: number; y: number }[] = [];
  for (let i = 0; i < steps; i++) {
    const prev = racerPoints[i === 0 ? steps - 1 : i - 1];
    const curr = racerPoints[i];
    const next = racerPoints[i === steps - 1 ? 0 : i + 1];
    
    // Simple 3-point rolling average
    smoothedPoints.push({
      x: prev.x * 0.15 + curr.x * 0.7 + next.x * 0.15,
      y: prev.y * 0.15 + curr.y * 0.7 + next.y * 0.15
    });
  }

  for (let i = 0; i < steps; i++) {
    const curr = smoothedPoints[i];
    const next = smoothedPoints[i === steps - 1 ? 0 : i + 1];

    // Distance between points in pixels
    const dx = next.x - curr.x;
    const dy = next.y - curr.y;
    const pixelDist = Math.sqrt(dx * dx + dy * dy);
    const meterDist = pixelDist * track.scaleMetersPerPixel;

    // Radius of curvature base calculation using 3 points: A (prev), B (curr), C (next)
    const prev = smoothedPoints[i === 0 ? steps - 1 : i - 1];
    
    const r = calculateRadiusOfCurvature(prev, curr, next, track.scaleMetersPerPixel);

    rawPoints.push({
      x: curr.x,
      y: curr.y,
      s: cumulativeDist,
      radius: r
    });

    cumulativeDist += meterDist;
  }

  // Update final distance to close the loop
  rawPoints[0].s = 0; // anchor start

  // 2. Compute friction-limited cornering speed for every node
  // In F1, corner speed is limited by tyre adhesion: v_corner = sqrt(mu * g * R)
  // Let's assume F1 tyres have high downforce, so dynamic grip coefficient mu is around 2.5 to 4.2
  // Let's model a realistic traction model: mu(R) decreases slightly in extremely tight turns due to tyre slips
  const GRAVITY = 9.81; // m/s^2
  const maxEngineSpeedKmh = 345; // m/s equivalent is ~95.8 m/s
  const maxEngineSpeedMs = maxEngineSpeedKmh / 3.6;

  const initialSpeeds = rawPoints.map((pt) => {
    const R = pt.radius;
    // Grip coefficient increases with downforce (which scales with speed).
    // For a simple stable calculation: R has limits.
    if (R > 800) {
      return maxEngineSpeedMs; // Infinite radius = straight line speed
    }

    const gripCoeff = 1.8 + Math.min(2.4, 15 / Math.sqrt(R + 1)); // more grip on wide turns due to aero, but tight turns are mechanically grippy
    const maxCornerSpeedMs = Math.sqrt(gripCoeff * GRAVITY * R);
    return Math.min(maxEngineSpeedMs, maxCornerSpeedMs);
  });

  // 3. Multi-Pass Velocity Profiles (Acceleration and Braking)
  // Dynamic Limits of F1 car:
  // Deceleration (Carbon brakes): up to 4.8 Gs = 4.8 * 9.81 ≈ 47.1 m/s^2
  // Acceleration (Hybrid engine + traction): up to 1.6 Gs = 1.6 * 9.81 ≈ 15.7 m/s^2 (limited heavily at high speeds by drag)
  const maxDecel = 4.4 * GRAVITY; // m/s^2
  const maxAccelBase = 1.4 * GRAVITY; // m/s^2

  const speeds = [...initialSpeeds];

  // Forward Pass: Acceleration limit
  // v_new^2 <= v_old^2 + 2 * a * ds
  for (let it = 0; it < 2; it++) { // 2 passes to ensure closed-loop continuity
    for (let i = 0; i < steps; i++) {
      const currIdx = i;
      const nextIdx = i === steps - 1 ? 0 : i + 1;

      const currPt = rawPoints[currIdx];
      const nextPt = rawPoints[nextIdx];
      
      let ds = nextPt.s - currPt.s;
      if (ds < 0) {
        // Closed loop wrapping calculation
        ds = (cumulativeDist - currPt.s) + nextPt.s;
      }
      if (ds <= 0) ds = 1e-3; // Safeguard

      // F1 engines are power-limited at high-speeds due to aerodynamic drag:
      // F_aero = 0.5 * rho * Cd * A * v^2 -> acceleration capabilities decrease linearly as speed approaches maxEngineSpeedMs
      const currentSpeed = speeds[currIdx];
      const speedRatio = currentSpeed / maxEngineSpeedMs;
      const activeAccel = Math.max(0.1 * GRAVITY, maxAccelBase * (1.0 - 0.75 * speedRatio * speedRatio));

      const maxReachableSpeedSq = currentSpeed * currentSpeed + 2 * activeAccel * ds;
      const maxReachableSpeed = Math.sqrt(maxReachableSpeedSq);

      if (speeds[nextIdx] > maxReachableSpeed) {
        speeds[nextIdx] = maxReachableSpeed;
      }
    }
  }

  // Backward Pass: Braking limit
  // v_new^2 <= v_old^2 + 2 * d * ds
  for (let it = 0; it < 3; it++) { // 3 passes to fully settle severe braking zones
    for (let i = steps - 1; i >= 0; i--) {
      const currIdx = i;
      const prevIdx = i === 0 ? steps - 1 : i - 1;

      const currPt = rawPoints[currIdx];
      const prevPt = rawPoints[prevIdx];

      let ds = currPt.s - prevPt.s;
      if (ds < 0) {
        ds = (cumulativeDist - prevPt.s) + currPt.s;
      }
      if (ds <= 0) ds = 1e-3;

      const maxSafeSpeedSq = speeds[currIdx] * speeds[currIdx] + 2 * maxDecel * ds;
      const maxSafeSpeed = Math.sqrt(maxSafeSpeedSq);

      if (speeds[prevIdx] > maxSafeSpeed) {
        speeds[prevIdx] = maxSafeSpeed;
      }
    }
  }

  // 4. Compute metrics at each telemetry node
  const telemetryPoints: TelemetryPoint[] = [];
  let totalLapTime = 0;
  let maxLateralG = 0;
  let maxComputedSpeed = 0;
  let brakingCount = 0;
  let throttleSum = 0;

  for (let i = 0; i < steps; i++) {
    const currPt = rawPoints[i];
    const nextPt = rawPoints[i === steps - 1 ? 0 : i + 1];
    
    let ds = nextPt.s - currPt.s;
    if (ds < 0) ds = (cumulativeDist - currPt.s) + nextPt.s;
    if (ds <= 0) ds = 1e-3;

    const vMs = speeds[i];
    const vKmh = vMs * 3.6;
    if (vKmh > maxComputedSpeed) maxComputedSpeed = vKmh;

    // Time to traverse this segment: dt = ds / v
    const segmentTime = ds / Math.max(3.0, vMs); // guard division by zero/idle
    totalLapTime += segmentTime;

    // Lateral G: v^2 / (R * g)
    const latG = (vMs * vMs) / (Math.max(1.0, currPt.radius) * GRAVITY);
    if (latG > maxLateralG) maxLateralG = latG;

    // Acceleration G (longitudinal G)
    const nextV = speeds[i === steps - 1 ? 0 : i + 1];
    const dv = nextV - vMs;
    const accelMs2 = (dv / (segmentTime || 1e-3));
    const lonG = accelMs2 / GRAVITY;

    const isBraking = lonG < -0.2;
    if (isBraking && (i === 0 || telemetryPoints[i - 1]?.isBraking === false)) {
      brakingCount++;
    }

    // Determine Throttle level (0 to 100%)
    let throttle = 0;
    if (lonG > 0) {
      // Accelerating
      throttle = Math.min(100, Math.round(50 + (lonG / 1.5) * 50));
    } else if (lonG >= -0.2) {
      // Cruising/Maintaining speed
      throttle = Math.round(30 + (1.0 - (vMs / maxEngineSpeedMs)) * 40);
    } else {
      // Braking: throttle closed, brake open
      throttle = 0;
    }
    throttleSum += throttle;

    // Find actual deviation of racer's path relative to centerline
    const originalTrackCenter = track.points[i] || { x: currPt.x, y: currPt.y };
    const dx = currPt.x - originalTrackCenter.x;
    const dy = currPt.y - originalTrackCenter.y;
    
    telemetryPoints.push({
      index: i,
      x: currPt.x,
      y: currPt.y,
      s: currPt.s,
      radius: currPt.radius,
      targetSpeed: initialSpeeds[i] * 3.6,
      speed: vKmh,
      accelG: lonG,
      lateralG: latG,
      isBraking,
      throttle,
      offsetX: dx,
      offsetY: dy
    });
  }

  // Compute stats
  const avgSpeed = (cumulativeDist / totalLapTime) * 3.6;
  const throttleRatio = throttleSum / steps;

  // Calculate deviation metrics
  let totalDev = 0;
  for (let i = 0; i < steps; i++) {
    const pt = telemetryPoints[i];
    const originalTrackCenter = track.points[i] || { x: pt.x, y: pt.y };
    const idealOffsetAmount = getIdealRacingLineOffset(track.id, i);
    
    // Ideal racing line coordinate
    const angle = i < steps - 1 
      ? Math.atan2(track.points[i+1].y - originalTrackCenter.y, track.points[i+1].x - originalTrackCenter.x) + Math.PI / 2
      : Math.atan2(originalTrackCenter.y - track.points[i-1].y, originalTrackCenter.x - track.points[i-1].x) + Math.PI / 2;

    const idealX = originalTrackCenter.x + idealOffsetAmount * Math.cos(angle);
    const idealY = originalTrackCenter.y + idealOffsetAmount * Math.sin(angle);

    // Distance to their point
    const dx = pt.x - idealX;
    const dy = pt.y - idealY;
    totalDev += Math.sqrt(dx * dx + dy * dy);
  }
  const averageDeviation = totalDev / steps;

  // Add realistic padding to final lap times depending on track difficulty and driver deviation
  // A perfect F1 simulator lap matches idealLapTime when averageDeviation is near 0.
  // Each pixel of deviation adds minor timing delays (to represent tire slides, bad exits etc)
  const scalarTime = track.idealLapTime * (cumulativeDist / calculateTrackLength(track));
  
  // Adjusted lap time based on actual calculated physics speeds
  // Let's scale totalLapTime to realistic F1 figures for each track:
  const scaleRatio = track.idealLapTime / (totalLapTime * 0.9); 
  const processedLapTime = totalLapTime * (scaleRatio < 0.5 ? 0.8 : scaleRatio) + (averageDeviation * 0.05);

  return {
    lapTime: parseFloat(processedLapTime.toFixed(2)),
    avgSpeed: parseFloat(avgSpeed.toFixed(1)),
    maxSpeed: parseFloat(maxComputedSpeed.toFixed(1)),
    maxG: parseFloat(maxLateralG.toFixed(2)),
    throttleRatio: parseFloat(throttleRatio.toFixed(0)),
    brakingPointsCount: Math.min(10, Math.max(3, brakingCount)),
    averageDeviation: parseFloat(averageDeviation.toFixed(2)),
    idealLapTime: track.idealLapTime,
    points: telemetryPoints
  };
}

// Coordinate based helper to measure actual original track length in pixels then meters
function calculateTrackLength(track: Track): number {
  let length = 0;
  for (let i = 0; i < track.points.length; i++) {
    const p1 = track.points[i];
    const p2 = track.points[i === track.points.length - 1 ? 0 : i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    length += Math.sqrt(dx * dx + dy * dy);
  }
  return length * track.scaleMetersPerPixel;
}

// Triangle-based circle fitting for 3 points to determine radius of curvature
function calculateRadiusOfCurvature(
  A: { x: number; y: number },
  B: { x: number; y: number },
  C: { x: number; y: number },
  metersPerPixel: number
): number {
  const ax = A.x * metersPerPixel;
  const ay = A.y * metersPerPixel;
  const bx = B.x * metersPerPixel;
  const by = B.y * metersPerPixel;
  const cx = C.x * metersPerPixel;
  const cy = C.y * metersPerPixel;

  const a = Math.sqrt((bx - cx) * (bx - cx) + (by - cy) * (by - cy));
  const b = Math.sqrt((ax - cx) * (ax - cx) + (ay - cy) * (ay - cy));
  const c = Math.sqrt((ax - bx) * (ax - bx) + (ay - by) * (by - by));

  // If points are collinear or identical, radius is infinite
  if (a < 1e-2 || b < 1e-2 || c < 1e-2) return 10000;

  // Semi-perimeter
  const s = (a + b + c) / 2;
  // Area using Heron's formula
  const areaSq = s * (s - a) * (s - b) * (s - c);
  if (areaSq <= 0) return 10000;
  const area = Math.sqrt(areaSq);

  // R = (a * b * c) / (4 * Area)
  const R = (a * b * c) / (4 * area);

  // Filter out anomalies or near-straightaways
  if (isNaN(R) || R > 1500) return 10000;
  return R;
}

// Helper to auto-generate the optimal F1 line coordinate array to compare against hand-drawn lines
export function getIdealRacingLinePoints(track: Track): { x: number; y: number }[] {
  const idealPoints: { x: number; y: number }[] = [];
  const steps = track.points.length;

  for (let i = 0; i < steps; i++) {
    const curr = track.points[i];
    const offsetAmount = getIdealRacingLineOffset(track.id, i);

    // Get normal vector
    const next = track.points[i === steps - 1 ? 0 : i + 1];
    const prev = track.points[i === 0 ? steps - 1 : i - 1];

    // DX and DY tangent
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Normal vector direction (right angle to tangent)
    const nx = -dy / (len || 1);
    const ny = dx / (len || 1);

    idealPoints.push({
      x: curr.x + offsetAmount * nx,
      y: curr.y + offsetAmount * ny
    });
  }

  return idealPoints;
}
