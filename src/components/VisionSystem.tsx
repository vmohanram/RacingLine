import React, { useState, useRef, useEffect } from "react";
// @ts-ignore
import heic2any from "heic2any";
import { Upload, Edit3, Image as ImageIcon, RefreshCw, ZoomIn, Eye } from "lucide-react";
import { Track, getIdealRacingLineOffset, transformPointForTemplate } from "../tracksData";
import { simulateLap, TelemetrySummary } from "../physicsEngine";
import TrackTemplateGenerator from "./TrackTemplateGenerator";

export interface AnalysisAssets {
  reportTrackImage?: string;
  sourceImage?: string;
}

interface VisionSystemProps {
  track: Track;
  onAnalysisComplete: (summary: TelemetrySummary, assets?: AnalysisAssets) => void | Promise<void>;
  onAnalysisInvalidated?: () => void;
  driverName: string;
  onDriverNameChange: (value: string) => void;
  hoveredTelemetryIndex: number | null;
  summary?: TelemetrySummary | null;
}

type InputMode = "digital" | "upload";

interface CalibrationMarker {
  id: string;
  x: number;
  y: number;
  label: string;
}

interface Point2D {
  x: number;
  y: number;
}

const NORMALIZED_TRACK_SIZE = 500;
const NORMALIZED_PAGE_HEIGHT = 750;

const DEFAULT_MARKERS: CalibrationMarker[] = [
  { id: "TL", x: 10, y: 10, label: "Top-Left (TL)" },
  { id: "ML", x: 10, y: 50, label: "Mid-Left (ML)" },
  { id: "BL", x: 10, y: 90, label: "Bottom-Left (BL)" },
  { id: "TR", x: 90, y: 10, label: "Top-Right (TR)" },
  { id: "MR", x: 90, y: 50, label: "Mid-Right (MR)" },
  { id: "BR", x: 90, y: 90, label: "Bottom-Right (BR)" },
  { id: "C", x: 50, y: 50, label: "Center Align (C)" }
];

const EXPECTED_FIDUCIALS: Record<string, { x: number; y: number; label: string; kind: "dark" | "cyan" | "amber" }> = {
  TL: { x: 30, y: 30, label: "Top-Left (TL)", kind: "dark" },
  ML: { x: 30, y: 250, label: "Mid-Left (ML)", kind: "cyan" },
  BL: { x: 30, y: 470, label: "Bottom-Left (BL)", kind: "dark" },
  TR: { x: 470, y: 30, label: "Top-Right (TR)", kind: "dark" },
  MR: { x: 470, y: 250, label: "Mid-Right (MR)", kind: "cyan" },
  BR: { x: 470, y: 470, label: "Bottom-Right (BR)", kind: "dark" },
  C: { x: 250, y: 250, label: "Center Align (C)", kind: "amber" }
};

function cloneDefaultMarkers(): CalibrationMarker[] {
  return DEFAULT_MARKERS.map((marker) => ({ ...marker }));
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function getLuminance(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLikelyPaperPixel(r: number, g: number, b: number): boolean {
  const luminance = getLuminance(r, g, b);
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  return luminance > 165 && (spread < 55 || luminance > 220);
}

function polygonArea(points: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const current = points[i];
    const next = points[(i + 1) % points.length];
    area += current.x * next.y - next.x * current.y;
  }
  return Math.abs(area / 2);
}

function detectPaperQuadrilateral(img: HTMLImageElement): Point2D[] | null {
  const maxDimension = 900;
  const scale = Math.min(1, maxDimension / Math.max(img.naturalWidth || img.width, img.naturalHeight || img.height));
  const width = Math.max(1, Math.round((img.naturalWidth || img.width) * scale));
  const height = Math.max(1, Math.round((img.naturalHeight || img.height) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(img, 0, 0, width, height);
  const { data } = ctx.getImageData(0, 0, width, height);
  const step = Math.max(2, Math.floor(Math.min(width, height) / 220));

  let brightCount = 0;
  let bestTL: Point2D | null = null;
  let bestTR: Point2D | null = null;
  let bestBR: Point2D | null = null;
  let bestBL: Point2D | null = null;
  let tlScore = Number.POSITIVE_INFINITY;
  let trScore = Number.NEGATIVE_INFINITY;
  let brScore = Number.NEGATIVE_INFINITY;
  let blScore = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];
      if (!isLikelyPaperPixel(r, g, b)) continue;

      brightCount++;
      const sum = x + y;
      const diff = x - y;
      const invDiff = y - x;

      if (sum < tlScore) {
        tlScore = sum;
        bestTL = { x, y };
      }
      if (diff > trScore) {
        trScore = diff;
        bestTR = { x, y };
      }
      if (sum > brScore) {
        brScore = sum;
        bestBR = { x, y };
      }
      if (invDiff > blScore) {
        blScore = invDiff;
        bestBL = { x, y };
      }
    }
  }

  if (!bestTL || !bestTR || !bestBR || !bestBL || brightCount < 250) {
    return null;
  }

  const quad = [bestTL, bestTR, bestBR, bestBL];
  if (polygonArea(quad) < width * height * 0.2) {
    return null;
  }

  return quad.map((point) => ({ x: point.x / scale, y: point.y / scale }));
}

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index]]);

  for (let column = 0; column < size; column++) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row++) {
      if (Math.abs(augmented[row][column]) > Math.abs(augmented[pivotRow][column])) {
        pivotRow = row;
      }
    }

    if (Math.abs(augmented[pivotRow][column]) < 1e-8) {
      return null;
    }

    if (pivotRow !== column) {
      [augmented[column], augmented[pivotRow]] = [augmented[pivotRow], augmented[column]];
    }

    const pivot = augmented[column][column];
    for (let current = column; current <= size; current++) {
      augmented[column][current] /= pivot;
    }

    for (let row = 0; row < size; row++) {
      if (row === column) continue;
      const factor = augmented[row][column];
      for (let current = column; current <= size; current++) {
        augmented[row][current] -= factor * augmented[column][current];
      }
    }
  }

  return augmented.map((row) => row[size]);
}

function computeHomography(source: Point2D[], target: Point2D[]): number[] | null {
  const matrix: number[][] = [];
  const vector: number[] = [];

  for (let i = 0; i < 4; i++) {
    const src = source[i];
    const dst = target[i];

    matrix.push([src.x, src.y, 1, 0, 0, 0, -dst.x * src.x, -dst.x * src.y]);
    vector.push(dst.x);
    matrix.push([0, 0, 0, src.x, src.y, 1, -dst.y * src.x, -dst.y * src.y]);
    vector.push(dst.y);
  }

  const solution = solveLinearSystem(matrix, vector);
  if (!solution) return null;
  return [
    solution[0], solution[1], solution[2],
    solution[3], solution[4], solution[5],
    solution[6], solution[7], 1
  ];
}

function projectHomography(matrix: number[], point: Point2D): Point2D {
  const denominator = matrix[6] * point.x + matrix[7] * point.y + matrix[8];
  if (Math.abs(denominator) < 1e-8) {
    return point;
  }

  return {
    x: (matrix[0] * point.x + matrix[1] * point.y + matrix[2]) / denominator,
    y: (matrix[3] * point.x + matrix[4] * point.y + matrix[5]) / denominator
  };
}

function warpImageFromQuad(
  img: HTMLImageElement,
  sourceQuad: Point2D[],
  outputWidth: number,
  outputHeight: number
): HTMLCanvasElement | null {
  const homography = computeHomography(
    [
      { x: 0, y: 0 },
      { x: outputWidth - 1, y: 0 },
      { x: outputWidth - 1, y: outputHeight - 1 },
      { x: 0, y: outputHeight - 1 }
    ],
    sourceQuad
  );
  if (!homography) return null;

  const sourceCanvas = document.createElement("canvas");
  sourceCanvas.width = img.naturalWidth || img.width;
  sourceCanvas.height = img.naturalHeight || img.height;
  const sourceCtx = sourceCanvas.getContext("2d", { willReadFrequently: true });
  if (!sourceCtx) return null;
  sourceCtx.drawImage(img, 0, 0, sourceCanvas.width, sourceCanvas.height);
  const sourceData = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height).data;

  const outputCanvas = document.createElement("canvas");
  outputCanvas.width = outputWidth;
  outputCanvas.height = outputHeight;
  const outputCtx = outputCanvas.getContext("2d");
  if (!outputCtx) return null;

  const outputImage = outputCtx.createImageData(outputWidth, outputHeight);
  const outputData = outputImage.data;
  const maxX = sourceCanvas.width - 1;
  const maxY = sourceCanvas.height - 1;

  for (let y = 0; y < outputHeight; y++) {
    for (let x = 0; x < outputWidth; x++) {
      const sourcePoint = projectHomography(homography, { x, y });
      const sx = Math.max(0, Math.min(maxX, sourcePoint.x));
      const sy = Math.max(0, Math.min(maxY, sourcePoint.y));
      const baseX = Math.floor(sx);
      const baseY = Math.floor(sy);
      const nextX = Math.min(maxX, baseX + 1);
      const nextY = Math.min(maxY, baseY + 1);
      const tx = sx - baseX;
      const ty = sy - baseY;

      const topLeft = (baseY * sourceCanvas.width + baseX) * 4;
      const topRight = (baseY * sourceCanvas.width + nextX) * 4;
      const bottomLeft = (nextY * sourceCanvas.width + baseX) * 4;
      const bottomRight = (nextY * sourceCanvas.width + nextX) * 4;
      const targetIndex = (y * outputWidth + x) * 4;

      for (let channel = 0; channel < 4; channel++) {
        const top = sourceData[topLeft + channel] * (1 - tx) + sourceData[topRight + channel] * tx;
        const bottom = sourceData[bottomLeft + channel] * (1 - tx) + sourceData[bottomRight + channel] * tx;
        outputData[targetIndex + channel] = top * (1 - ty) + bottom * ty;
      }
    }
  }

  outputCtx.putImageData(outputImage, 0, 0);
  return outputCanvas;
}

function classifyMarkerPixel(kind: "dark" | "cyan" | "amber", r: number, g: number, b: number): boolean {
  const luminance = getLuminance(r, g, b);
  const channelSpread = Math.max(r, g, b) - Math.min(r, g, b);
  const isMonochromeDark = luminance < 150 && channelSpread < 45;
  if (kind === "dark") {
    return luminance < 115 || isMonochromeDark;
  }
  if (kind === "cyan") {
    return (b > 95 && g > 95 && r < 100) || isMonochromeDark;
  }
  return (r > 130 && g > 95 && b < 95) || isMonochromeDark;
}

function extractTrackSquare(
  source: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): HTMLCanvasElement | null {
  const trackCanvas = document.createElement("canvas");
  trackCanvas.width = NORMALIZED_TRACK_SIZE;
  trackCanvas.height = NORMALIZED_TRACK_SIZE;
  const trackCtx = trackCanvas.getContext("2d");
  if (!trackCtx) {
    return null;
  }

  const cropSize = Math.max(1, Math.min(sourceWidth, sourceHeight));
  trackCtx.drawImage(source, 0, 0, cropSize, cropSize, 0, 0, NORMALIZED_TRACK_SIZE, NORMALIZED_TRACK_SIZE);
  return trackCanvas;
}

function detectFiducialMarkers(trackCanvas: HTMLCanvasElement): CalibrationMarker[] {
  const ctx = trackCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return cloneDefaultMarkers();

  const { data, width, height } = ctx.getImageData(0, 0, trackCanvas.width, trackCanvas.height);

  return Object.entries(EXPECTED_FIDUCIALS).map(([id, fiducial]) => {
    const radius = id === "C" ? 42 : 36;
    let sumX = 0;
    let sumY = 0;
    let matches = 0;

    for (let y = Math.max(0, fiducial.y - radius); y <= Math.min(height - 1, fiducial.y + radius); y++) {
      for (let x = Math.max(0, fiducial.x - radius); x <= Math.min(width - 1, fiducial.x + radius); x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        if (!classifyMarkerPixel(fiducial.kind, r, g, b)) continue;
        sumX += x;
        sumY += y;
        matches++;
      }
    }

    const centerX = matches > 60 ? sumX / matches : fiducial.x;
    const centerY = matches > 60 ? sumY / matches : fiducial.y;
    return {
      id,
      label: fiducial.label,
      x: Number(((centerX / NORMALIZED_TRACK_SIZE) * 100).toFixed(1)),
      y: Number(((centerY / NORMALIZED_TRACK_SIZE) * 100).toFixed(1))
    };
  });
}

async function autoNormalizeUpload(src: string): Promise<{ imageSrc: string; markers: CalibrationMarker[] } | null> {
  const img = await loadImageElement(src);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const expectedPageRatio = NORMALIZED_PAGE_HEIGHT / NORMALIZED_TRACK_SIZE;
  const sourceRatio = sourceHeight / Math.max(sourceWidth, 1);
  const looksLikePreScannedPage = Math.abs(sourceRatio - expectedPageRatio) < 0.22;

  if (looksLikePreScannedPage) {
    const preScannedTrack = extractTrackSquare(img, sourceWidth, sourceHeight);
    if (preScannedTrack) {
      return {
        imageSrc: preScannedTrack.toDataURL("image/png"),
        markers: detectFiducialMarkers(preScannedTrack)
      };
    }
  }

  const paperQuad = detectPaperQuadrilateral(img);
  if (!paperQuad) {
    return null;
  }

  const normalizedPage = warpImageFromQuad(img, paperQuad, NORMALIZED_TRACK_SIZE, NORMALIZED_PAGE_HEIGHT);
  if (!normalizedPage) {
    return null;
  }

  const trackCanvas = extractTrackSquare(
    normalizedPage,
    normalizedPage.width,
    normalizedPage.height
  );
  if (!trackCanvas) {
    return null;
  }

  return {
    imageSrc: trackCanvas.toDataURL("image/png"),
    markers: detectFiducialMarkers(trackCanvas)
  };
}

export default function VisionSystem({
  track,
  onAnalysisComplete,
  onAnalysisInvalidated,
  driverName,
  onDriverNameChange,
  hoveredTelemetryIndex,
  summary
}: VisionSystemProps) {
  const [mode, setMode] = useState<InputMode>("digital");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSubmittingSimulation, setIsSubmittingSimulation] = useState(false);
  const [driverValidationMessage, setDriverValidationMessage] = useState<string | null>(null);
  
  // DRAGGABLE MARKERS FORperspective mapping (normalized % of container)
  const [markers, setMarkers] = useState<CalibrationMarker[]>(cloneDefaultMarkers);
  const [activeMarkerId, setActiveMarkerId] = useState<string | null>(null);
  const [activeOffsetIndex, setActiveOffsetIndex] = useState<number | null>(null);
  const [hasAdjustedUploadFiducials, setHasAdjustedUploadFiducials] = useState(false);
  const [uploadValidationMessage, setUploadValidationMessage] = useState<string | null>(null);
  const [hasUserEditedTrack, setHasUserEditedTrack] = useState(false);

  // Calibration preset is fixed to the printable template fiducials.
  const calibrationPreset = "qr" as const;

  // Splits tracking for manual/scanned alignment
  const [isExtracted, setIsExtracted] = useState(false);

  // Digital Drawing State
  const [userOffsetDeltas, setUserOffsetDeltas] = useState<number[]>(new Array(track.points.length).fill(0));
  const [isDrawing, setIsDrawing] = useState(false);

  // Cached image refs to prevent async canvas rendering flicker during hover animations
  const loadedImageRef = useRef<HTMLImageElement | null>(null);
  const latestOffsetsRef = useRef<number[]>(new Array(track.points.length).fill(0));
  const [imageLoadedCount, setImageLoadedCount] = useState(0);
  const fineTuneHandleIndices = track.points
    .map((_, index) => index)
    .filter((index) => index % 2 === 0);

  useEffect(() => {
    latestOffsetsRef.current = userOffsetDeltas;
  }, [userOffsetDeltas]);

  useEffect(() => {
    latestOffsetsRef.current = new Array(track.points.length).fill(0);
  }, [track]);

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

  const resetAnalysisSurface = () => {
    const clearedOffsets = new Array(track.points.length).fill(0);
    latestOffsetsRef.current = clearedOffsets;
    setUserOffsetDeltas(clearedOffsets);
    setIsExtracted(false);
    setIsSubmittingSimulation(false);
    setActiveOffsetIndex(null);
    setHasUserEditedTrack(false);
    setUploadValidationMessage(null);
    setDriverValidationMessage(null);
    onAnalysisInvalidated?.();
  };

  // Reset offset deltas on track change
  useEffect(() => {
    resetAnalysisSurface();
    setImageSrc(null);
    setMarkers(cloneDefaultMarkers());
    setHasAdjustedUploadFiducials(false);
  }, [track]);

  // Sync canvas drawing representing current track state
  useEffect(() => {
    drawCanvas();
  }, [track, mode, imageSrc, markers, userOffsetDeltas, hoveredTelemetryIndex, imageLoadedCount, calibrationPreset, isExtracted]);

  const applyAutoCalibration = async (rawImageSrc: string) => {
    setIsProcessing(true);
    resetAnalysisSurface();
    setHasAdjustedUploadFiducials(false);
    try {
      const normalized = await autoNormalizeUpload(rawImageSrc);
      if (normalized) {
        setImageSrc(normalized.imageSrc);
        setMarkers(normalized.markers);
      } else {
        setImageSrc(rawImageSrc);
        setMarkers(cloneDefaultMarkers());
      }
    } catch (error) {
      console.error("Automatic paper calibration failed:", error);
      setImageSrc(rawImageSrc);
      setMarkers(cloneDefaultMarkers());
    } finally {
      setIsProcessing(false);
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
    const input = e.target;
    const file = input.files?.[0];
    if (file) {
      try {
        const fileToRead = await convertHeicIfPossible(file);
        const reader = new FileReader();
        reader.onload = async (event) => {
          if (event.target?.result) {
            await applyAutoCalibration(event.target.result as string);
          }
          input.value = "";
        };
        reader.readAsDataURL(fileToRead);
      } catch (err) {
        console.error("File upload preprocessing failed:", err);
        setIsProcessing(false);
        input.value = "";
      }
    }
  };

  const clearUploadState = () => {
    resetAnalysisSurface();
    setImageSrc(null);
    setMarkers(cloneDefaultMarkers());
    setActiveMarkerId(null);
    setHasAdjustedUploadFiducials(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const drawSmoothClosedPath = (ctx: CanvasRenderingContext2D, points: Point2D[]) => {
    if (!points.length) return;
    if (points.length < 3) {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
      ctx.closePath();
      return;
    }

    ctx.beginPath();
    const startMidpoint = {
      x: (points[points.length - 1].x + points[0].x) / 2,
      y: (points[points.length - 1].y + points[0].y) / 2
    };
    ctx.moveTo(startMidpoint.x, startMidpoint.y);

    for (let i = 0; i < points.length; i++) {
      const current = points[i];
      const next = points[(i + 1) % points.length];
      const midpoint = {
        x: (current.x + next.x) / 2,
        y: (current.y + next.y) / 2
      };
      ctx.quadraticCurveTo(current.x, current.y, midpoint.x, midpoint.y);
    }

    ctx.closePath();
  };

  const drawLinearClosedPath = (ctx: CanvasRenderingContext2D, points: Point2D[]) => {
    if (!points.length) return;

    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
    ctx.closePath();
  };

  const getOffsetPathPoints = (offsets: number[], projected: boolean = false): Point2D[] => {
    return track.points.map((pt, i) => {
      const offsetVal = offsets[i] || 0;
      const next = track.points[i === track.points.length - 1 ? 0 : i + 1];
      const prev = track.points[i === 0 ? track.points.length - 1 : i - 1];
      const tx = next.x - prev.x;
      const ty = next.y - prev.y;
      const len = Math.sqrt(tx * tx + ty * ty);
      const nx = -ty / (len || 1);
      const ny = tx / (len || 1);
      const offsetPoint = {
        x: pt.x + offsetVal * nx,
        y: pt.y + offsetVal * ny
      };

      if (!projected) {
        return offsetPoint;
      }

      const templatePoint = transformPointForTemplate(offsetPoint);
      return getBilinearProjectedCoordinate(templatePoint.x, templatePoint.y);
    });
  };

  // Render high contrast superimposed track map image for student report sheet
  const generateTrackReportImage = (offsets: number[]): string => {
    const canvas = document.createElement("canvas");
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext("2d");
    if (!ctx) return "";

    if (mode !== "digital" && loadedImageRef.current) {
      ctx.drawImage(loadedImageRef.current, 0, 0, 500, 500);

      ctx.fillStyle = "rgba(2, 6, 23, 0.18)";
      ctx.fillRect(0, 0, 500, 500);

      drawProjectedTrackCenterPath(ctx, "rgba(15, 23, 42, 0.32)", 20);
      drawProjectedTrackCenterPath(ctx, "rgba(34, 211, 238, 0.18)", 5);
      drawProjectedTrackCenterPath(ctx, "rgba(14, 165, 233, 0.65)", 1.5, true);

      drawLinearClosedPath(
        ctx,
        getOffsetPathPoints(
          track.points.map((_, i) => getIdealRacingLineOffset(track.id, i)),
          true
        )
      );
      ctx.strokeStyle = "#22c55e";
      ctx.lineWidth = 2.5;
      ctx.shadowColor = "rgba(34, 197, 94, 0.22)";
      ctx.shadowBlur = 4;
      ctx.stroke();

      ctx.save();
      drawLinearClosedPath(ctx, getOffsetPathPoints(offsets, true));
      ctx.strokeStyle = "rgba(96, 165, 250, 0.98)";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "#60a5fa";
      ctx.shadowBlur = 5;
      ctx.stroke();
      ctx.restore();

      const projectedStart = getBilinearProjectedCoordinate(
        transformPointForTemplate(track.points[0]).x,
        transformPointForTemplate(track.points[0]).y
      );
      ctx.beginPath();
      ctx.arc(projectedStart.x, projectedStart.y, 5, 0, 2 * Math.PI);
      ctx.fillStyle = "#e11d48";
      ctx.fill();

      return canvas.toDataURL("image/png");
    }

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

    // Draw Optimal Line (Green)
    drawSmoothClosedPath(
      ctx,
      track.points.map((_, i) => getOffsetTrackPoint(i, getIdealRacingLineOffset(track.id, i)))
    );
    ctx.strokeStyle = "#22c55e";
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Draw Student Line (Glowing Blue)
    drawSmoothClosedPath(ctx, getOffsetPathPoints(offsets));
    ctx.strokeStyle = "rgba(96, 165, 250, 0.98)";
    ctx.lineWidth = 3.5;
    ctx.shadowColor = "#60a5fa";
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

  // Drag handlers for perspective markers
  const handleContainerPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!containerRef.current) return;
    if (mode === "digital") return;
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
    if (!containerRef.current) return;

    if (activeOffsetIndex !== null) {
      const rect = containerRef.current.getBoundingClientRect();
      const canvasX = Math.min(500, Math.max(0, ((e.clientX - rect.left) / rect.width) * 500));
      const canvasY = Math.min(500, Math.max(0, ((e.clientY - rect.top) / rect.height) * 500));
      const offset = findBestOffsetForHandle(activeOffsetIndex, canvasX, canvasY, mode !== "digital");
      applyOffsetAdjustment(activeOffsetIndex, offset, 0.32, 1);
      return;
    }

    if (!activeMarkerId) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xPct = Math.min(100, Math.max(0, ((e.clientX - rect.left) / rect.width) * 100));
    const yPct = Math.min(100, Math.max(0, ((e.clientY - rect.top) / rect.height) * 100));

    setMarkers((prev) =>
      prev.map((m) => (m.id === activeMarkerId ? { ...m, x: parseFloat(xPct.toFixed(1)), y: parseFloat(yPct.toFixed(1)) } : m))
    );
    setHasAdjustedUploadFiducials(true);
    setUploadValidationMessage(null);
    setIsExtracted(false);
  };

  const handleContainerPointerUp = () => {
    setActiveMarkerId(null);
    setActiveOffsetIndex(null);
  };

  const applyOffsetAdjustment = (
    targetIndex: number,
    nextOffset: number,
    spreadWeight: number = 0.5,
    spreadRadius: number = 1
  ) => {
    setHasUserEditedTrack(true);
    setUserOffsetDeltas((prev) => {
      const next = [...prev];
      next[targetIndex] = parseFloat(nextOffset.toFixed(1));

      for (let distance = 1; distance <= spreadRadius; distance++) {
        const falloff = ((spreadRadius + 1 - distance) / (spreadRadius + 1)) * spreadWeight;
        const leftIdx = (targetIndex - distance + track.points.length) % track.points.length;
        const rightIdx = (targetIndex + distance) % track.points.length;

        next[leftIdx] = parseFloat((next[leftIdx] * (1 - falloff) + nextOffset * falloff).toFixed(1));
        next[rightIdx] = parseFloat((next[rightIdx] * (1 - falloff) + nextOffset * falloff).toFixed(1));
      }

      return next;
    });
  };

  const getOffsetTrackPoint = (index: number, offset: number = userOffsetDeltas[index] || 0) => {
    const pt = track.points[index];
    const next = track.points[index === track.points.length - 1 ? 0 : index + 1];
    const prev = track.points[index === 0 ? track.points.length - 1 : index - 1];
    const tx = next.x - prev.x;
    const ty = next.y - prev.y;
    const len = Math.sqrt(tx * tx + ty * ty);
    const nx = -ty / (len || 1);
    const ny = tx / (len || 1);

    return {
      x: pt.x + offset * nx,
      y: pt.y + offset * ny
    };
  };

  const getProjectedOffsetPoint = (index: number, offset: number = userOffsetDeltas[index] || 0) => {
    const offsetPoint = transformPointForTemplate(getOffsetTrackPoint(index, offset));
    return getBilinearProjectedCoordinate(offsetPoint.x, offsetPoint.y);
  };

  const getHandleCanvasPoint = (index: number, projected: boolean, offset: number = userOffsetDeltas[index] || 0) => {
    return projected ? getProjectedOffsetPoint(index, offset) : getOffsetTrackPoint(index, offset);
  };

  const findBestOffsetForHandle = (index: number, canvasX: number, canvasY: number, projected: boolean) => {
    let bestOffset = userOffsetDeltas[index] || 0;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (let candidate = -14; candidate <= 14; candidate += 0.5) {
      const point = getHandleCanvasPoint(index, projected, candidate);
      const dx = point.x - canvasX;
      const dy = point.y - canvasY;
      const distance = dx * dx + dy * dy;
      if (distance < bestDistance) {
        bestDistance = distance;
        bestOffset = candidate;
      }
    }

    return Math.min(13, Math.max(-13, bestOffset));
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

      applyOffsetAdjustment(closestIndex, offset, 0.45, 3);
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

  const drawCanvas = () => {
    if (!mainCanvasRef.current) return;
    const canvas = mainCanvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    try {
      ctx.clearRect(0, 0, 500, 500);

      if (mode !== "digital" && imageSrc && loadedImageRef.current) {
        ctx.drawImage(loadedImageRef.current, 0, 0, 500, 500);

        drawProjectedTrackCenterPath(ctx, "rgba(15, 23, 42, 0.34)", 20);
        drawProjectedTrackCenterPath(ctx, "rgba(34, 211, 238, 0.4)", 5);
        drawProjectedTrackCenterPath(ctx, "rgba(14, 165, 233, 0.9)", 1.5, true);

        ctx.save();
        drawLinearClosedPath(ctx, getOffsetPathPoints(userOffsetDeltas, true));
        ctx.strokeStyle = "rgba(250, 204, 21, 0.95)";
        ctx.lineWidth = 3.5;
        ctx.shadowColor = "rgba(250, 204, 21, 0.4)";
        ctx.shadowBlur = 6;
        ctx.stroke();
        ctx.restore();
        return;
      }

      ctx.fillStyle = "#f3f4f6";
      ctx.fillRect(0, 0, 500, 500);

      ctx.fillStyle = "rgba(100, 116, 139, 0.28)";
      for (let y = 16; y < 500; y += 24) {
        for (let x = 16; x < 500; x += 24) {
          ctx.beginPath();
          ctx.arc(x, y, 1.35, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      drawTrackCenterPath(ctx, "#334155", 24);
      drawTrackCenterPath(ctx, "#ef4444", 26, false, "red-white");
      drawTrackCenterPath(ctx, "#1e293b", 20);
      drawTrackCenterPath(ctx, "rgba(148, 163, 184, 0.75)", 1.5, true);

      drawSmoothClosedPath(ctx, getOffsetPathPoints(userOffsetDeltas));
      ctx.strokeStyle = "rgba(250, 204, 21, 0.98)";
      ctx.lineWidth = 3.5;
      ctx.shadowColor = "rgba(250, 204, 21, 0.3)";
      ctx.shadowBlur = 5;
      ctx.stroke();
    } catch (error) {
      console.error("Canvas draw failed:", error);
    }
  };

  const getPatchDarknessScore = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    centerX: number,
    centerY: number,
    radius: number = 2
  ) => {
    let totalLuminance = 0;
    let totalSamples = 0;

    for (let sampleY = Math.max(0, centerY - radius); sampleY <= Math.min(height - 1, centerY + radius); sampleY++) {
      for (let sampleX = Math.max(0, centerX - radius); sampleX <= Math.min(width - 1, centerX + radius); sampleX++) {
        const idx = (sampleY * width + sampleX) * 4;
        totalLuminance += getLuminance(pixels[idx], pixels[idx + 1], pixels[idx + 2]);
        totalSamples++;
      }
    }

    if (!totalSamples) return 0;
    return 255 - totalLuminance / totalSamples;
  };

  // Perform computer vision scan of paper image to snap the hand-drawn ink line!
  const runVisualAnalysis = () => {
    if (!imageSrc) return;
    if (!hasAdjustedUploadFiducials) {
      setUploadValidationMessage("Adjust at least one red fiducial marker before extraction so the sheet alignment is explicitly verified.");
      return;
    }

    setUploadValidationMessage(null);
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
            let bestDarknessScore = Number.NEGATIVE_INFINITY;
            let optimalOffsetLocal = 0;

            for (let step = -16; step <= 16; step += 1) {
              const templatX = pt.x + step * nx;
              const templatY = pt.y + step * ny;
              const tPt = transformPointForTemplate({ x: templatX, y: templatY });

              // Project template coordinate to actual paper photo canvas space
              const projected = getBilinearProjectedCoordinate(tPt.x, tPt.y);
              const px = Math.round(projected.x);
              const py = Math.round(projected.y);

              if (px >= 0 && px < 500 && py >= 0 && py < 500) {
                const darknessScore = getPatchDarknessScore(pixels, 500, 500, px, py, 2);

                if (darknessScore > bestDarknessScore) {
                  bestDarknessScore = darknessScore;
                  optimalOffsetLocal = step;
                }
              }
            }

            // Only accept a recovered point when the local patch is materially darker than the pale track surface.
            if (bestDarknessScore > 60) {
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
          latestOffsetsRef.current = smoothedOffsets;
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
    if (!driverName.trim()) {
      setDriverValidationMessage("Enter the driver name before simulating so the verdict and lap record are attached to the right person.");
      return;
    }
    setDriverValidationMessage(null);
    setIsProcessing(true);
    setIsSubmittingSimulation(true);
    const offsetsSnapshot = [...latestOffsetsRef.current];
    setTimeout(async () => {
      const userPointsArray = track.points.map((pt, i) => {
        const offsetVal = offsetsSnapshot[i] || 0;
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
      try {
        await onAnalysisComplete(summaryResult, {
          sourceImage: imageSrc,
          reportTrackImage: generateTrackReportImage(offsetsSnapshot)
        });
      } finally {
        setIsProcessing(false);
        setIsSubmittingSimulation(false);
      }
    }, 1000);
  };

  // Triggers simulator on custom digital drawings
  const submitDigitalRacingLine = () => {
    if (!driverName.trim()) {
      setDriverValidationMessage("Enter the driver name before simulating so the verdict and lap record are attached to the right person.");
      return;
    }
    setDriverValidationMessage(null);
    setIsProcessing(true);
    setIsSubmittingSimulation(true);
    const offsetsSnapshot = [...latestOffsetsRef.current];
    setTimeout(async () => {
      const userPointsArray = track.points.map((pt, i) => {
        const offsetVal = offsetsSnapshot[i] || 0;
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
      try {
        await onAnalysisComplete(summaryResult, {
          reportTrackImage: generateTrackReportImage(offsetsSnapshot)
        });
      } finally {
        setIsProcessing(false);
        setIsSubmittingSimulation(false);
      }
    }, 800);
  };

  return (
    <div id="vision_system_panel" className="bg-slate-900 border border-slate-800 rounded-2xl p-4 md:p-6 text-white shadow-xl flex flex-col items-center">
      <div className="w-full flex flex-col sm:flex-row items-center justify-between gap-4 mb-6 border-b border-slate-800 pb-3">
        <h2 className="text-base font-bold font-sans tracking-tight flex items-center gap-2">
          <Eye className="w-5 h-5 text-cyan-400 shrink-0" />
          Optical Vision Scan & Sketch Interface
        </h2>
        
        {/* Toggle Modes selection */}
        <div className="flex gap-1 bg-slate-950 p-1 rounded-lg border border-slate-800 text-xs font-mono shrink-0">
          <button
            onClick={() => { setMode("digital"); onAnalysisInvalidated?.(); }}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
              mode === "digital" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            Digital Draw
          </button>
          <button
            onClick={() => { setMode("upload"); onAnalysisInvalidated?.(); }}
            className={`px-3 py-1.5 rounded-md font-bold transition flex items-center gap-1.5 ${
              mode === "upload" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-white"
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            Photo Upload
          </button>
        </div>
      </div>

      {mode === "upload" && (
        <div className="w-full max-w-[760px] xl:max-w-[980px] mt-6 space-y-4 rounded-2xl border border-slate-800 bg-slate-950/40 p-4 md:p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block">
                Printable Template
              </span>
              <p className="mt-1 text-sm text-slate-300">
                Print the calibration template before uploading. The live inline preview stays visible here for reference.
              </p>
            </div>
          </div>

          <TrackTemplateGenerator track={track} />
        </div>
      )}

      {mode === "upload" && (
        <div className="w-full max-w-[760px] xl:max-w-[980px] mt-6 mb-4 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="md:col-span-5 flex flex-col gap-2 self-start w-full">
            <input
              type="file"
              accept="image/*,.heic,.heif"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />

            {!imageSrc ? (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center gap-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 border border-cyan-300 p-3.5 rounded-lg text-xs font-sans tracking-[0.18em] uppercase transition font-black shadow-[0_10px_30px_rgba(34,211,238,0.18)] cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  Browse Photo File
                </button>
                <div className="border border-dashed border-slate-800 bg-slate-950/40 p-4 rounded-lg text-center flex flex-col items-center gap-2">
                  <ImageIcon className="w-8 h-8 text-slate-600 animate-pulse" />
                  <div>
                    <span className="text-slate-300 font-bold text-xs block">No Photograph Uploaded</span>
                    <span className="text-[10px] font-mono text-slate-500 block">Choose a printed template photo or scan to begin.</span>
                  </div>
                </div>
              </>
            ) : null}
          </div>

          <div className="md:col-span-7 flex flex-col justify-start">
            <span className="text-xs font-mono text-cyan-400 font-bold uppercase tracking-wider block">
              Photo Upload
            </span>
            <div className="mt-2 flex flex-col gap-2 text-sm text-slate-300 md:gap-3">
              <p className="font-mono uppercase tracking-[0.16em] text-slate-300">
                Use a photo or scan of the printed template.
              </p>
              <div className="flex flex-col items-start gap-2 text-sm text-slate-300 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start">
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-amber-400 shrink-0" />
                  Align the fiducials to the template
                </span>
                <span className="hidden h-3 w-px bg-slate-800 sm:block" />
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 shrink-0" />
                  Warp and extract the racing line
                </span>
                <span className="hidden h-3 w-px bg-slate-800 sm:block" />
                <span className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-sky-400 shrink-0" />
                  Adjust the blue handles to fine-tune the extracted racing line
                </span>
              </div>

              {isExtracted && (
                <div className="bg-slate-950 p-3 rounded-lg border border-yellow-500/30 font-mono text-[11px] text-yellow-100">
                  Extraction complete. Drag the blue points to tighten any corner before running the lap simulation.
                </div>
              )}

              {uploadValidationMessage && (
                <div className="bg-rose-950/40 p-3 rounded-lg border border-rose-500/40 font-mono text-[11px] text-rose-100">
                  {uploadValidationMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {mode === "digital" && (
        <div className="w-full max-w-[760px] xl:max-w-[980px] mb-4">
          <div className="flex flex-col gap-2 text-left md:flex-row md:items-center md:justify-start md:gap-6">
            <p className="text-sm font-mono uppercase tracking-[0.16em] text-slate-300">
              Drag the blue handles to fine-tune the racing line.
            </p>
            <div className="flex flex-col items-start gap-2 text-sm text-slate-300 sm:flex-row sm:flex-wrap sm:items-center sm:justify-start">
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-sky-500 shrink-0" />
                Blue markers shape the local line
              </span>
              <span className="hidden h-3 w-px bg-slate-800 sm:block" />
              <span className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-red-400 shrink-0" />
                Red and white edges show grip limits
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Main Large Centered alignment Canvas Container */}
      <div className="w-full flex flex-col items-center justify-center py-2">
        <div
            id="align_container"
            ref={containerRef}
            onPointerDown={handleContainerPointerDown}
            onPointerMove={handleContainerPointerMove}
            onPointerUp={handleContainerPointerUp}
            onPointerLeave={handleContainerPointerUp}
            className="relative w-full max-w-[760px] xl:max-w-[980px] aspect-square rounded-2xl overflow-hidden shadow-2xl border-2 border-slate-850 hover:border-slate-800 bg-slate-950 select-none cursor-pointer"
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

            {((mode === "upload" && imageSrc && isExtracted) || mode === "digital") && (
              <div className="absolute inset-0 w-full h-full pointer-events-none z-10">
                {fineTuneHandleIndices.map((index) => {
                  const point = mode === "digital" ? getOffsetTrackPoint(index) : getProjectedOffsetPoint(index);
                  const isActive = activeOffsetIndex === index;
                  return (
                    <button
                      key={index}
                      type="button"
                      style={{
                        left: `${(point.x / 500) * 100}%`,
                        top: `${(point.y / 500) * 100}%`,
                        transform: "translate(-50%, -50%)"
                      }}
                      className={`absolute pointer-events-auto h-4 w-4 rounded-full border-2 transition cursor-grab active:cursor-grabbing ${
                        isActive
                          ? "border-sky-50 bg-sky-300 scale-125 shadow-[0_0_18px_rgba(125,211,252,0.9)]"
                          : "border-sky-300 bg-sky-500/90 hover:bg-sky-400 hover:scale-110 shadow-[0_0_14px_rgba(14,165,233,0.65)]"
                      }`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        setActiveOffsetIndex(index);
                        setIsDrawing(false);
                      }}
                      aria-label={`${mode === "digital" ? "Adjust digital racing line point" : "Fine tune extracted line point"} ${index + 1}`}
                    />
                  );
                })}
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

      </div>

      {mode !== "digital" && imageSrc ? (
        <div className="w-full max-w-[760px] xl:max-w-[980px] mt-4 space-y-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
            <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300">Driver Name</span>
            <input
              type="text"
              maxLength={20}
              value={driverName}
              onChange={(e) => {
                onDriverNameChange(e.target.value);
                if (driverValidationMessage) setDriverValidationMessage(null);
              }}
              placeholder="Driver name or initials"
              className="mt-2 w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 px-3 py-2 rounded-lg text-sm font-medium placeholder-slate-500 text-white focus:outline-none transition"
            />
            <p className="mt-2 text-[11px] text-slate-400">
              This name is used in the verdict and the lap is saved automatically after simulation.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 w-full">
            <button
              onPointerDown={handleContainerPointerUp}
              onClick={runVisualAnalysis}
              disabled={isProcessing}
              className="flex-1 flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold p-3.5 rounded-lg text-xs font-sans tracking-wider uppercase transition shadow-md disabled:opacity-50 cursor-pointer"
            >
              <ZoomIn className="w-4 h-4" />
              {isExtracted ? "Re-Extract Line" : "Warp Scan & Extract"}
            </button>
            {isExtracted && (
              <button
                onPointerDown={handleContainerPointerUp}
                onClick={submitUploadedRacingLine}
                disabled={isProcessing || isSubmittingSimulation}
                className={`relative flex-1 overflow-hidden flex items-center justify-center bg-rose-600 hover:bg-rose-500 disabled:hover:bg-rose-600 text-white font-bold px-4 py-2.5 rounded-lg text-[11px] font-sans tracking-[0.16em] uppercase transition shadow-md cursor-pointer disabled:opacity-100 ${
                  hasUserEditedTrack ? "animate-pulse" : ""
                }`}
              >
                {isSubmittingSimulation && <span className="simulate-progress-block" aria-hidden="true" />}
                <span className="relative z-10">{isSubmittingSimulation ? "Waiting For Verdict" : "Simulate Lap Speed"}</span>
              </button>
            )}
            <button
              onPointerDown={handleContainerPointerUp}
              onClick={clearUploadState}
              className="flex items-center justify-center px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-750 rounded-lg transition shrink-0 cursor-pointer text-xs font-bold"
            >
              Clear Photo
            </button>
          </div>
          {driverValidationMessage && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-100">
              {driverValidationMessage}
            </div>
          )}
          <p className="text-[11px] font-mono text-slate-400 text-center uppercase tracking-wider bg-slate-950/40 px-3 py-1.5 rounded-md border border-slate-850/60 w-full">
            Fine-tune the fiducials only if the projected track needs correction.
          </p>
        </div>
      ) : (
        mode === "digital" ? null : (
          imageSrc && (
            <p className="text-[11px] font-mono text-slate-400 text-center uppercase tracking-wider bg-slate-950/40 px-3 py-1.5 rounded-md border border-slate-850/60 mt-4 max-w-[760px] xl:max-w-[980px] w-full">
              Fine-tune the red fiducials only if the projected track needs correction.
            </p>
          )
        )
      )}

      {/* Bottom Digital Action Row */}
      {mode === "digital" && (
        <div className="w-full border-t border-slate-800 mt-6 pt-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
          <div className="md:col-span-12 max-w-[760px] xl:max-w-[980px] mx-auto flex flex-col gap-2 self-start w-full">
            <div className="rounded-2xl border border-slate-800 bg-slate-950/40 p-3">
              <span className="block text-[10px] font-mono uppercase tracking-[0.22em] text-cyan-300">Driver Name</span>
              <input
                type="text"
                maxLength={20}
                value={driverName}
                onChange={(e) => {
                  onDriverNameChange(e.target.value);
                  if (driverValidationMessage) setDriverValidationMessage(null);
                }}
                placeholder="Driver name or initials"
                className="mt-2 w-full bg-slate-950 border border-slate-800 hover:border-slate-700 focus:border-cyan-500 px-3 py-2 rounded-lg text-sm font-medium placeholder-slate-500 text-white focus:outline-none transition"
              />
              <p className="mt-2 text-[11px] text-slate-400">
                This name is used in the verdict and the lap is saved automatically after simulation.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onPointerDown={handleContainerPointerUp}
                onClick={submitDigitalRacingLine}
                disabled={isProcessing || isSubmittingSimulation}
                className={`relative flex-1 overflow-hidden flex items-center justify-center bg-rose-600 hover:bg-rose-500 disabled:hover:bg-rose-600 text-white font-bold px-4 py-2.5 rounded-lg text-[11px] font-sans tracking-[0.16em] uppercase transition shadow-md cursor-pointer disabled:opacity-100 ${
                  hasUserEditedTrack ? "animate-pulse" : ""
                }`}
              >
                {isSubmittingSimulation && <span className="simulate-progress-block" aria-hidden="true" />}
                <span className="relative z-10">{isSubmittingSimulation ? "Waiting For Verdict" : "Simulate Lap Speed"}</span>
              </button>
              <button
                onPointerDown={handleContainerPointerUp}
                onClick={() => {
                  resetAnalysisSurface();
                }}
                className="flex items-center px-4 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 text-slate-300 transition shrink-0 cursor-pointer"
                title="Reset Track Line"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
            {driverValidationMessage && (
              <div className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-3 py-2 text-[11px] text-rose-100">
                {driverValidationMessage}
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
