import { useId } from 'react';

export const MAX_PHOTOS = 6;

/**
 * Photos for the Personal Memories look: they stay in this browser tab as local object URLs, are never uploaded
 * or put in a share link, and are gone when the page closes. Each can be removed, or all at once.
 */
export function MemoryPhotos({ photos, onChange }) {
  const inputId = useId();
  const add = (files) => {
    const room = MAX_PHOTOS - photos.length;
    const added = [...files].filter((f) => f.type.startsWith('image/')).slice(0, room).map((f) => URL.createObjectURL(f));
    if (added.length) onChange([...photos, ...added]);
  };
  const remove = (src) => {
    URL.revokeObjectURL(src);
    onChange(photos.filter((p) => p !== src));
  };
  const move = (from, to) => {
    const next = [...photos];
    next.splice(to, 0, next.splice(from, 1)[0]);
    onChange(next);
  };

  return (
    <div className="studio-photos">
      <label htmlFor={inputId} className="studio-label">Your photos <span className="q-optional">({photos.length}/{MAX_PHOTOS})</span></label>
      <input id={inputId} type="file" accept="image/*" multiple disabled={photos.length >= MAX_PHOTOS}
        onChange={(e) => {
          add(e.target.files ?? []);
          e.target.value = '';
        }} />
      <p className="studio-hint">🔒 Photos stay on this device. They’re never uploaded or shared, and they’re gone when you close the page.</p>
      {photos.length > 0 && (
        <>
          <ul className="studio-photo-list" aria-label="Your photos">
            {photos.map((src, i) => (
              <li key={src}>
                <img src={src} alt={`Photo ${i + 1}`} />
                <div className="studio-photo-actions">
                  <button type="button" disabled={i === 0} onClick={() => move(i, i - 1)} aria-label={`Move photo ${i + 1} earlier`}>←</button>
                  <button type="button" onClick={() => remove(src)} aria-label={`Remove photo ${i + 1}`}>✕</button>
                  <button type="button" disabled={i === photos.length - 1} onClick={() => move(i, i + 1)} aria-label={`Move photo ${i + 1} later`}>→</button>
                </div>
              </li>
            ))}
          </ul>
          <button type="button" className="studio-link-btn" onClick={() => {
            photos.forEach((src) => URL.revokeObjectURL(src));
            onChange([]);
          }}>Remove all photos</button>
        </>
      )}
    </div>
  );
}
