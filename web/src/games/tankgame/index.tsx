import { For, Show, createEffect, createMemo, createSignal, onCleanup, onSettled } from 'solid-js';
import {
  TANK_COLORS,
  TANK_WALLS,
  TANK_WORLD_HEIGHT,
  TANK_WORLD_WIDTH,
  type TankGameElimination,
  type TankGameHostView,
  type TankGamePlayerView,
} from '../../../../shared/games/tankgame';
import {
  secondsLeft,
  type MobileGameViewProps,
  type TvGameViewProps,
} from '../registry';
import './tankgame.css';

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * t;
}

function clockText(ms: number): string {
  const total = Math.ceil(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function useLiveTimeLeft(
  getTimeLeftMs: () => number | undefined,
  getPhase: () => string | undefined
): () => number {
  const [now, setNow] = createSignal(Date.now());
  let syncedAt = Date.now();
  let syncedLeft = 0;

  createEffect(
    () => getTimeLeftMs(),
    (ms) => {
      if (ms !== undefined) {
        syncedLeft = ms;
        syncedAt = Date.now();
        setNow(syncedAt);
      }
    }
  );

  const timer = setInterval(() => {
    if (getPhase() === 'PLAYING') setNow(Date.now());
  }, 500);
  onCleanup(() => clearInterval(timer));

  return () => {
    const base = getTimeLeftMs();
    if (base === undefined) return 0;
    if (getPhase() !== 'PLAYING') return base;
    return Math.max(0, syncedLeft - (now() - syncedAt));
  };
}

interface TankSnap {
  x: number;
  y: number;
  angle: number;
}

interface Snapshot {
  at: number;
  tanks: Map<string, TankSnap>;
  bullets: Map<number, { x: number; y: number }>;
}

function TankGameTvView(props: TvGameViewProps<TankGameHostView>) {
  const view = () => props.state.hostState;
  const liveTimeLeftMs = useLiveTimeLeft(() => view()?.timeLeftMs, () => view()?.phase);
  const playersById = createMemo(
    () => new Map(props.state.players.map((p) => [p.id, p.name]))
  );

  let canvas: HTMLCanvasElement | null = null;
  let prev: Snapshot | null = null;
  let curr: Snapshot | null = null;
  const blasts: { x: number; y: number; at: number }[] = [];

  createEffect(
    () => view(),
    (host) => {
      if (!host) return;
      const now = Date.now();
      const snap: Snapshot = {
        at: now,
        tanks: new Map(
          host.tanks
            .filter((t) => t.alive)
            .map((t) => [t.playerId, { x: t.x, y: t.y, angle: t.angle }])
        ),
        bullets: new Map(host.bullets.map((b) => [b.id, { x: b.x, y: b.y }])),
      };
      if (curr) {
        for (const [id, pos] of curr.tanks) {
          if (!snap.tanks.has(id)) blasts.push({ x: pos.x, y: pos.y, at: now });
        }
      }
      prev = curr;
      curr = snap;
    }
  );

  const nameOf = (playerId: string) => playersById().get(playerId) ?? 'Unknown';

  const elimText = (e: TankGameElimination) =>
    e.byPlayerId ? `${nameOf(e.byPlayerId)} destroyed ${nameOf(e.playerId)}` : `${nameOf(e.playerId)} left the battle`;

  function drawTankBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#0c0f12';
    ctx.fillRect(-19, -15, 38, 30);
    ctx.fillStyle = color;
    ctx.fillRect(-16, -12, 32, 24);
    ctx.fillStyle = '#0c0f12';
    ctx.fillRect(4, -3.5, 24, 7);
    ctx.restore();
  }

  function draw(): void {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx || !curr) return;
    const now = Date.now();
    const span = prev && curr.at > prev.at ? curr.at - prev.at : 0;
    const t = span > 1 ? clamp01((now - curr.at) / span) : 1;

    ctx.fillStyle = '#10161c';
    ctx.fillRect(0, 0, TANK_WORLD_WIDTH, TANK_WORLD_HEIGHT);

    ctx.fillStyle = '#31404d';
    for (const wall of TANK_WALLS) ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

    ctx.fillStyle = '#ffd54f';
    for (const [id, pos] of curr.bullets) {
      const p = prev?.bullets.get(id);
      const x = p ? lerp(p.x, pos.x, t) : pos.x;
      const y = p ? lerp(p.y, pos.y, t) : pos.y;
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    const host = view();
    if (host) {
      for (const tank of host.tanks) {
        if (!tank.alive) continue;
        const p = prev?.tanks.get(tank.playerId);
        const x = p ? lerp(p.x, tank.x, t) : tank.x;
        const y = p ? lerp(p.y, tank.y, t) : tank.y;
        const angle = p ? lerpAngle(p.angle, tank.angle, t) : tank.angle;
        drawTankBody(ctx, x, y, angle, TANK_COLORS[tank.colorIndex] ?? '#ffffff');
        ctx.fillStyle = 'rgba(255,255,255,0.88)';
        ctx.font = '600 16px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(nameOf(tank.playerId), x, y - 26);
      }
    }

    while (blasts.length > 0 && now - blasts[0].at > 600) blasts.shift();
    for (const blast of blasts) {
      const age = (now - blast.at) / 600;
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle = '#ff7043';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, 12 + 34 * age, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  onSettled(() => {
    let frame = requestAnimationFrame(function loop() {
      draw();
      frame = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(frame);
  });

  return (
    <div class="tk-tv">
      <div class="tk-stage">
        <canvas
          ref={(el) => (canvas = el)}
          width={TANK_WORLD_WIDTH}
          height={TANK_WORLD_HEIGHT}
        />
        <div class="tk-topbar">
          <span>{view()?.aliveCount ?? 0} tanks in play</span>
          <span class="tk-clock">{clockText(liveTimeLeftMs())}</span>
        </div>
        <div class="tk-feed">
          <For each={view()?.eliminations ?? []}>
            {(e) => <div class="tk-feed-row">{elimText(e)}</div>}
          </For>
        </div>
        <Show when={view()?.phase !== 'PLAYING'}>
          <div class="tk-countdown">
            <p class="tk-count-label">BATTLE STARTING</p>
            <p class="tk-count-num">{Math.max(1, secondsLeft(props.remainingMs))}</p>
          </div>
        </Show>
      </div>
      <div class="tk-tv-actions">
        <button class="btn btn-tv" onClick={props.endGame}>
          End Game
        </button>
      </div>
    </div>
  );
}

function TankGameMobileView(props: MobileGameViewProps<TankGamePlayerView>) {
  const view = () => props.state.playerState;
  const liveTimeLeftMs = useLiveTimeLeft(() => view()?.timeLeftMs, () => view()?.phase);
  const canPlay = createMemo(
    () =>
      view()?.participating === true &&
      view()?.alive === true &&
      view()?.phase === 'PLAYING'
  );
  const reloading = createMemo(() => (view()?.cooldownMs ?? 0) > 60);

  const [knob, setKnob] = createSignal<{ x: number; y: number } | null>(null);
  let stickBase: HTMLDivElement | null = null;
  let lastSent: { x: number; y: number } | null = null;
  let lastSentAt = 0;
  let pending: { x: number; y: number } | null = null;
  let flushTimer: ReturnType<typeof setTimeout> | undefined;

  const clearFlushTimer = () => {
    if (flushTimer !== undefined) {
      clearTimeout(flushTimer);
      flushTimer = undefined;
    }
  };

  onCleanup(clearFlushTimer);

  createEffect(
    () => canPlay(),
    (active) => {
      if (!active) {
        pending = null;
        clearFlushTimer();
        lastSent = null;
        setKnob(null);
      }
    }
  );

  const transmitInput = (x: number, y: number, now: number) => {
    const rx = Math.round(x * 1000) / 1000;
    const ry = Math.round(y * 1000) / 1000;
    lastSent = { x: rx, y: ry };
    lastSentAt = now;
    props.sendAction({ type: 'input', payload: { x: rx, y: ry } });
  };

  const sendInput = (x: number, y: number) => {
    const now = Date.now();
    const isZero = x === 0 && y === 0;

    if (isZero) {
      pending = null;
      clearFlushTimer();
      if (!lastSent || (lastSent.x === 0 && lastSent.y === 0)) return;
      transmitInput(0, 0, now);
      return;
    }

    const wasStopped = !lastSent || (lastSent.x === 0 && lastSent.y === 0);
    if (!wasStopped && lastSent && Math.hypot(x - lastSent.x, y - lastSent.y) < 0.16) {
      pending = null;
      clearFlushTimer();
      return;
    }

    const elapsed = now - lastSentAt;
    if (wasStopped || elapsed >= 75) {
      pending = null;
      clearFlushTimer();
      transmitInput(x, y, now);
      return;
    }

    pending = { x, y };
    if (flushTimer === undefined) {
      flushTimer = setTimeout(() => {
        flushTimer = undefined;
        const next = pending;
        pending = null;
        if (!next || !canPlay()) return;
        if (lastSent && Math.hypot(next.x - lastSent.x, next.y - lastSent.y) < 0.16) return;
        transmitInput(next.x, next.y, Date.now());
      }, 75 - elapsed);
    }
  };

  const stickVector = (e: PointerEvent): { x: number; y: number } => {
    if (!stickBase) return { x: 0, y: 0 };
    const rect = stickBase.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = rect.width / 2;
    let dx = (e.clientX - cx) / radius;
    let dy = (e.clientY - cy) / radius;
    const mag = Math.hypot(dx, dy);
    if (mag < 0.14) return { x: 0, y: 0 };
    if (mag > 1) {
      dx /= mag;
      dy /= mag;
    }
    return { x: dx, y: dy };
  };

  const onStickDown = (e: PointerEvent) => {
    if (!canPlay() || !stickBase) return;
    stickBase.setPointerCapture(e.pointerId);
    const v = stickVector(e);
    setKnob(v);
    sendInput(v.x, v.y);
  };

  const onStickMove = (e: PointerEvent) => {
    if (!knob()) return;
    const v = stickVector(e);
    setKnob(v);
    sendInput(v.x, v.y);
  };

  const onStickUp = () => {
    if (!knob()) return;
    setKnob(null);
    sendInput(0, 0);
  };

  const fire = () => {
    if (!canPlay() || reloading()) return;
    props.sendAction({ type: 'fire' });
  };

  const knobStyle = () => {
    const k = knob();
    if (!k) return undefined;
    return {
      transform: `translate(calc(-50% + ${(k.x * 46).toFixed(1)}px), calc(-50% + ${(k.y * 46).toFixed(1)}px))`,
    };
  };

  return (
    <div class="mobile-card tk-mobile">
      <div class="tk-mobile-head">
        <span class="tk-title">Tanks</span>
        <span class="tk-clock">{clockText(liveTimeLeftMs())}</span>
      </div>

      <Show when={view()?.phase !== 'PLAYING'}>
        <p class="tk-status">Battle starts in {Math.max(1, secondsLeft(props.remainingMs))}s</p>
      </Show>

      <Show when={view()?.phase === 'PLAYING' && view()?.participating === false}>
        <p class="tk-status">Joined mid-battle. You're spectating this round.</p>
      </Show>

      <Show
        when={view()?.phase === 'PLAYING' && view()?.participating === true && view()?.alive === false}
      >
        <div class="tk-dead">
          <p class="tk-dead-title">ELIMINATED</p>
          <p class="tk-dead-sub">Watch the rest of the battle on the TV.</p>
        </div>
      </Show>

      <Show when={canPlay()}>
        <p class="tk-hint">Drag the pad to drive. Your barrel aims where you move.</p>
        <div class="tk-controls">
          <div
            class="tk-stick"
            ref={(el) => (stickBase = el)}
            onPointerDown={onStickDown}
            onPointerMove={onStickMove}
            onPointerUp={onStickUp}
            onPointerCancel={onStickUp}
          >
            <div class="tk-stick-knob" style={knobStyle()} />
          </div>
          <button
            type="button"
            class={`tk-fire${reloading() ? ' reloading' : ''}`}
            onPointerDown={fire}
          >
            FIRE
          </button>
        </div>
      </Show>
    </div>
  );
}

export const tankGameUi = {
  id: 'tank-battle',
  name: 'Tanks',
  TvView: TankGameTvView,
  MobileView: TankGameMobileView,
};
