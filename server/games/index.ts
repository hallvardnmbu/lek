import { GameRegistry } from '../game';
import { categoriesGame } from './categories';
import { drawGame } from './draw';
import { mostLikelyGame } from './mostlikely';
import { musicQuizGame } from './musicquiz';
import { rouletteGame } from './roulette';

/**
 * Creates the server GameRegistry and registers all available games.
 * Add new games here with `registry.register(myGame)`.
 */
export function createGameRegistry(): GameRegistry {
  const registry = new GameRegistry();
  registry.register(drawGame);
  registry.register(mostLikelyGame);
  registry.register(categoriesGame);
  registry.register(rouletteGame);
  registry.register(musicQuizGame);
  return registry;
}
