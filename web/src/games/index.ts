import { categoriesGameUi } from './categories';
import { drawGameUi } from './draw';
import { mostLikelyGameUi } from './mostlikely';
import { musicQuizGameUi } from './musicquiz';
import { registerGameUi } from './registry';
import { rouletteGameUi } from './roulette';
import { wikiraceGameUi } from './wikirace';

registerGameUi(drawGameUi);
registerGameUi(mostLikelyGameUi);
registerGameUi(categoriesGameUi);
registerGameUi(rouletteGameUi);
registerGameUi(musicQuizGameUi);
registerGameUi(wikiraceGameUi);

export { getGameUi, registerGameUi } from './registry';
