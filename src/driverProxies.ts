import { TelemetrySummary } from "./physicsEngine";

export interface DriverProxyMetric {
  label: string;
  value: string;
  detail: string;
  tone: "neutral" | "good" | "warn";
  rawScore: number;
}

export interface DriverProxyPoint {
  index: number;
  distanceMeters: number;
  understeerRisk: number;
  oversteerRisk: number;
  trailBrakingLoad: number;
  downforceConfidence: number;
  dragEfficiency: number;
  corneringLoad: number;
}

export interface DriverProxyAnalysis {
  metrics: DriverProxyMetric[];
  points: DriverProxyPoint[];
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value: number) {
  return `${Math.round(clamp(value, 0, 100))}%`;
}

function formatTendency(value: number) {
  if (value < 30) return "Low";
  if (value < 60) return "Medium";
  return "High";
}

export function buildDriverProxyAnalysis(summary: TelemetrySummary): DriverProxyAnalysis {
  const points = summary.points;
  if (!points.length) {
    return { metrics: [], points: [] };
  }

  const deviationMagnitude = (index: number) => {
    const point = points[index];
    return Math.hypot(point.offsetX, point.offsetY);
  };

  const proxyPoints = points.map((point) => {
    const previousIndex = point.index === 0 ? points.length - 1 : point.index - 1;
    const nextIndex = point.index === points.length - 1 ? 0 : point.index + 1;
    const speedExcess = Math.max(0, point.speed - point.targetSpeed) / Math.max(1, point.targetSpeed);
    const deviation = deviationMagnitude(point.index);
    const oscillation = Math.abs(deviationMagnitude(nextIndex) - deviationMagnitude(previousIndex));

    const isCorner = point.radius < 220 && point.lateralG > 0.55;
    const isPoweredExit = !point.isBraking && point.throttle > 55 && point.lateralG > 0.45;
    const isFastCorner = point.radius >= 140 && point.radius < 520 && point.speed > 160;
    const isStraight = point.radius > 700 || point.lateralG < 0.18;

    const understeerRisk = isCorner
      ? clamp(speedExcess * 180 + (deviation / 6) * 8, 0, 100)
      : 0;

    const oversteerRisk = isPoweredExit
      ? clamp(oscillation * 8 + Math.max(0, point.throttle - 55) * 0.45 + Math.max(0, point.accelG) * 18, 0, 100)
      : 0;

    const trailBrakingLoad = point.isBraking
      ? clamp((point.lateralG / 1.4) * 100, 0, 100)
      : 0;

    const downforceConfidence = isFastCorner
      ? clamp((point.speed / Math.max(1, point.targetSpeed)) * 100, 0, 100)
      : 0;

    const dragEfficiency = isStraight
      ? clamp((point.speed / Math.max(1, point.targetSpeed)) * 100, 0, 100)
      : 0;

    const corneringLoad = clamp((point.lateralG / 6) * 100, 0, 100);

    return {
      index: point.index,
      distanceMeters: point.s,
      understeerRisk,
      oversteerRisk,
      trailBrakingLoad,
      downforceConfidence,
      dragEfficiency,
      corneringLoad
    };
  });

  const brakingSampleCount = points.filter((point) => point.isBraking).length;
  const trailBrakingSampleCount = proxyPoints.filter((point) => point.trailBrakingLoad > 0).length;

  const understeerScore = average(proxyPoints.map((point) => point.understeerRisk));
  const oversteerScore = average(proxyPoints.map((point) => point.oversteerRisk));
  const downforceScore = average(
    proxyPoints.filter((point) => point.downforceConfidence > 0).map((point) => point.downforceConfidence)
  );
  const dragScore = average(
    proxyPoints.filter((point) => point.dragEfficiency > 0).map((point) => point.dragEfficiency)
  );
  const trailBrakingScore = clamp(
    (trailBrakingSampleCount / Math.max(1, brakingSampleCount)) * 100,
    0,
    100
  );
  const corneringLoadScore = clamp((summary.maxG / 6) * 100, 0, 100);

  const metrics: DriverProxyMetric[] = [
    {
      label: "Understeer Tendency",
      value: formatTendency(understeerScore),
      detail: `Front-end push proxy from corner overspeed and missed apex distance (${formatPercent(understeerScore)}).`,
      tone: understeerScore < 35 ? "good" : understeerScore < 60 ? "neutral" : "warn",
      rawScore: understeerScore
    },
    {
      label: "Oversteer Tendency",
      value: formatTendency(oversteerScore),
      detail: `Rear-instability proxy from throttle-on exits and line oscillation (${formatPercent(oversteerScore)}).`,
      tone: oversteerScore < 35 ? "good" : oversteerScore < 60 ? "neutral" : "warn",
      rawScore: oversteerScore
    },
    {
      label: "Trail Braking Index",
      value: formatPercent(trailBrakingScore),
      detail: "Share of braking samples that still carry meaningful lateral load into turn-in.",
      tone: trailBrakingScore > 55 ? "good" : trailBrakingScore > 30 ? "neutral" : "warn",
      rawScore: trailBrakingScore
    },
    {
      label: "Downforce Confidence",
      value: formatPercent(downforceScore),
      detail: "How close the line stays to the modelled high-speed corner limit.",
      tone: downforceScore > 92 ? "good" : downforceScore > 82 ? "neutral" : "warn",
      rawScore: downforceScore
    },
    {
      label: "Drag Efficiency",
      value: formatPercent(dragScore),
      detail: "Straight-line speed realization relative to the modelled top-speed envelope.",
      tone: dragScore > 88 ? "good" : dragScore > 78 ? "neutral" : "warn",
      rawScore: dragScore
    },
    {
      label: "Cornering Load",
      value: `${summary.maxG.toFixed(2)}G`,
      detail: `Peak lateral loading reached during the lap (${formatPercent(corneringLoadScore)} of a 6G reference).`,
      tone: corneringLoadScore > 72 ? "good" : corneringLoadScore > 58 ? "neutral" : "warn",
      rawScore: corneringLoadScore
    }
  ];

  return {
    metrics,
    points: proxyPoints
  };
}