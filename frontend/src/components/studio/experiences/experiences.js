/**
 * The reveal experiences a shopper can choose. All five share the studio, the box's geometry, the player and its
 * stages. Each sets its own look (ribbon and details here; colours in reveal-experiences.css), timing, camera and
 * effects. All text comes from the shopper: `card.heading` is the only wording an experience adds, and it names the
 * occasion the shopper chose by picking that experience.
 */
export const EXPERIENCES = {
  royal: {
    key: 'royal',
    name: 'Royal Luxury Reveal',
    description: 'A hinged black box with an emerald lining, tied in gold satin. The ribbon falls away and the lid opens on your gift.',
    theme: 'Black, emerald and gold',
    swatch: { box: '#17181c', ribbon: '#e3c474' },
    boxLabel: 'a black box with an emerald lining and a gold ribbon',
    look: { band: 22, bow: 'full' },
    durations: { entrance: 1000, rotation: 1500, ribbon: 1700, lid: 1500, reveal: 1500 },
    // Where the camera heads in each stage: its tilt (x) and turn (y), in degrees.
    poses: {
      idle: { x: -24, y: -30 }, start: { x: -16, y: -72 }, entrance: { x: -20, y: -50 }, rotation: { x: -25, y: -24 },
      ribbon: { x: -30, y: -28 }, lid: { x: -24, y: -22 }, reveal: { x: -18, y: -18 },
    },
    says: {
      entrance: 'A black gift box tied in gold ribbon arrives.', rotation: 'The box turns toward you.',
      ribbon: 'The ribbon falls away.', lid: 'The lid opens on its hinge.',
    },
  },
  birthday: {
    key: 'birthday',
    name: 'Birthday Surprise',
    description: 'A bright coral box drops in with a little bounce. Sunny ribbon, a burst of confetti when the lid pops, then a birthday card.',
    theme: 'Coral, sunshine and teal',
    swatch: { box: '#ef6a5b', ribbon: '#ffd84f' },
    boxLabel: 'a coral box with a yellow ribbon and a butter-yellow lining',
    look: { band: 22, bow: 'full', foilLine: false },
    durations: { entrance: 1100, rotation: 1100, ribbon: 1300, lid: 1400, reveal: 1600 },
    poses: {
      idle: { x: -26, y: -32 }, start: { x: -20, y: -58 }, entrance: { x: -22, y: -42 }, rotation: { x: -27, y: -28 },
      ribbon: { x: -30, y: -30 }, lid: { x: -25, y: -22 }, reveal: { x: -18, y: -18 },
    },
    effect: 'confetti',
    card: { heading: 'Happy birthday' },
    says: {
      entrance: 'A coral gift box bounces in.', rotation: 'The box turns toward you.',
      ribbon: 'The ribbon whips away.', lid: 'The lid pops open, with a burst of confetti.',
    },
  },
  sentimental: {
    key: 'sentimental',
    name: 'Sentimental Unboxing',
    description: 'A slow cinematic move onto a deep red box. The ribbon falls gently, your message comes first, and the gift follows.',
    theme: 'Deep red, ivory and champagne',
    swatch: { box: '#5e1020', ribbon: '#ecd9b6' },
    boxLabel: 'a deep red box with an ivory lining and a champagne ribbon',
    look: { band: 18, bow: 'full' },
    durations: { entrance: 1700, rotation: 1900, ribbon: 3000, lid: 2400, reveal: 4200 },
    poses: {
      idle: { x: -22, y: -28 }, start: { x: -12, y: -46 }, entrance: { x: -14, y: -38 }, rotation: { x: -20, y: -24 },
      ribbon: { x: -26, y: -24 }, lid: { x: -22, y: -20 }, reveal: { x: -18, y: -18 },
    },
    card: { messageFirst: true },
    says: {
      entrance: 'The view moves slowly toward a deep red gift box.', rotation: 'The box turns toward you.',
      ribbon: 'The ribbon slips away, slowly.', lid: 'The lid opens gently.',
    },
  },
  minimal: {
    key: 'minimal',
    name: 'Minimal Aesthetic',
    description: 'An ivory box and one thin band of ribbon in soft, even light. A slow turn, a quiet lid, and nothing that doesn’t need to be there.',
    theme: 'Cream, ivory and beige',
    swatch: { box: '#f2ede3', ribbon: '#bdaa8e' },
    boxLabel: 'an ivory box with a single thin beige ribbon',
    look: { band: 9, cross: false, bow: 'knot', foilLine: false },
    durations: { entrance: 1200, rotation: 2400, ribbon: 1200, lid: 2000, reveal: 1800 },
    poses: {
      idle: { x: -22, y: -28 }, start: { x: -22, y: -78 }, entrance: { x: -22, y: -64 }, rotation: { x: -24, y: -26 },
      ribbon: { x: -24, y: -26 }, lid: { x: -24, y: -22 }, reveal: { x: -20, y: -20 },
    },
    says: {
      entrance: 'An ivory gift box appears.', rotation: 'The box turns slowly.',
      ribbon: 'The thin ribbon slips away.', lid: 'The lid lifts quietly.',
    },
  },
  memory: {
    key: 'memory',
    name: 'Personalised Memory Reveal',
    description: 'Built around your own photo: a framed print on the lid and inside it, with their name, your message and your gift.',
    theme: 'Your photo, linen and dusty rose',
    swatch: { box: '#cfc4b6', ribbon: '#a85a63' },
    boxLabel: 'a linen box with a dusty rose ribbon',
    look: { band: 12, cross: false, bow: 'slim', foilLine: false, photoPrints: true, spots: [{ x: 58, z: 26, size: 0.92 }, { x: -2, z: -24, size: 0.62 }, { x: 96, z: -30, size: 0.6 }] },
    durations: { entrance: 1000, rotation: 1500, ribbon: 1600, lid: 1800, reveal: 1800 },
    poses: {
      idle: { x: -30, y: -24 }, start: { x: -22, y: -58 }, entrance: { x: -26, y: -40 }, rotation: { x: -34, y: -18 },
      ribbon: { x: -38, y: -18 }, lid: { x: -24, y: -14 }, reveal: { x: -18, y: -14 },
    },
    needsPhoto: true,
    says: {
      entrance: 'A linen gift box arrives.', rotation: 'The box turns toward you.',
      ribbon: 'The ribbon slips away from the lid.', lid: 'The lid opens on its hinge.',
    },
  },
};
