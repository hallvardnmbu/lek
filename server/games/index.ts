import { GameRegistry } from '../game';
import { drawGame } from './draw';
import { mostLikelyGame } from './mostlikely';
import { sandboxGame } from './sandbox';

/**
 * Creates the server GameRegistry and registers all available games.
 * Add new games here with `registry.register(myGame)`.
 */
export function createGameRegistry(): GameRegistry {
  const registry = new GameRegistry();
  registry.register(drawGame);
  registry.register(mostLikelyGame);
  registry.register(sandboxGame);
  return registry;
}
