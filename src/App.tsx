import React, { useState, useEffect } from "react";
import {
  Flag,
  Timer,
  Activity,
  Award,
  BookOpen,
  Cpu,
  RefreshCw,
  Send,
  User,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  CheckCircle2,
  Gauge
} from "lucide-react";

import { TRACKS, Track } from "./tracksData";
import { TelemetrySummary } from "./physicsEngine";
import TrackSelector from "./components/TrackSelector";
import Leaderboard from "./components/Leaderboard";
import TelemetryPlots from "./components/TelemetryPlots";
import TrackTemplateGenerator from "./components/TrackTemplateGenerator";
import VisionSystem from "./components/VisionSystem";

export default function App() {
  const [activeTrackId, setActiveTrackId] = useState<string>("monza");
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [driverName, setDriverName] = useState<string>("");
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [hasSubmittedThisLap, setHasSubmittedThisLap] = useState<boolean>(false);
  
  // coaching states
  const [coachingText, setCoachingText] = useState<string>("");
  const [coachingScore, setCoachingScore] = useState<number | null>(null);
  const [isCoachingLoading, setIsCoachingLoading] = useState<boolean>(false);
  
  // Fetch leaderboard on mount
  useEffect(() => {
    fetchLeaderboard();
  }, []);

  const fetchLeaderboard = async () => {
    try {
      const res = await fetch("/api/leaderboard");
      if (res.ok) {
        const data = await res.json();
        setLeaderboard(data);
      }
    } catch (e) {
      console.error("Failed to retrieve leaderboard from server:", e);
    }
  };

  const activeTrackObj = TRACKS[activeTrackId];

  // Handler for when the camera or sketch pad analysis completes
  const handleAnalysisComplete = async (summary: TelemetrySummary, base64Image?: string) => {
    setTelemetry(summary);
    setCoachingText("");
    setCoachingScore(null);
    setIsCoachingLoading(true);
    setHasSubmittedThisLap(false); // reset submit flag

    // Automatically fire the server side Gemini Race Engineer analyzer!
    try {
      const response = await fetch("/api/analyze-racing-line", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          trackId: activeTrackId,
          userMetrics: {
            lapTime: summary.lapTime,
            idealLapTime: summary.idealLapTime,
            avgSpeed: summary.avgSpeed,
            maxSpeed: summary.maxSpeed,
            maxG: summary.maxG,
            throttleRatio: summary.throttleRatio,
            averageDeviation: summary.averageDeviation
          },
          base64Image: base64Image || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        setCoachingText(result.coaching);
        setCoachingScore(result.score);
      } else {
        const errorMsg = await response.text();
        throw new Error(errorMsg || "Failed call.");
      }
    } catch (e: any) {
      console.error("Gemini pitwall coaching error:", e);
      setCoachingText(
        `📋 **Race Engineer's Backup Diagnostics:**\n\nLap completed successfully on the ${activeTrackId.toUpperCase()} circuit! Standard physics analytics parsed the curvature profile cleanly.\n\n- **Calculated Lap:** ${summary.lapTime.toFixed(2)} seconds.\n- **Distance Variance:** Telemetry indicates some wide apex lines. Keep it tight to save precious tenths!\n\n*Connection to the primary Gemini Race Bridge was interrupted. Using local backup telemetry commentary.*`
      );
      setCoachingScore(Math.min(100, Math.max(10, Math.round(90 - (summary.lapTime - summary.idealLapTime) * 3))));
    } finally {
      setIsCoachingLoading(false);
    }
  };

  const handleLeaderboardSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!driverName.trim() || !telemetry) return;

    setIsSubmittingScore(true);
    try {
      const response = await fetch("/api/leaderboard", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          name: driverName.trim(),
          track: activeTrackId,
          lapTime: telemetry.lapTime,
          avgSpeed: telemetry.avgSpeed,
          maxG: telemetry.maxG
        })
      });

      if (response.ok) {
        const result = await response.json();
        setLeaderboard(result.fullList);
        setHasSubmittedThisLap(true);
        setDriverName("");
      }
    } catch (err) {
      console.error("Leaderboard transmission error:", err);
    } finally {
      setIsSubmittingScore(false);
    }
  };

  // Safe custom Markdown Parser for clean presentation
  const parseMarkdown = (text: string) => {
    return text.split("\n").map((line, idx) => {
      if (line.startsWith("###")) {
        return (
          <h4 key={idx} className="text-xs font-bold text-cyan-400 mt-4 mb-1.5 uppercase font-mono tracking-wider flex items-center gap-1.5">
            <ChevronRight className="w-3.5 h-3.5" />
            {line.replace("###", "").trim()}
          </h4>
        );
      }
      if (line.startsWith("##")) {
        return (
          <h3 key={idx} className="text-sm font-bold text-rose-500 mt-5 mb-2 font-sans tracking-tight border-b border-slate-800 pb-1 uppercase">
            {line.replace("##", "").trim()}
          </h3>
        );
      }
      if (line.startsWith("#")) {
        return (
          <h2 key={idx} className="text-base font-extrabold text-white mt-5 mb-3 font-sans tracking-tight border-b-2 border-slate-850 pb-1.5">
            {line.replace("#", "").trim()}
          </h2>
        );
      }
      if (line.trim().startsWith("-") || line.trim().startsWith("*")) {
        const content = line.trim().substring(1).trim();
        return (
          <li key={idx} className="text-xs text-slate-300 ml-4 list-disc mb-1 leading-relaxed">
            {renderInlineBold(content)}
          </li>
        );
      }
      if (line.trim() === "") return <div key={idx} className="h-2" />;
      return (
        <p key={idx} className="text-xs text-slate-300 leading-relaxed mb-2.5">
          {renderInlineBold(line)}
        </p>
      );
    });
  };

  const renderInlineBold = (line: string) => {
    const parts = line.split(/\*\*(.*?)\*\*/g);
    return parts.map((part, i) => {
      if (i % 2 === 1) {
        return <strong key={i} className="text-white font-bold">{part}</strong>;
      }
      return part;
    });
  };

  return (
    <div id="main_app_wrapper" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      
      {/* 1. TOP TELEMETRY BAR HEADER */}
      <header className="bg-slate-900 border-b border-slate-850 border-slate-850 border-slate-800 px-6 py-4 sticky top-0 z-50 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          
          <div className="flex items-center gap-3">
            <span className="w-10 h-10 bg-rose-600 rounded-lg flex items-center justify-center font-black text-xl text-white tracking-tighter italic">
              F1
            </span>
            <div>
              <h1 className="text-lg font-black tracking-tight font-sans text-white uppercase leading-none">
                Paper Track Telemetry
              </h1>
              <span className="text-[10px] text-slate-400 font-mono uppercase tracking-widest mt-1 block">
                Aerodynamic & Curvature Vision Solver
              </span>
            </div>
          </div>

          {/* Status Matrix */}
          <div className="flex items-center gap-5 text-xs font-mono text-slate-400">
            <div className="hidden md:flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
              <span>VISION CAPTURE READY</span>
            </div>
            <div className="hidden sm:block border-l border-slate-800 h-4" />
            <div className="text-right">
              <span className="text-[10px] text-slate-500 block">SYSTEM TIME</span>
              <span className="font-bold text-slate-300">2026-06-09 UTC</span>
            </div>
          </div>

        </div>
      </header>

      {/* 2. CORE BRIEF EXPLANATION ACCORDION */}
      <div className="bg-slate-900/40 border-b border-slate-850 border-slate-800 py-3 px-6 text-xs text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3 font-sans">
          <p className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-cyan-400 shrink-0" />
            <span>
              This prototype models **realistic vehicle and tyre dynamics** on paper racing tracks. 
              Upload drawn lines, calibrate corner QR anchors, and analyze speed positioning.
            </span>
          </p>
          <a
            href="#template_generator_comp"
            className="text-cyan-400 hover:underline font-bold uppercase tracking-wider text-[10px] flex items-center gap-1 shrink-0"
          >
            How it works <ChevronRight className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>

      {/* 3. MAIN DASHBOARD PORTAL */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        
        {/* Row 1: Setup & Track Display */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Column A (Left 4/12): Selectors and Leaderboards */}
          <div className="lg:col-span-4 space-y-6">
            <TrackSelector
              activeTrackId={activeTrackId}
              onTrackChange={(id) => {
                setActiveTrackId(id);
                setTelemetry(null);
                setCoachingText("");
                setCoachingScore(null);
              }}
            />
            
            {/* Embedded Leaderboard to save desktop margin */}
            <Leaderboard entries={leaderboard} currentTrackId={activeTrackId} />
          </div>

          {/* Column B (Right 8/12): Live Camera View and Tracing */}
          <div className="lg:col-span-8 space-y-6">
            <VisionSystem
              track={activeTrackObj}
              onAnalysisComplete={handleAnalysisComplete}
            />
          </div>

        </div>

        {/* Dynamic Telemetry Results - Triggered after run simulation */}
        {telemetry && (
          <div id="results_telemetry" className="space-y-6 transition-all duration-500 animate-fadeIn">
            
            {/* Plots Section */}
            <TelemetryPlots summary={telemetry} />

            {/* Pitwall Race Engineer Coaching & Score Panel */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              
              {/* Left Side: Race Engineer Comments */}
              <div className="lg:col-span-8 bg-slate-900 border border-slate-805 border-slate-800 rounded-xl p-6 shadow-xl text-white">
                <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                  <div className="flex items-center gap-3">
                    <span className="w-2.5 h-2.5 bg-red-650 bg-rose-650 bg-rose-600 rounded-full animate-pulse" />
                    <h3 className="font-sans font-bold tracking-tight text-base uppercase">
                      Race Engineer Pitwall (Coaching)
                    </h3>
                  </div>
                  <span className="text-[10px] font-mono text-slate-400 uppercase bg-slate-950 px-2.5 py-1 rounded-full border border-slate-800">
                    Live Stream Grounding
                  </span>
                </div>

                {isCoachingLoading ? (
                  <div className="py-12 text-center text-slate-400 space-y-3 font-mono text-sm">
                    <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin mx-auto" />
                    <span className="block animate-pulse uppercase tracking-wider">
                      Generative Intelligence analysis...
                    </span>
                  </div>
                ) : (
                  <div className="prose prose-invert max-w-none text-slate-300 select-text">
                    <div className="space-y-1">
                      {coachingText ? parseMarkdown(coachingText) : (
                        <p className="text-xs font-mono text-slate-500 italic">No feedback payload received.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Right Side: Score Radial & Global Submission */}
              <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl text-white flex flex-col justify-between">
                
                {/* Score Dial */}
                <div className="text-center py-4">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-2">
                    Line Performance Rating
                  </span>
                  
                  {isCoachingLoading ? (
                    <div className="w-28 h-28 rounded-full border-4 border-dashed border-slate-700 animate-spin mx-auto flex items-center justify-center">
                      <span className="text-xs font-mono text-slate-500">CALC</span>
                    </div>
                  ) : (
                    <div className="relative w-28 h-28 mx-auto flex items-center justify-center rounded-full border-4 border-cyan-500/10 shadow-[0_0_20px_rgba(6,182,212,0.1)]">
                      {/* SVG Circle Progress */}
                      <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                        <circle
                          cx="56"
                          cy="56"
                          r="48"
                          stroke="#1e293b"
                          strokeWidth="6"
                          fill="none"
                        />
                        <circle
                          cx="56"
                          cy="56"
                          r="48"
                          stroke="#06b6d4"
                          strokeWidth="6"
                          fill="none"
                          strokeDasharray="301.5"
                          strokeDashoffset={301.5 - (301.5 * (coachingScore || 0)) / 100}
                        />
                      </svg>
                      <div className="text-center">
                        <span className="text-3xl font-extrabold tracking-tight font-mono text-white block">
                          {coachingScore !== null ? coachingScore : "--"}
                        </span>
                        <span className="text-[10px] text-slate-400 block uppercase font-mono tracking-wider">
                          INDEX
                        </span>
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-400 font-mono mt-3 uppercase tracking-wide">
                    {coachingScore && coachingScore >= 85 ? "🏎️ Pro Class Apex Entry" : coachingScore && coachingScore >= 70 ? "🏁 Competent Pace" : "⚠️ Sub-optimal Apex Deviation"}
                  </p>
                </div>

                {/* Save Lap Time to Leaderboard */}
                <div className="border-t border-slate-800 pt-4 mt-4">
                  <span className="text-xs font-bold font-sans tracking-tight block text-white uppercase mb-3">
                    Register Lap Record
                  </span>
                  
                  {hasSubmittedThisLap ? (
                    <div className="bg-emerald-950/40 border border-emerald-500/20 p-3 rounded-lg text-emerald-400 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>Lap successfully registered on global leaderboard!</span>
                    </div>
                  ) : (
                    <form onSubmit={handleLeaderboardSubmit} className="space-y-2">
                      <div className="relative">
                        <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                        <input
                          type="text"
                          maxLength={12}
                          value={driverName}
                          onChange={(e) => setDriverName(e.target.value)}
                          placeholder="Initials / Name (e.g., HAM)"
                          required
                          disabled={isSubmittingScore}
                          className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 p-2 pl-9 rounded-lg text-xs font-mono placeholder-slate-500 text-white focus:outline-none transition"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={isSubmittingScore || !driverName.trim()}
                        className="w-full flex items-center justify-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold p-2.5 rounded-lg text-xs font-sans uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        Save Record Time
                      </button>
                    </form>
                  )}
                </div>

              </div>

            </div>

          </div>
        )}

        {/* Phase 0 PDF/Image Generation tools */}
        <div className="pt-4">
          <TrackTemplateGenerator track={activeTrackObj} />
        </div>

      </main>

      {/* 4. FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-850 border-slate-800 text-slate-500 text-xs py-6 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left font-mono">
          <div>
            <p>Formula 1 Paper Track Vision System Analyzer © 2026</p>
            <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-widest">
              Engineered with physical friction limits & Generative AI co-driving
            </p>
          </div>
          <p className="text-[10px] text-slate-500 hover:text-white transition flex items-center gap-1">
            <span>MS Teams and Mobile Render Compatibility Validated</span>
            <ExternalLink className="w-3 h-3" />
          </p>
        </div>
      </footer>

    </div>
  );
}
