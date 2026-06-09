import React from "react";
import { Track } from "../tracksData";
import { TelemetrySummary, getIdealRacingLinePoints } from "../physicsEngine";

interface RacetrackMinimapProps {
  track: Track;
  summary?: TelemetrySummary | null;
  hoveredIndex?: number | null;
  className?: string;
}

export default function RacetrackMinimap({
  track,
  summary,
  hoveredIndex,
  className = ""
}: RacetrackMinimapProps) {
  // Center string of the track guidelines (filtering out NaNs)
  const validTrackPoints = (track?.points || []).filter(
    (p) => p && typeof p.x === "number" && !isNaN(p.x) && typeof p.y === "number" && !isNaN(p.y)
  );

  const trackPathString = validTrackPoints.length > 0
    ? validTrackPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z"
    : "";

  // Dynamic ideal/benchmark path reference points for visual overlay
  const idealPoints = React.useMemo(() => {
    try {
      return getIdealRacingLinePoints(track) || [];
    } catch {
      return [];
    }
  }, [track]);

  const validIdealPoints = idealPoints.filter(
    (p) => p && typeof p.x === "number" && !isNaN(p.x) && typeof p.y === "number" && !isNaN(p.y)
  );

  const idealPathString = validIdealPoints.length > 0
    ? validIdealPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z"
    : "";

  // Scanned user racing line strings from TelemetrySummary points if available
  const validUserPoints = (summary?.points || []).filter(
    (p) => p && typeof p.x === "number" && !isNaN(p.x) && typeof p.y === "number" && !isNaN(p.y)
  );

  const userPathString = validUserPoints.length > 0
    ? validUserPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ") + " Z"
    : "";

  // Find hovered coordinate
  const hoveredPoint = hoveredIndex !== null && hoveredIndex !== undefined && validUserPoints[hoveredIndex]
    ? validUserPoints[hoveredIndex]
    : null;

  // Dynamically compute bounding box for optimal zoom and centering so it never appears empty or out-of-bounds
  const bounds = React.useMemo(() => {
    if (validTrackPoints.length === 0) {
      return { x: 0, y: 0, width: 500, height: 500 };
    }
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    validTrackPoints.forEach((pt) => {
      if (pt.x < minX) minX = pt.x;
      if (pt.y < minY) minY = pt.y;
      if (pt.x > maxX) maxX = pt.x;
      if (pt.y > maxY) maxY = pt.y;
    });

    const padding = 35;
    minX -= padding;
    minY -= padding;
    maxX += padding;
    maxY += padding;

    const w = maxX - minX;
    const h = maxY - minY;
    const size = Math.max(w, h, 100);
    const cx = minX + w / 2;
    const cy = minY + h / 2;

    return {
      x: cx - size / 2,
      y: cy - size / 2,
      width: size,
      height: size
    };
  }, [validTrackPoints]);

  return (
    <div className={`relative w-full h-full min-h-[260px] bg-slate-950/40 border border-slate-800/60 rounded-xl overflow-hidden shadow-2xl p-4 flex flex-col items-center justify-center ${className}`}>
      {/* Dynamic Background HUD telemetry grids to feel incredibly technical and polished */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b12_1px,transparent_1px),linear-gradient(to_bottom,#1e293b12_1px,transparent_1px)] bg-[size:16px_16px] pointer-events-none" />
      <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-80 pointer-events-none">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span className="text-[8px] font-mono text-cyan-400 tracking-wider">TELEM LINKED</span>
      </div>

      {/* Title & Stats */}
      <div className="absolute top-3 left-3 flex flex-col gap-0.5 z-10 pointer-events-none">
        <span className="text-[9px] font-mono font-bold text-slate-400 uppercase tracking-widest leading-none">ANALYSIS RENDERING</span>
        <span className="text-xs font-black text-rose-500 font-sans uppercase tracking-tight">{track.name}</span>
      </div>

      <div className="absolute bottom-3 left-3 flex items-center gap-1 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded text-[8px] font-mono font-bold text-rose-400 z-10 pointer-events-none uppercase">
        <span className="w-1 h-1 rounded-full bg-rose-500 animate-pulse" />
        Apex Sensors Live
      </div>

      {/* SVG Map Container: Scaled beautifully to fill container bounds */}
      <div className="w-full flex items-center justify-center flex-1 my-3 relative min-h-[190px]">
        <svg
          viewBox={`${bounds.x.toFixed(1)} ${bounds.y.toFixed(1)} ${bounds.width.toFixed(1)} ${bounds.height.toFixed(1)}`}
          className="w-full h-full max-w-[210px] max-h-[210px] filter drop-shadow-[0_0_12px_rgba(6,182,212,0.1)]"
        >
          {/* Racetrack Outlines Background (Now highly visible light grey/slate-700 asphalt track bed) */}
          {trackPathString && (
            <>
              {/* Thick soft-glow backing of the circuit path */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#475569"
                strokeWidth="28"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.3"
              />

              {/* Outside Kerbs/Limits (Vibrant Medium Slate Outer Ring) */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#334155"
                strokeWidth="22"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Asphalt Core Track surface (High visibility grey so it is clearly distinct) */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#1e293b"
                strokeWidth="16"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* High Contrast White Borders outlining track boundaries */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#64748b"
                strokeWidth="17"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.45"
              />
              <path
                d={trackPathString}
                fill="none"
                stroke="#0f172a"
                strokeWidth="15"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* White Center Dashed Lane Marker */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="1"
                strokeDasharray="4 4"
                opacity="0.55"
              />
            </>
          )}

          {/* Start/Finish physical line indicator */}
          {(() => {
            if (validTrackPoints.length < 2) return null;
            const p1 = validTrackPoints[0];
            const p2 = validTrackPoints[1];
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const nx = -dy / (len || 1);
            const ny = dx / (len || 1);
            // Dynamic check: draw line transverse to track
            const startX1 = p1.x - 12 * nx;
            const startY1 = p1.y - 12 * ny;
            const startX2 = p1.x + 12 * nx;
            const startY2 = p1.y + 12 * ny;
            return (
              <g>
                <line x1={startX1} y1={startY1} x2={startX2} y2={startY2} stroke="#ffffff" strokeWidth="3" />
                <line x1={startX1} y1={startY1} x2={startX2} y2={startY2} stroke="#f43f5e" strokeWidth="3" strokeDasharray="2 2" />
              </g>
            );
          })()}

          {/* IDEAL/BENCHMARK OPTIMAL REFERENCE PATH (Fluorescent Emerald Green Path) */}
          {idealPathString && (
            <g>
              <path
                d={idealPathString}
                fill="none"
                stroke="#10b981"
                strokeWidth="6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.25"
                className="blur-sm"
              />
              <path
                d={idealPathString}
                fill="none"
                stroke="#10b981"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="3 3.5"
                opacity="0.85"
              />
            </g>
          )}

          {/* DRAW THE TAKEN USER DRIVING LINE (Glowing neon cyan path) */}
          {userPathString && (
            <g>
              <path
                d={userPathString}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="8"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.35"
                className="blur-sm"
              />
              <path
                d={userPathString}
                fill="none"
                stroke="#06b6d4"
                strokeWidth="2.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d={userPathString}
                fill="none"
                stroke="#ffffff"
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.95"
              />
            </g>
          )}

          {/* Hovered telemetry coordinate highlighting (Pulsing bright red target indicator) */}
          {hoveredPoint && (
            <g>
              {/* Outmost soft glowing red ring */}
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="15"
                fill="rgba(239, 68, 68, 0.18)"
                stroke="#ef4444"
                strokeWidth="1"
                opacity="0.9"
              />
              {/* Pulsing red ring for dynamic target indication */}
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="10"
                fill="none"
                stroke="#ef4444"
                strokeWidth="2.5"
                className="animate-pulse"
              />
              {/* Bright core red dot with crisp white border */}
              <circle
                cx={hoveredPoint.x}
                cy={hoveredPoint.y}
                r="5"
                fill="#ef4444"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}
        </svg>
      </div>

      {/* Speed & Acceleration Info overlay footer */}
      {summary && (
        <div className="w-full mt-auto pt-2.5 border-t border-slate-900 flex justify-between items-center text-[10px] font-mono bg-slate-950/40 px-3 py-1.5 rounded-lg">
          <div className="text-slate-400">
            LAP: <span className="text-white font-bold">{summary.lapTime.toFixed(2)}s</span>
          </div>
          <div className="text-slate-400">
            MAX-G: <span className="text-rose-500 font-bold">{summary.maxG.toFixed(2)}G</span>
          </div>
          <div className="text-slate-400">
            AVG: <span className="text-cyan-400 font-bold">{summary.avgSpeed.toFixed(0)} km/h</span>
          </div>
        </div>
      )}
    </div>
  );
}
