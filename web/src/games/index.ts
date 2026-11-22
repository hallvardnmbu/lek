import { categoriesGameUi } from './categories';
import { drawGameUi } from './draw';
import { mostLikelyGameUi } from './mostlikely';
import { registerGameUi } from './registry';

registerGameUi(drawGameUi);
registerGameUi(mostLikelyGameUi);
registerGameUi(categoriesGameUi);

export { getGameUi, registerGameUi } from './registry';
