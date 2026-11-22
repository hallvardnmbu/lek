import { GameRegistry } from '../game';
import { categoriesGame } from './categories';
import { drawGame } from './draw';
import { geoGuessGame } from './geoguess';
import { mostLikelyGame } from './mostlikely';
import { musicQuizGame } from './musicquiz';
import { getMusicQuizCatalog, initMusicQuizCatalog } from './musicquizCatalog';
import { priceGuessGame } from './priceguess';
import { rouletteGame } from './roulette';
import { tankGame } from './tankgame';
import { wikiraceGame } from './wikirace';

export function createGameRegistry(): GameRegistry {
  const registry = new GameRegistry();
  registry.register(drawGame);
  registry.register(mostLikelyGame);
  registry.register(categoriesGame);
  registry.register(rouletteGame);
  registry.register(musicQuizGame);
  registry.register(tankGame);
  registry.register(wikiraceGame);
  registry.register(geoGuessGame);
  registry.register(priceGuessGame);
  return registry;
}

export async function initGames(): Promise<void> {
  await initMusicQuizCatalog();
}

export function handleGameApi(req: Request, url: URL): Response | null {
  if (url.pathname === '/api/musicquiz/songs' && req.method === 'GET') {
    return Response.json({ songs: getMusicQuizCatalog() });
  }
  return null;
}
