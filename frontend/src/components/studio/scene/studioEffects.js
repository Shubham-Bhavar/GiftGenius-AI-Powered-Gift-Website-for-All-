import {
  AdditiveBlending, BufferAttribute, BufferGeometry, CanvasTexture, Color, DynamicDrawUsage, Group, InstancedBufferAttribute, InstancedMesh, Matrix4, Mesh, MeshStandardMaterial,
  Object3D, PlaneGeometry, Points, PointsMaterial, Vector3,
} from 'three';
import { BOX, PAD_TOP } from './boxGeometry.js';

function seeded(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

const matrix = new Matrix4();
const dummy = new Object3D();

/**
 * Tissue paper over the gift, in two flaps, one from each side. Each folds back on itself along a soft travelling crease,
 * exactly as a sheet does when you lift its free edge and lay it back: the shape at every moment comes from where the
 * crease has reached, so it never stretches or passes through itself.
 */
export function createTissue(material) {
  const group = new Group();
  const hingeX = BOX.W / 2 - BOX.WALL - BOX.LINER - 0.004;
  const halfZ = BOX.D / 2 - BOX.WALL - BOX.LINER - 0.012;
  const LENGTH = hingeX + 0.08;
  const ROWS = 34;
  const COLS = 12;

  const flaps = [-1, 1].map((side, flapIndex) => {
    const count = (ROWS + 1) * (COLS + 1);
    const position = new BufferAttribute(new Float32Array(count * 3), 3);
    position.setUsage(DynamicDrawUsage);
    const uv = new Float32Array(count * 2);
    const index = [];
    for (let r = 0; r <= ROWS; r += 1) {
      for (let c = 0; c <= COLS; c += 1) {
        uv.set([(r / ROWS) * LENGTH * 0.5, (c / COLS) * halfZ], (r * (COLS + 1) + c) * 2);
        if (r < ROWS && c < COLS) {
          const a = r * (COLS + 1) + c;
          if (side < 0) index.push(a, a + 1, a + COLS + 1, a + 1, a + COLS + 2, a + COLS + 1);
          else index.push(a, a + COLS + 1, a + 1, a + 1, a + COLS + 1, a + COLS + 2);
        }
      }
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute('position', position);
    geometry.setAttribute('uv', new BufferAttribute(uv, 2));
    geometry.setIndex(index);
    const mesh = new Mesh(geometry, material);
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    group.add(mesh);
    return { side, geometry, position, seed: flapIndex * 2.3 + 0.7, layer: flapIndex * 0.006 };
  });

  let gather = 1;
  let raised = 0;

  function shape(flap, p) {
    const crease = LENGTH + (0.62 - LENGTH) * p; // how far from the hinge the fold has travelled back to
    const roll = 0.018 + 0.1 * Math.sin(Math.PI * p);
    const floor = PAD_TOP + 0.075 + raised + (0.012 - 0.075 - raised) * p + flap.layer;
    // With several gifts it's gathered in soft pleats against the wall, to leave them room.
    const squeeze = 1 + (gather - 1) * p;
    const pleats = (1 - gather) * p * 0.03;
    const flutter = 0.02 * Math.sin(Math.PI * p);
    for (let r = 0; r <= ROWS; r += 1) {
      const s = (r / ROWS) * LENGTH;
      for (let c = 0; c <= COLS; c += 1) {
        const z = -halfZ + (c / COLS) * 2 * halfZ;
        let x;
        let y;
        if (s <= crease) {
          x = s;
          y = 0;
        } else {
          const past = s - crease;
          const arc = Math.PI * roll;
          if (past < arc) {
            const a = past / roll;
            x = crease + roll * Math.sin(a);
            y = roll * (1 - Math.cos(a));
          } else {
            x = crease - (past - arc);
            y = 2 * roll;
          }
        }
        const waves = 0.0055 * Math.sin(z * 6 + s * 3.4 + flap.seed) + 0.003 * Math.sin(z * 15 - s * 7 + flap.seed * 2);
        const lifted = flutter * Math.sin(z * 3.1 + flap.seed) * (s / LENGTH);
        // Measured from the wall the flap is fixed to, inward.
        const gathered = pleats * (0.5 + 0.5 * Math.sin(x * squeeze * 34 + z * 1.5));
        flap.position.setXYZ(r * (COLS + 1) + c, -flap.side * (hingeX - x * squeeze), floor + y + waves + lifted + gathered, z);
      }
    }
    flap.position.needsUpdate = true;
    flap.geometry.computeVertexNormals();
  }

  let last = -1;
  return {
    group,
    /** How far back it should end up (1 is its full fold), and how high it must lie to clear a riser under it. */
    configure(nextGather, nextRaised) {
      gather = nextGather;
      raised = nextRaised;
      last = -1;
    },
    update(p) {
      if (p === last) return;
      last = p;
      // One flap, then the other a moment later, as two hands would.
      shape(flaps[1], Math.max(0, Math.min(1, p * 1.45)));
      shape(flaps[0], Math.max(0, Math.min(1, (p - 0.28) * 1.45)));
    },
    dispose() {
      flaps.forEach((f) => f.geometry.dispose());
    },
  };
}

/** A curved rose petal, narrow at its base. */
function petalGeometry() {
  const g = new PlaneGeometry(0.15, 0.19, 6, 6);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i += 1) {
    const x = p.getX(i) / 0.075;
    const y = p.getY(i) / 0.095;
    const narrow = 0.34 + 0.66 * Math.sin(((y + 1) / 2) * Math.PI * 0.72 + 0.24);
    p.setXYZ(i, p.getX(i) * narrow, p.getY(i), -0.045 * x * x * narrow + 0.03 * y * y);
  }
  g.computeVertexNormals();
  return g;
}

/**
 * A single controlled burst, as an exact function of time rather than a simulation: every piece has a fixed path and a
 * place it comes to rest, so pausing and replaying give the same picture, and the positions are never random.
 */
function fallingPieces({ count, colors, geometry, seed, size, launch }) {
  const random = seeded(seed);
  const material = new MeshStandardMaterial({ roughness: 0.56, metalness: 0.06, side: 2, envMapIntensity: 0.9 });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.castShadow = true;
  const palette = colors.map((c) => new Color(c));
  mesh.instanceColor = new InstancedBufferAttribute(new Float32Array(count * 3), 3);
  const pieces = Array.from({ length: count }, (_, i) => {
    mesh.setColorAt(i, palette[i % palette.length]);
    return launch(random, i);
  });
  const { drag: k, gravity: g } = launch.physics;

  const placed = new Vector3();
  function at(piece, t, out) {
    const fade = (1 - Math.exp(-k * t)) / k;
    const sway = piece.sway * Math.sin(t * piece.swayRate + piece.phase) * Math.min(1, t * 1.5);
    out.set(
      piece.x + piece.vx * fade + sway,
      piece.y + (piece.vy + g / k) * fade - (g / k) * t,
      piece.z + piece.vz * fade + sway * 0.6,
    );
    return out;
  }
  /** The moment a piece reaches its floor, found once. */
  pieces.forEach((piece) => {
    let t = 0.1;
    const probe = new Vector3();
    for (; t < 12; t += 0.04) {
      at(piece, t, probe);
      const inside = Math.abs(probe.x) < BOX.W / 2 - 0.08 && Math.abs(probe.z) < BOX.D / 2 - 0.08;
      if (probe.y < (inside ? PAD_TOP + 0.02 : 0.012)) break;
    }
    piece.landed = t;
    piece.floor = at(piece, t, new Vector3());
    const inside = Math.abs(piece.floor.x) < BOX.W / 2 - 0.08 && Math.abs(piece.floor.z) < BOX.D / 2 - 0.08;
    piece.floor.y = inside ? PAD_TOP + 0.02 : 0.012 + piece.layer;
    if (inside && Math.abs(piece.floor.x) < 0.56 && piece.floor.z > -0.5) piece.floor.x = Math.sign(piece.floor.x || 1) * (0.56 + Math.abs(piece.floor.x) * 0.9);
  });
  const life = Math.max(...pieces.map((p) => p.landed)) + 0.3;

  return {
    object: mesh,
    life,
    update(t) {
      pieces.forEach((piece, i) => {
        const rest = Math.min(1, Math.max(0, (t - piece.landed + 0.28) / 0.28));
        const flying = Math.min(t, piece.landed);
        at(piece, flying, placed);
        if (t >= piece.landed) placed.copy(piece.floor);
        dummy.position.copy(placed);
        dummy.rotation.set(
          piece.rx + flying * piece.spinX,
          piece.ry + flying * piece.spinY,
          piece.rz + flying * piece.spinZ,
        );
        if (rest > 0) {
          // Settles flat as it lands.
          dummy.rotation.x += (-Math.PI / 2 - dummy.rotation.x) * rest;
          dummy.rotation.y += (0 - dummy.rotation.y) * rest;
        }
        dummy.scale.setScalar(Math.min(1, t * 9) * size);
        dummy.updateMatrix();
        mesh.setMatrixAt(i, dummy.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    },
    hide() {
      matrix.makeScale(0, 0, 0);
      for (let i = 0; i < count; i += 1) mesh.setMatrixAt(i, matrix);
      mesh.instanceMatrix.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      mesh.dispose();
    },
  };
}

function confetti(spec, density) {
  const launch = (random, i) => {
    const angle = i * 2.399963 + random() * 0.4;
    const speed = 0.55 + random() * 1.25;
    return {
      x: Math.cos(angle) * 0.5 * random(), y: BOX.H + 0.1, z: Math.sin(angle) * 0.36 * random() + 0.1,
      vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed * 0.72 + 0.25, vy: 3.6 + random() * 2.1,
      sway: 0.05 + random() * 0.09, swayRate: 3 + random() * 3, phase: random() * 6.28,
      rx: random() * 6.28, ry: random() * 6.28, rz: random() * 6.28,
      spinX: 3 + random() * 6, spinY: 2 + random() * 4, spinZ: 1 + random() * 3, layer: i * 0.00004,
    };
  };
  launch.physics = { drag: 1.5, gravity: 2.6 };
  return fallingPieces({
    count: Math.round(spec.count * density), colors: spec.colors, geometry: new PlaneGeometry(0.052, 0.094), seed: 19, size: 1, launch,
  });
}

function petals(spec, density) {
  const launch = (random, i) => {
    const angle = i * 2.399963;
    const speed = 0.2 + random() * 0.58;
    return {
      x: Math.cos(angle) * 0.46 * random(), y: BOX.H + 0.02, z: Math.sin(angle) * 0.4 * random() + 0.06,
      vx: Math.cos(angle) * speed, vz: Math.sin(angle) * speed * 0.8 + 0.16, vy: 1.2 + random() * 0.85,
      sway: 0.12 + random() * 0.16, swayRate: 1.1 + random() * 1.3, phase: random() * 6.28,
      rx: random() * 6.28, ry: random() * 6.28, rz: random() * 6.28,
      spinX: 0.5 + random() * 1.2, spinY: 0.4 + random() * 1, spinZ: 0.3 + random() * 0.8, layer: i * 0.00008,
    };
  };
  launch.physics = { drag: 1.3, gravity: 0.62 };
  return fallingPieces({
    count: Math.round(spec.count * density), colors: spec.colors, geometry: petalGeometry(), seed: 41, size: 0.86, launch,
  });
}

/** A little fine dust, caught in the light as the lid opens, drifting up and gone. Soft, dim, and over quickly. */
function dust(spec, density) {
  const count = Math.round(spec.count * density);
  const random = seeded(67);
  const motes = Array.from({ length: count }, () => ({
    x: (random() - 0.5) * 1.9, z: (random() - 0.5) * 1.5, rise: 0.22 + random() * 0.34, drift: (random() - 0.5) * 0.2,
    phase: random() * 6.28, delay: random() * 0.9,
  }));
  const positions = new BufferAttribute(new Float32Array(count * 3), 3);
  positions.setUsage(DynamicDrawUsage);
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', positions);
  const canvas = document.createElement('canvas');
  canvas.width = 32;
  canvas.height = 32;
  const ctx = canvas.getContext('2d');
  const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(255,255,255,0.32)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 32, 32);
  const sprite = new CanvasTexture(canvas);
  const material = new PointsMaterial({
    color: spec.color, size: 0.034, map: sprite, transparent: true, depthWrite: false, blending: AdditiveBlending, opacity: 0,
  });
  const points = new Points(geometry, material);
  points.frustumCulled = false;
  const LIFE = 4.6;
  return {
    object: points,
    life: LIFE,
    update(t) {
      motes.forEach((m, i) => {
        const age = Math.max(0, t - m.delay);
        positions.setXYZ(i, m.x + Math.sin(age * 0.9 + m.phase) * 0.05 + m.drift * age, BOX.H * 0.72 + m.rise * age, m.z + Math.cos(age * 0.7 + m.phase) * 0.05);
      });
      positions.needsUpdate = true;
      material.opacity = 0.62 * Math.min(1, t / 0.8) * Math.min(1, Math.max(0, (LIFE - t) / 1.8));
    },
    hide() {
      material.opacity = 0;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
      sprite.dispose();
    },
  };
}

const EFFECTS = { confetti, petals, dust };

/** One look's effect, ready to fire. Weaker devices get fewer pieces of the same thing. */
export function createEffect(spec, density = 1) {
  return spec ? EFFECTS[spec.type](spec, density) : null;
}
