import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
import type { GeoPoint } from '../../../../shared/games/geoguess';

export interface MapMarker {
  id: string;
  label?: string;
  color: string;
  point: GeoPoint;
}

interface TileMapProps {
  interactive?: boolean;
  markers?: MapMarker[];
  target?: GeoPoint | null;
  selectedPin?: GeoPoint | null;
  onSelectPin?: (point: GeoPoint) => void;
  fitAll?: boolean;
  class?: string;
}

const TILE_SIZE = 256;
const MIN_ZOOM = 1;
const MAX_ZOOM = 15;
const MAX_LAT = 85.0511;

function clampLat(lat: number): number {
  return Math.max(-MAX_LAT, Math.min(MAX_LAT, lat));
}

function normalizeLng(lng: number): number {
  let v = ((lng + 180) % 360 + 360) % 360 - 180;
  if (v === -180 && lng > 0) v = 180;
  return v;
}

function worldScale(zoom: number): number {
  return TILE_SIZE * Math.pow(2, zoom);
}

function lngToWorldX(lng: number, zoom: number): number {
  return ((lng + 180) / 360) * worldScale(zoom);
}

function latToWorldY(lat: number, zoom: number): number {
  const rad = (clampLat(lat) * Math.PI) / 180;
  const mercN = Math.log(Math.tan(Math.PI / 4 + rad / 2));
  return (0.5 - mercN / (2 * Math.PI)) * worldScale(zoom);
}

function worldXToLng(x: number, zoom: number): number {
  return normalizeLng((x / worldScale(zoom)) * 360 - 180);
}

function worldYToLat(y: number, zoom: number): number {
  const n = Math.PI - (2 * Math.PI * y) / worldScale(zoom);
  return clampLat((180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))));
}

function wrapTileX(x: number, zoom: number): number {
  const count = Math.pow(2, zoom);
  return ((x % count) + count) % count;
}

function tileUrl(z: number, x: number, y: number): string {
  const wrappedX = wrapTileX(x, z);
  return `https://tile.openstreetmap.org/${z}/${wrappedX}/${y}.png`;
}

function computeFittedView(
  points: GeoPoint[],
  width: number,
  height: number
): { center: GeoPoint; zoom: number } {
  if (points.length === 0) {
    return { center: { lat: 20, lng: 0 }, zoom: 2 };
  }
  if (points.length === 1) {
    return { center: points[0], zoom: 5 };
  }

  let minLat = 90;
  let maxLat = -90;
  let minLng = 180;
  let maxLng = -180;

  for (const p of points) {
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
  }

  const center: GeoPoint = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };

  const padW = Math.max(120, width - 96);
  const padH = Math.max(120, height - 96);

  for (let z = 12; z >= MIN_ZOOM; z--) {
    const x1 = lngToWorldX(minLng, z);
    const x2 = lngToWorldX(maxLng, z);
    const y1 = latToWorldY(maxLat, z);
    const y2 = latToWorldY(minLat, z);
    if (Math.abs(x2 - x1) <= padW && Math.abs(y2 - y1) <= padH) {
      return { center, zoom: z };
    }
  }

  return { center, zoom: MIN_ZOOM };
}

export function TileMap(props: TileMapProps) {
  const [containerEl, setContainerEl] = createSignal<HTMLDivElement | undefined>(undefined);
  const [size, setSize] = createSignal({ width: 360, height: 320 });
  const [center, setCenter] = createSignal<GeoPoint>({ lat: 25, lng: 10 });
  const [zoom, setZoom] = createSignal<number>(2);

  let dragging = false;
  let pointerId: number | null = null;
  let startX = 0;
  let startY = 0;
  let startCenterWorldX = 0;
  let startCenterWorldY = 0;
  let movedDistance = 0;

  const activePointers = new Map<number, { x: number; y: number }>();
  let pinching = false;
  let pinchStartDist = 0;
  let pinchStartZoom = 2;
  let pinchAnchor: GeoPoint | null = null;

  const updateSize = (el: HTMLDivElement) => {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      setSize({ width: rect.width, height: rect.height });
    }
  };

  createEffect(
    () => containerEl(),
    (el) => {
      if (!el) return;
      updateSize(el);
      const observer = new ResizeObserver(() => updateSize(el));
      observer.observe(el);
      onCleanup(() => observer.disconnect());
    }
  );

  createEffect(
    () => {
      if (!props.fitAll) return null;
      const pts: GeoPoint[] = [];
      if (props.target) pts.push(props.target);
      for (const m of props.markers ?? []) {
        pts.push(m.point);
      }
      if (pts.length === 0) return null;
      return computeFittedView(pts, size().width, size().height);
    },
    (fitted) => {
      if (!fitted) return;
      setCenter(fitted.center);
      setZoom(fitted.zoom);
    }
  );

  const viewMetrics = createMemo(() => {
    const z = zoom();
    const c = center();
    const s = size();
    const cx = lngToWorldX(c.lng, z);
    const cy = latToWorldY(c.lat, z);
    const left = cx - s.width / 2;
    const top = cy - s.height / 2;
    return { z, cx, cy, left, top, width: s.width, height: s.height };
  });

  const tiles = createMemo(() => {
    const m = viewMetrics();
    const tileZ = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, Math.floor(m.z)));
    const scale = Math.pow(2, m.z - tileZ);
    const tileDisplaySize = TILE_SIZE * scale;
    const maxTile = Math.pow(2, tileZ);
    const minTileX = Math.floor(m.left / tileDisplaySize);
    const maxTileX = Math.floor((m.left + m.width) / tileDisplaySize);
    const minTileY = Math.max(0, Math.floor(m.top / tileDisplaySize));
    const maxTileY = Math.min(maxTile - 1, Math.floor((m.top + m.height) / tileDisplaySize));

    const list: Array<{ key: string; url: string; left: number; top: number; size: number }> = [];
    for (let ty = minTileY; ty <= maxTileY; ty++) {
      for (let tx = minTileX; tx <= maxTileX; tx++) {
        list.push({
          key: `${tileZ}-${tx}-${ty}`,
          url: tileUrl(tileZ, tx, ty),
          left: tx * tileDisplaySize - m.left,
          top: ty * tileDisplaySize - m.top,
          size: tileDisplaySize + 0.5,
        });
      }
    }
    return list;
  });

  const project = (point: GeoPoint) => {
    const m = viewMetrics();
    const scale = worldScale(m.z);
    let x = lngToWorldX(point.lng, m.z) - m.left;
    if (x < -scale / 2) x += scale;
    if (x > m.width + scale / 2) x -= scale;
    const y = latToWorldY(point.lat, m.z) - m.top;
    return { x, y };
  };

  const clampZoom = (value: number): number => {
    return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value));
  };

  const changeZoom = (delta: number) => {
    setZoom((prev) => clampZoom(Math.round(prev + delta)));
  };

  const screenToGeo = (x: number, y: number): GeoPoint => {
    const m = viewMetrics();
    return {
      lat: worldYToLat(m.top + y, m.z),
      lng: worldXToLng(m.left + x, m.z),
    };
  };

  const beginPan = (id: number, x: number, y: number) => {
    dragging = true;
    pointerId = id;
    startX = x;
    startY = y;
    movedDistance = 0;
    const z = zoom();
    const c = center();
    startCenterWorldX = lngToWorldX(c.lng, z);
    startCenterWorldY = latToWorldY(c.lat, z);
  };

  const applyPinch = () => {
    const el = containerEl();
    if (!el || !pinchAnchor) return;
    const points = [...activePointers.values()];
    if (points.length < 2 || pinchStartDist <= 0) return;

    const [a, b] = points;
    const dist = Math.hypot(a.x - b.x, a.y - b.y);
    const nextZoom = clampZoom(pinchStartZoom + Math.log2(dist / pinchStartDist));

    const rect = el.getBoundingClientRect();
    const midX = (a.x + b.x) / 2 - rect.left;
    const midY = (a.y + b.y) / 2 - rect.top;
    const s = size();
    const centerWorldX = lngToWorldX(pinchAnchor.lng, nextZoom) - midX + s.width / 2;
    const centerWorldY = latToWorldY(pinchAnchor.lat, nextZoom) - midY + s.height / 2;

    setZoom(nextZoom);
    setCenter({
      lat: worldYToLat(centerWorldY, nextZoom),
      lng: worldXToLng(centerWorldX, nextZoom),
    });
  };

  const onPointerDown = (e: PointerEvent) => {
    const el = containerEl();
    if (!props.interactive || !el) return;
    if ((e.target as HTMLElement)?.closest('.geo-map-controls')) return;
    if (activePointers.size >= 2) return;

    activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture(e.pointerId);

    if (activePointers.size === 2) {
      const [a, b] = [...activePointers.values()];
      dragging = false;
      pointerId = null;
      pinching = true;
      pinchStartDist = Math.max(1, Math.hypot(a.x - b.x, a.y - b.y));
      pinchStartZoom = zoom();
      const rect = el.getBoundingClientRect();
      pinchAnchor = screenToGeo((a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top);
      return;
    }

    beginPan(e.pointerId, e.clientX, e.clientY);
  };

  const onPointerMove = (e: PointerEvent) => {
    const tracked = activePointers.get(e.pointerId);
    if (tracked) {
      tracked.x = e.clientX;
      tracked.y = e.clientY;
    }

    if (pinching) {
      applyPinch();
      return;
    }

    if (!dragging || e.pointerId !== pointerId) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    movedDistance = Math.max(movedDistance, Math.hypot(dx, dy));
    if (movedDistance < 4) return;

    const z = zoom();
    const nextLat = worldYToLat(startCenterWorldY - dy, z);
    const nextLng = worldXToLng(startCenterWorldX - dx, z);
    setCenter({ lat: nextLat, lng: nextLng });
  };

  const onPointerUp = (e: PointerEvent) => {
    const el = containerEl();
    if (!el) return;

    activePointers.delete(e.pointerId);
    if (el.hasPointerCapture(e.pointerId)) {
      el.releasePointerCapture(e.pointerId);
    }

    if (pinching) {
      if (activePointers.size < 2) {
        pinching = false;
        pinchAnchor = null;
        const [remainingId, remaining] = [...activePointers.entries()][0] ?? [];
        if (remainingId !== undefined && remaining) {
          beginPan(remainingId, remaining.x, remaining.y);
          movedDistance = 8;
          el.setPointerCapture(remainingId);
        }
      }
      return;
    }

    if (!dragging || e.pointerId !== pointerId) return;
    dragging = false;
    pointerId = null;

    if (movedDistance < 8 && props.onSelectPin) {
      const rect = el.getBoundingClientRect();
      const m = viewMetrics();
      const worldX = m.left + (e.clientX - rect.left);
      const worldY = m.top + (e.clientY - rect.top);
      props.onSelectPin({
        lat: worldYToLat(worldY, m.z),
        lng: worldXToLng(worldX, m.z),
      });
    }
  };

  const onWheel = (e: WheelEvent) => {
    if (!props.interactive) return;
    e.preventDefault();
    changeZoom(e.deltaY < 0 ? 1 : -1);
  };

  const targetScreen = createMemo(() => (props.target ? project(props.target) : null));
  const selectedScreen = createMemo(() =>
    props.selectedPin ? project(props.selectedPin) : null
  );

  return (
    <div
      ref={setContainerEl}
      class={`geo-map ${props.interactive ? 'is-interactive' : ''} ${props.class ?? ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onWheel={onWheel}
    >
      <div class="geo-map-tiles">
        <For each={tiles()}>
          {(tile) => (
            <img
              class="geo-map-tile"
              src={tile.url}
              alt=""
              draggable={false}
              style={{
                left: `${tile.left}px`,
                top: `${tile.top}px`,
                width: `${tile.size}px`,
                height: `${tile.size}px`,
              }}
            />
          )}
        </For>
      </div>

      <Show when={targetScreen() && (props.markers?.length ?? 0) > 0}>
        <svg class="geo-map-lines" viewBox={`0 0 ${size().width} ${size().height}`}>
          <For each={props.markers ?? []}>
            {(marker) => {
              const pos = () => project(marker.point);
              return (
                <line
                  x1={pos().x}
                  y1={pos().y}
                  x2={targetScreen()!.x}
                  y2={targetScreen()!.y}
                  stroke={marker.color}
                  stroke-width="3"
                  stroke-dasharray="6 5"
                />
              );
            }}
          </For>
        </svg>
      </Show>

      <For each={props.markers ?? []}>
        {(marker) => {
          const pos = () => project(marker.point);
          return (
            <div
              class="geo-pin"
              style={{
                left: `${pos().x}px`,
                top: `${pos().y}px`,
                '--pin-color': marker.color,
              }}
            >
              <div class="geo-pin-dot" />
              <Show when={marker.label}>
                <span class="geo-pin-label">{marker.label}</span>
              </Show>
            </div>
          );
        }}
      </For>

      <Show when={targetScreen()}>
        {(pos) => (
          <div
            class="geo-pin geo-pin-target"
            style={{
              left: `${pos().x}px`,
              top: `${pos().y}px`,
            }}
          >
            <div class="geo-pin-star">★</div>
            <span class="geo-pin-label geo-pin-target-label">SPOT</span>
          </div>
        )}
      </Show>

      <Show when={selectedScreen()}>
        {(pos) => (
          <div
            class="geo-pin geo-pin-selected"
            style={{
              left: `${pos().x}px`,
              top: `${pos().y}px`,
            }}
          >
            <div class="geo-pin-dot" />
          </div>
        )}
      </Show>

      <Show when={props.interactive}>
        <div class="geo-map-controls">
          <button
            type="button"
            class="geo-zoom-btn"
            aria-label="Zoom in"
            onClick={() => changeZoom(1)}
          >
            +
          </button>
          <button
            type="button"
            class="geo-zoom-btn"
            aria-label="Zoom out"
            onClick={() => changeZoom(-1)}
          >
            −
          </button>
        </div>
      </Show>

      <div class="geo-map-attribution">© OpenStreetMap</div>
    </div>
  );
}
