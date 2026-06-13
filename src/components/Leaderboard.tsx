import React from "react";
import { Award, Timer, Activity, Zap } from "lucide-react";
import { TRACKS } from "../tracksData";

interface LeaderboardEntry {
  id: string;
  name: string;
  track: string;
  lapTime: number;
  avgSpeed: number;
  maxG: number;
  date: string;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  currentTrackId: string;
}

export default function Leaderboard({ entries, currentTrackId }: LeaderboardProps) {
  // Filter and sort entries for the active track
  const filteredEntries = entries
    .filter((e) => e.track === currentTrackId)
    .sort((a, b) => a.lapTime - b.lapTime);
  const activeTrack = TRACKS[currentTrackId];
  const bestLap = filteredEntries[0] || null;

  return (
    <div id="leaderboard_comp" className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl text-white h-full">
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <Award className="w-5 h-5 text-yellow-500" />
            <h2 className="text-lg font-bold font-sans tracking-tight">Circuit Leaderboard</h2>
          </div>
          <p className="mt-2 text-sm text-slate-300 leading-relaxed">
            {activeTrack?.name || currentTrackId} lap times ranked from fastest to slowest.
          </p>
        </div>
        <span className="text-[10px] font-mono text-cyan-300 bg-cyan-500/10 border border-cyan-500/20 px-3 py-1 rounded-full uppercase tracking-[0.2em] shrink-0">
          Silverstone
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Entries</span>
          <span className="mt-1 block text-xl font-black tracking-tight text-white">{filteredEntries.length}</span>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">P1 Lap</span>
          <span className="mt-1 block text-xl font-black tracking-tight text-white">{bestLap ? formatTime(bestLap.lapTime) : "--"}</span>
        </div>
      </div>

      {filteredEntries.length === 0 ? (
        <div className="text-center py-10 text-slate-500 border border-dashed border-slate-800 rounded-xl bg-slate-950/50">
          <p className="font-mono text-sm">No recorded telemetry. Be the first to establish a Silverstone lap record.</p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
          {filteredEntries.map((entry, index) => {
            const isPodium = index < 3;
            const podiumColors = [
              "bg-gradient-to-r from-yellow-500/20 to-yellow-600/5 border-yellow-500/40 text-yellow-200",
              "bg-gradient-to-r from-slate-300/10 to-slate-400/5 border-slate-300/30 text-slate-200",
              "bg-gradient-to-r from-amber-700/15 to-amber-800/5 border-amber-700/30 text-amber-200"
            ];
            
            return (
              <div
                id={`leaderboard_entry_${entry.id}`}
                key={entry.id}
                className={`flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-3 rounded-xl border text-sm transition-all duration-300 ${
                  isPodium
                    ? podiumColors[index]
                    : "bg-slate-950/60 border-slate-800/60 text-slate-300 hover:border-slate-700"
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center font-mono text-xs font-bold ${
                    isPodium 
                      ? index === 0 ? "bg-yellow-500 text-slate-950" : index === 1 ? "bg-slate-300 text-slate-900" : "bg-amber-700 text-amber-50" 
                      : "bg-slate-800 text-slate-400"
                  }`}>
                    {index + 1}
                  </span>
                  <div>
                    <span className="font-bold block tracking-wide font-sans">{entry.name}</span>
                    <span className="text-[10px] text-slate-400 block font-mono">{entry.date}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 sm:flex sm:items-center sm:gap-5">
                  {/* Lap Time */}
                  <div className="flex items-center gap-1.5 min-w-[90px]">
                    <Timer className="w-4 h-4 text-slate-400" />
                    <span className="font-mono font-bold text-base leading-none">
                      {formatTime(entry.lapTime)}
                    </span>
                  </div>

                  {/* Avg Speed */}
                  <div className="flex items-center gap-1 min-w-[75px] text-right justify-end text-xs text-slate-400 font-mono">
                    <Activity className="w-3.5 h-3.5 text-emerald-500/80" />
                    <span>{entry.avgSpeed} <span className="text-[10px]">km/h</span></span>
                  </div>

                  {/* Max G */}
                  <div className="flex items-center gap-1 min-w-[55px] text-right justify-end text-xs text-slate-400 font-mono">
                    <Zap className="w-3.5 h-3.5 text-cyan-500/80" />
                    <span>{entry.maxG} <span className="text-[10px]">G</span></span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(2);
  const prefix = mins > 0 ? `${mins}:` : "";
  const formattedSecs = mins > 0 && parseFloat(secs) < 10 ? `0${secs}` : secs;
  return `${prefix}${formattedSecs}s`;
}
