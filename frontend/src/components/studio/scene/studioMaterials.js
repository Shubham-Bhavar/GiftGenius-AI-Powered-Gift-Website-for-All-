import {
  CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearMipmapLinearFilter, MeshPhysicalMaterial, MeshStandardMaterial,
  RepeatWrapping, RGBAFormat, SRGBColorSpace, Vector2,
} from 'three';

/** Every texture is generated here at runtime from a fixed seed: no downloaded or paid assets, and the same each time. */
function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

/** A tiling height field: random values, softened a few times, wrapping at the edges. */
function noise(size, seed, softening) {
  const random = seeded(seed);
  let h = Float32Array.from({ length: size * size }, () => random());
  for (let pass = 0; pass < softening; pass += 1) {
    const next = new Float32Array(size * size);
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        let sum = 0;
        for (let dy = -1; dy <= 1; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) sum += h[((y + dy + size) % size) * size + ((x + dx + size) % size)];
        }
        next[y * size + x] = sum / 9;
      }
    }
    h = next;
  }
  return h;
}

function dataTexture(pixels, width, height, repeat, maxAnisotropy) {
  const t = new DataTexture(pixels, width, height, RGBAFormat);
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.generateMipmaps = true;
  t.minFilter = LinearMipmapLinearFilter;
  t.magFilter = LinearFilter;
  t.anisotropy = maxAnisotropy;
  t.needsUpdate = true;
  return t;
}

function normalMapFrom(h, width, height, strength, repeat, maxAnisotropy) {
  const pixels = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const dx = (h[y * width + ((x + 1) % width)] - h[y * width + ((x - 1 + width) % width)]) * strength;
      const dy = (h[((y + 1) % height) * width + x] - h[((y - 1 + height) % height) * width + x]) * strength;
      const l = Math.hypot(dx, dy, 1);
      pixels.set([(-dx / l) * 127.5 + 127.5, (-dy / l) * 127.5 + 127.5, (1 / l) * 127.5 + 127.5, 255], (y * width + x) * 4);
    }
  }
  return dataTexture(pixels, width, height, repeat, maxAnisotropy);
}

/** Shading for the recesses inside the box, where the studio's light can't reach. */
function occlusion(paint) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  paint(canvas.getContext('2d'), 256);
  const t = new CanvasTexture(canvas);
  t.channel = 1;
  t.wrapS = ClampToEdgeWrapping;
  t.wrapT = ClampToEdgeWrapping;
  return t;
}

const wallOcclusion = (rising) => occlusion((ctx, size) => {
  const g = ctx.createLinearGradient(0, 0, 0, size);
  // The canvas's top is v = 1 once uploaded.
  g.addColorStop(0, rising ? '#d8d8d8' : '#3a3a3a');
  g.addColorStop(0.55, '#8c8c8c');
  g.addColorStop(1, rising ? '#3a3a3a' : '#d8d8d8');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
});

const panelOcclusion = () => occlusion((ctx, size) => {
  ctx.fillStyle = '#343434';
  ctx.fillRect(0, 0, size, size);
  ctx.filter = 'blur(26px)';
  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(size * 0.15, size * 0.15, size * 0.7, size * 0.7);
  ctx.filter = 'none';
});

/** The foil-stamped wordmark, as the shape a metal foil is cut to. It's the site's own Gift + italic Genius lockup. */
function wordmarkAlpha() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textBaseline = 'middle';
  const roman = '500 124px "Cormorant Garamond", Georgia, serif';
  const italic = 'italic 500 124px "Cormorant Garamond", Georgia, serif';
  ctx.font = roman;
  const giftWidth = ctx.measureText('Gift').width;
  ctx.font = italic;
  const geniusWidth = ctx.measureText('Genius').width;
  const left = (canvas.width - giftWidth - geniusWidth - 3) / 2;
  ctx.font = roman;
  ctx.fillText('Gift', left, 98);
  ctx.font = italic;
  ctx.fillText('Genius', left + giftWidth + 3, 98);
  const t = new CanvasTexture(canvas);
  t.anisotropy = 8;
  return t;
}

/** A woven linen, for the fabric-wrapped box. */
function linenHeight(size) {
  const threads = noise(size, 53, 0);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const warp = Math.sin((x / size) * Math.PI * 2 * 22) * 0.5;
      const weft = Math.sin((y / size) * Math.PI * 2 * 22) * 0.5;
      h[y * size + x] = warp * 0.34 + weft * 0.34 + threads[y * size + x] * 1.2;
    }
  }
  return h;
}

/** Every material type in the studio. A look only ever changes their values, so all five stay the same kind of box. */
export function studioMaterials(maxAnisotropy) {
  const grain = normalMapFrom(noise(256, 11, 1), 256, 256, 1.1, [2.4, 2.4], maxAnisotropy);
  const linen = normalMapFrom(linenHeight(256), 256, 256, 1, [1.5, 1.5], maxAnisotropy);
  const blank = new DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, RGBAFormat);
  blank.needsUpdate = true;
  // Always mapped, white unless a wrap is printed on it, so changing between a lacquer and a wrap never recompiles anything.
  const lacquer = new MeshPhysicalMaterial({ metalness: 0, clearcoat: 1, normalMap: grain, normalScale: new Vector2(0.2, 0.2), map: blank });

  const pile = normalMapFrom(noise(256, 29, 2), 256, 256, 5, [3, 3], maxAnisotropy);
  const velvet = (ao) => new MeshPhysicalMaterial({
    roughness: 0.92,
    sheen: 1,
    sheenRoughness: 0.46,
    normalMap: pile,
    normalScale: new Vector2(0.2, 0.2),
    aoMap: ao,
    aoMapIntensity: 1,
    envMapIntensity: 0.75,
  });

  // The satin: too fine to see a weave at this distance, so all it has is a slightly raised woven edge on each side.
  const across = 64;
  const weave = new Float32Array(across * 4);
  for (let y = 0; y < 4; y += 1) {
    for (let x = 0; x < across; x += 1) weave[y * across + x] = x < 3 || x >= across - 3 ? 1 : 0;
  }
  const satinSettings = {
    sheen: 0.16,
    sheenRoughness: 0.34,
    anisotropy: 0.72,
    anisotropyRotation: 0,
    normalMap: normalMapFrom(weave, across, 4, 0.5, [1, 1], maxAnisotropy),
    normalScale: new Vector2(0.5, 0.5),
    vertexColors: true,
    side: 2,
    envMapIntensity: 0.8,
  };
  // The inside of a loop sits in its own shade, whichever way the box is turned.
  const shadedInside = (shader) => {
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <color_fragment>', '#include <color_fragment>\n  if (!gl_FrontFacing) diffuseColor.rgb *= 0.46;')
      .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
  if (!gl_FrontFacing) {
    material.specularF90 *= 0.42;
    #ifdef USE_SHEEN
      material.sheenColor *= 0.2;
    #endif
  }`);
  };
  const ribbon = new MeshPhysicalMaterial(satinSettings);
  ribbon.onBeforeCompile = shadedInside;
  ribbon.customProgramCacheKey = () => 'satin-shaded-inside';

  // Each band is pulled off in one go, from one end: the free end lifts, curls and travels along the lid and away.
  const peel = { value: 0 };
  const bands = new MeshPhysicalMaterial(satinSettings);
  bands.onBeforeCompile = (shader) => {
    shadedInside(shader);
    shader.uniforms.uPeel = peel;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float aT;\nuniform float uPeel;\nvarying float vPeelAt;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
  vPeelAt = aT;
  float gg_front = uPeel * 1.08;
  float gg_ahead = max(vPeelAt - gg_front, 0.0);
  float gg_curl = uPeel > 0.001 ? exp(-pow(gg_ahead / 0.075, 2.0)) : 0.0;
  transformed += normal * gg_curl * 0.16;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPeel;\nvarying float vPeelAt;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  if (uPeel > 0.001 && vPeelAt < uPeel * 1.08) discard;');
  };
  bands.customProgramCacheKey = () => 'satin-peeling-band';

  const foil = new MeshStandardMaterial({
    metalness: 1,
    roughness: 0.42,
    envMapIntensity: 5,
    alphaMap: wordmarkAlpha(),
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });

  const crinkle = normalMapFrom(noise(256, 71, 11), 256, 256, 52, [0.9, 1.3], maxAnisotropy);
  const tissue = new MeshStandardMaterial({ roughness: 0.82, normalMap: crinkle, normalScale: new Vector2(0.3, 0.3), side: 2, envMapIntensity: 0.42 });

  const cardStock = new MeshStandardMaterial({ color: 0xd9d2c3, roughness: 0.88, envMapIntensity: 0.55 });
  const hairline = new MeshStandardMaterial({ color: 0xc9ad78, metalness: 1, roughness: 0.34 });
  const brass = new MeshStandardMaterial({ color: 0xb79c6c, metalness: 1, roughness: 0.3 });
  const ring = new MeshStandardMaterial({ metalness: 1, roughness: 0.5, envMapIntensity: 0.55 });
  const velvetBaseWall = velvet(wallOcclusion(false));
  const velvetLidWall = velvet(wallOcclusion(true));
  const velvetPanel = velvet(panelOcclusion());

  /**
   * Dresses every material for a look. Only values change, so switching looks is immediate and nothing recompiles. A
   * `wrap` (from `wrapTexture`) prints a pattern over the box, its colour included.
   */
  function applyLook(look, wrap = null) {
    const { box, lining, ribbon: satin } = look;
    lacquer.map = wrap ?? blank;
    lacquer.color.set(wrap ? 0xffffff : box.color);
    lacquer.roughness = box.roughness;
    lacquer.specularIntensity = box.specular;
    lacquer.clearcoat = box.coat;
    lacquer.clearcoatRoughness = box.coatRoughness;
    lacquer.normalMap = box.woven ? linen : grain;
    lacquer.normalScale.set(box.grain, box.grain);
    [velvetBaseWall, velvetLidWall, velvetPanel].forEach((m) => {
      m.color.set(lining.color);
      m.sheenColor.set(lining.sheen);
    });
    [ribbon, bands].forEach((m) => {
      m.color.set(satin.color);
      m.roughness = satin.roughness;
      m.metalness = satin.metalness;
      m.sheenColor.set(satin.sheen);
    });
    foil.color.set(look.foil);
    tissue.color.set(look.tissue);
    ring.color.set(look.set.ring);
    ring.metalness = look.set.ringMetal ?? 1;
  }

  /** At the lowest quality, the two most expensive parts of the satin go: the sheen and the stretched highlight. */
  function simplify() {
    [ribbon, bands].forEach((m) => {
      m.anisotropy = 0;
      m.sheen = 0;
      m.needsUpdate = true;
    });
  }

  return {
    lacquer, velvetBaseWall, velvetLidWall, velvetPanel, ribbon, bands, peel, foil, tissue, cardStock, hairline, brass, ring, applyLook, simplify,
    textures: [grain, linen, blank],
  };
}

/** How big one repeat of each wrap is on the box, in scene units (the box is 2.4 wide). */
export const WRAP_TILE = { plain: 1, satin: 1, stripes: 1.6, dots: 1.6, confetti: 1.4, botanical: 1.6, kraft: 1.2, polaroid: 1.6 };

/** Draws a mark at every place it lands on a seamless tile, so it carries across the tile's edges unbroken. */
function tiled(size, x, y, draw) {
  for (const dx of [-size, 0, size]) {
    for (const dy of [-size, 0, size]) draw(x + dx, y + dy);
  }
}

/** A sprig: a curved stem with paired leaves, in the CSS wrap's light fill and fine dark line. */
function sprig(ctx, x, y, angle, scale) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.scale(scale, scale);
  ctx.beginPath();
  ctx.moveTo(-34, 30);
  ctx.quadraticCurveTo(-8, 4, 30, -26);
  ctx.stroke();
  const leaf = (lx, ly, turn) => {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(turn);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(7, -9, 0, -20);
    ctx.quadraticCurveTo(-7, -9, 0, 0);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  };
  [[-20, 17], [-4, 4], [12, -10]].forEach(([lx, ly], i) => {
    leaf(lx, ly, -0.9 - i * 0.05);
    leaf(lx, ly, 0.75 - i * 0.05);
  });
  leaf(30, -26, 0.9);
  ctx.restore();
}

/**
 * The wrap printed on the box: the shopper's box colour with the pattern they chose, generated here as a seamless tile
 * (no downloaded images). Each pattern mixes a light and a dark mark, as the CSS preview does, so it shows on any colour.
 * The photo-frame wrap holds the shopper's own photos when they've added some, and is left as empty frames otherwise.
 */
export function wrapTexture({ pattern, box }, maxAnisotropy, photos = []) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = box;
  ctx.fillRect(0, 0, size, size);
  const random = seeded(97);
  if (pattern === 'stripes') {
    // Four diagonal bands to a tile: on a 45 degree line, so they meet themselves at every edge.
    const period = size / 4;
    for (let k = -8; k <= 8; k += 1) {
      ctx.beginPath();
      const c = k * period;
      ctx.moveTo(c, 0);
      ctx.lineTo(c + size, size);
      ctx.lineTo(c + size + period / 2, size);
      ctx.lineTo(c + period / 2, 0);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255,255,255,0.22)';
      ctx.fill();
    }
    ctx.strokeStyle = 'rgba(0,0,0,0.07)';
    ctx.lineWidth = 3;
    for (let k = -8; k <= 8; k += 1) {
      ctx.beginPath();
      ctx.moveTo(k * period, 0);
      ctx.lineTo(k * period + size, size);
      ctx.stroke();
    }
  } else if (pattern === 'dots') {
    const step = size / 4;
    for (let row = 0; row < 4; row += 1) {
      for (let col = 0; col < 4; col += 1) {
        const x = col * step + (row % 2 ? step / 2 : 0) + step / 4;
        const y = row * step + step / 2;
        tiled(size, x, y, (px, py) => {
          ctx.beginPath();
          ctx.arc(px, py, 21, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(0,0,0,0.16)';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(px, py, 17, 0, Math.PI * 2);
          ctx.fillStyle = 'rgba(255,255,255,0.68)';
          ctx.fill();
        });
      }
    }
  } else if (pattern === 'confetti') {
    const colours = ['#ffd23f', '#ffffff', '#4fb3bf', '#6c3fc4', '#f2645a'];
    for (let i = 0; i < 46; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const colour = colours[i % colours.length];
      const turn = random() * Math.PI;
      const dash = random() < 0.35;
      const r = 6 + random() * 5;
      tiled(size, x, y, (px, py) => {
        ctx.save();
        ctx.translate(px, py);
        ctx.rotate(turn);
        ctx.fillStyle = colour;
        ctx.beginPath();
        if (dash) ctx.rect(-r * 1.6, -r * 0.4, r * 3.2, r * 0.8);
        else ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  } else if (pattern === 'botanical') {
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    ctx.strokeStyle = 'rgba(0,0,0,0.24)';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    [[110, 120, -0.2], [360, 90, 0.9], [240, 300, 2.4], [440, 380, -1.1], [90, 420, 1.6]].forEach(([x, y, a]) => {
      tiled(size, x, y, (px, py) => sprig(ctx, px, py, a, 1.5));
    });
  } else if (pattern === 'kraft') {
    // Paper fibres: short strands, darker and lighter, mostly running one way, and a faint mottle.
    for (let i = 0; i < 900; i += 1) {
      const x = random() * size;
      const y = random() * size;
      const length = 6 + random() * 18;
      const a = 0.12 + (random() - 0.5) * 0.5;
      ctx.strokeStyle = random() < 0.6 ? `rgba(60,40,20,${0.05 + random() * 0.08})` : `rgba(255,255,255,${0.04 + random() * 0.06})`;
      ctx.lineWidth = 1 + random();
      tiled(size, x, y, (px, py) => {
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(px + Math.cos(a) * length, py + Math.sin(a) * length);
        ctx.stroke();
      });
    }
  } else if (pattern === 'polaroid') {
    const step = size / 2;
    let n = 0;
    for (let row = 0; row < 2; row += 1) {
      for (let col = 0; col < 2; col += 1) {
        const x = col * step + step / 2 + (row % 2 ? step / 4 : 0);
        const y = row * step + step / 2;
        const turn = ((row + col) % 2 ? 8 : -8) * (Math.PI / 180);
        const photo = photos.length ? photos[n % photos.length] : null;
        n += 1;
        tiled(size, x, y, (px, py) => {
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(turn);
          ctx.fillStyle = 'rgba(0,0,0,0.14)';
          ctx.fillRect(-68, -78, 140, 164);
          ctx.fillStyle = '#f7f4ee';
          ctx.fillRect(-70, -82, 140, 164);
          if (photo) {
            const cover = Math.max(116 / photo.naturalWidth, 112 / photo.naturalHeight);
            const w = 116 / cover;
            const h = 112 / cover;
            ctx.drawImage(photo, (photo.naturalWidth - w) / 2, (photo.naturalHeight - h) / 2, w, h, -58, -70, 116, 112);
          } else {
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            ctx.fillRect(-58, -70, 116, 112);
          }
          ctx.restore();
        });
      }
    }
  }
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.wrapS = RepeatWrapping;
  t.wrapT = RepeatWrapping;
  const repeat = 1 / WRAP_TILE[pattern];
  t.repeat.set(repeat, repeat);
  t.anisotropy = maxAnisotropy;
  return t;
}

/** The product's real name, set small under the photo as on a gallery label. Long names shrink, then shorten; nothing is added. */
export function captionTexture(name) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const fontAt = (size) => `italic 500 ${size}px "Cormorant Garamond", Georgia, serif`;
  let size = 96;
  ctx.font = fontAt(size);
  while (size > 56 && ctx.measureText(name).width > 960) {
    size -= 4;
    ctx.font = fontAt(size);
  }
  let text = name;
  while (text.length > 4 && ctx.measureText(text).width > 960) text = `${text.slice(0, -2).trimEnd()}…`;
  ctx.fillText(text, 512, 84);
  const t = new CanvasTexture(canvas);
  t.anisotropy = 8;
  return t;
}

/** Splits text into lines that fit a width, with no more than `max` lines; the last says if something had to be left out. */
function wrapLines(ctx, text, width, max) {
  const words = text.split(/\s+/).filter(Boolean);
  const lines = [];
  let line = '';
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  if (lines.length > max) {
    lines.length = max;
    lines[max - 1] = `${lines[max - 1].replace(/\s+\S*$/, '')}…`;
  }
  return lines;
}

/** The card styles a shopper can choose (look.js CARD_STYLES), as paper, rule and ink. Ivory is the reveal's own card. */
export const CARD_PAPERS = {
  ivory: { paper: '#f3eee3', rule: '#c9ad78', ink: '#1d1a14', heading: '#1d1a14' },
  noir: { paper: '#17181d', rule: '#b8984a', ink: '#f3efe7', heading: '#d4af37', double: true },
  party: { paper: '#fff4d6', rule: '#e0b25c', ink: '#4a1c17', heading: '#a3342a', confetti: true },
  kraft: { paper: '#d8b892', rule: '#8a6a48', ink: '#3b2a1a', heading: '#4e3420', fibres: true },
  photo: { paper: '#fffdfb', rule: '#d8c2b6', ink: '#2a2024', heading: '#9c2f45' },
};

/**
 * The recipient's card: only the shopper's own words, on the card style they chose (ivory unless told otherwise). Longer
 * messages get smaller type, then the full text is below the stage. A photo card with a photo sets it beside the words.
 */
export function noteTexture({ heading, message }, style = 'ivory', photo = null) {
  const card = CARD_PAPERS[style] ?? CARD_PAPERS.ivory;
  const canvas = document.createElement('canvas');
  canvas.width = 1160;
  canvas.height = 840;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = card.paper;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (card.fibres) {
    const random = seeded(41);
    for (let i = 0; i < 1400; i += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      ctx.strokeStyle = `rgba(60,40,20,${0.04 + random() * 0.06})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 14 + random() * 10, y + 2);
      ctx.stroke();
    }
  }
  if (card.confetti) {
    [[110, 112, 26, 'rgba(242,100,90,0.45)'], [1050, 96, 18, 'rgba(79,179,191,0.55)'], [1080, 744, 30, 'rgba(255,210,63,0.8)'], [70, 770, 18, 'rgba(108,63,196,0.4)'], [980, 170, 10, 'rgba(242,100,90,0.4)']]
      .forEach(([x, y, r, colour]) => {
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      });
  }
  ctx.strokeStyle = card.rule;
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 38, canvas.width - 76, canvas.height - 76);
  if (card.double) {
    ctx.lineWidth = 1.5;
    ctx.strokeRect(54, 54, canvas.width - 108, canvas.height - 108);
  }
  let centre = canvas.width / 2;
  let width = 960;
  if (photo) {
    const scale = Math.min(440 / photo.naturalWidth, 620 / photo.naturalHeight);
    const w = photo.naturalWidth * scale;
    const h = photo.naturalHeight * scale;
    ctx.drawImage(photo, 90 + (440 - w) / 2, (canvas.height - h) / 2, w, h);
    centre = 820;
    width = 520;
  }
  ctx.fillStyle = card.ink;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const blocks = [];
  if (heading) {
    ctx.font = 'italic 500 84px "Cormorant Garamond", Georgia, serif';
    blocks.push({ font: ctx.font, colour: card.heading, lines: wrapLines(ctx, heading, width, 2), height: 100 });
  }
  if (message) {
    let size = 62;
    let lines;
    do {
      ctx.font = `500 ${size}px "Cormorant Garamond", Georgia, serif`;
      lines = wrapLines(ctx, message, width, Math.floor((heading ? 520 : 680) / (size * 1.28)));
      size -= 4;
    } while (size > 34 && lines[lines.length - 1].endsWith('…'));
    blocks.push({ font: ctx.font, colour: card.ink, lines, height: (size + 4) * 1.28 });
  }
  const gap = blocks.length > 1 ? 40 : 0;
  const total = blocks.reduce((sum, b) => sum + b.lines.length * b.height, gap);
  let y = (canvas.height - total) / 2;
  blocks.forEach((b) => {
    ctx.font = b.font;
    ctx.fillStyle = b.colour;
    b.lines.forEach((text) => {
      ctx.fillText(text, centre, y + b.height / 2);
      y += b.height;
    });
    y += gap;
  });
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** The shopper's own photo in the same ivory mat, for inside the Memory box's lid. Nothing is written on it. */
export function photoCardTexture(image) {
  const canvas = document.createElement('canvas');
  canvas.width = 1160;
  canvas.height = 840;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3eee3';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const scale = Math.min(1040 / image.naturalWidth, 720 / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** How long a photo's host gets before the box goes on without it. */
const PHOTO_PATIENCE_MS = 12000;

function loadImage(url, cors) {
  return new Promise((resolve) => {
    const image = new Image();
    if (cors) image.crossOrigin = 'anonymous';
    image.referrerPolicy = 'no-referrer';
    const timer = setTimeout(() => resolve(null), PHOTO_PATIENCE_MS);
    image.onload = () => {
      clearTimeout(timer);
      resolve(image);
    };
    image.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
}

/**
 * A secure link to the same image on the same host. Many hosts answer http by redirecting to https, and that redirect is
 * what stops WebGL using a photo the host otherwise allows.
 */
export const secureUrl = (url) => url.replace(/^http:\/\//i, 'https://');

/**
 * A real photo, ready for the scene. Usually WebGL can draw it (`texture`). If its host doesn't allow that, it comes back
 * without a texture, to be shown as an ordinary image laid over the print. If it can't be loaded at all, the result is
 * null: nothing is ever made up in its place.
 */
export async function loadPhoto(url, maxAnisotropy) {
  if (!url) return null;
  const secure = secureUrl(url);
  const drawable = await loadImage(secure, true);
  if (drawable) {
    const texture = new CanvasTexture(drawable);
    texture.colorSpace = SRGBColorSpace;
    texture.anisotropy = maxAnisotropy;
    return { texture, aspect: drawable.naturalWidth / drawable.naturalHeight, image: drawable };
  }
  const plain = await loadImage(url, false);
  return plain ? { texture: null, url, aspect: plain.naturalWidth / plain.naturalHeight } : null;
}
