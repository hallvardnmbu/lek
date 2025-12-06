import { exchangeCodeForToken } from './services/auth-service.js';
import { SPOTIFY_CLIENT_ID } from '../config.js';

document.addEventListener('DOMContentLoaded', function () {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('code');
    const error = params.get('error');

    if (code) {
        document.getElementById('status-message').textContent = "Autentiserer...";
        exchangeCodeForToken(code, SPOTIFY_CLIENT_ID)
            .then(() => {
                document.getElementById('status-message').textContent = "Suksess! Videresender...";
                setTimeout(() => {
                    window.location.href = '/';
                }, 1000);
            })
            .catch(error => {
                console.error(error);
                document.getElementById('status-message').textContent = "Noe gikk galt under autentisering.";
                setTimeout(() => {
                    window.location.href = '/';
                }, 3000);
            });
    } else if (error) {
        document.getElementById('status-message').textContent = "Feil fra Spotify: " + error;
        setTimeout(() => {
            window.location.href = '/';
        }, 3000);
    } else {
        // No code, maybe just visiting? Redirect home
        window.location.href = '/';
    }
});
