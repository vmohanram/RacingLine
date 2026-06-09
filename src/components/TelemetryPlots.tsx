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
import { Gauge, Zap, Hammer, ChevronRight } from "lucide-react";
import { TelemetrySummary } from "../physicsEngine";

interface TelemetryPlotsProps {
  summary: TelemetrySummary | null;
}

export default function TelemetryPlots({ summary }: TelemetryPlotsProps) {
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

  // Map points to recharts compatible format
  const chartData = summary.points.map((pt, index) => {
    return {
      node: index,
      distance: Math.round(pt.s),
      speed: Math.round(pt.speed),
      targetSpeed: Math.round(pt.targetSpeed),
      lateralG: parseFloat(pt.lateralG.toFixed(2)),
      accelG: parseFloat(pt.accelG.toFixed(2)),
      throttle: pt.throttle,
      braking: pt.isBraking ? 100 : 0
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
              {summary.avgSpeed} <span className="text-xs">km/h</span>
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
              {summary.maxG} <span className="text-xs">G</span>
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
        {/* Plot 1: Velocity Comparison */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md text-white">
          <div className="mb-4">
            <h3 className="text-sm font-bold font-sans tracking-tight">Velocity Profile vs Optimal Curve Limit</h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Compares actual speed (white) to tyre grip dynamic limits (green) along the track distance.
            </p>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
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
                  name="User Speed (Simulated)"
                  type="monotone"
                  dataKey="speed"
                  stroke="#ffffff"
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4 }}
                />
                <Line
                  name="Maximum Tyre Grip Speed"
                  type="monotone"
                  dataKey="targetSpeed"
                  stroke="#10b981"
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plot 2: Longitudinal & Lateral Forces */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md text-white">
          <div className="mb-4">
            <h3 className="text-sm font-bold font-sans tracking-tight">Active Handling Forces (Traction Circle)</h3>
            <p className="text-[11px] text-slate-400 font-mono">
              Visualise lateral acceleration loads (blue) alongside engine longitudinal thrust/decel (purple).
            </p>
          </div>
          <div className="h-[250px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
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
                  name="Lateral forces (Cornering)"
                  type="monotone"
                  dataKey="lateralG"
                  stroke="#06b6d4"
                  fill="rgba(6, 182, 212, 0.1)"
                  dot={false}
                />
                <Area
                  name="Longitudinal G (Accel/Brake)"
                  type="monotone"
                  dataKey="accelG"
                  stroke="#a855f7"
                  fill="rgba(168, 85, 247, 0.05)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Plot 3: Pedal Controls telemetry */}
        <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-md text-white lg:col-span-2">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold font-sans tracking-tight">Telemetry Pedal Inputs & Brake Activations</h3>
              <p className="text-[11px] text-slate-400 font-mono">
                Observe the simulated throttle pedal application (orange) and brake pressure blocks (red) along the lap.
              </p>
            </div>
            <div className="flex gap-4 text-xs font-mono">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-amber-500 rounded-full"></span> Throttle</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 bg-rose-650 bg-rose-600 rounded-full"></span> Braking Zone</span>
            </div>
          </div>
          <div className="h-[180px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="distance" stroke="#64748b" fontSize={10} unit="m" />
                <YAxis stroke="#64748b" fontSize={10} domain={[0, 100]} unit="%" />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0f172a", borderColor: "#1e293b", borderRadius: "8px" }}
                  labelClassName="text-slate-400 text-xs font-mono"
                  itemStyle={{ fontSize: "11px", fontFamily: "monospace" }}
                />
                <Area
                  name="Throttle Input"
                  type="monotone"
                  dataKey="throttle"
                  stroke="#f97316"
                  fill="rgba(249, 115, 22, 0.15)"
                  dot={false}
                />
                <Area
                  name="Brake Engagement"
                  type="step"
                  dataKey="braking"
                  stroke="#ef4444"
                  fill="rgba(239, 68, 68, 0.15)"
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
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
