// main.js
import { Game } from './game/Game.js';
import { loadSettings as getGameSettings, loadDelay, setupUI } from './ui/ui-controller.js';
import { initializeSpeech } from './services/speech-service.js';
import { initiateSpotifyAuth } from './services/auth-service.js';
import { SPOTIFY_CLIENT_ID } from '../config.js';
import { startShufflePlaylist } from './services/spotify-service.js';

let contestants = [];

function showView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    if (viewId === 'view-login') startKeyboardAnimation();
    if (viewId === 'view-game' || viewId === 'view-callback') startStarAnimation();
}

let starInterval, keyboardInterval;

function startStarAnimation() {
    const star = document.getElementById('star');
    if (!star) return;
    let frame = 1;
    const frames = 10;

    if (starInterval) clearInterval(starInterval);
    starInterval = setInterval(() => {
        star.innerHTML = `<img src="/icons/animations/star/Star (${frame} of ${frames}).ico">`;
        frame = frame >= frames ? 1 : frame + 1;
    }, 200);
}

function startKeyboardAnimation() {
    const keyboard = document.getElementById('keyboard');
    if (!keyboard) return;
    let frame = 1;
    const frames = 2;

    if (keyboardInterval) clearInterval(keyboardInterval);
    keyboardInterval = setInterval(() => {
        keyboard.innerHTML = `<img src="/icons/animations/keyboard/MIDI keyboard (${frame} of ${frames}).ico">`;
        frame = frame >= frames ? 1 : frame + 1;
    }, 1500);
}

window.playExplosion = function () {
    const explosion = document.getElementById('explosion');
    if (!explosion) return;
    let frame = 1;
    const frames = 3;
    let explosionInterval = setInterval(() => {
        if (frame <= frames) {
            explosion.innerHTML = `<img src="/icons/animations/explosion/Explosion (${frame} of ${frames}).ico">`;
            frame++;
        } else {
            clearInterval(explosionInterval);
            explosion.innerHTML = "";
        }
    }, 200);
};

function loadSettings() {
    if (sessionStorage.getItem("settings")) {
        const settings = JSON.parse(sessionStorage.getItem("settings"));

        const diffSelect = document.getElementById("difficulty");
        if (diffSelect) diffSelect.value = settings.difficulty;

        const playlistSelect = document.getElementById("playlist");
        if (playlistSelect) playlistSelect.value = settings.playlist;

        if (settings.contestants) {
            contestants = settings.contestants;
            const list = document.getElementById("contestants");
            if (list) list.innerHTML = "";

            settings.contestants.forEach(c => {
                renderContestant(c);
            });
            updateSettingsUI();
        }
    }
}

function renderContestant(c) {
    const name = typeof c === 'string' ? c : c.name;
    const isRigged = c.rigged || false;
    const list = document.getElementById("contestants");

    const li = document.createElement("li");
    li.style.display = "flex";
    li.style.alignItems = "center";

    // Icon
    const img = document.createElement("img");
    img.src = "/icons/Smiley face.ico";
    img.style.cursor = "pointer";
    if (isRigged) {
        img.style.filter = "invert(1) sepia(1) saturate(5) hue-rotate(-50deg)";
    }

    // Toggle rigging on icon click
    img.onclick = () => {
        const index = contestants.findIndex(p => (p.name || p) === name);
        if (index !== -1) {
            if (typeof contestants[index] === 'string') {
                contestants[index] = { name: contestants[index], rigged: true };
            } else {
                contestants[index].rigged = !contestants[index].rigged;
            }
            saveSettings();
            loadSettings();
        }
    };

    // Name
    const span = document.createElement("span");
    span.textContent = name;
    span.style.cursor = "pointer";
    span.style.textDecoration = "underline";

    // Remove on name click
    span.onclick = () => {
        contestants = contestants.filter(p => (p.name || p) !== name);
        saveSettings();
        loadSettings();
    };

    li.appendChild(img);
    li.appendChild(span);
    list.appendChild(li);
}

function addPlayer() {
    const input = document.getElementById("contestant");
    const name = input.value.trim();

    if (!name) return;

    let newContestant = { name: name, rigged: false };

    contestants.push(newContestant);
    input.value = "";
    saveSettings();
    loadSettings();
}

function saveSettings() {
    const difficulty = document.getElementById("difficulty").value;
    const playlist = document.getElementById("playlist").value;

    const settings = {
        difficulty,
        playlist,
        contestants
    };

    sessionStorage.setItem("settings", JSON.stringify(settings));
}

function updateSettingsUI() {
    const readySpan = document.getElementById("ready");
    if (contestants.length > 0) {
        readySpan.style.display = "inline";
    } else {
        readySpan.style.display = "none";
    }
}

async function startGame() {
    const playlist = document.getElementById("playlist").value;
    await startShufflePlaylist(playlist);

    showView('view-game');
    initializeSpeech();
    const settings = JSON.parse(sessionStorage.getItem("settings"));
    const delay = loadDelay();

    const game = new Game(settings, delay);
    setupUI(game);

    await new Promise(r => setTimeout(r, 1000));

    game.start();
    window.game = game;
}

window.addEventListener('load', async () => {
    const token = sessionStorage.getItem('token');

    if (!token) {
        showView('view-login');
    } else if (!sessionStorage.getItem('settings')) {
        showView('view-settings');
        loadSettings();
    } else {
        showView('view-settings');
        loadSettings();
    }

    const loginBtn = document.getElementById('login-button');
    if (loginBtn) {
        loginBtn.addEventListener('click', () => {
            initiateSpotifyAuth(SPOTIFY_CLIENT_ID);
        });
    }

    const addPlayerBtn = document.getElementById('add-player-btn');
    if (addPlayerBtn) addPlayerBtn.addEventListener('click', addPlayer);

    const input = document.getElementById("contestant");
    if (input) {
        input.addEventListener("keyup", function (event) {
            if (event.key === "Enter") addPlayer();
        });
    }

    const diffSelect = document.getElementById("difficulty");
    if (diffSelect) diffSelect.addEventListener('change', saveSettings);

    const playSelect = document.getElementById("playlist");
    if (playSelect) {
        playSelect.addEventListener('change', async () => {
            saveSettings();
            await startShufflePlaylist(playSelect.value);
        });
    }

    const startBtn = document.getElementById('start-game-btn');
    if (startBtn) {
        startBtn.addEventListener('click', startGame);
    }

    document.getElementById('reset-settings-btn').addEventListener('click', () => {
        sessionStorage.removeItem('settings');
        window.location.reload();
    });

    document.getElementById('logout-btn').addEventListener('click', () => {
        sessionStorage.clear();
        window.location.reload();
    });
});
