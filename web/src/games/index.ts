import { categoriesGameUi } from './categories';
import { drawGameUi } from './draw';
import { geoGuessGameUi } from './geoguess';
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
registerGameUi(geoGuessGameUi);

export { getGameUi, registerGameUi } from './registry';
