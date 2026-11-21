import { registerGameUi } from './registry';
import { sandboxGameUi } from './sandbox';

registerGameUi(sandboxGameUi);

export { getGameUi, listGameUis, registerGameUi } from './registry';
