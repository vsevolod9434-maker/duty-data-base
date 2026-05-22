import type { MapLabelDto, MapLabelInput, ValidatedMapLabelInput } from "@/lib/map-labels";
import { validateMapLabelInput } from "@/lib/map-labels";
import { normalizeObjectColorKey } from "@/lib/map-overlays";

type DatabaseMapLabel = {
  id: string;
  text: string;
  x: number;
  y: number;
  colorKey: string;
  brightness: number;
  contrast: number;
  size: number;
  layer: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function createMapLabelErrorResponse(message: string, status = 400) {
  return Response.json({ error: message, message }, { status });
}

export function mapLabelToResponse(label: DatabaseMapLabel): MapLabelDto {
  return {
    brightness: label.brightness,
    colorKey: normalizeObjectColorKey(label.colorKey),
    contrast: label.contrast,
    createdAt: label.createdAt.toISOString(),
    createdBy: label.createdBy,
    id: label.id,
    layer: label.layer,
    size: label.size,
    text: label.text,
    updatedAt: label.updatedAt.toISOString(),
    updatedBy: label.updatedBy,
    x: label.x,
    y: label.y,
  };
}

export function validateMapLabelPayload(payload: MapLabelInput | null) {
  if (!payload || typeof payload !== "object") {
    return { error: "Не удалось выполнить операцию.", ok: false as const };
  }

  return validateMapLabelInput(payload);
}

export function buildMapLabelPatchPayload(current: ValidatedMapLabelInput, patch: MapLabelInput): MapLabelInput {
  return {
    brightness: patch.brightness !== undefined ? patch.brightness : current.brightness,
    colorKey: patch.colorKey !== undefined ? patch.colorKey : current.colorKey,
    contrast: patch.contrast !== undefined ? patch.contrast : current.contrast,
    layer: patch.layer !== undefined ? patch.layer : current.layer,
    size: patch.size !== undefined ? patch.size : current.size,
    text: patch.text !== undefined ? patch.text : current.text,
    x: patch.x !== undefined ? patch.x : current.x,
    y: patch.y !== undefined ? patch.y : current.y,
  };
}
