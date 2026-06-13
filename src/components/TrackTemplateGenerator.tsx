import React, { useRef } from "react";
import { Printer, CheckCircle } from "lucide-react";
import { Track, transformPointForTemplate } from "../tracksData";

interface TrackTemplateGeneratorProps {
  track: Track;
}

export default function TrackTemplateGenerator({ track }: TrackTemplateGeneratorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

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
            @page {
              size: A4 portrait;
              margin: 10mm 15mm 10mm 15mm;
            }
            body {
              margin: 0;
              padding: 0;
              display: flex;
              flex-direction: column;
              align-items: center;
              justify-content: flex-start;
              min-height: 100vh;
              font-family: system-ui, sans-serif;
              background-color: #ffffff;
            }
            .container {
              width: 175mm;
              height: 245mm; /* Precise height to fit comfortably inside A4 printable boundaries alongside text */
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
              margin-top: 8px;
              text-align: center;
              font-size: 10px;
              color: #334155;
              max-width: 500px;
              font-family: monospace;
              line-height: 1.4;
            }
            @media print {
              .no-print { display: none !important; }
              body { 
                background: none; 
                min-height: auto;
                height: auto;
              }
              .container { 
                border: none !important; 
                width: 180mm;
                height: 250mm;
                margin: 0 auto;
              }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="margin-bottom: 20px; text-align: center; padding-top: 15px;">
            <p style="font-size: 14px; color: #334155;">Ready for high-quality template printing. Verified to fit single A4 page without spilling.</p>
            <button onclick="window.print()" style="padding: 12px 24px; font-weight: bold; background: #e11d48; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 13px;">
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

  // Build racetrack polyline pathway string using scaled/centered points to clear all QR markers
  const transformedPoints = track.points.map(transformPointForTemplate);
  const trackPathString = transformedPoints
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
    .join(" ") + " Z";

  return (
    <div id="template_generator_comp" className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-xl">
      <div className="flex flex-col md:flex-row gap-6">
        
        {/* Left Side: Dynamic SVG Preview */}
        <div className="w-full md:w-[320px] shrink-0 flex flex-col items-center">
          <div className="bg-white p-3 rounded-lg border border-slate-700 shadow-inner w-[280px] h-[410px] flex items-center justify-center">
            {/* Template SVG - fully scaleable and standard taller layout */}
            <svg
              id="template_svg_draw"
              ref={svgRef}
              width="500"
              height="750"
              viewBox="0 0 500 750"
              className="w-full h-full"
              style={{ backgroundColor: "#ffffff" }}
            >
              {/* Backgrid guide */}
              <defs>
                <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
                  <path d="M 25 0 L 0 0 0 25" fill="none" stroke="#f1f5f9" strokeWidth="1" />
                </pattern>
              </defs>
              <rect width="500" height="750" fill="url(#grid)" />

              {/* Borders / Coordinate box */}
              <rect x="5" y="5" width="490" height="740" fill="none" stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3"/>

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
                const p1 = transformedPoints[0];
                const p2 = transformedPoints[1];
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

              {/* THE 7 LANDMARK FIDUCIAL QR MARKERS */}
              {/* Top Left (TL) (Centered at 30,30) */}
              <g transform="translate(15, 15)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#000000" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#000000" />
                <text x="15" y="38" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_TL</text>
              </g>

              {/* Top Right (TR) (Centered at 470,30) */}
              <g transform="translate(455, 15)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#000000" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#000000" />
                <text x="15" y="38" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_TR</text>
              </g>

              {/* Mid Left (ML) (Centered at 30,250) */}
              <g transform="translate(15, 235)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#0891b2" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#0891b2" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#0891b2" />
                <text x="15" y="38" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#0891b2" fontWeight="bold">QR_ML</text>
              </g>

              {/* Mid Right (MR) (Centered at 470,250) */}
              <g transform="translate(455, 235)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#0891b2" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#0891b2" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#0891b2" />
                <text x="15" y="38" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#0891b2" fontWeight="bold">QR_MR</text>
              </g>

              {/* Center Align (C) (Centered at 250,250) */}
              <g transform="translate(235, 235)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#ca8a04" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#ca8a04" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#ca8a04" />
                <text x="15" y="-5" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#ca8a04" fontWeight="bold">QR_C</text>
              </g>

              {/* Bottom Left (BL) (Centered at 30,470) */}
              <g transform="translate(15, 455)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#000000" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#000000" />
                <text x="15" y="-5" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_BL</text>
              </g>

              {/* Bottom Right (BR) (Centered at 470,470) */}
              <g transform="translate(455, 455)">
                <rect x="0" y="0" width="30" height="30" fill="#ffffff" stroke="#000000" strokeWidth="2" />
                <rect x="3.75" y="3.75" width="22.5" height="22.5" fill="#000000" />
                <rect x="7.5" y="7.5" width="15" height="15" fill="#ffffff" />
                <rect x="11.25" y="11.25" width="7.5" height="7.5" fill="#000000" />
                <text x="15" y="-5" fontSize="6.5" fontFamily="monospace" textAnchor="middle" fill="#000000" fontWeight="bold">QR_BR</text>
              </g>

              {/* Title Watermark */}
              <text x="250" y="250" fill="#94a3b8" opacity="0.15" fontSize="18" fontFamily="sans-serif" fontWeight="bold" textAnchor="middle" transform="rotate(-30 250 250)">
                F1 TELEMETRY CALIBRATION PAPER
              </text>
              <text x="250" y="270" fill="#94a3b8" opacity="0.15" fontSize="12" fontFamily="monospace" textAnchor="middle" transform="rotate(-30 250 250)">
                {track.name.toUpperCase()}
              </text>

              {/* --- F1 PITWALL CLASSROOM INSTRUCTIONS --- */}
              <g transform="translate(0, 500)">
                {/* Background Card */}
                <rect x="15" y="10" width="470" height="225" rx="8" fill="#f8fafc" stroke="#cbd5e1" strokeWidth="1.5" />
                
                {/* Heading */}
                <text x="30" y="32" fontSize="11" fontFamily="sans-serif" fontWeight="900" fill="#0f172a" letterSpacing="0.5">
                  F1 PITWALL CLASSROOM: HOW TO CHASE THE PERFECT ROAD APEX
                </text>
                <line x1="30" y1="40" x2="470" y2="40" stroke="#cbd5e1" strokeWidth="1" />

                {/* Left Side: Golden Rules Text */}
                <g transform="translate(30, 55)">
                  {/* Rule 1 */}
                  <text x="0" y="0" fontSize="9" fontFamily="sans-serif" fontWeight="bold" fill="#e11d48">1. THE "OUT-IN-OUT" LAW (FLATTEN THE CURVE)</text>
                  <text x="5" y="12" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Align car on high outside boundary entering the turn (OUT).
                  </text>
                  <text x="5" y="22" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Clip the tight inside point at the middle corner (IN / APEX).
                  </text>
                  <text x="5" y="32" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Drift wide back to the outside boundary on corner exit (OUT).
                  </text>

                  {/* Rule 2 */}
                  <text x="0" y="54" fontSize="9" fontFamily="sans-serif" fontWeight="bold" fill="#0284c7">2. FRICTION LIMITS (SMOOTH FOOTWORK)</text>
                  <text x="5" y="66" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Finish braking in a straight line before turning in.
                  </text>
                  <text x="5" y="76" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Do not brake/turn simultaneously or tyres will slide!
                  </text>
                  <text x="5" y="86" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Smoothly feed gas as you unwind the steering wheel.
                  </text>

                  {/* Rule 3 */}
                  <text x="0" y="108" fontSize="9" fontFamily="sans-serif" fontWeight="bold" fill="#16a34a">3. CRITICAL PENALTIES & SPEEDS</text>
                  <text x="5" y="120" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Touching the red-white kerbs is fine (gains time).
                  </text>
                  <text x="5" y="130" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Going off-track in the dirt caps engine power severely.
                  </text>
                  <text x="5" y="140" fontSize="8" fontFamily="sans-serif" fill="#475569">
                    • Keep lines rounded. Sharp micro-sketches simulate slides!
                  </text>
                </g>

                {/* Right Side: Beautiful Micro Diagram */}
                <g transform="translate(325, 55)">
                  {/* Micro track corner background */}
                  {/* Outer turn boundary */}
                  <path d="M 10,130 Q 80,130 110,60" fill="none" stroke="#e2e8f0" strokeWidth="20" strokeLinecap="round" />
                  <path d="M 10,130 Q 80,130 110,60" fill="none" stroke="#475569" strokeWidth="16" strokeLinecap="round" />
                  {/* Inner turn boundary kerbs */}
                  <path d="M 10,130 Q 80,130 110,60" fill="none" stroke="#ef4444" strokeWidth="18" strokeLinecap="round" strokeDasharray="3 3" />
                  {/* Inner racetrack tarmac */}
                  <path d="M 10,130 Q 80,130 110,60" fill="none" stroke="#1e293b" strokeWidth="13" strokeLinecap="round" />

                  {/* Good Line (Green) */}
                  <path d="M 5,135 C 45,130 85,100 112,65" fill="none" stroke="#22c55e" strokeWidth="2.0" strokeLinecap="round" />
                  <circle cx="70" cy="110" r="3" fill="#22c55e" />
                  <text x="76" y="113" fontSize="6.5" fontFamily="sans-serif" fontWeight="heavy" fill="#15803d">APEX</text>
                  <text x="5" y="147" fontSize="7.5" fontFamily="sans-serif" fontWeight="bold" fill="#15803d">OUT-IN-OUT (FAST)</text>

                  {/* Bad Line (Red) */}
                  <path d="M 15,123 C 35,123 72,118 103,63" fill="none" stroke="#ef4444" strokeWidth="1" strokeDasharray="2 1" strokeLinecap="round" opacity="0.8" />
                  <text x="5" y="52" fontSize="7.5" fontFamily="sans-serif" fontWeight="bold" fill="#b91c1c">IN-IN-IN (SLOW)</text>
                </g>

                {/* Quick Task Instruction Anchor */}
                <rect x="30" y="200" width="410" height="18" rx="4" fill="#eff6ff" stroke="#bfdbfe" strokeWidth="1" />
                <text x="235" y="212" fontSize="7.5" fontFamily="monospace" fontWeight="bold" textAnchor="middle" fill="#1d4ed8">
                  TASK: SKETCH ONE THICK, CONTINUOUS LINE IN BLACK INK WITHIN ROAD BORDERS
                </text>
              </g>

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
              Calibration Template
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
                <span><b>Driver Quick Study Cheat Sheet</b> integrated automatically in the print.</span>
              </div>
              <div className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <span>Responsive sizing compatible with standard A4 / US Letter paper.</span>
              </div>
            </div>
            
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              onClick={triggerPrint}
              className="flex items-center gap-2 bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-lg font-bold text-xs font-sans tracking-wider uppercase transition shadow-md cursor-pointer"
            >
              <Printer className="w-4 h-4" />
              Print Template
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
