import { TelemetrySummary } from "../physicsEngine";
import { buildDriverProxyAnalysis, DriverProxyMetric } from "../driverProxies";
import { Track } from "../tracksData";

interface RaceReportOptions {
  track: Track;
  summary: TelemetrySummary;
  coachingText: string;
  reportTrackImage?: string;
  sourceImage?: string;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatLapTime(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds - minutes * 60;
  return `${minutes}:${remainingSeconds.toFixed(2).padStart(5, "0")}`;
}

function jsonForScript(value: unknown) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split("\n");
  const html: string[] = [];
  let inList = false;

  const closeList = () => {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  };

  const renderInline = (line: string) => {
    return escapeHtml(line)
      .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/g, "<em>$1</em>")
      .replace(/`(.*?)`/g, "<code>$1</code>");
  };

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      closeList();
      return;
    }
    if (line.startsWith("### ")) {
      closeList();
      html.push(`<h3>${renderInline(line.slice(4))}</h3>`);
      return;
    }
    if (line.startsWith("## ")) {
      closeList();
      html.push(`<h2>${renderInline(line.slice(3))}</h2>`);
      return;
    }
    if (line.startsWith("# ")) {
      closeList();
      html.push(`<h1>${renderInline(line.slice(2))}</h1>`);
      return;
    }
    if (line.startsWith("> ")) {
      closeList();
      html.push(`<blockquote>${renderInline(line.slice(2))}</blockquote>`);
      return;
    }
    if (/^[-*]\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(line.replace(/^[-*]\s+/, ""))}</li>`);
      return;
    }
    if (/^\d+\.\s+/.test(line)) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(line.replace(/^\d+\.\s+/, ""))}</li>`);
      return;
    }
    html.push(`<p>${renderInline(line)}</p>`);
  });

  closeList();
  return html.join("");
}

function renderConceptMetrics(summary: TelemetrySummary) {
  const metrics = buildDriverProxyAnalysis(summary).metrics;
  if (!metrics.length) {
    return "";
  }

  return `
    <div class="panel concept-panel">
      <h2>Driver Dynamics Proxies</h2>
      <div class="concept-grid">
        ${metrics
          .map(
            (metric: DriverProxyMetric) => `
              <div class="concept-card ${metric.tone}">
                <span>${escapeHtml(metric.label)}</span>
                <strong>${escapeHtml(metric.value)}</strong>
                <p>${escapeHtml(metric.detail)}</p>
              </div>
            `
          )
          .join("")}
      </div>
    </div>
  `;
}

export function openRaceReportPdf(options: RaceReportOptions) {
  const { track, summary, coachingText, reportTrackImage, sourceImage } = options;
  const verdictHtml = markdownToHtml(
    coachingText || "## Race Engineer Verdict\nNo verdict payload was available for this session."
  );

  const capturedTrackBlock = reportTrackImage
    ? `<img src="${reportTrackImage}" alt="Captured racing line" class="track-image" />`
    : `<div class="track-image track-placeholder">Captured track preview unavailable</div>`;

  const capturedTrackReviewBlock = `
    <div class="track-review">
      <div class="track-review-head">
        <div>
          <span class="eyebrow">Captured Track</span>
          <h3>Extracted Racing Line</h3>
        </div>
        <div class="track-legend" aria-label="Captured track legend">
          <div class="track-legend-item">
            <span class="track-legend-swatch track-legend-swatch-green"></span>
            <span>Optimal racing line</span>
          </div>
          <div class="track-legend-item">
            <span class="track-legend-swatch track-legend-swatch-blue"></span>
            <span>Your extracted racing line</span>
          </div>
        </div>
      </div>
      <div class="track-review-image-wrap">
        ${capturedTrackBlock}
      </div>
    </div>
  `;

  const uploadedSourceBlock = sourceImage
    ? `
      <div class="panel source-panel">
        <span class="eyebrow">Source Capture</span>
        <img src="${sourceImage}" alt="Source uploaded track" class="track-image source-image" />
      </div>
    `
    : "";

  const panelGridClassName = uploadedSourceBlock ? "panel-grid" : "panel-grid panel-grid-single";

  const reportHtml = `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>${escapeHtml(track.name)} Interactive Report</title>
        <style>
          @import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Sora:wght@400;500;600;700;800&display=swap");

          :root {
            color-scheme: dark;
            --bg: #020617;
            --bg-panel: linear-gradient(180deg, rgba(15,23,42,0.95), rgba(2,6,23,0.98));
            --border: rgba(148,163,184,0.16);
            --muted: #94a3b8;
            --text: #e2e8f0;
            --heading: #ffffff;
            --accent: #22d3ee;
          }
          * {
            box-sizing: border-box;
          }
          body {
            margin: 0;
            background:
              radial-gradient(circle at top, rgba(34,211,238,0.08), transparent 28%),
              radial-gradient(circle at 80% 20%, rgba(244,63,94,0.08), transparent 24%),
              var(--bg);
            color: var(--text);
            font-family: "Manrope", system-ui, sans-serif;
          }
          .report {
            max-width: 1380px;
            margin: 0 auto;
            padding: 28px;
          }
          .actions {
            position: sticky;
            top: 0;
            z-index: 10;
            display: flex;
            justify-content: flex-end;
            gap: 10px;
            margin-bottom: 18px;
            padding-top: 8px;
          }
          .actions button {
            border: 0;
            border-radius: 999px;
            padding: 10px 16px;
            font-weight: 700;
            cursor: pointer;
          }
          .primary-action {
            background: var(--accent);
            color: #082f49;
          }
          .secondary-action {
            background: rgba(15,23,42,0.9);
            color: var(--text);
            border: 1px solid #334155;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            margin-bottom: 22px;
          }
          .eyebrow {
            display: block;
            font-size: 11px;
            letter-spacing: 0.2em;
            text-transform: uppercase;
            color: #67e8f9;
            margin-bottom: 6px;
            font-weight: 700;
          }
          h1 {
            margin: 0;
            font-family: "Sora", sans-serif;
            font-size: 34px;
            color: var(--heading);
            text-transform: uppercase;
            font-style: italic;
            font-weight: 600;
            letter-spacing: -0.05em;
            line-height: 0.92;
          }
          h2 {
            margin: 0 0 14px;
            color: var(--heading);
            font-size: 18px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .subhead {
            color: var(--muted);
            margin-top: 8px;
            max-width: 760px;
            font-size: 13px;
            line-height: 1.6;
          }
          .stamp {
            border: 1px solid var(--border);
            background: rgba(15,23,42,0.9);
            border-radius: 18px;
            padding: 14px 16px;
            min-width: 200px;
          }
          .stamp strong {
            color: white;
            display: block;
            font-size: 18px;
            margin-top: 8px;
          }
          .metrics {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 12px;
            margin: 18px 0 22px;
          }
          .metric {
            background: linear-gradient(180deg, rgba(15,23,42,0.96), rgba(2,6,23,0.94));
            border: 1px solid var(--border);
            border-radius: 18px;
            padding: 14px;
          }
          .metric label {
            display: block;
            color: var(--muted);
            font-size: 10px;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            margin-bottom: 8px;
          }
          .metric strong {
            font-size: 22px;
            color: white;
          }
          .panel-grid {
            display: grid;
            grid-template-columns: 1.05fr 0.95fr;
            gap: 18px;
            align-items: start;
          }
          .panel-grid-single {
            grid-template-columns: 1fr;
          }
          .interactive-grid {
            display: grid;
            grid-template-columns: 0.88fr 1.12fr;
            gap: 18px;
            align-items: start;
            margin-top: 18px;
          }
          .panel {
            background: var(--bg-panel);
            border: 1px solid var(--border);
            border-radius: 24px;
            padding: 18px;
          }
          .track-image {
            width: 100%;
            border-radius: 18px;
            border: 1px solid #334155;
            background: #020617;
            object-fit: contain;
          }
          .track-placeholder {
            min-height: 320px;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #64748b;
          }
          .source-panel {
            margin-top: 18px;
          }
          .source-image {
            max-height: 260px;
          }
          .track-review {
            margin-top: 18px;
            padding-top: 16px;
            border-top: 1px solid rgba(148,163,184,0.14);
          }
          .track-review-head {
            display: flex;
            justify-content: space-between;
            gap: 16px;
            align-items: flex-start;
            margin-bottom: 12px;
          }
          .track-review-head h3 {
            margin: 0;
            color: white;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.08em;
          }
          .track-review-image-wrap {
            max-width: 420px;
          }
          .track-review .track-image {
            max-height: 250px;
          }
          .track-review .track-placeholder {
            min-height: 220px;
          }
          .track-legend {
            display: grid;
            gap: 8px;
            min-width: 200px;
          }
          .track-legend-item {
            display: flex;
            align-items: center;
            gap: 10px;
            color: #cbd5e1;
            font-size: 12px;
            line-height: 1.4;
          }
          .track-legend-swatch {
            width: 34px;
            height: 0;
            border-top-width: 4px;
            border-top-style: solid;
            border-radius: 999px;
            flex: 0 0 auto;
          }
          .track-legend-swatch-green {
            border-top-color: #22c55e;
            box-shadow: 0 0 0 1px rgba(34,197,94,0.18);
          }
          .track-legend-swatch-blue {
            border-top-color: #60a5fa;
            box-shadow: 0 0 0 1px rgba(96,165,250,0.16);
          }
          .mini-track-wrap {
            border-radius: 22px;
            background: rgba(2,6,23,0.68);
            border: 1px solid rgba(148,163,184,0.14);
            padding: 12px;
          }
          .mini-track-svg {
            width: 100%;
            height: auto;
            display: block;
          }
          .readout-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
            margin-top: 14px;
          }
          .readout {
            border-radius: 16px;
            padding: 12px;
            background: rgba(15,23,42,0.72);
            border: 1px solid rgba(148,163,184,0.14);
          }
          .readout span {
            display: block;
            color: var(--muted);
            font-size: 10px;
            letter-spacing: 0.15em;
            text-transform: uppercase;
            margin-bottom: 6px;
          }
          .readout strong {
            color: white;
            font-size: 20px;
          }
          .chart-grid {
            display: grid;
            gap: 16px;
          }
          .chart-card {
            background: rgba(2,6,23,0.52);
            border: 1px solid rgba(148,163,184,0.14);
            border-radius: 22px;
            padding: 16px;
          }
          .chart-head {
            display: flex;
            justify-content: space-between;
            align-items: center;
            color: white;
            font-size: 13px;
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: 0.08em;
            margin-bottom: 10px;
          }
          .chart-note {
            color: var(--muted);
            margin: 0 0 12px;
            font-size: 12px;
            line-height: 1.5;
          }
          .chart-svg {
            width: 100%;
            height: auto;
            display: block;
          }
          .verdict {
            margin-top: 8px;
          }
          .verdict h1, .verdict h2, .verdict h3 {
            color: white;
            margin: 16px 0 8px;
            text-transform: uppercase;
            letter-spacing: 0.06em;
          }
          .verdict h1 { font-size: 18px; }
          .verdict h2 { font-size: 16px; }
          .verdict h3 { font-size: 14px; }
          .verdict p, .verdict li {
            font-size: 13px;
            line-height: 1.65;
            color: #cbd5e1;
          }
          .verdict ul {
            margin: 8px 0 0;
            padding-left: 18px;
          }
          .verdict blockquote {
            margin: 12px 0;
            padding: 12px 14px;
            border-left: 4px solid #f43f5e;
            background: rgba(244,63,94,0.08);
            border-radius: 0 14px 14px 0;
            color: #fecdd3;
          }
          .verdict code {
            background: #020617;
            border: 1px solid #1e293b;
            border-radius: 6px;
            padding: 1px 5px;
            color: #fda4af;
          }
          .concept-panel {
            margin-top: 18px;
          }
          .concept-note, .concept-footnote {
            margin: 0 0 16px;
            color: var(--muted);
            font-size: 13px;
            line-height: 1.6;
          }
          .concept-footnote {
            margin-top: 16px;
          }
          .concept-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
            gap: 14px;
          }
          .concept-card {
            border-radius: 18px;
            border: 1px solid rgba(148,163,184,0.16);
            background: rgba(2,6,23,0.62);
            padding: 16px;
          }
          .concept-card span {
            display: block;
            color: var(--muted);
            font-size: 11px;
            letter-spacing: 0.14em;
            text-transform: uppercase;
            margin-bottom: 10px;
          }
          .concept-card strong {
            display: block;
            color: white;
            font-size: 24px;
            margin-bottom: 8px;
          }
          .concept-card p {
            margin: 0;
            font-size: 12px;
            line-height: 1.6;
            color: #cbd5e1;
          }
          .concept-card.good {
            border-color: rgba(34,197,94,0.28);
          }
          .concept-card.warn {
            border-color: rgba(244,63,94,0.28);
          }
          @media (max-width: 980px) {
            .header,
            .panel-grid,
            .interactive-grid,
            .metrics {
              grid-template-columns: 1fr;
            }
            .track-review-head {
              flex-direction: column;
            }
            .track-legend {
              min-width: 0;
            }
            .stamp {
              min-width: 0;
            }
          }
          @media print {
            .actions {
              display: none !important;
            }
          }
        </style>
      </head>
      <body>
        <div class="report">
          <div class="actions">
            <button class="secondary-action" onclick="window.close()">Close</button>
          </div>

          <div class="header">
            <div>
              <span class="eyebrow">${escapeHtml(track.name)} Interactive Report</span>
              <h1>Formula 1 Paper Track Vision System</h1>
              <p class="subhead">Interactive HTML report with hover-linked telemetry, mini-track position, captured racing line, and the race-engineer verdict.</p>
            </div>
            <div class="stamp">
              <span class="eyebrow">Session Summary</span>
              <strong>${formatLapTime(summary.lapTime)}</strong>
              <span style="color:#94a3b8;font-size:12px;">Generated ${new Date().toLocaleString()}</span>
            </div>
          </div>

          <div class="metrics">
            <div class="metric"><label>Lap Time</label><strong>${summary.lapTime.toFixed(2)}s</strong></div>
            <div class="metric"><label>Average Speed</label><strong>${summary.avgSpeed.toFixed(0)} km/h</strong></div>
            <div class="metric"><label>Peak G</label><strong>${summary.maxG.toFixed(2)}G</strong></div>
            <div class="metric"><label>Throttle Ratio</label><strong>${summary.throttleRatio.toFixed(0)}%</strong></div>
          </div>

          <div class="${panelGridClassName}">
            ${uploadedSourceBlock ? `<div>${uploadedSourceBlock}</div>` : ""}
            <div class="panel">
              <span class="eyebrow">Race Engineer Verdict</span>
              <h2>Session Briefing</h2>
              <div class="verdict">${verdictHtml}</div>
              ${capturedTrackReviewBlock}
            </div>
          </div>

          <div class="interactive-grid">
            <div class="panel">
              <span class="eyebrow">Live Circuit Position</span>
              <h2>Hover-Linked Mini Track</h2>
              <div class="mini-track-wrap">
                <svg id="miniTrack" viewBox="0 0 420 420" class="mini-track-svg" role="img" aria-label="Mini track showing current telemetry position"></svg>
              </div>
              <div class="readout-grid">
                <div class="readout"><span>Distance</span><strong id="readoutDistance">0 m</strong></div>
                <div class="readout"><span>Speed</span><strong id="readoutSpeed">0 km/h</strong></div>
                <div class="readout"><span>Target Speed</span><strong id="readoutTarget">0 km/h</strong></div>
                <div class="readout"><span>Lateral G</span><strong id="readoutLateral">0.00G</strong></div>
                <div class="readout"><span>Accel / Brake</span><strong id="readoutAccel">0.00G</strong></div>
                <div class="readout"><span>Throttle</span><strong id="readoutThrottle">0%</strong></div>
              </div>
            </div>

            <div class="panel">
              <span class="eyebrow">Interactive Telemetry</span>
              <h2>Hover Any Plot</h2>
              <p class="chart-note">Move across either chart to scrub through the lap. The red dot on the mini track updates to the matching circuit position.</p>
              <div class="chart-grid">
                <div class="chart-card">
                  <div class="chart-head">
                    <span>Velocity Profile</span>
                    <span>km/h</span>
                  </div>
                  <svg id="speedChart" viewBox="0 0 720 220" class="chart-svg" role="img" aria-label="Interactive velocity profile chart"></svg>
                </div>
                <div class="chart-card">
                  <div class="chart-head">
                    <span>Active Handling</span>
                    <span>G</span>
                  </div>
                  <svg id="handlingChart" viewBox="0 0 720 220" class="chart-svg" role="img" aria-label="Interactive handling forces chart"></svg>
                </div>
              </div>
            </div>
          </div>

          ${renderConceptMetrics(summary)}
        </div>

        <script>
          const telemetryPoints = ${jsonForScript(summary.points)};

          const miniTrackSvg = document.getElementById("miniTrack");
          const speedChartSvg = document.getElementById("speedChart");
          const handlingChartSvg = document.getElementById("handlingChart");

          const readoutDistance = document.getElementById("readoutDistance");
          const readoutSpeed = document.getElementById("readoutSpeed");
          const readoutTarget = document.getElementById("readoutTarget");
          const readoutLateral = document.getElementById("readoutLateral");
          const readoutAccel = document.getElementById("readoutAccel");
          const readoutThrottle = document.getElementById("readoutThrottle");

          const chartWidth = 720;
          const chartHeight = 220;
          const chartPadding = 24;
          let focusedIndex = 0;
          const cachedTrackBounds = computeTrackBounds();

          function clampValue(value, min, max) {
            return Math.min(max, Math.max(min, value));
          }

          function buildScale(values) {
            const min = Math.min.apply(null, values);
            const max = Math.max.apply(null, values);
            return {
              min: min,
              max: max,
              range: max - min || 1
            };
          }

          function chartY(value, scale) {
            return chartHeight - chartPadding - ((value - scale.min) / scale.range) * (chartHeight - chartPadding * 2);
          }

          function chartX(index) {
            const pointCount = Math.max(1, telemetryPoints.length - 1);
            return chartPadding + (index / pointCount) * (chartWidth - chartPadding * 2);
          }

          function buildChartPath(values, scale) {
            return values
              .map(function(value, index) {
                return (index === 0 ? "M" : "L") + chartX(index).toFixed(1) + "," + chartY(value, scale).toFixed(1);
              })
              .join(" ");
          }

          function computeTrackBounds() {
            const xs = telemetryPoints.map(function(point) { return point.x; });
            const ys = telemetryPoints.map(function(point) { return point.y; });
            const minX = Math.min.apply(null, xs);
            const maxX = Math.max.apply(null, xs);
            const minY = Math.min.apply(null, ys);
            const maxY = Math.max.apply(null, ys);
            return {
              minX: minX,
              maxX: maxX,
              minY: minY,
              maxY: maxY,
              width: Math.max(1, maxX - minX),
              height: Math.max(1, maxY - minY)
            };
          }

          function projectTrackPoint(point, bounds) {
            const pad = 28;
            const inner = 420 - pad * 2;
            const scale = inner / Math.max(bounds.width, bounds.height);
            const offsetX = (inner - bounds.width * scale) / 2;
            const offsetY = (inner - bounds.height * scale) / 2;
            return {
              x: pad + offsetX + (point.x - bounds.minX) * scale,
              y: 420 - (pad + offsetY + (point.y - bounds.minY) * scale)
            };
          }

          const speedScale = buildScale(
            telemetryPoints.map(function(point) { return point.speed; }).concat(
              telemetryPoints.map(function(point) { return point.targetSpeed; })
            )
          );

          const handlingScale = buildScale(
            telemetryPoints.map(function(point) { return point.lateralG; }).concat(
              telemetryPoints.map(function(point) { return point.accelG; })
            )
          );

          function renderMiniTrack() {
            const path = telemetryPoints
              .map(function(point, index) {
                const projected = projectTrackPoint(point, cachedTrackBounds);
                return (index === 0 ? "M" : "L") + projected.x.toFixed(1) + "," + projected.y.toFixed(1);
              })
              .join(" ") + " Z";

            miniTrackSvg.innerHTML = ""
              + '<rect x="0" y="0" width="420" height="420" rx="26" fill="#08101f"></rect>'
              + '<path d="' + path + '" fill="none" stroke="rgba(96,165,250,0.24)" stroke-width="18" stroke-linecap="round" stroke-linejoin="round"></path>'
              + '<path d="' + path + '" fill="none" stroke="#60a5fa" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"></path>'
              + '<circle id="miniTrackDotGlow" cx="0" cy="0" r="12" fill="rgba(244,63,94,0.22)"></circle>'
              + '<circle id="miniTrackDot" cx="0" cy="0" r="6" fill="#f43f5e" stroke="#ffffff" stroke-width="2"></circle>';
          }

          function renderCharts() {
            const speedPath = buildChartPath(
              telemetryPoints.map(function(point) { return point.speed; }),
              speedScale
            );
            const targetSpeedPath = buildChartPath(
              telemetryPoints.map(function(point) { return point.targetSpeed; }),
              speedScale
            );
            const lateralPath = buildChartPath(
              telemetryPoints.map(function(point) { return point.lateralG; }),
              handlingScale
            );
            const accelPath = buildChartPath(
              telemetryPoints.map(function(point) { return point.accelG; }),
              handlingScale
            );

            speedChartSvg.innerHTML = ""
              + '<rect x="0" y="0" width="720" height="220" rx="18" fill="#08101f"></rect>'
              + '<path d="' + targetSpeedPath + '" fill="none" stroke="#22d3ee" stroke-width="3" stroke-dasharray="8 8" opacity="0.85"></path>'
              + '<path d="' + speedPath + '" fill="none" stroke="#ffffff" stroke-width="4"></path>'
              + '<line id="speedHoverLine" x1="0" y1="24" x2="0" y2="196" stroke="rgba(244,63,94,0.9)" stroke-width="2" stroke-dasharray="5 5"></line>'
              + '<circle id="speedHoverDot" cx="0" cy="0" r="6" fill="#f43f5e" stroke="#ffffff" stroke-width="2"></circle>'
              + '<rect x="0" y="0" width="720" height="220" fill="transparent"></rect>';

            handlingChartSvg.innerHTML = ""
              + '<rect x="0" y="0" width="720" height="220" rx="18" fill="#08101f"></rect>'
              + '<path d="' + lateralPath + '" fill="none" stroke="#06b6d4" stroke-width="4"></path>'
              + '<path d="' + accelPath + '" fill="none" stroke="#a855f7" stroke-width="4"></path>'
              + '<line id="handlingHoverLine" x1="0" y1="24" x2="0" y2="196" stroke="rgba(244,63,94,0.9)" stroke-width="2" stroke-dasharray="5 5"></line>'
              + '<circle id="handlingLateralDot" cx="0" cy="0" r="6" fill="#06b6d4" stroke="#ffffff" stroke-width="2"></circle>'
              + '<circle id="handlingAccelDot" cx="0" cy="0" r="6" fill="#a855f7" stroke="#ffffff" stroke-width="2"></circle>'
              + '<rect x="0" y="0" width="720" height="220" fill="transparent"></rect>';
          }

          function updateReadout(point) {
            readoutDistance.textContent = Math.round(point.s) + " m";
            readoutSpeed.textContent = point.speed.toFixed(0) + " km/h";
            readoutTarget.textContent = point.targetSpeed.toFixed(0) + " km/h";
            readoutLateral.textContent = point.lateralG.toFixed(2) + "G";
            readoutAccel.textContent = point.accelG.toFixed(2) + "G";
            readoutThrottle.textContent = Math.round(point.throttle) + "%";
          }

          function updateFocus(index) {
            focusedIndex = clampValue(index, 0, telemetryPoints.length - 1);
            const point = telemetryPoints[focusedIndex];
            const trackPoint = projectTrackPoint(point, cachedTrackBounds);

            const miniTrackDot = document.getElementById("miniTrackDot");
            const miniTrackDotGlow = document.getElementById("miniTrackDotGlow");
            if (miniTrackDot && miniTrackDotGlow) {
              miniTrackDot.setAttribute("cx", trackPoint.x.toFixed(1));
              miniTrackDot.setAttribute("cy", trackPoint.y.toFixed(1));
              miniTrackDotGlow.setAttribute("cx", trackPoint.x.toFixed(1));
              miniTrackDotGlow.setAttribute("cy", trackPoint.y.toFixed(1));
            }

            const x = chartX(focusedIndex).toFixed(1);
            const speedY = chartY(point.speed, speedScale).toFixed(1);
            const lateralY = chartY(point.lateralG, handlingScale).toFixed(1);
            const accelY = chartY(point.accelG, handlingScale).toFixed(1);

            const speedHoverLine = document.getElementById("speedHoverLine");
            const speedHoverDot = document.getElementById("speedHoverDot");
            const handlingHoverLine = document.getElementById("handlingHoverLine");
            const handlingLateralDot = document.getElementById("handlingLateralDot");
            const handlingAccelDot = document.getElementById("handlingAccelDot");

            if (speedHoverLine && speedHoverDot) {
              speedHoverLine.setAttribute("x1", x);
              speedHoverLine.setAttribute("x2", x);
              speedHoverDot.setAttribute("cx", x);
              speedHoverDot.setAttribute("cy", speedY);
            }
            if (handlingHoverLine && handlingLateralDot && handlingAccelDot) {
              handlingHoverLine.setAttribute("x1", x);
              handlingHoverLine.setAttribute("x2", x);
              handlingLateralDot.setAttribute("cx", x);
              handlingLateralDot.setAttribute("cy", lateralY);
              handlingAccelDot.setAttribute("cx", x);
              handlingAccelDot.setAttribute("cy", accelY);
            }

            updateReadout(point);
          }

          function bindHover(svg) {
            svg.addEventListener("mousemove", function(event) {
              const rect = svg.getBoundingClientRect();
              const relativeX = ((event.clientX - rect.left) / rect.width) * chartWidth;
              const clampedX = clampValue(relativeX, chartPadding, chartWidth - chartPadding);
              const ratio = (clampedX - chartPadding) / Math.max(1, chartWidth - chartPadding * 2);
              const index = Math.round(ratio * Math.max(0, telemetryPoints.length - 1));
              updateFocus(index);
            });
          }

          renderMiniTrack();
          renderCharts();
          bindHover(speedChartSvg);
          bindHover(handlingChartSvg);
          updateFocus(0);
        </script>
      </body>
    </html>
  `;

  try {
    const reportBlob = new Blob([reportHtml], { type: "text/html;charset=utf-8" });
    const reportUrl = URL.createObjectURL(reportBlob);
    const filename = `${track.id}-interactive-report.html`;

    const downloadLink = document.createElement("a");
    downloadLink.href = reportUrl;
    downloadLink.download = filename;
    downloadLink.style.display = "none";
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);

    window.open(reportUrl, "_blank");
    window.setTimeout(() => URL.revokeObjectURL(reportUrl), 60_000);
  } catch (error) {
    console.error("Failed to build interactive race report:", error);
    const fallbackWindow = window.open("about:blank", "_blank");
    if (!fallbackWindow) return;
    fallbackWindow.document.open();
    fallbackWindow.document.write(reportHtml);
    fallbackWindow.document.close();
  }
}
