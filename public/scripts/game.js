window.onload = initializeGame;

function updateInformation(content) {
  const gameInformation = document.getElementById("game-information");
  gameInformation.textContent = content;
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

function initializeGame() {
  const settings = loadSettings();
  const delay = loadDelay();
  const game = new Game(settings, delay);
  game._start();
}

class Game {
  constructor(settings, delay) {
    this.contestants = settings.contestants;
    this.difficulty = settings.difficulty;
    this.delay = [1, delay];

    this.action = {
      low: [1, 2, 3, 4, 5],
      medium: [3, 4, 5, 6],
      high: [5, 6, 7, 8],
    };

    this.modes = {};

    // Get all method names from the prototype
    const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(this)).filter(
      (method) => !method.startsWith("_") && typeof this[method] === "function",
    );

    // Create entries in this.modes with properly formatted keys
    for (const method of methodNames) {
      const formattedMethodName = method
        .replace(/^(\w)/, (c) => c.toUpperCase())
        .replace(/_/g, " ");

      // Bind the method to 'this' to ensure proper context when called
      this.modes[method] = this[method].bind(this);
    }

    console.log(this.modes);
  }

  _addMode(mode) {
    this.activated.addItem(mode);
    this.activated.sortItems();
  }

  _removeMode(mode) {
    this.activated.takeItem(this.activated.row(mode));
  }

  async _start() {
    await pauseSong();
    updateInformation(
      `Welcome to the drinking,\n
      ${this.contestants.map((contestant) => contestant.name).join(" and ")}.\n
      Let the games begin!`,
    );
    await playSong();

    this._gameLoop();
  }

  async _gameLoop() {
    try {
      const modeKeys = Object.keys(this.modes);
      const randomKey = modeKeys[Math.floor(Math.random() * modeKeys.length)];
      this.modes[randomKey]();
    } catch (error) {
      if (!(error instanceof ValueError)) {
        throw error;
      }
    }

    const wait = Math.floor(Math.random() * (this.delay[1] - this.delay[0] + 1)) + this.delay[0];
  }

  async _getRandomAction() {
    return this.action[this.difficulty][
      Math.floor(Math.random() * this.action[this.difficulty].length)
    ];
  }

  async _getRandomActionString() {
    const what = this._getRandomAction();
    return `drink ${what}`, `hand out ${what}`;
  }

  async _getRandomContestant() {
    return this.rigged || this.contestants[Math.floor(Math.random() * this.contestants.length)];
  }

  async draw() {
    await pauseSong();

    const person = this._getRandomContestant();
    updateInformation(`
      Hello... Everyone, look at me!\n
      I am the host of the game, and I would like ${person} to draw me a picture.\n
      The others must guess what it is. Close the drawing when you are ready to continue.
    `);

    await playSong();

    await pauseSong();
    updateInformation(`The drawing is done. ${person}, what is it?`);
    setTimeout(() => {}, 4000);

    const what = this._getRandomAction();
    const actions = [
      `the losers has to drink ${what}`,
      `the losers may hand out ${what}`,
      `the winners may hand out ${what}`,
      `the winners may drink ${what}`,
    ];
    const action = actions[Math.floor(Math.random() * actions.length)];

    updateInformation(
      `If everyone or no-one guessed correctly, the artist has to ${what}. Otherwise, ${action}`,
    );

    await playSong();
  }

  async drink_bitch() {
    const the_bitch = this._getRandomContestant();

    await pauseSong();
    updateInformation("Could I get your attention, please?");
    setTimeout(() => {}, 2000);
    updateInformation(`${the_bitch} drink. Bitch.`);
    await playSong();
  }

  async music_length() {
    const playback = await getCurrentSong();
    const length = playback.data.duration_ms / 60000;
    const minutes = Math.floor(length);
    const seconds = Math.floor((length - minutes) * 60);

    await pauseSong();
    setTimeout(() => {}, 1000);
    updateInformation("How long is the song that you just listened to?");

    this._pauseForMusic(() => {
      updateInformation(`The answer is ${minutes} minutes and ${seconds} seconds.`);
      updateInformation(
        `The closest answer wins and that person may ${this._getRandomActionString()}.`,
      );
    });
  }

  async music_year() {
    const playback = await getCurrentSong();
    const year = playback.data.release.substring(0, 4);

    await pauseSong();
    setTimeout(() => {}, 1000);
    updateInformation("When did the song that you just listened to come out?");

    this._pauseForMusic(() => {
      updateInformation(`The song was from ${year}.`);
      updateInformation(
        `The closest answer wins and that person may ${this._getRandomActionString()}.`,
      );
    });
  }

  async music_quiz() {
    await pauseSong();

    updateInformation("Welcome to the music quiz.");
    updateInformation("I am going to play three songs for you.");
    updateInformation("The first person to shout out the name of the song or the artist wins");
    updateInformation("and may hand out one to two sips.");

    for (let i = 1; i <= 3; i++) {
      updateInformation(i !== 3 ? `Song number ${i}` : "Last song");

      const song = await queueRandomSongFromPlaylist("2sbw07iogIXbWpmOz0U66W");
      await skipSong();

      setTimeout(() => {}, 25000);
      await pauseSong();
      setTimeout(() => {}, 1000);
      updateInformation(`${song.name} by, ${song.artist}`);
    }

    const actions = [
      `handing out ${this._getRandomAction()}`,
      `drinking ${this._getRandomAction()}`,
      "the fact that you are great in bed",
      "the fact that you are a great person",
      "the fact that you are a great friend",
    ];
    const action = actions[Math.floor(Math.random() * actions.length)];

    updateInformation(`If you got all correct, you may comfort yourself by ${action}.`);
    await skipSong();
  }

  async categories() {
    await pauseSong();

    const category = this.categories[Math.floor(Math.random() * this.categories.length)];
    const starting = this._getRandomContestant();

    updateInformation("This is the category game.");
    updateInformation("Say something within the category until someone fails.");
    updateInformation("Click to continue.");
    updateInformation("The category is:");
    updateInformation(`${category}, and ${starting} is starting.`);

    setTimeout(() => {}, 1000);
    updateInformation(`The loser has to ${this._getRandomActionString()}.`);
    setTimeout(() => {}, 1000);
    await playSong();
  }

  async most_likely() {
    await pauseSong();
    updateInformation("Shut up! This is the most likely game.");
    updateInformation("I will read a statement plus name, and you will decide if it is true.");
    updateInformation("If the majority says it is true, the person has to drink.");
    updateInformation("If the majority says it is false, the person can give out 3 sips.");

    for (let i = 0; i < 3; i++) {
      const person = this._getRandomContestant();
      const action = this.most_likely_to[Math.floor(Math.random() * this.most_likely_to.length)];
      updateInformation(`${person} is the most likely to ${action}`);
      setTimeout(() => {}, 10000);
    }

    await playSong();
  }

  async waterfall() {
    await pauseSong();
    updateInformation("Shut your mouth and pay attention. The next game is waterfall.");

    const person = this.contestants[Math.floor(Math.random() * this.contestants.length)];
    updateInformation(`${person} starts and decides the direction.`);

    if (this.rigged) {
      setTimeout(() => {}, 1000);
      updateInformation("Hold that thought. I have a special announcement.");
      setTimeout(() => {}, 1000);
      updateInformation(
        `I want the person next to ${this.rigged} to start, so that the waterfall ends on ${this.rigged}.`,
      );
    }

    setTimeout(() => {}, 2000);
    await playSong();
  }

  async lyrical_master() {
    await pauseSong();
    updateInformation("Welcome to the lyrical master.");
    updateInformation("I will read some lyrics, and you must guess the song.");

    const randomLyric = this.lyrics[Math.floor(Math.random() * this.lyrics.length)];
    const [artist, song, text] = randomLyric;

    updateInformation(text.trim(), { override: true });
    setTimeout(() => {}, 5000);
    updateInformation(`The song was ${song} by ${artist}`);
    updateInformation(`The winner has to ${this._getRandomActionString()}.`);
    await playSong();
  }

  async last_to() {
    await pauseSong();
    updateInformation("Last person who");

    const activities = ["Dabs", "Drinks", "Takes a shot", "Stands up", "Lays down"];
    const activity = activities[Math.floor(Math.random() * activities.length)];
    updateInformation(activity);

    setTimeout(() => {}, 2000);
    updateInformation(`May ${this._getRandomActionString()}.`);
    await playSong();
  }

  async grimace() {
    await pauseSong();
    updateInformation("Everyone make a grimace!");
    setTimeout(() => {}, 2000);
    updateInformation("Point at the person with the best grimace.");
    setTimeout(() => {}, 8000);
    updateInformation(`The winner must ${this._getRandomActionString()}`);
    setTimeout(() => {}, 1000);
    await playSong();
  }

  async build() {
    await pauseSong();
    updateInformation("The person to build the highest tower of HIS OWN empty cans wins.");

    const delays = [2, 5, 10, 12, 15, 17];
    const delay = delays[Math.floor(Math.random() * delays.length)];
    updateInformation(`You have ${delay} seconds.`);
    setTimeout(() => {}, delay * 1000);
    updateInformation("Stop!");
    setTimeout(() => {}, 2000);

    const what = this._getRandomAction();
    const actions = [
      `drink ${what}`,
      `hand out ${what}`,
      "give out the amount of cans in your tower.",
      "sip the amount of cans in your tower.",
    ];
    const action = actions[Math.floor(Math.random() * actions.length)];
    updateInformation(`The winner must ${action}`);
    setTimeout(() => {}, 2000);
    await playSong();
  }

  async snacks() {
    await pauseSong();
    updateInformation("One person at a time must try and throw snacks into their mouth.");
    updateInformation("The first person to manage it wins.");
    updateInformation(
      `${this.contestants[Math.floor(Math.random() * this.contestants.length)]} starts.`,
    );
    updateInformation("Click to continue");

    const what = this._getRandomAction();
    const actions = [
      `drink ${what}`,
      `hand out ${what}`,
      "give out as many sips as tries it took.",
      "drink as many sips as tries it took.",
    ];
    const action = actions[Math.floor(Math.random() * actions.length)];
    updateInformation(`The winner must ${action}`);
    setTimeout(() => {}, 5000);
    await playSong();
  }

  async mime() {
    await pauseSong();
    updateInformation("Miming game! Think of what you are going to mime!");
    setTimeout(() => {}, 5000);

    const delays = [5, 10, 12, 15, 17, 20];
    const delay = delays[Math.floor(Math.random() * delays.length)];
    const person = this._getRandomContestant();

    updateInformation(`${person} is miming and has ${delay} seconds.`);
    setTimeout(() => {}, delay * 1000);
    updateInformation("Stop!");
    updateInformation("Those who could not guess has to drink.");
    updateInformation("If no one managed, the mime must drink.");
    setTimeout(() => {}, 2000);
    await playSong();
  }

  async thumb_war() {
    try {
      const shuffled = [...this.contestants].sort(() => 0.5 - Math.random());
      const [person_1, person_2] = shuffled.slice(0, 2);
      await pauseSong();
      updateInformation(`Thumb war between ${person_1} and ${person_2}!`);

      const what = this._getRandomAction();
      const actions = [
        `drink ${what}`,
        `hand out ${what}`,
        "give out as many sips as tries it took.",
        "drink as many sips as tries it took.",
      ];
      const action = actions[Math.floor(Math.random() * actions.length)];
      const person = Math.random() < 0.5 ? "winner" : "loser";

      updateInformation(`The ${person} must ${action}`);
      setTimeout(() => {}, 20000);
      await playSong();
    } catch (error) {
      return;
    }
  }

  async slap_the_mini() {
    await pauseSong();
    updateInformation("Slap the closest mini!");
    setTimeout(() => {}, 2000);

    const what = this._getRandomAction();
    const actions = [
      `drink ${what}`,
      `hand out ${what}`,
      "give out as many sips as slaps.",
      "drink as many sips as slaps.",
    ];
    const action = actions[Math.floor(Math.random() * actions.length)];
    updateInformation(`The slapped minis must ${action}`);
    await playSong();
  }

  async karin_henter_x() {
    await pauseSong();
    updateInformation("Beer-round!");
    updateInformation("Karin fetches drinks to everyone that wants!");
    setTimeout(() => {}, 10000);
    await playSong();
  }

  async andreas_round_x() {
    await pauseSong();
    updateInformation("Andreas' round!");
    setTimeout(() => {}, 2000);
    updateInformation("Which song is this?");
    setTimeout(() => {}, 1000);
    await playSong();
  }
}
