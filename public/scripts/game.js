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
    this.delayRange = [1, delay];
    this.isRunning = false;
    this.currentMode = null;
    this.waitingForClick = false;
    this.isCurrentlyWaiting = false; // Flag to show _waitForClick is active
    this.currentClickPromiseResolve = null;
    this.currentClickPromiseReject = null;
    this.skipRequested = false; // New property for skipping
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
    let pauseResult = await pauseSong();
    if (pauseResult && pauseResult.error) {
      console.warn("Spotify API call failed in _start (pauseSong):", pauseResult.details);
      updateInformation("Spotify feature unavailable at the moment. Game will start without music control.");
      if (pauseResult.details && pauseResult.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    }

    const contestantNames = this.contestants.map(c => typeof c === 'string' ? c : c.name);
    updateInformation(
      `Welcome to the drinking game!\n${contestantNames.join(", ")}.\nLet the games begin!`
    );
    updateGameMode("Starting Game", "Preparing for fun!");
    
    await this._interruptibleSleep(3000);
    if (!this.isRunning && !this.skipRequested) return; // Check after sleep, skipRequested can be set by pause during sleep
    
    let playResult = await playSong();
    if (playResult && playResult.error) {
      console.warn("Spotify API call failed in _start (playSong):", playResult.details);
      updateInformation("Could not start Spotify playback. Game will continue without music control.");
      if (playResult.details && playResult.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    }

    this.isRunning = true; // isRunning should be true before gameLoop
    this._gameLoop();
  }

  async _interruptibleSleep(durationInMs, checkIntervalMs = 100) {
    let elapsedTime = 0;
    while (elapsedTime < durationInMs) {
      if (!this.isRunning || this.skipRequested) {
        console.log(`Sleep interrupted. isRunning: ${this.isRunning}, skipRequested: ${this.skipRequested}`);
        return;
      }
      const timeToSleep = Math.min(checkIntervalMs, durationInMs - elapsedTime);
      await sleep(timeToSleep); // sleep is the original non-interruptible setTimeout Promise
      elapsedTime += timeToSleep;
    }
  }

  async _gameLoop() {
    while (this.isRunning) {
      this.skipRequested = false; // Reset at the beginning of each loop iteration
      try {
        const modeKeys = Object.keys(this.gameModes);
        const randomKey = modeKeys[Math.floor(Math.random() * modeKeys.length)];
        const selectedMode = this.gameModes[randomKey];
        
        this.currentMode = randomKey;
        updateGameMode(selectedMode.name, selectedMode.description);
        
        console.log(`Starting game mode: ${selectedMode.name}`);
        await selectedMode.func();
        
        if (this.skipRequested) {
          console.log("Skip requested after mode execution, cycling to next mode immediately.");
          // this.skipRequested will be reset at the start of the next iteration.
          continue;
        }
        if (!this.isRunning) break;
        
        const waitTime = Math.floor(Math.random() * (this.delayRange[1] - this.delayRange[0] + 1)) + this.delayRange[0];
        console.log(`Waiting ${waitTime} seconds before next game...`);
        updateGameMode("Waiting", `Next game in ${waitTime} seconds...`);
        
        await this._interruptibleSleep(waitTime * 1000);

        if (this.skipRequested) {
          console.log("Skip requested during inter-mode wait, cycling to next mode immediately.");
          // this.skipRequested will be reset at the start of the next iteration.
          continue;
        }
        if (!this.isRunning) break; // Check again after sleep
        
      } catch (error) {
        if (error.message === 'Mode skipped') {
          console.log("Game loop caught skip signal for the current mode.");
          // this.skipRequested is already true, or was true. It will be reset at the loop's start.
          continue; // Proceed to next mode
        } else if (error.message === 'Game paused') {
          console.log("Game loop caught pause signal.");
          // isRunning should be false, loop will terminate naturally
          break;
        }
        // For other errors, log and continue if possible
        console.error("Error in game loop:", error);
        updateInformation("Something went wrong, but the game continues!");
        await this._interruptibleSleep(2000); // Use interruptible sleep
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
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in draw (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
      if (pauseRes.details && pauseRes.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    }
    if (this.skipRequested || !this.isRunning) return;

    const person = this._getRandomContestant();
    updateInformation(`Attention everyone!\n${person}, you need to draw something for the others to guess.\nThe others must try to figure out what it is.`);
    
    await this._waitForClick("Drawing time! When the drawing is complete, click to continue.");
    if (this.skipRequested || !this.isRunning) return;
    
    updateInformation(`Time to reveal! ${person}, show everyone what you drew.`);
    await this._waitForClick("Everyone guess what the drawing is!");
    if (this.skipRequested || !this.isRunning) return;
    
    const amount = this._getRandomAction();
    const outcomes = [
      `If everyone guessed correctly, ${person} drinks ${amount}`,
      `If nobody guessed correctly, ${person} drinks ${amount}`,
      `If some guessed correctly, the wrong guessers drink ${amount}`,
      `If some guessed correctly, the correct guessers hand out ${amount}`
    ];
    
    updateInformation(outcomes[Math.floor(Math.random() * outcomes.length)]);
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in draw (playSong):", playRes.details);
      // Non-critical, game continues
    }
  }

  async drink_bitch() {
    const person = this._getRandomContestant();
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in drink_bitch (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Attention please!");
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    updateInformation(`${person}, drink up!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in drink_bitch (playSong):", playRes.details);
    }
  }

  async music_length() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in music_length (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Cannot fetch song details.");
      if (pauseRes.details && pauseRes.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
      // Game mode cannot proceed without song
      await this._interruptibleSleep(3000); return;
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("How long is the song that just played?");
    await this._interruptibleSleep(5000);
    if (this.skipRequested || !this.isRunning) return;
    
    const current = await getCurrentSong();
    if (current && current.error) {
      console.warn("Spotify API call failed in music_length (getCurrentSong):", current.details);
      updateInformation("Could not load song details. Skipping this part.");
      if (current.details && current.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    } else if (current && current.data) {
      const minutes = Math.floor(current.data.duration / 60000);
      const seconds = Math.floor((current.data.duration % 60000) / 1000);
      updateInformation(`The song is ${minutes} minutes and ${seconds} seconds long.\nClosest guess wins and may ${this._getRandomActionString()}.`);
    } else {
      updateInformation(`Couldn't get song info. Everyone ${this._getRandomActionString()}!`);
    }
    
    await this._interruptibleSleep(5000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in music_length (playSong):", playRes.details);
    }
  }

  async music_year() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in music_year (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Cannot fetch song details.");
      if (pauseRes.details && pauseRes.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
      await this._interruptibleSleep(3000); return;
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("What year was the song that just played released?");
    await this._interruptibleSleep(5000);
    if (this.skipRequested || !this.isRunning) return;
    
    const current = await getCurrentSong();
    if (current && current.error) {
      console.warn("Spotify API call failed in music_year (getCurrentSong):", current.details);
      updateInformation("Could not load song release year. Skipping this part.");
      if (current.details && current.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    } else if (current && current.data && current.data.release) {
      const year = current.data.release.substring(0, 4);
      updateInformation(`The song was released in ${year}.\nClosest guess wins and may ${this._getRandomActionString()}.`);
    } else {
      updateInformation(`Couldn't get release info. Everyone ${this._getRandomActionString()}!`);
    }
    
    await this._interruptibleSleep(5000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in music_year (playSong):", playRes.details);
    }
  }

  async music_quiz() {
    let initialPauseRes = await pauseSong();
    if (initialPauseRes && initialPauseRes.error) {
      console.warn("Spotify API call failed in music_quiz (initial pauseSong):", initialPauseRes.details);
      updateInformation("Spotify feature unavailable. Cannot start music quiz.");
      if (initialPauseRes.details && initialPauseRes.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
      await this._interruptibleSleep(3000); return;
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Music Quiz Time!\nI'll play 3 songs. First to shout the artist or song name wins each round.");
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    for (let i = 1; i <= 3; i++) {
      if (this.skipRequested || !this.isRunning) return;
      updateInformation(`Song ${i} of 3`);
      
      const queueResult = await queueRandomSongFromPlaylist("37i9dQZF1DXcBWIGoYBM5M"); // Top 50 Global
      if (this.skipRequested || !this.isRunning) return;

      if (queueResult && queueResult.error) {
        console.warn(`Spotify API call failed in music_quiz (queueRandomSongFromPlaylist song ${i}):`, queueResult.details);
        updateInformation(`Song ${i} - couldn't queue track. Spotify feature may be unavailable.`);
        if (queueResult.details && queueResult.details.needsReAuth) {
           updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
        }
        await this._interruptibleSleep(2000);
        if (this.skipRequested || !this.isRunning) return;
        continue; // Try next song or finish quiz
      }

      if (queueResult && queueResult.queuedSong) {
        let skipRes = await skipSong(); // Spotify API call
        if (skipRes && skipRes.error) {
            console.warn(`Spotify API call failed in music_quiz (skipSong ${i}):`, skipRes.details);
            updateInformation(`Song ${i} - couldn't skip to queued track. Attempting to continue quiz.`);
             if (skipRes.details && skipRes.details.needsReAuth) {
                updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
            }
        }
        if (this.skipRequested || !this.isRunning) return;

        await this._interruptibleSleep(20000); // Listen to song
        if (this.skipRequested || !this.isRunning) return;

        let pauseResLoop = await pauseSong(); // Spotify API call
        if (pauseResLoop && pauseResLoop.error) {
            console.warn(`Spotify API call failed in music_quiz (pauseSong ${i}):`, pauseResLoop.details);
            updateInformation(`Song ${i} - failed to pause after playing.`);
        }
        if (this.skipRequested || !this.isRunning) return;
        updateInformation(`That was "${queueResult.queuedSong.name}" by ${queueResult.queuedSong.artist}`);
      } else {
        updateInformation(`Song ${i} - couldn't queue track (no specific error).`);
      }
      await this._interruptibleSleep(2000);
      if (this.skipRequested || !this.isRunning) return;
    }

    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`Quiz complete! Winners hand out ${this._getRandomAction()} sips each.`);
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    let finalPlayRes = await playSong();
    if (finalPlayRes && finalPlayRes.error) {
      console.warn("Spotify API call failed in music_quiz (final playSong):", finalPlayRes.details);
    }
  }

  async categories() {
    let pauseRes = await pauseSong();
     if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in categories (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const category = this.categories[Math.floor(Math.random() * this.categories.length)];
    const starter = this._getRandomContestant();
    
    updateInformation(`Category Game!\nCategory: ${category}\n${starter} starts. Keep going until someone fails.`);
    await this._waitForClick(`Category: ${category}\n${starter} starts the category game!`);
    if (this.skipRequested || !this.isRunning) return;

    updateInformation(`Game complete! The loser must ${this._getRandomActionString()}.`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in categories (playSong):", playRes.details);
    }
  }

  async most_likely() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in most_likely (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Most Likely Game!\nI'll make statements. Vote if you think it's true.\nMajority rules!");
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    for (let i = 0; i < 3; i++) {
      if (this.skipRequested || !this.isRunning) return;
      const person = this._getRandomContestant();
      const action = this.most_likely_to[Math.floor(Math.random() * this.most_likely_to.length)];
      updateInformation(`${person} is most likely to ${action}.`);
      await this._waitForClick("Vote now! Click when voting is complete.");
      if (this.skipRequested || !this.isRunning) return;
    }
    if (this.skipRequested || !this.isRunning) return;
    updateInformation("Voting complete! Majority winners hand out drinks, losers drink!");
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in most_likely (playSong):", playRes.details);
    }
  }

  async waterfall() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in waterfall (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const starter = this._getRandomContestant();
    updateInformation(`Waterfall!\n${starter} starts drinking and chooses direction.\nNext person can't stop until the person before them stops.`);
    
    if (this.rigged) {
      await this._interruptibleSleep(2000);
      if (this.skipRequested || !this.isRunning) return;
      updateInformation(`Special rule: Start next to ${this.rigged} so it ends on them!`);
    }
    
    await this._interruptibleSleep(5000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in waterfall (playSong):", playRes.details);
    }
  }

  async lyrical_master() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in lyrical_master (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Lyrical Master!\nGuess the song from these lyrics:");
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;
    
    const randomLyric = this.lyrics[Math.floor(Math.random() * this.lyrics.length)];
    const [artist, song, text] = randomLyric;
    
    updateInformation(text, { override: true });
    await this._interruptibleSleep(8000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`The song was "${song}" by ${artist}.\nCorrect guessers may ${this._getRandomActionString()}.`);
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in lyrical_master (playSong):", playRes.details);
    }
  }

  async last_to() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in last_to (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const activities = ["dab", "stand up", "touch their nose", "raise their hand", "clap"];
    const activity = activities[Math.floor(Math.random() * activities.length)];
    
    updateInformation(`Last person to ${activity}...`);
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`Must ${this._getRandomActionString()}!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in last_to (playSong):", playRes.details);
    }
  }

  async grimace() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in grimace (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Grimace contest! Make your best funny face!");
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation("Point at the best grimace!");
    await this._waitForClick("Vote for the best grimace!");
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`Winner may ${this._getRandomActionString()}!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in grimace (playSong):", playRes.details);
    }
  }

  async build() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in build (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const time = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];
    updateInformation(`Build the highest tower with your empty cans!\nYou have ${time} seconds!`);
    
    await this._waitForClick("Click when ready to start the timer!");
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`GO! Building for ${time} seconds...`);
    await this._interruptibleSleep(time * 1000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation("Time's up! Stop building!");
    await this._waitForClick("Compare towers and determine the winner!");
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`Winner may ${this._getRandomActionString()}!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in build (playSong):", playRes.details);
    }
  }

  async snacks() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in snacks (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const starter = this._getRandomContestant();
    updateInformation(`Snack toss!\n${starter} starts.\nFirst to catch a snack in their mouth wins!`);
    await this._waitForClick("Play until someone successfully catches a snack!");
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`Winner may ${this._getRandomActionString()}!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in snacks (playSong):", playRes.details);
    }
  }

  async mime() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in mime (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const person = this._getRandomContestant();
    const time = [15, 20, 25, 30][Math.floor(Math.random() * 4)];
    
    updateInformation(`Mime time!\n${person}, you have ${time} seconds to act something out!`);
    await this._interruptibleSleep(time * 1000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation("Time's up! Did everyone guess correctly?");
    await this._waitForClick("Determine who guessed correctly!");
    if (this.skipRequested || !this.isRunning) return;
    updateInformation("If nobody guessed, the mime drinks. Otherwise, wrong guessers drink!");
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in mime (playSong):", playRes.details);
    }
  }

  async thumb_war() {
    if (this.contestants.length < 2) {
        updateInformation("Not enough players for Thumb War. Skipping.");
        await this._interruptibleSleep(2000);
        return;
    }
    
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in thumb_war (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    const shuffled = [...this.contestants].sort(() => 0.5 - Math.random());
    const [person1, person2] = shuffled.slice(0, 2);
    const name1 = typeof person1 === 'string' ? person1 : person1.name;
    const name2 = typeof person2 === 'string' ? person2 : person2.name;
    
    updateInformation(`Thumb war!\n${name1} vs ${name2}!`);
    await this._waitForClick("Battle it out! Click when the thumb war is finished.");
    if (this.skipRequested || !this.isRunning) return;
    
    const winner = Math.random() < 0.5 ? "winner" : "loser"; // This is silly, but keeps original logic
    updateInformation(`The ${winner} must ${this._getRandomActionString()}!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in thumb_war (playSong):", playRes.details);
    }
  }

  async slap_the_mini() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in slap_the_mini (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Find the shortest person and give them a playful tap!");
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation(`The shortest person may ${this._getRandomActionString()}!`);
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in slap_the_mini (playSong):", playRes.details);
    }
  }

  async karin_henter_x() {
    let pauseRes = await pauseSong();
    if (pauseRes && pauseRes.error) {
      console.warn("Spotify API call failed in karin_henter_x (pauseSong):", pauseRes.details);
      updateInformation("Spotify feature unavailable. Continuing without music changes.");
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Beer run!\nKarin (or designated person) fetches drinks for everyone!");
    await this._interruptibleSleep(5000);
    if (this.skipRequested || !this.isRunning) return;
    updateInformation("Enjoy your drinks!");
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes = await playSong();
    if (playRes && playRes.error) {
      console.warn("Spotify API call failed in karin_henter_x (playSong):", playRes.details);
    }
  }

  async andreas_round_x() {
    let pauseRes1 = await pauseSong();
    if (pauseRes1 && pauseRes1.error) {
      console.warn("Spotify API call failed in andreas_round_x (first pauseSong):", pauseRes1.details);
      updateInformation("Spotify feature unavailable. Cannot start Andreas' round.");
      if (pauseRes1.details && pauseRes1.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
      await this._interruptibleSleep(3000); return;
    }
    if (this.skipRequested || !this.isRunning) return;

    updateInformation("Andreas' special round!\nWhat song is currently playing?");
    await this._interruptibleSleep(2000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes1 = await playSong();
    if (playRes1 && playRes1.error) {
      console.warn("Spotify API call failed in andreas_round_x (playSong):", playRes1.details);
      updateInformation("Could not play song for Andreas' round. Skipping music part.");
      if (playRes1.details && playRes1.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
      // Continue without music if play fails
    }
    if (this.skipRequested || !this.isRunning) return;

    await this._interruptibleSleep(15000); // Listen to song
    if (this.skipRequested || !this.isRunning) return;

    let pauseRes2 = await pauseSong();
    if (pauseRes2 && pauseRes2.error) {
      console.warn("Spotify API call failed in andreas_round_x (second pauseSong):", pauseRes2.details);
      updateInformation("Failed to pause song. Displaying info anyway.");
       if (pauseRes2.details && pauseRes2.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    }
    if (this.skipRequested || !this.isRunning) return;
    
    const current = await getCurrentSong();
    if (current && current.error) {
      console.warn("Spotify API call failed in andreas_round_x (getCurrentSong):", current.details);
      updateInformation("Could not load current song details.");
      if (current.details && current.details.needsReAuth) {
        updateInformation("Spotify connection issue. Please try re-logging in via the Spotify page if problems persist.");
      }
    } else if (current && current.data) {
      updateInformation(`It was "${current.data.name}" by ${current.data.artist}!`);
    } else {
      updateInformation("Song info unavailable!");
    }
    
    await this._interruptibleSleep(3000);
    if (this.skipRequested || !this.isRunning) return;

    let playRes2 = await playSong();
    if (playRes2 && playRes2.error) {
      console.warn("Spotify API call failed in andreas_round_x (final playSong):", playRes2.details);
    }
  }

  async _waitForClick(message) {
    this.waitingForClick = true;
    this.isCurrentlyWaiting = true;
    console.log(`Game: waiting for click - ${message}`);
    try {
      if (typeof window !== 'undefined' && window.waitForClick) {
        // window.waitForClick will now manage the promise and use gameInstance's resolve/reject
        await window.waitForClick(message, this);
      } else {
        // Fallback for when window.waitForClick is not available (e.g. testing without full browser env)
        updateInformation(message + "\n\n(Fallback) No click handler, proceeding in 5s...");
        await sleep(5000); // Fallback if window.waitForClick isn't there
      }
    } catch (error) {
      console.warn("Game._waitForClick interrupted:", error.message);
      // If the wait was interrupted (e.g., by pause or skip),
      // this.waitingForClick should have been set to false by the interrupting function.
      // Re-throw the error so the game loop or other control functions can catch it.
      throw error;
    } finally {
      this.isCurrentlyWaiting = false;
      // this.waitingForClick is primarily managed by:
      // 1. _waitForClick setting it true at the start.
      // 2. resolvePromiseAndCleanup or rejectPromiseAndCleanup (in game.ejs) setting it false.
      // This ensures that even if an error occurs, if it wasn't an explicit interruption,
      // the state might still need to be reset.
      // However, the promise cleanup functions are the main place to set it false.
      // If currentClickPromiseResolve/Reject still exist, it means an issue happened before cleanup.
      if (this.currentClickPromiseResolve || this.currentClickPromiseReject) {
          console.warn("_waitForClick finished, but promise handlers were not cleared. This might indicate an issue.");
          // Force cleanup here as a safeguard, though ideally game.ejs handles it.
          this.currentClickPromiseResolve = null;
          this.currentClickPromiseReject = null;
          // this.waitingForClick = false; // Let's rely on game.ejs to set this
      }
    }
  }
}