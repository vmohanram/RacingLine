import React, { useState, useRef, useEffect } from "react";
import { Camera, Upload, Edit3, Image as ImageIcon, Check, RefreshCw, ZoomIn, Eye } from "lucide-react";
import { Track, getIdealRacingLineOffset } from "../tracksData";
import { simulateLap, TelemetrySummary } from "../physicsEngine";

interface VisionSystemProps {
  track: Track;
  onAnalysisComplete: (summary: TelemetrySummary, base64Image?: string) => void;
}

type InputMode = "digital" | "upload" | "camera";

export default function VisionSystem({ track, onAnalysisComplete }: VisionSystemProps) {
  const [mode, setMode] = useState<InputMode>("digital");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  
  // DRAGGABLE MARKERS FORperspective mapping (normalized % of container)
  const [markers, setMarkers] = useState([
    { id: "TL", x: 10, y: 10, label: "Top-Left QR" },
    { id: "TR", x: 90, y: 10, label: "Top-Right QR" },
    { id: "BL", x: 10, y: 90, label: "Bottom-Left QR" },
    { id: "BR", x: 90, y: 90, label: "Bottom-Right QR" }
  ]);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);

  // Digital Drawing State
  const [userOffsetDeltas, setUserOffsetDeltas] = useState<number[]>(new Array(track.points.length).fill(0));
  const [isDrawing, setIsDrawing] = useState(false);

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
  }, [track, mode, imageSrc, markers, userOffsetDeltas, isCameraActive]);

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

  // Convert uploaded file to base64
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setImageSrc(event.target.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
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

  const drawCanvas = () => {
    if (!mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, 500, 500);

    // Context drawing depending on uploaded photos/camera snaps
    if (mode !== "digital" && imageSrc) {
      const img = new Image();
      img.onload = () => {
        // Draw the uploaded original picture flat on background
        ctx.save();
        ctx.globalAlpha = 0.85;
        ctx.drawImage(img, 0, 0, 500, 500);
        ctx.restore();

        // Draw track centerline path translucent so user sees outline alignment!
        drawTrackCenterPath(ctx, "rgba(6, 182, 212, 0.25)", 22);
        drawTrackCenterPath(ctx, "rgba(255, 255, 255, 0.45)", 1.5, true);
        
        // Render current calibration markers directly on the Canvas for visuals
        markers.forEach((m) => {
          const px = (m.x / 100) * 500;
          const py = (m.y / 100) * 500;
          ctx.beginPath();
          ctx.arc(px, py, 14, 0, 2 * Math.PI);
          ctx.fillStyle = "rgba(244, 63, 94, 0.2)";
          ctx.fill();
          ctx.lineWidth = 2;
          ctx.strokeStyle = "#f43f5e";
          ctx.stroke();

          ctx.beginPath();
          ctx.arc(px, py, 3, 0, 2 * Math.PI);
          ctx.fillStyle = "#ffffff";
          ctx.fill();
        });
      };
      img.src = imageSrc;
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
    ctx.beginPath();
    ctx.arc(firstPt.x, firstPt.y, 6, 0, 2 * Math.PI);
    ctx.fillStyle = "#e11d48";
    ctx.fill();
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 1.5;
    ctx.stroke();
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

  // BILINEAR Homography warp mapping function
  // Transforms normalized coordinates [0..500] in template space
  // back to [0..500] coordinate space of photographed, aligned canvas
  const getBilinearProjectedCoordinate = (tx: number, ty: number) => {
    const u = tx / 500;
    const v = ty / 500;

    const m00 = markers.find((m) => m.id === "TL") || { x: 0, y: 0 };
    const m10 = markers.find((m) => m.id === "TR") || { x: 100, y: 0 };
    const m01 = markers.find((m) => m.id === "BL") || { x: 0, y: 100 };
    const m11 = markers.find((m) => m.id === "BR") || { x: 100, y: 100 };

    // Convert % markers back to 500px canvas dimension space
    const TL_x = (m00.x / 100) * 500;
    const TL_y = (m00.y / 100) * 500;
    const TR_x = (m10.x / 100) * 500;
    const TR_y = (m10.y / 100) * 500;
    const BL_x = (m01.x / 100) * 500;
    const BL_y = (m01.y / 100) * 500;
    const BR_x = (m11.x / 100) * 500;
    const BR_y = (m11.y / 100) * 500;

    // Bilinear interpolation
    const px = (1 - u) * (1 - v) * TL_x + u * (1 - v) * TR_x + (1 - u) * v * BL_x + u * v * BR_x;
    const py = (1 - u) * (1 - v) * TL_y + u * (1 - v) * TR_y + (1 - u) * v * BL_y + u * v * BR_y;

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

              // Project template coordinate to actual paper photo canvas space
              const projected = getBilinearProjectedCoordinate(templatX, templatY);
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

          // Apply to state and trigger simulation in telemetry panel!
          setUserOffsetDeltas(smoothedOffsets);

          // Calculate actual 2D coordinates for physics solver
          const userPointsArray = track.points.map((pT, idx) => {
            const offs = smoothedOffsets[idx];
            const next = track.points[idx === track.points.length - 1 ? 0 : idx + 1];
            const prev = track.points[idx === 0 ? track.points.length - 1 : idx - 1];
            const tx = next.x - prev.x;
            const ty = next.y - prev.y;
            const len = Math.sqrt(tx * tx + ty * ty);
            const nx = -ty / (len || 1);
            const ny = tx / (len || 1);

            return {
              x: pT.x + offs * nx,
              y: pT.y + offs * ny
            };
          });

          const summaryResult = simulateLap(track, userPointsArray);
          onAnalysisComplete(summaryResult, imageSrc);
          setIsProcessing(false);
        }
      };
      img.src = imageSrc;

    }, 1200);
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
    <div id="vision_system_panel" className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-white shadow-xl">
      <div className="flex items-center justify-between mb-5 border-b border-slate-850 border-slate-800 pb-3">
        <h2 className="text-base font-bold font-sans tracking-tight flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyan-400" />
          Optical Vision Scan & Sketch Interface
        </h2>
        
        {/* Toggle Modes selection */}
        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono">
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
        </div>
      </div>

      {/* Main Alignment & Render Stage */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        <div className="col-span-1 md:col-span-12 lg:col-span-7 flex flex-col items-center">
          
          <div
            id="align_container"
            ref={containerRef}
            onPointerMove={handleContainerPointerMove}
            onPointerUp={handleContainerPointerUp}
            onPointerLeave={handleContainerPointerUp}
            className="relative w-full max-w-[420px] aspect-square rounded-xl overflow-hidden shadow-2xl border-2 border-slate-800 bg-slate-950 select-none cursor-pointer"
          >
            
            {/* Draggable Calibration markers wrapper over image (upload mode) */}
            {mode !== "digital" && imageSrc && (
              <div 
                className="absolute inset-0 z-20 pointer-events-auto"
                onPointerDown={handleContainerPointerDown}
              >
                {markers.map((m) => (
                  <div
                    id={`maker_anchor_${m.id}`}
                    key={m.id}
                    className="absolute -translate-x-1/2 -translate-y-1/2 cursor-crosshair group pointer-events-none"
                    style={{ left: `${m.x}%`, top: `${m.y}%` }}
                  >
                    <div className="w-8 h-8 rounded-full border-2 border-rose-500 bg-rose-500/20 flex items-center justify-center animate-pulse group-hover:scale-110 transition pointer-events-none">
                      <div className="w-2.5 h-2.5 bg-rose-500 rounded-full" />
                    </div>
                    <span className="absolute left-10 top-0 text-[9px] font-mono whitespace-nowrap bg-slate-900 border border-slate-700 text-rose-300 px-1 py-0.5 rounded shadow">
                      {m.label}
                    </span>
                  </div>
                ))}
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
              <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center gap-3 backdrop-blur-xs z-30">
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

          {mode === "digital" ? (
            <p className="text-[11px] font-mono text-slate-400 mt-2 text-center uppercase tracking-wider">
              Drag your cursor/finger over the tarmac track to sketch your racing line
            </p>
          ) : (
            imageSrc && (
              <p className="text-[11px] font-mono text-slate-400 mt-2 text-center uppercase tracking-wider">
                Align the 4 red circles precisely on the 4 printed paper corner QR labels
              </p>
            )
          )}
        </div>

        {/* Info & Operational Guideline actions */}
        <div className="col-span-1 md:col-span-12 lg:col-span-5 flex flex-col justify-between self-stretch">
          
          <div className="space-y-4">
            <div>
              <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block">
                {mode === "digital" ? "Interactive Canvas Simulation" : mode === "camera" ? "Digital Camera Frame capturing" : "Manual Snappings"}
              </span>
              <h3 className="text-base font-bold font-sans tracking-tight mt-1">
                {mode === "digital" ? "Digital Race Sketchpad" : "Computer Vision Core"}
              </h3>
            </div>

            {mode === "digital" ? (
              <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                <p>
                  No print facility? No problem! Use this digital canvas as an intuitive sketchpad. Tracing curves on the screen auto-snaps offsets to compute speed positions instantly.
                </p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-800 font-mono space-y-1.5 text-slate-400">
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-yellow-500 rounded-full shrink-0"></span><span>Orange nodes = custom apex offsets</span></div>
                  <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-cyan-400 rounded-full shrink-0"></span><span>Tarmac lane is maximum tracking grip width</span></div>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-xs leading-relaxed text-slate-300">
                <p>
                  Upload your printed/sketched paper photograph! Position our corner markers so our <b>Bilinear Matrix Warping</b> scanner extracts coordinates with absolute sub-pixel accuracy.
                </p>
                
                {!imageSrc && (
                  <div className="border border-dashed border-slate-700 bg-slate-950/40 p-6 rounded-lg text-center flex flex-col items-center gap-3">
                    <ImageIcon className="w-10 h-10 text-slate-500 animate-pulse" />
                    <div>
                      <span className="text-slate-300 font-bold block mb-1">No Image Loaded</span>
                      <span className="text-[11px] font-mono text-slate-500">Pick a photographed file or engage the live camera stream.</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-col gap-2">
            {mode === "digital" ? (
              <div className="flex gap-2">
                <button
                  onClick={submitDigitalRacingLine}
                  className="flex-1 flex items-center justify-center gap-2 bg-rose-600 hover:bg-rose-500 text-white font-bold p-3 rounded-lg text-xs font-sans tracking-wider uppercase transition shadow-md"
                >
                  <Check className="w-4 h-4" />
                  Simulate Lap Speed
                </button>
                <button
                  onClick={() => setUserOffsetDeltas(new Array(track.points.length).fill(0))}
                  className="flex items-center px-4 bg-slate-800 hover:bg-slate-705 rounded-lg border border-slate-700 text-slate-300 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="space-y-2">
                {/* File picker triggers invisible */}
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                
                {!imageSrc ? (
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 bg-slate-850 hover:bg-slate-800 text-slate-200 border border-slate-700 p-3 rounded-lg text-xs font-sans tracking-wider uppercase transition font-bold"
                  >
                    <Upload className="w-4 h-4 text-cyan-400" />
                    Browse Photo File
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={runVisualAnalysis}
                      disabled={isProcessing}
                      className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-3 rounded-lg text-xs font-sans tracking-wider uppercase transition shadow-md disabled:opacity-50"
                    >
                      <ZoomIn className="w-4 h-4" />
                      Warp Scan & Extract
                    </button>
                    <button
                      onClick={() => { setImageSrc(null); setMarkers([{ id: "TL", x: 10, y: 10, label: "Top-Left QR" }, { id: "TR", x: 90, y: 10, label: "Top-Right QR" }, { id: "BL", x: 10, y: 90, label: "Bottom-Left QR" }, { id: "BR", x: 90, y: 90, label: "Bottom-Right QR" }]); }}
                      className="flex items-center px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-lg transition"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
