"use client";

import type { CSSProperties, MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMapMarkerTypeClassName, getMapMarkerTypeLabel, normalizeMapMarkerType, type MapMarkerDto, type MapMarkerType } from "@/lib/map-markers";
import {
  DEFAULT_MAP_ROUTE_COLOR_KEY,
  DEFAULT_MAP_ROUTE_LINE_PATTERN,
  getFillPatternPreset,
  getLinePatternPreset,
  getMapRouteTypeClassName,
  getMapZoneShapeLabel,
  getMapZoneTypeClassName,
  getRouteColorPreset,
  getZoneColorPreset,
  fillPatternKeys,
  zoneColorKeys,
  type MapRouteDto,
  type MapRoutePointDto,
  type MapZoneDto,
} from "@/lib/map-overlays";

type MapMetadata = {
  tileSize: number;
  width: number;
  height: number;
  minZoom: number;
  maxZoom: number;
  tilesPath: string;
};

type Point = {
  x: number;
  y: number;
};

type ViewportSize = {
  width: number;
  height: number;
};

type MapView = {
  scale: number;
  offset: Point;
};

type VisibleTile = {
  key: string;
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
};

type VisibleMarker = {
  marker: MapMarkerDto;
  left: number;
  top: number;
};

type VisibleZone = {
  zone: MapZoneDto;
  cx: number;
  cy: number;
  radius: number;
  points: Array<{ x: number; y: number }>;
};

type VisibleRoute = {
  route: MapRouteDto;
  points: Array<{ x: number; y: number }>;
};

type DrawingMode = "marker" | "zone" | "zone-polygon" | "route" | null;

type FocusTarget =
  | { type: "point"; x: number; y: number; nonce: number }
  | { type: "bounds"; bounds: { minX: number; minY: number; maxX: number; maxY: number }; nonce: number };

type DraftZonePreview =
  | { shape: "circle"; centerX: number; centerY: number; radius: number; type: string; colorKey: string; patternKey: string; brightness: number; contrast: number }
  | { shape: "polygon"; points: Array<Pick<MapRoutePointDto, "x" | "y">>; type: string; colorKey: string; patternKey: string; brightness: number; contrast: number };

type DraftMarkerPreview = {
  brightness: number;
  colorKey: string;
  contrast: number;
  followCursor?: boolean;
  size: number;
  type: string;
  x?: number;
  y?: number;
};

type DraftZonePlacementPreview = {
  brightness: number;
  colorKey: string;
  contrast: number;
  patternKey: string;
  radius: number;
  type: string;
};

type TileMapViewerProps = {
  draftMarkerPreview?: DraftMarkerPreview | null;
  draftZonePreview?: DraftZonePreview | null;
  draftZonePlacementPreview?: DraftZonePlacementPreview | null;
  draftRouteColorKey?: string;
  draftRouteLinePattern?: string;
  draftRoutePoints?: Array<Pick<MapRoutePointDto, "x" | "y">>;
  drawingMode?: DrawingMode;
  focusTarget?: FocusTarget | null;
  markers?: MapMarkerDto[];
  routes?: MapRouteDto[];
  visibleLayers?: string[];
  zones?: MapZoneDto[];
  selectedRouteId?: string;
  selectedMarkerId?: string;
  selectedZoneId?: string;
  onMarkerClear?: () => void;
  onMarkerDelete?: (marker: MapMarkerDto) => void;
  onMarkerEdit?: (marker: MapMarkerDto) => void;
  onMarkerSelect?: (marker: MapMarkerDto) => void;
  onMapClick?: (x: number, y: number) => void;
  onRouteDelete?: (route: MapRouteDto) => void;
  onRouteEdit?: (route: MapRouteDto) => void;
  onRoutePointAdd?: (x: number, y: number) => void;
  onRouteSelect?: (route: MapRouteDto) => void;
  onSelectionClear?: () => void;
  onZoneDelete?: (zone: MapZoneDto) => void;
  onZoneEdit?: (zone: MapZoneDto) => void;
  onZoneSelect?: (zone: MapZoneDto) => void;
  isPickingPoint?: boolean;
};

const METADATA_URL = "/map/zone/metadata.json";
const MISSING_MAP_MESSAGE = "Карта не подготовлена. Сформируйте тайлы перед использованием.";
const ZOOM_STEP = 1.35;
const MARKER_POPOVER_WIDTH = 264;
const MARKER_POPOVER_HEIGHT = 230;
const MARKER_POPOVER_GAP = 14;
const MARKER_POPOVER_MARGIN = 8;

function getMapStyleFilter(brightness: number, contrast: number) {
  return `brightness(${brightness}%) contrast(${contrast}%)`;
}

function getFillPatternId(colorKey: string, patternKey: string) {
  return `map-fill-${colorKey}-${patternKey}`.replaceAll("_", "-");
}

export function MapMarkerIcon({ type }: { type: MapMarkerType | string }) {
  const normalizedType = normalizeMapMarkerType(type);

  if (normalizedType === "possible_shelter") {
    return (
      <svg aria-hidden="true" className="map-marker-icon" viewBox="0 0 24 24">
        <path d="M4 12.2 12 5l8 7.2" />
        <path d="M6.8 11.1v7.4h10.4v-7.4" />
        <path d="M10 18.5v-4.4h4v4.4" />
      </svg>
    );
  }

  if (normalizedType === "trader") {
    return (
      <span aria-hidden="true" className="map-marker-icon map-marker-icon-text">
        ₽
      </span>
    );
  }

  if (normalizedType === "unstable_bubble") {
    return (
      <svg aria-hidden="true" className="map-marker-icon" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="6.8" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
    );
  }

  if (normalizedType === "pripyat3_bubble") {
    return (
      <span aria-hidden="true" className="map-marker-icon map-marker-icon-bubble-index">
        П3
      </span>
    );
  }

  if (normalizedType === "question") {
    return (
      <span aria-hidden="true" className="map-marker-icon map-marker-icon-text map-marker-icon-symbol">
        ?
      </span>
    );
  }

  if (normalizedType === "exclamation") {
    return (
      <span aria-hidden="true" className="map-marker-icon map-marker-icon-text map-marker-icon-symbol">
        !
      </span>
    );
  }

  if (normalizedType === "radiation") {
    return (
      <svg aria-hidden="true" className="map-marker-icon map-marker-icon-radiation" viewBox="0 0 24 24">
        <circle cx="12" cy="12" r="2.15" />
        <path d="M12 3.4a8.6 8.6 0 0 1 4.3 1.16l-3.04 5.27a2.6 2.6 0 0 0-2.52 0L7.7 4.56A8.6 8.6 0 0 1 12 3.4Z" />
        <path d="M20.1 14.85a8.6 8.6 0 0 1-6.24 5.55v-6.1a2.6 2.6 0 0 0 1.25-2.18h6.08a8.6 8.6 0 0 1-1.09 2.73Z" />
        <path d="M3.9 14.85a8.6 8.6 0 0 0 6.24 5.55v-6.1a2.6 2.6 0 0 1-1.25-2.18H2.81a8.6 8.6 0 0 0 1.09 2.73Z" />
      </svg>
    );
  }

  return (
    <svg aria-hidden="true" className="map-marker-icon" viewBox="0 0 24 24">
      <circle cx="12" cy="12" r="6.2" />
      <circle cx="12" cy="12" r="1.9" />
    </svg>
  );
}

function getLevelScale(metadata: MapMetadata, tileZoom: number) {
  return 2 ** (tileZoom - metadata.maxZoom);
}

function getLevelSize(metadata: MapMetadata, tileZoom: number) {
  const levelScale = getLevelScale(metadata, tileZoom);

  return {
    height: Math.max(1, Math.round(metadata.height * levelScale)),
    width: Math.max(1, Math.round(metadata.width * levelScale)),
  };
}

function clampTileZoom(metadata: MapMetadata, tileZoom: number) {
  return Math.min(metadata.maxZoom, Math.max(metadata.minZoom, tileZoom));
}

function getFitScale(metadata: MapMetadata, viewportSize: ViewportSize) {
  if (viewportSize.width <= 0 || viewportSize.height <= 0) {
    return getLevelScale(metadata, metadata.minZoom);
  }

  return Math.min(1, viewportSize.width / metadata.width, viewportSize.height / metadata.height);
}

function getMinScale(metadata: MapMetadata, viewportSize: ViewportSize) {
  return Math.min(getFitScale(metadata, viewportSize), getLevelScale(metadata, metadata.minZoom));
}

function createCenteredView(metadata: MapMetadata, viewportSize: ViewportSize): MapView {
  const scale = getFitScale(metadata, viewportSize);

  return {
    offset: {
      x: Math.round((viewportSize.width - metadata.width * scale) / 2),
      y: Math.round((viewportSize.height - metadata.height * scale) / 2),
    },
    scale,
  };
}

function clampScale(metadata: MapMetadata, viewportSize: ViewportSize, scale: number) {
  return Math.min(1, Math.max(getMinScale(metadata, viewportSize), scale));
}

function clampOffset(metadata: MapMetadata, viewportSize: ViewportSize, scale: number, offset: Point): Point {
  const renderedWidth = metadata.width * scale;
  const renderedHeight = metadata.height * scale;
  const centeredX = Math.round((viewportSize.width - renderedWidth) / 2);
  const centeredY = Math.round((viewportSize.height - renderedHeight) / 2);

  if (renderedWidth <= viewportSize.width && renderedHeight <= viewportSize.height) {
    return { x: centeredX, y: centeredY };
  }

  return {
    x: renderedWidth <= viewportSize.width
      ? centeredX
      : Math.min(0, Math.max(viewportSize.width - renderedWidth, offset.x)),
    y: renderedHeight <= viewportSize.height
      ? centeredY
      : Math.min(0, Math.max(viewportSize.height - renderedHeight, offset.y)),
  };
}

function clampView(metadata: MapMetadata, viewportSize: ViewportSize, view: MapView): MapView {
  const scale = clampScale(metadata, viewportSize, view.scale);

  return {
    offset: clampOffset(metadata, viewportSize, scale, view.offset),
    scale,
  };
}

function getTileZoomForScale(metadata: MapMetadata, scale: number) {
  if (scale <= 0 || !Number.isFinite(scale)) {
    return metadata.minZoom;
  }

  return clampTileZoom(metadata, Math.ceil(metadata.maxZoom + Math.log2(scale)));
}

function getViewportPoint(event: Pick<MouseEvent | ReactPointerEvent<HTMLElement>, "clientX" | "clientY">, element: HTMLElement) {
  const rect = element.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function getSourcePoint(metadata: MapMetadata, view: MapView, viewportPoint: Point) {
  const x = Math.floor((viewportPoint.x - view.offset.x) / view.scale);
  const y = Math.floor((viewportPoint.y - view.offset.y) / view.scale);

  if (x < 0 || y < 0 || x >= metadata.width || y >= metadata.height) {
    return null;
  }

  return { x, y };
}

function mapIntersectsViewport(metadata: MapMetadata, viewportSize: ViewportSize, view: MapView) {
  const right = view.offset.x + metadata.width * view.scale;
  const bottom = view.offset.y + metadata.height * view.scale;

  return right > 0 && bottom > 0 && view.offset.x < viewportSize.width && view.offset.y < viewportSize.height;
}

export function TileMapViewer({
  draftMarkerPreview = null,
  draftRouteColorKey = DEFAULT_MAP_ROUTE_COLOR_KEY,
  draftRouteLinePattern = DEFAULT_MAP_ROUTE_LINE_PATTERN,
  draftZonePlacementPreview = null,
  draftZonePreview = null,
  draftRoutePoints = [],
  drawingMode = null,
  focusTarget = null,
  isPickingPoint = false,
  markers = [],
  onMapClick,
  onMarkerClear,
  onMarkerDelete,
  onMarkerEdit,
  onMarkerSelect,
  onRouteDelete,
  onRouteEdit,
  onRoutePointAdd,
  onRouteSelect,
  onSelectionClear,
  onZoneDelete,
  onZoneEdit,
  onZoneSelect,
  routes = [],
  selectedRouteId,
  selectedMarkerId,
  selectedZoneId,
  visibleLayers = [],
  zones = [],
}: TileMapViewerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const dragStartRef = useRef<{ offset: Point; pointer: Point } | null>(null);
  const hasDraggedRef = useRef(false);
  const pendingViewRef = useRef<MapView | null>(null);
  const frameRef = useRef<number | null>(null);
  const hasInitialViewRef = useRef(false);
  const [metadata, setMetadata] = useState<MapMetadata | null>(null);
  const [view, setView] = useState<MapView>({ offset: { x: 0, y: 0 }, scale: 1 });
  const [viewportSize, setViewportSize] = useState<ViewportSize>({ height: 0, width: 0 });
  const [cursorCoordinates, setCursorCoordinates] = useState<Point | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "missing" | "error">("loading");

  useEffect(() => {
    let isCancelled = false;

    async function loadMetadata() {
      setStatus("loading");

      try {
        const response = await fetch(METADATA_URL, { cache: "no-store" });

        if (!response.ok) {
          if (!isCancelled) {
            setStatus(response.status === 404 ? "missing" : "error");
          }

          return;
        }

        const payload = (await response.json()) as MapMetadata;

        if (!isCancelled) {
          setMetadata(payload);
          setStatus("ready");
        }
      } catch {
        if (!isCancelled) {
          setStatus("error");
        }
      }
    }

    void loadMetadata();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    const element = viewportRef.current;

    if (!element || !metadata) {
      return;
    }

    const applyViewportSize = (nextSize: ViewportSize) => {
      setViewportSize(nextSize);
      setView((currentView) => {
        if (!hasInitialViewRef.current) {
          hasInitialViewRef.current = true;
          return createCenteredView(metadata, nextSize);
        }

        return clampView(metadata, nextSize, currentView);
      });
    };

    const resizeObserver = new ResizeObserver(([entry]) => {
      applyViewportSize({
        height: Math.max(1, Math.round(entry.contentRect.height)),
        width: Math.max(1, Math.round(entry.contentRect.width)),
      });
    });

    resizeObserver.observe(element);

    const frameId = window.requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();

      applyViewportSize({
        height: Math.max(1, Math.round(rect.height)),
        width: Math.max(1, Math.round(rect.width)),
      });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
    };
  }, [metadata]);

  const currentView = useMemo(() => {
    if (!metadata || viewportSize.width === 0 || viewportSize.height === 0) {
      return view;
    }

    return clampView(metadata, viewportSize, view);
  }, [metadata, view, viewportSize]);

  useEffect(() => {
    if (!metadata || !focusTarget || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    const targetPoint = focusTarget.type === "point"
      ? { x: focusTarget.x, y: focusTarget.y }
      : {
          x: Math.round((focusTarget.bounds.minX + focusTarget.bounds.maxX) / 2),
          y: Math.round((focusTarget.bounds.minY + focusTarget.bounds.maxY) / 2),
        };
    const nextOffset = clampOffset(metadata, viewportSize, currentView.scale, {
      x: viewportSize.width / 2 - targetPoint.x * currentView.scale,
      y: viewportSize.height / 2 - targetPoint.y * currentView.scale,
    });

    const frameId = window.requestAnimationFrame(() => {
      setView({ offset: nextOffset, scale: currentView.scale });
    });

    return () => window.cancelAnimationFrame(frameId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- nonce is the external command trigger for repeated focus on the same object.
  }, [focusTarget?.nonce]);

  const tileZoom = useMemo(() => {
    return metadata ? getTileZoomForScale(metadata, currentView.scale) : 0;
  }, [currentView.scale, metadata]);

  const visibleTiles = useMemo<VisibleTile[]>(() => {
    if (!metadata || viewportSize.width === 0 || viewportSize.height === 0 || currentView.scale <= 0) {
      return [];
    }

    const tileSize = metadata.tileSize;
    const levelScale = getLevelScale(metadata, tileZoom);
    const levelSize = getLevelSize(metadata, tileZoom);
    const tileScreenScale = currentView.scale / levelScale;
    const sourceLeft = Math.max(0, (0 - currentView.offset.x) / currentView.scale);
    const sourceTop = Math.max(0, (0 - currentView.offset.y) / currentView.scale);
    const sourceRight = Math.min(metadata.width, (viewportSize.width - currentView.offset.x) / currentView.scale);
    const sourceBottom = Math.min(metadata.height, (viewportSize.height - currentView.offset.y) / currentView.scale);

    if (
      sourceRight <= sourceLeft ||
      sourceBottom <= sourceTop ||
      !Number.isFinite(sourceLeft) ||
      !Number.isFinite(sourceTop) ||
      !Number.isFinite(sourceRight) ||
      !Number.isFinite(sourceBottom)
    ) {
      return [];
    }

    const maxTileX = Math.ceil(levelSize.width / tileSize) - 1;
    const maxTileY = Math.ceil(levelSize.height / tileSize) - 1;
    const firstX = Math.max(0, Math.floor((sourceLeft * levelScale) / tileSize) - 1);
    const firstY = Math.max(0, Math.floor((sourceTop * levelScale) / tileSize) - 1);
    const lastX = Math.min(maxTileX, Math.floor(((sourceRight * levelScale) - 0.001) / tileSize) + 1);
    const lastY = Math.min(maxTileY, Math.floor(((sourceBottom * levelScale) - 0.001) / tileSize) + 1);
    const tiles: VisibleTile[] = [];

    for (let x = firstX; x <= lastX; x += 1) {
      for (let y = firstY; y <= lastY; y += 1) {
        const levelTileWidth = Math.min(tileSize, levelSize.width - x * tileSize);
        const levelTileHeight = Math.min(tileSize, levelSize.height - y * tileSize);
        const sourceX = (x * tileSize) / levelScale;
        const sourceY = (y * tileSize) / levelScale;

        if (levelTileWidth <= 0 || levelTileHeight <= 0) {
          continue;
        }

        tiles.push({
          height: levelTileHeight * tileScreenScale,
          key: `${tileZoom}-${x}-${y}`,
          left: currentView.offset.x + sourceX * currentView.scale,
          src: `${metadata.tilesPath}/${tileZoom}/${x}/${y}.png`,
          top: currentView.offset.y + sourceY * currentView.scale,
          width: levelTileWidth * tileScreenScale,
        });
      }
    }

    return tiles;
  }, [currentView, metadata, tileZoom, viewportSize]);

  const visibleMarkers = useMemo<VisibleMarker[]>(() => {
    if (!metadata || viewportSize.width === 0 || viewportSize.height === 0) {
      return [];
    }

    const layerSet = new Set(visibleLayers);

    return markers
      .filter((marker) => marker.status !== "archived")
      .filter((marker) => layerSet.size === 0 || layerSet.has(marker.layer))
      .map((marker) => ({
        left: currentView.offset.x + marker.x * currentView.scale,
        marker,
        top: currentView.offset.y + marker.y * currentView.scale,
      }))
      .filter(
        (marker) =>
          marker.left >= -24 &&
          marker.top >= -24 &&
          marker.left <= viewportSize.width + 24 &&
          marker.top <= viewportSize.height + 24,
      );
  }, [currentView, markers, metadata, viewportSize, visibleLayers]);

  const visibleZones = useMemo<VisibleZone[]>(() => {
    if (!metadata || viewportSize.width === 0 || viewportSize.height === 0) {
      return [];
    }

    const layerSet = new Set(visibleLayers);

    return zones
      .filter((zone) => layerSet.size === 0 || layerSet.has(zone.layer))
      .map((zone) => ({
        cx: currentView.offset.x + zone.centerX * currentView.scale,
        cy: currentView.offset.y + zone.centerY * currentView.scale,
        points: [...zone.points]
          .sort((firstPoint, secondPoint) => firstPoint.order - secondPoint.order)
          .map((point) => ({
            x: currentView.offset.x + point.x * currentView.scale,
            y: currentView.offset.y + point.y * currentView.scale,
          })),
        radius: zone.radius * currentView.scale,
        zone,
      }))
      .filter(
        (zone) =>
          zone.zone.shape === "polygon"
            ? zone.points.some(
                (point) =>
                  point.x >= -32 &&
                  point.y >= -32 &&
                  point.x <= viewportSize.width + 32 &&
                  point.y <= viewportSize.height + 32,
              )
            : zone.cx + zone.radius >= 0 &&
              zone.cy + zone.radius >= 0 &&
              zone.cx - zone.radius <= viewportSize.width &&
              zone.cy - zone.radius <= viewportSize.height,
      );
  }, [currentView, metadata, viewportSize, visibleLayers, zones]);

  const visibleRoutes = useMemo<VisibleRoute[]>(() => {
    if (!metadata || viewportSize.width === 0 || viewportSize.height === 0) {
      return [];
    }

    const layerSet = new Set(visibleLayers);

    return routes
      .filter((route) => layerSet.size === 0 || layerSet.has(route.layer))
      .map((route) => ({
        points: [...route.points]
          .sort((firstPoint, secondPoint) => firstPoint.order - secondPoint.order)
          .map((point) => ({
            x: currentView.offset.x + point.x * currentView.scale,
            y: currentView.offset.y + point.y * currentView.scale,
          })),
        route,
      }))
      .filter((route) =>
        route.points.some(
          (point) =>
            point.x >= -32 &&
            point.y >= -32 &&
            point.x <= viewportSize.width + 32 &&
            point.y <= viewportSize.height + 32,
        ),
      );
  }, [currentView, metadata, routes, viewportSize, visibleLayers]);

  const draftRouteScreenPoints = useMemo(() => {
    return draftRoutePoints.map((point) => ({
      x: currentView.offset.x + point.x * currentView.scale,
      y: currentView.offset.y + point.y * currentView.scale,
    }));
  }, [currentView, draftRoutePoints]);

  const draftZoneScreenPreview = useMemo(() => {
    if (!draftZonePreview) {
      return null;
    }

    if (draftZonePreview.shape === "circle") {
      return {
        cx: currentView.offset.x + draftZonePreview.centerX * currentView.scale,
        cy: currentView.offset.y + draftZonePreview.centerY * currentView.scale,
        brightness: draftZonePreview.brightness,
        colorKey: draftZonePreview.colorKey,
        contrast: draftZonePreview.contrast,
        patternKey: draftZonePreview.patternKey,
        radius: draftZonePreview.radius * currentView.scale,
        shape: "circle" as const,
        type: draftZonePreview.type,
      };
    }

    return {
      points: draftZonePreview.points.map((point) => ({
        x: currentView.offset.x + point.x * currentView.scale,
        y: currentView.offset.y + point.y * currentView.scale,
      })),
      brightness: draftZonePreview.brightness,
      colorKey: draftZonePreview.colorKey,
      contrast: draftZonePreview.contrast,
      patternKey: draftZonePreview.patternKey,
      shape: "polygon" as const,
      type: draftZonePreview.type,
    };
  }, [currentView, draftZonePreview]);

  const draftZoneCursorScreenPreview = useMemo(() => {
    if (!draftZonePlacementPreview || !cursorCoordinates) {
      return null;
    }

    return {
      cx: currentView.offset.x + cursorCoordinates.x * currentView.scale,
      cy: currentView.offset.y + cursorCoordinates.y * currentView.scale,
      brightness: draftZonePlacementPreview.brightness,
      colorKey: draftZonePlacementPreview.colorKey,
      contrast: draftZonePlacementPreview.contrast,
      patternKey: draftZonePlacementPreview.patternKey,
      radius: draftZonePlacementPreview.radius * currentView.scale,
      shape: "circle" as const,
      type: draftZonePlacementPreview.type,
    };
  }, [currentView, cursorCoordinates, draftZonePlacementPreview]);

  const activeDraftZoneScreenPreview = draftZoneScreenPreview ?? draftZoneCursorScreenPreview;

  const draftMarkerScreenPreview = useMemo(() => {
    if (!draftMarkerPreview) {
      return null;
    }

    const sourcePoint = draftMarkerPreview.followCursor
      ? cursorCoordinates
      : typeof draftMarkerPreview.x === "number" && typeof draftMarkerPreview.y === "number"
        ? { x: draftMarkerPreview.x, y: draftMarkerPreview.y }
        : null;

    if (!sourcePoint || !Number.isFinite(sourcePoint.x) || !Number.isFinite(sourcePoint.y)) {
      return null;
    }

    return {
      brightness: draftMarkerPreview.brightness,
      colorKey: draftMarkerPreview.colorKey,
      contrast: draftMarkerPreview.contrast,
      left: currentView.offset.x + sourcePoint.x * currentView.scale,
      size: draftMarkerPreview.size,
      top: currentView.offset.y + sourcePoint.y * currentView.scale,
      type: draftMarkerPreview.type,
    };
  }, [currentView, cursorCoordinates, draftMarkerPreview]);

  const selectedMarker = useMemo(() => {
    return markers.find((marker) => marker.id === selectedMarkerId && marker.status !== "archived") ?? null;
  }, [markers, selectedMarkerId]);

  const selectedZone = useMemo(() => {
    return zones.find((zone) => zone.id === selectedZoneId) ?? null;
  }, [selectedZoneId, zones]);

  const selectedRoute = useMemo(() => {
    return routes.find((route) => route.id === selectedRouteId) ?? null;
  }, [routes, selectedRouteId]);

  const selectedMarkerPopover = useMemo(() => {
    if (!metadata || !selectedMarker || viewportSize.width === 0 || viewportSize.height === 0) {
      return null;
    }

    const layerSet = new Set(visibleLayers);

    if (layerSet.size > 0 && !layerSet.has(selectedMarker.layer)) {
      return null;
    }

    const markerLeft = currentView.offset.x + selectedMarker.x * currentView.scale;
    const markerTop = currentView.offset.y + selectedMarker.y * currentView.scale;

    if (
      markerLeft < -MARKER_POPOVER_MARGIN ||
      markerTop < -MARKER_POPOVER_MARGIN ||
      markerLeft > viewportSize.width + MARKER_POPOVER_MARGIN ||
      markerTop > viewportSize.height + MARKER_POPOVER_MARGIN
    ) {
      return null;
    }

    const popoverWidth = Math.min(MARKER_POPOVER_WIDTH, Math.max(1, viewportSize.width - MARKER_POPOVER_MARGIN * 2));
    const popoverHeight = Math.min(MARKER_POPOVER_HEIGHT, Math.max(1, viewportSize.height - MARKER_POPOVER_MARGIN * 2));
    let left = markerLeft + MARKER_POPOVER_GAP;
    let top = markerTop - MARKER_POPOVER_MARGIN;

    if (left + popoverWidth > viewportSize.width - MARKER_POPOVER_MARGIN) {
      left = markerLeft - popoverWidth - MARKER_POPOVER_GAP;
    }

    if (top + popoverHeight > viewportSize.height - MARKER_POPOVER_MARGIN) {
      top = viewportSize.height - popoverHeight - MARKER_POPOVER_MARGIN;
    }

    return {
      left: Math.round(Math.min(Math.max(MARKER_POPOVER_MARGIN, left), Math.max(MARKER_POPOVER_MARGIN, viewportSize.width - popoverWidth - MARKER_POPOVER_MARGIN))),
      marker: selectedMarker,
      top: Math.round(Math.min(Math.max(MARKER_POPOVER_MARGIN, top), Math.max(MARKER_POPOVER_MARGIN, viewportSize.height - popoverHeight - MARKER_POPOVER_MARGIN))),
    };
  }, [currentView, metadata, selectedMarker, viewportSize, visibleLayers]);

  const selectedZonePopover = useMemo(() => {
    if (!metadata || !selectedZone || viewportSize.width === 0 || viewportSize.height === 0) {
      return null;
    }

    const layerSet = new Set(visibleLayers);

    if (layerSet.size > 0 && !layerSet.has(selectedZone.layer)) {
      return null;
    }

    const anchorLeft = currentView.offset.x + selectedZone.centerX * currentView.scale;
    const anchorTop = currentView.offset.y + selectedZone.centerY * currentView.scale;
    const popoverWidth = Math.min(MARKER_POPOVER_WIDTH, Math.max(1, viewportSize.width - MARKER_POPOVER_MARGIN * 2));
    const popoverHeight = Math.min(MARKER_POPOVER_HEIGHT, Math.max(1, viewportSize.height - MARKER_POPOVER_MARGIN * 2));
    let left = anchorLeft + MARKER_POPOVER_GAP;
    let top = anchorTop - MARKER_POPOVER_MARGIN;

    if (left + popoverWidth > viewportSize.width - MARKER_POPOVER_MARGIN) {
      left = anchorLeft - popoverWidth - MARKER_POPOVER_GAP;
    }

    if (top + popoverHeight > viewportSize.height - MARKER_POPOVER_MARGIN) {
      top = viewportSize.height - popoverHeight - MARKER_POPOVER_MARGIN;
    }

    return {
      left: Math.round(Math.min(Math.max(MARKER_POPOVER_MARGIN, left), Math.max(MARKER_POPOVER_MARGIN, viewportSize.width - popoverWidth - MARKER_POPOVER_MARGIN))),
      top: Math.round(Math.min(Math.max(MARKER_POPOVER_MARGIN, top), Math.max(MARKER_POPOVER_MARGIN, viewportSize.height - popoverHeight - MARKER_POPOVER_MARGIN))),
      zone: selectedZone,
    };
  }, [currentView, metadata, selectedZone, viewportSize, visibleLayers]);

  const selectedRoutePopover = useMemo(() => {
    if (!metadata || !selectedRoute || viewportSize.width === 0 || viewportSize.height === 0 || selectedRoute.points.length === 0) {
      return null;
    }

    const layerSet = new Set(visibleLayers);

    if (layerSet.size > 0 && !layerSet.has(selectedRoute.layer)) {
      return null;
    }

    const sortedPoints = [...selectedRoute.points].sort((firstPoint, secondPoint) => firstPoint.order - secondPoint.order);
    const anchorPoint = sortedPoints[Math.floor(sortedPoints.length / 2)];
    const anchorLeft = currentView.offset.x + anchorPoint.x * currentView.scale;
    const anchorTop = currentView.offset.y + anchorPoint.y * currentView.scale;
    const popoverWidth = Math.min(MARKER_POPOVER_WIDTH, Math.max(1, viewportSize.width - MARKER_POPOVER_MARGIN * 2));
    const popoverHeight = Math.min(MARKER_POPOVER_HEIGHT, Math.max(1, viewportSize.height - MARKER_POPOVER_MARGIN * 2));
    let left = anchorLeft + MARKER_POPOVER_GAP;
    let top = anchorTop - MARKER_POPOVER_MARGIN;

    if (left + popoverWidth > viewportSize.width - MARKER_POPOVER_MARGIN) {
      left = anchorLeft - popoverWidth - MARKER_POPOVER_GAP;
    }

    if (top + popoverHeight > viewportSize.height - MARKER_POPOVER_MARGIN) {
      top = viewportSize.height - popoverHeight - MARKER_POPOVER_MARGIN;
    }

    return {
      left: Math.round(Math.min(Math.max(MARKER_POPOVER_MARGIN, left), Math.max(MARKER_POPOVER_MARGIN, viewportSize.width - popoverWidth - MARKER_POPOVER_MARGIN))),
      route: selectedRoute,
      top: Math.round(Math.min(Math.max(MARKER_POPOVER_MARGIN, top), Math.max(MARKER_POPOVER_MARGIN, viewportSize.height - popoverHeight - MARKER_POPOVER_MARGIN))),
    };
  }, [currentView, metadata, selectedRoute, viewportSize, visibleLayers]);

  useEffect(() => {
    if (
      process.env.NODE_ENV !== "production" &&
      metadata &&
      viewportSize.width > 0 &&
      viewportSize.height > 0 &&
      visibleTiles.length === 0 &&
      mapIntersectsViewport(metadata, viewportSize, currentView)
    ) {
      console.warn("Не найдены видимые тайлы карты", { tileZoom, view: currentView, viewportSize });
    }
  }, [currentView, metadata, tileZoom, viewportSize, visibleTiles.length]);

  const applyZoom = useCallback(
    (nextScaleValue: number, anchor?: Point) => {
      if (!metadata || viewportSize.width === 0 || viewportSize.height === 0) {
        return;
      }

      const nextScale = clampScale(metadata, viewportSize, nextScaleValue);

      if (Math.abs(nextScale - currentView.scale) < 0.0001) {
        return;
      }

      const point = anchor ?? {
        x: viewportSize.width / 2,
        y: viewportSize.height / 2,
      };
      const sourceX = (point.x - currentView.offset.x) / currentView.scale;
      const sourceY = (point.y - currentView.offset.y) / currentView.scale;
      const nextOffset = clampOffset(metadata, viewportSize, nextScale, {
        x: point.x - sourceX * nextScale,
        y: point.y - sourceY * nextScale,
      });

      setView({ offset: nextOffset, scale: nextScale });
    },
    [currentView, metadata, viewportSize],
  );

  const resetView = useCallback(() => {
    if (!metadata || viewportSize.width === 0 || viewportSize.height === 0) {
      return;
    }

    setView(createCenteredView(metadata, viewportSize));
  }, [metadata, viewportSize]);

  function scheduleView(nextView: MapView) {
    pendingViewRef.current = nextView;

    if (frameRef.current !== null) {
      return;
    }

    frameRef.current = window.requestAnimationFrame(() => {
      if (pendingViewRef.current) {
        setView(pendingViewRef.current);
      }

      pendingViewRef.current = null;
      frameRef.current = null;
    });
  }

  function updateCursorCoordinates(event: ReactPointerEvent<HTMLElement>) {
    if (!metadata || !viewportRef.current) {
      return;
    }

    setCursorCoordinates(getSourcePoint(metadata, currentView, getViewportPoint(event, viewportRef.current)));
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (!metadata || event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    hasDraggedRef.current = false;
    dragStartRef.current = {
      offset: currentView.offset,
      pointer: {
        x: event.clientX,
        y: event.clientY,
      },
    };
  }

  function handleViewportClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!metadata || !viewportRef.current) {
      return;
    }

    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const point = getSourcePoint(metadata, currentView, getViewportPoint(event.nativeEvent, viewportRef.current));

    if (point) {
      if ((drawingMode === "route" || drawingMode === "zone-polygon") && onRoutePointAdd) {
        onRoutePointAdd(point.x, point.y);
        return;
      }

      onMapClick?.(point.x, point.y);
    }
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    updateCursorCoordinates(event);

    if (!metadata || !dragStartRef.current) {
      return;
    }

    if (
      Math.abs(event.clientX - dragStartRef.current.pointer.x) > 2 ||
      Math.abs(event.clientY - dragStartRef.current.pointer.y) > 2
    ) {
      hasDraggedRef.current = true;
    }

    const nextOffset = clampOffset(metadata, viewportSize, currentView.scale, {
      x: dragStartRef.current.offset.x + event.clientX - dragStartRef.current.pointer.x,
      y: dragStartRef.current.offset.y + event.clientY - dragStartRef.current.pointer.y,
    });

    scheduleView({ offset: nextOffset, scale: currentView.scale });
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    dragStartRef.current = null;
  }

  function handleWheel(event: ReactWheelEvent<HTMLDivElement>) {
    if (!viewportRef.current || !metadata) {
      return;
    }

    event.preventDefault();
    const factor = event.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
    applyZoom(currentView.scale * factor, getViewportPoint(event.nativeEvent, viewportRef.current));
  }

  function handleDoubleClick(event: ReactMouseEvent<HTMLDivElement>) {
    if (!viewportRef.current) {
      return;
    }

    applyZoom(currentView.scale * ZOOM_STEP, getViewportPoint(event.nativeEvent, viewportRef.current));
  }

  function handleTileError(src: string) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("Не удалось загрузить тайл карты", src);
    }
  }

  if (status === "loading") {
    return <div className="map-viewer-state">Загрузка карты...</div>;
  }

  if (status === "missing") {
    return <div className="map-viewer-state">{MISSING_MAP_MESSAGE}</div>;
  }

  if (status === "error" || !metadata) {
    return <div className="map-viewer-state">Не удалось загрузить карту.</div>;
  }

  const zoomPercent = Math.round(currentView.scale * 100);
  const minScale = getMinScale(metadata, viewportSize);

  return (
    <section className="map-viewer-shell">
      <div className="map-viewer-toolbar">
        <div className="map-viewer-scale">Масштаб: {zoomPercent}%</div>
        <div className="map-viewer-coordinates">
          {cursorCoordinates ? `X: ${cursorCoordinates.x} Y: ${cursorCoordinates.y}` : "X: — Y: —"}
        </div>
        <div className="map-viewer-controls">
          <button disabled={currentView.scale >= 1} onClick={() => applyZoom(currentView.scale * ZOOM_STEP)} type="button">
            +
          </button>
          <button disabled={currentView.scale <= minScale + 0.0001} onClick={() => applyZoom(currentView.scale / ZOOM_STEP)} type="button">
            −
          </button>
          <button onClick={resetView} type="button">
            Сбросить
          </button>
        </div>
      </div>

      <div
        className={`map-viewer-viewport ${isPickingPoint ? "map-viewer-viewport-picking" : ""} ${drawingMode === "marker" ? "map-viewer-viewport-marker-preview" : ""}`}
        onDoubleClick={handleDoubleClick}
        onClick={handleViewportClick}
        onPointerDown={handlePointerDown}
        onPointerLeave={() => setCursorCoordinates(null)}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onWheel={handleWheel}
        ref={viewportRef}
      >
        <div className="map-viewer-layer">
          {visibleTiles.map((tile) => (
            // eslint-disable-next-line @next/next/no-img-element -- Тайлы подгружаются по координатам, оптимизация Next Image здесь не нужна.
            <img
              alt=""
              className="map-viewer-tile"
              draggable={false}
              key={tile.key}
              onError={() => handleTileError(tile.src)}
              src={tile.src}
              style={{
                height: tile.height,
                left: tile.left,
                top: tile.top,
                width: tile.width,
              }}
            />
          ))}
        </div>
        <svg aria-hidden="true" className="map-overlay-layer">
          <defs>
            {zoneColorKeys.flatMap((colorKey) =>
              fillPatternKeys.map((patternKey) => {
                const color = getZoneColorPreset(colorKey);
                const patternId = getFillPatternId(colorKey, patternKey);
                const lineStyle = { stroke: color.stroke };

                return (
                  <pattern height="12" id={patternId} key={patternId} patternUnits="userSpaceOnUse" width="12">
                    <rect fill={color.fill} height="12" width="12" />
                    {patternKey === "hatch_vertical" ? <path d="M3 0v12 M9 0v12" style={lineStyle} strokeWidth="1.2" /> : null}
                    {patternKey === "hatch_horizontal" ? <path d="M0 3h12 M0 9h12" style={lineStyle} strokeWidth="1.2" /> : null}
                    {patternKey === "hatch_diag_right" ? <path d="M-3 12 12 -3 M3 15 15 3" style={lineStyle} strokeWidth="1.2" /> : null}
                    {patternKey === "hatch_diag_left" ? <path d="M0 -3 15 12 M-3 3 9 15" style={lineStyle} strokeWidth="1.2" /> : null}
                    {patternKey === "cross_one" ? <path d="M0 12 12 0" style={lineStyle} strokeWidth="1.4" /> : null}
                    {patternKey === "cross_two" ? <path d="M0 12 12 0 M0 0l12 12" style={lineStyle} strokeWidth="1.2" /> : null}
                    {patternKey === "strike_horizontal" ? <path d="M0 6h12" style={lineStyle} strokeWidth="1.4" /> : null}
                    {patternKey === "strike_vertical" ? <path d="M6 0v12" style={lineStyle} strokeWidth="1.4" /> : null}
                    {patternKey === "grid" ? <path d="M0 4h12 M0 8h12 M4 0v12 M8 0v12" style={lineStyle} strokeWidth="0.9" /> : null}
                  </pattern>
                );
              }),
            )}
          </defs>
          {visibleZones.map(({ cx, cy, points, radius, zone }) => {
            const zoneColor = getZoneColorPreset(zone.colorKey);
            const isSelectedZone = selectedZoneId === zone.id;
            const fill = zone.patternKey === "solid" ? zoneColor.fill : `url(#${getFillPatternId(zone.colorKey, zone.patternKey)})`;
            const zoneClassName = `map-zone map-zone--${getMapZoneTypeClassName(zone.type)} ${selectedZoneId === zone.id ? "map-zone--selected" : ""}`;
            const sharedZoneProps = {
              className: zoneClassName,
              onClick: (event: ReactMouseEvent<SVGElement>) => {
                event.stopPropagation();
                onZoneSelect?.(zone);
              },
              onPointerDown: (event: ReactPointerEvent<SVGElement>) => event.stopPropagation(),
              style: {
                filter: getMapStyleFilter(zone.brightness, zone.contrast),
                fill,
                stroke: isSelectedZone ? "rgba(226, 98, 105, 0.9)" : zoneColor.stroke,
                strokeWidth: isSelectedZone ? 2.4 : undefined,
              },
            };

            if (zone.shape === "polygon") {
              return (
                <polygon
                  {...sharedZoneProps}
                  key={zone.id}
                  points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                />
              );
            }

            return (
              <circle
                {...sharedZoneProps}
                cx={cx}
                cy={cy}
                key={zone.id}
                r={radius}
              />
            );
          })}
          {visibleRoutes.map(({ points, route }) => {
            const pointValue = points.map((point) => `${point.x},${point.y}`).join(" ");
            const routeColor = getRouteColorPreset(route.colorKey);
            const routePattern = getLinePatternPreset(route.linePattern);
            const isSelectedRoute = selectedRouteId === route.id;
            const routeFilter = getMapStyleFilter(route.brightness, route.contrast);
            const routeStroke = isSelectedRoute ? "rgba(223, 91, 98, 0.92)" : routeColor.stroke;

            return (
              <g className={`map-route-group ${selectedRouteId === route.id ? "map-route-group--selected" : ""}`} key={route.id}>
                <polyline
                  className="map-route-hit-area"
                  fill="none"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRouteSelect?.(route);
                  }}
                  onPointerDown={(event) => event.stopPropagation()}
                  points={pointValue}
                />
                {route.linePattern === "double_line" ? (
                  <polyline
                    className="map-route map-route-double-shadow"
                    fill="none"
                    points={pointValue}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{
                      filter: routeFilter,
                      stroke: routeStroke,
                    }}
                  />
                ) : null}
                <polyline
                  className={`map-route map-route--${getMapRouteTypeClassName(route.type)} ${selectedRouteId === route.id ? "map-route--selected" : ""}`}
                  fill="none"
                  points={pointValue}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    filter: routeFilter,
                    stroke: routeStroke,
                    strokeDasharray: routePattern.dasharray ?? undefined,
                    strokeWidth: isSelectedRoute ? 3 : undefined,
                  }}
                />
              </g>
            );
          })}
          {draftRouteScreenPoints.length > 0 ? (
            <g className="map-route-draft">
              {draftRouteScreenPoints.length > 1 ? (
                <polyline
                  fill="none"
                  points={draftRouteScreenPoints.map((point) => `${point.x},${point.y}`).join(" ")}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{
                    stroke: getRouteColorPreset(draftRouteColorKey).stroke,
                    strokeDasharray: getLinePatternPreset(draftRouteLinePattern).dasharray ?? undefined,
                  }}
                />
              ) : null}
              {draftRouteScreenPoints.map((point, index) => (
                <circle cx={point.x} cy={point.y} key={index} r={3.2} />
              ))}
            </g>
          ) : null}
          {activeDraftZoneScreenPreview ? (
            <g
              className={`map-zone-draft map-zone--${getMapZoneTypeClassName(activeDraftZoneScreenPreview.type)}`}
              style={{
                filter: getMapStyleFilter(activeDraftZoneScreenPreview.brightness, activeDraftZoneScreenPreview.contrast),
                fill:
                  activeDraftZoneScreenPreview.patternKey === "solid"
                    ? getZoneColorPreset(activeDraftZoneScreenPreview.colorKey).fill
                    : `url(#${getFillPatternId(activeDraftZoneScreenPreview.colorKey, activeDraftZoneScreenPreview.patternKey)})`,
                stroke: getZoneColorPreset(activeDraftZoneScreenPreview.colorKey).stroke,
              }}
            >
              {activeDraftZoneScreenPreview.shape === "circle" ? (
                <circle cx={activeDraftZoneScreenPreview.cx} cy={activeDraftZoneScreenPreview.cy} r={activeDraftZoneScreenPreview.radius} />
              ) : (
                <>
                  {activeDraftZoneScreenPreview.points.length >= 3 ? (
                    <polygon points={activeDraftZoneScreenPreview.points.map((point) => `${point.x},${point.y}`).join(" ")} />
                  ) : null}
                  {activeDraftZoneScreenPreview.points.length > 1 ? (
                    <polyline points={activeDraftZoneScreenPreview.points.map((point) => `${point.x},${point.y}`).join(" ")} />
                  ) : null}
                  {activeDraftZoneScreenPreview.points.map((point, index) => (
                    <circle cx={point.x} cy={point.y} key={index} r={3.2} />
                  ))}
                </>
              )}
            </g>
          ) : null}
        </svg>
        <div className="map-marker-layer">
          {visibleMarkers.map(({ left, marker, top }) => (
            <button
              aria-label={marker.title}
              className={`map-marker map-marker--${getMapMarkerTypeClassName(marker.type)} ${selectedMarkerId === marker.id ? "map-marker--selected" : ""}`}
              key={marker.id}
              onClick={(event) => {
                event.stopPropagation();
                onMarkerSelect?.(marker);
              }}
              onDoubleClick={(event) => event.stopPropagation()}
              onPointerDown={(event) => event.stopPropagation()}
              style={{
                "--marker-scale": String(Math.max(0.25, (marker.size ?? 100) / 100)),
                color: getZoneColorPreset(marker.colorKey).marker,
                filter: getMapStyleFilter(marker.brightness, marker.contrast),
                left,
                top,
              } as CSSProperties}
              title={marker.title}
              type="button"
            >
              <MapMarkerIcon type={marker.type} />
            </button>
          ))}
          {draftMarkerScreenPreview ? (
            <div
              aria-hidden="true"
              className={`map-marker map-marker-draft map-marker--${getMapMarkerTypeClassName(draftMarkerScreenPreview.type)}`}
              style={{
                "--marker-scale": String(Math.max(0.25, (draftMarkerScreenPreview.size ?? 100) / 100)),
                color: getZoneColorPreset(draftMarkerScreenPreview.colorKey).marker,
                filter: getMapStyleFilter(draftMarkerScreenPreview.brightness, draftMarkerScreenPreview.contrast),
                left: draftMarkerScreenPreview.left,
                top: draftMarkerScreenPreview.top,
              } as CSSProperties}
            >
              <MapMarkerIcon type={draftMarkerScreenPreview.type} />
            </div>
          ) : null}
        </div>
        {selectedMarkerPopover ? (
          <article
            className="map-marker-popover"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              left: selectedMarkerPopover.left,
              top: selectedMarkerPopover.top,
            }}
          >
            <div className="map-marker-popover-head">
              <strong>{selectedMarkerPopover.marker.title}</strong>
              <button aria-label="Закрыть" onClick={onMarkerClear} type="button">
                ×
              </button>
            </div>
            <dl className="map-marker-popover-details">
              <div>
                <dt>Значок</dt>
                <dd>{getMapMarkerTypeLabel(selectedMarkerPopover.marker.type)}</dd>
              </div>
              <div>
                <dt>Слой</dt>
                <dd>{selectedMarkerPopover.marker.layer}</dd>
              </div>
              <div>
                <dt>Цвет</dt>
                <dd>{getZoneColorPreset(selectedMarkerPopover.marker.colorKey).label}</dd>
              </div>
              <div>
                <dt>Координаты</dt>
                <dd>
                  X: {selectedMarkerPopover.marker.x} Y: {selectedMarkerPopover.marker.y}
                </dd>
              </div>
              <div>
                <dt>Оформление</dt>
                <dd>
                  Яркость: {selectedMarkerPopover.marker.brightness} / Контрастность: {selectedMarkerPopover.marker.contrast}
                </dd>
              </div>
              <div>
                <dt>Размер</dt>
                <dd>{selectedMarkerPopover.marker.size ?? 100}</dd>
              </div>
            </dl>
            {selectedMarkerPopover.marker.description ? (
              <p className="map-marker-popover-description">{selectedMarkerPopover.marker.description}</p>
            ) : null}
            <div className="map-marker-popover-actions">
              <button className="command-row interactive-button" onClick={() => onMarkerEdit?.(selectedMarkerPopover.marker)} type="button">
                Изменить
              </button>
              <button className="primary-command interactive-button" onClick={() => onMarkerDelete?.(selectedMarkerPopover.marker)} type="button">
                Удалить
              </button>
            </div>
          </article>
        ) : null}
        {selectedZonePopover ? (
          <article
            className="map-marker-popover"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              left: selectedZonePopover.left,
              top: selectedZonePopover.top,
            }}
          >
            <div className="map-marker-popover-head">
              <strong>{selectedZonePopover.zone.title}</strong>
              <button aria-label="Закрыть" onClick={onSelectionClear} type="button">
                ×
              </button>
            </div>
            <dl className="map-marker-popover-details">
              <div>
                <dt>Слой</dt>
                <dd>{selectedZonePopover.zone.layer}</dd>
              </div>
              <div>
                <dt>Форма</dt>
                <dd>{getMapZoneShapeLabel(selectedZonePopover.zone.shape)}</dd>
              </div>
              <div>
                <dt>Цвет</dt>
                <dd>{getZoneColorPreset(selectedZonePopover.zone.colorKey).label}</dd>
              </div>
              <div>
                <dt>Формат</dt>
                <dd>{getFillPatternPreset(selectedZonePopover.zone.patternKey).label}</dd>
              </div>
              <div>
                <dt>Центр</dt>
                <dd>
                  X: {selectedZonePopover.zone.centerX} Y: {selectedZonePopover.zone.centerY}
                </dd>
              </div>
              {selectedZonePopover.zone.shape === "polygon" ? (
                <div>
                  <dt>Точки</dt>
                  <dd>{selectedZonePopover.zone.points.length}</dd>
                </div>
              ) : (
                <div>
                  <dt>Радиус</dt>
                  <dd>{selectedZonePopover.zone.radius}</dd>
                </div>
              )}
              <div>
                <dt>Оформление</dt>
                <dd>
                  Яркость: {selectedZonePopover.zone.brightness} / Контрастность: {selectedZonePopover.zone.contrast}
                </dd>
              </div>
            </dl>
            {selectedZonePopover.zone.description ? (
              <p className="map-marker-popover-description">{selectedZonePopover.zone.description}</p>
            ) : null}
            <div className="map-marker-popover-actions">
              <button className="command-row interactive-button" onClick={() => onZoneEdit?.(selectedZonePopover.zone)} type="button">
                Изменить
              </button>
              <button className="primary-command interactive-button" onClick={() => onZoneDelete?.(selectedZonePopover.zone)} type="button">
                Удалить
              </button>
            </div>
          </article>
        ) : null}
        {selectedRoutePopover ? (
          <article
            className="map-marker-popover"
            onClick={(event) => event.stopPropagation()}
            onDoubleClick={(event) => event.stopPropagation()}
            onPointerDown={(event) => event.stopPropagation()}
            style={{
              left: selectedRoutePopover.left,
              top: selectedRoutePopover.top,
            }}
          >
            <div className="map-marker-popover-head">
              <strong>{selectedRoutePopover.route.title}</strong>
              <button aria-label="Закрыть" onClick={onSelectionClear} type="button">
                ×
              </button>
            </div>
            <dl className="map-marker-popover-details">
              <div>
                <dt>Слой</dt>
                <dd>{selectedRoutePopover.route.layer}</dd>
              </div>
              <div>
                <dt>Цвет</dt>
                <dd>{getRouteColorPreset(selectedRoutePopover.route.colorKey).label}</dd>
              </div>
              <div>
                <dt>Линия</dt>
                <dd>{getLinePatternPreset(selectedRoutePopover.route.linePattern).label}</dd>
              </div>
              <div>
                <dt>Оформление</dt>
                <dd>
                  Яркость: {selectedRoutePopover.route.brightness} / Контрастность: {selectedRoutePopover.route.contrast}
                </dd>
              </div>
              <div>
                <dt>Точки</dt>
                <dd>{selectedRoutePopover.route.points.length}</dd>
              </div>
            </dl>
            {selectedRoutePopover.route.description ? (
              <p className="map-marker-popover-description">{selectedRoutePopover.route.description}</p>
            ) : null}
            <div className="map-marker-popover-actions">
              <button className="command-row interactive-button" onClick={() => onRouteEdit?.(selectedRoutePopover.route)} type="button">
                Изменить
              </button>
              <button className="primary-command interactive-button" onClick={() => onRouteDelete?.(selectedRoutePopover.route)} type="button">
                Удалить
              </button>
            </div>
          </article>
        ) : null}
      </div>
    </section>
  );
}
