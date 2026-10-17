import { useEffect, useRef } from 'react';

/** Space bar triggers the primary "play" action of the active view. */
export const PLAY_EVENT = 'pipeops:play';

export function usePlayKey(handler: () => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    const fn = () => ref.current();
    window.addEventListener(PLAY_EVENT, fn);
    return () => window.removeEventListener(PLAY_EVENT, fn);
  }, []);
}
