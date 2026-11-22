import { drawGameUi } from './draw';
import { registerGameUi } from './registry';
import { mostLikelyGameUi } from './mostlikely';
import { sandboxGameUi } from './sandbox';

registerGameUi(drawGameUi);
registerGameUi(mostLikelyGameUi);
registerGameUi(sandboxGameUi);

export { getGameUi, registerGameUi } from './registry';
