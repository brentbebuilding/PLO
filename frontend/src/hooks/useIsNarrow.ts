import { useEffect, useState } from 'react';

/**
 * Below this width the table switches to its phone arrangement.
 *
 * Deliberately narrower than any window someone would drag a desktop browser
 * to. The switch is a jump — the deck folds to four rows and the felt changes
 * shape — and having that happen while resizing a window is worse than the
 * wide layout simply running out of room, which it now handles by holding its
 * size and letting the page overflow. Phones are 360 to 430 across and land
 * well inside this; a resized desktop window does not reach it.
 */
const NARROW = '(max-width: 500px)';

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
