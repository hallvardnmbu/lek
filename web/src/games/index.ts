import { categoriesGameUi } from './categories';
import { drawGameUi } from './draw';
import { geoGuessGameUi } from './geoguess';
import { mostLikelyGameUi } from './mostlikely';
import { musicQuizGameUi } from './musicquiz';
import { priceGuessGameUi } from './priceguess';
import { quizGameUi } from './quiz';
import { registerGameUi } from './registry';
import { rouletteGameUi } from './roulette';
import { tankGameUi } from './tankgame';
import { wikiraceGameUi } from './wikirace';

registerGameUi(drawGameUi);
registerGameUi(mostLikelyGameUi);
registerGameUi(categoriesGameUi);
registerGameUi(rouletteGameUi);
registerGameUi(musicQuizGameUi);
registerGameUi(tankGameUi);
registerGameUi(wikiraceGameUi);
registerGameUi(geoGuessGameUi);
registerGameUi(priceGuessGameUi);
registerGameUi(quizGameUi);

export { getGameUi, registerGameUi } from './registry';
