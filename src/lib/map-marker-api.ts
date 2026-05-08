import { apiFetch, apiFetchJson } from "@/lib/api-client";
import type { MapMarkerDto, MapMarkerInput } from "@/lib/map-markers";

export type MapMarkerMutationInput = Pick<
  MapMarkerInput,
  "brightness" | "colorKey" | "contrast" | "description" | "layer" | "patternKey" | "status" | "title" | "type" | "x" | "y"
>;

export function fetchMapMarkers() {
  return apiFetchJson<MapMarkerDto[]>("/api/map-markers", { cache: "no-store" }, "Не удалось загрузить метки.");
}

export function createMapMarker(input: MapMarkerMutationInput) {
  return apiFetchJson<MapMarkerDto>(
    "/api/map-markers",
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    "Не удалось сохранить метку.",
  );
}

export function updateMapMarker(id: string, patch: Partial<MapMarkerMutationInput>) {
  return apiFetchJson<MapMarkerDto>(
    `/api/map-markers/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    "Не удалось сохранить метку.",
  );
}

export async function deleteMapMarker(id: string) {
  const response = await apiFetch(
    `/api/map-markers/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Не удалось удалить метку.",
  );

  return (await response.json()) as MapMarkerDto;
}
