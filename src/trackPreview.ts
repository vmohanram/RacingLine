import { getIdealRacingLinePoints } from "./physicsEngine";
import { Track } from "./tracksData";

export interface TrackPreviewPoint {
  x: number;
  y: number;
}

export interface TrackPreviewBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TrackPreviewModel {
  trackPathString: string;
  idealPathString: string;
  userPathString: string;
  bounds: TrackPreviewBounds;
  projectedTrackPoints: TrackPreviewPoint[];
  projectedIdealPoints: TrackPreviewPoint[];
  projectedUserPoints: TrackPreviewPoint[];
  projectedHoveredPoint: TrackPreviewPoint | null;
}

function isFinitePoint(point?: { x: number; y: number } | null): point is TrackPreviewPoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y);
}

export function sanitizeTrackPreviewPoints(points: Array<{ x: number; y: number } | null | undefined>): TrackPreviewPoint[] {
  return points.filter(isFinitePoint);
}

export function buildClosedTrackPath(points: TrackPreviewPoint[]): string {
  if (!points.length) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(" ") + " Z";
}

export function computeTrackPreviewBounds(pointSets: TrackPreviewPoint[][]): TrackPreviewBounds {
  const combinedPoints = pointSets.flat().filter(isFinitePoint);

  if (!combinedPoints.length) {
    return { x: 0, y: 0, width: 500, height: 500 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  combinedPoints.forEach((point) => {
    if (point.x < minX) minX = point.x;
    if (point.y < minY) minY = point.y;
    if (point.x > maxX) maxX = point.x;
    if (point.y > maxY) maxY = point.y;
  });

  const padding = 35;
  minX -= padding;
  minY -= padding;
  maxX += padding;
  maxY += padding;

  const width = maxX - minX;
  const height = maxY - minY;
  const size = Math.max(width, height, 100);
  const centerX = minX + width / 2;
  const centerY = minY + height / 2;

  return {
    x: centerX - size / 2,
    y: centerY - size / 2,
    width: size,
    height: size
  };
}

export function projectTrackPreviewPoint(
  point: TrackPreviewPoint,
  bounds: TrackPreviewBounds,
  viewportSize: number = 420,
  padding: number = 28
): TrackPreviewPoint {
  const inner = viewportSize - padding * 2;
  const scale = inner / Math.max(bounds.width, bounds.height);
  const offsetX = (inner - bounds.width * scale) / 2;
  const offsetY = (inner - bounds.height * scale) / 2;

  return {
    x: padding + offsetX + (point.x - bounds.x) * scale,
    y: padding + offsetY + (point.y - bounds.y) * scale
  };
}

export function buildTrackPreviewModel(
  track: Track,
  userPointsInput: Array<{ x: number; y: number } | null | undefined>,
  hoveredPoint?: { x: number; y: number } | null,
  viewportSize: number = 420
): TrackPreviewModel {
  const trackPoints = sanitizeTrackPreviewPoints(track?.points || []);
  const idealPoints = sanitizeTrackPreviewPoints(getIdealRacingLinePoints(track) || []);
  const userPoints = sanitizeTrackPreviewPoints(userPointsInput);
  const normalizedHoveredPoint = isFinitePoint(hoveredPoint) ? hoveredPoint : null;

  const bounds = computeTrackPreviewBounds([
    trackPoints,
    idealPoints,
    userPoints,
    normalizedHoveredPoint ? [normalizedHoveredPoint] : []
  ]);

  const projectedTrackPoints = trackPoints.map((point) => projectTrackPreviewPoint(point, bounds, viewportSize));
  const projectedIdealPoints = idealPoints.map((point) => projectTrackPreviewPoint(point, bounds, viewportSize));
  const projectedUserPoints = userPoints.map((point) => projectTrackPreviewPoint(point, bounds, viewportSize));
  const projectedHoveredPoint = normalizedHoveredPoint
    ? projectTrackPreviewPoint(normalizedHoveredPoint, bounds, viewportSize)
    : null;

  return {
    trackPathString: buildClosedTrackPath(projectedTrackPoints),
    idealPathString: buildClosedTrackPath(projectedIdealPoints),
    userPathString: buildClosedTrackPath(projectedUserPoints),
    bounds,
    projectedTrackPoints,
    projectedIdealPoints,
    projectedUserPoints,
    projectedHoveredPoint
  };
}
