import { createContext, useContext, useMemo, useState } from 'react';

const SearchContext = createContext(null);

/** The header search box's text, shared so the homepage grid can filter live as you type. */
export function SearchProvider({ children }) {
  const [query, setQuery] = useState('');
  const value = useMemo(() => ({ query, setQuery }), [query]);
  return <SearchContext.Provider value={value}>{children}</SearchContext.Provider>;
}

export function useSearch() {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used inside SearchProvider');
  return ctx;
}
