export const DEFAULT_MAP_LAYER = "Основной слой";

export type MapLayerDto = {
  id: string;
  name: string;
  normalizedName: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type MapLayerInput = {
  name?: unknown;
};

export type ValidatedMapLayerInput = {
  name: string;
  normalizedName: string;
};

export function normalizeMapLayerName(layer: unknown) {
  if (typeof layer !== "string") {
    return DEFAULT_MAP_LAYER;
  }

  const normalized = layer.normalize("NFKC").trim().replace(/\s+/g, " ");
  return normalized.length > 0 ? normalized : DEFAULT_MAP_LAYER;
}

export function normalizeMapLayerKey(layer: unknown) {
  return normalizeMapLayerName(layer).toLocaleLowerCase("ru-RU");
}

export function validateMapLayerInput(input: MapLayerInput) {
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { error: "Укажите название слоя.", ok: false as const };
  }

  const name = normalizeMapLayerName(input.name);

  if (!name) {
    return { error: "Укажите название слоя.", ok: false as const };
  }

  if (name.length > 80) {
    return { error: "Название слоя слишком длинное.", ok: false as const };
  }

  return {
    data: {
      name,
      normalizedName: normalizeMapLayerKey(name),
    },
    ok: true as const,
  };
}
