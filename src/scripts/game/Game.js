import { TimeManager } from './TimeManager.js';
import { GameModes } from './GameModes.js';
import { updateInformation, updateGameMode, waitForClick } from '../ui/ui-controller.js';
import { pauseSong, playSong } from '../services/spotify-service.js';
import { GAME_MODES } from '../constants.js';

export class Game {
    constructor(settings, delay) {
        this.contestants = settings.contestants;
        this.difficulty = settings.difficulty;
        this.delay = Math.max(8 - delay, 1);

        // Engine components
        this.time = new TimeManager();
        this._isRunning = false; // Internal running state

        this.currentMode = null;
        this.rigged = settings.contestants.find(c => c.rigged)?.name || null;

        // Initialize GameModes
        this.gameModes = new GameModes(this);

        // Bind loop
        this._loop = this._loop.bind(this);
        requestAnimationFrame(this._loop);
    }

    // Property for external control compatibility
    get isRunning() {
        return !this.time.paused && this._isRunning;
    }

    set isRunning(value) {
        if (value) {
            this._isRunning = true;
            this.time.setPaused(false);
        } else {
            this.time.setPaused(true);
        }
    }

    startLoop() {
        requestAnimationFrame(this._loop);
    }

    _loop(timestamp) {
        this.time.update(timestamp);
        if (this._isRunning) {
            requestAnimationFrame(this._loop);
        }
    }

    async wait(ms) {
        return this.time.wait(ms);
    }

    async waitForClick(message) {
        return waitForClick(message);
    }

    _getAvailableModes() {
        const prototype = Object.getPrototypeOf(this.gameModes);
        const methodNames = Object.getOwnPropertyNames(prototype)
            .filter(method =>
                !method.startsWith("_") &&
                typeof this.gameModes[method] === "function" &&
                method !== "constructor"
            );

        const modes = {};
        for (const method of methodNames) {
            modes[method] = {
                func: this.gameModes[method].bind(this.gameModes),
                description: this._getMethodDescription(method)
            };
        }
        return modes;
    }

    _getMethodDescription(method) {
        return GAME_MODES[method] || "Huh?? Noe gikk galt...";
    }

    async start() {
        this._isRunning = true;
        this.startLoop();

        await pauseSong();

        const contestantNames = this.contestants.map(c => typeof c === 'string' ? c : c.name);
        await updateInformation(
            `Velkommen til drikkeleken!\n${contestantNames.join(", ")}.\nLa leken begynne!`
        );
        await updateGameMode("Starter spillet", "Gjør dere klare for moro!");

        await this.wait(3000);
        await playSong();

        // Add initial wait so the music plays for a bit before the first game
        const minWait = 0.5;
        const maxWait = Math.max(minWait, this.delay);
        const waitTime = Number((minWait + Math.random() * (maxWait - minWait)).toFixed(1));
        await this.wait(waitTime * 1000 * 60);

        this._runGameLoop();
    }

    async _runGameLoop() {
        // Get modes once
        const availableModes = this._getAvailableModes();
        const modeKeys = Object.keys(availableModes);

        while (this._isRunning) {
            try {
                await pauseSong(); // Ensure music stops before we speak

                const randomKey = modeKeys[Math.floor(Math.random() * modeKeys.length)];
                const selectedMode = availableModes[randomKey];

                this.currentMode = randomKey;
                await updateGameMode(selectedMode.description);

                // Execute mode
                await selectedMode.func();

                if (!this._isRunning) break;

                // Resume music for the wait period
                await playSong();

                // Random wait
                const minWait = 0.5;
                const maxWait = Math.max(minWait, this.delay);
                const waitTime = Number((minWait + Math.random() * (maxWait - minWait)).toFixed(1));

                await this.wait(waitTime * 1000 * 60);

            } catch (error) {
                console.error("Error in game loop:", error);
                await updateInformation("Noe gikk galt, men spillet fortsetter!");
                await this.wait(2000);
            }
        }
    }
}
