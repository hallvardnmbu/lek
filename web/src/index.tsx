import { Match, Switch, createSignal, onSettled } from 'solid-js';
import { render } from '@solidjs/web';
import { DebugPage } from './debug/DebugPage';
import { Home } from './pages/Home';
import { MobilePlay } from './pages/MobilePlay';
import { TvHost } from './pages/TvHost';
import './styles.css';

function App() {
  const [pathname, setPathname] = createSignal(window.location.pathname);

  onSettled(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  const playCodeMatch = () => {
    const m = pathname().match(/^\/play\/([A-Za-z]{4})\/?$/);
    return m ? m[1].toUpperCase() : undefined;
  };

  return (
    <Switch fallback={<Home />}>
      <Match when={pathname().startsWith('/tv')}>
        <TvHost />
      </Match>
      <Match when={pathname() === '/play' || pathname().startsWith('/play/')}>
        <MobilePlay initialCode={playCodeMatch()} />
      </Match>
      <Match when={pathname().startsWith('/debug')}>
        <DebugPage />
      </Match>
    </Switch>
  );
}

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
