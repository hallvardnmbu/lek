// game/GameModes.js
import { updateInformation, updateGameMode, updateDelay, loadDelay } from '../ui/ui-controller.js';
import { pauseSong, playSong, skipSong, getCurrentSong, queueRandomSongFromAlbum } from '../services/spotify-service.js';
import * as SpeechService from '../services/speech-service.js';
import { ACTIONS, LYRICS, MOST_LIKELY_TO, CATEGORIES } from './data.js';

export class GameModes {
    constructor(game) {
        this.game = game; // Reference to main Game instance for shared state access
    }

    _getRandomAction() {
        const actions = ACTIONS[this.game.difficulty];
        return actions[Math.floor(Math.random() * actions.length)];
    }

    _getRandomActionString() {
        const amount = this._getRandomAction();
        const actions = [`drikke ${amount}`, `dele ut ${amount}`];
        return actions[Math.floor(Math.random() * actions.length)];
    }

    _getRandomContestant() {
        if (this.game.rigged && Math.random() < 0.3) {
            return this.game.rigged;
        }
        const contestant = this.game.contestants[Math.floor(Math.random() * this.game.contestants.length)];
        return typeof contestant === 'string' ? contestant : contestant.name;
    }

    /* ---------------- MODES ---------------- */

    async drink_bitch() {
        const person = this._getRandomContestant();
        await pauseSong();
        await updateInformation("Hør etter!");
        await this.game.wait(2000);
        await updateInformation(`${person}, drikk!`);
        await this.game.wait(2000);
        await playSong();
    }

    async music_length() {
        await pauseSong();
        await updateInformation("Hvor lang er sangen som nettopp spilte?");
        await this.game.wait(5000);

        try {
            const current = await getCurrentSong();
            if (current && current.data) {
                const minutes = Math.floor(current.data.duration / 60000);
                const seconds = Math.floor((current.data.duration % 60000) / 1000);
                await updateInformation(`Sangen er ${minutes} minutter og ${seconds} sekunder lang. Nærmeste gjetning vinner og kan ${this._getRandomActionString()}.`);
            } else {
                await updateInformation(`Kunne ikke hente sanginfo. Alle må ${this._getRandomActionString()}!`);
            }
        } catch (error) {
            await updateInformation(`Sanginfo utilgjengelig. Alle må ${this._getRandomActionString()}!`);
        }

        await this.game.wait(5000);
        await playSong();
    }

    async music_year() {
        await pauseSong();
        await updateInformation("Hvilket år ble sangen som nettopp spilte utgitt?");
        await this.game.wait(5000);

        try {
            const current = await getCurrentSong();
            if (current && current.data && current.data.release) {
                const year = current.data.release.substring(0, 4);
                await updateInformation(`Sangen ble utgitt i ${year}. Nærmeste gjetning vinner og kan ${this._getRandomActionString()}.`);
            } else {
                await updateInformation(`Kunne ikke hente utgivelsesinfo. Alle må ${this._getRandomActionString()}!`);
            }
        } catch (error) {
            await updateInformation(`Utgivelsesinfo utilgjengelig. Alle må ${this._getRandomActionString()}!`);
        }

        await this.game.wait(5000);
        await playSong();
    }

    async music_quiz() {
        await pauseSong();
        await updateInformation("Musikkquiz! Jeg spiller 3 sanger. Førstemann som roper artist eller sangnavn vinner hver runde.");
        await this.game.wait(3000);

        for (let i = 1; i <= 3; i++) {
            await updateInformation(`Sang ${i} av 3`);

            try {
                const result = await queueRandomSongFromAlbum("3D5BaRZxngDIZP811L4p1N");
                if (result && result.queuedSong) {
                    await skipSong();
                    await this.game.wait(20000);
                    await pauseSong();
                    await updateInformation(`Det var "${result.queuedSong.name}" av ${result.queuedSong.artist}`);
                } else {
                    await updateInformation(`Sang ${i} - kunne ikke køe sang`);
                }
                await this.game.wait(2000);
            } catch (error) {
                console.error("Music quiz error:", error);
                await updateInformation(`Sang ${i} - kunne ikke laste sanginfo`);
                await this.game.wait(2000);
            }
        }

        await updateInformation(`Quiz ferdig! Vinnerne deler ut ${this._getRandomAction()} slurker hver.`);
        await this.game.wait(3000);
        await playSong();
    }

    async categories() {
        await pauseSong();
        const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
        const starter = this._getRandomContestant();

        await updateInformation(`Kategorilek!\nKategori: ${category}\n${starter} starter. Fortsett til noen feiler.`);
        await this.game.waitForClick(`Kategori: ${category}\n${starter} starter kategorileken!`);
        await updateInformation(`Leken er over! Taperen må ${this._getRandomActionString()}.`);
        await this.game.wait(2000);
        await playSong();
    }

    async most_likely() {
        await pauseSong();
        await updateInformation("Hvem er mest sannsynlig til å...!\nJeg kommer med påstander. Stem hvis du tror det er sant.\nFlertallet bestemmer!");
        await this.game.wait(3000);

        for (let i = 0; i < 3; i++) {
            const person = this._getRandomContestant();
            const action = MOST_LIKELY_TO[Math.floor(Math.random() * MOST_LIKELY_TO.length)];
            await updateInformation(`${person} er mest sannsynlig til å ${action}.`);
            await this.game.waitForClick("Stem nå! Trykk når stemmingen er ferdig.");
        }

        await updateInformation("Stemming ferdig! Flertallsvinnerne deler ut drikke, taperne drikker!");
        await this.game.wait(3000);
        await playSong();
    }

    async waterfall() {
        await pauseSong();
        const starter = this._getRandomContestant();
        await updateInformation(`Fossefall!\n${starter} begynner å drikke og velger retning.\nNeste person kan ikke stoppe før personen før dem stopper.`);

        if (this.game.rigged) {
            await this.game.wait(2000);
            await updateInformation(`Spesiell regel: Start ved siden av ${this.game.rigged} så det ender på dem!`);
        }

        await this.game.wait(5000);
        await playSong();
    }

    async lyrical_master() {
        await pauseSong();
        await updateInformation("Lyrisk Mester!\nGjett sangen fra disse tekstlinjene:");
        await this.game.wait(2000);

        const randomLyric = LYRICS[Math.floor(Math.random() * LYRICS.length)];
        const [artist, song, text] = randomLyric;

        await updateInformation(text, { override: true });
        await this.game.wait(8000);
        await updateInformation(`Sangen var "${song}" av ${artist}.\nDe som gjettet riktig kan ${this._getRandomActionString()}.`);
        await this.game.wait(3000);
        await playSong();
    }

    async last_to() {
        await pauseSong();
        const activities = ["dabbe", "reise seg", "ta på nesen", "rekke opp hånden", "klappe"];
        const activity = activities[Math.floor(Math.random() * activities.length)];

        await updateInformation(`Siste person til å ${activity}...`);
        await this.game.wait(3000);
        await updateInformation(`Må ${this._getRandomActionString()}!`);
        await this.game.wait(2000);
        await playSong();
    }

    async grimace() {
        await pauseSong();
        await updateInformation("Grimasekonkurranse! Lag din beste grimase!");
        await this.game.wait(3000);
        await updateInformation("Pek på den beste grimasen!");
        await this.game.waitForClick("Stem på den beste grimasen!");
        await updateInformation(`Vinneren kan ${this._getRandomActionString()}!`);
        await this.game.wait(2000);
        await playSong();
    }

    async build() {
        await pauseSong();
        const time = [10, 15, 20, 25, 30][Math.floor(Math.random() * 5)];
        await updateInformation(`Bygg det høyeste tårnet med dine tomme bokser!\nDere har ${time} sekunder!`);

        await this.game.waitForClick("Trykk når dere er klare til å starte tiden!");
        await updateInformation(`Kjør! Bygger i ${time} sekunder...`);
        await this.game.wait(time * 1000);
        await updateInformation("Tiden er ute! Stopp byggingen!");
        await this.game.waitForClick("Sammenlign tårn og kår en vinner!");
        await updateInformation(`Vinneren kan ${this._getRandomActionString()}!`);
        await this.game.wait(2000);
        await playSong();
    }

    async snacks() {
        await pauseSong();
        const starter = this._getRandomContestant();
        await updateInformation(`Snacks-kast!\n${starter} starter.\nFørstemann til å fange en snack i munnen vinner!`);
        await this.game.waitForClick("Spill til noen fanger en snack!");
        await updateInformation(`Vinneren kan ${this._getRandomActionString()}!`);
        await this.game.wait(2000);
        await playSong();
    }

    async mime() {
        await pauseSong();
        const person = this._getRandomContestant();
        const time = [15, 20, 25, 30][Math.floor(Math.random() * 4)];

        await updateInformation(`Mime-tid!\n${person}, du har ${time} sekunder på å mime noe!`);
        await this.game.wait(time * 1000);
        await updateInformation("Tiden er ute! Gjettet noen riktig?");
        await this.game.waitForClick("Avgjør hvem som gjettet riktig!");
        await updateInformation("Hvis ingen gjettet riktig, drikker mimeren. Ellers drikker de som gjettet feil!");
        await this.game.wait(2000);
        await playSong();
    }

    async thumb_war() {
        if (this.game.contestants.length < 2) return;

        await pauseSong();
        const shuffled = [...this.game.contestants].sort(() => 0.5 - Math.random());
        const [person1, person2] = shuffled.slice(0, 2);
        const name1 = typeof person1 === 'string' ? person1 : person1.name;
        const name2 = typeof person2 === 'string' ? person2 : person2.name;

        await updateInformation(`Tommelkrig!\n${name1} mot ${name2}!`);
        await this.game.waitForClick("Kjemp! Trykk når tommelkrigen er ferdig.");

        const winner = Math.random() < 0.5 ? "vinneren" : "taperen";
        await updateInformation(`Den som ${winner} må ${this._getRandomActionString()}!`);
        await this.game.wait(2000);
        await playSong();
    }

    async slap_the_mini() {
        await pauseSong();
        await updateInformation("Finn den korteste personen og gi dem en vennlig dask!");
        await this.game.wait(3000);
        await updateInformation(`Den korteste personen kan ${this._getRandomActionString()}!`);
        await this.game.wait(2000);
        await playSong();
    }

    async karin_henter_x() {
        await pauseSong();
        await updateInformation("Øl-runde!\nKarin (eller utvalgt person) henter drikke til alle!");
        await this.game.wait(5000);
        await updateInformation("Kos dere med drikken!");
        await this.game.wait(3000);
        await playSong();
    }

    async andreas_round_x() {
        await pauseSong();
        await updateInformation("Andreas' spesialrunde!\nHvilken sang spilles nå?");
        await this.game.wait(2000);
        await playSong();
        await this.game.wait(15000);
        await pauseSong();

        try {
            const current = await getCurrentSong();
            if (current && current.data) {
                await updateInformation(`Det var "${current.data.name}" av ${current.data.artist}!`);
            } else {
                await updateInformation("Sanginfo utilgjengelig!");
            }
        } catch (error) {
            console.error("Andreas round error:", error);
            await updateInformation("Sanginfo utilgjengelig!");
        }

        await this.game.wait(3000);
        await playSong();
    }
}
