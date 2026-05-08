export type MapMarkerUiType =
  | "possible_shelter"
  | "route_point"
  | "trader"
  | "unstable_bubble"
  | "pripyat3_bubble";

export type MapMarkerLegacyType =
  | "base"
  | "checkpoint"
  | "storage"
  | "transition"
  | "danger"
  | "point"
  | "housing"
  | "trade"
  | "violation"
  | "task"
  | "other";

export type MapMarkerType = MapMarkerUiType | MapMarkerLegacyType;

export type MapMarkerStatus = "active" | "inactive" | "warning" | "archived";

export type MapMarkerDto = {
  id: string;
  title: string;
  type: MapMarkerType;
  status: MapMarkerStatus;
  x: number;
  y: number;
  description: string | null;
  layer: string;
  createdAt: string;
  updatedAt: string;
};

export type MapMarkerInput = {
  title?: unknown;
  type?: unknown;
  status?: unknown;
  x?: unknown;
  y?: unknown;
  description?: unknown;
  layer?: unknown;
};

export type ValidatedMapMarkerInput = {
  title: string;
  type: MapMarkerUiType;
  status: MapMarkerStatus;
  x: number;
  y: number;
  description: string | null;
  layer: string;
};

const MAP_WIDTH = 10240;
const MAP_HEIGHT = 10240;
export const DEFAULT_MAP_LAYER = "Основной слой";
export const DEFAULT_MAP_MARKER_TYPE: MapMarkerUiType = "route_point";

export const mapMarkerTypeLabels: Record<MapMarkerUiType, string> = {
  possible_shelter: "Возможный ночлег",
  pripyat3_bubble: "Пузырь Припять-3",
  route_point: "Маршрутная точка",
  trader: "Торговец",
  unstable_bubble: "Пузырь непостоянный",
};

export const mapMarkerStatusLabels: Record<MapMarkerStatus, string> = {
  active: "Активна",
  archived: "Архив",
  inactive: "Неактивна",
  warning: "Внимание",
};

export const mapMarkerUiTypes = Object.keys(mapMarkerTypeLabels) as MapMarkerUiType[];

const mapMarkerLegacyTypes = [
  "base",
  "checkpoint",
  "storage",
  "transition",
  "danger",
  "point",
  "housing",
  "trade",
  "violation",
  "task",
  "other",
] as const satisfies readonly MapMarkerLegacyType[];
const mapMarkerStatuses = Object.keys(mapMarkerStatusLabels) as MapMarkerStatus[];

export function normalizeMapMarkerType(type: unknown): MapMarkerUiType {
  return typeof type === "string" && mapMarkerUiTypes.includes(type as MapMarkerUiType)
    ? (type as MapMarkerUiType)
    : DEFAULT_MAP_MARKER_TYPE;
}

export function getMapMarkerTypeLabel(type: MapMarkerType | string) {
  return mapMarkerTypeLabels[normalizeMapMarkerType(type)];
}

export function getMapMarkerTypeClassName(type: MapMarkerType | string) {
  return normalizeMapMarkerType(type).replaceAll("_", "-");
}

export function getMapMarkerStatusLabel(status: MapMarkerStatus) {
  return mapMarkerStatusLabels[status] ?? mapMarkerStatusLabels.active;
}

export function isMapMarkerStatus(value: unknown): value is MapMarkerStatus {
  return typeof value === "string" && mapMarkerStatuses.includes(value as MapMarkerStatus);
}

export function normalizeMapLayerName(layer: unknown) {
  if (typeof layer !== "string") {
    return DEFAULT_MAP_LAYER;
  }

  return layer.trim() || DEFAULT_MAP_LAYER;
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseCoordinate(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsedValue = Number(value);
    return Number.isInteger(parsedValue) ? parsedValue : null;
  }

  return null;
}

function validateMarkerType(value: unknown): { ok: true; value: MapMarkerUiType } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true, value: DEFAULT_MAP_MARKER_TYPE };
  }

  if (typeof value !== "string") {
    return { error: "Некорректный тип метки.", ok: false };
  }

  if (mapMarkerUiTypes.includes(value as MapMarkerUiType)) {
    return { ok: true, value: value as MapMarkerUiType };
  }

  if (mapMarkerLegacyTypes.includes(value as MapMarkerLegacyType)) {
    return { ok: true, value: DEFAULT_MAP_MARKER_TYPE };
  }

  return { error: "Некорректный тип метки.", ok: false };
}

export function validateMapMarkerInput(input: MapMarkerInput): { ok: true; value: ValidatedMapMarkerInput } | { ok: false; error: string } {
  const title = normalizeOptionalText(input.title);

  if (!title) {
    return { error: "Укажите название метки.", ok: false };
  }

  if (title.length > 80) {
    return { error: "Название метки слишком длинное.", ok: false };
  }

  const typeValidation = validateMarkerType(input.type);

  if (!typeValidation.ok) {
    return typeValidation;
  }

  const x = parseCoordinate(input.x);
  const y = parseCoordinate(input.y);

  if (x === null || y === null || x < 0 || y < 0 || x > MAP_WIDTH || y > MAP_HEIGHT) {
    return { error: "Некорректные координаты метки.", ok: false };
  }

  const description = normalizeOptionalText(input.description);

  if (description.length > 1000) {
    return { error: "Описание метки слишком длинное.", ok: false };
  }

  return {
    ok: true,
    value: {
      description: description || null,
      layer: normalizeMapLayerName(input.layer),
      status: isMapMarkerStatus(input.status) ? input.status : "active",
      title,
      type: typeValidation.value,
      x,
      y,
    },
  };
}
