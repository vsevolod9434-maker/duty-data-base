import { DEFAULT_MAP_LAYER, normalizeMapLayerName } from "@/lib/map-layers";
import {
  DEFAULT_MAP_OBJECT_COLOR_KEY,
  DEFAULT_MAP_STYLE_VALUE,
  normalizeObjectColorKey,
  type MapObjectColorKey,
} from "@/lib/map-overlays";

export type MapLabelDto = {
  id: string;
  text: string;
  x: number;
  y: number;
  colorKey: MapObjectColorKey;
  brightness: number;
  contrast: number;
  size: number;
  layer: string;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MapLabelInput = {
  text?: unknown;
  x?: unknown;
  y?: unknown;
  colorKey?: unknown;
  brightness?: unknown;
  contrast?: unknown;
  size?: unknown;
  layer?: unknown;
};

export type ValidatedMapLabelInput = {
  text: string;
  x: number;
  y: number;
  colorKey: MapObjectColorKey;
  brightness: number;
  contrast: number;
  size: number;
  layer: string;
};

const MAP_WIDTH = 10240;
const MAP_HEIGHT = 10240;
const MIN_LABEL_STYLE_VALUE = 40;
const MAX_LABEL_STYLE_VALUE = 180;
const MIN_LABEL_SIZE = 70;
const MAX_LABEL_SIZE = 240;

export const DEFAULT_MAP_LABEL_SIZE = 130;

export const MAP_LABEL_SIZE_PRESETS = {
  large: { label: "Крупный", size: 170 },
  small: { label: "Маленький", size: 100 },
  standard: { label: "Стандартный", size: DEFAULT_MAP_LABEL_SIZE },
} as const;

function normalizeInteger(value: unknown, fallback: number) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.round(parsedValue) : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeLabelStyleValue(value: unknown) {
  return clamp(normalizeInteger(value, DEFAULT_MAP_STYLE_VALUE), MIN_LABEL_STYLE_VALUE, MAX_LABEL_STYLE_VALUE);
}

export function validateMapLabelInput(input: MapLabelInput) {
  const text = typeof input.text === "string" ? input.text.normalize("NFKC").trim() : "";

  if (!text) {
    return { error: "Укажите текст надписи.", ok: false as const };
  }

  if (text.length > 200) {
    return { error: "Текст надписи слишком длинный.", ok: false as const };
  }

  const x = normalizeInteger(input.x, Number.NaN);
  const y = normalizeInteger(input.y, Number.NaN);

  if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || y < 0 || x > MAP_WIDTH || y > MAP_HEIGHT) {
    return { error: "Укажите точку надписи на карте.", ok: false as const };
  }

  return {
    ok: true as const,
    value: {
      brightness: normalizeLabelStyleValue(input.brightness),
      colorKey: normalizeObjectColorKey(input.colorKey ?? DEFAULT_MAP_OBJECT_COLOR_KEY),
      contrast: normalizeLabelStyleValue(input.contrast),
      layer: normalizeMapLayerName(input.layer ?? DEFAULT_MAP_LAYER),
      size: clamp(normalizeInteger(input.size, DEFAULT_MAP_LABEL_SIZE), MIN_LABEL_SIZE, MAX_LABEL_SIZE),
      text,
      x,
      y,
    },
  };
}
