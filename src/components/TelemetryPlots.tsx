import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area
} from "recharts";
import { Gauge, Zap, Hammer, ChevronRight, Info, BookOpen } from "lucide-react";
import { simulateLap, getIdealRacingLinePoints, TelemetrySummary } from "../physicsEngine";
import { Track } from "../tracksData";

interface TelemetryPlotsProps {
  summary: TelemetrySummary | null;
  track: Track;
  onHoverIndexChange: (index: number | null) => void;
}

export default function TelemetryPlots({ summary, track, onHoverIndexChange }: TelemetryPlotsProps) {
  const [showMechanicalInfo, setShowMechanicalInfo] = React.useState(false);
  const [showKammInfo, setShowKammInfo] = React.useState(false);

  if (!summary) {
    return (
      <div id="telemetry_empty" className="bg-slate-900 border border-slate-800 rounded-xl p-8 text-center text-slate-500">
        <Gauge className="w-12 h-12 text-slate-700 mx-auto mb-3 animate-pulse" />
        <h3 className="font-bold text-slate-300 font-sans tracking-tight mb-1">Telemetry Diagnostics Offline</h3>
        <p className="text-xs font-mono max-w-sm mx-auto">
          Upload an F1 track photo with drawn racing lines to engage live telemetry plots and friction boundary analytics.
        </p>
      </div>
    );
  }

  // Pre-calculate full ideal/optimal simulation reference for visual overlays
  const idealSummary = React.useMemo(() => {
    try {
      const idealPoints = getIdealRacingLinePoints(track);
      return simulateLap(track, idealPoints);
    } catch (e) {
      console.error("Failed to solve ideal simulation paths for reference:", e);
      return null;
    }
  }, [track]);

  // Map points to recharts compatible format
  const chartData = summary.points.map((pt, index) => {
    const idealPt = idealSummary?.points[index];
    return {
      node: index,
      distance: Math.round(pt.s),
      
      // Plot 1: Speed metrics
      speed: Math.round(pt.speed),
      targetSpeed: Math.round(pt.targetSpeed), // theoretical turn limit
      optimalSpeed: idealPt ? Math.round(idealPt.speed) : Math.round(pt.targetSpeed), // simulated ideal line speed
      
      // Plot 2: G forces
      lateralG: parseFloat(pt.lateralG.toFixed(2)),
      accelG: parseFloat(pt.accelG.toFixed(2)),
      optimalLateralG: idealPt ? parseFloat(Math.abs(idealPt.lateralG).toFixed(2)) : 1.5,
      optimalAccelG: idealPt ? parseFloat(idealPt.accelG.toFixed(2)) : 0.8,
      
      // Plot 3: Controls
      throttle: pt.throttle,
      braking: pt.isBraking ? 100 : 0,
      optimalThrottle: idealPt ? idealPt.throttle : 100,
      optimalBraking: idealPt ? (idealPt.isBraking ? 100 : 0) : 0
    };
  });

  return (
    <div id="telemetry_plots" className="space-y-6">
      
      {/* Dynamic Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
              Final Lap Time
            </span>
            <span className="text-xl md:text-2xl font-bold font-mono tracking-tight text-yellow-400">
              {formatLapTime(summary.lapTime)}
            </span>
          </div>
          <Gauge className="w-8 h-8 text-yellow-400/80 hidden sm:block" />
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
              Average Speed
            </span>
            <span className="text-xl md:text-2xl font-bold font-mono tracking-tight text-emerald-400">
              {summary.avgSpeed} <span className="text-xs font-mono">km/h</span>
            </span>
          </div>
          <Zap className="w-8 h-8 text-emerald-400/80 hidden sm:block" />
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
              Peak Lateral Load
            </span>
            <span className="text-xl md:text-2xl font-bold font-mono tracking-tight text-cyan-400">
              {summary.maxG} <span className="text-xs font-mono">G</span>
            </span>
          </div>
          <Hammer className="w-8 h-8 text-cyan-400/80 hidden sm:block" />
        </div>

        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex items-center justify-between shadow-md">
          <div>
            <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1">
              Full Throttle %
            </span>
            <span className="text-xl md:text-2xl font-bold font-mono tracking-tight text-amber-500">
              {summary.throttleRatio}%
            </span>
          </div>
          <ChevronRight className="w-8 h-8 text-amber-500/80 hidden sm:block" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Plot 1: Velocity Profile vs Optimal */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md text-white flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-start gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold font-sans tracking-tight">Velocity Profile vs Optimal Line</h3>
                    <button
                      onClick={() => setShowMechanicalInfo(prev => !prev)}
                      type="button"
                      className="p-1 rounded hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 transition-colors focus:outline-none cursor-pointer"
                      title="Toggle Mechanical Curve Radius Physics"
                      aria-label="Toggle Mechanical Curve Radius Physics Information"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Compares custom speed (white) to tyre grip thresholds (cyan) & simulated optimal path (green).
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400">
                Plot #1
              </span>
            </div>
            
            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart 
                  data={chartData} 
                  margin={{ top: 5, right: 10, left: -22, bottom: 5 }}
                  onMouseMove={(state) => {
                    if (state && typeof state.activeTooltipIndex === "number") {
                      onHoverIndexChange(state.activeTooltipIndex);
                    } else {
                      onHoverIndexChange(null);
                    }
                  }}
                  onMouseLeave={() => {
                    onHoverIndexChange(null);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="distance" stroke="#64748b" fontSize={10} unit="m" />
                  <YAxis stroke="#64748b" fontSize={10} unit=" km" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                    labelClassName="text-slate-400 text-xs font-mono"
                    itemStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                  />
                  <Legend iconType="circle" style={{ fontSize: "10px" }} />
                  <Line
                    name="Your Speed"
                    type="monotone"
                    dataKey="speed"
                    stroke="#ffffff"
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 5 }}
                  />
                  <Line
                    name="Optimal Performance"
                    type="monotone"
                    dataKey="optimalSpeed"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={false}
                  />
                  <Line
                    name="Static Grip Speed Limit"
                    type="monotone"
                    dataKey="targetSpeed"
                    stroke="#22d3ee"
                    strokeWidth={1}
                    strokeDasharray="4 4"
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Real Physics Footnote Explanation */}
          {showMechanicalInfo && (
            <div className="mt-4 bg-slate-950/90 rounded-lg p-4 border border-cyan-500/20 text-xs text-slate-300 animate-fadeIn">
              <div className="flex items-start gap-3">
                <Info className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-3 w-full">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="font-bold text-slate-100 font-sans text-xs">Mechanical Curve Radius Physics</span>
                    <span className="text-[9px] font-mono text-cyan-400 bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-900/50">Aerodynamic Load Limits</span>
                  </div>
                  
                  {/* Clean rendered math formula */}
                  <div className="my-2 select-all font-mono text-xs md:text-sm text-emerald-400 bg-slate-950 border border-slate-800/80 px-3 py-2 rounded flex items-center justify-center gap-2 overflow-x-auto shadow-inner">
                    <span className="text-slate-400">v<sub>limit</sub></span>
                    <span>=</span>
                    <span className="text-emerald-400">√[ μ · g · R · ( 1 + (C<sub>L</sub> · ρ · A · v<sup>2</sup>) / (2 · m · g) ) ]</span>
                  </div>

                  <div className="text-[10px] leading-relaxed text-slate-400 space-y-1 bg-slate-900/40 p-2.5 rounded border border-slate-850">
                    <span className="text-[11px] font-semibold text-slate-300 block mb-1">Variable Legend:</span>
                    <div>• <span className="text-cyan-400 font-semibold">μ:</span> Coefficient of tyre static friction (~1.5 for basic race tyres, up to ~4.5 with dynamic loading and optimal temperature cycle)</div>
                    <div>• <span className="text-cyan-400 font-semibold">g:</span> Gravitational acceleration (~9.81 m/s²)</div>
                    <div>• <span className="text-cyan-400 font-semibold">R:</span> Radius of geometric curvature (m), derived from three-point horizontal spline nodes</div>
                    <div>• <span className="text-cyan-400 font-semibold">C<sub>L</sub>:</span> Aerodynamic Downforce Coefficient</div>
                    <div>• <span className="text-cyan-400 font-semibold">ρ:</span> Density of Ambient Air (~1.225 kg/m³ at sea level)</div>
                    <div>• <span className="text-cyan-400 font-semibold">A:</span> Effective Frontal Cross-Sectional Area of the F1 chassis (m²)</div>
                    <div>• <span className="text-cyan-400 font-semibold">m:</span> Complete Minimum Mass of car & driver (~798 kg regulation limit)</div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-400">
                    <b>How this profile is generated:</b> F1 velocity limits combine tyre coefficient of friction <span className="text-slate-200">μ</span>, gravitational acceleration (<span className="text-slate-200">g = 9.81m/s²</span>), and transient geometric corner radius <span className="text-slate-200">R</span>. Aerodynamic downforce adds dynamic load proportional to velocity squared (<span className="text-slate-200">v²</span>). The <span className="text-emerald-400 font-bold">Optimal Performance Line</span> traces the path of minimum curvature (maximum entry speeds) using idealized out-in-out trajectories.
                  </p>

                  {/* Formal academic sources citations */}
                  <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                    <span className="font-bold text-slate-350 block mb-1">Authoritative Reference Citations:</span>
                    <ul className="list-disc pl-4 space-y-1 font-mono">
                      <li>Milliken, W. F., & Milliken, D. L. (1995). <i>Race Car Vehicle Dynamics</i>. SAE International. Sections 1.2 & 14.1 (Steady-State Cornering & Grip Modeling).</li>
                      <li>McBeath, S. (2017). <i>Competition Car Aerodynamics</i> (3rd ed.). Veloce Publishing. (Scaling of lift coefficient C<sub>L</sub> and vertical tyre loading).</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Plot 2: Active Handling Forces */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md text-white flex flex-col justify-between">
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-start gap-2">
                <div>
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-bold font-sans tracking-tight">Active Handling Forces (Traction Circle)</h3>
                    <button
                      onClick={() => setShowKammInfo(prev => !prev)}
                      type="button"
                      className="p-1 rounded hover:bg-slate-800 text-purple-400 hover:text-purple-300 transition-colors focus:outline-none cursor-pointer"
                      title="Toggle Kamm's Friction Circle Theory"
                      aria-label="Toggle Kamm's Friction Circle Theory Information"
                    >
                      <Info className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Visualizes actual cornering Loads (cyan) and motor acceleration/brakes (purple) vs ideal G load limits (green).
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-mono uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-800 text-slate-400">
                Plot #2
              </span>
            </div>

            <div className="h-[250px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart 
                  data={chartData} 
                  margin={{ top: 5, right: 10, left: -22, bottom: 5 }}
                  onMouseMove={(state) => {
                    if (state && typeof state.activeTooltipIndex === "number") {
                      onHoverIndexChange(state.activeTooltipIndex);
                    } else {
                      onHoverIndexChange(null);
                    }
                  }}
                  onMouseLeave={() => {
                    onHoverIndexChange(null);
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="distance" stroke="#64748b" fontSize={10} unit="m" />
                  <YAxis stroke="#64748b" fontSize={10} unit="G" />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                    labelClassName="text-slate-400 text-xs font-mono"
                    itemStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                  />
                  <Legend iconType="circle" style={{ fontSize: "10px" }} />
                  <Area
                    name="Your Lateral Gs"
                    type="monotone"
                    dataKey="lateralG"
                    stroke="#06b6d4"
                    fill="rgba(6, 182, 212, 0.15)"
                    dot={false}
                  />
                  <Area
                    name="Your Longitudinal Gs"
                    type="monotone"
                    dataKey="accelG"
                    stroke="#a855f7"
                    fill="rgba(168, 85, 247, 0.05)"
                    dot={false}
                  />
                  <Line
                    name="Optimal Load (G Limits)"
                    type="monotone"
                    dataKey="optimalLateralG"
                    stroke="#10b981"
                    strokeWidth={2}
                    dot={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Real Physics Footnote Explanation */}
          {showKammInfo && (
            <div className="mt-4 bg-slate-950/90 rounded-lg p-4 border border-purple-500/20 text-xs text-slate-300 animate-fadeIn">
              <div className="flex items-start gap-3">
                <BookOpen className="w-5 h-5 text-purple-400 shrink-0 mt-0.5 animate-pulse" />
                <div className="space-y-3 w-full">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
                    <span className="font-bold text-slate-100 font-sans text-xs">Kamm's Friction Circle Vector Theory</span>
                    <span className="text-[9px] font-mono text-purple-400 bg-purple-950/40 px-1.5 py-0.5 rounded border border-purple-900/50">Unified Slip Vector</span>
                  </div>

                  {/* Clean rendered math formula */}
                  <div className="my-2 select-all font-mono text-xs md:text-sm text-emerald-400 bg-slate-950 border border-slate-800/80 px-3 py-2 rounded flex items-center justify-center gap-2 overflow-x-auto shadow-inner">
                    <span className="text-slate-400">a<sub>total</sub></span>
                    <span>=</span>
                    <span className="text-emerald-400">√[ a<sub>lateral</sub><sup>2</sup> + a<sub>longitudinal</sub><sup>2</sup> ] &le; μ<sub>max</sub> · g</span>
                  </div>

                  <div className="text-[10px] leading-relaxed text-slate-400 space-y-1 bg-slate-900/40 p-2.5 rounded border border-slate-850">
                    <span className="text-[11px] font-semibold text-slate-300 block mb-1">Unified Concept breakdown:</span>
                    <div>• <span className="text-purple-400 font-semibold">a<sub>lateral</sub>:</span> Transversal cornering loading (<span className="font-mono">v<sup>2</sup> / R</span>), taxing lateral footprint margins.</div>
                    <div>• <span className="text-purple-400 font-semibold">a<sub>longitudinal</sub>:</span> Straight-line accelerating / decelerating traction loads (<span className="font-mono">dv / dt</span>).</div>
                    <div>• <span className="text-purple-400 font-semibold">μ<sub>max</sub>:</span> Peak dynamic adhesion boundary under combined friction vector loads.</div>
                  </div>

                  <p className="text-[11px] leading-relaxed text-slate-400">
                    <b>Traction Circle Physics:</b> F1 tyres have a strict mathematical maximum grip capability. Steering cornering loads produce lateral force (<span className="text-slate-200 font-mono">a<sub>lat</sub> = v<sup>2</sup>/R</span>), while engine thrust and braking generate longitudinal forces (<span className="text-slate-200 font-mono">a<sub>lon</sub> = dv/dt</span>). The unified vector sum must remain within Kummer-Kamm friction limits. The <span className="text-emerald-400 font-bold">Optimal Performance G-Line</span> models how a perfect racing line maximizes lateral cornering force at apexes, then pivots to full forward traction. F1 drivers use <i>trail-braking</i> to progressively ease off brakes as they steer into the apex, tracing the outer edge of the friction circle vector.
                  </p>

                  {/* Formal academic sources citations */}
                  <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400">
                    <span className="font-bold text-slate-350 block mb-1">Authoritative Reference Citations:</span>
                    <ul className="list-disc pl-4 space-y-1 font-mono">
                      <li>Kamm, W. (1936). <i>Das Kraftfahrzeug in der Verkehrstechnik</i>. VDI-Verlag. (Original formulation of tire shear stress limits under combined braking-turning loads).</li>
                      <li>Smith, C. (1978). <i>Tune to Win</i>. Aero Publishers. Chapter 3: Tires - The Contact Patch and Combined Slip dynamics.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Plot 3: Pedal Controls telemetry */}
        <div className="bg-slate-900 border border-slate-800 p-5 rounded-xl shadow-md text-white lg:col-span-2">
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold font-sans tracking-tight">Telemetry Pedal Inputs & Brake Activations</h3>
              <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                Observe the throttle pedal application (orange) and brake pressure blocks (red) mapped synchronously against perfect benchmarks.
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] font-mono">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span> Your Throttle</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-600 rounded-full"></span> Your Brakes</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full"></span> Optimal Control Line</span>
            </div>
          </div>

          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart 
                data={chartData} 
                margin={{ top: 5, right: 10, left: -22, bottom: 5 }}
                onMouseMove={(state) => {
                  if (state && typeof state.activeTooltipIndex === "number") {
                    onHoverIndexChange(state.activeTooltipIndex);
                  } else {
                    onHoverIndexChange(null);
                  }
                }}
                onMouseLeave={() => {
                  onHoverIndexChange(null);
                }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="distance" stroke="#64748b" fontSize={10} unit="m" />
                <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  labelClassName="text-slate-400 text-xs font-mono"
                  itemStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                />
                <Legend iconType="circle" style={{ fontSize: "10px" }} />
                <Area
                  name="Your Throttle Tool %"
                  type="monotone"
                  dataKey="throttle"
                  stroke="#f97316"
                  fill="rgba(249, 115, 22, 0.12)"
                  dot={false}
                />
                <Area
                  name="Your Brake Tool %"
                  type="step"
                  dataKey="braking"
                  stroke="#ef4444"
                  fill="rgba(239, 68, 68, 0.12)"
                  dot={false}
                />
                <Line
                  name="Optimal Performance Throttle"
                  type="monotone"
                  dataKey="optimalThrottle"
                  stroke="#10b981"
                  strokeWidth={2}
                  dot={false}
                />
                <Line
                  name="Optimal Performance Brake"
                  type="step"
                  dataKey="optimalBraking"
                  stroke="#10b981"
                  strokeDasharray="4 4"
                  strokeWidth={1.5}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Real Physics Footnote Explanation */}
          <div className="mt-5 bg-slate-950/80 rounded-lg p-3.5 border border-slate-850 text-xs text-slate-300">
            <div className="flex items-start gap-2.5">
              <Zap className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-100 font-sans">Newtonian Deceleration & Trail Braking</span>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-950/30 px-1.5 py-0.2 rounded border border-amber-900/50">Dynamics</span>
                </div>
                <div className="my-2 select-all font-mono text-[11px] text-emerald-400 bg-slate-900/95 border border-slate-800 px-2 py-1 rounded w-fit">
                  F_net = F_engine - F_drag - F_brake * θ_pressure
                </div>
                <p className="text-[11px] leading-relaxed text-slate-400">
                  <b>How this profile is generated:</b> F1 drivers apply longitudinal control pressure iteratively. On straights, aerodynamic resistance increases exponentially with speed (F_drag = 0.5 * Cd * rho * A * v²). When approaching a turn, drivers apply maximum hydraulic pressure (100% brake engagement) during initial straight-line braking, then "trail brake" — gradually bleeding off brake pressure to 0% as they increase the steering lock to apex. The <span className="text-emerald-400 font-bold">Optimal Performance Controls</span> line illustrates this perfect synchronized control handover.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

function formatLapTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  const prefix = mins > 0 ? `${mins}:` : "";
  const formattedSecs = mins > 0 && parseFloat(secs) < 10 ? `0${secs}` : secs;
  return `${prefix}${formattedSecs}s`;
}
