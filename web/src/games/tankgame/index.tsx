import { For, Show, createEffect, createMemo, createSignal, onCleanup } from 'solid-js';
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
  type GameUiDefinition,
  type MobileGameViewProps,
  type TvGameViewProps,
} from '../registry';
import './tankgame.css';

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
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

interface RenderedTank {
  x: number;
  y: number;
  angle: number;
}

interface RenderedBullet {
  x: number;
  y: number;
}

function TankGameTvView(props: TvGameViewProps<TankGameHostView>) {
  const view = () => props.state.hostState;
  const liveTimeLeftMs = useLiveTimeLeft(() => view()?.timeLeftMs, () => view()?.phase);
  const playersById = createMemo(
    () => new Map(props.state.players.map((p) => [p.id, p.name]))
  );

  let canvas: HTMLCanvasElement | null = null;
  let ctx2d: CanvasRenderingContext2D | null = null;
  let themeColors: {
    surface: string;
    ink: string;
    text: string;
    accent: string;
    peach: string;
  } | null = null;

  let snapshotAt = 0;
  let lastFrameTs = 0;
  const renderedTanks = new Map<string, RenderedTank>();
  const renderedBullets = new Map<number, RenderedBullet>();
  let aliveIds = new Set<string>();
  const blasts: { x: number; y: number; at: number }[] = [];

  function getCanvasCtx(): CanvasRenderingContext2D | null {
    if (!canvas) return null;
    if (!ctx2d) {
      ctx2d = canvas.getContext('2d', { alpha: false });
    }
    return ctx2d;
  }

  function getThemeColors(el: HTMLCanvasElement) {
    if (!themeColors) {
      const s = getComputedStyle(el);
      themeColors = {
        surface: s.getPropertyValue('--surface').trim() || '#690707',
        ink: s.getPropertyValue('--ink').trim() || '#1a0505',
        text: s.getPropertyValue('--text').trim() || '#fbeee6',
        accent: s.getPropertyValue('--accent').trim() || '#dba952',
        peach: s.getPropertyValue('--peach').trim() || '#fac8a2',
      };
    }
    return themeColors;
  }

  createEffect(
    () => view(),
    (host) => {
      if (!host) return;
      const now = performance.now();
      snapshotAt = now;

      const nextAlive = new Set<string>();
      for (const tank of host.tanks) {
        if (tank.alive) nextAlive.add(tank.playerId);
      }

      for (const id of aliveIds) {
        if (!nextAlive.has(id)) {
          const prevRender = renderedTanks.get(id);
          const serverTank = host.tanks.find((t) => t.playerId === id);
          const bx = prevRender?.x ?? serverTank?.x;
          const by = prevRender?.y ?? serverTank?.y;
          if (bx !== undefined && by !== undefined) {
            blasts.push({ x: bx, y: by, at: now });
          }
          renderedTanks.delete(id);
        }
      }
      aliveIds = nextAlive;

      for (const id of renderedTanks.keys()) {
        if (!nextAlive.has(id)) renderedTanks.delete(id);
      }

      const activeBulletIds = new Set(host.bullets.map((b) => b.id));
      for (const id of renderedBullets.keys()) {
        if (!activeBulletIds.has(id)) renderedBullets.delete(id);
      }

      if (host.phase === 'COUNTDOWN') {
        draw(now);
      }
    }
  );

  const nameOf = (playerId: string) => playersById().get(playerId) ?? 'Unknown';

  const elimText = (e: TankGameElimination) =>
    e.byPlayerId
      ? `${nameOf(e.byPlayerId)} destroyed ${nameOf(e.playerId)}`
      : `${nameOf(e.playerId)} left the battle`;

  function drawTankBody(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    angle: number,
    color: string,
    outlineColor: string
  ): void {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = outlineColor;
    ctx.fillRect(-19, -15, 38, 30);
    ctx.fillStyle = color;
    ctx.fillRect(-16, -12, 32, 24);
    ctx.fillStyle = outlineColor;
    ctx.fillRect(4, -3.5, 24, 7);
    ctx.restore();
  }

  function draw(ts: number): void {
    const ctx = getCanvasCtx();
    const host = view();
    if (!canvas || !ctx || !host) return;
    const theme = getThemeColors(canvas);

    const dtSec = lastFrameTs > 0 ? Math.min(0.05, Math.max(0, (ts - lastFrameTs) / 1000)) : 0;
    lastFrameTs = ts;
    const ageSec = snapshotAt > 0 ? Math.min(0.12, Math.max(0, (ts - snapshotAt) / 1000)) : 0;
    const alpha = dtSec > 0 ? 1 - Math.exp(-18 * dtSec) : 1;

    ctx.fillStyle = theme.surface;
    ctx.fillRect(0, 0, TANK_WORLD_WIDTH, TANK_WORLD_HEIGHT);

    ctx.fillStyle = theme.accent;
    for (const wall of TANK_WALLS) ctx.fillRect(wall.x, wall.y, wall.w, wall.h);

    ctx.fillStyle = theme.peach;
    for (const bullet of host.bullets) {
      const targetX = clamp(bullet.x + bullet.vx * ageSec, 16, TANK_WORLD_WIDTH - 16);
      const targetY = clamp(bullet.y + bullet.vy * ageSec, 16, TANK_WORLD_HEIGHT - 16);
      let rb = renderedBullets.get(bullet.id);
      if (!rb) {
        rb = { x: targetX, y: targetY };
        renderedBullets.set(bullet.id, rb);
      } else {
        const nextX = clamp(rb.x + bullet.vx * dtSec, 16, TANK_WORLD_WIDTH - 16);
        const nextY = clamp(rb.y + bullet.vy * dtSec, 16, TANK_WORLD_HEIGHT - 16);
        if (Math.hypot(targetX - nextX, targetY - nextY) > 120) {
          rb.x = targetX;
          rb.y = targetY;
        } else {
          rb.x = clamp(lerp(nextX, targetX, alpha), 16, TANK_WORLD_WIDTH - 16);
          rb.y = clamp(lerp(nextY, targetY, alpha), 16, TANK_WORLD_HEIGHT - 16);
        }
      }
      ctx.beginPath();
      ctx.arc(rb.x, rb.y, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.font = '600 16px system-ui, sans-serif';
    ctx.textAlign = 'center';

    for (const tank of host.tanks) {
      if (!tank.alive) continue;
      const targetX = clamp(tank.x + tank.vx * ageSec, 16, TANK_WORLD_WIDTH - 16);
      const targetY = clamp(tank.y + tank.vy * ageSec, 16, TANK_WORLD_HEIGHT - 16);
      let rt = renderedTanks.get(tank.playerId);
      if (!rt) {
        rt = { x: targetX, y: targetY, angle: tank.angle };
        renderedTanks.set(tank.playerId, rt);
      } else {
        const nextX = clamp(rt.x + tank.vx * dtSec, 16, TANK_WORLD_WIDTH - 16);
        const nextY = clamp(rt.y + tank.vy * dtSec, 16, TANK_WORLD_HEIGHT - 16);
        if (Math.hypot(targetX - nextX, targetY - nextY) > 120) {
          rt.x = targetX;
          rt.y = targetY;
          rt.angle = tank.angle;
        } else {
          rt.x = clamp(lerp(nextX, targetX, alpha), 16, TANK_WORLD_WIDTH - 16);
          rt.y = clamp(lerp(nextY, targetY, alpha), 16, TANK_WORLD_HEIGHT - 16);
          rt.angle = lerpAngle(rt.angle, tank.angle, alpha);
        }
      }
      drawTankBody(ctx, rt.x, rt.y, rt.angle, TANK_COLORS[tank.colorIndex] ?? '#ffffff', theme.ink);
      ctx.fillStyle = theme.accent;
      ctx.fillText(nameOf(tank.playerId), rt.x, rt.y - 26);
    }

    while (blasts.length > 0 && ts - blasts[0].at > 600) blasts.shift();
    for (const blast of blasts) {
      const age = clamp((ts - blast.at) / 600, 0, 1);
      ctx.globalAlpha = 1 - age;
      ctx.strokeStyle = theme.peach;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(blast.x, blast.y, 12 + 34 * age, 0, Math.PI * 2);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }

  createEffect(
    () => {
      const phase = view()?.phase;
      return phase === 'PLAYING' || phase === 'ENDING';
    },
    (active) => {
      if (!active) {
        lastFrameTs = 0;
        return;
      }
      lastFrameTs = 0;
      let frame = requestAnimationFrame(function loop(ts) {
        draw(ts);
        frame = requestAnimationFrame(loop);
      });
      onCleanup(() => cancelAnimationFrame(frame));
    }
  );

  return (
    <div class="tk-tv">
      <div class="tk-topbar">
        <span>{view()?.aliveCount ?? 0} tanks in play</span>
        <Show when={view()?.phase === 'COUNTDOWN'}>
          <span class="tk-countdown">
            BATTLE STARTING <strong class="tk-count-num">{Math.max(1, secondsLeft(props.remainingMs))}</strong>
          </span>
        </Show>
        <Show when={view()?.phase === 'ENDING'}>
          <span class="tk-countdown">
            {view()?.winnerId ? `WINNER: ${nameOf(view()!.winnerId!)}` : 'DRAW'}
          </span>
        </Show>
        <span class="tk-clock">{clockText(liveTimeLeftMs())}</span>
      </div>
      <div class="tk-stage">
        <canvas
          ref={(el) => {
            canvas = el;
            ctx2d = null;
          }}
          width={TANK_WORLD_WIDTH}
          height={TANK_WORLD_HEIGHT}
        />
        <div class="tk-feed">
          <For each={view()?.eliminations ?? []}>
            {(e) => <div class="tk-feed-row">{elimText(e)}</div>}
          </For>
        </div>
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

      <Show when={view()?.phase === 'COUNTDOWN'}>
        <p class="tk-status">Battle starts in {Math.max(1, secondsLeft(props.remainingMs))}s</p>
      </Show>

      <Show when={view()?.phase === 'ENDING'}>
        <p class="tk-status">{view()?.alive ? 'Victory!' : 'Battle over'}</p>
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

export const tankGameUi: GameUiDefinition<TankGameHostView, TankGamePlayerView> = {
  id: 'tank-battle',
  name: 'Tanks',
  TvView: TankGameTvView,
  MobileView: TankGameMobileView,
};
