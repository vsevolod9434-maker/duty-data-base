import { apiFetch, apiFetchJson } from "@/lib/api-client";
import type { MapLabelDto, MapLabelInput } from "@/lib/map-labels";

export type MapLabelMutationInput = Pick<
  MapLabelInput,
  "brightness" | "colorKey" | "contrast" | "layer" | "size" | "text" | "x" | "y"
>;

export function fetchMapLabels() {
  return apiFetchJson<MapLabelDto[]>("/api/map-labels", { cache: "no-store" }, "Не удалось загрузить надписи.");
}

export function createMapLabel(input: MapLabelMutationInput) {
  return apiFetchJson<MapLabelDto>(
    "/api/map-labels",
    {
      body: JSON.stringify(input),
      headers: { "Content-Type": "application/json" },
      method: "POST",
    },
    "Не удалось сохранить надпись.",
  );
}

export function updateMapLabel(id: string, patch: Partial<MapLabelMutationInput>) {
  return apiFetchJson<MapLabelDto>(
    `/api/map-labels/${encodeURIComponent(id)}`,
    {
      body: JSON.stringify(patch),
      headers: { "Content-Type": "application/json" },
      method: "PATCH",
    },
    "Не удалось сохранить надпись.",
  );
}

export async function deleteMapLabel(id: string) {
  const response = await apiFetch(
    `/api/map-labels/${encodeURIComponent(id)}`,
    { method: "DELETE" },
    "Не удалось удалить надпись.",
  );

  return (await response.json()) as MapLabelDto;
}
