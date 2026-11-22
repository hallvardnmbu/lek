import { drawGameUi } from './draw';
import { registerGameUi } from './registry';
import { sandboxGameUi } from './sandbox';

registerGameUi(drawGameUi);
registerGameUi(sandboxGameUi);

export { getGameUi, registerGameUi } from './registry';
