"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { MapMarkerIcon, TileMapViewer } from "@/components/map/TileMapViewer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createMapLayer, deleteMapLayer, fetchMapLayers, updateMapLayer } from "@/lib/map-layer-api";
import { DEFAULT_MAP_LAYER, normalizeMapLayerName, type MapLayerDto } from "@/lib/map-layers";
import { createMapMarker, deleteMapMarker, fetchMapMarkers, updateMapMarker } from "@/lib/map-marker-api";
import {
  createMapRoute,
  createMapZone,
  deleteMapRoute,
  deleteMapZone,
  fetchMapRoutes,
  fetchMapZones,
  updateMapRoute,
  updateMapZone,
} from "@/lib/map-overlay-api";
import {
  DEFAULT_MAP_MARKER_TYPE,
  MAP_MARKER_SIZE_PRESETS,
  getMapMarkerTypeClassName,
  getMapMarkerTypeLabel,
  normalizeMapMarkerType,
  type MapMarkerDto,
  type MapMarkerStatus,
  type MapMarkerUiType,
} from "@/lib/map-markers";
import {
  CIRCLE_RADIUS_PRESETS,
  DEFAULT_MAP_ROUTE_COLOR_KEY,
  DEFAULT_MAP_ROUTE_LINE_PATTERN,
  DEFAULT_MAP_ROUTE_STATUS,
  DEFAULT_MAP_ROUTE_TYPE,
  DEFAULT_MAP_ZONE_COLOR_KEY,
  DEFAULT_MAP_ZONE_RADIUS,
  DEFAULT_MAP_ZONE_SHAPE,
  DEFAULT_MAP_ZONE_STATUS,
  DEFAULT_MAP_ZONE_TYPE,
  getBoundsCenter,
  getMapPointsBounds,
  getMapZoneShapeLabel,
  getLinePatternPreset,
  getFillPatternPreset,
  getRouteColorPreset,
  getZoneColorPreset,
  fillPatternKeys,
  linePatternKeys,
  type MapLinePatternKey,
  type MapFillPatternKey,
  type MapObjectColorKey,
  type MapRouteColorKey,
  type MapRouteDto,
  type MapRouteStatus,
  type MapRouteType,
  type MapZoneColorKey,
  type MapZoneDto,
  type MapZoneShape,
  type MapZoneStatus,
  type MapZoneType,
} from "@/lib/map-overlays";

type ActivePanel = "markers" | "zones" | "routes" | "layers";
type DrawingMode = "marker" | "zone" | "zone-polygon" | "route" | null;
type MapPoint = { x: number; y: number };
type FocusTarget =
  | { type: "point"; x: number; y: number; nonce: number }
  | { type: "bounds"; bounds: { minX: number; minY: number; maxX: number; maxY: number }; nonce: number };
type FocusCommand =
  | { type: "point"; x: number; y: number }
  | { type: "bounds"; bounds: { minX: number; minY: number; maxX: number; maxY: number } };

type MarkerFormDraft = {
  id?: string;
  title: string;
  type: MapMarkerUiType;
  status: MapMarkerStatus;
  colorKey: MapObjectColorKey;
  patternKey: MapFillPatternKey;
  brightness: string;
  contrast: string;
  size: string;
  layer: string;
  x: string;
  y: string;
  description: string;
};

type ZoneFormDraft = {
  id?: string;
  title: string;
  type: MapZoneType;
  status: MapZoneStatus;
  shape: MapZoneShape;
  colorKey: MapZoneColorKey;
  patternKey: MapFillPatternKey;
  brightness: string;
  contrast: string;
  layer: string;
  centerX: string;
  centerY: string;
  radius: string;
  points: MapPoint[];
  description: string;
};

type RouteFormDraft = {
  id?: string;
  title: string;
  type: MapRouteType;
  status: MapRouteStatus;
  colorKey: MapRouteColorKey;
  linePattern: MapLinePatternKey;
  brightness: string;
  contrast: string;
  layer: string;
  points: MapPoint[];
  description: string;
};

type ConfirmDialogState = {
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  variant?: "danger" | "default" | "warning";
  confirmTone?: "primary" | "warning" | "danger";
  loading?: boolean;
  onConfirm: () => void | Promise<void>;
};

function LayerEditIcon() {
  return (
    <svg aria-hidden="true" className="map-layer-action-icon" viewBox="0 0 16 16">
      <path
        d="M10.8 2.2a1.7 1.7 0 0 1 2.4 0l.6.6a1.7 1.7 0 0 1 0 2.4l-6.9 6.9-2.9.5.5-2.9 6.3-6.3Z"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
      <path
        d="M9.8 3.2 12.8 6.2"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.3"
      />
    </svg>
  );
}

function LayerDeleteIcon() {
  return (
    <svg aria-hidden="true" className="map-layer-action-icon" viewBox="0 0 16 16">
      <path
        d="M4.2 4.2 11.8 11.8M11.8 4.2 4.2 11.8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

const emptyMarkerDraft: MarkerFormDraft = {
  brightness: "100",
  colorKey: "red",
  contrast: "100",
  description: "",
  layer: DEFAULT_MAP_LAYER,
  patternKey: "solid",
  size: "100",
  status: "active",
  title: "",
  type: DEFAULT_MAP_MARKER_TYPE,
  x: "0",
  y: "0",
};

const emptyZoneDraft: ZoneFormDraft = {
  brightness: "100",
  centerX: "0",
  centerY: "0",
  colorKey: DEFAULT_MAP_ZONE_COLOR_KEY,
  contrast: "100",
  description: "",
  layer: DEFAULT_MAP_LAYER,
  patternKey: "solid",
  points: [],
  radius: String(DEFAULT_MAP_ZONE_RADIUS),
  shape: DEFAULT_MAP_ZONE_SHAPE,
  status: DEFAULT_MAP_ZONE_STATUS,
  title: "",
  type: DEFAULT_MAP_ZONE_TYPE,
};

const emptyRouteDraft: RouteFormDraft = {
  brightness: "100",
  colorKey: DEFAULT_MAP_ROUTE_COLOR_KEY,
  contrast: "100",
  description: "",
  layer: DEFAULT_MAP_LAYER,
  linePattern: DEFAULT_MAP_ROUTE_LINE_PATTERN,
  points: [],
  status: DEFAULT_MAP_ROUTE_STATUS,
  title: "",
  type: DEFAULT_MAP_ROUTE_TYPE,
};

const orderedMarkerSizePresets = [
  ["small", MAP_MARKER_SIZE_PRESETS.small],
  ["standard", MAP_MARKER_SIZE_PRESETS.standard],
  ["large", MAP_MARKER_SIZE_PRESETS.large],
] as const;

const orderedMarkerUiTypes: MapMarkerUiType[] = [
  "possible_shelter",
  "route_point",
  "trader",
  "unstable_bubble",
  "pripyat3_bubble",
  "question",
  "exclamation",
  "radiation",
];

const orderedCircleRadiusPresets = [
  ["small", CIRCLE_RADIUS_PRESETS.small],
  ["medium", CIRCLE_RADIUS_PRESETS.medium],
  ["large", CIRCLE_RADIUS_PRESETS.large],
] as const;

const orderedMapColorKeys: MapObjectColorKey[] = ["red", "orange", "yellow", "green", "cyan", "blue", "violet", "black"];
const styleValuePresets = [100, 125, 150] as const;

function normalizeSearch(value: string) {
  return value.trim().toLocaleLowerCase("ru");
}

function normalizeStyleDraftValue(value: string) {
  const parsedValue = Number(value);
  return Number.isFinite(parsedValue) ? Math.max(0, parsedValue) : 100;
}

function sortedPoints<T extends { order: number; x: number; y: number }>(points: T[]) {
  return [...points].sort((firstPoint, secondPoint) => firstPoint.order - secondPoint.order);
}

function getLayerOptions(mapLayers: MapLayerDto[], markers: MapMarkerDto[], zones: MapZoneDto[], routes: MapRouteDto[]) {
  return Array.from(
    new Set([
      DEFAULT_MAP_LAYER,
      ...mapLayers.map((layer) => normalizeMapLayerName(layer.name)),
      ...markers.map((marker) => normalizeMapLayerName(marker.layer)),
      ...zones.map((zone) => normalizeMapLayerName(zone.layer)),
      ...routes.map((route) => normalizeMapLayerName(route.layer)),
    ]),
  ).sort((firstLayer, secondLayer) => {
    if (firstLayer === DEFAULT_MAP_LAYER) {
      return -1;
    }

    if (secondLayer === DEFAULT_MAP_LAYER) {
      return 1;
    }

    return firstLayer.localeCompare(secondLayer, "ru");
  });
}

function createMarkerDraftFromMarker(marker: MapMarkerDto): MarkerFormDraft {
  return {
    brightness: String(marker.brightness),
    colorKey: marker.colorKey,
    contrast: String(marker.contrast),
    description: marker.description ?? "",
    id: marker.id,
    layer: marker.layer,
    patternKey: marker.patternKey,
    size: String(marker.size ?? 100),
    status: marker.status === "archived" ? "inactive" : marker.status,
    title: marker.title,
    type: normalizeMapMarkerType(marker.type),
    x: String(marker.x),
    y: String(marker.y),
  };
}

function createMarkerDraftAtPoint(x: number, y: number): MarkerFormDraft {
  return { ...emptyMarkerDraft, x: String(x), y: String(y) };
}

function createZoneDraftFromZone(zone: MapZoneDto): ZoneFormDraft {
  return {
    brightness: String(zone.brightness),
    centerX: String(zone.centerX),
    centerY: String(zone.centerY),
    colorKey: zone.colorKey,
    contrast: String(zone.contrast),
    description: zone.description ?? "",
    id: zone.id,
    layer: zone.layer,
    points: sortedPoints(zone.points).map((point) => ({ x: point.x, y: point.y })),
    patternKey: zone.patternKey,
    radius: String(zone.radius),
    shape: zone.shape,
    status: zone.status,
    title: zone.title,
    type: zone.type,
  };
}

function createCircleZoneDraftAtPoint(x: number, y: number): ZoneFormDraft {
  return { ...emptyZoneDraft, centerX: String(x), centerY: String(y), shape: "circle" };
}

function createPolygonZoneDraftFromPoints(points: MapPoint[], baseZone?: MapZoneDto): ZoneFormDraft {
  const bounds = getMapPointsBounds(points);
  const center = bounds ? getBoundsCenter(bounds) : { x: 0, y: 0 };

  return {
    centerX: String(center.x),
    centerY: String(center.y),
    brightness: String(baseZone?.brightness ?? 100),
    colorKey: baseZone?.colorKey ?? DEFAULT_MAP_ZONE_COLOR_KEY,
    contrast: String(baseZone?.contrast ?? 100),
    description: baseZone?.description ?? "",
    id: baseZone?.id,
    layer: baseZone?.layer ?? DEFAULT_MAP_LAYER,
    points,
    patternKey: baseZone?.patternKey ?? "solid",
    radius: "0",
    shape: "polygon",
    status: baseZone?.status ?? DEFAULT_MAP_ZONE_STATUS,
    title: baseZone?.title ?? "",
    type: baseZone?.type ?? DEFAULT_MAP_ZONE_TYPE,
  };
}

function createRouteDraftFromRoute(route: MapRouteDto): RouteFormDraft {
  return {
    brightness: String(route.brightness),
    colorKey: route.colorKey,
    contrast: String(route.contrast),
    description: route.description ?? "",
    id: route.id,
    layer: route.layer,
    linePattern: route.linePattern,
    points: sortedPoints(route.points).map((point) => ({ x: point.x, y: point.y })),
    status: route.status,
    title: route.title,
    type: route.type,
  };
}

function createRouteDraftFromPoints(points: MapPoint[], baseRoute?: MapRouteDto): RouteFormDraft {
  return {
    ...emptyRouteDraft,
    brightness: String(baseRoute?.brightness ?? 100),
    colorKey: baseRoute?.colorKey ?? DEFAULT_MAP_ROUTE_COLOR_KEY,
    contrast: String(baseRoute?.contrast ?? 100),
    description: baseRoute?.description ?? "",
    id: baseRoute?.id,
    layer: baseRoute?.layer ?? DEFAULT_MAP_LAYER,
    linePattern: baseRoute?.linePattern ?? DEFAULT_MAP_ROUTE_LINE_PATTERN,
    points,
    status: baseRoute?.status ?? DEFAULT_MAP_ROUTE_STATUS,
    title: baseRoute?.title ?? "",
    type: baseRoute?.type ?? DEFAULT_MAP_ROUTE_TYPE,
  };
}

function normalizeMarkerDraft(draft: MarkerFormDraft) {
  return {
    brightness: normalizeStyleDraftValue(draft.brightness),
    colorKey: draft.colorKey,
    contrast: normalizeStyleDraftValue(draft.contrast),
    description: draft.description.trim(),
    layer: normalizeMapLayerName(draft.layer),
    patternKey: draft.patternKey,
    size: Number(draft.size),
    status: draft.status,
    title: draft.title.trim(),
    type: draft.type,
    x: Number(draft.x),
    y: Number(draft.y),
  };
}

function normalizeZoneDraft(draft: ZoneFormDraft) {
  return {
    brightness: normalizeStyleDraftValue(draft.brightness),
    centerX: Number(draft.centerX),
    centerY: Number(draft.centerY),
    colorKey: draft.colorKey,
    contrast: normalizeStyleDraftValue(draft.contrast),
    description: draft.description.trim(),
    layer: normalizeMapLayerName(draft.layer),
    patternKey: draft.patternKey,
    points: draft.points,
    radius: Number(draft.radius),
    shape: draft.shape,
    status: draft.status,
    title: draft.title.trim(),
    type: draft.type,
  };
}

function normalizeRouteDraft(draft: RouteFormDraft) {
  return {
    brightness: normalizeStyleDraftValue(draft.brightness),
    colorKey: draft.colorKey,
    contrast: normalizeStyleDraftValue(draft.contrast),
    description: draft.description.trim(),
    layer: normalizeMapLayerName(draft.layer),
    linePattern: draft.linePattern,
    points: draft.points,
    status: draft.status,
    title: draft.title.trim(),
    type: draft.type,
  };
}

function getRouteBounds(route: MapRouteDto) {
  return getMapPointsBounds(route.points);
}

function getZoneBounds(zone: MapZoneDto) {
  if (zone.shape === "polygon") {
    return getMapPointsBounds(zone.points);
  }

  return {
    maxX: zone.centerX + zone.radius,
    maxY: zone.centerY + zone.radius,
    minX: zone.centerX - zone.radius,
    minY: zone.centerY - zone.radius,
  };
}

export default function MapPage() {
  const initialMarkerDraftRef = useRef<MarkerFormDraft | null>(null);
  const initialZoneDraftRef = useRef<ZoneFormDraft | null>(null);
  const initialRouteDraftRef = useRef<RouteFormDraft | null>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>("markers");
  const [markers, setMarkers] = useState<MapMarkerDto[]>([]);
  const [zones, setZones] = useState<MapZoneDto[]>([]);
  const [routes, setRoutes] = useState<MapRouteDto[]>([]);
  const [mapLayers, setMapLayers] = useState<MapLayerDto[]>([]);
  const [visibleLayerState, setVisibleLayerState] = useState<Record<string, boolean>>({});
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState<string | null>(null);
  const [drawingMode, setDrawingMode] = useState<DrawingMode>(null);
  const [drawingPoints, setDrawingPoints] = useState<MapPoint[]>([]);
  const [drawingMessage, setDrawingMessage] = useState("");
  const [zoneSearch, setZoneSearch] = useState("");
  const [routeSearch, setRouteSearch] = useState("");
  const [newLayerName, setNewLayerName] = useState("");
  const [editingLayerId, setEditingLayerId] = useState<string | null>(null);
  const [editingLayerName, setEditingLayerName] = useState("");
  const [layerMessage, setLayerMessage] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [isLoadingObjects, setIsLoadingObjects] = useState(true);
  const [objectError, setObjectError] = useState("");
  const [markerDraft, setMarkerDraft] = useState<MarkerFormDraft | null>(null);
  const [zoneDraft, setZoneDraft] = useState<ZoneFormDraft | null>(null);
  const [routeDraft, setRouteDraft] = useState<RouteFormDraft | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadMapObjects() {
      setIsLoadingObjects(true);
      setObjectError("");

      try {
        const [nextMarkers, nextZones, nextRoutes, nextLayers] = await Promise.all([
          fetchMapMarkers(),
          fetchMapZones(),
          fetchMapRoutes(),
          fetchMapLayers(),
        ]);

        if (!isCancelled) {
          setMarkers(nextMarkers);
          setZones(nextZones);
          setRoutes(nextRoutes);
          setMapLayers(nextLayers);
        }
      } catch {
        if (!isCancelled) {
          setObjectError("Не удалось загрузить объекты карты.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingObjects(false);
        }
      }
    }

    void loadMapObjects();

    return () => {
      isCancelled = true;
    };
  }, []);

  const layers = useMemo(() => {
    return getLayerOptions(mapLayers, markers, zones, routes);
  }, [mapLayers, markers, routes, zones]);

  const visibleLayers = useMemo(() => layers.filter((layer) => visibleLayerState[layer] !== false), [layers, visibleLayerState]);

  const visibleMarkers = useMemo(() => {
    const layerSet = new Set(visibleLayers);
    return markers.filter((marker) => layerSet.has(marker.layer));
  }, [markers, visibleLayers]);

  const visibleZones = useMemo(() => {
    const layerSet = new Set(visibleLayers);
    return zones.filter((zone) => layerSet.has(zone.layer));
  }, [visibleLayers, zones]);

  const visibleRoutes = useMemo(() => {
    const layerSet = new Set(visibleLayers);
    return routes.filter((route) => layerSet.has(route.layer));
  }, [routes, visibleLayers]);

  const filteredZones = useMemo(() => {
    const query = normalizeSearch(zoneSearch);

    if (!query) {
      return zones;
    }

    return zones.filter((zone) =>
      [
        zone.title,
        zone.description ?? "",
        getMapZoneShapeLabel(zone.shape),
        getZoneColorPreset(zone.colorKey).label,
        getFillPatternPreset(zone.patternKey).label,
        zone.layer,
      ]
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(query),
    );
  }, [zoneSearch, zones]);

  const filteredRoutes = useMemo(() => {
    const query = normalizeSearch(routeSearch);

    if (!query) {
      return routes;
    }

    return routes.filter((route) =>
      [
        route.title,
        route.description ?? "",
        getRouteColorPreset(route.colorKey).label,
        getLinePatternPreset(route.linePattern).label,
        route.layer,
      ]
        .join(" ")
        .toLocaleLowerCase("ru")
        .includes(query),
    );
  }, [routeSearch, routes]);

  const draftZonePreview = useMemo(() => {
    if (zoneDraft) {
      if (zoneDraft.shape === "polygon") {
        return {
          brightness: normalizeStyleDraftValue(zoneDraft.brightness),
          colorKey: zoneDraft.colorKey,
          contrast: normalizeStyleDraftValue(zoneDraft.contrast),
          patternKey: zoneDraft.patternKey,
          points: zoneDraft.points,
          shape: "polygon" as const,
          type: zoneDraft.type,
        };
      }

      return {
        brightness: normalizeStyleDraftValue(zoneDraft.brightness),
        centerX: Number(zoneDraft.centerX),
        centerY: Number(zoneDraft.centerY),
        colorKey: zoneDraft.colorKey,
        contrast: normalizeStyleDraftValue(zoneDraft.contrast),
        patternKey: zoneDraft.patternKey,
        radius: Math.max(1, Number(zoneDraft.radius) || 1),
        shape: "circle" as const,
        type: zoneDraft.type,
      };
    }

    if (drawingMode === "zone-polygon" && drawingPoints.length > 0) {
      return {
        brightness: 100,
        colorKey: DEFAULT_MAP_ZONE_COLOR_KEY,
        contrast: 100,
        patternKey: "solid" as const,
        points: drawingPoints,
        shape: "polygon" as const,
        type: DEFAULT_MAP_ZONE_TYPE,
      };
    }

    return null;
  }, [drawingMode, drawingPoints, zoneDraft]);

  function clearSelection() {
    setSelectedMarkerId(null);
    setSelectedZoneId(null);
    setSelectedRouteId(null);
  }

  function setFocus(nextTarget: FocusCommand) {
    setFocusTarget((currentTarget) => ({ ...nextTarget, nonce: (currentTarget?.nonce ?? 0) + 1 }) as FocusTarget);
  }

  function stopDrawing() {
    setDrawingMode(null);
    setDrawingPoints([]);
    setDrawingMessage("");
  }

  function startDrawing(nextMode: DrawingMode, panel: ActivePanel) {
    clearSelection();
    setActivePanel(panel);
    setDrawingMode(nextMode);
    setDrawingMessage("");
    setDrawingPoints([]);
  }

  function updateMarkerDraft<K extends keyof MarkerFormDraft>(field: K, value: MarkerFormDraft[K]) {
    setMarkerDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  }

  function setMarkerSizePreset(size: number) {
    updateMarkerDraft("size", String(size));
  }

  function updateZoneDraft<K extends keyof ZoneFormDraft>(field: K, value: ZoneFormDraft[K]) {
    setZoneDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  }

  function updateRouteDraft<K extends keyof RouteFormDraft>(field: K, value: RouteFormDraft[K]) {
    setRouteDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  }

  function updateZoneRadius(delta: number) {
    setZoneDraft((currentDraft) => {
      if (!currentDraft) {
        return currentDraft;
      }

      const currentRadius = Number(currentDraft.radius) || 1;
      return { ...currentDraft, radius: String(Math.min(5000, Math.max(1, currentRadius + delta))) };
    });
  }

  function setZoneRadiusPreset(radius: number) {
    setZoneDraft((currentDraft) => (currentDraft ? { ...currentDraft, radius: String(Math.min(5000, Math.max(1, radius))) } : currentDraft));
  }

  function openMarkerCreateForm(x: number, y: number) {
    const nextDraft = createMarkerDraftAtPoint(x, y);
    initialMarkerDraftRef.current = nextDraft;
    setMarkerDraft(nextDraft);
    setFormMessage("");
  }

  function openMarkerEditForm(marker: MapMarkerDto) {
    const nextDraft = createMarkerDraftFromMarker(marker);
    initialMarkerDraftRef.current = nextDraft;
    setMarkerDraft(nextDraft);
    setFormMessage("");
  }

  function openCircleZoneCreateForm(x: number, y: number) {
    const nextDraft = createCircleZoneDraftAtPoint(x, y);
    initialZoneDraftRef.current = nextDraft;
    setZoneDraft(nextDraft);
    setFormMessage("");
  }

  function openZoneEditForm(zone: MapZoneDto) {
    const nextDraft = createZoneDraftFromZone(zone);
    initialZoneDraftRef.current = nextDraft;
    setZoneDraft(nextDraft);
    setFormMessage("");
  }

  function openPolygonZoneForm(points: MapPoint[], baseZone?: MapZoneDto) {
    const nextDraft = createPolygonZoneDraftFromPoints(points, baseZone);
    initialZoneDraftRef.current = nextDraft;
    setZoneDraft(nextDraft);
    setFormMessage("");
  }

  function openRouteCreateForm(points: MapPoint[], baseRoute?: MapRouteDto) {
    const nextDraft = createRouteDraftFromPoints(points, baseRoute);
    initialRouteDraftRef.current = nextDraft;
    setRouteDraft(nextDraft);
    setFormMessage("");
  }

  function openRouteEditForm(route: MapRouteDto) {
    const nextDraft = createRouteDraftFromRoute(route);
    initialRouteDraftRef.current = nextDraft;
    setRouteDraft(nextDraft);
    setFormMessage("");
  }

  function closeForms() {
    setMarkerDraft(null);
    setZoneDraft(null);
    setRouteDraft(null);
    setFormMessage("");
    initialMarkerDraftRef.current = null;
    initialZoneDraftRef.current = null;
    initialRouteDraftRef.current = null;
  }

  function requestCloseForms() {
    const currentDraft = markerDraft ?? zoneDraft ?? routeDraft;
    const initialDraft = markerDraft ? initialMarkerDraftRef.current : zoneDraft ? initialZoneDraftRef.current : initialRouteDraftRef.current;

    if (!currentDraft) {
      return;
    }

    const isDirty = JSON.stringify(currentDraft) !== JSON.stringify(initialDraft);

    if (!isDirty) {
      closeForms();
      return;
    }

    setConfirmDialog({
      cancelLabel: "Остаться",
      confirmLabel: "Закрыть",
      message: "Вы уверены, что хотите закрыть окно?",
      onConfirm: () => {
        closeForms();
        setConfirmDialog(null);
      },
      title: "Закрыть окно?",
      variant: "warning",
    });
  }

  function handleMapClick(x: number, y: number) {
    if (drawingMode === "marker") {
      setDrawingMode(null);
      openMarkerCreateForm(x, y);
      return;
    }

    if (drawingMode === "zone") {
      setDrawingMode(null);
      openCircleZoneCreateForm(x, y);
      return;
    }

    if (!drawingMode) {
      clearSelection();
    }
  }

  function handleDrawingPointAdd(x: number, y: number) {
    if (drawingMode !== "route" && drawingMode !== "zone-polygon") {
      return;
    }

    setDrawingMessage("");
    setDrawingPoints((currentPoints) => [...currentPoints, { x, y }]);
  }

  function finishRouteDrawing() {
    if (drawingPoints.length < 2) {
      setDrawingMessage("Маршрут должен содержать минимум две точки.");
      return;
    }

    setDrawingMode(null);
    openRouteCreateForm(drawingPoints);
  }

  function finishPolygonDrawing() {
    if (drawingPoints.length < 3) {
      setDrawingMessage("Полигон должен содержать минимум три точки.");
      return;
    }

    setDrawingMode(null);
    openPolygonZoneForm(drawingPoints);
  }

  async function handleMarkerSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!markerDraft) {
      return;
    }

    const payload = normalizeMarkerDraft(markerDraft);

    if (!payload.title) {
      setFormMessage("Укажите название метки.");
      return;
    }

    setIsSaving(true);
    setFormMessage("");

    try {
      if (markerDraft.id) {
        const updatedMarker = await updateMapMarker(markerDraft.id, payload);
        setMarkers((currentMarkers) => currentMarkers.map((marker) => (marker.id === updatedMarker.id ? updatedMarker : marker)));
        setSelectedMarkerId(updatedMarker.id);
      } else {
        const createdMarker = await createMapMarker(payload);
        setMarkers((currentMarkers) => [...currentMarkers, createdMarker]);
        setSelectedMarkerId(createdMarker.id);
      }

      setSelectedZoneId(null);
      setSelectedRouteId(null);
      closeForms();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось сохранить метку.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleZoneSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!zoneDraft) {
      return;
    }

    const payload = normalizeZoneDraft(zoneDraft);

    if (!payload.title) {
      setFormMessage("Укажите название зоны.");
      return;
    }

    setIsSaving(true);
    setFormMessage("");

    try {
      if (zoneDraft.id) {
        const updatedZone = await updateMapZone(zoneDraft.id, payload);
        setZones((currentZones) => currentZones.map((zone) => (zone.id === updatedZone.id ? updatedZone : zone)));
        setSelectedZoneId(updatedZone.id);
      } else {
        const createdZone = await createMapZone(payload);
        setZones((currentZones) => [...currentZones, createdZone]);
        setSelectedZoneId(createdZone.id);
      }

      setDrawingPoints([]);
      setSelectedMarkerId(null);
      setSelectedRouteId(null);
      closeForms();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось сохранить зону.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleRouteSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!routeDraft) {
      return;
    }

    const payload = normalizeRouteDraft(routeDraft);

    if (!payload.title) {
      setFormMessage("Укажите название маршрута.");
      return;
    }

    if (payload.points.length < 2) {
      setFormMessage("Для сохранения маршрута укажите не менее двух точек.");
      return;
    }

    setIsSaving(true);
    setFormMessage("");

    try {
      if (routeDraft.id) {
        const updatedRoute = await updateMapRoute(routeDraft.id, payload);
        setRoutes((currentRoutes) => currentRoutes.map((route) => (route.id === updatedRoute.id ? updatedRoute : route)));
        setSelectedRouteId(updatedRoute.id);
      } else {
        const createdRoute = await createMapRoute(payload);
        setRoutes((currentRoutes) => [...currentRoutes, createdRoute]);
        setSelectedRouteId(createdRoute.id);
      }

      setDrawingPoints([]);
      setSelectedMarkerId(null);
      setSelectedZoneId(null);
      closeForms();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось сохранить маршрут.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestDeleteMarker(marker: MapMarkerDto) {
    setConfirmDialog({
      cancelLabel: "Отмена",
      confirmLabel: "Удалить",
      message: "Удалить метку окончательно?",
      onConfirm: async () => {
        setConfirmDialog((currentDialog) => (currentDialog ? { ...currentDialog, loading: true } : currentDialog));

        try {
          const deletedMarker = await deleteMapMarker(marker.id);
          setMarkers((currentMarkers) => currentMarkers.filter((currentMarker) => currentMarker.id !== deletedMarker.id));
          setSelectedMarkerId((currentId) => (currentId === deletedMarker.id ? null : currentId));
          setConfirmDialog(null);
        } catch {
          setConfirmDialog(null);
          setObjectError("Не удалось удалить метку.");
        }
      },
      title: "Удаление метки",
      variant: "danger",
    });
  }

  function requestDeleteZone(zone: MapZoneDto) {
    setConfirmDialog({
      cancelLabel: "Отмена",
      confirmLabel: "Удалить",
      message: "Удалить зону окончательно?",
      onConfirm: async () => {
        setConfirmDialog((currentDialog) => (currentDialog ? { ...currentDialog, loading: true } : currentDialog));

        try {
          await deleteMapZone(zone.id);
          setZones((currentZones) => currentZones.filter((currentZone) => currentZone.id !== zone.id));
          setSelectedZoneId((currentId) => (currentId === zone.id ? null : currentId));
          setConfirmDialog(null);
        } catch {
          setConfirmDialog(null);
          setObjectError("Не удалось удалить зону.");
        }
      },
      title: "Удаление зоны",
      variant: "danger",
    });
  }

  function requestDeleteRoute(route: MapRouteDto) {
    setConfirmDialog({
      cancelLabel: "Отмена",
      confirmLabel: "Удалить",
      message: "Удалить маршрут окончательно?",
      onConfirm: async () => {
        setConfirmDialog((currentDialog) => (currentDialog ? { ...currentDialog, loading: true } : currentDialog));

        try {
          await deleteMapRoute(route.id);
          setRoutes((currentRoutes) => currentRoutes.filter((currentRoute) => currentRoute.id !== route.id));
          setSelectedRouteId((currentId) => (currentId === route.id ? null : currentId));
          setConfirmDialog(null);
        } catch {
          setConfirmDialog(null);
          setObjectError("Не удалось удалить маршрут.");
        }
      },
      title: "Удаление маршрута",
      variant: "danger",
    });
  }

  function toggleLayer(layer: string) {
    const willHideLayer = visibleLayerState[layer] !== false;

    setVisibleLayerState((currentState) => ({
      ...currentState,
      [layer]: currentState[layer] === false,
    }));

    if (willHideLayer) {
      const selectedMarker = markers.find((marker) => marker.id === selectedMarkerId);
      const selectedZone = zones.find((zone) => zone.id === selectedZoneId);
      const selectedRoute = routes.find((route) => route.id === selectedRouteId);

      if (selectedMarker?.layer === layer || selectedZone?.layer === layer || selectedRoute?.layer === layer) {
        clearSelection();
      }
    }
  }

  async function handleCreateLayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newLayerName.trim()) {
      setLayerMessage("Укажите название слоя.");
      return;
    }

    const nextName = normalizeMapLayerName(newLayerName);

    setLayerMessage("");
    setIsSaving(true);

    try {
      const createdLayer = await createMapLayer(nextName);
      setMapLayers((currentLayers) => [...currentLayers.filter((layer) => layer.id !== createdLayer.id), createdLayer]);
      setVisibleLayerState((currentState) => ({ ...currentState, [createdLayer.name]: true }));
      setNewLayerName("");
    } catch (error) {
      setLayerMessage(error instanceof Error ? error.message : "Не удалось сохранить слой.");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleSaveLayerRename(layer: MapLayerDto) {
    if (!editingLayerName.trim()) {
      setLayerMessage("Укажите название слоя.");
      return;
    }

    const nextName = normalizeMapLayerName(editingLayerName);

    setLayerMessage("");
    setIsSaving(true);

    try {
      const previousName = layer.name;
      const updatedLayer = await updateMapLayer(layer.id, nextName);

      setMapLayers((currentLayers) => currentLayers.map((currentLayer) => (currentLayer.id === updatedLayer.id ? updatedLayer : currentLayer)));
      setMarkers((currentMarkers) => currentMarkers.map((marker) => (marker.layer === previousName ? { ...marker, layer: updatedLayer.name } : marker)));
      setZones((currentZones) => currentZones.map((zone) => (zone.layer === previousName ? { ...zone, layer: updatedLayer.name } : zone)));
      setRoutes((currentRoutes) => currentRoutes.map((route) => (route.layer === previousName ? { ...route, layer: updatedLayer.name } : route)));
      setMarkerDraft((currentDraft) => (currentDraft?.layer === previousName ? { ...currentDraft, layer: updatedLayer.name } : currentDraft));
      setZoneDraft((currentDraft) => (currentDraft?.layer === previousName ? { ...currentDraft, layer: updatedLayer.name } : currentDraft));
      setRouteDraft((currentDraft) => (currentDraft?.layer === previousName ? { ...currentDraft, layer: updatedLayer.name } : currentDraft));
      setVisibleLayerState((currentState) => {
        const nextState = { ...currentState, [updatedLayer.name]: currentState[previousName] };
        delete nextState[previousName];
        return nextState;
      });
      setEditingLayerId(null);
      setEditingLayerName("");
    } catch (error) {
      setLayerMessage(error instanceof Error ? error.message : "Не удалось сохранить слой.");
    } finally {
      setIsSaving(false);
    }
  }

  function requestDeleteLayer(layer: MapLayerDto) {
    setConfirmDialog({
      cancelLabel: "Отмена",
      confirmLabel: "Удалить",
      message: "Удалить слой?",
      onConfirm: async () => {
        setConfirmDialog(null);
        setLayerMessage("");
        setIsSaving(true);

        try {
          await deleteMapLayer(layer.id);
          setMapLayers((currentLayers) => currentLayers.filter((currentLayer) => currentLayer.id !== layer.id));
          setVisibleLayerState((currentState) => {
            const nextState = { ...currentState };
            delete nextState[layer.name];
            return nextState;
          });
          setMarkerDraft((currentDraft) => (currentDraft?.layer === layer.name ? { ...currentDraft, layer: DEFAULT_MAP_LAYER } : currentDraft));
          setZoneDraft((currentDraft) => (currentDraft?.layer === layer.name ? { ...currentDraft, layer: DEFAULT_MAP_LAYER } : currentDraft));
          setRouteDraft((currentDraft) => (currentDraft?.layer === layer.name ? { ...currentDraft, layer: DEFAULT_MAP_LAYER } : currentDraft));
        } catch (error) {
          setLayerMessage(error instanceof Error ? error.message : "Не удалось удалить слой.");
        } finally {
          setIsSaving(false);
        }
      },
      title: "Удалить слой?",
      variant: "danger",
    });
  }

  function selectMarker(marker: MapMarkerDto) {
    setSelectedMarkerId(marker.id);
    setSelectedZoneId(null);
    setSelectedRouteId(null);
    stopDrawing();
    setFocus({ type: "point", x: marker.x, y: marker.y });
  }

  function selectZone(zone: MapZoneDto) {
    setSelectedMarkerId(null);
    setSelectedZoneId(zone.id);
    setSelectedRouteId(null);
    stopDrawing();

    const bounds = getZoneBounds(zone);
    setFocus(bounds ? { bounds, type: "bounds" } : { type: "point", x: zone.centerX, y: zone.centerY });
  }

  function selectRoute(route: MapRouteDto) {
    setSelectedMarkerId(null);
    setSelectedZoneId(null);
    setSelectedRouteId(route.id);
    stopDrawing();

    const bounds = getRouteBounds(route);
    if (bounds) {
      setFocus({ bounds, type: "bounds" });
    }
  }

  return (
    <main className="pda-page map-page-shell">
      <section className="pda-screen map-page-screen">
        <PdaTopbar activeLabel="Карта" />

        <div className="pda-content map-page-content">
          <div className="map-page-layout">
            <div className="map-work-area">
              <TileMapViewer
                draftRouteColorKey={DEFAULT_MAP_ROUTE_COLOR_KEY}
                draftRouteLinePattern={DEFAULT_MAP_ROUTE_LINE_PATTERN}
                draftRoutePoints={drawingMode === "route" ? drawingPoints : []}
                draftZonePreview={draftZonePreview}
                drawingMode={drawingMode}
                focusTarget={focusTarget}
                isPickingPoint={drawingMode !== null}
                markers={visibleMarkers}
                onMapClick={handleMapClick}
                onMarkerClear={clearSelection}
                onMarkerDelete={requestDeleteMarker}
                onMarkerEdit={openMarkerEditForm}
                onMarkerSelect={selectMarker}
                onRouteDelete={requestDeleteRoute}
                onRouteEdit={openRouteEditForm}
                onRoutePointAdd={handleDrawingPointAdd}
                onRouteSelect={selectRoute}
                onSelectionClear={clearSelection}
                onZoneDelete={requestDeleteZone}
                onZoneEdit={openZoneEditForm}
                onZoneSelect={selectZone}
                routes={visibleRoutes}
                selectedMarkerId={selectedMarkerId ?? undefined}
                selectedRouteId={selectedRouteId ?? undefined}
                selectedZoneId={selectedZoneId ?? undefined}
                visibleLayers={visibleLayers}
                zones={visibleZones}
              />
              <aside className="map-side-panel">
                <div className="map-side-panel-head">
                  <h1>Объекты карты</h1>
                  <div className="map-panel-tabs map-panel-tabs-primary" role="tablist" aria-label="Разделы объектов карты">
                    <button className={activePanel === "markers" ? "map-panel-tab-active" : ""} onClick={() => setActivePanel("markers")} type="button">
                      Метки
                    </button>
                    <button className={activePanel === "zones" ? "map-panel-tab-active" : ""} onClick={() => setActivePanel("zones")} type="button">
                      Зоны
                    </button>
                    <button className={activePanel === "routes" ? "map-panel-tab-active" : ""} onClick={() => setActivePanel("routes")} type="button">
                      Маршруты
                    </button>
                  </div>
                  <div className="map-panel-tabs map-panel-tabs-layers" role="tablist" aria-label="Управление слоями">
                    <button className={activePanel === "layers" ? "map-panel-tab-active" : ""} onClick={() => setActivePanel("layers")} type="button">
                      Слои
                    </button>
                  </div>
                </div>

                {isLoadingObjects ? <p className="map-panel-message">Загрузка объектов карты...</p> : null}
                {!isLoadingObjects && objectError ? <p className="map-panel-message map-panel-message-danger">{objectError}</p> : null}

                {activePanel === "markers" ? (
                  <section className="map-panel-section map-panel-section-last">
                    <button className={`primary-command interactive-button ${drawingMode === "marker" ? "map-command-active" : ""}`} onClick={() => startDrawing("marker", "markers")} type="button">
                      Добавить метку
                    </button>
                    {drawingMode === "marker" ? (
                      <div className="map-panel-inline-state">
                        <p className="map-panel-message map-panel-message-strong">Выберите точку на карте.</p>
                        <button className="command-row interactive-button" onClick={stopDrawing} type="button">
                          Отмена
                        </button>
                      </div>
                    ) : null}
                    {markers.length > 0 ? (
                      <div className="map-object-list">
                        {markers.map((marker) => (
                          <button className={selectedMarkerId === marker.id ? "map-object-row map-object-row-active" : "map-object-row"} key={marker.id} onClick={() => selectMarker(marker)} type="button">
                            <span>{marker.title}</span>
                            <small>{marker.layer}</small>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="map-panel-message">Метки пока не добавлены.</p>
                    )}
                  </section>
                ) : null}

                {activePanel === "zones" ? (
                  <section className="map-panel-section map-panel-section-last">
                    <div className="map-panel-action-grid">
                      <button className={`primary-command interactive-button ${drawingMode === "zone" ? "map-command-active" : ""}`} onClick={() => startDrawing("zone", "zones")} type="button">
                        Добавить круг
                      </button>
                      <button className={`primary-command interactive-button ${drawingMode === "zone-polygon" ? "map-command-active" : ""}`} onClick={() => startDrawing("zone-polygon", "zones")} type="button">
                        Добавить полигон
                      </button>
                    </div>
                    {drawingMode === "zone" ? (
                      <div className="map-panel-inline-state">
                        <p className="map-panel-message map-panel-message-strong">Выберите центр зоны на карте.</p>
                        <button className="command-row interactive-button" onClick={stopDrawing} type="button">
                          Отмена
                        </button>
                      </div>
                    ) : null}
                    {drawingMode === "zone-polygon" ? (
                      <div className="map-panel-inline-state">
                        <p className="map-panel-message map-panel-message-strong">Укажите точки полигона на карте.</p>
                        <p className="map-panel-message">Точек: {drawingPoints.length}</p>
                        {drawingMessage ? <p className="map-panel-message map-panel-message-danger">{drawingMessage}</p> : null}
                        <div className="map-route-drawing-actions">
                          <button className="primary-command interactive-button" onClick={finishPolygonDrawing} type="button">
                            Завершить
                          </button>
                          <button className="command-row interactive-button" disabled={drawingPoints.length === 0} onClick={() => setDrawingPoints((currentPoints) => currentPoints.slice(0, -1))} type="button">
                            Убрать последнюю
                          </button>
                          <button className="command-row interactive-button" disabled={drawingPoints.length === 0} onClick={() => setDrawingPoints([])} type="button">
                            Сбросить
                          </button>
                          <button className="command-row interactive-button" onClick={stopDrawing} type="button">
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <input className="map-search-input" onChange={(event) => setZoneSearch(event.target.value)} placeholder="Поиск зон" type="search" value={zoneSearch} />
                    {zones.length > 0 ? (
                      <div className="map-object-list">
                        {filteredZones.map((zone) => (
                          <button className={selectedZoneId === zone.id ? "map-object-row map-object-row-active" : "map-object-row"} key={zone.id} onClick={() => selectZone(zone)} type="button">
                            <span>{zone.title}</span>
                            <small>
                              {getMapZoneShapeLabel(zone.shape)} · {zone.layer}
                            </small>
                            <small>{getZoneColorPreset(zone.colorKey).label}</small>
                            <small>
                              {zone.shape === "polygon" ? `Точек: ${zone.points.length}` : `Радиус: ${zone.radius}`}
                            </small>
                          </button>
                        ))}
                        {filteredZones.length === 0 ? <p className="map-panel-message">Зоны не найдены.</p> : null}
                      </div>
                    ) : (
                      <p className="map-panel-message">Зоны пока не добавлены.</p>
                    )}
                  </section>
                ) : null}

                {activePanel === "routes" ? (
                  <section className="map-panel-section map-panel-section-last">
                    <button className={`primary-command interactive-button ${drawingMode === "route" ? "map-command-active" : ""}`} onClick={() => startDrawing("route", "routes")} type="button">
                      Добавить маршрут
                    </button>
                    {drawingMode === "route" ? (
                      <div className="map-panel-inline-state">
                        <p className="map-panel-message map-panel-message-strong">Укажите точки маршрута на карте.</p>
                        <p className="map-panel-message">Точек: {drawingPoints.length}</p>
                        {drawingMessage ? <p className="map-panel-message map-panel-message-danger">{drawingMessage}</p> : null}
                        <div className="map-route-drawing-actions">
                          <button className="primary-command interactive-button" onClick={finishRouteDrawing} type="button">
                            Завершить
                          </button>
                          <button className="command-row interactive-button" disabled={drawingPoints.length === 0} onClick={() => setDrawingPoints((currentPoints) => currentPoints.slice(0, -1))} type="button">
                            Убрать последнюю
                          </button>
                          <button className="command-row interactive-button" disabled={drawingPoints.length === 0} onClick={() => setDrawingPoints([])} type="button">
                            Сбросить
                          </button>
                          <button className="command-row interactive-button" onClick={stopDrawing} type="button">
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : null}
                    <input className="map-search-input" onChange={(event) => setRouteSearch(event.target.value)} placeholder="Поиск маршрутов" type="search" value={routeSearch} />
                    {routes.length > 0 ? (
                      <div className="map-object-list">
                        {filteredRoutes.map((route) => (
                          <button className={selectedRouteId === route.id ? "map-object-row map-object-row-active" : "map-object-row"} key={route.id} onClick={() => selectRoute(route)} type="button">
                            <span>{route.title}</span>
                            <small>
                              {getRouteColorPreset(route.colorKey).label} · {getLinePatternPreset(route.linePattern).label}
                            </small>
                            <small>{route.layer}</small>
                            <small>Точек: {route.points.length}</small>
                          </button>
                        ))}
                        {filteredRoutes.length === 0 ? <p className="map-panel-message">Маршруты не найдены.</p> : null}
                      </div>
                    ) : (
                      <p className="map-panel-message">Маршруты пока не добавлены.</p>
                    )}
                  </section>
                ) : null}

                {activePanel === "layers" ? (
                  <section className="map-panel-section map-panel-section-last">
                    <h2>Слои</h2>
                    <form className="map-layer-create-form" onSubmit={handleCreateLayer}>
                      <input disabled={isSaving} maxLength={80} onChange={(event) => setNewLayerName(event.target.value)} placeholder="Новый слой" type="text" value={newLayerName} />
                      <button className="primary-command interactive-button" disabled={isSaving} type="submit">
                        Создать
                      </button>
                    </form>
                    {layerMessage ? <p className="map-panel-message map-panel-message-danger">{layerMessage}</p> : null}
                    {layers.length > 0 ? (
                      <div className="map-layer-list">
                        {layers.map((layer) => {
                          const persistedLayer = mapLayers.find((mapLayer) => mapLayer.name === layer);
                          const isEditing = persistedLayer ? editingLayerId === persistedLayer.id : false;
                          const isDefaultLayer = Boolean(persistedLayer?.isDefault);

                          return (
                            <div className="map-layer-row" key={layer}>
                              <label className="map-layer-toggle">
                                <input checked={visibleLayers.includes(layer)} onChange={() => toggleLayer(layer)} type="checkbox" />
                                {isEditing ? (
                                  <input disabled={isSaving} maxLength={80} onChange={(event) => setEditingLayerName(event.target.value)} type="text" value={editingLayerName} />
                                ) : (
                                  <span className="map-layer-name" title={layer}>
                                    {layer}
                                  </span>
                                )}
                              </label>
                              {persistedLayer ? (
                                <div className="map-layer-actions">
                                  {isEditing ? (
                                    <>
                                      <button className="command-row interactive-button" disabled={isSaving} onClick={() => handleSaveLayerRename(persistedLayer)} type="button">
                                        Сохранить
                                      </button>
                                      <button
                                        className="command-row interactive-button"
                                        disabled={isSaving}
                                        onClick={() => {
                                          setEditingLayerId(null);
                                          setEditingLayerName("");
                                          setLayerMessage("");
                                        }}
                                        type="button"
                                      >
                                        Отмена
                                      </button>
                                    </>
                                  ) : (
                                    <>
                                      {!isDefaultLayer ? (
                                        <button
                                          aria-label="Редактировать слой"
                                          className="map-layer-action-button map-layer-action-button-edit interactive-button"
                                          disabled={isSaving}
                                          onClick={() => {
                                            setEditingLayerId(persistedLayer.id);
                                            setEditingLayerName(persistedLayer.name);
                                            setLayerMessage("");
                                          }}
                                          title="Редактировать слой"
                                          type="button"
                                        >
                                          <LayerEditIcon />
                                        </button>
                                      ) : null}
                                      <button
                                        aria-label={isDefaultLayer ? "Основной слой нельзя удалить" : "Удалить слой"}
                                        className="map-layer-action-button map-layer-action-button-delete interactive-button"
                                        disabled={isSaving || isDefaultLayer}
                                        onClick={() => {
                                          if (!isDefaultLayer) {
                                            requestDeleteLayer(persistedLayer);
                                          }
                                        }}
                                        title={isDefaultLayer ? "Основной слой нельзя удалить" : "Удалить слой"}
                                        type="button"
                                      >
                                        <LayerDeleteIcon />
                                      </button>
                                    </>
                                  )}
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <p className="map-panel-message">Объекты пока не добавлены.</p>
                    )}
                  </section>
                ) : null}
              </aside>
            </div>
          </div>
        </div>

        {markerDraft ? (
          <div className="pda-modal-backdrop animate-fade-in" onMouseDown={requestCloseForms}>
            <form className="pda-modal map-marker-modal animate-modal-in" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleMarkerSubmit}>
              <div className="map-form-header">
                <div className="min-w-0">
                  <span className="map-form-badge">{markerDraft.id ? "Изменение объекта" : "Создание объекта"}</span>
                  <h1>{markerDraft.id ? "Редактирование метки" : "Новая метка"}</h1>
                  <p>
                    X: {markerDraft.x} · Y: {markerDraft.y}
                  </p>
                </div>
              </div>
              <div className="map-object-form">
                <section className="map-form-section map-form-section-primary">
                  <div className="map-form-section-head">
                    <h2>Основные сведения</h2>
                  </div>
                  <div className="map-form-grid">
                    <label className="filter-field map-title-field map-form-wide">
                      <span>Название</span>
                      <input
                        disabled={isSaving}
                        maxLength={80}
                        onChange={(event) => updateMarkerDraft("title", event.target.value)}
                        placeholder="Введите название метки"
                        type="text"
                        value={markerDraft.title}
                      />
                    </label>
                    <label className="filter-field map-form-wide">
                      <span>Слой</span>
                      <select disabled={isSaving} onChange={(event) => updateMarkerDraft("layer", event.target.value)} value={markerDraft.layer}>
                        {layers.map((layer) => (
                          <option key={layer} value={layer}>
                            {layer}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Расположение</h2>
                  </div>
                  <div className="map-form-grid">
                    <label className="filter-field">
                      <span>Координаты X</span>
                      <input disabled={isSaving} min={0} onChange={(event) => updateMarkerDraft("x", event.target.value)} type="number" value={markerDraft.x} />
                    </label>
                    <label className="filter-field">
                      <span>Координаты Y</span>
                      <input disabled={isSaving} min={0} onChange={(event) => updateMarkerDraft("y", event.target.value)} type="number" value={markerDraft.y} />
                    </label>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Оформление</h2>
                  </div>
                  <div className="map-form-style-stack">
                    <div className="map-form-control-block">
                      <span className="map-form-control-title">Значок</span>
                      <div className="map-icon-choice-grid">
                        {orderedMarkerUiTypes.map((type) => (
                          <button
                            className={`map-icon-choice ${markerDraft.type === type ? "map-choice-active" : ""}`}
                            disabled={isSaving}
                            key={type}
                            onClick={() => updateMarkerDraft("type", type)}
                            type="button"
                          >
                            <span className={`map-icon-choice-preview map-marker--${getMapMarkerTypeClassName(type)}`}>
                              <MapMarkerIcon type={type} />
                            </span>
                            <span>{getMapMarkerTypeLabel(type)}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="map-form-control-block">
                      <span className="map-form-control-title">Цвет</span>
                      <div className="map-color-choice-grid">
                        {orderedMapColorKeys.map((colorKey) => {
                          const color = getZoneColorPreset(colorKey);
                          return (
                            <button
                              className={`map-color-choice ${markerDraft.colorKey === colorKey ? "map-choice-active" : ""}`}
                              disabled={isSaving}
                              key={colorKey}
                              onClick={() => updateMarkerDraft("colorKey", colorKey)}
                              type="button"
                            >
                              <span className="map-color-swatch" style={{ backgroundColor: color.marker, borderColor: color.stroke }} />
                              <span>{color.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="map-form-grid">
                      <label className="filter-field">
                        <span>Формат</span>
                        <select disabled={isSaving} onChange={(event) => updateMarkerDraft("patternKey", event.target.value as MapFillPatternKey)} value={markerDraft.patternKey}>
                          {fillPatternKeys.map((patternKey) => (
                            <option key={patternKey} value={patternKey}>
                              {getFillPatternPreset(patternKey).label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="filter-field">
                        <span>Размер</span>
                        <input disabled={isSaving} onChange={(event) => updateMarkerDraft("size", event.target.value)} step={5} type="number" value={markerDraft.size} />
                      </label>
                    </div>

                    <div className="map-marker-size-presets map-choice-row">
                      {orderedMarkerSizePresets.map(([key, preset]) => (
                        <button
                          className={`map-preset-button ${Number(markerDraft.size) === preset.size ? "map-choice-active" : ""}`}
                          disabled={isSaving}
                          key={key}
                          onClick={() => setMarkerSizePreset(preset.size)}
                          type="button"
                        >
                          {preset.label} — {preset.size}
                        </button>
                      ))}
                    </div>

                    <div className="map-form-grid">
                      <label className="filter-field map-style-number-field">
                        <span>Яркость</span>
                        <input disabled={isSaving} onChange={(event) => updateMarkerDraft("brightness", event.target.value)} step={5} type="number" value={markerDraft.brightness} />
                        <div className="map-choice-row">
                          {styleValuePresets.map((value) => (
                            <button className={`map-preset-button ${Number(markerDraft.brightness) === value ? "map-choice-active" : ""}`} disabled={isSaving} key={value} onClick={() => updateMarkerDraft("brightness", String(value))} type="button">
                              {value}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label className="filter-field map-style-number-field">
                        <span>Контрастность</span>
                        <input disabled={isSaving} onChange={(event) => updateMarkerDraft("contrast", event.target.value)} step={5} type="number" value={markerDraft.contrast} />
                        <div className="map-choice-row">
                          {styleValuePresets.map((value) => (
                            <button className={`map-preset-button ${Number(markerDraft.contrast) === value ? "map-choice-active" : ""}`} disabled={isSaving} key={value} onClick={() => updateMarkerDraft("contrast", String(value))} type="button">
                              {value}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Описание</h2>
                  </div>
                  <label className="filter-field map-form-wide">
                    <span>Описание</span>
                    <textarea disabled={isSaving} maxLength={1000} onChange={(event) => updateMarkerDraft("description", event.target.value)} rows={4} value={markerDraft.description} />
                  </label>
                </section>
              </div>
              {formMessage ? <p className="draft-message">{formMessage}</p> : null}
              <div className="modal-actions map-form-actions">
                <p>{markerDraft.id ? "Изменения будут применены после сохранения" : "Объект будет добавлен на карту"}</p>
                <button className="command-row interactive-button" disabled={isSaving} onClick={requestCloseForms} type="button">
                  Отмена
                </button>
                <button className="primary-command interactive-button" disabled={isSaving} type="submit">
                  {isSaving ? "Сохранение..." : "Сохранить метку"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {zoneDraft ? (
          <div className="pda-modal-backdrop animate-fade-in" onMouseDown={requestCloseForms}>
            <form className="pda-modal map-marker-modal animate-modal-in" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleZoneSubmit}>
              <div className="map-form-header">
                <div className="min-w-0">
                  <span className="map-form-badge">{zoneDraft.id ? "Изменение объекта" : "Создание объекта"}</span>
                  <h1>{zoneDraft.id ? "Редактирование зоны" : "Новая зона"}</h1>
                  <p>{zoneDraft.shape === "polygon" ? `Точек: ${zoneDraft.points.length}` : `Центр: X ${zoneDraft.centerX} · Y ${zoneDraft.centerY}`}</p>
                </div>
              </div>
              <div className="map-object-form">
                <section className="map-form-section map-form-section-primary">
                  <div className="map-form-section-head">
                    <h2>Основные сведения</h2>
                  </div>
                  <div className="map-form-grid">
                    <label className="filter-field map-title-field map-form-wide">
                      <span>Название</span>
                      <input
                        disabled={isSaving}
                        maxLength={80}
                        onChange={(event) => updateZoneDraft("title", event.target.value)}
                        placeholder="Введите название зоны"
                        type="text"
                        value={zoneDraft.title}
                      />
                    </label>
                    <label className="filter-field map-form-wide">
                      <span>Слой</span>
                      <select disabled={isSaving} onChange={(event) => updateZoneDraft("layer", event.target.value)} value={zoneDraft.layer}>
                        {layers.map((layer) => (
                          <option key={layer} value={layer}>
                            {layer}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Расположение</h2>
                  </div>
                  {zoneDraft.shape === "circle" ? (
                    <div className="map-form-grid">
                      <label className="filter-field">
                        <span>Координаты X</span>
                        <input disabled={isSaving} min={0} onChange={(event) => updateZoneDraft("centerX", event.target.value)} type="number" value={zoneDraft.centerX} />
                      </label>
                      <label className="filter-field">
                        <span>Координаты Y</span>
                        <input disabled={isSaving} min={0} onChange={(event) => updateZoneDraft("centerY", event.target.value)} type="number" value={zoneDraft.centerY} />
                      </label>
                      <label className="filter-field map-form-wide">
                        <span>Радиус</span>
                        <div className="map-radius-control">
                          <button className="command-row interactive-button" disabled={isSaving} onClick={() => updateZoneRadius(-100)} type="button">
                            -100
                          </button>
                          <input disabled={isSaving} min={1} max={5000} onChange={(event) => updateZoneDraft("radius", event.target.value)} type="number" value={zoneDraft.radius} />
                          <button className="command-row interactive-button" disabled={isSaving} onClick={() => updateZoneRadius(100)} type="button">
                            +100
                          </button>
                        </div>
                        <div className="map-radius-presets map-choice-row">
                          {orderedCircleRadiusPresets.map(([key, preset]) => (
                            <button
                              className={`map-preset-button ${Number(zoneDraft.radius) === preset.radius ? "map-choice-active" : ""}`}
                              disabled={isSaving}
                              key={key}
                              onClick={() => setZoneRadiusPreset(preset.radius)}
                              type="button"
                            >
                              {preset.label} — {preset.radius}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>
                  ) : (
                    <div className="map-form-info-line">
                      <span>Количество точек</span>
                      <strong>{zoneDraft.points.length}</strong>
                    </div>
                  )}
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Оформление</h2>
                  </div>
                  <div className="map-form-style-stack">
                    <div className="map-form-control-block">
                      <span className="map-form-control-title">Цвет</span>
                      <div className="map-color-choice-grid">
                        {orderedMapColorKeys.map((colorKey) => {
                          const color = getZoneColorPreset(colorKey);
                          return (
                            <button
                              className={`map-color-choice ${zoneDraft.colorKey === colorKey ? "map-choice-active" : ""}`}
                              disabled={isSaving}
                              key={colorKey}
                              onClick={() => updateZoneDraft("colorKey", colorKey as MapZoneColorKey)}
                              type="button"
                            >
                              <span className="map-color-swatch" style={{ backgroundColor: color.marker, borderColor: color.stroke }} />
                              <span>{color.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="map-form-grid">
                      <label className="filter-field">
                        <span>Формат</span>
                        <select disabled={isSaving} onChange={(event) => updateZoneDraft("patternKey", event.target.value as MapFillPatternKey)} value={zoneDraft.patternKey}>
                          {fillPatternKeys.map((patternKey) => (
                            <option key={patternKey} value={patternKey}>
                              {getFillPatternPreset(patternKey).label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="map-form-grid">
                      <label className="filter-field map-style-number-field">
                        <span>Яркость</span>
                        <input disabled={isSaving} onChange={(event) => updateZoneDraft("brightness", event.target.value)} step={5} type="number" value={zoneDraft.brightness} />
                        <div className="map-choice-row">
                          {styleValuePresets.map((value) => (
                            <button className={`map-preset-button ${Number(zoneDraft.brightness) === value ? "map-choice-active" : ""}`} disabled={isSaving} key={value} onClick={() => updateZoneDraft("brightness", String(value))} type="button">
                              {value}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label className="filter-field map-style-number-field">
                        <span>Контрастность</span>
                        <input disabled={isSaving} onChange={(event) => updateZoneDraft("contrast", event.target.value)} step={5} type="number" value={zoneDraft.contrast} />
                        <div className="map-choice-row">
                          {styleValuePresets.map((value) => (
                            <button className={`map-preset-button ${Number(zoneDraft.contrast) === value ? "map-choice-active" : ""}`} disabled={isSaving} key={value} onClick={() => updateZoneDraft("contrast", String(value))} type="button">
                              {value}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Описание</h2>
                  </div>
                  <label className="filter-field map-form-wide">
                    <span>Описание</span>
                    <textarea disabled={isSaving} maxLength={1000} onChange={(event) => updateZoneDraft("description", event.target.value)} rows={4} value={zoneDraft.description} />
                  </label>
                </section>
              </div>
              {formMessage ? <p className="draft-message">{formMessage}</p> : null}
              <div className="modal-actions map-form-actions">
                <p>{zoneDraft.id ? "Изменения будут применены после сохранения" : "Объект будет добавлен на карту"}</p>
                <button className="command-row interactive-button" disabled={isSaving} onClick={requestCloseForms} type="button">
                  Отмена
                </button>
                <button className="primary-command interactive-button" disabled={isSaving} type="submit">
                  {isSaving ? "Сохранение..." : "Сохранить зону"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {routeDraft ? (
          <div className="pda-modal-backdrop animate-fade-in" onMouseDown={requestCloseForms}>
            <form className="pda-modal map-marker-modal animate-modal-in" onMouseDown={(event) => event.stopPropagation()} onSubmit={handleRouteSubmit}>
              <div className="map-form-header">
                <div className="min-w-0">
                  <span className="map-form-badge">{routeDraft.id ? "Изменение объекта" : "Создание объекта"}</span>
                  <h1>{routeDraft.id ? "Редактирование маршрута" : "Новый маршрут"}</h1>
                  <p>Точек маршрута: {routeDraft.points.length}</p>
                </div>
              </div>
              <div className="map-object-form">
                <section className="map-form-section map-form-section-primary">
                  <div className="map-form-section-head">
                    <h2>Основные сведения</h2>
                  </div>
                  <div className="map-form-grid">
                    <label className="filter-field map-title-field map-form-wide">
                      <span>Название</span>
                      <input
                        disabled={isSaving}
                        maxLength={80}
                        onChange={(event) => updateRouteDraft("title", event.target.value)}
                        placeholder="Введите название маршрута"
                        type="text"
                        value={routeDraft.title}
                      />
                    </label>
                    <label className="filter-field map-form-wide">
                      <span>Слой</span>
                      <select disabled={isSaving} onChange={(event) => updateRouteDraft("layer", event.target.value)} value={routeDraft.layer}>
                        {layers.map((layer) => (
                          <option key={layer} value={layer}>
                            {layer}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Расположение</h2>
                  </div>
                  <div className="map-form-info-line">
                    <span>Количество точек маршрута</span>
                    <strong>{routeDraft.points.length}</strong>
                  </div>
                  {routeDraft.points.length < 2 ? <p className="map-form-hint">Для сохранения маршрута укажите не менее двух точек.</p> : null}
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Оформление</h2>
                  </div>
                  <div className="map-form-style-stack">
                    <div className="map-form-control-block">
                      <span className="map-form-control-title">Цвет</span>
                      <div className="map-color-choice-grid">
                        {orderedMapColorKeys.map((colorKey) => {
                          const color = getRouteColorPreset(colorKey);
                          return (
                            <button
                              className={`map-color-choice ${routeDraft.colorKey === colorKey ? "map-choice-active" : ""}`}
                              disabled={isSaving}
                              key={colorKey}
                              onClick={() => updateRouteDraft("colorKey", colorKey as MapRouteColorKey)}
                              type="button"
                            >
                              <span className="map-color-swatch" style={{ backgroundColor: color.marker, borderColor: color.stroke }} />
                              <span>{color.label}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="map-form-grid">
                      <label className="filter-field">
                        <span>Формат линии</span>
                        <select disabled={isSaving} onChange={(event) => updateRouteDraft("linePattern", event.target.value as MapLinePatternKey)} value={routeDraft.linePattern}>
                          {linePatternKeys.map((linePattern) => (
                            <option key={linePattern} value={linePattern}>
                              {getLinePatternPreset(linePattern).label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <div className="map-form-grid">
                      <label className="filter-field map-style-number-field">
                        <span>Яркость</span>
                        <input disabled={isSaving} onChange={(event) => updateRouteDraft("brightness", event.target.value)} step={5} type="number" value={routeDraft.brightness} />
                        <div className="map-choice-row">
                          {styleValuePresets.map((value) => (
                            <button className={`map-preset-button ${Number(routeDraft.brightness) === value ? "map-choice-active" : ""}`} disabled={isSaving} key={value} onClick={() => updateRouteDraft("brightness", String(value))} type="button">
                              {value}
                            </button>
                          ))}
                        </div>
                      </label>
                      <label className="filter-field map-style-number-field">
                        <span>Контрастность</span>
                        <input disabled={isSaving} onChange={(event) => updateRouteDraft("contrast", event.target.value)} step={5} type="number" value={routeDraft.contrast} />
                        <div className="map-choice-row">
                          {styleValuePresets.map((value) => (
                            <button className={`map-preset-button ${Number(routeDraft.contrast) === value ? "map-choice-active" : ""}`} disabled={isSaving} key={value} onClick={() => updateRouteDraft("contrast", String(value))} type="button">
                              {value}
                            </button>
                          ))}
                        </div>
                      </label>
                    </div>
                  </div>
                </section>

                <section className="map-form-section">
                  <div className="map-form-section-head">
                    <h2>Описание</h2>
                  </div>
                  <label className="filter-field map-form-wide">
                    <span>Описание</span>
                    <textarea disabled={isSaving} maxLength={1000} onChange={(event) => updateRouteDraft("description", event.target.value)} rows={4} value={routeDraft.description} />
                  </label>
                </section>
              </div>
              {formMessage ? <p className="draft-message">{formMessage}</p> : null}
              <div className="modal-actions map-form-actions">
                <p>{routeDraft.id ? "Изменения будут применены после сохранения" : "Объект будет добавлен на карту"}</p>
                <button className="command-row interactive-button" disabled={isSaving} onClick={requestCloseForms} type="button">
                  Отмена
                </button>
                <button className="primary-command interactive-button" disabled={isSaving} type="submit">
                  {isSaving ? "Сохранение..." : "Сохранить маршрут"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {confirmDialog ? (
          <ConfirmDialog
            cancelLabel={confirmDialog.cancelLabel}
            confirmLabel={confirmDialog.confirmLabel}
            confirmTone={confirmDialog.confirmTone}
            loading={confirmDialog.loading || isSaving}
            message={confirmDialog.message}
            onCancel={() => setConfirmDialog(null)}
            onConfirm={confirmDialog.onConfirm}
            title={confirmDialog.title}
            variant={confirmDialog.variant}
          />
        ) : null}
      </section>
    </main>
  );
}
