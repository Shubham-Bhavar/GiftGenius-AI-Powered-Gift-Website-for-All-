import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { YourCard, YourView } from '../components/studio/YourView.jsx';
import { createCompareScene } from '../components/studio/scene/compareScene.js';
import { splitRects } from '../components/studio/scene/compareLooks.js';
import { measureCpu } from '../components/studio/scene/quality.js';
import { describeLook, sanitizeConfig, THEMES, themeLook } from '../components/studio/look.js';

vi.mock('../components/studio/scene/compareScene.js', () => ({ createCompareScene: vi.fn() }));
vi.mock('../components/studio/scene/quality.js', async (importOriginal) => ({ ...await importOriginal(), measureCpu: vi.fn() }));
// The cart itself is exercised through the real app in studio.test.jsx and reveal-experience.test.jsx: Add to cart's payload is unchanged.
vi.mock('../context/CartContext.jsx', () => ({ useCart: () => ({ add: vi.fn() }) }));
vi.mock('../context/ToastContext.jsx', () => ({ useToast: () => vi.fn() }));

const perfume = { id: 4, name: 'Signature Perfume', image: 'https://img.example/perfume.jpg', price: 1199 };
const chocolate = { id: 6, name: 'Artisan Chocolate Box', image: 'https://img.example/chocolate.jpg', price: 299 };
const config = (over = {}) => sanitizeConfig({ ...themeLook('midnight'), products: [4], name: 'Aditi', message: 'With love', budget: 1500, ...over });
const lookOf = (c) => ({ box: c.box, ribbon: c.ribbon, pattern: c.pattern, tissue: THEMES[c.theme].tissue });
const fakeScene = (over = {}) => ({
  setOption: vi.fn(() => Promise.resolve(null)), setOpen: vi.fn(), setSpin: vi.fn(), setDragging: vi.fn(), turnBy: vi.fn(), front: vi.fn(),
  setVisible: vi.fn(), resize: vi.fn(), dispose: vi.fn(), stills: vi.fn(() => Promise.resolve([])), info: vi.fn(() => ({})), tooSlow: false, ...over,
});
class Observer {
  observe() {}

  disconnect() {}
}
function withWebGL(scene = fakeScene()) {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((kind) => (kind === 'webgl2' ? {} : null));
  vi.stubGlobal('ResizeObserver', Observer);
  vi.stubGlobal('IntersectionObserver', Observer);
  createCompareScene.mockResolvedValue(scene);
  return scene;
}
const withoutWebGL = () => vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

const noPhotos = [];
function view(props = {}) {
  const c = props.config ?? config();
  return render(
    <MemoryRouter>
      <YourView config={c} products={[perfume]} look={lookOf(c)} photos={noPhotos} {...props} />
    </MemoryRouter>,
  );
}
const stage = () => screen.findByRole('group', { name: describeLook(lookOf(config())) });

beforeEach(() => {
  createCompareScene.mockReset();
  measureCpu.mockReset();
  measureCpu.mockReturnValue(10);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the card they’ll read', () => {
  it('is set on the chosen card style, with their name and the shopper’s own words', () => {
    render(<YourCard style="noir" name=" Aditi " message="  Happy birthday  " />);
    const card = screen.getByRole('figure', { name: 'Gift card preview' });
    expect(card).toHaveClass('your-card--noir');
    expect(card).toHaveTextContent('For Aditi');
    expect(card).toHaveTextContent('Happy birthday');
  });

  it('writes nothing for the shopper: with no words yet, it says where they will go', () => {
    render(<YourCard style="ivory" name="" message="" />);
    const card = screen.getByRole('figure', { name: 'Gift card preview' });
    expect(card).toHaveTextContent('For you');
    expect(within(card).getByText('Your message will appear here.')).toHaveClass('is-empty');
  });

  it('carries up to three of the shopper’s photos, and only on a photo card', () => {
    const photos = ['blob:1', 'blob:2', 'blob:3', 'blob:4'];
    const { rerender } = render(<YourCard style="photo" name="A" message="Hi" photos={photos} />);
    expect(screen.getByRole('figure').querySelectorAll('img')).toHaveLength(3);
    rerender(<YourCard style="kraft" name="A" message="Hi" photos={photos} />);
    expect(screen.getByRole('figure').querySelectorAll('img')).toHaveLength(0);
  });
});

describe('the box in the studio', () => {
  it('is the same studio as Compare, with one box: the shopper’s own look and gifts, never a price', async () => {
    withWebGL();
    view({ products: [perfume, chocolate] });
    await stage();
    await waitFor(() => expect(createCompareScene).toHaveBeenCalled());
    const { options } = createCompareScene.mock.calls[0][1];
    expect(options).toHaveLength(1);
    expect(options[0].look.box.color).toBe(0x17181d);
    expect(options[0].gift.items.map((i) => i.name)).toEqual(['Signature Perfume', 'Artisan Chocolate Box']);
    expect(JSON.stringify(options[0].gift)).not.toMatch(/price|budget|1199|1500/i);
    expect(splitRects(900, 600, 1)).toEqual([{ x: 0, y: 0, w: 900, h: 600 }]);
  });

  it('opens on the gifts and the card, and can be closed to see the packaging', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    view();
    const el = await stage();
    await waitFor(() => expect(el).toHaveAttribute('aria-busy', 'false'));
    await waitFor(() => expect(scene.setOpen).toHaveBeenLastCalledWith(true));
    await user.click(screen.getByRole('button', { name: 'Closed' }));
    expect(scene.setOpen).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Closed' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('has no A and B, no divider and no theme stills to draw', async () => {
    const scene = withWebGL();
    const { container } = view();
    const el = await stage();
    await waitFor(() => expect(el).toHaveAttribute('aria-busy', 'false'));
    expect(container.querySelector('.cmp-label')).toBeNull();
    expect(container.querySelector('.cmp-divider')).toBeNull();
    expect(scene.stills).not.toHaveBeenCalled();
  });

  it('names a gift whose photo couldn’t be loaded, pointing to the list', async () => {
    withWebGL();
    const el = (view(), await stage());
    await waitFor(() => expect(el).toHaveAttribute('aria-busy', 'false'));
    act(() => createCompareScene.mock.calls[0][1].onPhotos(0, ['Signature Perfume']));
    expect(screen.getByText('Signature Perfume: this photo couldn’t be loaded for the box, so its name is shown in the list instead.')).toBeInTheDocument();
  });

  it('without WebGL: the CSS box, open, which still closes, and no 3D code', async () => {
    withoutWebGL();
    const user = userEvent.setup();
    const { container } = view();
    expect(createCompareScene).not.toHaveBeenCalled();
    const box = screen.getByRole('group', { name: describeLook(lookOf(config())) });
    expect(box).toHaveClass('gb3d--open');
    await user.click(screen.getByRole('button', { name: 'Closed' }));
    expect(box).toHaveClass('gb3d--closed');
    expect(container.querySelector('.cmp-css-stage .cmp-label')).toBeNull();
  });
});

describe('what you’re giving', () => {
  it('leads with the gifts, the total, the budget and the button; the presentation follows', () => {
    withoutWebGL();
    view({ products: [perfume, chocolate] });
    const summary = screen.getByRole('region', { name: 'What you’re giving' });
    const items = within(summary).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Signature Perfume₹1,199', 'Artisan Chocolate Box₹299']);
    expect(within(items[0]).getByRole('link', { name: 'Signature Perfume' })).toHaveAttribute('href', '/product/4');
    expect(summary).toHaveTextContent('₹1,498');
    expect(within(summary).getByText('Within your ₹1,500 budget (₹2 to spare)')).toHaveClass('is-ok');
    expect(within(summary).getByRole('button', { name: '🛒 Add all to cart' })).toBeEnabled();
    const presented = within(summary).getByRole('heading', { name: 'How it’s presented' });
    expect(presented.compareDocumentPosition(within(summary).getByRole('button', { name: '🛒 Add all to cart' }))).toBe(Node.DOCUMENT_POSITION_PRECEDING);
    expect(summary).toHaveTextContent('Midnight Luxury: Black box, gold ribbon, satin sheen wrap');
  });

  it('doesn’t repeat the message, which is on the card beside it', () => {
    withoutWebGL();
    view();
    const summary = screen.getByRole('region', { name: 'What you’re giving' });
    expect(within(summary).queryByText('Message')).toBeNull();
    expect(summary).not.toHaveTextContent('With love');
    expect(screen.getByRole('figure', { name: 'Gift card preview' })).toHaveTextContent('With love');
  });

  it('says plainly what goes with the order and what is only a preview', () => {
    withoutWebGL();
    view({ config: config({ card: 'party' }) });
    expect(screen.getByText('The words go with your order. The party card style is a preview.')).toBeInTheDocument();
    expect(screen.getByText(/The colours, wrap and reveal are a preview only/)).toBeInTheDocument();
  });

  it('fetches the 3D scene only lazily, through the shared stage', () => {
    const source = readFileSync('src/components/studio/YourView.jsx', 'utf8');
    expect(source).not.toMatch(/from '\.\/scene\/(studioScene|compareScene|boxGeometry|studioMaterials|studioEffects)/);
    expect(source).toContain("from './scene/CompareStage3D.jsx'");
  });
});
