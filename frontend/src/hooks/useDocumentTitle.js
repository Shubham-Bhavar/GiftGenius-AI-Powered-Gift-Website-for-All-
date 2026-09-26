import { useEffect } from 'react';

export function useDocumentTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · GiftGenius` : 'GiftGenius · Thoughtful gifts, picked by AI';
  }, [title]);
}
