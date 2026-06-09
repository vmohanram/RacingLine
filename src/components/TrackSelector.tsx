import React from "react";
import { Flag } from "lucide-react";
import { Track, TRACKS } from "../tracksData";

interface TrackSelectorProps {
  activeTrackId: string;
  onTrackChange: (trackId: string) => void;
}

export default function TrackSelector({ activeTrackId, onTrackChange }: TrackSelectorProps) {
  return (
    <div id="track_selector_comp" className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-white">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-center">
        
        {/* Left column: Introductory Text (3 cols) */}
        <div className="xl:col-span-3 space-y-1.5 text-left">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-rose-500 animate-pulse" />
            <h3 className="font-sans font-black text-sm tracking-tight uppercase text-white">Active Circuits</h3>
          </div>
          <p className="text-[11px] text-slate-400 font-sans leading-relaxed">
            Select a Formula 1 circuit template. Each layout features unique aerodynamic setups, radius parameters, and target lap times.
          </p>
        </div>

        {/* Right column: Track selection list aligned horizontally (9 cols) */}
        <div className="xl:col-span-9 grid grid-cols-1 md:grid-cols-3 gap-3 w-full">
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
                className={`text-left p-3.5 rounded-xl border transition-all duration-300 flex flex-col justify-between gap-1 focus:outline-none cursor-pointer h-full ${
                  isActive
                    ? "bg-slate-850 border-cyan-500 shadow-md ring-1 ring-cyan-500/30"
                    : "bg-slate-950/60 border-slate-800/80 hover:border-slate-705 hover:bg-slate-900"
                }`}
              >
                <div className="flex items-center justify-between w-full gap-2">
                  <span className="text-xs font-extrabold tracking-wide uppercase truncate">
                    {track.name.replace("Autodromo Nazionale ", "").replace("Circuit de ", "").replace(" Circuit", "")}
                  </span>
                  <span className={`text-[8px] font-mono font-bold px-1.5 py-0.2 rounded-full border shrink-0 ${difficultyColors[track.difficulty]}`}>
                    {track.difficulty}
                  </span>
                </div>

                <span className="text-[10px] text-slate-400 font-sans leading-relaxed line-clamp-1 block w-full">
                  {track.description}
                </span>

                <div className="flex items-center gap-2 text-[9px] font-mono text-slate-500 mt-1 uppercase w-full justify-between">
                  <span>Len: <strong className="text-slate-300 font-bold">{track.lengthMeters}m</strong></span>
                  <span>Ideal: <strong className="text-slate-300 font-bold">{track.idealLapTime.toFixed(1)}s</strong></span>
                  <span className="text-slate-400">{track.country}</span>
                </div>
              </button>
            );
          })}
        </div>

      </div>
    </div>
  );
}
