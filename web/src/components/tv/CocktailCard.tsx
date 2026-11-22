import { createMemo } from 'solid-js';
import type { PlayerSummary } from '../../../../shared/protocol';
import { getPlayerCocktail, type CocktailId } from '../../lib/cocktails';

interface CocktailCardProps {
  player: PlayerSummary;
}

function Sparkles(props: { coords: readonly [number, number][] }) {
  return (
    <>
      {props.coords.map(([x, y]) => (
        <path
          d={`M${x} ${y - 4} L${x + 1} ${y - 1} L${x + 4} ${y} L${x + 1} ${y + 1} L${x} ${y + 4} L${x - 1} ${y + 1} L${x - 4} ${y} L${x - 1} ${y - 1} Z`}
          fill="#c48a69"
        />
      ))}
    </>
  );
}

function MartiniStem(props: { liquid: string; rim?: string }) {
  return (
    <>
      <polygon points="22,28 98,28 60,72" fill="#f7f2ec" stroke="#e2d5c8" stroke-width="1.5" />
      <polygon points="27,31 93,31 60,68" fill={props.liquid} />
      {props.rim ? <line x1="27" y1="31" x2="93" y2="31" stroke={props.rim} stroke-width="2.5" /> : null}
      <rect x="58" y="70" width="4" height="36" fill="#f7f2ec" />
      <ellipse cx="60" cy="107" rx="22" ry="4" fill="#f7f2ec" />
    </>
  );
}

function LimeSlice(props: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={props.cx} cy={props.cy} r={props.r} fill="#76b82a" />
      <circle cx={props.cx} cy={props.cy} r={props.r * 0.8} fill="#d9ec9e" />
      <circle cx={props.cx} cy={props.cy} r={props.r * 0.68} fill="#9ed246" />
    </g>
  );
}

function OrangeSlice(props: { cx: number; cy: number; r: number }) {
  return (
    <g>
      <circle cx={props.cx} cy={props.cy} r={props.r} fill="#f08c1a" />
      <circle cx={props.cx} cy={props.cy} r={props.r * 0.8} fill="#fde2b8" />
      <circle cx={props.cx} cy={props.cy} r={props.r * 0.68} fill="#f7a831" />
    </g>
  );
}

const ILLUSTRATIONS = {
  'espresso-martini': () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <MartiniStem liquid="#382319" rim="#d9c0a3" />
      <ellipse cx="58" cy="31" rx="4.5" ry="2.8" fill="#5c3828" transform="rotate(-18 58 31)" />
      <ellipse cx="66" cy="31" rx="4.5" ry="2.8" fill="#4a2c1e" transform="rotate(14 66 31)" />
      <ellipse cx="38" cy="78" rx="4.5" ry="3" fill="#4a2c1e" transform="rotate(-30 38 78)" />
      <Sparkles coords={[[30, 18], [90, 56]]} />
    </svg>
  ),
  'long-island': () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <rect x="38" y="20" width="44" height="86" rx="5" fill="#f7f2ec" />
      <rect x="42" y="30" width="36" height="72" rx="3" fill="#c7651c" />
      <rect x="42" y="70" width="36" height="32" rx="3" fill="#732e12" opacity="0.65" />
      <rect x="47" y="42" width="13" height="13" rx="2" fill="#ffffff" opacity="0.32" transform="rotate(12 53 48)" />
      <rect x="61" y="56" width="13" height="13" rx="2" fill="#ffffff" opacity="0.32" transform="rotate(-10 67 62)" />
      <rect x="48" y="75" width="13" height="13" rx="2" fill="#ffffff" opacity="0.28" transform="rotate(6 54 81)" />
      <line x1="56" y1="96" x2="48" y2="8" stroke="#f7f2ec" stroke-width="4" stroke-linecap="round" />
      <LimeSlice cx={80} cy={28} r={10} />
      <LimeSlice cx={53} cy={48} r={8} />
      <Sparkles coords={[[26, 40], [94, 70]]} />
    </svg>
  ),
  'aperol-spritz': () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <path d="M36 22 Q34 62 60 66 Q86 62 84 22 Z" fill="#f7f2ec" />
      <path d="M39 30 Q38 60 60 63 Q82 60 81 30 Z" fill="#f26422" />
      <rect x="58" y="65" width="4" height="39" fill="#f7f2ec" />
      <ellipse cx="60" cy="105" rx="20" ry="4" fill="#f7f2ec" />
      <rect x="48" y="38" width="12" height="12" rx="2" fill="#ffffff" opacity="0.32" transform="rotate(14 54 44)" />
      <OrangeSlice cx={58} cy={48} r={9} />
      <OrangeSlice cx={32} cy={86} r={10} />
      <line x1="62" y1="54" x2="54" y2="10" stroke="#f7f2ec" stroke-width="3.5" stroke-linecap="round" />
      <Sparkles coords={[[28, 30], [92, 46]]} />
    </svg>
  ),
  negroni: () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <rect x="32" y="34" width="56" height="70" rx="5" fill="#f7f2ec" />
      <rect x="36" y="42" width="48" height="58" rx="3" fill="#d91e2a" />
      <rect x="43" y="54" width="18" height="18" rx="2.5" fill="#ffffff" opacity="0.28" transform="rotate(10 52 63)" />
      <rect x="57" y="70" width="18" height="18" rx="2.5" fill="#ffffff" opacity="0.28" transform="rotate(-12 66 79)" />
      <OrangeSlice cx={66} cy={68} r={10} />
      <path d="M34 38 C24 32, 24 20, 34 22 C40 24, 34 32, 28 30" fill="none" stroke="#f59e0b" stroke-width="3" stroke-linecap="round" />
      <Sparkles coords={[[26, 62], [95, 42]]} />
    </svg>
  ),
  'dirty-martini': () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <MartiniStem liquid="#e36d86" />
      <ellipse cx="42" cy="31" rx="5.5" ry="4" fill="#6b8e23" />
      <circle cx="44" cy="31" r="1.6" fill="#d9483b" />
      <ellipse cx="86" cy="54" rx="5" ry="3.8" fill="#6b8e23" transform="rotate(20 86 54)" />
      <circle cx="87" cy="54" r="1.5" fill="#d9483b" />
      <ellipse cx="36" cy="86" rx="5" ry="3.8" fill="#6b8e23" transform="rotate(-20 36 86)" />
      <Sparkles coords={[[30, 18], [92, 24]]} />
    </svg>
  ),
  'pina-colada': () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <path d="M40 20 C36 38, 44 46, 38 62 C34 74, 46 82, 60 82 C74 82, 86 74, 82 62 C76 46, 84 38, 80 20 Z" fill="#f7f2ec" />
      <path d="M43 28 C40 42, 47 48, 42 62 C39 72, 48 78, 60 78 C72 78, 81 72, 78 62 C73 48, 80 42, 77 28 Z" fill="#f4eb9c" />
      <rect x="57" y="81" width="6" height="22" fill="#f7f2ec" />
      <ellipse cx="60" cy="104" rx="20" ry="4" fill="#f7f2ec" />
      <rect x="50" y="54" width="12" height="12" rx="2" fill="#ffffff" opacity="0.4" transform="rotate(14 56 60)" />
      <circle cx="77" cy="22" r="5" fill="#d91e2a" />
      <path d="M77 17 Q81 11 85 13" fill="none" stroke="#4f772d" stroke-width="1.8" stroke-linecap="round" />
      <circle cx="90" cy="70" r="4.5" fill="#d91e2a" />
      <Sparkles coords={[[28, 34], [94, 48]]} />
    </svg>
  ),
  margarita: () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <path d="M24 30 L96 30 C92 52, 76 58, 72 64 C69 68, 66 72, 60 72 C54 72, 51 68, 48 64 C44 58, 28 52, 24 30 Z" fill="#f7f2ec" />
      <path d="M29 33 L91 33 C87 50, 74 55, 70 60 C67 64, 65 68, 60 68 C55 68, 53 64, 50 60 C46 55, 33 50, 29 33 Z" fill="#e5e8b6" />
      <rect x="58" y="71" width="4" height="33" fill="#f7f2ec" />
      <ellipse cx="60" cy="105" rx="21" ry="4" fill="#f7f2ec" />
      <LimeSlice cx={90} cy={28} r={10} />
      <LimeSlice cx={32} cy={80} r={9} />
      <Sparkles coords={[[26, 20], [92, 62]]} />
    </svg>
  ),
  bramble: () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <rect x="34" y="34" width="52" height="70" rx="5" fill="#f7f2ec" />
      <rect x="38" y="42" width="44" height="58" rx="3" fill="#d6336c" />
      <rect x="44" y="54" width="16" height="16" rx="2" fill="#ffffff" opacity="0.28" transform="rotate(10 52 62)" />
      <circle cx="54" cy="48" r="4" fill="#3b1d4a" />
      <circle cx="60" cy="47" r="4" fill="#4c265e" />
      <circle cx="57" cy="52" r="4" fill="#2e153b" />
      <circle cx="68" cy="84" r="4" fill="#3b1d4a" />
      <circle cx="74" cy="83" r="4" fill="#4c265e" />
      <circle cx="71" cy="88" r="4" fill="#2e153b" />
      <circle cx="63" cy="68" r="9" fill="#f7d147" />
      <path d="M36 38 C26 32, 26 20, 36 22 C42 24, 36 32, 30 30" fill="none" stroke="#f7d147" stroke-width="3" stroke-linecap="round" />
      <Sparkles coords={[[26, 62], [95, 42]]} />
    </svg>
  ),
  manhattan: () => (
    <svg viewBox="0 0 120 120" class="cocktail-svg" aria-hidden="true">
      <MartiniStem liquid="#dc1f36" />
      <path d="M26 32 C16 26, 16 14, 26 16 C32 18, 26 26, 20 24" fill="none" stroke="#f7d147" stroke-width="3" stroke-linecap="round" />
      <circle cx="88" cy="24" r="4.5" fill="#d91e2a" />
      <circle cx="94" cy="28" r="4.5" fill="#d91e2a" />
      <circle cx="34" cy="84" r="9" fill="#f7d147" />
      <Sparkles coords={[[92, 54], [28, 56]]} />
    </svg>
  ),
} satisfies Record<CocktailId, () => unknown>;

export function CocktailCard(props: CocktailCardProps) {
  const cocktail = createMemo(() => getPlayerCocktail(props.player.id));

  return (
    <div
      class={`cocktail-card ${props.player.connected ? '' : 'disconnected'}`}
      title={`${cocktail().label} ${props.player.name} (${cocktail().name})`}
    >
      <div class="cocktail-card-title">{cocktail().label}</div>
      <div class="cocktail-card-art">{ILLUSTRATIONS[cocktail().id]()}</div>
      <div class="cocktail-card-name">{props.player.name}</div>
    </div>
  );
}
