import { categoriesGameUi } from './categories';
import { drawGameUi } from './draw';
import { mostLikelyGameUi } from './mostlikely';
import { registerGameUi } from './registry';
import { rouletteGameUi } from './roulette';

registerGameUi(drawGameUi);
registerGameUi(mostLikelyGameUi);
registerGameUi(categoriesGameUi);
registerGameUi(rouletteGameUi);

export { getGameUi, registerGameUi } from './registry';
