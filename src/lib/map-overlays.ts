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
export type MapObjectColorKey = "red" | "orange" | "yellow" | "green" | "cyan" | "blue" | "violet" | "black";
export type MapFillPatternKey =
  | "solid"
  | "hatch_vertical"
  | "hatch_horizontal"
  | "hatch_diag_right"
  | "hatch_diag_left"
  | "cross_one"
  | "cross_two"
  | "strike_horizontal"
  | "strike_vertical"
  | "grid";
export type MapZoneColorKey = MapObjectColorKey;

export type MapRouteType =
  | "patrol"
  | "clear_sky_movement"
  | "military_movement"
  | "freedom_movement"
  | "bandit_movement"
  | "monolith_movement"
  | "district_transition";

export type MapRouteStatus = "active" | "inactive" | "warning";
export type MapRouteColorKey = MapObjectColorKey;
export type MapLinePatternKey = "solid" | "dashed" | "short_dash" | "long_dash" | "dot_dash" | "dash_dot" | "double_line" | "crossed";

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
  colorKey: MapZoneColorKey;
  patternKey: MapFillPatternKey;
  brightness: number;
  contrast: number;
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
  colorKey: MapRouteColorKey;
  linePattern: MapLinePatternKey;
  brightness: number;
  contrast: number;
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
  colorKey?: unknown;
  patternKey?: unknown;
  brightness?: unknown;
  contrast?: unknown;
  points?: unknown;
  description?: unknown;
  layer?: unknown;
};

export type MapRouteInput = {
  title?: unknown;
  type?: unknown;
  status?: unknown;
  colorKey?: unknown;
  linePattern?: unknown;
  brightness?: unknown;
  contrast?: unknown;
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
  colorKey: MapZoneColorKey;
  patternKey: MapFillPatternKey;
  brightness: number;
  contrast: number;
  description: string | null;
  layer: string;
  points: Array<{ order: number; x: number; y: number }>;
};

export type ValidatedMapRouteInput = {
  title: string;
  type: MapRouteType;
  status: MapRouteStatus;
  colorKey: MapRouteColorKey;
  linePattern: MapLinePatternKey;
  brightness: number;
  contrast: number;
  description: string | null;
  layer: string;
  points: Array<{ order: number; x: number; y: number }>;
};

const MAP_WIDTH = 10240;
const MAP_HEIGHT = 10240;
const MAX_ZONE_RADIUS = 5000;
const MAX_POLYGON_POINTS = 80;

export const DEFAULT_MAP_LAYER = "Основной слой";
export const DEFAULT_MAP_ZONE_TYPE: MapZoneType = "danger_area";
export const DEFAULT_MAP_ZONE_STATUS: MapZoneStatus = "active";
export const DEFAULT_MAP_ZONE_SHAPE: MapZoneShape = "circle";
export const DEFAULT_MAP_ZONE_RADIUS = 300;
export const DEFAULT_MAP_OBJECT_COLOR_KEY: MapObjectColorKey = "red";
export const DEFAULT_MAP_FILL_PATTERN: MapFillPatternKey = "solid";
export const DEFAULT_MAP_STYLE_VALUE = 100;
export const DEFAULT_MAP_ZONE_COLOR_KEY: MapZoneColorKey = DEFAULT_MAP_OBJECT_COLOR_KEY;
export const DEFAULT_MAP_ROUTE_TYPE: MapRouteType = "patrol";
export const DEFAULT_MAP_ROUTE_STATUS: MapRouteStatus = "active";
export const DEFAULT_MAP_ROUTE_COLOR_KEY: MapRouteColorKey = DEFAULT_MAP_OBJECT_COLOR_KEY;
export const DEFAULT_MAP_ROUTE_LINE_PATTERN: MapLinePatternKey = "solid";

export const MAP_COLOR_PRESETS: Record<MapObjectColorKey, { label: string; stroke: string; fill: string; marker: string; nodeFill: string }> = {
  black: { fill: "rgba(8, 10, 10, 0.24)", label: "Чёрный", marker: "rgba(12, 14, 14, 0.96)", nodeFill: "rgba(12, 14, 14, 0.92)", stroke: "rgba(28, 31, 31, 0.82)" },
  blue: { fill: "rgba(70, 112, 196, 0.17)", label: "Синий", marker: "rgba(91, 130, 215, 0.95)", nodeFill: "rgba(70, 112, 196, 0.92)", stroke: "rgba(91, 130, 215, 0.76)" },
  cyan: { fill: "rgba(65, 157, 181, 0.16)", label: "Голубой", marker: "rgba(89, 181, 204, 0.95)", nodeFill: "rgba(65, 157, 181, 0.92)", stroke: "rgba(89, 181, 204, 0.74)" },
  green: { fill: "rgba(91, 153, 96, 0.16)", label: "Зелёный", marker: "rgba(106, 174, 112, 0.95)", nodeFill: "rgba(91, 153, 96, 0.92)", stroke: "rgba(106, 174, 112, 0.74)" },
  orange: { fill: "rgba(196, 118, 55, 0.17)", label: "Оранжевый", marker: "rgba(213, 139, 72, 0.95)", nodeFill: "rgba(196, 118, 55, 0.92)", stroke: "rgba(213, 139, 72, 0.76)" },
  red: { fill: "rgba(168, 54, 60, 0.18)", label: "Красный", marker: "rgba(207, 75, 82, 0.95)", nodeFill: "rgba(168, 54, 60, 0.92)", stroke: "rgba(207, 75, 82, 0.78)" },
  violet: { fill: "rgba(137, 86, 173, 0.16)", label: "Фиолетовый", marker: "rgba(157, 109, 194, 0.95)", nodeFill: "rgba(137, 86, 173, 0.92)", stroke: "rgba(157, 109, 194, 0.74)" },
  yellow: { fill: "rgba(200, 174, 67, 0.16)", label: "Жёлтый", marker: "rgba(216, 190, 85, 0.95)", nodeFill: "rgba(200, 174, 67, 0.92)", stroke: "rgba(216, 190, 85, 0.74)" },
};

export const ZONE_COLOR_PRESETS = MAP_COLOR_PRESETS;
export const ROUTE_COLOR_PRESETS = MAP_COLOR_PRESETS;

export const FILL_PATTERN_PRESETS: Record<MapFillPatternKey, { label: string }> = {
  cross_one: { label: "Перечёркнуто одной линией" },
  cross_two: { label: "Перечёркнуто двумя линиями" },
  grid: { label: "Сетка" },
  hatch_diag_left: { label: "Штриховка слева направо" },
  hatch_diag_right: { label: "Штриховка справа налево" },
  hatch_horizontal: { label: "Штриховка горизонтальная" },
  hatch_vertical: { label: "Штриховка вертикальная" },
  solid: { label: "Сплошной" },
  strike_horizontal: { label: "Перечёркнуто по горизонтали" },
  strike_vertical: { label: "Перечёркнуто по вертикали" },
};

export const LINE_PATTERN_PRESETS: Record<MapLinePatternKey, { label: string; dasharray: string | null }> = {
  crossed: { dasharray: "10 6 2 6", label: "Перечёркнутая линия" },
  dash_dot: { dasharray: "12 6 2 6", label: "Штрих-пунктир" },
  dashed: { dasharray: "8 6", label: "Пунктир" },
  dot_dash: { dasharray: "2 6", label: "Точка-пунктир" },
  double_line: { dasharray: null, label: "Двойная линия" },
  long_dash: { dasharray: "14 8", label: "Длинный пунктир" },
  short_dash: { dasharray: "4 5", label: "Короткий пунктир" },
  solid: { dasharray: null, label: "Сплошная" },
};

export const CIRCLE_RADIUS_PRESETS: Record<"small" | "medium" | "large", { label: string; radius: number }> = {
  large: { label: "Большой", radius: 150 },
  medium: { label: "Средний", radius: 100 },
  small: { label: "Маленький", radius: 50 },
};

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
export const zoneColorKeys = Object.keys(ZONE_COLOR_PRESETS) as MapZoneColorKey[];
export const routeColorKeys = Object.keys(ROUTE_COLOR_PRESETS) as MapRouteColorKey[];
export const fillPatternKeys = Object.keys(FILL_PATTERN_PRESETS) as MapFillPatternKey[];
export const linePatternKeys = Object.keys(LINE_PATTERN_PRESETS) as MapLinePatternKey[];

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

export function getZoneColorPreset(key: MapZoneColorKey | string) {
  return ZONE_COLOR_PRESETS[isZoneColorKey(key) ? key : DEFAULT_MAP_ZONE_COLOR_KEY];
}

export function getRouteColorPreset(key: MapRouteColorKey | string) {
  return ROUTE_COLOR_PRESETS[isRouteColorKey(key) ? key : DEFAULT_MAP_ROUTE_COLOR_KEY];
}

export function getLinePatternPreset(key: MapLinePatternKey | string) {
  return LINE_PATTERN_PRESETS[isLinePatternKey(key) ? key : DEFAULT_MAP_ROUTE_LINE_PATTERN];
}

export function getFillPatternPreset(key: MapFillPatternKey | string) {
  return FILL_PATTERN_PRESETS[isFillPatternKey(key) ? key : DEFAULT_MAP_FILL_PATTERN];
}

export function normalizeZoneColorKey(value: unknown): MapZoneColorKey {
  return normalizeObjectColorKey(value);
}

export function normalizeRouteColorKey(value: unknown): MapRouteColorKey {
  return normalizeObjectColorKey(value);
}

export function normalizeObjectColorKey(value: unknown): MapObjectColorKey {
  if (isObjectColorKey(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return DEFAULT_MAP_OBJECT_COLOR_KEY;
  }

  const legacyColorMap: Record<string, MapObjectColorKey> = {
    arch_static: "blue",
    arch_unstable: "violet",
    bandit: "orange",
    clear_sky: "cyan",
    danger: "red",
    duty: "red",
    freedom: "green",
    military: "green",
    monolith: "violet",
    neutral: "red",
    radiation_high: "orange",
    radiation_low: "yellow",
    radiation_medium: "orange",
    warning: "yellow",
  };

  return legacyColorMap[value] ?? DEFAULT_MAP_OBJECT_COLOR_KEY;
}

export function normalizeFillPattern(value: unknown): MapFillPatternKey {
  return isFillPatternKey(value) ? value : DEFAULT_MAP_FILL_PATTERN;
}

export function normalizeLinePattern(value: unknown): MapLinePatternKey {
  return isLinePatternKey(value) ? value : DEFAULT_MAP_ROUTE_LINE_PATTERN;
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

function isZoneColorKey(value: unknown): value is MapZoneColorKey {
  return isObjectColorKey(value);
}

function isRouteColorKey(value: unknown): value is MapRouteColorKey {
  return isObjectColorKey(value);
}

function isLinePatternKey(value: unknown): value is MapLinePatternKey {
  return typeof value === "string" && linePatternKeys.includes(value as MapLinePatternKey);
}

function isObjectColorKey(value: unknown): value is MapObjectColorKey {
  return typeof value === "string" && zoneColorKeys.includes(value as MapObjectColorKey);
}

function isFillPatternKey(value: unknown): value is MapFillPatternKey {
  return typeof value === "string" && fillPatternKeys.includes(value as MapFillPatternKey);
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

function normalizeStyleValue(value: unknown) {
  const parsedValue = parseInteger(value);
  return parsedValue === null ? DEFAULT_MAP_STYLE_VALUE : Math.max(0, parsedValue);
}

function validateStyleValue(_value: number, _error: string) {
  void _value;
  void _error;
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
  const brightness = normalizeStyleValue(input.brightness);
  const contrast = normalizeStyleValue(input.contrast);
  const brightnessError = validateStyleValue(brightness, "Некорректное значение яркости.");
  const contrastError = validateStyleValue(contrast, "Некорректное значение контрастности.");

  if (brightnessError) {
    return { error: brightnessError, ok: false };
  }

  if (contrastError) {
    return { error: contrastError, ok: false };
  }

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
        brightness,
        colorKey: normalizeZoneColorKey(input.colorKey),
        contrast,
        description: description || null,
        layer: normalizeMapLayerName(input.layer),
        patternKey: normalizeFillPattern(input.patternKey),
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
      brightness,
      colorKey: normalizeZoneColorKey(input.colorKey),
      contrast,
      description: description || null,
      layer: normalizeMapLayerName(input.layer),
      patternKey: normalizeFillPattern(input.patternKey),
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

  if (input.linePattern !== undefined && !isLinePatternKey(input.linePattern)) {
    return { error: "Некорректный формат линии маршрута.", ok: false };
  }

  const points = parsePoints(input.points);

  if (points.length < 2) {
    return { error: "Маршрут должен содержать минимум две точки.", ok: false };
  }

  if (points.some((point) => !isMapCoordinate(point.x, point.y))) {
    return { error: "Некорректные координаты маршрута.", ok: false };
  }

  const description = normalizeOptionalText(input.description);

  if (description.length > 1000) {
    return { error: "Описание маршрута слишком длинное.", ok: false };
  }

  const brightness = normalizeStyleValue(input.brightness);
  const contrast = normalizeStyleValue(input.contrast);
  const brightnessError = validateStyleValue(brightness, "Некорректное значение яркости.");
  const contrastError = validateStyleValue(contrast, "Некорректное значение контрастности.");

  if (brightnessError) {
    return { error: brightnessError, ok: false };
  }

  if (contrastError) {
    return { error: contrastError, ok: false };
  }

  return {
    ok: true,
    value: {
      brightness,
      colorKey: normalizeRouteColorKey(input.colorKey),
      contrast,
      description: description || null,
      layer: normalizeMapLayerName(input.layer),
      linePattern: normalizeLinePattern(input.linePattern),
      points: points.map((point) => ({ order: point.order, x: point.x as number, y: point.y as number })),
      status: isMapRouteStatus(input.status) ? input.status : DEFAULT_MAP_ROUTE_STATUS,
      title,
      type: isMapRouteType(input.type) ? input.type : DEFAULT_MAP_ROUTE_TYPE,
    },
  };
}
