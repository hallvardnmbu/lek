export function Home() {
  const navigate = (path: string) => {
    window.history.pushState({}, '', path);
    window.dispatchEvent(new PopStateEvent('popstate'));
  };

  return (
    <main class="home-page">
      <div class="home-stack">
        <h1>Party</h1>

        <div class="home-actions">
          <button class="btn btn-lg" onClick={() => navigate('/tv')}>
            Host on TV
          </button>

          <button class="btn btn-lg" onClick={() => navigate('/play')}>
            Join on Phone
          </button>

          <button class="btn" onClick={() => navigate('/debug')}>
            Debug
          </button>
        </div>
      </div>
    </main>
  );
}
