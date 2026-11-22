export type CocktailId =
  | 'espresso-martini'
  | 'long-island'
  | 'aperol-spritz'
  | 'negroni'
  | 'dirty-martini'
  | 'pina-colada'
  | 'margarita'
  | 'bramble'
  | 'manhattan';

export interface CocktailSpec {
  id: CocktailId;
  name: string;
  label: string;
}

export const COCKTAILS: readonly CocktailSpec[] = [
  { id: 'espresso-martini', name: 'Espresso Martini', label: 'Espresso' },
  { id: 'long-island', name: 'Long Island Iced Tea', label: 'Long Island' },
  { id: 'aperol-spritz', name: 'Aperol Spritz', label: 'Aperol' },
  { id: 'negroni', name: 'Negroni', label: 'Negroni' },
  { id: 'dirty-martini', name: 'Dirty Martini', label: 'Dirty' },
  { id: 'pina-colada', name: 'Piña Colada', label: 'Piña' },
  { id: 'margarita', name: 'Margarita', label: 'Margarita' },
  { id: 'bramble', name: 'Bramble', label: 'Bramble' },
  { id: 'manhattan', name: 'Manhattan', label: 'Manhattan' },
];

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function getPlayerCocktail(playerId: string): CocktailSpec {
  const index = hashString(playerId) % COCKTAILS.length;
  return COCKTAILS[index];
}
