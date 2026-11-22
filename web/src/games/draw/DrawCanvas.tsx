import { For, createSignal, onSettled } from 'solid-js';

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 300;
const SYNC_INTERVAL_MS = 10_000;

const COLORS = [
  { id: 'black', hex: '#18181b' },
  { id: 'red', hex: '#ef4444' },
  { id: 'amber', hex: '#f59e0b' },
  { id: 'green', hex: '#10b981' },
  { id: 'blue', hex: '#3b82f6' },
  { id: 'purple', hex: '#8b5cf6' },
  { id: 'eraser', hex: '#ffffff' },
];

const SIZES = [
  { label: 'S', size: 3 },
  { label: 'M', size: 7 },
  { label: 'L', size: 14 },
];

interface DrawCanvasProps {
  onSync: (imageData: string) => void;
  onSubmit: (imageData: string) => void;
}

export function DrawCanvas(props: DrawCanvasProps) {
  const [color, setColor] = createSignal(COLORS[0].hex);
  const [brushSize, setBrushSize] = createSignal(SIZES[1].size);

  let canvasEl: HTMLCanvasElement | undefined;
  let drawing = false;
  let dirty = false;
  let lastX = 0;
  let lastY = 0;

  const fillWhite = () => {
    const ctx = canvasEl?.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);
  };

  const exportImage = (): string => {
    if (!canvasEl) return '';
    return canvasEl.toDataURL('image/jpeg', 0.65);
  };

  onSettled(() => {
    fillWhite();
    const timer = window.setInterval(() => {
      if (!dirty) return;
      dirty = false;
      const data = exportImage();
      if (data) props.onSync(data);
    }, SYNC_INTERVAL_MS);

    return () => {
      window.clearInterval(timer);
    };
  });

  const getPoint = (e: PointerEvent): { x: number; y: number } => {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_WIDTH,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_HEIGHT,
    };
  };

  const handlePointerDown = (e: PointerEvent) => {
    if (!canvasEl) return;
    canvasEl.setPointerCapture(e.pointerId);
    const pt = getPoint(e);
    drawing = true;
    dirty = true;
    lastX = pt.x;
    lastY = pt.y;

    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = color();
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, brushSize() / 2, 0, Math.PI * 2);
    ctx.fill();
  };

  const handlePointerMove = (e: PointerEvent) => {
    if (!drawing || !canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;
    const pt = getPoint(e);
    ctx.strokeStyle = color();
    ctx.lineWidth = brushSize();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pt.x, pt.y);
    ctx.stroke();
    lastX = pt.x;
    lastY = pt.y;
    dirty = true;
  };

  const handlePointerUp = () => {
    drawing = false;
  };

  const handleClear = () => {
    fillWhite();
    dirty = true;
  };

  const handleSubmit = () => {
    dirty = false;
    props.onSubmit(exportImage());
  };

  return (
    <div class="draw-canvas-wrap">
      <canvas
        ref={(el) => (canvasEl = el)}
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        class="draw-canvas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      <div class="draw-tools-row">
        <div class="draw-swatches">
          <For each={COLORS}>
            {(c) => (
              <button
                type="button"
                class={`draw-swatch ${color() === c.hex ? 'active' : ''}`}
                style={{ background: c.hex }}
                aria-label={c.id}
                onClick={() => setColor(c.hex)}
              />
            )}
          </For>
        </div>

        <div class="draw-sizes">
          <For each={SIZES}>
            {(s) => (
              <button
                type="button"
                class={`draw-size-btn ${brushSize() === s.size ? 'active' : ''}`}
                onClick={() => setBrushSize(s.size)}
              >
                {s.label}
              </button>
            )}
          </For>
        </div>
      </div>

      <div class="draw-actions-row">
        <button type="button" class="btn" onClick={handleClear}>
          Clear
        </button>
        <button type="button" class="btn" onClick={handleSubmit}>
          Done
        </button>
      </div>
    </div>
  );
}
