// ui/ui-controller.js
import * as SpeechService from '../services/speech-service.js';

let waitingForClickResolve = null;

// DOM Elements
const gameInfoElement = document.getElementById('game-information');
const continueButton = document.getElementById('continue-button');
const pauseButton = document.getElementById('pause-game');
const resumeButton = document.getElementById('resume-game');
const volumeSlider = document.getElementById('volumeSlider');
const delaySlider = document.getElementById('delaySlider');

// Functions exported for use in game logic (avoiding direct DOM manipulation there if possible)

export async function updateInformation(content, options = {}) {
    // Strip HTML tags for speech
    const textToSpeak = content.replace(/<[^>]*>?/gm, '');
    await SpeechService.speak(textToSpeak);
}

export async function updateGameMode(description, subDescription = "") {
    await SpeechService.speak(description + ". " + subDescription);
}


export function updateDelay(delay) {
    sessionStorage.setItem("delay", delay);
}

export function loadDelay() {
    return parseInt(sessionStorage.getItem("delay") || "3");
}

export function loadSettings() {
    return (
        JSON.parse(sessionStorage.getItem("settings")) || {
            difficulty: "medium",
            playlist: "6TutgaHFfkThmrrobwA2y9",
            contestants: [],
        }
    );
}

// Global waitForClick replacement
export function setupUI(gameInstance) {
    // Buttons
    if (document.getElementById('pause-game')) {
        document.getElementById('pause-game').addEventListener('click', () => {
            if (gameInstance.isRunning) {
                gameInstance.isRunning = false;
                updateGameMode("du har pauset. tulling", "for å fortsette igjen må du selvfølgelig trykke på knappen under selv. idiot.");
                document.getElementById('pause-game').disabled = true;
                document.getElementById('resume-game').disabled = false;
            }
        });
    }

    if (document.getElementById('resume-game')) {
        document.getElementById('resume-game').addEventListener('click', () => {
            if (!gameInstance.isRunning) {
                gameInstance.isRunning = true;
                gameInstance.startLoop(); // Ensure loop is running
                document.getElementById('pause-game').disabled = false;
                document.getElementById('resume-game').disabled = true;
            }
        });
    }

    if (continueButton) {
        continueButton.addEventListener('click', () => {
            // Signal continue
            if (waitingForClickResolve) {
                waitingForClickResolve();
                waitingForClickResolve = null;
                onWaitForClickFinished();
            }
        });
    }

    // Sliders
    if (volumeSlider) {
        volumeSlider.addEventListener('change', (e) => {
            import('../services/spotify-service.js').then(s => s.updateVolume(e.target.value));
        });
    }

    if (delaySlider) {
        delaySlider.addEventListener('change', (e) => {
            updateDelay(e.target.value);
        });
        // Init value
        delaySlider.value = loadDelay();
    }
}


function onWaitForClickFinished() {
    const gameInfo = document.getElementById('game-information');
    if (gameInfo) {
        gameInfo.classList.remove('waiting-for-click');
        const indicator = gameInfo.querySelector('.click-indicator');
        if (indicator) indicator.remove();
    }
    if (continueButton) continueButton.style.display = 'none';
}

/**
 * Returns a promise that resolves when user clicks or presses a key.
 * @param {string} message 
 */
export async function waitForClick(message) {
    const gameInfo = document.getElementById('game-information');
    await updateInformation(message + "\n\ntrykk (hvor som helst?) for å fortsette...");

    // Add visual feedback
    if (gameInfo) {
        gameInfo.classList.add('waiting-for-click');
        gameInfo.innerHTML += '<div class="click-indicator">trykk</div>';
    }
    if (continueButton) {
        continueButton.style.display = 'block';
    }

    return new Promise((resolve) => {
        waitingForClickResolve = resolve;

        // Also listen for document click logic from original code?
        const clickHandler = (e) => {
            if (!e.target.closest('button') && !e.target.closest('input')) {
                document.removeEventListener('click', clickHandler);
                if (waitingForClickResolve) {
                    waitingForClickResolve();
                    waitingForClickResolve = null;
                    onWaitForClickFinished();
                }
            }
        };
        setTimeout(() => document.addEventListener('click', clickHandler), 100); // Small delay to avoid immediate click
    });
}
