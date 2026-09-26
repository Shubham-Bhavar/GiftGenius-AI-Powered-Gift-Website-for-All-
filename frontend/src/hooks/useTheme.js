import { useCallback, useState } from 'react';
import { storage } from '../lib/storage.js';

const isDark = () => document.documentElement.getAttribute('data-theme') === 'dark';

/** The homepage's dark/light toggle (same storage key, same attribute). */
export function useTheme() {
  const [dark, setDark] = useState(isDark);
  const toggle = useCallback(() => {
    const next = !isDark();
    document.documentElement.setAttribute('data-theme', next ? 'dark' : 'light');
    storage.set('gg-theme', next ? 'dark' : 'light');
    setDark(next);
  }, []);
  return { dark, toggle };
}
