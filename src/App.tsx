import React, { useState, useEffect } from "react";
import {
  Flag,
  RefreshCw,
  ExternalLink,
  CheckCircle2,
  Gauge
} from "lucide-react";

import { TRACKS } from "./tracksData";
import { TelemetrySummary } from "./physicsEngine";
import Leaderboard from "./components/Leaderboard";
import TelemetryPlots from "./components/TelemetryPlots";
import VisionSystem, { AnalysisAssets } from "./components/VisionSystem";
import RacetrackMinimap from "./components/RacetrackMinimap";
import { openRaceReportPdf } from "./reporting/createRaceReport";

export default function App() {
  const activeTrackId = "silverstone";
  const [hoveredTelemetryDistance, setHoveredTelemetryDistance] = useState<number | null>(null);
  const [leaderboard, setLeaderboard] = useState<any[]>([]);
  const [telemetry, setTelemetry] = useState<TelemetrySummary | null>(null);
  const [reportAssets, setReportAssets] = useState<AnalysisAssets>({});
  const [driverName, setDriverName] = useState<string>("");
  const [hasSubmittedThisLap, setHasSubmittedThisLap] = useState<boolean>(false);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<"scan" | "analytics" | "leaderboard">("scan");
  const [activeAnalyticsTab, setActiveAnalyticsTab] = useState<"plots" | "verdict">("plots");
  
  // coaching states
  const [coachingText, setCoachingText] = useState<string>("");
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
  const circuitLeaderboard = leaderboard
    .filter((entry) => entry.track === activeTrackId)
    .sort((a, b) => a.lapTime - b.lapTime);
  const bestLapEntry = circuitLeaderboard[0] || null;

  // Handler for when the camera or sketch pad analysis completes
  const handleAnalysisComplete = async (summary: TelemetrySummary, assets?: AnalysisAssets) => {
    setTelemetry(summary);
    setReportAssets(assets || {});
    setHoveredTelemetryDistance(null);
    setCoachingText("");
    setIsCoachingLoading(true);
    setHasSubmittedThisLap(false); // reset submit flag
    setActiveWorkspaceTab("analytics");
    setActiveAnalyticsTab("verdict");

    // Automatically fire the server side Gemini Race Engineer analyzer!
    try {
      const response = await fetch("/api/analyze-racing-line", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          trackId: activeTrackId,
          driverName: driverName.trim() || "Racer",
          userMetrics: {
            lapTime: summary.lapTime,
            idealLapTime: summary.idealLapTime,
            avgSpeed: summary.avgSpeed,
            maxSpeed: summary.maxSpeed,
            maxG: summary.maxG,
            throttleRatio: summary.throttleRatio,
            brakingPointsCount: summary.brakingPointsCount,
            averageDeviation: summary.averageDeviation,
            points: summary.points
          },
          base64Image: assets?.sourceImage || null
        })
      });

      if (response.ok) {
        const result = await response.json();
        setCoachingText(result.coaching);
        if (!result.warning) {
          setHasSubmittedThisLap(true);
          await fetchLeaderboard();
        }
      } else {
        const errorMsg = await response.text();
        throw new Error(errorMsg || "Failed call.");
      }
    } catch (e: any) {
      console.error("Gemini pitwall coaching error:", e);
      setCoachingText(
        `📋 **Race Engineer's Backup Diagnostics:**\n\nLap completed successfully on the ${activeTrackId.toUpperCase()} circuit! Standard physics analytics parsed the curvature profile cleanly.\n\n- **Calculated Lap:** ${summary.lapTime.toFixed(2)} seconds.\n- **Distance Variance:** Telemetry indicates some wide apex lines. Keep it tight to save precious tenths!\n\n*Connection to the primary Gemini Race Bridge was interrupted. Using local backup telemetry commentary.*`
      );
    } finally {
      setIsCoachingLoading(false);
    }
  };

  const handleAnalysisInvalidated = () => {
    setTelemetry(null);
    setReportAssets({});
    setHoveredTelemetryDistance(null);
    setCoachingText("");
    setIsCoachingLoading(false);
    setHasSubmittedThisLap(false);
  };

  const handleCreatePdfReport = () => {
    if (!telemetry) return;
    openRaceReportPdf({
      track: activeTrackObj,
      summary: telemetry,
      coachingText,
      reportTrackImage: reportAssets.reportTrackImage,
      sourceImage: reportAssets.sourceImage
    });
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
          <ul key={`ul-${key}`} className="space-y-3 my-3 list-none pl-1">
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
          <h4 key={idx} className="text-base font-bold text-cyan-300 mt-5 mb-2 uppercase tracking-[0.14em] flex items-center gap-2 border-b border-slate-800/40 pb-2">
            <span className="w-1.5 h-3 bg-cyan-400 rounded-sm inline-block shrink-0" />
            {renderInlineMarkdown(trimmed.replace("###", "").trim())}
          </h4>
        );
        return;
      }
      if (trimmed.startsWith("##")) {
        flushList(idx);
        elements.push(
          <h3 key={idx} className="text-xl font-black text-white mt-6 mb-3 font-sans tracking-tight border-b border-slate-800 pb-2 uppercase flex items-center gap-2">
            <span className="w-2 h-3.5 bg-rose-500 rounded-sm inline-block shrink-0" />
            {renderInlineMarkdown(trimmed.replace("##", "").trim())}
          </h3>
        );
        return;
      }
      if (trimmed.startsWith("#")) {
        flushList(idx);
        elements.push(
          <h2 key={idx} className="text-2xl font-black text-white mt-6 mb-3 font-sans tracking-tight border-b-2 border-slate-800 pb-2 uppercase bg-slate-950/60 px-4 py-2 rounded-xl border border-slate-800/80">
            {renderInlineMarkdown(trimmed.replace("#", "").trim())}
          </h2>
        );
        return;
      }

      // Blockquotes
      if (trimmed.startsWith(">")) {
        flushList(idx);
        elements.push(
          <blockquote key={idx} className="border-l-4 border-rose-500 bg-rose-950/10 px-4 py-3 my-4 rounded-r-xl text-sm italic text-rose-100 leading-relaxed">
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
          <li key={`li-${idx}`} className="text-sm text-slate-200 ml-1 mb-1 leading-relaxed font-sans flex items-start gap-2.5">
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
          <li key={`li-num-${idx}`} className="text-sm text-slate-200 ml-1 mb-1 leading-relaxed font-sans flex items-start gap-2.5">
            <span className="text-cyan-300 font-mono text-[10px] bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-900/40 mt-0.5 shrink-0 leading-none">{num}</span>
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
        <p key={idx} className="text-sm text-slate-200 leading-7 mb-3 font-sans select-text">
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

  const parseCoachingCards = (text: string) => {
    const cards: Array<{ title: string; body: string }> = [];
    if (!text) return cards;

    const lines = text.split("\n");
    let currentTitle = "";
    let currentBody: string[] = [];

    const flushCard = () => {
      if (!currentTitle) return;
      const body = currentBody
        .map((line) => line.replace(/^[-*>]\s*/, "").trim())
        .filter(Boolean)
        .join(" ");
      cards.push({ title: currentTitle, body });
    };

    lines.forEach((line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      if (trimmed.startsWith("## ")) {
        flushCard();
        currentTitle = trimmed.replace(/^##\s+/, "").trim();
        currentBody = [];
        return;
      }
      currentBody.push(trimmed);
    });

    flushCard();
    return cards;
  };

  return (
    <div id="main_app_wrapper" className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* 1. MAIN DASHBOARD PORTAL */}
      <main className="flex-1 max-w-screen-2xl w-full mx-auto p-4 md:p-6 space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-slate-800/80 bg-[radial-gradient(circle_at_top_left,rgba(239,68,68,0.14),transparent_24%),radial-gradient(circle_at_80%_20%,rgba(56,189,248,0.12),transparent_22%),linear-gradient(180deg,rgba(15,23,42,0.98),rgba(2,6,23,1))] shadow-[0_24px_80px_rgba(2,6,23,0.42)]">
          <div className="border-b border-slate-800/80 px-5 py-5 md:px-6 md:py-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
              <div>
                <h1 className="masthead-title text-[1.55rem] text-white leading-[0.88] sm:text-[2rem] xl:text-[2.65rem]">
                  F1 Paper Track Vision System
                </h1>
                <p className="masthead-tagline mt-3 max-w-3xl text-[10px] font-mono uppercase text-slate-500 sm:text-[11px]">
                  Engineered with physical friction limits &amp; Generative AI co-driving
                </p>
              </div>
            </div>
          </div>

          <div className="px-5 py-3 md:px-6 bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0))]">
            <div className="flex flex-wrap items-center gap-3 md:gap-5">
            <button
              onClick={() => setActiveWorkspaceTab("scan")}
              className={`rounded-lg px-1 py-1 text-left text-[11px] font-bold uppercase tracking-[0.24em] transition ${
                activeWorkspaceTab === "scan"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              Scan Interface
            </button>
            <button
              onClick={() => setActiveWorkspaceTab("analytics")}
              className={`rounded-lg px-1 py-1 text-left text-[11px] font-bold uppercase tracking-[0.24em] transition ${
                activeWorkspaceTab === "analytics"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              Race Analytics
            </button>
            <button
              onClick={() => setActiveWorkspaceTab("leaderboard")}
              className={`rounded-lg px-1 py-1 text-left text-[11px] font-bold uppercase tracking-[0.24em] transition ${
                activeWorkspaceTab === "leaderboard"
                  ? "text-white"
                  : "text-slate-500 hover:text-slate-200"
              }`}
            >
              Leaderboard
            </button>
          </div>
          </div>
        </section>

        {activeWorkspaceTab === "scan" && (
          <div className="space-y-5">
            <section className="rounded-[28px] border border-slate-800/80 bg-[linear-gradient(145deg,rgba(1,33,105,0.94)_0%,rgba(1,33,105,0.94)_34%,rgba(255,255,255,0.16)_34%,rgba(255,255,255,0.16)_39%,rgba(200,16,46,0.88)_39%,rgba(200,16,46,0.88)_46%,rgba(255,255,255,0.16)_46%,rgba(255,255,255,0.16)_51%,rgba(1,33,105,0.94)_51%,rgba(1,33,105,0.94)_100%),linear-gradient(35deg,rgba(1,33,105,0.96)_0%,rgba(1,33,105,0.96)_38%,rgba(255,255,255,0.14)_38%,rgba(255,255,255,0.14)_43%,rgba(200,16,46,0.82)_43%,rgba(200,16,46,0.82)_50%,rgba(255,255,255,0.14)_50%,rgba(255,255,255,0.14)_55%,rgba(1,33,105,0.96)_55%,rgba(1,33,105,0.96)_100%),radial-gradient(circle_at_center,rgba(255,255,255,0.08),transparent_45%),linear-gradient(180deg,rgba(15,23,42,0.55),rgba(2,6,23,0.82))] p-5 md:p-6 shadow-2xl">
              <div className="grid gap-5 xl:grid-cols-12 xl:items-end">
                <div className="xl:col-span-8">
                  <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-300">Circuit Briefing</span>
                  <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-white uppercase">
                    {activeTrackObj.name}
                  </h2>
                  <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-300">
                    {activeTrackObj.description} In this scan, the goal is to capture your drawn racing line, align it to the Silverstone template, and measure how closely your corner approach, apex timing, and exit shape match a fast lap.
                  </p>
                </div>

                <div className="xl:col-span-4 grid grid-cols-1 sm:grid-cols-3 xl:grid-cols-1 gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3.5">
                    <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Target</span>
                    <span className="mt-2 block text-lg font-black tracking-tight text-rose-500">
                      Clean high-speed line
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3.5">
                    <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Reference Lap</span>
                    <span className="mt-2 block text-lg font-black tracking-tight text-rose-500">
                      {activeTrackObj.idealLapTime.toFixed(2)}s
                    </span>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/55 p-3.5">
                    <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Focus Sequence</span>
                    <span className="mt-2 block text-lg font-black tracking-tight text-rose-500">
                      Copse to Becketts
                    </span>
                  </div>
                </div>
              </div>
            </section>

            <VisionSystem
              track={activeTrackObj}
              onAnalysisComplete={handleAnalysisComplete}
              onAnalysisInvalidated={handleAnalysisInvalidated}
              driverName={driverName}
              onDriverNameChange={setDriverName}
              hoveredTelemetryIndex={null}
              summary={telemetry}
            />
          </div>
        )}

        {activeWorkspaceTab === "analytics" && (
          <section className="space-y-6 transition-all duration-500 animate-fadeIn rounded-[28px] border border-slate-800/70 bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_26%),linear-gradient(180deg,rgba(15,23,42,0.82),rgba(2,6,23,0.92))] p-5 shadow-2xl">
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-end border-b border-slate-800/80 pb-5">
              <div className="xl:col-span-12">
                <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-300">Race Analytics</span>
                <h2 className="mt-2 text-2xl md:text-3xl font-black tracking-tight text-white uppercase">Telemetry and engineering review</h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-slate-300">
                  The analytics workspace separates hard telemetry from the race-engineer interpretation. Start with the verdict after simulation, then move into the detailed plots when you want to inspect the lap more closely.
                </p>
              </div>
            </div>

            {!telemetry ? (
              <div className="rounded-2xl border border-dashed border-slate-800 bg-slate-950/40 p-12 text-center text-slate-400">
                <Gauge className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                <p className="text-sm font-mono uppercase tracking-[0.2em]">Run a scan first</p>
                <p className="mt-2 text-sm text-slate-500 max-w-xl mx-auto">
                  Complete the scan workflow to populate telemetry plots and the race engineer verdict.
                </p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Lap</span>
                    <span className="mt-1 block text-xl font-black tracking-tight text-white">{telemetry.lapTime.toFixed(2)}s</span>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Avg Speed</span>
                    <span className="mt-1 block text-xl font-black tracking-tight text-white">{telemetry.avgSpeed.toFixed(0)} km/h</span>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Peak G</span>
                    <span className="mt-1 block text-xl font-black tracking-tight text-white">{telemetry.maxG}G</span>
                  </div>
                  <div className="rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-3">
                    <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Throttle</span>
                    <span className="mt-1 block text-xl font-black tracking-tight text-white">{telemetry.throttleRatio}%</span>
                  </div>
                </div>

                {activeAnalyticsTab === "plots" && (
                  <div className="space-y-6">
                    <div className="flex justify-end">
                      <button
                        onClick={() => setActiveAnalyticsTab("verdict")}
                        className="rounded-xl border border-rose-400/30 bg-rose-600 px-4 py-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white transition hover:bg-rose-500"
                      >
                        Race Engineer Verdict
                      </button>
                    </div>
                    <div className="rounded-2xl border border-slate-800/80 bg-[linear-gradient(180deg,rgba(2,6,23,0.74),rgba(15,23,42,0.88))] p-5 shadow-xl lg:sticky lg:top-4 z-10">
                      <div className="mb-4 text-center">
                        <div className="flex items-center justify-center gap-2 mb-1.5">
                          <Flag className="w-3.5 h-3.5 text-rose-500" />
                          <span className="text-[10px] font-mono uppercase tracking-wider text-slate-300">
                            Mini Track
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-sans leading-relaxed max-w-2xl mx-auto">
                          Hover the telemetry plots to move the red tracking dot and see exactly which part of the circuit each reading refers to.
                        </p>
                      </div>

                      <div className="min-h-[360px] relative rounded-2xl overflow-hidden flex items-center justify-center">
                        <div className="flex w-full max-w-[860px] flex-col items-center justify-center gap-4 lg:flex-row lg:items-stretch lg:justify-center">
                          <RacetrackMinimap
                            track={activeTrackObj}
                            summary={telemetry}
                            hoveredDistance={hoveredTelemetryDistance}
                            className="min-h-[360px] w-full max-w-[520px] mx-auto lg:mx-0"
                          />
                          <div className="grid gap-2 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-4 text-left shadow-xl lg:min-w-[240px] lg:self-center">
                            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-100">
                              <span className="h-0 w-10 rounded-full border-t-[4px] border-emerald-500" />
                              <span>Optimal racing line</span>
                            </div>
                            <div className="flex items-center gap-2.5 text-sm font-medium text-slate-100">
                              <span className="h-0 w-10 rounded-full border-t-[4px] border-sky-400" />
                              <span>Your extracted racing line</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.92),rgba(2,6,23,0.96))] p-5 shadow-xl h-full flex flex-col justify-between">
                      <div>
                        <div className="flex items-center justify-between mb-4 border-b border-slate-800 pb-3">
                          <div className="flex items-center gap-2">
                            <Gauge className="w-4 h-4 text-rose-500" />
                            <h3 className="font-sans font-bold tracking-tight text-xs uppercase text-slate-200">
                              Velocity Profile and Active Handling
                            </h3>
                          </div>
                          <span className="text-[9px] font-mono text-slate-500 uppercase bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
                            Hover-linked telemetry
                          </span>
                        </div>

                        <TelemetryPlots
                          summary={telemetry}
                          track={activeTrackObj}
                          onHoverDistanceChange={setHoveredTelemetryDistance}
                          stacked={true}
                        />
                      </div>
                    </div>
                  </div>
                )}

                {activeAnalyticsTab === "verdict" && (
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
                    <div className="lg:col-span-8 rounded-[26px] border border-slate-800 bg-[linear-gradient(180deg,rgba(15,23,42,0.96),rgba(2,6,23,0.98))] p-6 shadow-xl text-white flex flex-col justify-between">
                      <div className="w-full">
                        <div className="flex items-center justify-between mb-4 border-b border-slate-800/85 pb-3">
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

                        <div className="mb-5 rounded-2xl border border-rose-500/15 bg-rose-500/5 px-4 py-3">
                          <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-rose-300">Engineer Brief</span>
                          <p className="mt-1 text-sm leading-relaxed text-slate-300">
                            This view is for the narrative readout: what the lap did well, where time was lost, and what the next correction should be.
                          </p>
                        </div>

                        {isCoachingLoading ? (
                          <div className="py-16 text-center text-slate-400 space-y-3 font-mono text-xs">
                            <RefreshCw className="w-6 h-6 text-cyan-400 animate-spin mx-auto" />
                            <span className="block animate-pulse uppercase tracking-wider text-[10px] text-slate-500">
                              Parsing racing lines...
                            </span>
                          </div>
                        ) : (
                          <div id="coaching_container" className="max-w-none select-text max-h-[460px] overflow-y-auto pr-2">
                            {coachingText ? (
                              <div className="grid gap-4 md:grid-cols-2">
                                {parseCoachingCards(coachingText).map((card) => (
                                  <article
                                    key={card.title}
                                    className="rounded-2xl border border-slate-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.72),rgba(15,23,42,0.9))] px-5 py-4 shadow-lg"
                                  >
                                    <span className="block text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-300">
                                      {card.title}
                                    </span>
                                    <div className="mt-3 text-lg font-semibold leading-8 text-white">
                                      {renderInlineMarkdown(card.body)}
                                    </div>
                                  </article>
                                ))}
                              </div>
                            ) : (
                              <p className="text-xs font-mono text-slate-500 italic">No feedback payload received.</p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="lg:col-span-4 rounded-[26px] border border-slate-800 bg-[linear-gradient(180deg,rgba(2,6,23,0.9),rgba(15,23,42,0.96))] p-5 shadow-xl text-white flex flex-col gap-5">
                      <div>
                        <span className="text-[10px] font-mono uppercase tracking-[0.24em] text-cyan-300">Session Snapshot</span>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                            <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Lap Time</span>
                            <span className="mt-2 block text-xl font-black tracking-tight text-white">{telemetry.lapTime.toFixed(2)}s</span>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                            <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Max G</span>
                            <span className="mt-2 block text-xl font-black tracking-tight text-white">{telemetry.maxG}G</span>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                            <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Avg Speed</span>
                            <span className="mt-2 block text-xl font-black tracking-tight text-white">{telemetry.avgSpeed} km/h</span>
                          </div>
                          <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-3">
                            <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Throttle</span>
                            <span className="mt-2 block text-xl font-black tracking-tight text-white">{telemetry.throttleRatio}%</span>
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-cyan-500/15 bg-cyan-500/5 px-4 py-3">
                        <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300">Next Action</span>
                        <p className="mt-1 text-sm leading-relaxed text-slate-300">
                          Review the verdict, save the lap if the run is representative, then return to the scan tab if you want to retry extraction or fine-tune the line.
                        </p>
                        <button
                          onClick={() => setActiveAnalyticsTab("plots")}
                          className="mt-3 w-full rounded-lg border border-rose-400/30 bg-rose-600 text-white font-bold px-3 py-2 text-[11px] uppercase tracking-[0.18em] transition hover:bg-rose-500"
                        >
                          Race Analytics
                        </button>
                      </div>

                      <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-4">
                        <span className="text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300 block">Report Export</span>
                        <p className="mt-1 text-sm leading-relaxed text-slate-300">
                          Open an interactive HTML report containing the captured track, hover-linked telemetry, mini track, and the race engineer verdict. The HTML file is also downloaded to your local machine when you open it.
                        </p>
                        <button
                          onClick={handleCreatePdfReport}
                          disabled={!telemetry || isCoachingLoading}
                          className="mt-3 w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold p-2.5 rounded-lg text-xs font-sans uppercase tracking-wider transition disabled:opacity-50 cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          Open Interactive Report
                        </button>
                      </div>

                      <div className="border-t border-slate-800 pt-4">
                        <span className="text-[11px] font-bold font-sans tracking-tight block text-white uppercase mb-2">
                          Driver Session
                        </span>

                        <div className="rounded-2xl border border-slate-800 bg-slate-950/60 p-3">
                          <span className="block text-[10px] font-mono uppercase tracking-[0.2em] text-slate-500">Driver</span>
                          <span className="mt-2 block text-lg font-black tracking-tight text-white">
                            {driverName.trim() || "Not set yet"}
                          </span>
                          <div className="mt-3 bg-emerald-950/40 border border-emerald-500/20 p-2.5 rounded-lg text-emerald-400 text-[10px] flex items-center gap-1.5">
                            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            <span>{hasSubmittedThisLap ? "Latest lap recorded automatically." : "Lap records save automatically after simulation."}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {activeWorkspaceTab === "leaderboard" && (
          <section className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
                <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Best Lap</span>
                <span className="mt-2 block text-3xl font-black tracking-tight text-white">
                  {bestLapEntry ? `${bestLapEntry.lapTime.toFixed(2)}s` : "--"}
                </span>
                <span className="mt-1 block text-xs text-slate-400">
                  {bestLapEntry ? `Current P1 is ${bestLapEntry.name}` : "No leaderboard entries yet"}
                </span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
                <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Entries</span>
                <span className="mt-2 block text-3xl font-black tracking-tight text-white">{circuitLeaderboard.length}</span>
                <span className="mt-1 block text-xs text-slate-400">Recorded Silverstone laps</span>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl">
                <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-slate-500">Latest Telemetry</span>
                <span className="mt-2 block text-3xl font-black tracking-tight text-white">
                  {telemetry ? `${telemetry.lapTime.toFixed(2)}s` : "--"}
                </span>
                <span className="mt-1 block text-xs text-slate-400">Most recent analyzed lap</span>
              </div>
            </div>

            <Leaderboard entries={leaderboard} currentTrackId={activeTrackId} />
          </section>
        )}
      </main>

      {/* 4. FOOTER */}
      <footer className="bg-slate-900 border-t border-slate-850 border-slate-800 text-slate-500 text-xs py-6 px-6 mt-12">
        <div className="max-w-7xl mx-auto flex flex-col items-center gap-2 text-center font-mono">
          <div>
            <p>F1 Paper Track Vision System</p>
            <p className="text-[10px] text-slate-600 mt-1 uppercase tracking-widest">
              Engineered with physical friction limits & Generative AI co-driving
            </p>
          </div>
        </div>
      </footer>

    </div>
  );
}
