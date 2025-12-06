// services/speech-service.js

let voices = [];
const synth = window.speechSynthesis;

export function initializeSpeech() {
    populateVoices();
    if (speechSynthesis.onvoiceschanged !== undefined) {
        speechSynthesis.onvoiceschanged = populateVoices;
    }
}

function populateVoices() {
    voices = synth.getVoices();
}

/**
 * Speaks the given text.
 * @param {string} text 
 * @returns {Promise<void>}
 */
export function speak(text) {
    return new Promise((resolve) => {
        if (text === '') {
            resolve();
            return;
        }

        const utterThis = new SpeechSynthesisUtterance(text);
        utterThis.onend = function (event) {
            resolve();
        };
        utterThis.onerror = function (event) {
            console.error('SpeechSynthesisUtterance.onerror', event);
            resolve(); // Resolve anyway to not block game
        };

        // Attempt to select a Norwegian voice
        const norwegianVoice = voices.find(voice => voice.lang === 'no-NO') || voices.find(voice => voice.lang.startsWith('no'));
        if (norwegianVoice) {
            utterThis.voice = norwegianVoice;
        }

        synth.speak(utterThis);
    });
}
