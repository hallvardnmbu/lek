// settings.js
import { startShufflePlaylist } from './services/spotify-service.js';

let contestants = [];

// Initialize settings if they exist
window.addEventListener('load', () => {
    if (sessionStorage.getItem("settings")) {
        const settings = JSON.parse(sessionStorage.getItem("settings"));

        const diffSelect = document.getElementById("difficulty");
        if (diffSelect) diffSelect.value = settings.difficulty;

        const playlistSelect = document.getElementById("playlist");
        if (playlistSelect) playlistSelect.value = settings.playlist;

        if (settings.contestants) {
            settings.contestants.forEach(c => {
                const name = typeof c === 'string' ? c : c.name;
                addPlayer(name, true);
            });
        }
    }

    // Add event listener for Enter key on input
    const input = document.getElementById("contestant");
    if (input) {
        input.addEventListener("keyup", function (event) {
            if (event.key === "Enter") {
                addPlayer();
            }
        });
    }

    // Attach click listener to Add button
    const addButton = document.querySelector('button[onclick="addPlayer()"]');
    if (addButton) { }

    // Attach update listeners
    document.getElementById("difficulty").addEventListener('change', updateSettings);
    document.getElementById("playlist").addEventListener('change', async () => {
        updateSettings();
        await startShufflePlaylist(document.getElementById("playlist").value);
    });

    // Initial update
    updateSettings();
});

export function addPlayer(nameOverride = null, skipUpdate = false) {
    const input = document.getElementById("contestant");
    const name = nameOverride || input.value.trim();

    if (!name) return;

    if (name.startsWith("RIGGED_")) {
        const riggedName = name.replace("RIGGED_", "");
        const riggedList = document.getElementById("rigged");
        const li = document.createElement("li");
        li.textContent = riggedName;
        riggedList.appendChild(li);

        contestants.push({ name: riggedName, rigged: true });
    } else {
        const list = document.getElementById("contestants");
        const li = document.createElement("li");
        li.textContent = name;
        list.appendChild(li);
        contestants.push({ name: name, rigged: false });
    }

    if (!nameOverride) input.value = "";
    if (!skipUpdate) updateSettings();
}

export function updateSettings() {
    const difficulty = document.getElementById("difficulty").value;
    const playlist = document.getElementById("playlist").value;

    const settings = {
        difficulty,
        playlist,
        contestants
    };

    sessionStorage.setItem("settings", JSON.stringify(settings));

    const readySpan = document.getElementById("ready");
    if (contestants.length > 0) {
        readySpan.style.display = "inline";
    } else {
        readySpan.style.display = "none";
    }

    const startLink = readySpan.querySelector("a");
    if (startLink) {
        startLink.onclick = async (e) => {
            e.preventDefault();
            window.location.href = '/';
        };
    }
}
