import { apiFetch, apiFetchJson } from "@/lib/api-client";
import type { MapRouteDto, MapRouteInput, MapZoneDto, MapZoneInput } from "@/lib/map-overlays";

export type MapZoneMutationInput = Pick<
  MapZoneInput,
  | "brightness"
  | "centerX"
  | "centerY"
  | "colorKey"
  | "contrast"
  | "description"
  | "layer"
  | "patternKey"
  | "points"
  | "radius"
  | "shape"
  | "status"
  | "title"
  | "type"
>;

export type MapRouteMutationInput = Pick<
  MapRouteInput,
  "brightness" | "colorKey" | "contrast" | "description" | "layer" | "linePattern" | "points" | "status" | "title" | "type"
>;

export function fetchMapZones() {
  return apiFetchJson<MapZoneDto[]>("/api/map-zones", { cache: "no-store" }, "Не удалось загрузить объекты карты.");
}

export function createMapZone(input: MapZoneMutationInput) {
  return apiFetchJson<MapZoneDto>(
    "/api/map-zones",
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    "Не удалось сохранить зону.",
  );
}

export function updateMapZone(id: string, patch: Partial<MapZoneMutationInput>) {
  return apiFetchJson<MapZoneDto>(
    `/api/map-zones/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    "Не удалось сохранить зону.",
  );
}

export async function deleteMapZone(id: string) {
  await apiFetch(`/api/map-zones/${encodeURIComponent(id)}`, { method: "DELETE" }, "Не удалось удалить зону.");
}

export function fetchMapRoutes() {
  return apiFetchJson<MapRouteDto[]>("/api/map-routes", { cache: "no-store" }, "Не удалось загрузить объекты карты.");
}

export function createMapRoute(input: MapRouteMutationInput) {
  return apiFetchJson<MapRouteDto>(
    "/api/map-routes",
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    "Не удалось сохранить маршрут.",
  );
}

export function updateMapRoute(id: string, patch: Partial<MapRouteMutationInput>) {
  return apiFetchJson<MapRouteDto>(
    `/api/map-routes/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    "Не удалось сохранить маршрут.",
  );
}

export async function deleteMapRoute(id: string) {
  await apiFetch(`/api/map-routes/${encodeURIComponent(id)}`, { method: "DELETE" }, "Не удалось удалить маршрут.");
}
