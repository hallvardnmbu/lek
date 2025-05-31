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
  return parseInt(sessionStorage.getItem("delay") || "1");
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

function initializeGame() {
  const settings = loadSettings();
  const delay = loadDelay();
  const game = new Game(settings, delay);
  window.game = game; // Expose globally for controls
  game._start();
}

class Game {
  constructor(settings, delay) {
    this.contestants = settings.contestants;
    this.difficulty = settings.difficulty;
    this.delayInMinutes = delay; // Delay is now in minutes
    this.isRunning = false;
    this.currentMode = null;
    this.waitingForClick = false;
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
    updateInformation(
      `Welcome to the drinking game!\n${contestantNames.join(", ")}.\nLet the games begin!`
    );
    updateGameMode("Starting Game", "Preparing for fun!");
    
    await sleep(3000);
    await playSong();
    
    this.isRunning = true;
    this._gameLoop();
  }

  async _gameLoop() {
    while (this.isRunning) {
      try {
        const modeKeys = Object.keys(this.gameModes);
        const randomKey = modeKeys[Math.floor(Math.random() * modeKeys.length)];
        const selectedMode = this.gameModes[randomKey];
        
        this.currentMode = randomKey;
        updateGameMode(selectedMode.name, selectedMode.description);
        
        console.log(`Starting game mode: ${selectedMode.name}`);
        await selectedMode.func();
        
        if (!this.isRunning) break; // Check if game was paused during mode execution
        
        const waitTimeInSeconds = this.delayInMinutes * 60;
        console.log(`Waiting ${this.delayInMinutes} minute(s) (which is ${waitTimeInSeconds} seconds) before next game...`); // 즉 means "that is" or "in other words"
        
        updateGameMode("Waiting", `Next game in ${this.delayInMinutes} minute(s)...`);
        
        // Wait with periodic checks for pause and click interruption
        for (let i = 0; i < waitTimeInSeconds && this.isRunning && !this.waitingForClick; i++) {
          await sleep(1000);
        }
        
      } catch (error) {
        console.error("Error in game loop:", error);
        updateInformation("Something went wrong, but the game continues!");
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
    updateInformation(`Attention everyone!\n${person}, you need to draw something for the others to guess.\nThe others must try to figure out what it is.`);
    
    await this._waitForClick("Drawing time! When the drawing is complete, click to continue.");
    
    updateInformation(`Time to reveal! ${person}, show everyone what you drew.`);
    await this._waitForClick("Everyone guess what the drawing is!");
    
    const amount = this._getRandomAction();
    const outcomes = [
      `If everyone guessed correctly, ${person} drinks ${amount}`,
      `If nobody guessed correctly, ${person} drinks ${amount}`,
      `If some guessed correctly, the wrong guessers drink ${amount}`,
      `If some guessed correctly, the correct guessers hand out ${amount}`
    ];
    
    updateInformation(outcomes[Math.floor(Math.random() * outcomes.length)]);
    await sleep(3000);
    await playSong();
  }

  async drink_bitch() {
    const person = this._getRandomContestant();
    await pauseSong();
    updateInformation("Attention please!");
    await sleep(2000);
    updateInformation(`${person}, drink up!`);
    await sleep(2000);
    await playSong();
  }

  async music_length() {
    await pauseSong();
    updateInformation("How long is the song that just played?");
    await sleep(5000);
    
    try {
      const current = await getCurrentSong();
      if (current && current.data) {
        const minutes = Math.floor(current.data.duration / 60000);
        const seconds = Math.floor((current.data.duration % 60000) / 1000);
        updateInformation(`The song is ${minutes} minutes and ${seconds} seconds long.\nClosest guess wins and may ${this._getRandomActionString()}.`);
      } else {
        updateInformation(`Couldn't get song info. Everyone ${this._getRandomActionString()}!`);
      }
    } catch (error) {
      updateInformation(`Song info unavailable. Everyone ${this._getRandomActionString()}!`);
    }
    
    await sleep(5000);
    await playSong();
  }

  async music_year() {
    await pauseSong();
    updateInformation("What year was the song that just played released?");
    await sleep(5000);
    
    try {
      const current = await getCurrentSong();
      if (current && current.data && current.data.release) {
        const year = current.data.release.substring(0, 4);
        updateInformation(`The song was released in ${year}.\nClosest guess wins and may ${this._getRandomActionString()}.`);
      } else {
        updateInformation(`Couldn't get release info. Everyone ${this._getRandomActionString()}!`);
      }
    } catch (error) {
      updateInformation(`Release info unavailable. Everyone ${this._getRandomActionString()}!`);
    }
    
    await sleep(5000);
    await playSong();
  }

  async music_quiz() {
    await pauseSong();
    updateInformation("Music Quiz Time!\nI'll play 3 songs. First to shout the artist or song name wins each round.");
    await sleep(3000);

    for (let i = 1; i <= 3; i++) {
      updateInformation(`Song ${i} of 3`);
      
      try {
        const result = await queueRandomSongFromPlaylist("37i9dQZF1DXcBWIGoYBM5M"); // Top 50 Global
        if (result && result.queuedSong) {
          await skipSong();
          await sleep(20000);
          await pauseSong();
          updateInformation(`That was "${result.queuedSong.name}" by ${result.queuedSong.artist}`);
        } else {
          updateInformation(`Song ${i} - couldn't queue track`);
        }
        await sleep(2000);
      } catch (error) {
        console.error("Music quiz error:", error);
        updateInformation(`Song ${i} - couldn't load track info`);
        await sleep(2000);
      }
    }

    updateInformation(`Quiz complete! Winners hand out ${this._getRandomAction()} sips each.`);
    await sleep(3000);
    await playSong();
  }

  async categories() {
    await pauseSong();
    const category = this.categories[Math.floor(Math.random() * this.categories.length)];
    const starter = this._getRandomContestant();
    
    updateInformation(`Category Game!\nCategory: ${category}\n${starter} starts. Keep going until someone fails.`);
    await this._waitForClick(`Category: ${category}\n${starter} starts the category game!`);
    updateInformation(`Game complete! The loser must ${this._getRandomActionString()}.`);
    await sleep(2000);
    await playSong();
  }

  async most_likely() {
    await pauseSong();
    updateInformation("Most Likely Game!\nI'll make statements. Vote if you think it's true.\nMajority rules!");
    await sleep(3000);

    for (let i = 0; i < 3; i++) {
      const person = this._getRandomContestant();
      const action = this.most_likely_to[Math.floor(Math.random() * this.most_likely_to.length)];
      updateInformation(`${person} is most likely to ${action}.`);
      await this._waitForClick("Vote now! Click when voting is complete.");
    }

    updateInformation("Voting complete! Majority winners hand out drinks, losers drink!");
    await sleep(3000);
    await playSong();
  }

  async waterfall() {
    await pauseSong();
    const starter = this._getRandomContestant();
    updateInformation(`Waterfall!\n${starter} starts drinking and chooses direction.\nNext person can't stop until the person before them stops.`);
    
    if (this.rigged) {
      await sleep(2000);
      updateInformation(`Special rule: Start next to ${this.rigged} so it ends on them!`);
    }
    
    await sleep(5000);
    await playSong();
  }

  async lyrical_master() {
    await pauseSong();
    updateInformation("Lyrical Master!\nGuess the song from these lyrics:");
    await sleep(2000);
    
    const randomLyric = this.lyrics[Math.floor(Math.random() * this.lyrics.length)];
    const [artist, song, text] = randomLyric;
    
    updateInformation(text, { override: true });
    await sleep(8000);
    updateInformation(`The song was "${song}" by ${artist}.\nCorrect guessers may ${this._getRandomActionString()}.`);
    await sleep(3000);
    await playSong();
  }

  async last_to() {
    await pauseSong();
    const activities = ["dab", "stand up", "touch their nose", "raise their hand", "clap"];
    const activity = activities[Math.floor(Math.random() * activities.length)];
    
    updateInformation(`Last person to ${activity}...`);
    await sleep(3000);
    updateInformation(`Must ${this._getRandomActionString()}!`);
    await sleep(2000);
    await playSong();
  }

  async grimace() {
    await pauseSong();
    updateInformation("Grimace contest! Make your best funny face!");
    await sleep(3000);
    updateInformation("Point at the best grimace!");
    await this._waitForClick("Vote for the best grimace!");
    updateInformation(`Winner may ${this._getRandomActionString()}!`);
    await sleep(2000);
    await playSong();
  }

  async build() {
    await pauseSong();
    const time = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];
    updateInformation(`Build the highest tower with your empty cans!\nYou have ${time} seconds!`);
    
    await this._waitForClick("Click when ready to start the timer!");
    updateInformation(`GO! Building for ${time} seconds...`);
    await sleep(time * 1000);
    updateInformation("Time's up! Stop building!");
    await this._waitForClick("Compare towers and determine the winner!");
    updateInformation(`Winner may ${this._getRandomActionString()}!`);
    await sleep(2000);
    await playSong();
  }

  async snacks() {
    await pauseSong();
    const starter = this._getRandomContestant();
    updateInformation(`Snack toss!\n${starter} starts.\nFirst to catch a snack in their mouth wins!`);
    await this._waitForClick("Play until someone successfully catches a snack!");
    updateInformation(`Winner may ${this._getRandomActionString()}!`);
    await sleep(2000);
    await playSong();
  }

  async mime() {
    await pauseSong();
    const person = this._getRandomContestant();
    const time = [15, 20, 25, 30][Math.floor(Math.random() * 4)];
    
    updateInformation(`Mime time!\n${person}, you have ${time} seconds to act something out!`);
    await sleep(time * 1000);
    updateInformation("Time's up! Did everyone guess correctly?");
    await this._waitForClick("Determine who guessed correctly!");
    updateInformation("If nobody guessed, the mime drinks. Otherwise, wrong guessers drink!");
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
    
    updateInformation(`Thumb war!\n${name1} vs ${name2}!`);
    await this._waitForClick("Battle it out! Click when the thumb war is finished.");
    
    const winner = Math.random() < 0.5 ? "winner" : "loser";
    updateInformation(`The ${winner} must ${this._getRandomActionString()}!`);
    await sleep(2000);
    await playSong();
  }

  async slap_the_mini() {
    await pauseSong();
    updateInformation("Find the shortest person and give them a playful tap!");
    await sleep(3000);
    updateInformation(`The shortest person may ${this._getRandomActionString()}!`);
    await sleep(2000);
    await playSong();
  }

  async karin_henter_x() {
    await pauseSong();
    updateInformation("Beer run!\nKarin (or designated person) fetches drinks for everyone!");
    await sleep(5000);
    updateInformation("Enjoy your drinks!");
    await sleep(3000);
    await playSong();
  }

  async andreas_round_x() {
    await pauseSong();
    updateInformation("Andreas' special round!\nWhat song is currently playing?");
    await sleep(2000);
    await playSong();
    await sleep(15000);
    await pauseSong();
    
    try {
      const current = await getCurrentSong();
      if (current && current.data) {
        updateInformation(`It was "${current.data.name}" by ${current.data.artist}!`);
      } else {
        updateInformation("Song info unavailable!");
      }
    } catch (error) {
      console.error("Andreas round error:", error);
      updateInformation("Song info unavailable!");
    }
    
    await sleep(3000);
    await playSong();
  }

  async _waitForClick(message) {
    this.waitingForClick = true;
    if (typeof window !== 'undefined' && window.waitForClick) {
      await window.waitForClick(message);
    } else {
      // Fallback for when window.waitForClick is not available
      updateInformation(message + "\n\nPress any key to continue...");
      await sleep(5000);
    }
    this.waitingForClick = false;
  }
}