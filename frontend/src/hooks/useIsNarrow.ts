import { useEffect, useState } from 'react';

/**
 * Below this width the table is laid out as a list instead of an oval.
 *
 * Six hands of four cards plus a five-card board need roughly 700px to sit
 * around a felt without touching; under that the seats start landing on the
 * board. 640px is the first standard breakpoint below that mark.
 */
const NARROW = '(max-width: 640px)';

/** Whether the viewport is too narrow for the oval table. */
export function useIsNarrow(): boolean {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW).matches
  );

  useEffect(() => {
    const query = window.matchMedia(NARROW);
    const onChange = (e: MediaQueryListEvent) => setNarrow(e.matches);
    query.addEventListener('change', onChange);
    setNarrow(query.matches);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return narrow;
}

export default useIsNarrow;
