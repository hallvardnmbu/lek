window.onload = loadSettings;

async function loadSettings() {
  const settings = JSON.parse(sessionStorage.getItem("settings")) || {
    difficulty: "medium",
    playlist: "6TutgaHFfkThmrrobwA2y9",
    contestants: [],
  };

  // Restore selections
  document.getElementById("difficulty").value = settings.difficulty;
  document.getElementById("playlist").value = settings.playlist;

  // Restore contestants
  const contestantsList = document.getElementById("contestants");
  contestantsList.innerHTML = "";

  settings.contestants.forEach(({ name, rigged }) => {
    createPlayerElement(name, rigged);
  });

  // Start shuffle playing the selected playlist.
  await startShufflePlaylist(settings.playlist);
}

function saveSettings(settings) {
  console.log(settings);
  sessionStorage.setItem("settings", JSON.stringify(settings));

  document.getElementById("ready").style.display =
    document.getElementById("contestants").children.length >= 2 ? "block" : "none";
}

async function updateSettings() {
  const settings = {
    difficulty: document.getElementById("difficulty").value,
    playlist: document.getElementById("playlist").value,
    contestants: Array.from(document.getElementById("contestants").children).map((li) => ({
      name: li.textContent.trim(),
      rigged: li.querySelector("img").dataset.rigged === "true",
    })),
  };
  saveSettings(settings);

  // Start shuffle playing the selected playlist.
  const current = await getCurrentSong();
  if (current.data.playlist !== settings.playlist) {
    await startShufflePlaylist(settings.playlist);
  }
}

function createPlayerElement(name, isRigged = false) {
  const player = document.createElement("li");
  player.textContent = name;

  const image = document.createElement("img");
  image.src = "/icons/Smiley face.ico";
  image.alt = ":-)";
  image.dataset.rigged = isRigged;

  if (isRigged) {
    image.src = "/icons/Plush bear.ico";
  }

  image.onclick = (e) => {
    e.stopPropagation();
    const newRigged = !JSON.parse(image.dataset.rigged);
    image.dataset.rigged = newRigged;
    image.src = newRigged ? "/icons/Plush bear.ico" : "/icons/Smiley face.ico";
    updateSettings();
  };

  image.onmouseover = () => {
    image.src =
      image.dataset.rigged === "true" ? "/icons/Smiley face.ico" : "/icons/Plush bear.ico";
  };
  image.onmouseout = () => {
    image.src =
      image.dataset.rigged === "true" ? "/icons/Plush bear.ico" : "/icons/Smiley face.ico";
  };

  // Remove player on click
  player.onclick = () => {
    player.remove();
    updateSettings();
  };

  player.insertBefore(image, player.firstChild);
  document.getElementById("contestants").appendChild(player);

  document.getElementById("ready").style.display =
    document.getElementById("contestants").children.length >= 2 ? "block" : "none";
}

function addPlayer() {
  const input = document.getElementById("contestant");
  const name = input.value.trim();

  // TODO: Handle duplicate names.

  if (name) {
    createPlayerElement(name);
    input.value = "";
    updateSettings();
  }
}

// Enter key handler
document.getElementById("contestant").addEventListener("keypress", (e) => {
  if (e.key === "Enter") addPlayer();
});
