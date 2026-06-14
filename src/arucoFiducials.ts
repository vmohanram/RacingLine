import { AR } from "js-aruco2";

export interface CalibrationMarker {
  id: string;
  x: number;
  y: number;
  label: string;
  detected?: boolean;
}

interface FiducialSpec {
  id: string;
  markerId: number;
  x: number;
  y: number;
  label: string;
}

const NORMALIZED_TRACK_SIZE = 500;
const ARUCO_DICTIONARY_NAME = "ARUCO";

export const ARUCO_FIDUCIAL_SPECS: FiducialSpec[] = [
  { id: "TL", markerId: 0, x: 30, y: 30, label: "Top-Left (TL)" },
  { id: "ML", markerId: 1, x: 30, y: 250, label: "Mid-Left (ML)" },
  { id: "BL", markerId: 2, x: 30, y: 470, label: "Bottom-Left (BL)" },
  { id: "TR", markerId: 3, x: 470, y: 30, label: "Top-Right (TR)" },
  { id: "MR", markerId: 4, x: 470, y: 250, label: "Mid-Right (MR)" },
  { id: "BR", markerId: 5, x: 470, y: 470, label: "Bottom-Right (BR)" },
  { id: "C", markerId: 6, x: 250, y: 250, label: "Center Align (C)" }
];

const detector = new AR.Detector({
  dictionaryName: ARUCO_DICTIONARY_NAME,
  maxHammingDistance: 1
});

const dictionary = new AR.Dictionary(ARUCO_DICTIONARY_NAME);

const fiducialById = new Map(ARUCO_FIDUCIAL_SPECS.map((fiducial) => [fiducial.id, fiducial]));
const fiducialByMarkerId = new Map(ARUCO_FIDUCIAL_SPECS.map((fiducial) => [fiducial.markerId, fiducial]));

function toMarkerPosition(value: number): number {
  return Number(((value / NORMALIZED_TRACK_SIZE) * 100).toFixed(1));
}

export function cloneDefaultMarkers(): CalibrationMarker[] {
  return ARUCO_FIDUCIAL_SPECS.map((fiducial) => ({
    id: fiducial.id,
    label: fiducial.label,
    x: toMarkerPosition(fiducial.x),
    y: toMarkerPosition(fiducial.y),
    detected: false
  }));
}

export function getDefaultCalibrationMarker(id: string): CalibrationMarker {
  const fiducial = fiducialById.get(id);
  if (!fiducial) {
    throw new Error(`Unknown calibration marker: ${id}`);
  }

  return {
    id: fiducial.id,
    label: fiducial.label,
    x: toMarkerPosition(fiducial.x),
    y: toMarkerPosition(fiducial.y),
    detected: false
  };
}

export function countDetectedCalibrationMarkers(markers: CalibrationMarker[]): number {
  return markers.filter((marker) => marker.detected).length;
}

export function detectArucoCalibrationMarkers(trackCanvas: HTMLCanvasElement): CalibrationMarker[] {
  const ctx = trackCanvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return cloneDefaultMarkers();

  const imageData = ctx.getImageData(0, 0, trackCanvas.width, trackCanvas.height);
  const detectedMarkers = detector.detect(imageData) as Array<{
    id: number;
    corners: Array<{ x: number; y: number }>;
  }>;

  const detectedById = new Map(detectedMarkers.map((marker) => [marker.id, marker]));

  return ARUCO_FIDUCIAL_SPECS.map((fiducial) => {
    const detectedMarker = detectedById.get(fiducial.markerId);
    if (!detectedMarker || detectedMarker.corners.length === 0) {
      return {
        id: fiducial.id,
        label: fiducial.label,
        x: toMarkerPosition(fiducial.x),
        y: toMarkerPosition(fiducial.y),
        detected: false
      };
    }

    const center = detectedMarker.corners.reduce(
      (accumulator, corner) => ({
        x: accumulator.x + corner.x / detectedMarker.corners.length,
        y: accumulator.y + corner.y / detectedMarker.corners.length
      }),
      { x: 0, y: 0 }
    );

    return {
      id: fiducial.id,
      label: fiducial.label,
      x: Number(((center.x / trackCanvas.width) * 100).toFixed(1)),
      y: Number(((center.y / trackCanvas.height) * 100).toFixed(1)),
      detected: true
    };
  });
}

export function getArucoMarkerSvg(markerId: number, size: number): string {
  return dictionary
    .generateSVG(markerId)
    .replace("<svg ", `<svg width="${size}" height="${size}" preserveAspectRatio="none" `);
}
