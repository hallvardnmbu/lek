window.onload = initializeGame;

async function updateInformation(content, options = {}) {
  const gameInformation = document.getElementById("game-information");
  const informationalOnlyMessages = [
    "Waiting...",
    "Next game in...",
    "click to continue",
    "Preparing for fun",
    "hopper over",
    "fortsetter igjen" // Added based on plan for continueGame
  ];

  if (options.override) {
    gameInformation.innerHTML = content;
  } else {
    gameInformation.innerHTML = content.replace(/\n/g, '<br>');
  }

  if (window.game && window.game.speak && !informationalOnlyMessages.some(msg => content.toLowerCase().includes(msg.toLowerCase()))) {
    try {
      await window.game.speak(content);
    } catch (error) {
      console.error("Error during speak:", error);
    }
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

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function initializeGame() {
  const settings = loadSettings();
  const delay = loadDelay();
  const game = new Game(settings, delay);
  window.game = game; // Expose globally for controls
  await game._start();
}

class Game {
  constructor(settings, delay) {
    this.contestants = settings.contestants;
    this.difficulty = settings.difficulty;
    this.delayRange = [1, delay];
    this.isRunning = false;
    this.currentMode = null;
    this.waitingForClick = false;
    this.isSpeaking = false; // Added for TTS
    this.rigged = settings.contestants.find(c => c.rigged)?.name || null;

    this.action = {
      low: [1, 2, 3, 4, 5],
      medium: [3, 4, 5, 6],
      high: [5, 6, 7, 8],
    };

    this.categories = [
      "Animals", "Countries", "Movies", "Songs", "Food", "Colors",
      "Sports", "Celebrities", "TV Shows", "Books", "Cars", "Drinks",
      "Things in the kitchen", "Things you find in a bathroom",
      "Things that are round", "Things that are cold", "Board games",
      "Video games", "Things that fly", "Things with wheels"
    ];

    this.most_likely_to = [
      "get arrested", "become famous", "win the lottery", "forget their own birthday",
      "become a millionaire", "get lost in their own neighborhood", "eat something weird",
      "dance on a table", "sing karaoke sober", "cry during a movie", "laugh at a funeral",
      "get a tattoo while drunk", "become a vegetarian", "move to another country",
      "have the most kids", "become a teacher", "become a politician", "go skydiving",
      "survive a zombie apocalypse", "become a reality TV star", "get married first"
    ];

    this.lyrics = [
      ["Famous Artist", "Popular Song", "Well-known song lyrics here"],
      ["Rock Band", "Classic Hit", "Memorable chorus from a rock song"],
      ["Pop Star", "Chart Topper", "Catchy pop song lyrics"],
      ["Country Singer", "Heartbreak Song", "Emotional country song lyrics"],
      ["Hip Hop Artist", "Rap Hit", "Rhythmic rap song lyrics"]
    ];

    // Get all game mode methods
    this.gameModes = this._getGameModes();
    
    console.log("Game initialized with modes:", Object.keys(this.gameModes));
  }

  async speak(text) {
    if (!speechSynthesis) {
      console.warn("Speech synthesis not supported.");
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      // Clean text: remove HTML, convert newlines/<br> to spaces for smoother speech
      const cleanedText = text.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/\n/g, ' ');
      const utterance = new SpeechSynthesisUtterance(cleanedText);

      utterance.onstart = () => {
        this.isSpeaking = true;
        console.log("Speech started for:", cleanedText);
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        console.log("Speech ended for:", cleanedText);
        resolve();
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        console.error("Speech synthesis error:", event.error);
        reject(event.error);
      };

      // Cancel any ongoing speech before starting a new one
      if (speechSynthesis.speaking) {
        speechSynthesis.cancel();
      }
      speechSynthesis.speak(utterance);
    });
  }

  _getGameModes() {
    const modes = {};
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(this))
      .filter(method => 
        !method.startsWith("_") && 
        typeof this[method] === "function" &&
        method !== "constructor"
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
      draw: "One player draws while others guess",
      drink_bitch: "Random player must drink",
      music_length: "Guess the length of the current song",
      music_year: "Guess when the current song was released",
      music_quiz: "Identify songs and artists",
      categories: "Name items in a category until someone fails",
      most_likely: "Vote on who is most likely to do something",
      waterfall: "Everyone drinks in sequence",
      lyrical_master: "Guess the song from lyrics",
      last_to: "Last person to do an action loses",
      grimace: "Make the best funny face",
      build: "Build the highest tower with empty cans",
      snacks: "Throw snacks into your mouth",
      mime: "Act out something without words",
      thumb_war: "Epic thumb wrestling battle",
      slap_the_mini: "Playfully slap the shortest person",
      karin_henter_x: "Special beer round",
      andreas_round_x: "Music identification challenge"
    };
    return descriptions[method] || "A fun drinking game activity";
  }

  async _start() {
    await pauseSong();
    const contestantNames = this.contestants.map(c => typeof c === 'string' ? c : c.name);
    await updateInformation(
      `Welcome to the drinking game!\n${contestantNames.join(", ")}.\nLet the games begin!`
    );
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    updateGameMode("Starting Game", "Preparing for fun!");
    
    await sleep(3000);
    await playSong();
    
    this.isRunning = true;
    this._gameLoop();
  }

  async _gameLoop() {
    while (this.isRunning) {
      while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
      try {
        const modeKeys = Object.keys(this.gameModes);
        const randomKey = modeKeys[Math.floor(Math.random() * modeKeys.length)];
        const selectedMode = this.gameModes[randomKey];
        
        this.currentMode = randomKey;
        updateGameMode(selectedMode.name, selectedMode.description);
        
        console.log(`Starting game mode: ${selectedMode.name}`);
        await selectedMode.func();
        
        if (!this.isRunning) break; // Check if game was paused during mode execution
        
        const waitTime = Math.floor(Math.random() * (this.delayRange[1] - this.delayRange[0] + 1)) + this.delayRange[0];
        console.log(`Waiting ${waitTime} seconds before next game...`);
        
        updateGameMode("Waiting", `Next game in ${waitTime} seconds...`);
        
        // Wait with periodic checks for pause, click interruption, and speech
        for (let i = 0; i < waitTime && this.isRunning && !this.waitingForClick; i++) {
          while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
          await sleep(1000);
        }
        
      } catch (error) {
        console.error("Error in game loop:", error);
        await updateInformation("Something went wrong, but the game continues!");
        while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
        await sleep(2000);
      }
    }
  }

  _getRandomAction() {
    const actions = this.action[this.difficulty];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  _getRandomActionString() {
    const amount = this._getRandomAction();
    const actions = [`drink ${amount}`, `hand out ${amount}`];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  _getRandomContestant() {
    if (this.rigged && Math.random() < 0.3) {
      return this.rigged;
    }
    const contestant = this.contestants[Math.floor(Math.random() * this.contestants.length)];
    return typeof contestant === 'string' ? contestant : contestant.name;
  }

  async draw() {
    await pauseSong();
    const person = this._getRandomContestant();
    await updateInformation(`Attention everyone!\n${person}, you need to draw something for the others to guess.\nThe others must try to figure out what it is.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    
    await this._waitForClick("Drawing time! When the drawing is complete, click to continue.");
    // _waitForClick already handles speaking and waiting for speech completion via updateInformation
    
    await updateInformation(`Time to reveal! ${person}, show everyone what you drew.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick("Everyone guess what the drawing is!");
    // _waitForClick already handles speaking and waiting for speech completion via updateInformation
    
    const amount = this._getRandomAction();
    const outcomes = [
      `If everyone guessed correctly, ${person} drinks ${amount}`,
      `If nobody guessed correctly, ${person} drinks ${amount}`,
      `If some guessed correctly, the wrong guessers drink ${amount}`,
      `If some guessed correctly, the correct guessers hand out ${amount}`
    ];
    
    await updateInformation(outcomes[Math.floor(Math.random() * outcomes.length)]);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await playSong();
  }

  async drink_bitch() {
    const person = this._getRandomContestant();
    await pauseSong();
    await updateInformation("Attention please!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await updateInformation(`${person}, drink up!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async music_length() {
    await pauseSong();
    await updateInformation("How long is the song that just played?");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(5000);
    
    try {
      const current = await getCurrentSong();
      if (current && current.data) {
        const minutes = Math.floor(current.data.duration / 60000);
        const seconds = Math.floor((current.data.duration % 60000) / 1000);
        await updateInformation(`The song is ${minutes} minutes and ${seconds} seconds long.\nClosest guess wins and may ${this._getRandomActionString()}.`);
      } else {
        await updateInformation(`Couldn't get song info. Everyone ${this._getRandomActionString()}!`);
      }
    } catch (error) {
      await updateInformation(`Song info unavailable. Everyone ${this._getRandomActionString()}!`);
    }
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    
    await sleep(5000);
    await playSong();
  }

  async music_year() {
    await pauseSong();
    await updateInformation("What year was the song that just played released?");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(5000);
    
    try {
      const current = await getCurrentSong();
      if (current && current.data && current.data.release) {
        const year = current.data.release.substring(0, 4);
        await updateInformation(`The song was released in ${year}.\nClosest guess wins and may ${this._getRandomActionString()}.`);
      } else {
        await updateInformation(`Couldn't get release info. Everyone ${this._getRandomActionString()}!`);
      }
    } catch (error) {
      await updateInformation(`Release info unavailable. Everyone ${this._getRandomActionString()}!`);
    }
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    
    await sleep(5000);
    await playSong();
  }

  async music_quiz() {
    await pauseSong();
    await updateInformation("Music Quiz Time!\nI'll play 3 songs. First to shout the artist or song name wins each round.");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);

    for (let i = 1; i <= 3; i++) {
      await updateInformation(`Song ${i} of 3`);
      while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
      
      try {
        const result = await queueRandomSongFromPlaylist("37i9dQZF1DXcBWIGoYBM5M"); // Top 50 Global
        if (result && result.queuedSong) {
          await skipSong();
          await sleep(20000); // Let song play
          await pauseSong();
          await updateInformation(`That was "${result.queuedSong.name}" by ${result.queuedSong.artist}`);
        } else {
          await updateInformation(`Song ${i} - couldn't queue track`);
        }
        while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
        await sleep(2000);
      } catch (error) {
        console.error("Music quiz error:", error);
        await updateInformation(`Song ${i} - couldn't load track info`);
        while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
        await sleep(2000);
      }
    }

    await updateInformation(`Quiz complete! Winners hand out ${this._getRandomAction()} sips each.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await playSong();
  }

  async categories() {
    await pauseSong();
    const category = this.categories[Math.floor(Math.random() * this.categories.length)];
    const starter = this._getRandomContestant();
    
    await updateInformation(`Category Game!\nCategory: ${category}\n${starter} starts. Keep going until someone fails.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick(`Category: ${category}\n${starter} starts the category game!`);
    // _waitForClick handles its own speech waiting
    await updateInformation(`Game complete! The loser must ${this._getRandomActionString()}.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async most_likely() {
    await pauseSong();
    await updateInformation("Most Likely Game!\nI'll make statements. Vote if you think it's true.\nMajority rules!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);

    for (let i = 0; i < 3; i++) {
      const person = this._getRandomContestant();
      const action = this.most_likely_to[Math.floor(Math.random() * this.most_likely_to.length)];
      await updateInformation(`${person} is most likely to ${action}.`);
      while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
      await this._waitForClick("Vote now! Click when voting is complete.");
      // _waitForClick handles its own speech waiting
    }

    await updateInformation("Voting complete! Majority winners hand out drinks, losers drink!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await playSong();
  }

  async waterfall() {
    await pauseSong();
    const starter = this._getRandomContestant();
    await updateInformation(`Waterfall!\n${starter} starts drinking and chooses direction.\nNext person can't stop until the person before them stops.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    
    if (this.rigged) {
      await sleep(2000); // Wait for initial message to finish before this one
      await updateInformation(`Special rule: Start next to ${this.rigged} so it ends on them!`);
      while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    }
    
    await sleep(5000);
    await playSong();
  }

  async lyrical_master() {
    await pauseSong();
    await updateInformation("Lyrical Master!\nGuess the song from these lyrics:");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    
    const randomLyric = this.lyrics[Math.floor(Math.random() * this.lyrics.length)];
    const [artist, song, text] = randomLyric;
    
    await updateInformation(text, { override: true });
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(8000);
    await updateInformation(`The song was "${song}" by ${artist}.\nCorrect guessers may ${this._getRandomActionString()}.`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await playSong();
  }

  async last_to() {
    await pauseSong();
    const activities = ["dab", "stand up", "touch their nose", "raise their hand", "clap"];
    const activity = activities[Math.floor(Math.random() * activities.length)];
    
    await updateInformation(`Last person to ${activity}...`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await updateInformation(`Must ${this._getRandomActionString()}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async grimace() {
    await pauseSong();
    await updateInformation("Grimace contest! Make your best funny face!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await updateInformation("Point at the best grimace!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick("Vote for the best grimace!");
    // _waitForClick handles its own speech waiting
    await updateInformation(`Winner may ${this._getRandomActionString()}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async build() {
    await pauseSong();
    const time = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];
    await updateInformation(`Build the highest tower with your empty cans!\nYou have ${time} seconds!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    
    await this._waitForClick("Click when ready to start the timer!");
    // _waitForClick handles its own speech waiting
    await updateInformation(`GO! Building for ${time} seconds...`);
    // No wait after "GO!" as it's an action trigger
    await sleep(time * 1000);
    await updateInformation("Time's up! Stop building!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick("Compare towers and determine the winner!");
    // _waitForClick handles its own speech waiting
    await updateInformation(`Winner may ${this._getRandomActionString()}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async snacks() {
    await pauseSong();
    const starter = this._getRandomContestant();
    await updateInformation(`Snack toss!\n${starter} starts.\nFirst to catch a snack in their mouth wins!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick("Play until someone successfully catches a snack!");
    // _waitForClick handles its own speech waiting
    await updateInformation(`Winner may ${this._getRandomActionString()}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async mime() {
    await pauseSong();
    const person = this._getRandomContestant();
    const time = [15, 20, 25, 30][Math.floor(Math.random() * 4)];
    
    await updateInformation(`Mime time!\n${person}, you have ${time} seconds to act something out!`);
    // No wait after this, as the timer starts immediately
    await sleep(time * 1000);
    await updateInformation("Time's up! Did everyone guess correctly?");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick("Determine who guessed correctly!");
    // _waitForClick handles its own speech waiting
    await updateInformation("If nobody guessed, the mime drinks. Otherwise, wrong guessers drink!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async thumb_war() {
    if (this.contestants.length < 2) return;
    
    await pauseSong();
    const shuffled = [...this.contestants].sort(() => 0.5 - Math.random());
    const [person1, person2] = shuffled.slice(0, 2);
    const name1 = typeof person1 === 'string' ? person1 : person1.name;
    const name2 = typeof person2 === 'string' ? person2 : person2.name;
    
    await updateInformation(`Thumb war!\n${name1} vs ${name2}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await this._waitForClick("Battle it out! Click when the thumb war is finished.");
    // _waitForClick handles its own speech waiting
    
    const winner = Math.random() < 0.5 ? "winner" : "loser";
    await updateInformation(`The ${winner} must ${this._getRandomActionString()}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async slap_the_mini() {
    await pauseSong();
    await updateInformation("Find the shortest person and give them a playful tap!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await updateInformation(`The shortest person may ${this._getRandomActionString()}!`);
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong();
  }

  async karin_henter_x() {
    await pauseSong();
    await updateInformation("Beer run!\nKarin (or designated person) fetches drinks for everyone!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(5000);
    await updateInformation("Enjoy your drinks!");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(3000);
    await playSong();
  }

  async andreas_round_x() {
    await pauseSong();
    await updateInformation("Andreas' special round!\nWhat song is currently playing?");
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    await sleep(2000);
    await playSong(); // Song starts playing
    await sleep(15000); // Let song play
    await pauseSong();
    
    try {
      const current = await getCurrentSong();
      if (current && current.data) {
        await updateInformation(`It was "${current.data.name}" by ${current.data.artist}!`);
      } else {
        await updateInformation("Song info unavailable!");
      }
    } catch (error) {
      console.error("Andreas round error:", error);
      await updateInformation("Song info unavailable!");
    }
    while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
    
    await sleep(3000);
    await playSong();
  }

  async _waitForClick(message) {
    this.waitingForClick = true;
    if (typeof window !== 'undefined' && window.waitForClick) {
      await window.waitForClick(message); // This will call updateInformation, which now handles speaking
    } else {
      // Fallback for when window.waitForClick is not available
      await updateInformation(message + "\n\nPress any key to continue...");
      while (this.isSpeaking && this.isRunning) { await sleep(100); } if (!this.isRunning) return;
      await sleep(5000); // Additional wait if needed after speech
    }
    this.waitingForClick = false;
  }
}