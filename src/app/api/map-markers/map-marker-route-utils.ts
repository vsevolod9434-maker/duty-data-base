import type { MapMarkerDto, MapMarkerInput, ValidatedMapMarkerInput } from "@/lib/map-markers";
import { validateMapMarkerInput } from "@/lib/map-markers";

type DatabaseMapMarker = {
  id: string;
  title: string;
  type: MapMarkerDto["type"];
  status: MapMarkerDto["status"];
  x: number;
  y: number;
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
    createdAt: marker.createdAt.toISOString(),
    description: marker.description,
    id: marker.id,
    layer: marker.layer,
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
    description: patch.description !== undefined ? patch.description : current.description,
    layer: patch.layer !== undefined ? patch.layer : current.layer,
    status: patch.status !== undefined ? patch.status : current.status,
    title: patch.title !== undefined ? patch.title : current.title,
    type: patch.type !== undefined ? patch.type : current.type,
    x: patch.x !== undefined ? patch.x : current.x,
    y: patch.y !== undefined ? patch.y : current.y,
  };
}
