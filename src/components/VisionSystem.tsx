import React, { useState, useRef, useEffect } from "react";
// @ts-ignore
import heic2any from "heic2any";
import { Camera, Upload, Edit3, Image as ImageIcon, Check, RefreshCw, ZoomIn, Eye, Award, Trash2, Printer, AlertCircle, CheckCircle } from "lucide-react";
import { Track, getIdealRacingLineOffset, transformPointForTemplate } from "../tracksData";
import { simulateLap, TelemetrySummary } from "../physicsEngine";

interface VisionSystemProps {
  track: Track;
  onAnalysisComplete: (summary: TelemetrySummary, base64Image?: string) => void;
  hoveredTelemetryIndex: number | null;
  summary?: TelemetrySummary | null;
  onRefreshLeaderboard?: () => void;
}

interface BulkReport {
  id: string;
  driverName: string;
  fileName: string;
  telemetry: TelemetrySummary;
  imageSrc: string;
  status: "success" | "processing" | "failed";
  error?: string;
  reportImage?: string; 
}

type InputMode = "digital" | "upload" | "camera" | "bulk";

export default function VisionSystem({ track, onAnalysisComplete, hoveredTelemetryIndex, summary, onRefreshLeaderboard }: VisionSystemProps) {
  const [mode, setMode] = useState<InputMode>("digital");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Bulk processing states
  const [bulkReports, setBulkReports] = useState<BulkReport[]>([]);
  const [isRegisteringBulk, setIsRegisteringBulk] = useState(false);
  
  // DRAGGABLE MARKERS FORperspective mapping (normalized % of container)
  const [markers, setMarkers] = useState([
    { id: "TL", x: 10, y: 10, label: "Top-Left (TL)" },
    { id: "ML", x: 10, y: 50, label: "Mid-Left (ML)" },
    { id: "BL", x: 10, y: 90, label: "Bottom-Left (BL)" },
    { id: "TR", x: 90, y: 10, label: "Top-Right (TR)" },
    { id: "MR", x: 90, y: 50, label: "Mid-Right (MR)" },
    { id: "BR", x: 90, y: 90, label: "Bottom-Right (BR)" },
    { id: "C",  x: 50, y: 50, label: "Center Align (C)" }
  ]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  // Calibration preset state ("qr" = 6%-94% on template, "corners" = 0%-100% full grid, "borders" = 10%-90% margins)
  const [calibrationPreset, setCalibrationPreset] = useState<"qr" | "corners" | "borders">("qr");

  // Splits tracking for manual/scanned alignment
  const [isExtracted, setIsExtracted] = useState(false);

  // Digital Drawing State
  const [userOffsetDeltas, setUserOffsetDeltas] = useState<number[]>(new Array(track.points.length).fill(0));
  const [isDrawing, setIsDrawing] = useState(false);

  // Cached image refs to prevent async canvas rendering flicker during hover animations
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const [imageLoadedCount, setImageLoadedCount] = useState(0);

  useEffect(() => {
    if (!imageSrc) {
      loadedImageRef.current = null;
      setImageLoadedCount((prev) => prev + 1);
      return;
    }
    const img = new Image();
    img.onload = () => {
      loadedImageRef.current = img;
      setImageLoadedCount((prev) => prev + 1);
    };
    img.src = imageSrc;
  }, [imageSrc]);

  // HTML references
  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Reset offset deltas on track change
  useEffect(() => {
    setUserOffsetDeltas(new Array(track.points.length).fill(0));
    setImageSrc(null);
    setIsExtracted(false);
    stopCamera();
  }, [track]);

  // Turn off camera on component unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Sync canvas drawing representing current track state
  useEffect(() => {
    drawCanvas();
  }, [track, mode, imageSrc, markers, userOffsetDeltas, isCameraActive, hoveredTelemetryIndex, imageLoadedCount, calibrationPreset, isExtracted]);

  const startCamera = async () => {
    setMode("camera");
    setIsCameraActive(true);
    setImageSrc(null);
    try {
      if (streamRef.current) {
        stopCamera();
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: 640, height: 640 }
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
    } catch (e) {
      console.error("Camera activation error:", e);
      alert("Failed to acquire camera permissions. Switching back to file upload.");
      setIsCameraActive(false);
      setMode("upload");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setIsCameraActive(false);
  };

  const capturePhoto = () => {
    if (videoRef.current) {
      const vid = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = 600;
      canvas.height = 600;
      const context = canvas.getContext("2d");
      if (context) {
        // Crop center square
        const size = Math.min(vid.videoWidth, vid.videoHeight);
        const sx = (vid.videoWidth - size) / 2;
        const sy = (vid.videoHeight - size) / 2;
        context.drawImage(vid, sx, sy, size, size, 0, 0, 600, 600);
        
        const base64Str = canvas.toDataURL("image/png");
        setImageSrc(base64Str);
        stopCamera();
      }
    }
  };

  // Convert HEIC or HEIF files to JPEG using heic2any
  const convertHeicIfPossible = async (file: File): Promise<Blob | File> => {
    const isHeic = file.name.toLowerCase().endsWith(".heic") || file.name.toLowerCase().endsWith(".heif");
    if (!isHeic) return file;
    
    try {
      const converted = await heic2any({
        blob: file,
        toType: "image/jpeg",
        quality: 0.8
      });
      return Array.isArray(converted) ? converted[0] : converted;
    } catch (error) {
      console.error("Error converting HEIC image:", error);
      return file;
    }
  };

  // Convert uploaded file to base64
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsProcessing(true);
      try {
        const fileToRead = await convertHeicIfPossible(file);
        const reader = new FileReader();
        reader.onload = (event) => {
          if (event.target?.result) {
            setImageSrc(event.target.result as string);
          }
          setIsProcessing(false);
        };
        reader.readAsDataURL(fileToRead);
      } catch (err) {
        console.error("File upload preprocessing failed:", err);
        setIsProcessing(false);
      }
    }
  };

  // Render high contrast superimposed track map image for student report sheet
  const generateTrackReportImage = (offsets: number[]): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    // 1. Clear background
    ctx.fillStyle = "#0f172a";
    ctx.fillRect(0, 0, 500, 500);

    // 2. Grids
    ctx.strokeStyle = "#1e293b";
    ctx.lineWidth = 1;
    for (let i = 25; i < 500; i += 25) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, 500);
      ctx.moveTo(0, i); ctx.lineTo(500, i);
      ctx.stroke();
    }

    // Draw track boundaries
    const drawBounds = (color: string, width: number, isKerb: boolean = false) => {
      ctx.save();
      ctx.beginPath();
      track.points.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.lineWidth = width;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (isKerb) {
        ctx.strokeStyle = "#ffffff";
        ctx.stroke();
        ctx.strokeStyle = "#ef4444";
        ctx.setLineDash([15, 15]);
        ctx.stroke();
      } else {
        ctx.strokeStyle = color;
        ctx.stroke();
      }
      ctx.restore();
    };

    drawBounds("#334155", 24);
    drawBounds("#ef4444", 26, true);
    drawBounds("#1e293b", 20);

    // Draw Optimal Line (Lime Green)
    ctx.beginPath();
    track.points.forEach((pt, i) => {
      const optimalOffset = getIdealRacingLineOffset(track.id, i);
      const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
      const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      const nx = -ty / (len || 1);
      const ny = tx / (len || 1);
      const px = pt.x + optimalOffset * nx;
      const py = pt.y + optimalOffset * ny;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Student Line (Glowing White)
    ctx.beginPath();
    track.points.forEach((pt, i) => {
      const offsetVal = offsets[i] || 0;
      const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
      const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      const nx = -ty / (len || 1);
      const ny = tx / (len || 1);
      const px = pt.x + offsetVal * nx;
      const py = pt.y + offsetVal * ny;

      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#ffffff";
    ctx.shadowBlur = 5;
    ctx.stroke();
    
    // Start Finish Dot
    const firstPt = track.points[0];
    ctx.beginPath();
    ctx.arc(firstPt.x, firstPt.y, 5, 0, 2 * Math.PI);
    ctx.fillStyle = "#e11d48";
    ctx.fill();

    return canvas.toDataURL("image/png");
  };

  // Perform automated perspective warp de-twirl on key uploaded photo asset
  const processSingleBulkImage = (fileName: string, imgSrc: string): Promise<BulkReport> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const offscreenCanvas = document.createElement("canvas");
          offscreenCanvas.width = 500;
          offscreenCanvas.height = 500;
          const octx = offscreenCanvas.getContext("2d");
          if (!octx) throw new Error("Canvas init error");
          
          octx.drawImage(img, 0, 0, 500, 500);
          const imgData = octx.getImageData(0, 0, 500, 500);
          const pixels = imgData.data;
          const extractedOffsets = new Array(track.points.length).fill(0);

          track.points.forEach((pt, i) => {
            const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
            const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            const len = Math.sqrt(tx * tx + ty * ty);
            const nx = -ty / (len || 1);
            const ny = tx / (len || 1);

            let minBrightness = 765;
            let optimalOffsetLocal = 0;

            for (let step = -14; step <= 14; step += 1.5) {
              const templatX = pt.x + step * nx;
              const templatY = pt.y + step * ny;
              const tPt = transformPointForTemplate({ x: templatX, y: templatY });
              const projected = getBilinearProjectedCoordinate(tPt.x, tPt.y);
              const px = Math.round(projected.x);
              const py = Math.round(projected.y);

              if (px >= 0 && px < 500 && py >= 0 && py < 500) {
                const pixelIdx = (py * 500 + px) * 4;
                const r = pixels[pixelIdx];
                const g = pixels[pixelIdx + 1];
                const b = pixels[pixelIdx + 2];
                const brightness = r + g + b;

                if (brightness < minBrightness) {
                  minBrightness = brightness;
                  optimalOffsetLocal = step;
                }
              }
            }

            if (minBrightness < 450) {
              extractedOffsets[i] = parseFloat(optimalOffsetLocal.toFixed(1));
            } else {
              extractedOffsets[i] = 0;
            }
          });

          // Smooth
          const smoothedOffsets = [...extractedOffsets];
          for (let sI = 0; sI < 2; sI++) {
            for (let j = 0; j < smoothedOffsets.length; j++) {
              const prevO = smoothedOffsets[j === 0 ? smoothedOffsets.length - 1 : j - 1];
              const currO = smoothedOffsets[j];
              const nextO = smoothedOffsets[j === smoothedOffsets.length - 1 ? 0 : j + 1];
              smoothedOffsets[j] = prevO * 0.25 + currO * 0.5 + nextO * 0.25;
            }
          }

          const userPointsArray = track.points.map((pT, idx) => {
            const offs = smoothedOffsets[idx];
            const next = track.points[idx === track.points.length - 1 ? 0 : idx + 1];
            const prev = track.points[idx === 0 ? track.points.length - 1 : idx - 1];
            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            const len = Math.sqrt(tx * tx + ty * ty);
            const nx = -ty / (len || 1);
            const ny = tx / (len || 1);

            return { x: pT.x + offs * nx, y: pT.y + offs * ny };
          });

          const summaryResult = simulateLap(track, userPointsArray);
          const generatedImg = generateTrackReportImage(smoothedOffsets);

          let cleanDriverName = fileName
            .replace(/\.[^/.]+$/, "") 
            .replace(/[-_]/g, " ") 
            .toUpperCase()
            .trim()
            .substring(0, 12);

          resolve({
            id: Math.random().toString(36).substring(2, 9),
            driverName: cleanDriverName || "STUDENT",
            fileName: fileName,
            telemetry: summaryResult,
            imageSrc: imgSrc,
            status: "success",
            reportImage: generatedImg
          });

        } catch (e: any) {
          resolve({
            id: Math.random().toString(36).substring(2, 9),
            driverName: "FAILED",
            fileName: fileName,
            telemetry: {
              lapTime: 999.0,
              avgSpeed: 0,
              maxSpeed: 0,
              maxG: 0,
              throttleRatio: 0,
              brakingPointsCount: 0,
              averageDeviation: 99,
              idealLapTime: track.idealLapTime,
              points: []
            },
            imageSrc: imgSrc,
            status: "failed",
            error: e.message || "Parse crash"
          });
        }
      };
      img.src = imgSrc;
    });
  };

  const handleBulkFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList: File[] = Array.from(files) as File[];
    
    // Add loading placeholders
    const tempReports: BulkReport[] = fileList.map((file) => ({
      id: Math.random().toString(36).substring(2, 9),
      driverName: "ANALYZING...",
      fileName: file.name,
      telemetry: {
         lapTime: 0,
         avgSpeed: 0,
         maxSpeed: 0,
         maxG: 0,
         throttleRatio: 0,
         brakingPointsCount: 0,
         averageDeviation: 0,
         idealLapTime: track.idealLapTime,
         points: []
      },
      imageSrc: "",
      status: "processing"
    }));

    setBulkReports((prev) => [...prev, ...tempReports]);

    fileList.forEach(async (file) => {
      try {
        const fileToRead = await convertHeicIfPossible(file);
        const reader = new FileReader();
        reader.onload = async (event) => {
          const resultString = event.target?.result as string;
          if (resultString) {
            const finalReport = await processSingleBulkImage(file.name, resultString);
            setBulkReports((prev) => 
              prev.map((r) => r.fileName === file.name ? finalReport : r)
            );
          }
        };
        reader.readAsDataURL(fileToRead);
      } catch (err) {
        console.error("Bulk file conversion failed:", err);
        setBulkReports((prev) =>
          prev.map((r) =>
            r.fileName === file.name
              ? {
                  ...r,
                  status: "failed",
                  driverName: "FAILED",
                  error: "HEIC conversion failed"
                }
              : r
          )
        );
      }
    });
  };

  const registerAllToLeaderboard = async () => {
    const completed = bulkReports.filter((r) => r.status === "success");
    if (completed.length === 0) return;

    setIsRegisteringBulk(true);
    for (const r of completed) {
      try {
        await fetch("/api/leaderboard", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: r.driverName,
            track: track.id,
            lapTime: r.telemetry.lapTime,
            avgSpeed: r.telemetry.avgSpeed,
            maxG: r.telemetry.maxG
          })
        });
      } catch (err) {
        console.error("Failed submitting name to leaderboard:", r.driverName, err);
      }
    }
    setIsRegisteringBulk(false);
    
    if (onRefreshLeaderboard) {
      onRefreshLeaderboard();
    }
  };

  const triggerBulkPDFDownload = () => {
    const completed = bulkReports.filter((r) => r.status === "success");
    if (completed.length === 0) return;

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) return;

    let pagesHtml = "";

    completed.forEach((report, index) => {
      const avgDeviationVal = report.telemetry.averageDeviation || 0;
      const deviationPenalty = avgDeviationVal * 0.08;
      const baseIdealTime = report.telemetry.idealLapTime;
      const rating = report.telemetry.lapTime < baseIdealTime + 4 
        ? "PRO CLASS (S-GRADE)" 
        : report.telemetry.lapTime < baseIdealTime + 10 
          ? "COMPETENT DRIVER (A-GRADE)" 
          : "DEVELOPING STUDENT (B-GRADE)";

      pagesHtml += `
        <div class="page report-page ${index > 0 ? "page-break" : ""}">
          
          <!-- BRAND HEADER -->
          <div class="report-header">
            <span class="academy-tag">F1 ELEMENTARY CLASSROOM ACADEMY</span>
            <h1 class="main-title">RACER TELEMETRY & APEX DEVIATION ANALYSIS</h1>
          </div>

          <div class="meta-row">
            <div>
              <span class="lbl">STUDENT / DRIVER FIELD ID</span>
              <span class="val highlight-name">${report.driverName}</span>
            </div>
            <div>
              <span class="lbl">CIRCUIT METADATA</span>
              <span class="val uppercase">${track.id} (${track.country})</span>
            </div>
            <div>
              <span class="lbl">SOURCE FILE SCAN</span>
              <span class="val text-mono">${report.fileName}</span>
            </div>
          </div>

          <!-- MAIN COLUMNS -->
          <div class="grid-container">
            
            <!-- LEFT PANEL: NUMERICAL TELEMETRY -->
            <div class="panel telemetry-panel">
              <span class="panel-tag">NEWTONIAN DYNAMICS SOLVER</span>
              <h2>TELEMETRY RESULTS</h2>
              
              <div class="metric-row">
                <span class="m-lbl">SIMULATED LAP TIME:</span>
                <span class="m-val border-val red-text">${report.telemetry.lapTime.toFixed(2)}s</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">TRACK POLK PEAK GOAL:</span>
                <span class="m-val text-mono">${track.idealLapTime.toFixed(2)}s</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">AVERAGE VELOCITY:</span>
                <span class="m-val text-mono">${report.telemetry.avgSpeed.toFixed(1)} km/h</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">TOP VELOCITY ATTAINED:</span>
                <span class="m-val text-mono">${report.telemetry.maxSpeed.toFixed(1)} km/h</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">PEAK LATERAL ACCEL (G):</span>
                <span class="m-val text-mono">${report.telemetry.maxG.toFixed(2)} G</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">THROTTLE ACCEL RATIO:</span>
                <span class="m-val text-mono">${report.telemetry.throttleRatio}%</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">CORNER BRAKING GATES:</span>
                <span class="m-val text-mono">${report.telemetry.brakingPointsCount} zones</span>
              </div>

              <!-- PENALTY SEPARATOR -->
              <div style="border-top:1px dashed #cbd5e1; margin:15px 0; padding-top:10px;"></div>

              <div class="metric-row font-bold">
                <span class="m-lbl">AVERAGE APEX DRIFT:</span>
                <span class="m-val text-mono font-bold text-amber-600">${avgDeviationVal.toFixed(2)} px</span>
              </div>
              <div class="metric-row">
                <span class="m-lbl">DYNAMIC PENALTY DILATION:</span>
                <span class="m-val text-mono text-amber-600">+${deviationPenalty.toFixed(2)}s</span>
              </div>
              <div class="metric-row" style="margin-top:12px;">
                <span class="m-lbl font-bold">DRIVER ACCREDITATION:</span>
                <span class="m-val font-bold cyan-text uppercase">${rating}</span>
              </div>
            </div>

            <!-- RIGHT PANEL: SUPERIMPOSED TRACK DRAWING -->
            <div class="panel map-panel">
              <span class="panel-tag font-bold">SUPERIMPOSED FLIGHT MAP</span>
              <h2>RACING PATH PREVIEW</h2>
              <div style="text-align:center; padding:10px;">
                <img class="preview-img" src="${report.reportImage || ""}" alt="Scanned superimpose path rendering"/>
              </div>
            </div>

          </div>

          <!-- PHYSICS FORMULA LEGEND SECTION -->
          <div class="panel info-panel">
            <span class="panel-tag font-bold">PHYSICAL MATHEMATICAL FORMULATIONS FORMULAE</span>
            <h2>PITWALL COMPILATION PHYSICS FORMULAE INTERPRETATIONS</h2>
            <div class="legend-content">
              <div class="legend-cell">
                <span class="leg-t">🏁 Lat Acceleration G-Force</span>
                <p>Calculated dynamic centripetal limit: <code>a_c = v² / R</code>. Modelled max tyre horizontal coefficient caps performance at <code>v_max = sqrt(μ • G • R)</code>. Any sharp steering angles instantly lock velocity budgets.</p>
              </div>
              <div class="legend-cell">
                <span class="leg-t">⏱️ Segment Dilation Method</span>
                <p>Simulating 100 parametric nodes: <code>t_total = ∑ (ds_i / Math.max(v_i, 3.0))</code>. In-out straights increase distance slightly but widen <code>R</code>, raising velocity factors exponentially.</p>
              </div>
            </div>
          </div>

          <!-- ACCREDITATION SIGNATURE PANEL -->
          <div class="accreditation-panel">
            <div style="flex:1;">
              <span class="lbl font-bold text-slate-800">RACE COMMANDER VERDICT & ADVICE COMMENTS:</span>
              <div class="verdict-lines"></div>
            </div>
            <div class="signature-box">
              <span class="lbl block text-center uppercase" style="border-bottom:1px solid #94a3b8; height:45px; display:block"></span>
              <span class="lbl text-center font-bold block" style="margin-top:4px">RACE DIRECTOR ENDORSEMENT</span>
            </div>
          </div>

        </div>
      `;
    });

    reportWindow.document.write(`
      <html>
        <head>
          <title>F1 Classroom Academy Batch Telemetry Reports</title>
          <style>
            body {
              margin: 0;
              padding: 0;
              background-color: #f1f5f9;
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
              color: #1e293b;
              -webkit-print-color-adjust: exact;
              print-color-adjust: exact;
            }
            .page {
              background: #ffffff;
              width: 195mm;
              height: 275mm;
              padding: 10mm;
              margin: 10px auto;
              box-shadow: 0 4px 10px rgba(0,0,0,0.05);
              box-sizing: border-box;
              display: flex;
              flex-direction: column;
              justify-content: space-between;
              border: 1px solid #cbd5e1;
            }
            .report-header {
              border-bottom: 2px solid #e11d48;
              padding-bottom: 15px;
              margin-bottom: 12px;
            }
            .academy-tag {
              font-size: 9px;
              letter-spacing: 0.1em;
              font-weight: 800;
              color: #e11d48;
              font-family: monospace;
              display: block;
            }
            .main-title {
              font-size: 18px;
              font-weight: 900;
              margin: 4px 0 0 0;
              color: #0f172a;
              letter-spacing: -0.01em;
            }
            .meta-row {
              display: flex;
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 6px;
              padding: 10px 15px;
              margin-bottom: 16px;
              justify-content: space-between;
              gap: 10px;
            }
            .lbl {
              font-size: 7.5px;
              color: #64748b;
              font-weight: bold;
              display: block;
              letter-spacing: 0.05em;
              margin-bottom: 2px;
            }
            .val {
              font-size: 11px;
              font-weight: 700;
              color: #0f172a;
            }
            .highlight-name {
              color: #e11d48;
              font-size: 13px;
            }
            .text-mono {
              font-family: monospace;
            }
            .grid-container {
              display: grid;
              grid-template-columns: 1.1fr 0.9fr;
              gap: 16px;
              flex: 1;
              min-height: 0;
            }
            .panel {
              border: 1px solid #cbd5e1;
              border-radius: 6px;
              padding: 12px 14px;
              background: #ffffff;
              display: flex;
              flex-direction: column;
            }
            .panel h2 {
              font-size: 11px;
              font-weight: 850;
              margin: 4px 0 12px 0;
              color: #0f172a;
              letter-spacing: 0.02em;
              border-bottom: 1px solid #f1f5f9;
              padding-bottom: 6px;
            }
            .panel-tag {
              font-size: 7px;
              color: #64748b;
              font-family: monospace;
              display: block;
            }
            .telemetry-panel {
              justify-content: flex-start;
            }
            .metric-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 10px;
              margin-bottom: 7.5px;
              color: #334155;
            }
            .m-lbl {
              font-weight: 500;
            }
            .m-val {
              font-weight: 700;
              color: #0f172a;
            }
            .border-val {
              padding: 3px 6px;
              background: #ffebd8;
              border-radius: 4px;
              border: 1px solid #f97316;
            }
            .red-text {
              color: #b91c1c;
              background: #ffe4e6;
              border-color: #f43f5e;
            }
            .cyan-text {
              color: #0369a1;
            }
            .font-bold {
              font-weight: 700;
            }
            .preview-img {
              width: 200px;
              height: 200px;
              object-fit: contain;
              border-radius: 6px;
              border: 1px solid #e2e8f0;
              margin: auto;
            }
            .info-panel {
              margin-top: 14px;
              padding: 8px 12px;
            }
            .info-panel h2 {
              margin-bottom: 6px;
            }
            .legend-content {
              display: grid;
              grid-template-columns: 1fr 1fr;
              gap: 15px;
            }
            .legend-cell {
              font-size: 8px;
              color: #475569;
              line-height: 1.35;
            }
            .leg-t {
              font-weight: bold;
              color: #0f172a;
              display: block;
              margin-bottom: 2px;
            }
            .accreditation-panel {
              display: flex;
              margin-top: 14px;
              gap: 20px;
              align-items: center;
              border-top: 1px dashed #cbd5e1;
              padding-top: 12px;
            }
            .verdict-lines {
              border-bottom: 1px solid #cbd5e1;
              border-top: 1px solid #cbd5e1;
              height: 40px;
              margin-top: 5px;
              background-image: linear-gradient(#cbd5e1 1px, transparent 1px);
              background-size: 100% 20px;
            }
            .signature-box {
              width: 60mm;
            }
            @media print {
              body {
                background: none;
                margin: 0;
              }
              .page {
                margin: 0;
                box-shadow: none;
                border: none;
                page-break-inside: avoid;
              }
              .page-break {
                page-break-before: always;
              }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="no-print" style="background:#0f172a; padding:15px; text-align:center; color:white; font-family:sans-serif; font-size:13px; margin-bottom:15px; box-shadow:0 2px 5px rgba(0,0,0,0.2)">
            <p style="margin:0 0 10px 0;"><b>📋 F1 Classroom Academy Telemetry Exporter initialized</b></p>
            <p style="margin:0 0 10px 0; font-size:11px; opacity:0.85">Ready to print or save a compiled ${completed.length}-page vector PDF document.</p>
            <button onclick="window.print()" style="padding: 10px 24px; font-weight: bold; background: #e11d48; color: white; border: none; border-radius: 6px; cursor: pointer; text-transform: uppercase; font-size: 11px; tracking-wider:0.02em">
              Click to Open Printer Setup / Save to PDF
            </button>
          </div>
          <div id="print_payload_grid">
            ${pagesHtml}
          </div>
          <script>
            window.addEventListener('load', () => {
              setTimeout(() => { window.print(); }, 800);
            });
          </script>
        </body>
      </html>
    `);
    reportWindow.document.close();
  };

  // Drag handlers for perspective markers
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || mode === "digital") return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    // Find nearest marker within threshold (e.g., 8%)
    let nearestIdx = -1;
    let minDist = 9999;
    markers.forEach((m, idx) => {
      const dx = m.x - xPct;
      const dy = m.y - yPct;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < minDist && dist < 8) {
        minDist = dist;
        nearestIdx = idx;
      }
    });

    if (nearestIdx !== -1) {
      setActiveMarkerId(markers[nearestIdx].id);
      setIsDrawing(false); // prevent drawing clashes
    }
  };

  const handleContainerPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current || !activeMarkerId) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));

    setMarkers((prev) =>
      prev.map((m) => (m.id === activeMarkerId ? { ...m, x: parseFloat(xPct.toFixed(1)), y: parseFloat(yPct.toFixed(1)) } : m))
    );
    setIsExtracted(false);
  };

  const handleContainerPointerUp = () => {
    setActiveMarkerId(null);
  };

  // Digital drawing logic: calculate lateral offset relative to centerline of track
  const handleDigitalDrawing = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (mode !== "digital" || (!isDrawing && e.type !== "pointerdown")) return;
    if (!mainCanvasRef.current) return;
    
    const canvas = mainCanvasRef.current;
    const rect = canvas.getBoundingClientRect();
    
    // Position inside the canvas coordinate space [0..500]
    const x = ((e.clientX - rect.left) / rect.width) * 500;
    const y = ((e.clientY - rect.top) / rect.height) * 500;

    // Find closest centerline node
    let closestIndex = -1;
    let minDist = 9999;
    track.points.forEach((pt, i) => {
      const dx = pt.x - x;
      const dy = pt.y - y;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d < minDist) {
        minDist = d;
        closestIndex = i;
      }
    });

    if (closestIndex !== -1 && minDist < 65) {
      // Calculate normal offset.
      // Offset vector: current track point original minus user drawn projection.
      const originalPt = track.points[closestIndex];
      const nextPt = track.points[closestIndex === track.points.length - 1 ? 0 : closestIndex + 1];
      const prevPt = track.points[closestIndex === 0 ? track.points.length - 1 : closestIndex - 1];

      // DX and DY tangent
      const tx = nextPt.x - prevPt.x;
      const ty = nextPt.y - prevPt.y;
      const tLen = Math.sqrt(tx * tx + ty * ty);
      
      // Normal vector
      const nx = -ty / (tLen || 1);
      const ny = tx / (tLen || 1);

      // Vector from centerline to cursor
      const cx = x - originalPt.x;
      const cy = y - originalPt.y;

      // Dot product to project cursor onto normal line: offset distance
      let offset = cx * nx + cy * ny;
      
      // Limit offset to track width boundaries (15 pixels max half-width)
      offset = Math.min(13, Math.max(-13, offset));

      setUserOffsetDeltas((prev) => {
        const next = [...prev];
        next[closestIndex] = parseFloat(offset.toFixed(1));
        
        // Spread drawing slightly to neighbouring indices to prevent jagged steps
        const spreadWeight = 0.5;
        const leftIdx = closestIndex === 0 ? track.points.length - 1 : closestIndex - 1;
        const rightIdx = closestIndex === track.points.length - 1 ? 0 : closestIndex + 1;
        next[leftIdx] = parseFloat((next[leftIdx] * (1 - spreadWeight) + offset * spreadWeight).toFixed(1));
        next[rightIdx] = parseFloat((next[rightIdx] * (1 - spreadWeight) + offset * spreadWeight).toFixed(1));
        
        return next;
      });
    }
  };

  const drawProjectedExtractedRacingLine = (ctx: CanvasRenderingContext2D) => {
    const projectedExtractedPoints = track.points.map((pt, i) => {
      const offsetVal = userOffsetDeltas[i] || 0;
      const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
      const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      const nx = -ty / (len || 1);
      const ny = tx / (len || 1);

      const idealOffsetPointX = pt.x + offsetVal * nx;
      const idealOffsetPointY = pt.y + offsetVal * ny;
      const tPt = transformPointForTemplate({ x: idealOffsetPointX, y: idealOffsetPointY });

      return getBilinearProjectedCoordinate(tPt.x, tPt.y);
    });

    ctx.save();
    ctx.beginPath();
    projectedExtractedPoints.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();

    // Glowing Neon Emerald stroke for high-tech scanning HUD alignment!
    ctx.shadowColor = "#10b981";
    ctx.shadowBlur = 10;
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();

    // Core high contrast white inner core
    ctx.shadowBlur = 0;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Draw scanning feedback points (amber nodes for detected ink positions)
    projectedExtractedPoints.forEach((pt, i) => {
      if (userOffsetDeltas[i] !== 0) {
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
        ctx.fillStyle = "#f59e0b";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    });

    ctx.restore();
  };

  const drawCanvas = () => {
    if (!mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 500, 500);

    // Context drawing depending on uploaded photos/camera snaps
    if (mode !== "digital" && imageSrc) {
      const img = loadedImageRef.current;
      if (img) {
        // Draw the uploaded original picture flat on background
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(img, 0, 0, 500, 500);
        ctx.restore();

        if (isExtracted) {
          // 🚀 Show the elegant neon scanned racing line! Bypasses red layout guidelines.
          drawProjectedExtractedRacingLine(ctx);
        } else {
          // Show original alignment guidelines
          // Draw track elements projected dynamically onto user's markers!
          drawProjectedTrackCenterPath(ctx, "rgba(6, 182, 212, 0.22)", 24);
          drawProjectedTrackCenterPath(ctx, "rgba(239, 68, 68, 0.35)", 26, false, "red-white");
          drawProjectedTrackCenterPath(ctx, "rgba(30, 41, 59, 0.6)", 20);
          drawProjectedTrackCenterPath(ctx, "rgba(255, 255, 255, 0.55)", 1.5, true);
        }
        
        // Render current calibration markers directly on the Canvas for visuals with color-coding
        markers.forEach((m) => {
          const px = (m.x / 100) * 500;
          const py = (m.y / 100) * 500;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, 2 * Math.PI);
          ctx.fillStyle = m.id === "C"
            ? "rgba(234, 179, 8, 0.2)"
            : m.id === "ML" || m.id === "MR"
            ? "rgba(6, 182, 212, 0.2)"
            : "rgba(244, 63, 94, 0.25)";
          ctx.fill();
          
          ctx.lineWidth = 2;
          ctx.strokeStyle = m.id === "C"
            ? "#eab308"
            : m.id === "ML" || m.id === "MR"
            ? "#06b6d4"
            : "#f43f5e";
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(px, py, 3, 0, 2 * Math.PI);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        });
      } else {
        // Placeholder state when image is loading
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(0, 0, 500, 500);
        
        ctx.fillStyle = "#64748b";
        ctx.font = "bold 12px monospace";
        ctx.textAlign = "center";
        ctx.fillText("LOADING MAP SOURCE...", 250, 250);
      }
    } else {
      // pure flat layout for digital drawing or idle
      // White canvas background
      ctx.fillStyle = "#0f172a";
      ctx.fillRect(0, 0, 500, 500);

      // Grid guides
      ctx.strokeStyle = "#1e293b";
      ctx.lineWidth = 1;
      for (let i = 25; i < 500; i += 25) {
        ctx.beginPath();
        ctx.moveTo(i, 0); ctx.lineTo(i, 500);
        ctx.moveTo(0, i); ctx.lineTo(500, i);
        ctx.stroke();
      }

      // Draw Racetrack boundaries (gray tarmac)
      drawTrackCenterPath(ctx, "#334155", 24);

      // Draw red-white kerbs
      drawTrackCenterPath(ctx, "#ef4444", 26, false, "red-white");

      // Core tarmac
      drawTrackCenterPath(ctx, "#1e293b", 20);

      // Draw Center Dash Guidance
      drawTrackCenterPath(ctx, "#94a3b8", 1, true);

      // Assemble User Sketched Racing Line
      const userLinePoints = track.points.map((pt, i) => {
        const offsetVal = userOffsetDeltas[i];
        const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
        const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const len = Math.sqrt(tx * tx + ty * ty);
        const nx = -ty / (len || 1);
        const ny = tx / (len || 1);

        return {
          x: pt.x + offsetVal * nx,
          y: pt.y + offsetVal * ny
        };
      });

      // Draw User Racing Line (glowing white coordinate path)
      ctx.beginPath();
      userLinePoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
      });
      ctx.closePath();
      ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#ffffff";
      ctx.shadowBlur = 8;
      ctx.stroke();
      ctx.shadowBlur = 0; // reset

      // Overlay dots for nodes that differ from 0
      userLinePoints.forEach((pt, i) => {
        if (userOffsetDeltas[i] !== 0) {
          ctx.beginPath();
          ctx.arc(pt.x, pt.y, 4, 0, 2 * Math.PI);
          ctx.fillStyle = "#f59e0b";
          ctx.fill();
        }
      });
    }

    // Start line flag marker
    const firstPt = track.points[0];
    const isProjectedDraw = mode !== "digital" && imageSrc;
    const startPt = isProjectedDraw 
      ? (() => {
          const tPt = transformPointForTemplate(firstPt);
          return getBilinearProjectedCoordinate(tPt.x, tPt.y);
        })()
      : firstPt;
    ctx.beginPath();
    ctx.arc(startPt.x, startPt.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    drawHoveredPointer(ctx);
  };

  const drawHoveredPointer = (ctx: CanvasRenderingContext2D) => {
    if (hoveredTelemetryIndex !== null && hoveredTelemetryIndex >= 0 && hoveredTelemetryIndex < track.points.length) {
      const idx = hoveredTelemetryIndex;
      const pt = track.points[idx];
      const offsetVal = userOffsetDeltas[idx] || 0;
      const next = track.points[idx === track.points.length - 1 ? 0 : idx + 1];
      const prev = track.points[idx === 0 ? track.points.length - 1 : idx - 1];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      const nx = -ty / (len || 1);
      const ny = tx / (len || 1);

      const posX = pt.x + offsetVal * nx;
      const posY = pt.y + offsetVal * ny;

      ctx.save();
      
      // External Pulsing/Glow Ring
      ctx.beginPath();
      ctx.arc(posX, posY, 14, 0, 2 * Math.PI);
      ctx.strokeStyle = "rgba(6, 182, 212, 0.15)";
      ctx.lineWidth = 25;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(posX, posY, 13, 0, 2 * Math.PI);
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(posX, posY, 7, 0, 2 * Math.PI);
      ctx.fillStyle = "rgba(6, 182, 212, 0.4)";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(posX, posY, 3, 0, 2 * Math.PI);
      ctx.fillStyle = "#ffffff";
      ctx.fill();

      // Crosshair Indicators
      ctx.strokeStyle = "#06b6d4";
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(posX, posY - 19); ctx.lineTo(posX, posY - 11); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(posX, posY + 11); ctx.lineTo(posX, posY + 19); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(posX - 19, posY); ctx.lineTo(posX - 11, posY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(posX + 11, posY); ctx.lineTo(posX + 19, posY); ctx.stroke();

      // Smart Tooltip Box Positioning to prevent bounds cutoff
      let boxW = 160;
      let boxH = 92;
      let boxX = posX + 22;
      let boxY = posY - 45;
      if (boxX + boxW > 500) {
        boxX = posX - (boxW + 22);
      }
      if (boxY < 10) {
        boxY = 10;
      }
      if (boxY + boxH > 500) {
        boxY = 500 - (boxH + 10);
      }

      // Draw background container
      ctx.shadowColor = "rgba(0, 0, 0, 0.6)";
      ctx.shadowBlur = 8;
      ctx.fillStyle = "rgba(15, 23, 42, 0.95)";
      ctx.beginPath();
      if (typeof (ctx as any).roundRect === "function") {
        (ctx as any).roundRect(boxX, boxY, boxW, boxH, 8);
      } else {
        ctx.rect(boxX, boxY, boxW, boxH);
      }
      ctx.fill();

      // Cyan Border Stroke
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.strokeStyle = "rgba(6, 182, 212, 0.85)";
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Header Text Title
      ctx.fillStyle = "#22d3ee";
      ctx.font = "bold 9px monospace";
      ctx.fillText(`MAPPED VEHICLE • PT #${idx}`, boxX + 10, boxY + 16);

      // Separator Line
      ctx.strokeStyle = "rgba(6, 182, 212, 0.25)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(boxX + 10, boxY + 22);
      ctx.lineTo(boxX + boxW - 10, boxY + 22);
      ctx.stroke();

      const ptMetrics = summary?.points?.[idx];
      ctx.fillStyle = "#ffffff";
      ctx.font = "10px monospace";

      if (ptMetrics) {
        const speedKmh = Math.round(ptMetrics.speed);
        const throttleVal = ptMetrics.throttle;
        const isBrakingVal = ptMetrics.isBraking;
        const latGVal = ptMetrics.lateralG;
        
        // Speed Info
        ctx.fillText(`SPEED:   ${speedKmh} km/h`, boxX + 10, boxY + 38);
        
        // Lateral force metric
        ctx.fillText(`LAT G:   ${latGVal.toFixed(2)} G`, boxX + 10, boxY + 52);
        
        // Foot controls
        if (isBrakingVal) {
          ctx.fillStyle = "#ef4444"; // red text accent
          ctx.fillText(`INPUTS:  ☠ BRAKING`, boxX + 10, boxY + 66);
        } else {
          ctx.fillStyle = "#f97316"; // orange text accent
          ctx.fillText(`INPUTS:  ⚡ THR ${throttleVal}%`, boxX + 10, boxY + 66);
        }
        
        // Distance
        ctx.fillStyle = "#94a3b8"; // slate muted text
        ctx.font = "8px monospace";
        ctx.fillText(`LAP DISTANCE: ${Math.round(ptMetrics.s)}m`, boxX + 10, boxY + 80);
      } else {
        // Fallback info template
        ctx.fillStyle = "#94a3b8";
        ctx.font = "9px monospace";
        ctx.fillText(`SPEED:   -- km/h`, boxX + 10, boxY + 38);
        ctx.fillText(`LAT G:   -- G`, boxX + 10, boxY + 52);
        ctx.fillText(`INPUTS:  --`, boxX + 10, boxY + 66);
        
        ctx.fillStyle = "#64748b";
        ctx.font = "8.5px monospace";
        ctx.fillText(`Run simulation to unlock`, boxX + 10, boxY + 80);
      }

      ctx.restore();
    }
  };

  const drawTrackCenterPath = (
    ctx: CanvasRenderingContext2D,
    color: string,
    width: number,
    dash: boolean = false,
    kerbType: "none" | "red-white" = "none"
  ) => {
    ctx.save();
    ctx.beginPath();
    track.points.forEach((pt, i) => {
      if (i === 0) ctx.moveTo(pt.x, pt.y);
      else ctx.lineTo(pt.x, pt.y);
    });
    ctx.closePath();

    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (kerbType === "red-white") {
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.strokeStyle = "#ef4444";
      ctx.setLineDash([15, 15]);
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      if (dash) {
        ctx.setLineDash([4, 6]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  const drawProjectedTrackCenterPath = (
    ctx: CanvasRenderingContext2D,
    color: string,
    width: number,
    dash: boolean = false,
    kerbType: "none" | "red-white" = "none"
  ) => {
    ctx.save();
    ctx.beginPath();
    track.points.forEach((pt, i) => {
      const tPt = transformPointForTemplate(pt);
      const projected = getBilinearProjectedCoordinate(tPt.x, tPt.y);
      if (i === 0) ctx.moveTo(projected.x, projected.y);
      else ctx.lineTo(projected.x, projected.y);
    });
    ctx.closePath();

    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (kerbType === "red-white") {
      ctx.strokeStyle = "#ffffff";
      ctx.stroke();
      ctx.strokeStyle = "#ef4444";
      ctx.setLineDash([15, 15]);
      ctx.stroke();
    } else {
      ctx.strokeStyle = color;
      if (dash) {
        ctx.setLineDash([4, 6]);
      } else {
        ctx.setLineDash([]);
      }
      ctx.stroke();
    }
    ctx.restore();
  };

  // BILINEAR Homography warp mapping function
  // Transforms normalized coordinates [0..500] in template space
  // back to [0..500] coordinate space of photographed, aligned canvas
  const getBilinearProjectedCoordinate = (tx: number, ty: number) => {
    let u = tx / 500;
    let v = ty / 500;

    if (calibrationPreset === "qr") {
      // The QR codes on the printed page are physically placed with their centers at 6% and 94% margins (30px and 470px).
      u = (tx / 500 - 0.06) / 0.88;
      v = (ty / 500 - 0.06) / 0.88;
    } else if (calibrationPreset === "borders") {
      // The standard border lines are placed with 10% margins (50px and 450px)
      u = (tx / 500 - 0.1) / 0.8;
      v = (ty / 500 - 0.1) / 0.8;
    }

    // Clamp coordinates safely
    u = Math.max(0, Math.min(1, u));
    v = Math.max(0, Math.min(1, v));

    const TL = markers.find((m) => m.id === "TL") || { x: 10, y: 10 };
    const TR = markers.find((m) => m.id === "TR") || { x: 90, y: 10 };
    const BL = markers.find((m) => m.id === "BL") || { x: 10, y: 90 };
    const BR = markers.find((m) => m.id === "BR") || { x: 90, y: 90 };
    const ML = markers.find((m) => m.id === "ML") || { x: 10, y: 50 };
    const MR = markers.find((m) => m.id === "MR") || { x: 90, y: 50 };
    const C  = markers.find((m) => m.id === "C")  || { x: 50, y: 50 };

    // Convert % markers back to 500px canvas dimension space
    const TL_x = (TL.x / 100) * 500;
    const TL_y = (TL.y / 100) * 500;
    const TR_x = (TR.x / 100) * 500;
    const TR_y = (TR.y / 100) * 500;
    const BL_x = (BL.x / 100) * 500;
    const BL_y = (BL.y / 100) * 500;
    const BR_x = (BR.x / 100) * 500;
    const BR_y = (BR.y / 100) * 500;
    const ML_x = (ML.x / 100) * 500;
    const ML_y = (ML.y / 100) * 500;
    const MR_x = (MR.x / 100) * 500;
    const MR_y = (MR.y / 100) * 500;
    const C_x  = (C.x / 100)  * 500;
    const C_y  = (C.y / 100)  * 500;

    // Midpoints for virtual boundaries
    const TC_x = (TL_x + TR_x) / 2;
    const TC_y = (TL_y + TR_y) / 2;
    const BC_x = (BL_x + BR_x) / 2;
    const BC_y = (BL_y + BR_y) / 2;

    let px = 0;
    let py = 0;

    if (u <= 0.5 && v <= 0.5) {
      // Top-Left quadrant
      const uPrime = u * 2;
      const vPrime = v * 2;
      px = (1 - uPrime) * (1 - vPrime) * TL_x + uPrime * (1 - vPrime) * TC_x + (1 - uPrime) * vPrime * ML_x + uPrime * vPrime * C_x;
      py = (1 - uPrime) * (1 - vPrime) * TL_y + uPrime * (1 - vPrime) * TC_y + (1 - uPrime) * vPrime * ML_y + uPrime * vPrime * C_y;
    } else if (u > 0.5 && v <= 0.5) {
      // Top-Right quadrant
      const uPrime = (u - 0.5) * 2;
      const vPrime = v * 2;
      px = (1 - uPrime) * (1 - vPrime) * TC_x + uPrime * (1 - vPrime) * TR_x + (1 - uPrime) * vPrime * C_x + uPrime * vPrime * MR_x;
      py = (1 - uPrime) * (1 - vPrime) * TC_y + uPrime * (1 - vPrime) * TR_y + (1 - uPrime) * vPrime * C_y + uPrime * vPrime * MR_y;
    } else if (u <= 0.5 && v > 0.5) {
      // Bottom-Left quadrant
      const uPrime = u * 2;
      const vPrime = (v - 0.5) * 2;
      px = (1 - uPrime) * (1 - vPrime) * ML_x + uPrime * (1 - vPrime) * C_x + (1 - uPrime) * vPrime * BL_x + uPrime * vPrime * BC_x;
      py = (1 - uPrime) * (1 - vPrime) * ML_y + uPrime * (1 - vPrime) * C_y + (1 - uPrime) * vPrime * BL_y + uPrime * vPrime * BC_y;
    } else {
      // Bottom-Right quadrant
      const uPrime = (u - 0.5) * 2;
      const vPrime = (v - 0.5) * 2;
      px = (1 - uPrime) * (1 - vPrime) * C_x + uPrime * (1 - vPrime) * MR_x + (1 - uPrime) * vPrime * BC_x + uPrime * vPrime * BR_x;
      py = (1 - uPrime) * (1 - vPrime) * C_y + uPrime * (1 - vPrime) * MR_y + (1 - uPrime) * vPrime * BC_y + uPrime * vPrime * BR_y;
    }

    return { x: px, y: py };
  };

  // Perform computer vision scan of paper image to snap the hand-drawn ink line!
  const runVisualAnalysis = () => {
    if (!imageSrc) return;
    setIsProcessing(true);

    setTimeout(() => {
      // Capture canvas elements
      const offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = 500;
      offscreenCanvas.height = 500;
      const octx = offscreenCanvas.getContext("2d");
      
      const img = new Image();
      img.onload = () => {
        if (octx) {
          octx.drawImage(img, 0, 0, 500, 500);
          const imgData = octx.getImageData(0, 0, 500, 500);
          const pixels = imgData.data;

          const extractedOffsets = new Array(track.points.length).fill(0);

          // For each point, scan perpendicularly to find the darkest pixel!
          track.points.forEach((pt, i) => {
            const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
            const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];

            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            const len = Math.sqrt(tx * tx + ty * ty);
            const nx = -ty / (len || 1);
            const ny = tx / (len || 1);

            // Scan laterally across the track thickness [-15px .. +15px]
            let minBrightness = 765; //max sum of RGB (3 * 255)
            let optimalOffsetLocal = 0;

            for (let step = -14; step <= 14; step += 1.5) {
              const templatX = pt.x + step * nx;
              const templatY = pt.y + step * ny;
              const tPt = transformPointForTemplate({ x: templatX, y: templatY });

              // Project template coordinate to actual paper photo canvas space
              const projected = getBilinearProjectedCoordinate(tPt.x, tPt.y);
              const px = Math.round(projected.x);
              const py = Math.round(projected.y);

              if (px >= 0 && px < 500 && py >= 0 && py < 500) {
                const idx = (py * 500 + px) * 4;
                const r = pixels[idx];
                const g = pixels[idx + 1];
                const b = pixels[idx + 2];
                const brightness = r + g + b;

                if (brightness < minBrightness) {
                  minBrightness = brightness;
                  optimalOffsetLocal = step;
                }
              }
            }

            // High contrast verification filter: 
            // In F1 templates, paper background is pure white-grey (~R+G+B > 520).
            // A genuine black ink stroke would be much darker (~R+G+B < 350).
            // If the darkest value found isn't dark enough, they didn't draw a line there, so stay on center line!
            if (minBrightness < 450) {
              extractedOffsets[i] = parseFloat(optimalOffsetLocal.toFixed(1));
            } else {
              extractedOffsets[i] = 0;
            }
          });

          // Smooth extracted offsets against severe mathematical scanning noise (jumping pixel outliers)
          const smoothedOffsets = [...extractedOffsets];
          for (let sI = 0; sI < 2; sI++) { // Two pass smoothing filter
            for (let j = 0; j < smoothedOffsets.length; j++) {
              const prevO = smoothedOffsets[j === 0 ? smoothedOffsets.length - 1 : j - 1];
              const currO = smoothedOffsets[j];
              const nextO = smoothedOffsets[j === smoothedOffsets.length - 1 ? 0 : j + 1];
              smoothedOffsets[j] = prevO * 0.25 + currO * 0.5 + nextO * 0.25;
            }
          }

          // Apply extracted offsets to state so the glowing neon line displays on canvas!
          setUserOffsetDeltas(smoothedOffsets);
          setIsExtracted(true);
          setIsProcessing(false);
        }
      };
      img.src = imageSrc;

    }, 1200);
  };

  // Triggers simulator on uploaded/scanned track coordinates
  const submitUploadedRacingLine = () => {
    if (!imageSrc) return;
    setIsProcessing(true);
    setTimeout(() => {
      const userPointsArray = track.points.map((pt, i) => {
        const offsetVal = userOffsetDeltas[i] || 0;
        const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
        const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const len = Math.sqrt(tx * tx + ty * ty);
        const nx = -ty / (len || 1);
        const ny = tx / (len || 1);

        return {
          x: pt.x + offsetVal * nx,
          y: pt.y + offsetVal * ny
        };
      });

      const summaryResult = simulateLap(track, userPointsArray);
      onAnalysisComplete(summaryResult, imageSrc);
      setIsProcessing(false);
    }, 1000);
  };

  // Triggers simulator on custom digital drawings
  const submitDigitalRacingLine = () => {
    setIsProcessing(true);
    setTimeout(() => {
      const userPointsArray = track.points.map((pt, i) => {
        const offsetVal = userOffsetDeltas[i];
        const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
        const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const len = Math.sqrt(tx * tx + ty * ty);
        const nx = -ty / (len || 1);
        const ny = tx / (len || 1);

        return {
          x: pt.x + offsetVal * nx,
          y: pt.y + offsetVal * ny
        };
      });

      const summaryResult = simulateLap(track, userPointsArray);
      onAnalysisComplete(summaryResult, undefined); // digital draw has no raw photograph
      setIsProcessing(false);
    }, 800);
  };

  return (
    <div id="vision_system_panel" className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-xl flex flex-col items-center">
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-3">
        <h2 className="text-base font-bold font-sans tracking-tight flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyan-400 shrink-0" />
          Optical Vision Scan & Sketch Interface
        </h2>
        
        {/* Toggle Modes selection */}
        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono shrink-0">
          <button
            onClick={() => { setMode("digital"); stopCamera(); }}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
              mode === "digital" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Digital Draw
          </button>
          <button
            onClick={() => { setMode("upload"); stopCamera(); }}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
              mode === "upload" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Photo Upload
          </button>
          <button
            onClick={startCamera}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
              isCameraActive ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            Live Camera
          </button>
          <button
            onClick={() => { setMode("bulk"); stopCamera(); }}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
              mode === "bulk" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Award className="w-3.5 h-3.5" />
            Bulk Queue
          </button>
        </div>
      </div>

      {/* Main Large Centered alignment Canvas Container */}
      <div className="w-full flex flex-col items-center justify-center py-2">
        {mode === "bulk" ? (
          <div className="w-full max-w-[580px] md:max-w-[620px] aspect-square rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-slate-950 select-none p-6 flex flex-col justify-between">
            <div>
              <span className="text-[10px] font-mono text-cyan-400 block uppercase tracking-widest mb-1">
                Phase 1 — Batch Extraction System
              </span>
              <h3 className="text-sm font-bold font-sans tracking-tight text-white uppercase mb-3">
                Bulk Race Sheet Processor
              </h3>
              
              <input
                type="file"
                multiple
                accept="image/*,.heic,.heif"
                id="bulk-upload-files"
                onChange={handleBulkFileChange}
                className="hidden"
              />
              <label
                htmlFor="bulk-upload-files"
                className="border-2 border-dashed border-slate-800 hover:border-cyan-500/50 hover:bg-slate-900/30 bg-slate-950 p-6 rounded-xl flex flex-col items-center justify-center gap-2 cursor-pointer transition text-center"
              >
                <Upload className="w-7 h-7 text-cyan-400 animate-bounce" />
                <span className="text-xs font-bold text-slate-200 block">Drag & Drop or Choose Files</span>
                <span className="text-[9.5px] font-mono text-slate-500 block">
                  Reuses the calibration perspective grids from "Photo Upload".
                </span>
              </label>
            </div>

            {/* List queue scrollable */}
            <div className="flex-1 overflow-y-auto min-h-0 my-4 pr-1 space-y-2 border-t border-slate-900 pt-3">
              {bulkReports.length === 0 ? (
                <div className="text-center py-10 text-slate-600 font-mono text-[10.5px]">
                  QUEUE CURRENTLY EMPTY — DRIVER SHEETS READY FOR MASS DIGITIZATION
                </div>
              ) : (
                bulkReports.map((report) => (
                  <div key={report.id} className="bg-slate-950 border border-slate-850 p-2.5 rounded-lg flex items-center justify-between gap-3 text-xs">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {report.status === "success" && report.reportImage ? (
                        <img src={report.reportImage} alt="thumbnail" className="w-8 h-8 rounded border border-slate-750 shrink-0 object-contain bg-slate-950" />
                      ) : (
                        <div className="w-8 h-8 rounded border border-slate-800 shrink-0 bg-slate-950/40 flex items-center justify-center text-slate-500 font-mono text-[9px]">
                          {report.status === "processing" ? "..." : "ERR"}
                        </div>
                      )}
                      <div className="min-w-0">
                        <input
                          type="text"
                          value={report.driverName}
                          onChange={(e) => {
                            const newName = e.target.value.toUpperCase();
                            setBulkReports((prev) => prev.map((r) => r.id === report.id ? { ...r, driverName: newName } : r));
                          }}
                          placeholder="DRIVER ID"
                          className="bg-slate-950 border border-slate-850 text-white font-bold p-1 rounded font-mono text-[11px] w-24 focus:outline-none focus:border-cyan-500"
                        />
                        <span className="text-[9px] text-slate-500 block text-ellipsis overflow-hidden whitespace-nowrap">{report.fileName}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {report.status === "processing" ? (
                        <span className="text-[10px] font-mono text-amber-500 animate-pulse uppercase">Solving...</span>
                      ) : report.status === "failed" ? (
                        <span className="text-[10px] font-mono text-rose-500" title={report.error}>FAILED ⚠️</span>
                      ) : (
                        <span className="text-[11px] font-mono font-bold text-emerald-400">{report.telemetry.lapTime.toFixed(2)}s</span>
                      )}

                      <button
                        onClick={() => setBulkReports((prev) => prev.filter((r) => r.id !== report.id))}
                        className="text-slate-500 hover:text-rose-500 p-1 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Bottom Actions inside bulk card */}
            <div className="flex gap-2 border-t border-slate-900 pt-3 shrink-0">
              <button
                onClick={triggerBulkPDFDownload}
                disabled={bulkReports.filter(r => r.status === "success").length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white p-2 text-[10.5px] rounded-lg font-bold uppercase transition select-none cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                Export PDFs
              </button>
              <button
                onClick={registerAllToLeaderboard}
                disabled={isRegisteringBulk || bulkReports.filter(r => r.status === "success").length === 0}
                className="flex-1 flex items-center justify-center gap-1.5 bg-cyan-500 hover:bg-cyan-400 disabled:opacity-40 text-slate-950 p-2 text-[10.5px] rounded-lg font-bold uppercase transition select-none cursor-pointer"
              >
                {isRegisteringBulk ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Award className="w-3.5 h-3.5" />}
                Add to Board
              </button>
              <button
                onClick={() => setBulkReports([])}
                disabled={bulkReports.length === 0}
                className="px-2.5 bg-slate-800 hover:bg-slate-700 hover:text-white text-slate-350 p-2 text-[10.5px] rounded-lg transition select-none cursor-pointer"
              >
                Reset
              </button>
            </div>
          </div>
        ) : (
          <div
            id="align_container"
            ref={containerRef}
            onPointerDown={handleContainerPointerDown}
            onPointerMove={handleContainerPointerMove}
            onPointerUp={handleContainerPointerUp}
            onPointerLeave={handleContainerPointerUp}
            className="relative w-full max-w-[580px] md:max-w-[620px] aspect-square rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-850 hover:border-slate-800 bg-slate-950 select-none cursor-pointer"
          >
            {/* Draggable Calibration markers wrapper over image (upload mode) */}
            {mode !== "digital" && imageSrc && (
              <div className="absolute inset-0 w-full h-full pointer-events-none z-20">
                {markers.map((m) => {
                  const px = `${m.x}%`;
                  const py = `${m.y}%`;
                  const active = activeMarkerId === m.id;
                  return (
                    <div
                      key={m.id}
                      style={{ left: px, top: py, transform: "translate(-50%, -50%)" }}
                      className="absolute pointer-events-auto"
                      onPointerDown={(e) => { e.stopPropagation(); setActiveMarkerId(m.id); setIsDrawing(false); }}
                    >
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center transition border-2 ${
                          active
                            ? "border-emerald-400 bg-emerald-950/80 scale-110"
                            : m.id === "C"
                            ? "border-yellow-400 bg-yellow-950/50 hover:border-yellow-300 hover:scale-105 shadow-[0_0_12px_rgba(234,179,8,0.4)]"
                            : m.id === "ML" || m.id === "MR"
                            ? "border-cyan-400 bg-cyan-950/50 hover:border-cyan-300 hover:scale-105 shadow-[0_0_12px_rgba(6,182,212,0.4)]"
                            : "border-rose-500 bg-rose-950/50 hover:border-rose-400 hover:scale-105 shadow-[0_0_12px_rgba(244,63,94,0.4)]"
                        } shadow-2xl cursor-grab active:cursor-grabbing`}
                      >
                        <span className="text-[7.5px] font-mono text-white font-black uppercase text-center px-1">
                          {m.id}
                        </span>
                      </div>
                      <span className="absolute top-10 left-1/2 transform -translate-x-1/2 bg-slate-900/90 backdrop-blur-sm border border-slate-700/80 text-[6.5px] text-slate-200 font-semibold font-mono px-1.5 py-0.5 rounded shadow whitespace-nowrap">
                        {m.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Video stream rendering for camera captures */}
            {isCameraActive && (
              <div className="absolute inset-0 w-full h-full bg-slate-950 flex flex-col justify-between items-center p-3 z-10">
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className="w-full h-full object-cover filter brightness-105"
                />
                <button
                  onClick={capturePhoto}
                  className="absolute bottom-4 bg-rose-600 border-2 border-white hover:bg-rose-500 w-12 h-12 rounded-full flex items-center justify-center shadow-lg transform active:scale-95 transition"
                />
              </div>
            )}

            {/* Core Canvas Processor */}
            <canvas
              ref={mainCanvasRef}
              width="500"
              height="500"
              className="w-full h-full object-contain pointer-events-auto"
              onPointerDown={(e) => {
                if (mode === "digital") {
                  setIsDrawing(true);
                  handleDigitalDrawing(e);
                }
              }}
              onPointerMove={(e) => {
                if (mode === "digital" && isDrawing) {
                  handleDigitalDrawing(e);
                }
              }}
              onPointerUp={() => {
                if (mode === "digital") setIsDrawing(false);
              }}
            />

            {/* Processing Loading Screen */}
            {isProcessing && (
              <div className="absolute inset-0 bg-slate-950/85 flex flex-col items-center justify-center gap-3 backdrop-blur-sm z-30">
                <RefreshCw className="w-10 h-10 text-cyan-400 animate-spin" />
                <span className="font-mono text-sm tracking-widest text-slate-300 uppercase animate-pulse">
                  Aligning & Processing Ink Path...
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  Newtonian telemetry solving underway.
                </span>
              </div>
            )}
          </div>
        )}

      </div>

      {mode !== "digital" && imageSrc ? (
        <div className="w-full max-w-[620px] bg-slate-900/60 border border-slate-800 rounded-xl p-4 mt-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider block">Calibration Preset Format</span>
              <p className="text-[11px] text-slate-300">Match coordinates to your printed paper's design:</p>
            </div>
            
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 shrink-0">
              <button
                onClick={() => setCalibrationPreset("qr")}
                className={`px-2.5 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase transition ${
                  calibrationPreset === "qr"
                    ? "bg-cyan-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                QR Targets (New)
              </button>
              <button
                onClick={() => setCalibrationPreset("corners")}
                className={`px-2.5 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase transition ${
                  calibrationPreset === "corners"
                    ? "bg-cyan-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                Full Sheet (Old)
              </button>
              <button
                onClick={() => setCalibrationPreset("borders")}
                className={`px-2.5 py-1.5 rounded-md text-[10px] font-mono font-bold uppercase transition ${
                  calibrationPreset === "borders"
                    ? "bg-cyan-500 text-slate-950 shadow-md"
                    : "text-slate-400 hover:text-white"
                }`}
              >
                10% Border Grid
              </button>
            </div>
          </div>
          
          <div className="text-[11px] leading-relaxed text-slate-400 bg-slate-950/40 p-2.5 rounded-md border border-slate-850/60 space-y-1">
            {calibrationPreset === "qr" && (
              <p>
                🎯 <b>QR Targets (6% to 94% margins):</b> Align each of the 4 red calibration circles directly on the centers of the printed black-and-white QR codes on your page.
              </p>
            )}
            {calibrationPreset === "corners" && (
              <p>
                📐 <b>Full Sheet Corners (0% to 100% full bleed):</b> Align each of the 4 red circles precisely onto the four outermost physical corners of your printed template sheet!
              </p>
            )}
            {calibrationPreset === "borders" && (
              <p>
                🔲 <b>10% Border Grid:</b> Align each of the 4 red circles onto the inner dashed coordinate boundaries (10% sheet margins).
              </p>
            )}
            <div className="pt-1 border-t border-slate-900 text-[10px] text-yellow-500 font-medium font-mono">
              💡 <b>Live Hologram Alignment:</b> Slide the red pins around. The blue racetrack overlay projected on the image above will wrap in real-time. Line up this blue guide perfectly over the black road lines on your photo, then hit <b>Warp Scan</b>!
            </div>
          </div>
        </div>
      ) : (
        mode === "bulk" ? (
          <p className="text-[11px] font-mono text-slate-400 mt-3 text-center uppercase tracking-wider bg-slate-950/40 px-3 py-1.5 rounded-md border border-slate-850/60 mt-4 max-w-[620px] w-full">
            📥 Batch analyze classroom sketches under aligned perspective coordinates
          </p>
        ) : mode === "digital" ? (
          <p className="text-[11px] font-mono text-slate-400 mt-3 text-center uppercase tracking-wider bg-slate-950/40 px-3 py-1.5 rounded-md border border-slate-850/60 mt-4 max-w-[620px] w-full">
            🖱️ Drag your pointer or finger over the tarmac track to sketch apex adjustments
          </p>
        ) : (
          imageSrc && (
            <p className="text-[11px] font-mono text-slate-400 mt-3 text-center uppercase tracking-wider bg-slate-950/40 px-3 py-1.5 rounded-md border border-slate-850/60 mt-4 max-w-[620px] w-full">
              🎯 Move the red calibration spheres onto the 4 printed paper corner QR targets
            </p>
          )
        )
      )}

      {/* Bottom Information & Action Buttons Grid */}
      <div className="w-full border-t border-slate-800 mt-6 pt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* Left Hand: Explanatory Prompt Contexts */}
        <div className="md:col-span-7 flex flex-col justify-start">
          <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block">
            {mode === "bulk" ? "Mass Ink Digitizer Queue" : mode === "digital" ? "Interactive Canvas Simulation" : mode === "camera" ? "Digital Camera Frame capture" : "Manual Photo Alignment"}
          </span>
          <h3 className="text-base font-bold font-sans tracking-tight mt-1 mb-2">
            {mode === "bulk" ? "Academy Field Day Processor" : mode === "digital" ? "Digital Race Sketchpad Focus" : "Computer Vision Core Align"}
          </h3>

          {mode === "bulk" ? (
            <div className="space-y-3 text-xs leading-relaxed text-slate-300 max-w-xl">
              <p>
                Got student drawings? Upload all of them together! This panel processes all images asynchronously, computes telemetry, formats downloadable classroom reports, and automatically aligns them.
              </p>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono space-y-1 text-slate-400 text-[10.5px]">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-emerald-500 rounded-full shrink-0"></span><span>Supports JPEG, PNG and camera photo sheets</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-cyan-400 rounded-full shrink-0"></span><span>Align corner QR bounds in "Photo Upload" once to calibrate</span></div>
              </div>
            </div>
          ) : mode === "digital" ? (
            <div className="space-y-3 text-xs leading-relaxed text-slate-300 max-w-xl">
              <p>
                No printer? No problem! Trace arbitrary curves on screen to auto-snap apex offsets. This centers the racetrack canvas to display at maximum size for high fidelity input.
              </p>
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono space-y-1.5 text-slate-400 text-[11px]">
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-yellow-500 rounded-full shrink-0"></span><span>Yellow indicators represent custom peak corner offsets</span></div>
                <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-cyan-450 bg-cyan-400 rounded-full shrink-0"></span><span>Tarmac boundaries represent tire grip thresholds</span></div>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-xs leading-relaxed text-slate-300 max-w-xl">
              <p>
                Upload your sketched track photograph! Pinpoint the 4 corner calibration anchors to activate our <b>Bilinear Homography Warp Matrix</b> and extract drawn lines natively.
              </p>
              
              {!imageSrc && (
                <div className="border border-dashed border-slate-800 bg-slate-950/40 p-4 rounded-lg text-center flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8 text-slate-600 animate-pulse" />
                  <div>
                    <span className="text-slate-300 font-bold text-xs block">No Photograph Uploaded</span>
                    <span className="text-[10px] font-mono text-slate-500 block">Please browse or stream a capture frame below.</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Hand: Trigger buttons */}
        <div className="md:col-span-5 flex flex-col gap-2 self-start w-full">
          <span className="text-xs font-mono text-slate-400 font-bold uppercase tracking-wider block mb-2">
            Action Controls
          </span>
          {mode === "bulk" ? (
            <div className="text-xs text-slate-400 bg-slate-950 p-3.5 rounded-lg border border-slate-800 space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-white uppercase font-sans tracking-tight">
                <CheckCircle className="w-4 h-4 text-emerald-400" />
                <span>Batch Controls Active</span>
              </div>
              <p className="leading-normal">
                All uploaded user drawings are displayed inside the queue tracker card. Update individual driver aliases and download custom PDF academy reports automatically.
              </p>
            </div>
          ) : mode === "digital" ? (
            <div className="flex gap-2">
              <button
                onClick={submitDigitalRacingLine}
                className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold p-3.5 rounded-lg text-xs font-sans tracking-wider uppercase transition shadow-md cursor-pointer"
              >
                <Check className="w-4 h-4" />
                Simulate Lap Speed
              </button>
              <button
                onClick={() => setUserOffsetDeltas(new Array(track.points.length).fill(0))}
                className="flex items-center px-4 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 transition shrink-0 cursor-pointer"
                title="Reset Track Line"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <div className="space-y-2 w-full">
              {/* File picker triggers invisible */}
              <input
                type="file"
                accept="image/*,.heic,.heif"
                ref={fileInputRef}
                onChange={handleFileUpload}
                className="hidden"
              />
              
              {!imageSrc ? (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 p-3 rounded-lg text-xs font-sans tracking-wider uppercase transition font-bold cursor-pointer"
                >
                  <Upload className="w-4 h-4 text-cyan-400" />
                  Browse Photo File
                </button>
              ) : (
                <div className="flex flex-col sm:flex-row gap-2 w-full">
                  <button
                    onClick={runVisualAnalysis}
                    disabled={isProcessing}
                    className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-3.5 rounded-lg text-xs font-sans tracking-wider uppercase transition shadow-md disabled:opacity-50 cursor-pointer"
                  >
                    <ZoomIn className="w-4 h-4" />
                    {isExtracted ? "Re-Extract Line" : "Warp Scan & Extract"}
                  </button>
                  {isExtracted && (
                    <button
                      onClick={submitUploadedRacingLine}
                      disabled={isProcessing}
                      className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold p-3.5 rounded-lg text-xs font-sans tracking-wider uppercase transition shadow-md cursor-pointer animate-pulse"
                    >
                      <Check className="w-4 h-4" />
                      Simulate Lap Speed
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setImageSrc(null);
                      setIsExtracted(false);
                      setMarkers([
                        { id: "TL", x: 10, y: 10, label: "Top-Left (TL)" },
                        { id: "ML", x: 10, y: 50, label: "Mid-Left (ML)" },
                        { id: "BL", x: 10, y: 90, label: "Bottom-Left (BL)" },
                        { id: "TR", x: 90, y: 10, label: "Top-Right (TR)" },
                        { id: "MR", x: 90, y: 50, label: "Mid-Right (MR)" },
                        { id: "BR", x: 90, y: 90, label: "Bottom-Right (BR)" },
                        { id: "C",  x: 50, y: 50, label: "Center Align (C)" }
                      ]);
                    }}
                    className="flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-750 rounded-lg transition shrink-0 cursor-pointer text-xs font-bold"
                  >
                    Clear Photo
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
