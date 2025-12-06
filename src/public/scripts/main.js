// main.js
import { Game } from './game/Game.js';
import { loadSettings, loadDelay, setupUI } from './ui/ui-controller.js';
import { initializeSpeech } from './services/speech-service.js';

window.addEventListener('load', async () => {
    // Initialize speech synthesis
    initializeSpeech();

    const settings = loadSettings();
    const delay = loadDelay();

    // Create Game instance
    const game = new Game(settings, delay);

    // Setup UI controls
    setupUI(game);

    // Start game
    game.start();

    // Expose for debugging if needed
    window.game = game;
});
