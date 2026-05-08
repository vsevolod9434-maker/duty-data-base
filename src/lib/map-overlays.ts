export type MapZoneType =
  | "radiation_110"
  | "radiation_170"
  | "radiation_230"
  | "radiation_290"
  | "radiation_350"
  | "danger_area"
  | "arch_field_static"
  | "arch_field_unstable";

export type MapZoneStatus = "active" | "inactive" | "warning";
export type MapZoneShape = "circle" | "polygon";

export type MapRouteType =
  | "patrol"
  | "clear_sky_movement"
  | "military_movement"
  | "freedom_movement"
  | "bandit_movement"
  | "monolith_movement"
  | "district_transition";

export type MapRouteStatus = "active" | "inactive" | "warning";

export type MapZonePointDto = {
  id: string;
  order: number;
  x: number;
  y: number;
};

export type MapZoneDto = {
  id: string;
  title: string;
  type: MapZoneType;
  status: MapZoneStatus;
  shape: MapZoneShape;
  centerX: number;
  centerY: number;
  radius: number;
  description: string | null;
  layer: string;
  points: MapZonePointDto[];
  createdAt: string;
  updatedAt: string;
};

export type MapRoutePointDto = {
  id: string;
  order: number;
  x: number;
  y: number;
};

export type MapRouteDto = {
  id: string;
  title: string;
  type: MapRouteType;
  status: MapRouteStatus;
  description: string | null;
  layer: string;
  points: MapRoutePointDto[];
  createdAt: string;
  updatedAt: string;
};

export type MapPointInput = {
  x?: unknown;
  y?: unknown;
};

export type MapZoneInput = {
  title?: unknown;
  type?: unknown;
  status?: unknown;
  shape?: unknown;
  centerX?: unknown;
  centerY?: unknown;
  radius?: unknown;
  points?: unknown;
  description?: unknown;
  layer?: unknown;
};

export type MapRouteInput = {
  title?: unknown;
  type?: unknown;
  status?: unknown;
  description?: unknown;
  layer?: unknown;
  points?: unknown;
};

export type ValidatedMapZoneInput = {
  title: string;
  type: MapZoneType;
  status: MapZoneStatus;
  shape: MapZoneShape;
  centerX: number;
  centerY: number;
  radius: number;
  description: string | null;
  layer: string;
  points: Array<{ order: number; x: number; y: number }>;
};

export type ValidatedMapRouteInput = {
  title: string;
  type: MapRouteType;
  status: MapRouteStatus;
  description: string | null;
  layer: string;
  points: Array<{ order: number; x: number; y: number }>;
};

const MAP_WIDTH = 10240;
const MAP_HEIGHT = 10240;
const MAX_ZONE_RADIUS = 5000;
const MAX_ROUTE_POINTS = 50;
const MAX_POLYGON_POINTS = 80;

export const DEFAULT_MAP_LAYER = "Основной слой";
export const DEFAULT_MAP_ZONE_TYPE: MapZoneType = "danger_area";
export const DEFAULT_MAP_ZONE_STATUS: MapZoneStatus = "active";
export const DEFAULT_MAP_ZONE_SHAPE: MapZoneShape = "circle";
export const DEFAULT_MAP_ZONE_RADIUS = 300;
export const DEFAULT_MAP_ROUTE_TYPE: MapRouteType = "patrol";
export const DEFAULT_MAP_ROUTE_STATUS: MapRouteStatus = "active";

export const mapZoneTypeLabels: Record<MapZoneType, string> = {
  arch_field_static: "Архиполе статичное",
  arch_field_unstable: "Архиполе непостоянное",
  danger_area: "Опасная территория",
  radiation_110: "Радиационный фон 110+",
  radiation_170: "Радиационный фон 170+",
  radiation_230: "Радиационный фон 230+",
  radiation_290: "Радиационный фон 290+",
  radiation_350: "Радиационный фон 350+",
};

export const mapZoneStatusLabels: Record<MapZoneStatus, string> = {
  active: "Активна",
  inactive: "Неактивна",
  warning: "Внимание",
};

export const mapZoneShapeLabels: Record<MapZoneShape, string> = {
  circle: "Круг",
  polygon: "Полигон",
};

export const mapRouteTypeLabels: Record<MapRouteType, string> = {
  bandit_movement: "Путь перемещения: Бандиты",
  clear_sky_movement: "Путь перемещения: Чистое Небо",
  district_transition: "Переход между районами",
  freedom_movement: "Путь перемещения: Свобода",
  military_movement: "Путь перемещения: Военные",
  monolith_movement: "Путь перемещения: Монолит",
  patrol: "Патрульный маршрут",
};

export const mapRouteStatusLabels: Record<MapRouteStatus, string> = {
  active: "Активен",
  inactive: "Неактивен",
  warning: "Внимание",
};

export const mapZoneTypes = Object.keys(mapZoneTypeLabels) as MapZoneType[];
export const mapZoneStatuses = Object.keys(mapZoneStatusLabels) as MapZoneStatus[];
export const mapZoneShapes = Object.keys(mapZoneShapeLabels) as MapZoneShape[];
export const mapRouteTypes = Object.keys(mapRouteTypeLabels) as MapRouteType[];
export const mapRouteStatuses = Object.keys(mapRouteStatusLabels) as MapRouteStatus[];

export function getMapZoneTypeLabel(type: MapZoneType | string) {
  return mapZoneTypeLabels[isMapZoneType(type) ? type : DEFAULT_MAP_ZONE_TYPE];
}

export function getMapZoneStatusLabel(status: MapZoneStatus | string) {
  return mapZoneStatusLabels[isMapZoneStatus(status) ? status : DEFAULT_MAP_ZONE_STATUS];
}

export function getMapZoneShapeLabel(shape: MapZoneShape | string) {
  return mapZoneShapeLabels[isMapZoneShape(shape) ? shape : DEFAULT_MAP_ZONE_SHAPE];
}

export function getMapRouteTypeLabel(type: MapRouteType | string) {
  return mapRouteTypeLabels[isMapRouteType(type) ? type : DEFAULT_MAP_ROUTE_TYPE];
}

export function getMapRouteStatusLabel(status: MapRouteStatus | string) {
  return mapRouteStatusLabels[isMapRouteStatus(status) ? status : DEFAULT_MAP_ROUTE_STATUS];
}

export function getMapZoneTypeClassName(type: MapZoneType | string) {
  return (isMapZoneType(type) ? type : DEFAULT_MAP_ZONE_TYPE).replaceAll("_", "-");
}

export function getMapRouteTypeClassName(type: MapRouteType | string) {
  return (isMapRouteType(type) ? type : DEFAULT_MAP_ROUTE_TYPE).replaceAll("_", "-");
}

export function normalizeMapLayerName(layer: unknown) {
  if (typeof layer !== "string") {
    return DEFAULT_MAP_LAYER;
  }

  return layer.trim() || DEFAULT_MAP_LAYER;
}

export function getMapPointsBounds(points: Array<Pick<MapPointInput, "x" | "y"> | { x: number; y: number }>) {
  const normalizedPoints = points
    .map((point) => ({ x: parseInteger(point.x), y: parseInteger(point.y) }))
    .filter((point): point is { x: number; y: number } => point.x !== null && point.y !== null);

  if (normalizedPoints.length === 0) {
    return null;
  }

  return normalizedPoints.reduce(
    (bounds, point) => ({
      maxX: Math.max(bounds.maxX, point.x),
      maxY: Math.max(bounds.maxY, point.y),
      minX: Math.min(bounds.minX, point.x),
      minY: Math.min(bounds.minY, point.y),
    }),
    {
      maxX: normalizedPoints[0].x,
      maxY: normalizedPoints[0].y,
      minX: normalizedPoints[0].x,
      minY: normalizedPoints[0].y,
    },
  );
}

export function getBoundsCenter(bounds: { minX: number; minY: number; maxX: number; maxY: number }) {
  return {
    x: Math.round((bounds.minX + bounds.maxX) / 2),
    y: Math.round((bounds.minY + bounds.maxY) / 2),
  };
}

function isMapZoneType(value: unknown): value is MapZoneType {
  return typeof value === "string" && mapZoneTypes.includes(value as MapZoneType);
}

function isMapZoneStatus(value: unknown): value is MapZoneStatus {
  return typeof value === "string" && mapZoneStatuses.includes(value as MapZoneStatus);
}

function isMapZoneShape(value: unknown): value is MapZoneShape {
  return typeof value === "string" && mapZoneShapes.includes(value as MapZoneShape);
}

function isMapRouteType(value: unknown): value is MapRouteType {
  return typeof value === "string" && mapRouteTypes.includes(value as MapRouteType);
}

function isMapRouteStatus(value: unknown): value is MapRouteStatus {
  return typeof value === "string" && mapRouteStatuses.includes(value as MapRouteStatus);
}

function normalizeOptionalText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function parseInteger(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsedValue = Number(value);
    return Number.isInteger(parsedValue) ? parsedValue : null;
  }

  return null;
}

function isMapCoordinate(x: number | null, y: number | null) {
  return x !== null && y !== null && x >= 0 && y >= 0 && x <= MAP_WIDTH && y <= MAP_HEIGHT;
}

function parsePoints(points: unknown) {
  if (!Array.isArray(points)) {
    return [];
  }

  return points.map((point, index) => {
    const inputPoint = typeof point === "object" && point !== null ? (point as MapPointInput) : {};
    return {
      order: index,
      x: parseInteger(inputPoint.x),
      y: parseInteger(inputPoint.y),
    };
  });
}

export function validateMapZoneInput(input: MapZoneInput): { ok: true; value: ValidatedMapZoneInput } | { ok: false; error: string } {
  const title = normalizeOptionalText(input.title);

  if (!title) {
    return { error: "Укажите название зоны.", ok: false };
  }

  if (title.length > 80) {
    return { error: "Название зоны слишком длинное.", ok: false };
  }

  if (input.type !== undefined && !isMapZoneType(input.type)) {
    return { error: "Некорректный тип зоны.", ok: false };
  }

  if (input.shape !== undefined && !isMapZoneShape(input.shape)) {
    return { error: "Некорректная форма зоны.", ok: false };
  }

  const description = normalizeOptionalText(input.description);

  if (description.length > 1000) {
    return { error: "Описание зоны слишком длинное.", ok: false };
  }

  const shape = isMapZoneShape(input.shape) ? input.shape : DEFAULT_MAP_ZONE_SHAPE;

  if (shape === "polygon") {
    const points = parsePoints(input.points);

    if (points.length < 3) {
      return { error: "Полигон должен содержать минимум три точки.", ok: false };
    }

    if (points.length > MAX_POLYGON_POINTS) {
      return { error: "Слишком много точек полигона.", ok: false };
    }

    if (points.some((point) => !isMapCoordinate(point.x, point.y))) {
      return { error: "Некорректные координаты полигона.", ok: false };
    }

    const validPoints = points.map((point) => ({ order: point.order, x: point.x as number, y: point.y as number }));
    const bounds = getMapPointsBounds(validPoints);
    const center = bounds ? getBoundsCenter(bounds) : { x: 0, y: 0 };

    return {
      ok: true,
      value: {
        centerX: center.x,
        centerY: center.y,
        description: description || null,
        layer: normalizeMapLayerName(input.layer),
        points: validPoints,
        radius: 0,
        shape,
        status: isMapZoneStatus(input.status) ? input.status : DEFAULT_MAP_ZONE_STATUS,
        title,
        type: isMapZoneType(input.type) ? input.type : DEFAULT_MAP_ZONE_TYPE,
      },
    };
  }

  const centerX = parseInteger(input.centerX);
  const centerY = parseInteger(input.centerY);

  if (!isMapCoordinate(centerX, centerY)) {
    return { error: "Некорректные координаты зоны.", ok: false };
  }

  const radius = parseInteger(input.radius);

  if (radius === null || radius <= 0 || radius > MAX_ZONE_RADIUS) {
    return { error: "Некорректный радиус зоны.", ok: false };
  }

  return {
    ok: true,
    value: {
      centerX: centerX as number,
      centerY: centerY as number,
      description: description || null,
      layer: normalizeMapLayerName(input.layer),
      points: [],
      radius,
      shape,
      status: isMapZoneStatus(input.status) ? input.status : DEFAULT_MAP_ZONE_STATUS,
      title,
      type: isMapZoneType(input.type) ? input.type : DEFAULT_MAP_ZONE_TYPE,
    },
  };
}

export function validateMapRouteInput(input: MapRouteInput): { ok: true; value: ValidatedMapRouteInput } | { ok: false; error: string } {
  const title = normalizeOptionalText(input.title);

  if (!title) {
    return { error: "Укажите название маршрута.", ok: false };
  }

  if (title.length > 80) {
    return { error: "Название маршрута слишком длинное.", ok: false };
  }

  if (input.type !== undefined && !isMapRouteType(input.type)) {
    return { error: "Некорректный тип маршрута.", ok: false };
  }

  const points = parsePoints(input.points);

  if (points.length < 2) {
    return { error: "Маршрут должен содержать минимум две точки.", ok: false };
  }

  if (points.length > MAX_ROUTE_POINTS) {
    return { error: "Слишком много точек маршрута.", ok: false };
  }

  if (points.some((point) => !isMapCoordinate(point.x, point.y))) {
    return { error: "Некорректные координаты маршрута.", ok: false };
  }

  const description = normalizeOptionalText(input.description);

  if (description.length > 1000) {
    return { error: "Описание маршрута слишком длинное.", ok: false };
  }

  return {
    ok: true,
    value: {
      description: description || null,
      layer: normalizeMapLayerName(input.layer),
      points: points.map((point) => ({ order: point.order, x: point.x as number, y: point.y as number })),
      status: isMapRouteStatus(input.status) ? input.status : DEFAULT_MAP_ROUTE_STATUS,
      title,
      type: isMapRouteType(input.type) ? input.type : DEFAULT_MAP_ROUTE_TYPE,
    },
  };
}
