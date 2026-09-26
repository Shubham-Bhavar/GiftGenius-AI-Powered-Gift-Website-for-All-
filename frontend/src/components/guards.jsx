import { Link, Navigate, isRouteErrorResponse, useLocation, useRouteError } from 'react-router';
import { useAuth } from '../context/AuthContext.jsx';
import { EmptyState } from './ui.jsx';

export function RequireAuth({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }
  return children;
}

export function RequireAdmin({ children }) {
  const { user, isAdmin } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to={`/login?next=${encodeURIComponent(location.pathname)}`} replace />;
  if (!isAdmin) {
    return (
      <div className="gg-page">
        <EmptyState level={1} icon="🛡️" title="Admins only" action={<Link to="/" className="btn-primary">Back to the Shop →</Link>}>
          This area is for store staff. Sign in with an admin account to continue.
        </EmptyState>
      </div>
    );
  }
  return children;
}

/** Router-level error page (a crash inside a page, or an unknown lazy route). */
export function RouteError() {
  const error = useRouteError();
  const notFound = isRouteErrorResponse(error) && error.status === 404;
  return (
    <div className="gg-page">
      <EmptyState level={1} icon={notFound ? '🧭' : '🎁'} title={notFound ? "We couldn't find that page" : 'Something went wrong'}
        action={<a className="btn-primary" href="/">Go to the Homepage →</a>}>
        {notFound ? 'The link may be old, or the page has moved.' : 'Please reload the page. If it keeps happening, try again in a few minutes.'}
      </EmptyState>
    </div>
  );
}
