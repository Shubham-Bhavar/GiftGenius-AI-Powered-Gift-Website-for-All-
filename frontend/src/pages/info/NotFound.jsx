import { Link } from 'react-router';
import { EmptyState } from '../../components/common/ui.jsx';
import { useUi } from '../../context/UiContext.jsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.js';

export function NotFound() {
  useDocumentTitle('Page Not Found');
  const { openGiftFinder } = useUi();
  return (
    <div className="gg-page">
      <EmptyState level={1} icon="🧭" title="We couldn't find that page" action={<>
        <Link to="/" className="btn-primary">Go to the Homepage →</Link>
        <button type="button" className="btn-outline" onClick={openGiftFinder}>✨ Find a Gift</button>
      </>}>
        The link may be old, or the page has moved.
      </EmptyState>
    </div>
  );
}
