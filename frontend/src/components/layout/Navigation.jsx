import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router';
import { NAV_LINKS } from '../../constants/site.js';

// The site navigation: the desktop pill nav and the phone menu, from the same NAV_LINKS.

function isActive(link, pathname) {
  return link.end ? pathname === link.to : pathname === link.to || pathname.startsWith(`${link.to}/`);
}

/** Animated gold pill that slides under the active link (homepage NavPill). */
export function NavPill() {
  const { pathname } = useLocation();
  const pill = useRef(null);
  const active = NAV_LINKS.find((l) => isActive(l, pathname));

  useLayoutEffect(() => {
    const el = pill.current;
    if (!el) return undefined;
    const move = () => {
      const a = el.querySelector('a.active');
      if (!a) {
        el.style.setProperty('--pill-width', '0px');
        return;
      }
      const pr = el.getBoundingClientRect();
      const er = a.getBoundingClientRect();
      el.style.setProperty('--pill-left', `${er.left - pr.left}px`);
      el.style.setProperty('--pill-width', `${er.width}px`);
    };
    const raf = requestAnimationFrame(move);
    window.addEventListener('resize', move);
    document.fonts?.ready?.then(move);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', move); };
  }, [pathname]);

  return (
    <div className="nav-wrap">
      <nav className="nav-pill" id="navPill" aria-label="Main navigation" ref={pill}>
        {NAV_LINKS.map((l) => (
          <Link key={l.to} to={l.to} className={active === l ? 'active' : undefined} aria-current={active === l ? 'page' : undefined}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

/** The phone menu: the same links plus Track Order. Its open state belongs to the header's menu button. */
export function MobileNav({ open, ref }) {
  const { pathname } = useLocation();
  const active = NAV_LINKS.find((l) => isActive(l, pathname));
  return (
    <nav className="mobile-menu" id="mobileMenu" aria-label="Mobile navigation" hidden={!open} ref={ref}>
      {NAV_LINKS.map((l) => (
        <Link key={l.to} to={l.to} aria-current={active === l ? 'page' : undefined}>{l.label}</Link>
      ))}
      <Link to="/track">Track Order</Link>
    </nav>
  );
}
