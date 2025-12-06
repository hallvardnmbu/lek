// game/Game.js
import { TimeManager } from './TimeManager.js';
import { GameModes } from './GameModes.js';
import { updateInformation, updateGameMode, waitForClick } from '../ui/ui-controller.js';
import { pauseSong, playSong } from '../services/spotify-service.js';

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
        // Ensure loop is requested
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

    // Proxy to UI waitForClick to allow GameModes to use it AND share game context if needed
    async waitForClick(message) {
        return waitForClick(message);
    }

    _getAvailableModes() {
        // Get methods from GameModes instance
        const prototype = Object.getPrototypeOf(this.gameModes);
        const methodNames = Object.getOwnPropertyNames(prototype)
            .filter(method =>
                !method.startsWith("_") &&
                typeof this.gameModes[method] === "function" &&
                method !== "constructor"
            );

        const modes = {};
        for (const method of methodNames) {
            // Simple description mapping could be moved to GameModes or kept here
            modes[method] = {
                func: this.gameModes[method].bind(this.gameModes),
                description: this._getMethodDescription(method)
            };
        }
        return modes;
    }

    _getMethodDescription(method) {
        const descriptions = {
            drink_bitch: "Drikk-bitsj. Tilfeldig spiller må drikke.",
            music_length: "Gjett lengden på sangen.",
            music_year: "Gjett året denne sangen er fra.",
            music_quiz: "Identifiser sang og artist.",
            categories: "Nevn ting i en kategori til noen feiler.",
            most_likely: "Stem på hvem som er mest sannsynlig til å...",
            waterfall: "Fossefall. Alle drikker i rekkefølge.",
            lyrical_master: "Gjett sangen fra teksten.",
            last_to: "Siste person til å gjøre en handling taper.",
            grimace: "Lag den beste grimasen.",
            build: "Bygg det høyeste tårnet med tomme bokser.",
            snacks: "Kast snacks i munnen.",
            mime: "Mimelek uten ord.",
            thumb_war: "Episk tommelkrig.",
            slap_the_mini: "Slap den korteste personen.",
            karin_henter_x: "Spesiell øl-runde",
            andreas_round_x: "Musikkquiz-utfordring"
        };
        return descriptions[method] || "Huh?? Noe gikk galt...";
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
