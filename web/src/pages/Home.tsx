export function Home() {
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main class="home-page">
      <div class="home-card">
        <div class="brand-badge">TV &amp; PHONE PLATFORM</div>
        <h1 class="brand-title">Party</h1>
        <p class="brand-subtitle">
          Shared Tizen TV host and mobile controller foundation.
        </p>

        <div class="home-actions">
          <button
            class="btn btn-primary btn-lg"
            onClick={() => navigate('/tv')}
          >
            Host on TV
            <span class="btn-sub">Launch 1080p Room Screen</span>
          </button>

          <button
            class="btn btn-secondary btn-lg"
            onClick={() => navigate('/play')}
          >
            Join on Phone
            <span class="btn-sub">Enter a 4-letter Room Code</span>
          </button>
        </div>
      </div>
    </main>
  );
}
