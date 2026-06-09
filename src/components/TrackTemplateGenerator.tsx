import React, { useRef } from "react";
import { Printer, Download, HelpCircle, CheckCircle } from "lucide-react";
import { Track } from "../tracksData";

interface TrackTemplateGeneratorProps {
  track: Track;
}

export default function TrackTemplateGenerator({ track }: TrackTemplateGeneratorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  // Helper to trigger a browser-native download of the SVG file as an image
  const triggerDownloadPNG = () => {
    if (!svgRef.current) return;
    
    const svgElement = svgRef.current;
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const blobURL = URL.createObjectURL(svgBlob);
    
    const image = new Image();
    image.width = 600;
    image.height = 600;
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 600;
      const context = canvas.getContext("2d");
      if (context) {
        // Draw white background
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, 600, 600);
        // Draw SVG image
        context.drawImage(image, 0, 0, 600, 600);
        
        const pngURL = canvas.toDataURL("image/png");
        const downloadLink = document.createElement("a");
        downloadLink.href = pngURL;
        downloadLink.download = `f1_track_template_${track.id}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
      URL.revokeObjectURL(blobURL);
    };
    image.src = blobURL;
  };

  const triggerPrint = () => {
    // Generate a beautiful new window specifically styled for print layout
    const printWindow = window.open("", "_blank");
    if (!printWindow || !svgRef.current) return;

    const svgHtml = svgRef.current.outerHTML;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print F1 Racing Line Template - ${track.name}</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              height: 100vh;
              font-family: system-ui, sans-serif;
              background-color: #ffffff;
            }
            .container {
              width: 195mm;
              height: 195mm;
              border: 1px dashed #ccc;
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: center;
              position: relative;
            }
            svg {
              width: 100%;
              height: 100%;
            }
            .instructions {
              margin-top: 10px;
              text-align: center;
              font-size: 11px;
              color: #555;
              max-width: 500px;
              font-family: monospace;
            }
            @media print {
              .no-print { display: none; }
              body { background: none; }
              .container { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 20px; text-align: center;">
            <p>Ready for high-quality template printing. Use your browser print dialogue (CMD+P or CTRL+P).</p>
            <button onclick="window.print()" style="padding: 10px 20px; font-weight: bold; background: #e11d48; color: white; border: none; border-radius: 6px; cursor: pointer;">
              Click to Open Printer Setup
            </button>
          </div>
          <div class="container">
            ${svgHtml}
          </div>
          <div class="instructions">
            F1 TRACK ANALYSIS TEMPLATE — DO NOT CROP BORDERS OR OBLITERATE CORNER QR LABELS.<br/>
            Task: Sketch your racing line perfectly in <b>solid black ink</b> within the track outlines, then photograph/upload!
          </div>
          <script>
            // Auto trigger printer
            window.addEventListener('load', () => {
              setTimeout(() => { window.print(); }, 500);
            });
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Build racetrack polyline pathway string
  const trackPathString = track.points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ") + " Z";

  return (
    <div id="template_generator_comp" className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-xl">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left Side: Dynamic SVG Preview */}
        <div className="w-full md:w-[320px] shrink-0 flex flex-col items-center">
          <div className="bg-white p-3 rounded-lg border border-slate-700 shadow-inner w-[280px] h-[280px] flex items-center justify-center">
            {/* Template SVG - fully scaleable and standard */}
            <svg
              id="template_svg_draw"
              ref={svgRef}
              width="500"
              height="500"
              viewBox="0 0 500 500"
              className="w-full h-full"
              style={{ backgroundColor: "#ffffff" }}
            >
              {/* Backgrid guide */}
              <defs>
                <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f1f5f9" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="500" height="500" fill="url(#grid)" />

              {/* Borders / Coordinate box */}
              <rect x="5" y="5" width="490" height="490" fill="none" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3 3"/>

              {/* Racetrack Outlines */}
              {/* Width boundary is simulated by thick stroke */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#cbd5e1"
                strokeWidth="24"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              
              {/* Red-White Dynamic Checkerboard Kerb borders (simulated by dashed lines over grey) */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#ef4444"
                strokeWidth="26"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="14 14"
              />
              <path
                d={trackPathString}
                fill="none"
                stroke="#ffffff"
                strokeWidth="26"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray="0 14 14 0"
              />
              
              {/* Racetrack tarmac inner core */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#f1f5f9"
                strokeWidth="20"
                strokeLinecap="round"
                strokeLinejoin="round"
              />

              {/* Center Faint Guideline */}
              <path
                d={trackPathString}
                fill="none"
                stroke="#94a3b8"
                strokeWidth="1.5"
                strokeDasharray="4 6"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.6"
              />

              {/* START / FINISH Line */}
              {(() => {
                const p1 = track.points[0];
                const p2 = track.points[1];
                const dx = p2.x - p1.x;
                const dy = p2.y - p1.y;
                const len = Math.sqrt(dx * dx + dy * dy);
                const nx = -dy / (len || 1);
                const ny = dx / (len || 1);
                const startX1 = p1.x - 12 * nx;
                const startY1 = p1.y - 12 * ny;
                const startX2 = p1.x + 12 * nx;
                const startY2 = p1.y + 12 * ny;
                return (
                  <g>
                    <line x1={startX1} y1={startY1} x2={startX2} y2={startY2} stroke="#0f172a" strokeWidth="4" />
                    <line x1={startX1} y1={startY1} x2={startX2} y2={startY2} stroke="#ffffff" strokeWidth="4" strokeDasharray="2 2" />
                  </g>
                );
              })()}

              {/* THE 4 CORNER FIDUCIAL QR MARKERS */}
              {/* Top Left (M1) */}
              <g transform="translate(10, 10)">
                <rect x="0" y="0" width="40" height="40" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="5" y="5" width="30" height="30" fill="#000000" />
                <rect x="10" y="10" width="20" height="20" fill="#ffffff" />
                <rect x="15" y="15" width="10" height="10" fill="#000000" />
                <text x="20" y="48" fontSize="7" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_TL_0.0</text>
              </g>

              {/* Top Right (M2) */}
              <g transform="translate(450, 10)">
                <rect x="0" y="0" width="40" height="40" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="5" y="5" width="30" height="30" fill="#000000" />
                <rect x="10" y="10" width="20" height="20" fill="#ffffff" />
                <rect x="15" y="15" width="10" height="10" fill="#000000" />
                <text x="20" y="48" fontSize="7" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_TR_500.0</text>
              </g>

              {/* Bottom Left (M3) */}
              <g transform="translate(10, 450)">
                <rect x="0" y="0" width="40" height="40" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="5" y="5" width="30" height="30" fill="#000000" />
                <rect x="10" y="10" width="20" height="20" fill="#ffffff" />
                <rect x="15" y="15" width="10" height="10" fill="#000000" />
                <text x="20" y="-5" fontSize="7" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_BL_0.500</text>
              </g>

              {/* Bottom Right (M4) */}
              <g transform="translate(450, 450)">
                <rect x="0" y="0" width="40" height="40" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="5" y="5" width="30" height="30" fill="#000000" />
                <rect x="10" y="10" width="20" height="20" fill="#ffffff" />
                <rect x="15" y="15" width="10" height="10" fill="#000000" />
                <text x="20" y="-5" fontSize="7" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_BR_500.500</text>
              </g>

              {/* Title Watermark */}
              <text x="250" y="250" fill="#94a3b8" opacity="0.15" fontSize="18" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" transform="rotate(-30 250 250)">
                F1 TELEMETRY CALIBRATION PAPER
              </text>
              <text x="250" y="270" fill="#94a3b8" opacity="0.15" fontSize="12" fontFamily="monospace" textAnchor="middle" transform="rotate(-30 250 250)">
                {track.name.toUpperCase()}
              </text>
            </svg>
          </div>
          <span className="text-[10px] text-slate-400 font-mono mt-2 uppercase tracking-wider">
            High Precision SVG Matrix Map
          </span>
        </div>

        {/* Right Side: Operational Instructions & Actions */}
        <div className="flex-1 flex flex-col justify-between">
          <div>
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block mb-1">
              Phase 0 — Calibration Template
            </span>
            <h2 className="text-xl font-bold font-sans tracking-tight mb-3">
              Generate Printable F1 Track
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed mb-4">
              Our automated computer vision system requires specific fiducial coordinates anchor points near the borders to normalise, de-rotate, and extract racing ink lines cleanly from your camera scans.
            </p>

            <div className="space-y-2.5 mb-5 text-xs text-slate-300">
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Four corner <b>Fiducial QR Targets</b> for precision optical alignment.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Faint racetrack centerline for easy visual offset trace.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Responsive sizing compatible with standard A4 / US Letter paper.</span>
              </div>
            </div>
            
            <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 flex items-start gap-2.5 mb-4 text-xs font-mono text-slate-400">
              <HelpCircle className="w-5 h-5 text-cyan-500 shrink-0 mt-0.5" />
              <div>
                <span className="text-white block font-sans font-bold">Paper-Free Alternative:</span>
                You don't need to print! You can draw the line <b>digitally</b> inside our canvas on any touch screen, or upload any PNG drawing.
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={triggerPrint}
              className="flex items-center gap-2 bg-rose-605 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-lg font-bold text-xs font-sans tracking-wider uppercase transition shadow-md"
            >
              <Printer className="w-4 h-4" />
              Print Template
            </button>
            <button
              onClick={triggerDownloadPNG}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2.5 rounded-lg font-bold text-xs font-sans tracking-wider uppercase transition border border-slate-700"
            >
              <Download className="w-4 h-4" />
              Export PNG File
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
