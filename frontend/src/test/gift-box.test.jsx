import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BoxComposer, MAX_BOX } from '../components/studio/BoxComposer.jsx';
import { createCompareScene } from '../components/studio/scene/compareScene.js';
import { measureCpu } from '../components/studio/scene/quality.js';
import { describeLook, sanitizeConfig, THEMES, themeLook } from '../components/studio/look.js';
import { giftBoxApi } from '../services/giftbox.js';

vi.mock('../components/studio/scene/compareScene.js', () => ({ createCompareScene: vi.fn() }));
vi.mock('../components/studio/scene/quality.js', async (importOriginal) => ({ ...await importOriginal(), measureCpu: vi.fn() }));
// The real requests are exercised through the app and its mock API in studio.test.jsx; here only what the tab does with them.
vi.mock('../services/giftbox.js', () => ({ giftBoxApi: { check: vi.fn(), suggestions: vi.fn() } }));

const catalog = [
  { id: 1, name: 'Luxury Hamper Box', price: 499, image: 'https://img.example/1.jpg', inStock: true },
  { id: 3, name: 'Classic Rose Bouquet', price: 599, image: 'https://img.example/3.jpg', inStock: true },
  { id: 4, name: 'Signature Perfume', price: 1199, image: 'https://img.example/4.jpg', inStock: true },
  { id: 6, name: 'Artisan Chocolate Box', price: 299, image: 'https://img.example/6.jpg', inStock: true },
  { id: 7, name: 'Pashmina Shawl', price: 899, image: 'https://img.example/7.jpg', inStock: true },
  { id: 8, name: 'Succulent Plant Gift Set', price: 449, image: 'https://img.example/8.jpg', inStock: true },
  { id: 9, name: 'Wireless Earbuds', price: 1999, image: 'https://img.example/9.jpg', inStock: true },
];
const config = sanitizeConfig({ ...themeLook('celebration'), products: [], name: 'Aditi', message: 'Happy birthday' });
const context = { budget: 1500, occasion: 'birthday', interests: [] };
const lookOf = (c) => ({ box: c.box, ribbon: c.ribbon, pattern: c.pattern, tissue: THEMES[c.theme].tissue });
const noPhotos = [];
const fakeScene = () => ({
  setOption: vi.fn(() => Promise.resolve(null)), setOpen: vi.fn(), setSpin: vi.fn(), setDragging: vi.fn(), turnBy: vi.fn(), front: vi.fn(),
  setVisible: vi.fn(), resize: vi.fn(), dispose: vi.fn(), stills: vi.fn(() => Promise.resolve([])), info: vi.fn(() => ({})), tooSlow: false,
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
const composer = (props = {}) => <BoxComposer context={context} catalog={catalog} config={config} photos={noPhotos} onUse={() => {}} {...props} />;
const ready = async () => {
  const stage = await screen.findByRole('group', { name: describeLook(lookOf(config)) });
  await waitFor(() => expect(stage).toHaveAttribute('aria-busy', 'false'));
  return stage;
};

beforeEach(() => {
  createCompareScene.mockReset();
  measureCpu.mockReset();
  measureCpu.mockReturnValue(10);
  giftBoxApi.check.mockReset();
  giftBoxApi.check.mockResolvedValue({ checks: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('your box, in the studio', () => {
  it('is the studio’s box in the look chosen in the studio, open and empty to start with', async () => {
    const scene = withWebGL();
    render(composer());
    await ready();
    const { options } = createCompareScene.mock.calls[0][1];
    expect(options).toHaveLength(1);
    expect(options[0].look.box.color).toBe(parseInt(THEMES.celebration.box.slice(1), 16));
    expect(options[0].look.wrap).toEqual({ pattern: 'confetti', box: THEMES.celebration.box });
    expect(options[0].gift.items).toEqual([]);
    await waitFor(() => expect(scene.setOpen).toHaveBeenLastCalledWith(true));
    expect(screen.getByText('Empty for now. Choose a suggested box below, or add gifts from the shelf.')).toBeInTheDocument();
  });

  it('fills as gifts go in, in their order, and never with a price', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(composer());
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add Signature Perfume to the box' }));
    await user.click(screen.getByRole('button', { name: 'Add Artisan Chocolate Box to the box' }));
    await waitFor(() => expect(scene.setOption.mock.calls.at(-1)[1].gift.items.map((i) => i.name)).toEqual(['Signature Perfume', 'Artisan Chocolate Box']));
    expect(JSON.stringify(scene.setOption.mock.calls.at(-1)[1].gift)).not.toMatch(/price|1199/);
    await user.click(screen.getByRole('button', { name: 'Move Artisan Chocolate Box earlier' }));
    await waitFor(() => expect(scene.setOption.mock.calls.at(-1)[1].gift.items.map((i) => i.id)).toEqual([6, 4]));
  });

  it('is redressed only when the box changes, not on every keystroke elsewhere', async () => {
    const scene = withWebGL();
    const user = userEvent.setup();
    render(composer());
    await ready();
    await user.click(screen.getByRole('button', { name: 'Add Signature Perfume to the box' }));
    await waitFor(() => expect(scene.setOption.mock.calls.at(-1)[1].gift.items).toHaveLength(1));
    const calls = scene.setOption.mock.calls.length;
    await user.type(screen.getByLabelText('Search the shelf'), 'rose');
    expect(scene.setOption).toHaveBeenCalledTimes(calls);
  });

  it('takes a gift dropped on the box in the studio, not only on the list', async () => {
    withWebGL();
    render(composer());
    const stage = await ready();
    fireEvent.drop(stage, { dataTransfer: { getData: () => 'add:7' } });
    expect(within(screen.getByRole('group', { name: `Your box: 1 of ${MAX_BOX} gifts` })).getByText('Pashmina Shawl')).toBeInTheDocument();
  });

  it('without WebGL: the CSS box, open, and no 3D code', () => {
    withoutWebGL();
    render(composer());
    expect(createCompareScene).not.toHaveBeenCalled();
    expect(screen.getByRole('group', { name: describeLook(lookOf(config)) })).toHaveClass('gb3d--open');
  });
});

describe('the budget, at a glance', () => {
  it('fills a bar as the total rises, in step with the words', async () => {
    withoutWebGL();
    const user = userEvent.setup();
    const { container } = render(composer());
    await user.click(screen.getByRole('button', { name: 'Add Pashmina Shawl to the box' }));
    expect(screen.getByText('₹601 left of ₹1,500')).toHaveClass('is-ok');
    expect(parseFloat(container.querySelector('.box-meter-bar span').style.width)).toBeCloseTo((899 / 1500) * 100, 6);
    await user.click(screen.getByRole('button', { name: 'Add Signature Perfume to the box' }));
    expect(screen.getByText('₹598 over ₹1,500')).toHaveClass('is-over');
    expect(container.querySelector('.box-meter-bar')).toHaveClass('is-over');
    expect(container.querySelector('.box-meter-bar span').style.width).toBe('100%');
    expect(container.querySelector('.box-meter-bar')).toHaveAttribute('aria-hidden', 'true');
  });

  it('uses one budget for the box and the suggestions', async () => {
    withoutWebGL();
    const user = userEvent.setup();
    render(composer());
    const field = screen.getByLabelText('Budget (₹)');
    await user.clear(field);
    await user.type(field, '2000');
    expect(screen.getByText('Within your ₹2,000 budget, one gift of each kind, chosen from the catalogue.')).toBeInTheDocument();
    expect(screen.getByText('₹2,000 left of ₹2,000')).toBeInTheDocument();
  });
});

describe('the shelf', () => {
  it('says why nothing more can be added once the box is full', async () => {
    withoutWebGL();
    const user = userEvent.setup();
    render(composer());
    for (const name of catalog.slice(0, MAX_BOX).map((p) => p.name)) await user.click(screen.getByRole('button', { name: `Add ${name} to the box` }));
    expect(screen.getByRole('group', { name: `Your box: ${MAX_BOX} of ${MAX_BOX} gifts` })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add Wireless Earbuds to the box' })).toBeDisabled();
    expect(screen.getByText(`A box holds ${MAX_BOX} gifts at most: remove one to add another.`)).toBeInTheDocument();
    // Dragged in rather than added with the button: still six.
    fireEvent.drop(screen.getByRole('group', { name: `Your box: ${MAX_BOX} of ${MAX_BOX} gifts` }), { dataTransfer: { getData: () => 'add:9' } });
    expect(within(screen.getByRole('group', { name: `Your box: ${MAX_BOX} of ${MAX_BOX} gifts` })).queryByText('Wireless Earbuds')).toBeNull();
  });
});
