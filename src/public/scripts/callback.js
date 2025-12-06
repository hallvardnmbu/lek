// callback.js
import { exchangeCodeForToken } from './services/auth-service.js';

document.addEventListener('DOMContentLoaded', function () {
    const dataEl = document.getElementById('auth-data');
    if (dataEl) {
        const code = dataEl.dataset.code;
        const id = dataEl.dataset.id;
        const message = dataEl.dataset.message;

        if (code) {
            exchangeCodeForToken(code, id)
                .then(() => {
                    setTimeout(() => {
                        window.location.href = '/settings';
                    }, 3000);
                })
                .catch(error => {
                    console.error(error);
                    setTimeout(() => {
                        window.location.href = '/spotify';
                    }, 3000);
                });
        } else if (!message.includes("Error")) {
            setTimeout(() => {
                window.location.href = '/spotify';
            }, 3000);
        }
    }
});
