import React from "react";
import { Gauge, Flag, RotateCcw } from "lucide-react";
import { Track, TRACKS } from "../tracksData";

interface TrackSelectorProps {
  activeTrackId: string;
  onTrackChange: (trackId: string) => void;
}

export default function TrackSelector({ activeTrackId, onTrackChange }: TrackSelectorProps) {
  return (
    <div id="track_selector_comp" className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-white">
      <div className="flex items-center gap-3 mb-4">
        <Flag className="w-5 h-5 text-rose-500 animate-bounce" />
        <h3 className="font-sans font-bold text-base tracking-tight">Active Grand Prix Circuit</h3>
      </div>
      
      <p className="text-xs text-slate-400 mb-4 font-sans leading-relaxed">
        Select a Formula 1 circuit template. Each circuit features unique radii profiles, straight lengths, and aerodynamic layouts.
      </p>

      <div className="space-y-3">
        {Object.values(TRACKS).map((track) => {
          const isActive = track.id === activeTrackId;
          const difficultyColors = {
            Easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
            Medium: "text-amber-400 bg-amber-500/10 border-amber-500/20",
            Hard: "text-rose-400 bg-rose-500/10 border-rose-500/20"
          };

          return (
            <button
              id={`btn_track_select_${track.id}`}
              key={track.id}
              onClick={() => onTrackChange(track.id)}
              className={`w-full text-left p-4 rounded-xl border transition-all duration-300 flex flex-col justify-between gap-1.5 focus:outline-none ${
                isActive
                  ? "bg-slate-850 border-cyan-500 shadow-md ring-1 ring-cyan-500/30"
                  : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900"
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-extrabold tracking-wide">{track.name}</span>
                </div>
                <span className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full border ${difficultyColors[track.difficulty]}`}>
                  {track.difficulty}
                </span>
              </div>

              <span className="text-[11px] text-slate-400 font-sans tracking-wide leading-relaxed truncate block w-full">
                {track.description}
              </span>

              <div className="flex items-center gap-4 text-[10px] font-mono text-slate-500 mt-1 uppercase">
                <span>Length: <b>{track.lengthMeters}m</b></span>
                <span>•</span>
                <span>Ideal: <b>{track.idealLapTime.toFixed(1)}s</b></span>
                <span>•</span>
                <span>Country: <b>{track.country}</b></span>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
