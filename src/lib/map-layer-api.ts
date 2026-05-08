import { apiFetch, apiFetchJson } from "@/lib/api-client";
import type { MapLayerDto } from "@/lib/map-layers";

export function fetchMapLayers() {
  return apiFetchJson<MapLayerDto[]>("/api/map-layers", { cache: "no-store" }, "Не удалось загрузить слои.");
}

export function createMapLayer(name: string) {
  return apiFetchJson<MapLayerDto>(
    "/api/map-layers",
    {
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    "Не удалось сохранить слой.",
  );
}

export function updateMapLayer(id: string, name: string) {
  return apiFetchJson<MapLayerDto>(
    `/api/map-layers/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify({ name }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    "Не удалось сохранить слой.",
  );
}

export async function deleteMapLayer(id: string) {
  await apiFetch(`/api/map-layers/${encodeURIComponent(id)}`, { method: "DELETE" }, "Не удалось удалить слой.");
}
