import { Match, Switch, createSignal, onCleanup, onMount } from 'solid-js';
import { render } from 'solid-js/web';
import { Home } from './pages/Home';
import { MobilePlay } from './pages/MobilePlay';
import { TvHost } from './pages/TvHost';
import './styles.css';

function App() {
  const [pathname, setPathname] = createSignal(window.location.pathname);

  onMount(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    onCleanup(() => window.removeEventListener('popstate', onPopState));
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
    </Switch>
  );
}

const root = document.getElementById('root');
if (root) {
  render(() => <App />, root);
}
