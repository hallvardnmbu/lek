window.onload = initializeGame;

function updateInformation(content, options = {}) {
  const gameInformation = document.getElementById("game-information");

  if (options.override) {
    gameInformation.innerHTML = content;
  } else {
    gameInformation.innerHTML = content.replace(/\n/g, '<br>');
  }
}

function updateGameMode(mode, description) {
  const gameModeElement = document.getElementById("game-mode");
  const gameDescriptionElement = document.getElementById("game-description");

  if (gameModeElement) {
    gameModeElement.textContent = mode;
  }
  if (gameDescriptionElement) {
    gameDescriptionElement.textContent = description;
  }
}

function updateDelay(delay) {
  sessionStorage.setItem("delay", delay);
}

function loadDelay() {
  return parseInt(sessionStorage.getItem("delay") || "3");
}

function loadSettings() {
  return (
    JSON.parse(sessionStorage.getItem("settings")) || {
      difficulty: "medium",
      playlist: "6TutgaHFfkThmrrobwA2y9",
      contestants: [],
    }
  );
}

// TimeManager handles the game loop timing and pauses
class TimeManager {
  constructor() {
    this.timers = [];
    this.lastTime = performance.now();
    this.paused = false;
  }

  update(currentTime) {
    const dt = currentTime - this.lastTime;
    this.lastTime = currentTime;

    if (this.paused) return;

    // Process timers in reverse to allow removal
    for (let i = this.timers.length - 1; i >= 0; i--) {
      const timer = this.timers[i];
      timer.remaining -= dt;
      if (timer.remaining <= 0) {
        timer.resolve();
        this.timers.splice(i, 1);
      }
    }
  }

  wait(ms) {
    return new Promise(resolve => {
      if (ms <= 0) {
        resolve();
      } else {
        this.timers.push({ remaining: ms, resolve });
      }
    });
  }

  setPaused(paused) {
    this.paused = paused;
    // When resuming, we don't want a huge dt jump, so we reset lastTime
    if (!paused) {
      this.lastTime = performance.now();
    }
  }
}

function initializeGame() {
  const settings = loadSettings();
  const delay = loadDelay();
  const game = new Game(settings, delay);
  window.game = game; // Expose globally for controls
  game.start();
}

class Game {
  constructor(settings, delay) {
    this.contestants = settings.contestants;
    this.difficulty = settings.difficulty;
    this.delay = 1 - delay;

    // Engine components
    this.time = new TimeManager();
    this._isRunning = false; // Internal running state

    this.currentMode = null;
    this.waitingForClick = false;
    this.rigged = settings.contestants.find(c => c.rigged)?.name || null;

    this.action = {
      low: [1, 2, 3, 4, 5],
      medium: [3, 4, 5, 6],
      high: [5, 6, 7, 8],
    };

    this.categories = [
      "Dyr", "Land", "Filmer", "Sanger", "Mat", "Farger",
      "Sport", "Kjendiser", "TV-serier", "Bøker", "Biler", "Drinker",
      "Ting på kjøkkenet", "Ting på badet",
      "Ting som er runde", "Ting som er kalde", "Brettspill",
      "Videospill", "Ting som flyr", "Ting med hjul"
    ];

    this.most_likely_to = [
      "bli arrestert", "bli kjent", "vinne i lotto", "glemme sin egen bursdag",
      "bli millionær", "gå seg vill i eget nabolag", "spise noe rart",
      "danse på bordet", "synge karaoke edru", "gråte til en film", "le i en begravelse",
      "ta tatovering i fylla", "bli vegetarianer", "flytte til et annet land",
      "få flest barn", "bli lærer", "bli politiker", "hoppe i fallskjerm",
      "overleve en zombieapokalypse", "bli realitystjerne", "gifte seg først"
    ];

    this.lyrics = [
      ["Kjent Artist", "Populær Sang", "Kjente sangtekster her"],
      ["Rockeband", "Klassisk Hit", "Minneverdig refreng fra en rockesang"],
      ["Popstjerne", "Listetopp", "Fengende pop-sangtekster"],
      ["Countrysanger", "Kjærlighetssorg", "Følelsesladde country-tekster"],
      ["Hip Hop Artist", "Rap Hit", "Rytmiske rap-tekster"]
    ];

    // Get all game mode methods
    this.gameModes = this._getGameModes();

    console.log("Game initialized with modes:", Object.keys(this.gameModes));

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

  _loop(timestamp) {
    this.time.update(timestamp);
    requestAnimationFrame(this._loop);
  }

  async wait(ms) {
    return this.time.wait(ms);
  }

  _getGameModes() {
    const modes = {};
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter(method =>
        !method.startsWith("_") &&
        typeof this[method] === "function" &&
        method !== "constructor" &&
        method !== "wait" &&
        method !== "start" &&
        method !== "loop"
      );

    for (const method of methodNames) {
      modes[method] = {
        func: this[method].bind(this),
        name: this._formatMethodName(method),
        description: this._getMethodDescription(method)
      };
    }

    return modes;
  }

  _formatMethodName(method) {
    return method
      .replace(/_/g, " ")
      .replace(/\b\w/g, l => l.toUpperCase());
  }

  _getMethodDescription(method) {
    const descriptions = {
      draw: "En spiller tegner mens de andre gjetter",
      drink_bitch: "Tilfeldig spiller må drikke",
      music_length: "Gjett lengden på sangen",
      music_year: "Gjett utgivelsesåret",
      music_quiz: "Identifiser sang og artist",
      categories: "Nevn ting i en kategori til noen feiler",
      most_likely: "Stem på hvem som er mest sannsynlig til å...",
      waterfall: "Alle drikker i rekkefølge",
      lyrical_master: "Gjett sangen fra teksten",
      last_to: "Siste person til å gjøre en handling taper",
      grimace: "Lag den beste grimasen",
      build: "Bygg det høyeste tårnet med tomme bokser",
      snacks: "Kast snacks i munnen",
      mime: "Mimelek uten ord",
      thumb_war: "Episk tommelkrig",
      slap_the_mini: "Slå (forsiktig) den korteste personen",
      karin_henter_x: "Spesiell øl-runde",
      andreas_round_x: "Musikkquiz-utfordring"
    };
    return descriptions[method] || "En morsom drikkelek-aktivitet";
  }

  async start() {
    this._isRunning = true;
    await pauseSong();

    const contestantNames = this.contestants.map(c => typeof c === 'string' ? c : c.name);
    updateInformation(
      `Velkommen til drikkeleken!\n${contestantNames.join(", ")}.\nLa leken begynne!`
    );
    updateGameMode("Starter spillet", "Gjør dere klare for moro!");

    await this.wait(3000);
    await playSong();

    this._runGameLoop();
  }

  async _runGameLoop() {
    while (this._isRunning) {
      try {
        const modeKeys = Object.keys(this.gameModes);
        const randomKey = modeKeys[Math.floor(Math.random() * modeKeys.length)];
        const selectedMode = this.gameModes[randomKey];

        this.currentMode = randomKey;
        updateGameMode(selectedMode.name, selectedMode.description);

        console.log(`Starting game mode: ${selectedMode.name}`);
        // We await the mode, which will now use this.wait() for delays
        await selectedMode.func();

        // If execution paused/stopped, the await above might have hung if implemented poorly, 
        // but with our TimeManager, it just holds inside the promise.
        // If we want to check if we should continue:
        if (!this._isRunning) break;

        const waitTime = Math.floor(Math.random() * this.delay);
        console.log(`Waiting ${waitTime} seconds before next game...`);

        updateGameMode("Venter", `Neste lek om ${waitTime} minutter...`);

        // Wait using our engine time
        await this.wait(waitTime * 1000 * 60);

      } catch (error) {
        console.error("Error in game loop:", error);
        updateInformation("Noe gikk galt, men spillet fortsetter!");
        await this.wait(2000);
      }
    }
  }

  _getRandomAction() {
    const actions = this.action[this.difficulty];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  _getRandomActionString() {
    const amount = this._getRandomAction();
    const actions = [`drikke ${amount}`, `dele ut ${amount}`];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  _getRandomContestant() {
    if (this.rigged && Math.random() < 0.3) {
      return this.rigged;
    }
    const contestant = this.contestants[Math.floor(Math.random() * this.contestants.length)];
    return typeof contestant === 'string' ? contestant : contestant.name;
  }

  // --- MODES (Updated to use this.wait) ---

  async draw() {
    await pauseSong();
    const person = this._getRandomContestant();
    updateInformation(`Hør etter!\n${person}, du skal tegne noe de andre skal gjette.\nDe andre må prøve å finne ut hva det er.`);

    await this._waitForClick("Tegnetid! Når tegningen er ferdig, trykk for å fortsette.");

    updateInformation(`Tid for avsløring! ${person}, vis alle hva du tegnet.`);
    await this._waitForClick("Alle gjetter hva tegningen er!");

    const amount = this._getRandomAction();
    const outcomes = [
      `Hvis alle gjettet riktig, drikker ${person} ${amount}`,
      `Hvis ingen gjettet riktig, drikker ${person} ${amount}`,
      `Hvis noen gjettet riktig, drikker de som tok feil ${amount}`,
      `Hvis noen gjettet riktig, deler de som hadde rett ut ${amount}`
    ];

    updateInformation(outcomes[Math.floor(Math.random() * outcomes.length)]);
    await this.wait(3000);
    await playSong();
  }

  async drink_bitch() {
    const person = this._getRandomContestant();
    await pauseSong();
    updateInformation("Hør etter!");
    await this.wait(2000);
    updateInformation(`${person}, drikk!`);
    await this.wait(2000);
    await playSong();
  }

  async music_length() {
    await pauseSong();
    updateInformation("Hvor lang er sangen som nettopp spilte?");
    await this.wait(5000);

    try {
      const current = await getCurrentSong();
      if (current && current.data) {
        const minutes = Math.floor(current.data.duration / 60000);
        const seconds = Math.floor((current.data.duration % 60000) / 1000);
        updateInformation(`Sangen er ${minutes} minutter og ${seconds} sekunder lang.\nNærmeste gjetning vinner og kan ${this._getRandomActionString()}.`);
      } else {
        updateInformation(`Kunne ikke hente sanginfo. Alle må ${this._getRandomActionString()}!`);
      }
    } catch (error) {
      updateInformation(`Sanginfo utilgjengelig. Alle må ${this._getRandomActionString()}!`);
    }

    await this.wait(5000);
    await playSong();
  }

  async music_year() {
    await pauseSong();
    updateInformation("Hvilket år ble sangen som nettopp spilte utgitt?");
    await this.wait(5000);

    try {
      const current = await getCurrentSong();
      if (current && current.data && current.data.release) {
        const year = current.data.release.substring(0, 4);
        updateInformation(`Sangen ble utgitt i ${year}.\nNærmeste gjetning vinner og kan ${this._getRandomActionString()}.`);
      } else {
        updateInformation(`Kunne ikke hente utgivelsesinfo. Alle må ${this._getRandomActionString()}!`);
      }
    } catch (error) {
      updateInformation(`Utgivelsesinfo utilgjengelig. Alle må ${this._getRandomActionString()}!`);
    }

    await this.wait(5000);
    await playSong();
  }

  async music_quiz() {
    await pauseSong();
    updateInformation("Musikkquiz!\nJeg spiller 3 sanger. Førstemann som roper artist eller sangnavn vinner hver runde.");
    await this.wait(3000);

    for (let i = 1; i <= 3; i++) {
      updateInformation(`Sang ${i} av 3`);

      try {
        const result = await queueRandomSongFromPlaylist("37i9dQZF1DXcBWIGoYBM5M"); // Top 50 Global
        if (result && result.queuedSong) {
          await skipSong();
          await this.wait(20000);
          await pauseSong();
          updateInformation(`Det var "${result.queuedSong.name}" av ${result.queuedSong.artist}`);
        } else {
          updateInformation(`Sang ${i} - kunne ikke køe sang`);
        }
        await this.wait(2000);
      } catch (error) {
        console.error("Music quiz error:", error);
        updateInformation(`Sang ${i} - kunne ikke laste sanginfo`);
        await this.wait(2000);
      }
    }

    updateInformation(`Quiz ferdig! Vinnerne deler ut ${this._getRandomAction()} slurker hver.`);
    await this.wait(3000);
    await playSong();
  }

  async categories() {
    await pauseSong();
    const category = this.categories[Math.floor(Math.random() * this.categories.length)];
    const starter = this._getRandomContestant();

    updateInformation(`Kategorilek!\nKategori: ${category}\n${starter} starter. Fortsett til noen feiler.`);
    await this._waitForClick(`Kategori: ${category}\n${starter} starter kategorileken!`);
    updateInformation(`Leken er over! Taperen må ${this._getRandomActionString()}.`);
    await this.wait(2000);
    await playSong();
  }

  async most_likely() {
    await pauseSong();
    updateInformation("Hvem er mest sannsynlig til å...!\nJeg kommer med påstander. Stem hvis du tror det er sant.\nFlertallet bestemmer!");
    await this.wait(3000);

    for (let i = 0; i < 3; i++) {
      const person = this._getRandomContestant();
      const action = this.most_likely_to[Math.floor(Math.random() * this.most_likely_to.length)];
      updateInformation(`${person} er mest sannsynlig til å ${action}.`);
      await this._waitForClick("Stem nå! Trykk når stemmingen er ferdig.");
    }

    updateInformation("Stemming ferdig! Flertallsvinnerne deler ut drikke, taperne drikker!");
    await this.wait(3000);
    await playSong();
  }

  async waterfall() {
    await pauseSong();
    const starter = this._getRandomContestant();
    updateInformation(`Fossefall!\n${starter} begynner å drikke og velger retning.\nNeste person kan ikke stoppe før personen før dem stopper.`);

    if (this.rigged) {
      await this.wait(2000);
      updateInformation(`Spesiell regel: Start ved siden av ${this.rigged} så det ender på dem!`);
    }

    await this.wait(5000);
    await playSong();
  }

  async lyrical_master() {
    await pauseSong();
    updateInformation("Lyrisk Mester!\nGjett sangen fra disse tekstlinjene:");
    await this.wait(2000);

    const randomLyric = this.lyrics[Math.floor(Math.random() * this.lyrics.length)];
    const [artist, song, text] = randomLyric;

    updateInformation(text, { override: true });
    await this.wait(8000);
    updateInformation(`Sangen var "${song}" av ${artist}.\nDe som gjettet riktig kan ${this._getRandomActionString()}.`);
    await this.wait(3000);
    await playSong();
  }

  async last_to() {
    await pauseSong();
    const activities = ["dabbe", "reise seg", "ta på nesen", "rekke opp hånden", "klappe"];
    const activity = activities[Math.floor(Math.random() * activities.length)];

    updateInformation(`Siste person til å ${activity}...`);
    await this.wait(3000);
    updateInformation(`Må ${this._getRandomActionString()}!`);
    await this.wait(2000);
    await playSong();
  }

  async grimace() {
    await pauseSong();
    updateInformation("Grimasekonkurranse! Lag din beste grimase!");
    await this.wait(3000);
    updateInformation("Pek på den beste grimasen!");
    await this._waitForClick("Stem på den beste grimasen!");
    updateInformation(`Vinneren kan ${this._getRandomActionString()}!`);
    await this.wait(2000);
    await playSong();
  }

  async build() {
    await pauseSong();
    const time = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];
    updateInformation(`Bygg det høyeste tårnet med dine tomme bokser!\nDere har ${time} sekunder!`);

    await this._waitForClick("Trykk når dere er klare til å starte tiden!");
    updateInformation(`Kjør! Bygger i ${time} sekunder...`);
    await this.wait(time * 1000);
    updateInformation("Tiden er ute! Stopp byggingen!");
    await this._waitForClick("Sammenlign tårn og kår en vinner!");
    updateInformation(`Vinneren kan ${this._getRandomActionString()}!`);
    await this.wait(2000);
    await playSong();
  }

  async snacks() {
    await pauseSong();
    const starter = this._getRandomContestant();
    updateInformation(`Snacks-kast!\n${starter} starter.\nFørstemann til å fange en snack i munnen vinner!`);
    await this._waitForClick("Spill til noen fanger en snack!");
    updateInformation(`Vinneren kan ${this._getRandomActionString()}!`);
    await this.wait(2000);
    await playSong();
  }

  async mime() {
    await pauseSong();
    const person = this._getRandomContestant();
    const time = [15, 20, 25, 30][Math.floor(Math.random() * 4)];

    updateInformation(`Mime-tid!\n${person}, du har ${time} sekunder på å mime noe!`);
    await this.wait(time * 1000);
    updateInformation("Tiden er ute! Gjettet noen riktig?");
    await this._waitForClick("Avgjør hvem som gjettet riktig!");
    updateInformation("Hvis ingen gjettet riktig, drikker mimeren. Ellers drikker de som gjettet feil!");
    await this.wait(2000);
    await playSong();
  }

  async thumb_war() {
    if (this.contestants.length < 2) return;

    await pauseSong();
    const shuffled = [...this.contestants].sort(() => 0.5 - Math.random());
    const [person1, person2] = shuffled.slice(0, 2);
    const name1 = typeof person1 === 'string' ? person1 : person1.name;
    const name2 = typeof person2 === 'string' ? person2 : person2.name;

    updateInformation(`Tommelkrig!\n${name1} mot ${name2}!`);
    await this._waitForClick("Kjemp! Trykk når tommelkrigen er ferdig.");

    const winner = Math.random() < 0.5 ? "vinneren" : "taperen";
    updateInformation(`Den som ${winner} må ${this._getRandomActionString()}!`);
    await this.wait(2000);
    await playSong();
  }

  async slap_the_mini() {
    await pauseSong();
    updateInformation("Finn den korteste personen og gi dem en vennlig dask!");
    await this.wait(3000);
    updateInformation(`Den korteste personen kan ${this._getRandomActionString()}!`);
    await this.wait(2000);
    await playSong();
  }

  async karin_henter_x() {
    await pauseSong();
    updateInformation("Øl-runde!\nKarin (eller utvalgt person) henter drikke til alle!");
    await this.wait(5000);
    updateInformation("Kos dere med drikken!");
    await this.wait(3000);
    await playSong();
  }

  async andreas_round_x() {
    await pauseSong();
    updateInformation("Andreas' spesialrunde!\nHvilken sang spilles nå?");
    await this.wait(2000);
    await playSong();
    await this.wait(15000);
    await pauseSong();

    try {
      const current = await getCurrentSong();
      if (current && current.data) {
        updateInformation(`Det var "${current.data.name}" av ${current.data.artist}!`);
      } else {
        updateInformation("Sanginfo utilgjengelig!");
      }
    } catch (error) {
      console.error("Andreas round error:", error);
      updateInformation("Sanginfo utilgjengelig!");
    }

    await this.wait(3000);
    await playSong();
  }

  async _waitForClick(message) {
    this.waitingForClick = true;
    if (typeof window !== 'undefined' && window.waitForClick) {
      // Current wait logic in UI is Promise based, it should be unaffected by our internal clock
      // except we want to respect pause?
      // window.waitForClick implementation is event driven, doesn't use sleep unless fallback
      await window.waitForClick(message);
    } else {
      // Fallback
      updateInformation(message + "\n\nTrykk en tast for å fortsette...");
      await this.wait(5000);
    }
    this.waitingForClick = false;
  }
}