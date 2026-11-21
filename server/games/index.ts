import { GameRegistry } from '../game';
import { sandboxGame } from './sandbox';

/**
 * Creates the server GameRegistry and registers all available games.
 * Add new games here with `registry.register(myGame)`.
 */
export function createGameRegistry(): GameRegistry {
  const registry = new GameRegistry();
  registry.register(sandboxGame);
  return registry;
}
