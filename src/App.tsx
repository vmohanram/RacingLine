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
import RacetrackMinimap from "./components/RacetrackMinimap";

export default function App() {
  const [activeTrackId, setActiveTrackId] = useState<string>("monza");
  const [hoveredTelemetryIndex, setHoveredTelemetryIndex] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [driverName, setDriverName] = useState<string>("");
  const [isSubmittingScore, setIsSubmittingScore] = useState<boolean>(false);
  const [hasSubmittedThisLap, setHasSubmittedThisLap] = useState<boolean>(false);
  const [activeResultsTab, setActiveResultsTab] = useState<"verdict" | "analytics" | "leaderboard">("verdict");
  
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
      setActiveResultsTab("verdict");
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
    if (!text) return null;
    
    const lines = text.split("\n");
    let inList = false;
    let listItems: React.ReactNode[] = [];
    const elements: React.ReactNode[] = [];

    const flushList = (key: string | number) => {
      if (listItems.length > 0) {
        elements.push(
          <ul key={`ul-${key}`} className="space-y-2 my-2 list-none pl-1">
            {...listItems}
          </ul>
        );
        listItems = [];
        inList = false;
      }
    };

    lines.forEach((line, idx) => {
      const trimmed = line.trim();
      
      // Headers
      if (trimmed.startsWith("###")) {
        flushList(idx);
        elements.push(
          <h4 key={idx} className="text-[11px] font-bold text-cyan-400 mt-4 mb-2 uppercase font-mono tracking-wider flex items-center gap-1.5 border-b border-slate-800/40 pb-1">
            <span className="w-1.5 h-3 bg-cyan-400 rounded-sm inline-block shrink-0" />
            {renderInlineMarkdown(trimmed.replace("###", "").trim())}
          </h4>
        );
        return;
      }
      if (trimmed.startsWith("##")) {
        flushList(idx);
        elements.push(
          <h3 key={idx} className="text-xs font-black text-rose-500 mt-5 mb-2.5 font-sans tracking-tight border-b border-slate-800 pb-1 uppercase flex items-center gap-1.5">
            <span className="w-2 h-3.5 bg-rose-500 rounded-sm inline-block shrink-0" />
            {renderInlineMarkdown(trimmed.replace("##", "").trim())}
          </h3>
        );
        return;
      }
      if (trimmed.startsWith("#")) {
        flushList(idx);
        elements.push(
          <h2 key={idx} className="text-sm font-black text-white mt-6 mb-3 font-sans tracking-tight border-b-2 border-slate-800 pb-1.5 uppercase bg-slate-950/60 px-3 py-1.5 rounded-lg border border-slate-800/80">
            {renderInlineMarkdown(trimmed.replace("#", "").trim())}
          </h2>
        );
        return;
      }

      // Blockquotes
      if (trimmed.startsWith(">")) {
        flushList(idx);
        elements.push(
          <blockquote key={idx} className="border-l-3 border-rose-500 bg-rose-950/10 px-3 py-2 my-3 rounded-r-lg text-xs italic text-rose-200 leading-relaxed font-mono">
            {renderInlineMarkdown(trimmed.substring(1).trim())}
          </blockquote>
        );
        return;
      }

      // Bullets (unordered lists)
      if (trimmed.startsWith("-") || trimmed.slice(0, 2) === "* " || trimmed === "*") {
        inList = true;
        const content = trimmed.startsWith("-") ? trimmed.substring(1).trim() : trimmed.substring(1).trim();
        listItems.push(
          <li key={`li-${idx}`} className="text-xs text-slate-300 ml-1 mb-1 leading-relaxed font-sans flex items-start gap-2">
            <span className="text-rose-500 font-bold mt-0.5 select-none shrink-0">•</span>
            <span>{renderInlineMarkdown(content)}</span>
          </li>
        );
        return;
      }

      // Numbered lists (e.g. "1. ", "2. ")
      const numMatch = trimmed.match(/^(\d+)\.\s+(.*)/);
      if (numMatch) {
        inList = true;
        const num = numMatch[1];
        const content = numMatch[2];
        listItems.push(
          <li key={`li-num-${idx}`} className="text-xs text-slate-300 ml-1 mb-1 leading-relaxed font-sans flex items-start gap-2">
            <span className="text-cyan-400 font-mono text-[9px] bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-900/40 mt-0.5 shrink-0 leading-none">{num}</span>
            <span className="pt-0.5">{renderInlineMarkdown(content)}</span>
          </li>
        );
        return;
      }

      // Blank lines or clear separators
      if (trimmed === "") {
        flushList(idx);
        elements.push(<div key={idx} className="h-2" />);
        return;
      }

      // Horizontal rules
      if (trimmed === "---" || trimmed === "***") {
        flushList(idx);
        elements.push(<hr key={idx} className="border-slate-800 my-3" />);
        return;
      }

      // Regular paragraph
      flushList(idx);
      elements.push(
        <p key={idx} className="text-xs text-slate-350 leading-relaxed mb-2 font-sans select-text">
          {renderInlineMarkdown(trimmed)}
        </p>
      );
    });

    // Final flush
    flushList("final");

    return elements;
  };

  const renderInlineMarkdown = (line: string) => {
    const parts = line.split(/(\*\*.*?\*\*|\*.*?\*|`.*?`)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="text-white font-bold text-cyan-300">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("*") && part.endsWith("*")) {
        return (
          <em key={i} className="italic text-slate-200">
            {part.slice(1, -1)}
          </em>
        );
      }
      if (part.startsWith("`") && part.endsWith("`")) {
        return (
          <code key={i} className="font-mono bg-slate-950 text-rose-450 text-[10px] px-1.5 py-0.5 rounded border border-slate-800 mx-0.5 font-semibold text-rose-400">
            {part.slice(1, -1)}
          </code>
        );
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
        
        {/* HORIZONTALLY ALIGNED TRACKSELECTOR PUSHED TO THE TOP */}
        <TrackSelector
          activeTrackId={activeTrackId}
          onTrackChange={(id) => {
            setActiveTrackId(id);
            setTelemetry(null);
            setCoachingText("");
            setCoachingScore(null);
            setHoveredTelemetryIndex(null);
          }}
        />

        {/* THE MAIN PORTAL CONTENT GRID (VisionSystem central-left, Leaderboard on side when idle) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Bigger and centered sketch interface (grows to 12 columns once telemetry loads for high immersion) */}
          <div className={`${telemetry ? "lg:col-span-12" : "lg:col-span-9"} space-y-6`}>
            <VisionSystem
              track={activeTrackObj}
              onAnalysisComplete={handleAnalysisComplete}
              hoveredTelemetryIndex={hoveredTelemetryIndex}
              summary={telemetry}
              onRefreshLeaderboard={fetchLeaderboard}
            />
          </div>

          {/* Sidebar leaderboard ONLY when we are loading/idle (disappears into tabs once analyzed) */}
          {!telemetry && (
            <div className="lg:col-span-3 space-y-6 lg:sticky lg:top-20">
              <Leaderboard entries={leaderboard} currentTrackId={activeTrackId} />
            </div>
          )}

        </div>

        {/* Dynamic Telemetry Results Tabbed Workspace - Triggered after lap simulation */}
        {telemetry && (
          <div id="results_telemetry" className="space-y-6 transition-all duration-500 animate-fadeIn bg-slate-900/10 border border-slate-800/40 p-5 rounded-2xl">
            
            {/* TAB SELECTOR STRIP WITH MICRO-METRICS */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800/80 pb-4">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setActiveResultsTab("verdict")}
                  className={`px-4 py-2 rounded-lg text-[11px] font-sans tracking-wider uppercase transition-all duration-300 font-bold cursor-pointer ${
                    activeResultsTab === "verdict"
                      ? "bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.3)]"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  }`}
                >
                  Race Engineer Verdict
                </button>
                <button
                  onClick={() => setActiveResultsTab("analytics")}
                  className={`px-4 py-2 rounded-lg text-[11px] font-sans tracking-wider uppercase transition-all duration-300 font-bold cursor-pointer ${
                    activeResultsTab === "analytics"
                      ? "bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.3)]"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  }`}
                >
                  Race Analytics Overview
                </button>
                <button
                  onClick={() => setActiveResultsTab("leaderboard")}
                  className={`px-4 py-2 rounded-lg text-[11px] font-sans tracking-wider uppercase transition-all duration-300 font-bold cursor-pointer ${
                    activeResultsTab === "leaderboard"
                      ? "bg-rose-600 text-white shadow-[0_0_12px_rgba(225,29,72,0.3)]"
                      : "bg-slate-900 border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700"
                  }`}
                >
                  Circuit Leaderboard
                </button>
              </div>

              {/* Fast Telemetry Stats */}
              <div className="flex items-center gap-3 bg-slate-950/60 border border-slate-800 px-3.5 py-1.5 rounded-lg text-[11px] font-mono">
                <div className="text-slate-400 border-r border-slate-800 pr-3 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-cyan-400 rounded-full" />
                  LAP: <span className="text-white font-bold">{telemetry.lapTime.toFixed(2)}s</span>
                </div>
                <div className="text-slate-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                  AVG SPEED: <span className="text-white font-bold">{telemetry.avgSpeed.toFixed(0)} km/h</span>
                </div>
              </div>
            </div>

            {/* TAB CONTENT PORTAL GRID */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              
              {/* Left Side: Seamless Minimap Rendition (active in EVERY tab) */}
              <div className="lg:col-span-4 bg-slate-950/40 border border-slate-800/80 rounded-xl p-4 flex flex-col justify-between">
                <div className="mb-2">
                  <div className="flex items-center gap-2 mb-1">
                    <Flag className="w-3.5 h-3.5 text-rose-500" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-slate-350">
                      Telemetry Racing Line Map
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-450 font-sans leading-tight">
                    Dynamic geometry parsed from physical markers. Hover over telemetry analytics points to pinpoint locations.
                  </p>
                </div>
                
                <div className="flex-1 min-h-[290px] relative mt-2 border border-slate-900 bg-slate-950/60 rounded-lg overflow-hidden flex items-center justify-center p-2">
                  <RacetrackMinimap
                    track={activeTrackObj}
                    summary={telemetry}
                    hoveredIndex={hoveredTelemetryIndex}
                  />
                </div>
              </div>

              {/* Right Side: Tab-conditioned Content area */}
              <div className="lg:col-span-8 flex flex-col">
                {activeResultsTab === "verdict" && (
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-6 h-full flex-1">
                    
                    {/* Race Engineer Remarks */}
                    <div className="md:col-span-7 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-white flex flex-col justify-between">
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-800/85 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                            <h3 className="font-sans font-bold tracking-tight text-xs uppercase text-slate-200">
                              Race Engineer Verdict
                            </h3>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                            Telemetry Feedback
                          </span>
                        </div>

                        {isCoachingLoading ? (
                          <div className="py-16 text-center text-slate-400 space-y-3 font-mono text-xs">
                            <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                            <span className="block animate-pulse uppercase tracking-wider text-[10px] text-slate-500">
                              Parsing racing lines...
                            </span>
                          </div>
                        ) : (
                          <div id="coaching_container" className="prose prose-invert max-w-none text-slate-300 select-text max-h-[310px] overflow-y-auto pr-1">
                            <div className="space-y-1">
                              {coachingText ? parseMarkdown(coachingText) : (
                                <p className="text-xs font-mono text-slate-500 italic">No feedback payload received.</p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Radial Index Meter & Leaderboard score registration */}
                    <div className="md:col-span-5 bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl text-white flex flex-col justify-between">
                      
                      {/* Rating Meter */}
                      <div className="text-center py-2">
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400 block mb-1.5">
                          Lap Performance Index
                        </span>
                        
                        {isCoachingLoading ? (
                          <div className="w-22 h-22 rounded-full border-4 border-dashed border-slate-700 animate-spin mx-auto flex items-center justify-center">
                            <span className="text-[10px] font-mono text-slate-500">CALC</span>
                          </div>
                        ) : (
                          <div className="relative w-22 h-22 mx-auto flex items-center justify-center rounded-full border-4 border-cyan-500/10 shadow-[0_0_15px_rgba(6,182,212,0.1)] mb-1">
                            {/* SVG Performance Dial */}
                            <svg className="absolute inset-0 w-full h-full transform -rotate-90">
                              <circle
                                cx="44"
                                cy="44"
                                r="38"
                                stroke="#1e293b"
                                strokeWidth="5"
                                fill="none"
                              />
                              <circle
                                cx="44"
                                cy="44"
                                r="38"
                                stroke="#06b6d4"
                                strokeWidth="5"
                                fill="none"
                                strokeDasharray="238.7"
                                strokeDashoffset={238.7 - (238.7 * (coachingScore || 0)) / 100}
                              />
                            </svg>
                            <div className="text-center">
                              <span className="text-2xl font-black tracking-tight font-mono text-white block">
                                {coachingScore !== null ? coachingScore : "--"}
                              </span>
                              <span className="text-[9px] text-slate-450 block uppercase font-mono tracking-wider leading-none">
                                SCORE
                              </span>
                            </div>
                          </div>
                        )}
                        <p className="text-[10px] text-slate-400 font-mono mt-1.5 uppercase tracking-wide leading-tight">
                          {coachingScore && coachingScore >= 85 ? "🏎️ Pro Class Apex Entry" : coachingScore && coachingScore >= 70 ? "🏁 Competent Pace" : "⚠️ Sub-optimal Apex Line"}
                        </p>
                      </div>

                      {/* Register Record Form */}
                      <div className="border-t border-slate-800 pt-3 mt-3">
                        <span className="text-[11px] font-bold font-sans tracking-tight block text-white uppercase mb-1.5">
                          Register Lap Record
                        </span>
                        
                        {hasSubmittedThisLap ? (
                          <div className="bg-emerald-950/40 border border-emerald-500/20 p-2.5 rounded-lg text-emerald-400 text-[10px] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>Lap recorded successfully!</span>
                          </div>
                        ) : (
                          <form onSubmit={handleLeaderboardSubmit} className="space-y-1.5">
                            <div className="relative">
                              <User className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500" />
                              <input
                                type="text"
                                maxLength={12}
                                value={driverName}
                                onChange={(e) => setDriverName(e.target.value)}
                                placeholder="Initials (e.g. HAM)"
                                required
                                disabled={isSubmittingScore}
                                className="w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 p-1.5 pl-8 rounded-lg text-xs font-mono placeholder-slate-500 text-white focus:outline-none transition animate-none"
                              />
                            </div>
                            <button
                              type="submit"
                              disabled={isSubmittingScore || !driverName.trim()}
                              className="w-full flex items-center justify-center gap-1 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold p-1.5 rounded-lg text-xs font-sans uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                            >
                              <Send className="w-3 h-3" />
                              Save Record
                            </button>
                          </form>
                        )}
                      </div>

                    </div>

                  </div>
                )}

                {activeResultsTab === "analytics" && (
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-xl h-full flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-2.5">
                        <div className="flex items-center gap-2">
                          <Gauge className="w-4 h-4 text-rose-500" />
                          <h3 className="font-sans font-bold tracking-tight text-xs uppercase text-slate-200">
                            Telemetry Plots & Acceleration Forces
                          </h3>
                        </div>
                        <span className="text-[9px] font-mono text-slate-500 uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                          Active telemetry overlay
                        </span>
                      </div>
                      
                      <TelemetryPlots 
                        summary={telemetry} 
                        track={activeTrackObj} 
                        onHoverIndexChange={setHoveredTelemetryIndex} 
                      />
                    </div>
                  </div>
                )}

                {activeResultsTab === "leaderboard" && (
                  <div className="border border-slate-800 rounded-xl overflow-hidden shadow-xl h-full flex flex-col">
                    <Leaderboard entries={leaderboard} currentTrackId={activeTrackId} />
                  </div>
                )}
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
