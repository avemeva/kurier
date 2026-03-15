import { useCallback, useEffect, useState } from 'react';
import { FixtureIndex } from './fixture-index';
import { FixturePage } from './fixture-page';

function parsePath(pathname: string): { page: 'index' } | { page: 'fixture'; name: string } {
  const match = pathname.match(/^\/dev\/fixture\/(.+)$/);
  if (match) return { page: 'fixture', name: match[1] };
  return { page: 'index' };
}

export function DevHarness() {
  const [route, setRoute] = useState(() => parsePath(window.location.pathname));

  useEffect(() => {
    const onPopState = () => setRoute(parsePath(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigate = useCallback((e: React.MouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    const href = e.currentTarget.getAttribute('href');
    if (href) {
      history.pushState(null, '', href);
      setRoute(parsePath(href));
    }
  }, []);

  if (route.page === 'fixture') {
    return <FixturePage name={route.name} navigate={navigate} />;
  }
  return <FixtureIndex navigate={navigate} />;
}
