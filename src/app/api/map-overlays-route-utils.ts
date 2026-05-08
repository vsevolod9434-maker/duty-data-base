import type {
  MapRouteDto,
  MapRouteInput,
  MapZoneDto,
  MapZoneInput,
  ValidatedMapRouteInput,
  ValidatedMapZoneInput,
} from "@/lib/map-overlays";
import { normalizeLinePattern, normalizeRouteColorKey, normalizeZoneColorKey, validateMapRouteInput, validateMapZoneInput } from "@/lib/map-overlays";

type DatabaseMapZone = {
  id: string;
  title: MapZoneDto["title"];
  type: MapZoneDto["type"];
  status: MapZoneDto["status"];
  shape: MapZoneDto["shape"];
  centerX: number;
  centerY: number;
  radius: number;
  colorKey: string;
  description: string | null;
  layer: string;
  points: Array<{
    id: string;
    order: number;
    x: number;
    y: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

type DatabaseMapRoute = {
  id: string;
  title: MapRouteDto["title"];
  type: MapRouteDto["type"];
  status: MapRouteDto["status"];
  colorKey: string;
  linePattern: string;
  description: string | null;
  layer: string;
  points: Array<{
    id: string;
    order: number;
    x: number;
    y: number;
  }>;
  createdAt: Date;
  updatedAt: Date;
};

export const zoneInclude = {
  points: {
    orderBy: { order: "asc" as const },
  },
};

export const routeInclude = {
  points: {
    orderBy: { order: "asc" as const },
  },
};

export function createMapOverlayErrorResponse(message: string, status = 400) {
  return Response.json({ error: message, message }, { status });
}

export function mapZoneToResponse(zone: DatabaseMapZone): MapZoneDto {
  return {
    centerX: zone.centerX,
    centerY: zone.centerY,
    colorKey: normalizeZoneColorKey(zone.colorKey),
    createdAt: zone.createdAt.toISOString(),
    description: zone.description,
    id: zone.id,
    layer: zone.layer,
    points: [...zone.points]
      .sort((firstPoint, secondPoint) => firstPoint.order - secondPoint.order)
      .map((point) => ({
        id: point.id,
        order: point.order,
        x: point.x,
        y: point.y,
      })),
    radius: zone.radius,
    shape: zone.shape,
    status: zone.status,
    title: zone.title,
    type: zone.type,
    updatedAt: zone.updatedAt.toISOString(),
  };
}

export function mapRouteToResponse(route: DatabaseMapRoute): MapRouteDto {
  return {
    createdAt: route.createdAt.toISOString(),
    colorKey: normalizeRouteColorKey(route.colorKey),
    description: route.description,
    id: route.id,
    layer: route.layer,
    linePattern: normalizeLinePattern(route.linePattern),
    points: [...route.points]
      .sort((firstPoint, secondPoint) => firstPoint.order - secondPoint.order)
      .map((point) => ({
        id: point.id,
        order: point.order,
        x: point.x,
        y: point.y,
      })),
    status: route.status,
    title: route.title,
    type: route.type,
    updatedAt: route.updatedAt.toISOString(),
  };
}

export function validateMapZonePayload(payload: MapZoneInput | null) {
  if (!payload || typeof payload !== "object") {
    return { error: "Не удалось выполнить операцию.", ok: false as const };
  }

  return validateMapZoneInput(payload);
}

export function validateMapRoutePayload(payload: MapRouteInput | null) {
  if (!payload || typeof payload !== "object") {
    return { error: "Не удалось выполнить операцию.", ok: false as const };
  }

  return validateMapRouteInput(payload);
}

export function buildMapZonePatchPayload(current: ValidatedMapZoneInput, patch: MapZoneInput): MapZoneInput {
  return {
    centerX: patch.centerX !== undefined ? patch.centerX : current.centerX,
    centerY: patch.centerY !== undefined ? patch.centerY : current.centerY,
    colorKey: patch.colorKey !== undefined ? patch.colorKey : current.colorKey,
    description: patch.description !== undefined ? patch.description : current.description,
    layer: patch.layer !== undefined ? patch.layer : current.layer,
    points: patch.points !== undefined ? patch.points : current.points,
    radius: patch.radius !== undefined ? patch.radius : current.radius,
    shape: patch.shape !== undefined ? patch.shape : current.shape,
    status: patch.status !== undefined ? patch.status : current.status,
    title: patch.title !== undefined ? patch.title : current.title,
    type: patch.type !== undefined ? patch.type : current.type,
  };
}

export function buildMapRoutePatchPayload(current: ValidatedMapRouteInput, patch: MapRouteInput): MapRouteInput {
  return {
    description: patch.description !== undefined ? patch.description : current.description,
    colorKey: patch.colorKey !== undefined ? patch.colorKey : current.colorKey,
    layer: patch.layer !== undefined ? patch.layer : current.layer,
    linePattern: patch.linePattern !== undefined ? patch.linePattern : current.linePattern,
    points: patch.points !== undefined ? patch.points : current.points,
    status: patch.status !== undefined ? patch.status : current.status,
    title: patch.title !== undefined ? patch.title : current.title,
    type: patch.type !== undefined ? patch.type : current.type,
  };
}
