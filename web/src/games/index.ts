import { drawGameUi } from './draw';
import { registerGameUi } from './registry';
import { mostLikelyGameUi } from './mostlikely';

registerGameUi(drawGameUi);
registerGameUi(mostLikelyGameUi);

export { getGameUi, registerGameUi } from './registry';
