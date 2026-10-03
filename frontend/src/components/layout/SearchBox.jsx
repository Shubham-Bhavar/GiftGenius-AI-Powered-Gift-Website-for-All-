import { useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import { useQuery } from '@tanstack/react-query';
import { catalogQueries } from '../../services/catalog.js';
import { useSearch } from '../../context/SearchContext.jsx';

const STATIC_SUGGESTIONS = [
  'Perfume', 'Watch', 'Gift Box', 'Rose Bouquet', 'Hamper', 'Engraved Gift', 'Luxury Set', 'Birthday Gift',
  'Anniversary Gift', 'Festival Hamper', 'Personalized Gift', 'Chocolate Box',
];

/** Header search with the homepage's live suggestion dropdown. */
export function SearchBox() {
  const { query, setQuery } = useSearch();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const catalog = useQuery(catalogQueries.catalog());

  const suggestions = useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return [];
    const names = (catalog.data?.content ?? []).map((p) => p.name);
    return [...new Set([...names, ...STATIC_SUGGESTIONS])].filter((s) => s.toLowerCase().includes(q)).slice(0, 6);
  }, [query, catalog.data]);

  const choose = (text) => {
    setQuery(text);
    setOpen(false);
    if (pathname === '/') document.getElementById('products')?.scrollIntoView({ behavior: 'smooth' });
    else navigate(`/shop?q=${encodeURIComponent(text)}`);
  };

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setQuery(''); setOpen(false); return; }
    if (e.key === 'ArrowDown' && suggestions.length) {
      e.preventDefault();
      setHighlighted((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp' && suggestions.length) {
      e.preventDefault();
      setHighlighted((h) => Math.max(h - 1, -1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(highlighted >= 0 ? suggestions[highlighted] : query.trim());
    }
  };

  return (
    <div className="search-wrap" role="search">
      <label htmlFor="searchInput" className="sr-only">Search gifts</label>
      <svg aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14" height="14">
        <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
      </svg>
      <input type="search" id="searchInput" placeholder="Search gifts…" autoComplete="off" role="combobox"
        aria-autocomplete="list" aria-controls="searchSuggestions" aria-expanded={open && suggestions.length > 0}
        aria-activedescendant={open && highlighted >= 0 ? `searchOpt${highlighted}` : undefined}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlighted(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown} />
      <div className={`search-suggestions ${open && suggestions.length ? 'open' : ''}`} id="searchSuggestions" role="listbox" aria-label="Search suggestions">
        {open && suggestions.map((s, i) => (
          <div key={s} id={`searchOpt${i}`} className={`search-suggestion-item ${i === highlighted ? 'highlighted' : ''}`} role="option"
            aria-selected={i === highlighted} onMouseDown={(e) => { e.preventDefault(); choose(s); }}>
            {s}
          </div>
        ))}
      </div>
    </div>
  );
}
