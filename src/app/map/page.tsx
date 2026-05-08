"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { PdaTopbar } from "@/components/layout/PdaTopbar";
import { MapMarkerIcon, TileMapViewer } from "@/components/map/TileMapViewer";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { createMapMarker, deleteMapMarker, fetchMapMarkers, updateMapMarker } from "@/lib/map-marker-api";
import {
  DEFAULT_MAP_LAYER,
  DEFAULT_MAP_MARKER_TYPE,
  getMapMarkerStatusLabel,
  getMapMarkerTypeLabel,
  mapMarkerStatusLabels,
  mapMarkerUiTypes,
  normalizeMapLayerName,
  normalizeMapMarkerType,
  type MapMarkerDto,
  type MapMarkerStatus,
  type MapMarkerUiType,
} from "@/lib/map-markers";

type MarkerFormDraft = {
  id?: string;
  title: string;
  type: MapMarkerUiType;
  status: MapMarkerStatus;
  layer: string;
  x: string;
  y: string;
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

const emptyDraft: MarkerFormDraft = {
  description: "",
  layer: DEFAULT_MAP_LAYER,
  status: "active",
  title: "",
  type: DEFAULT_MAP_MARKER_TYPE,
  x: "0",
  y: "0",
};

const markerStatuses = Object.keys(mapMarkerStatusLabels).filter((status) => status !== "archived") as MapMarkerStatus[];

function createDraftFromMarker(marker: MapMarkerDto): MarkerFormDraft {
  return {
    description: marker.description ?? "",
    id: marker.id,
    layer: marker.layer,
    status: marker.status,
    title: marker.title,
    type: normalizeMapMarkerType(marker.type),
    x: String(marker.x),
    y: String(marker.y),
  };
}

function createDraftAtPoint(x: number, y: number): MarkerFormDraft {
  return {
    ...emptyDraft,
    x: String(x),
    y: String(y),
  };
}

function normalizeDraft(draft: MarkerFormDraft) {
  return {
    description: draft.description.trim(),
    layer: normalizeMapLayerName(draft.layer),
    status: draft.status,
    title: draft.title.trim(),
    type: draft.type,
    x: Number(draft.x),
    y: Number(draft.y),
  };
}

export default function MapPage() {
  const initialDraftRef = useRef<MarkerFormDraft | null>(null);
  const [markers, setMarkers] = useState<MapMarkerDto[]>([]);
  const [visibleLayerState, setVisibleLayerState] = useState<Record<string, boolean>>({});
  const [selectedMarkerId, setSelectedMarkerId] = useState<string | null>(null);
  const [isLoadingMarkers, setIsLoadingMarkers] = useState(true);
  const [isAddMode, setIsAddMode] = useState(false);
  const [markerError, setMarkerError] = useState("");
  const [formDraft, setFormDraft] = useState<MarkerFormDraft | null>(null);
  const [formMessage, setFormMessage] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadMarkers() {
      setIsLoadingMarkers(true);
      setMarkerError("");

      try {
        const nextMarkers = await fetchMapMarkers();

        if (!isCancelled) {
          setMarkers(nextMarkers);
        }
      } catch {
        if (!isCancelled) {
          setMarkerError("Не удалось загрузить метки.");
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingMarkers(false);
        }
      }
    }

    void loadMarkers();

    return () => {
      isCancelled = true;
    };
  }, []);

  const layers = useMemo(() => {
    return Array.from(new Set(markers.map((marker) => marker.layer))).sort((firstLayer, secondLayer) =>
      firstLayer.localeCompare(secondLayer, "ru"),
    );
  }, [markers]);

  const visibleLayers = useMemo(() => {
    return layers.filter((layer) => visibleLayerState[layer] !== false);
  }, [layers, visibleLayerState]);

  const selectedMarker = useMemo(() => {
    return markers.find((marker) => marker.id === selectedMarkerId) ?? null;
  }, [markers, selectedMarkerId]);

  const visibleMarkers = useMemo(() => {
    const layerSet = new Set(visibleLayers);
    return markers.filter((marker) => layerSet.has(marker.layer));
  }, [markers, visibleLayers]);

  function updateDraft<K extends keyof MarkerFormDraft>(field: K, value: MarkerFormDraft[K]) {
    setFormDraft((currentDraft) => (currentDraft ? { ...currentDraft, [field]: value } : currentDraft));
  }

  function openCreateForm(x: number, y: number) {
    const nextDraft = createDraftAtPoint(x, y);
    initialDraftRef.current = nextDraft;
    setFormDraft(nextDraft);
    setFormMessage("");
  }

  function openEditForm(marker: MapMarkerDto) {
    const nextDraft = createDraftFromMarker(marker);
    initialDraftRef.current = nextDraft;
    setFormDraft(nextDraft);
    setFormMessage("");
  }

  function closeForm() {
    setFormDraft(null);
    setFormMessage("");
    initialDraftRef.current = null;
  }

  function requestCloseForm() {
    if (!formDraft) {
      return;
    }

    const isDirty = JSON.stringify(formDraft) !== JSON.stringify(initialDraftRef.current);

    if (!isDirty) {
      closeForm();
      return;
    }

    setConfirmDialog({
      cancelLabel: "Остаться",
      confirmLabel: "Закрыть",
      message: "Вы уверены, что хотите закрыть окно?",
      onConfirm: () => {
        closeForm();
        setConfirmDialog(null);
      },
      title: "Закрыть окно?",
      variant: "warning",
    });
  }

  function handleMapClick(x: number, y: number) {
    if (!isAddMode) {
      return;
    }

    setIsAddMode(false);
    openCreateForm(x, y);
  }

  async function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!formDraft) {
      return;
    }

    const payload = normalizeDraft(formDraft);

    if (!payload.title) {
      setFormMessage("Укажите название метки.");
      return;
    }

    setIsSaving(true);
    setFormMessage("");

    try {
      if (formDraft.id) {
        const updatedMarker = await updateMapMarker(formDraft.id, payload);
        setMarkers((currentMarkers) =>
          currentMarkers.map((marker) => (marker.id === updatedMarker.id ? updatedMarker : marker)),
        );
        setSelectedMarkerId(updatedMarker.id);
      } else {
        const createdMarker = await createMapMarker(payload);
        setMarkers((currentMarkers) => [...currentMarkers, createdMarker]);
        setSelectedMarkerId(createdMarker.id);
        setIsAddMode(false);
      }

      closeForm();
    } catch (error) {
      setFormMessage(error instanceof Error ? error.message : "Не удалось сохранить метку.");
    } finally {
      setIsSaving(false);
    }
  }

  function archiveSelectedMarker() {
    if (!selectedMarker) {
      return;
    }

    setConfirmDialog({
      cancelLabel: "Отмена",
      confirmLabel: "В архив",
      message: "Переместить метку в архив?",
      onConfirm: async () => {
        setConfirmDialog((currentDialog) => (currentDialog ? { ...currentDialog, loading: true } : currentDialog));

        try {
          const archivedMarker = await deleteMapMarker(selectedMarker.id);
          setMarkers((currentMarkers) => currentMarkers.filter((marker) => marker.id !== archivedMarker.id));
          setSelectedMarkerId(null);
          setConfirmDialog(null);
        } catch {
          setConfirmDialog(null);
          setMarkerError("Не удалось переместить метку в архив.");
        }
      },
      title: "Архив метки",
      variant: "danger",
    });
  }

  function toggleLayer(layer: string) {
    setVisibleLayerState((currentState) => ({
      ...currentState,
      [layer]: currentState[layer] === false,
    }));
  }

  return (
    <main className="pda-page map-page-shell">
      <section className="pda-screen map-page-screen">
        <PdaTopbar activeLabel="Карта" />

        <div className="pda-content map-page-content">
          <div className="map-page-layout">
            <div className="map-work-area">
              <TileMapViewer
                isPickingPoint={isAddMode}
                markers={visibleMarkers}
                onMapClick={handleMapClick}
                onMarkerSelect={(marker) => {
                  setSelectedMarkerId(marker.id);
                  setIsAddMode(false);
                }}
                selectedMarkerId={selectedMarkerId ?? undefined}
                visibleLayers={visibleLayers}
              />
              <aside className="map-side-panel">
                <div className="map-side-panel-head">
                  <h1>Метки</h1>
                  <button
                    className={`primary-command interactive-button ${isAddMode ? "map-command-active" : ""}`}
                    onClick={() => {
                      setSelectedMarkerId(null);
                      setIsAddMode(true);
                    }}
                    type="button"
                  >
                    Добавить метку
                  </button>
                </div>

                {isAddMode ? (
                  <section className="map-panel-section map-panel-section-emphasis">
                    <p className="map-panel-message map-panel-message-strong">Выберите точку на карте.</p>
                    <button className="command-row interactive-button map-panel-secondary-action" onClick={() => setIsAddMode(false)} type="button">
                      Отмена
                    </button>
                  </section>
                ) : null}

                {isLoadingMarkers ? <p className="map-panel-message">Загрузка меток...</p> : null}
                {!isLoadingMarkers && markerError ? <p className="map-panel-message map-panel-message-danger">{markerError}</p> : null}

                <section className="map-panel-section">
                  <h2>Слои</h2>
                  {layers.length > 0 ? (
                    <div className="map-layer-list">
                      {layers.map((layer) => (
                        <label className="map-layer-row" key={layer}>
                          <input checked={visibleLayers.includes(layer)} onChange={() => toggleLayer(layer)} type="checkbox" />
                          <span>{layer}</span>
                        </label>
                      ))}
                    </div>
                  ) : (
                    <p className="map-panel-message">Метки пока не добавлены.</p>
                  )}
                </section>

                <section className="map-panel-section map-panel-section-last">
                  <h2>Выбранная метка</h2>
                  {selectedMarker ? (
                    <article className="map-marker-card">
                      <strong>{selectedMarker.title}</strong>
                      <dl>
                        <div>
                          <dt>Тип</dt>
                          <dd className="map-marker-type-value">
                            <MapMarkerIcon type={selectedMarker.type} />
                            <span>{getMapMarkerTypeLabel(selectedMarker.type)}</span>
                          </dd>
                        </div>
                        <div>
                          <dt>Слой</dt>
                          <dd>{selectedMarker.layer}</dd>
                        </div>
                        <div>
                          <dt>Статус</dt>
                          <dd>{getMapMarkerStatusLabel(selectedMarker.status)}</dd>
                        </div>
                        <div>
                          <dt>Координаты</dt>
                          <dd>
                            X: {selectedMarker.x} Y: {selectedMarker.y}
                          </dd>
                        </div>
                      </dl>
                      {selectedMarker.description ? <p>{selectedMarker.description}</p> : null}
                      <div className="map-marker-card-actions">
                        <button className="command-row interactive-button" onClick={() => openEditForm(selectedMarker)} type="button">
                          Изменить
                        </button>
                        <button className="primary-command interactive-button" onClick={archiveSelectedMarker} type="button">
                          В архив
                        </button>
                      </div>
                    </article>
                  ) : (
                    <p className="map-panel-message">Выберите метку на карте.</p>
                  )}
                </section>
              </aside>
            </div>
          </div>
        </div>

        {formDraft ? (
          <div className="pda-modal-backdrop animate-fade-in" onMouseDown={requestCloseForm}>
            <form
              className="pda-modal map-marker-modal animate-modal-in"
              onMouseDown={(event) => event.stopPropagation()}
              onSubmit={handleFormSubmit}
            >
              <div className="section-header modal-header">
                <div className="min-w-0">
                  <h1>{formDraft.id ? "Изменить метку" : "Новая метка"}</h1>
                  <p>
                    X: {formDraft.x} Y: {formDraft.y}
                  </p>
                </div>
              </div>

              <div className="map-marker-form-grid">
                <label className="filter-field map-marker-form-wide">
                  <span>Название</span>
                  <input
                    disabled={isSaving}
                    maxLength={80}
                    onChange={(event) => updateDraft("title", event.target.value)}
                    type="text"
                    value={formDraft.title}
                  />
                </label>

                <label className="filter-field">
                  <span>Тип</span>
                  <select
                    disabled={isSaving}
                    onChange={(event) => updateDraft("type", event.target.value as MapMarkerUiType)}
                    value={formDraft.type}
                  >
                    {mapMarkerUiTypes.map((type) => (
                      <option key={type} value={type}>
                        {getMapMarkerTypeLabel(type)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="filter-field">
                  <span>Статус</span>
                  <select
                    disabled={isSaving}
                    onChange={(event) => updateDraft("status", event.target.value as MapMarkerStatus)}
                    value={formDraft.status}
                  >
                    {markerStatuses.map((status) => (
                      <option key={status} value={status}>
                        {getMapMarkerStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="filter-field map-marker-form-wide">
                  <span>Слой</span>
                  <input
                    disabled={isSaving}
                    onChange={(event) => updateDraft("layer", event.target.value)}
                    type="text"
                    value={formDraft.layer}
                  />
                </label>

                <label className="filter-field">
                  <span>Координаты X</span>
                  <input
                    disabled={isSaving}
                    min={0}
                    onChange={(event) => updateDraft("x", event.target.value)}
                    type="number"
                    value={formDraft.x}
                  />
                </label>

                <label className="filter-field">
                  <span>Координаты Y</span>
                  <input
                    disabled={isSaving}
                    min={0}
                    onChange={(event) => updateDraft("y", event.target.value)}
                    type="number"
                    value={formDraft.y}
                  />
                </label>

                <label className="filter-field map-marker-form-wide">
                  <span>Описание</span>
                  <textarea
                    disabled={isSaving}
                    maxLength={1000}
                    onChange={(event) => updateDraft("description", event.target.value)}
                    rows={4}
                    value={formDraft.description}
                  />
                </label>
              </div>

              {formMessage ? <p className="draft-message">{formMessage}</p> : null}

              <div className="modal-actions">
                <button className="command-row interactive-button" disabled={isSaving} onClick={requestCloseForm} type="button">
                  Отмена
                </button>
                <button className="primary-command interactive-button" disabled={isSaving} type="submit">
                  {isSaving ? "Сохранение..." : "Сохранить"}
                </button>
              </div>
            </form>
          </div>
        ) : null}

        {confirmDialog ? (
          <ConfirmDialog
            cancelLabel={confirmDialog.cancelLabel}
            confirmLabel={confirmDialog.confirmLabel}
            loading={confirmDialog.loading || isSaving}
            message={confirmDialog.message}
            onCancel={() => setConfirmDialog(null)}
            onConfirm={confirmDialog.onConfirm}
            title={confirmDialog.title}
            variant={confirmDialog.variant}
            confirmTone={confirmDialog.confirmTone}
          />
        ) : null}
      </section>
    </main>
  );
}
