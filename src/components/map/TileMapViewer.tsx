"use client";

import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getMapMarkerTypeClassName, normalizeMapMarkerType, type MapMarkerDto, type MapMarkerType } from "@/lib/map-markers";

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

type TileMapViewerProps = {
  markers?: MapMarkerDto[];
  visibleLayers?: string[];
  selectedMarkerId?: string;
  onMarkerSelect?: (marker: MapMarkerDto) => void;
  onMapClick?: (x: number, y: number) => void;
  isPickingPoint?: boolean;
};

const METADATA_URL = "/map/zone/metadata.json";
const MISSING_MAP_MESSAGE = "Карта не подготовлена. Сформируйте тайлы перед использованием.";
const ZOOM_STEP = 1.35;

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
  isPickingPoint = false,
  markers = [],
  onMapClick,
  onMarkerSelect,
  selectedMarkerId,
  visibleLayers = [],
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
    if (!metadata || !viewportRef.current || !onMapClick) {
      return;
    }

    if (hasDraggedRef.current) {
      hasDraggedRef.current = false;
      return;
    }

    const point = getSourcePoint(metadata, currentView, getViewportPoint(event.nativeEvent, viewportRef.current));

    if (point) {
      onMapClick(point.x, point.y);
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
        className={`map-viewer-viewport ${isPickingPoint ? "map-viewer-viewport-picking" : ""}`}
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
              style={{
                left,
                top,
              }}
              title={marker.title}
              type="button"
            >
              <MapMarkerIcon type={marker.type} />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
