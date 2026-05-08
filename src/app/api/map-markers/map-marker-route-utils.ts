import type { MapMarkerDto, MapMarkerInput, ValidatedMapMarkerInput } from "@/lib/map-markers";
import { validateMapMarkerInput } from "@/lib/map-markers";
import { normalizeFillPattern, normalizeObjectColorKey } from "@/lib/map-overlays";

type DatabaseMapMarker = {
  id: string;
  title: string;
  type: MapMarkerDto["type"];
  status: MapMarkerDto["status"];
  x: number;
  y: number;
  colorKey: string;
  patternKey: string;
  brightness: number;
  contrast: number;
  description: string | null;
  layer: string;
  createdAt: Date;
  updatedAt: Date;
};

export function createMapMarkerErrorResponse(message: string, status = 400) {
  return Response.json({ error: message, message }, { status });
}

export function mapMarkerToResponse(marker: DatabaseMapMarker): MapMarkerDto {
  return {
    brightness: marker.brightness,
    colorKey: normalizeObjectColorKey(marker.colorKey),
    contrast: marker.contrast,
    createdAt: marker.createdAt.toISOString(),
    description: marker.description,
    id: marker.id,
    layer: marker.layer,
    patternKey: normalizeFillPattern(marker.patternKey),
    status: marker.status,
    title: marker.title,
    type: marker.type,
    updatedAt: marker.updatedAt.toISOString(),
    x: marker.x,
    y: marker.y,
  };
}

export function validateMapMarkerPayload(payload: MapMarkerInput | null) {
  if (!payload || typeof payload !== "object") {
    return { error: "Не удалось выполнить операцию.", ok: false as const };
  }

  return validateMapMarkerInput(payload);
}

export function buildMapMarkerPatchPayload(current: ValidatedMapMarkerInput, patch: MapMarkerInput): MapMarkerInput {
  return {
    brightness: patch.brightness !== undefined ? patch.brightness : current.brightness,
    colorKey: patch.colorKey !== undefined ? patch.colorKey : current.colorKey,
    contrast: patch.contrast !== undefined ? patch.contrast : current.contrast,
    description: patch.description !== undefined ? patch.description : current.description,
    layer: patch.layer !== undefined ? patch.layer : current.layer,
    patternKey: patch.patternKey !== undefined ? patch.patternKey : current.patternKey,
    status: patch.status !== undefined ? patch.status : current.status,
    title: patch.title !== undefined ? patch.title : current.title,
    type: patch.type !== undefined ? patch.type : current.type,
    x: patch.x !== undefined ? patch.x : current.x,
    y: patch.y !== undefined ? patch.y : current.y,
  };
}
