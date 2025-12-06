// game/TimeManager.js

export class TimeManager {
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
