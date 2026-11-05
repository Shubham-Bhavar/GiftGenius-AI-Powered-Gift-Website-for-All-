import {
  ACESFilmicToneMapping, BackSide, BufferAttribute, CanvasTexture, CircleGeometry, Color, CylinderGeometry, DirectionalLight, Group, Mesh, MeshBasicMaterial,
  MeshStandardMaterial, Object3D, PerspectiveCamera, PlaneGeometry, PMREMGenerator, PointLight, Quaternion, RingGeometry, Scene, ShaderMaterial, ShadowMaterial, SphereGeometry,
  SpotLight, Vector3, VSMShadowMap, WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { Reflector } from 'three/addons/objects/Reflector.js';
import { dialAngle } from '../experiences/useTurntable.js';
import { BOX, cap, PAD_TOP, ribbonBands, ribbonBow, roundEdge, sweep } from './boxGeometry.js';
import {
  approach, cameraDistance, LID_OPEN_DEG, MAX_TILT, MIN_TILT, smoothstep, SPIN_DEG_PER_S, stateAt,
} from './choreography.js';
import { LOOKS } from './looks.js';
import { GIVE_UP_MS, pixelRatioFor, QUALITY, qualityBelow, RUNNING_BUDGET_MS, verdict } from './quality.js';
import { matrixForQuad, overlayOpacity } from './photoOverlay.js';
import { createEffect, createTissue } from './studioEffects.js';
import { captionTexture, loadPhoto, noteTexture, photoCardTexture, studioMaterials } from './studioMaterials.js';

const RAD = Math.PI / 180;
export const FOV = 24;

/**
 * The light the box sees: a dark room holding softboxes and strip lights, baked into an environment. It's what draws the
 * long, clean highlights along a lacquered box, as in a real product shoot. Every look is lit by this same room.
 */
export function studioEnvironment(renderer) {
  const room = new Scene();
  room.background = new Color(0x020303);
  const softbox = (w, h, x, y, z, color, power, fadeUp = false) => {
    const geometry = new PlaneGeometry(w, h, 1, 8);
    const material = new MeshBasicMaterial({ color: new Color(color).multiplyScalar(power), vertexColors: fadeUp });
    if (fadeUp) {
      // Brightest at its foot and gone by its top, so its reflection melts away across the lid instead of ending in a line.
      const positions = geometry.getAttribute('position');
      const shades = new Float32Array(positions.count * 3);
      for (let i = 0; i < positions.count; i += 1) {
        const shade = (0.5 - positions.getY(i) / h) ** 2;
        shades.set([shade, shade, shade], i * 3);
      }
      geometry.setAttribute('color', new BufferAttribute(shades, 3));
    }
    const mesh = new Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.lookAt(0, 0, 0);
    room.add(mesh);
  };
  softbox(6, 4, -0.8, 8, 2.2, 0xfff4e6, 2.6); // overhead
  softbox(16, 1.5, 0, 2.3, -9.5, 0xfff3e4, 2.5, true); // behind, low: a sheen along the back of the lid only, falling away
  softbox(1, 7, -8, 2.6, 3.5, 0xfff1e0, 7); // left strip
  softbox(0.6, 7, 7.5, 2.6, -2.5, 0xe9f2ff, 5); // right strip
  softbox(14, 14, 0, -5, 3, 0xf2f4f5, 0.42); // the floor's bounce, for the walls to reflect
  const pmrem = new PMREMGenerator(renderer);
  const env = pmrem.fromScene(room, 0.012, 0.1, 40);
  pmrem.dispose();
  return env.texture;
}

const DITHER = `
  float gg_noise(vec2 c) { return fract(52.9829189 * fract(dot(c, vec2(0.06711056, 0.00583715)))); }
`;

/** The seamless sweep behind the set: a soft pool of light on the wall, falling away to the floor's own far colour. */
function backdrop() {
  const material = new ShaderMaterial({
    side: BackSide,
    depthWrite: false,
    uniforms: { horizon: { value: new Color() }, glow: { value: new Color() } },
    vertexShader: 'varying vec3 vDir; void main() { vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `
      uniform vec3 horizon; uniform vec3 glow; varying vec3 vDir;
      ${DITHER}
      void main() {
        vec3 d = normalize(vDir);
        float rise = smoothstep(0.0, 0.16, d.y);
        float pool = exp(-pow(length(vec2(d.x * 1.1, d.y - 0.2)) * 4.2, 2.0));
        gl_FragColor = vec4(horizon + glow * pool * rise, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        gl_FragColor.rgb += (gg_noise(gl_FragCoord.xy) - 0.5) / 255.0;
      }`,
  });
  const dome = new Mesh(new SphereGeometry(45, 32, 16), material);
  dome.layers.set(1); // the main camera only: the floor reflects the box, not the wall
  dome.frustumCulled = false;
  return dome;
}

/**
 * The floor: a polished surface with a pool of light. The box's reflection is strongest where it touches the floor and
 * dissolves with distance from it, as on real polished stone, so it grounds the box without becoming a second image.
 */
function reflectiveFloor(pixelSize) {
  const floor = new Reflector(new CircleGeometry(42, 72), {
    textureWidth: pixelSize,
    textureHeight: pixelSize,
    clipBias: 0.001,
    multisample: 0,
    shader: {
      name: 'StudioFloor',
      uniforms: {
        color: { value: null },
        tDiffuse: { value: null },
        textureMatrix: { value: null },
        near: { value: new Color() },
        far: { value: new Color() },
        strength: { value: 0.8 },
        yaw: { value: 0 },
        footprint: { value: [BOX.W / 2, BOX.D / 2] },
      },
      vertexShader: `
        uniform mat4 textureMatrix; varying vec4 vUv; varying vec3 vWorld;
        void main() {
          vUv = textureMatrix * vec4(position, 1.0);
          vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform vec3 near; uniform vec3 far; uniform float strength; uniform float yaw; uniform vec2 footprint;
        varying vec4 vUv; varying vec3 vWorld;
        ${DITHER}
        void main() {
          float r = length(vWorld.xz - vec2(-0.25, 0.35));
          float pool = smoothstep(7.5, 0.6, r);
          vec3 base = mix(far, near, pool * pool);
          // How far this point of the floor is from the box's own footprint, as it turns.
          float c = cos(yaw);
          float s = sin(yaw);
          vec2 local = vec2(vWorld.x * c - vWorld.z * s, vWorld.x * s + vWorld.z * c);
          vec2 q = abs(local) - footprint;
          float d = max(length(max(q, 0.0)) + min(max(q.x, q.y), 0.0), 0.0);
          float falloff = exp(-d * 3.4);
          vec3 mirrored = vec3(0.0);
          if (strength > 0.0 && falloff > 0.01) {
            vec2 uv = vUv.xy / vUv.w;
            float spread = 0.0012 + 0.015 * smoothstep(0.0, 0.9, d);
            for (int i = 0; i < 14; i++) {
              float a = float(i) * 2.399963;
              float t = sqrt((float(i) + 0.5) / 14.0);
              mirrored += texture2D(tDiffuse, uv + vec2(cos(a), sin(a)) * t * spread).rgb;
            }
            mirrored /= 14.0;
            // Bright reflections are pressed down smoothly, so no wall's glare can stand out on the floor.
            mirrored /= 1.0 + dot(mirrored, vec3(0.3333)) * 7.0;
          }
          vec3 toCamera = normalize(cameraPosition - vWorld);
          float fresnel = 0.3 + 0.7 * pow(1.0 - max(toCamera.y, 0.0), 3.0);
          gl_FragColor = vec4(base + mirrored * strength * fresnel * falloff, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
          gl_FragColor.rgb += (gg_noise(gl_FragCoord.xy) - 0.5) / 255.0;
        }`,
    },
  });
  floor.rotation.x = -Math.PI / 2;
  return floor;
}

/** The soft dark line where the box meets the floor. It turns with the box. */
export function contactShadow() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');
  ctx.filter = 'blur(26px)';
  ctx.fillStyle = '#000';
  ctx.fillRect(112, 137, 288, 238);
  const material = new MeshBasicMaterial({ map: new CanvasTexture(canvas), transparent: true, depthWrite: false, toneMapped: false });
  const mesh = new Mesh(new PlaneGeometry(BOX.W * (512 / 288), BOX.D * (512 / 238)), material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = 0.002;
  return mesh;
}

/**
 * The room every view of the studio shares: the environment, the sweep, the polished floor, the lights and their shadow,
 * and the turntable's brass ring. Whatever is shown in it, it's lit and grounded exactly the same way.
 */
export function buildSet(renderer, materials) {
  const scene = new Scene();
  scene.environment = studioEnvironment(renderer);
  const wall = backdrop();
  scene.add(wall);
  const floorMesh = reflectiveFloor(QUALITY.high.reflection);
  const drawReflection = floorMesh.onBeforeRender;
  scene.add(floorMesh);

  // Key: a big, warm soft light high to the camera's left. It casts the shadow you read the box by.
  const key = new SpotLight(0xfff0dd, 150, 22, 0.42, 0.95, 2);
  key.position.set(-4.2, 7, 4.6);
  key.target.position.set(0, 0.4, 0);
  key.castShadow = true;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.radius = 7;
  key.shadow.blurSamples = 14;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.012;
  key.shadow.camera.near = 4;
  key.shadow.camera.far = 16;
  // Rim: a cool edge from behind on the right, separating the box from the set.
  const rim = new DirectionalLight(0xdce9ff, 1.5);
  rim.position.set(5, 3.4, -5.5);
  // Inside: the fill a photographer would add for the interior. It only comes up as the lid opens.
  const inside = new PointLight(0xfff0dc, 0, 3.2, 1.6);
  inside.position.set(0, 1.25, 0.55);
  scene.add(key, key.target, rim, inside);

  const shadowCatcher = new Mesh(new CircleGeometry(9, 48), new ShadowMaterial({ transparent: true, depthWrite: false }));
  shadowCatcher.rotation.x = -Math.PI / 2;
  shadowCatcher.position.y = 0.003;
  shadowCatcher.receiveShadow = true;
  scene.add(shadowCatcher);

  const ring = new Mesh(new RingGeometry(2.2, 2.206, 128), materials.ring);
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.004;
  scene.add(ring);

  return {
    scene, wall, floorMesh, key, rim, inside, shadowCatcher, ring,
    /** Lights the room for a look's set. */
    dress(look, reflects) {
      const { set } = look;
      wall.material.uniforms.horizon.value.set(set.horizon);
      wall.material.uniforms.glow.value.set(set.glow);
      floorMesh.material.uniforms.near.value.set(set.pool);
      floorMesh.material.uniforms.far.value.set(set.horizon);
      floorMesh.material.uniforms.strength.value = reflects ? set.reflection : 0;
      scene.environmentIntensity = set.env;
      key.intensity = set.key;
      rim.intensity = set.rim;
      shadowCatcher.material.opacity = set.shadow;
    },
    /** Sets how much is asked of the GPU. The room stays the same; only the cost of drawing it changes. */
    applyQuality(q, width, height, reflection) {
      renderer.setPixelRatio(pixelRatioFor(q, window.devicePixelRatio || 1, width));
      renderer.setSize(width, height, false);
      if (q.reflection) {
        floorMesh.getRenderTarget().setSize(q.reflection, q.reflection);
        floorMesh.onBeforeRender = drawReflection;
      } else {
        floorMesh.onBeforeRender = () => {};
      }
      floorMesh.material.uniforms.strength.value = q.reflection ? reflection : 0;
      if (q.shadow === 'contact') {
        key.castShadow = false;
        shadowCatcher.visible = false;
        materials.simplify();
      } else {
        key.castShadow = true;
        shadowCatcher.visible = true;
        key.shadow.radius = q.shadow === 'soft' ? 7 : 5;
        key.shadow.blurSamples = q.shadow === 'soft' ? 14 : 7;
      }
    },
  };
}

/** The base of the box: lacquered walls, lined in velvet, with a foil wordmark on the front. */
export function buildBase(m) {
  const { W, D, H, WALL, EDGE, LINER, FLOOR } = BOX;
  const base = new Group();
  const shell = new Mesh(sweep(W, D, [
    ...roundEdge(0.008, 0.008, 0.008, -90, 0, 3),
    ...roundEdge(EDGE, H - EDGE, EDGE, 0, 90),
    ...roundEdge(WALL - EDGE, H - EDGE, EDGE, 90, 180),
    { i: WALL, y: H - 0.05, nr: -1, ny: 0 },
  ]), m.lacquer);
  const lining = new Mesh(sweep(W, D, [
    { i: WALL, y: H - 0.032, nr: 0, ny: 1 },
    { i: WALL + LINER, y: H - 0.032, nr: 0, ny: 1 },
    { i: WALL + LINER, y: H - 0.032, nr: -1, ny: 0 },
    { i: WALL + LINER, y: FLOOR, nr: -1, ny: 0 },
  ]), m.velvetBaseWall);
  const floor = new Mesh(cap(W, D, WALL + LINER, FLOOR), m.velvetPanel);
  // The padded velvet insert the gift sits in, as in a jewellery box.
  const padGeometry = new RoundedBoxGeometry(W - 2 * (WALL + LINER) - 0.004, PAD_TOP - FLOOR, D - 2 * (WALL + LINER) - 0.004, 5, 0.045);
  padGeometry.setAttribute('uv1', padGeometry.getAttribute('uv'));
  const pad = new Mesh(padGeometry, m.velvetPanel);
  pad.position.y = (PAD_TOP + FLOOR) / 2;
  base.add(shell, lining, floor, pad);

  const word = new Mesh(new PlaneGeometry(0.98, 0.184), m.foil);
  word.position.set(0, H * 0.47, D / 2 + 0.0015);
  base.add(word);

  base.traverse((o) => {
    if (o.isMesh && o !== word) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });
  return base;
}

/** The lid, swinging on its back edge: lacquer outside, velvet inside with the foil wordmark. The ribbon is added by each look. */
export function buildLid(m) {
  const { W, D, LID, WALL, EDGE, LINER, CEILING } = BOX;
  const body = new Group();
  body.position.z = D / 2;
  const shell = new Mesh(sweep(W, D, [
    { i: WALL, y: 0.05, nr: -1, ny: 0 },
    ...roundEdge(WALL - EDGE, EDGE, EDGE, 180, 270),
    ...roundEdge(EDGE, EDGE, EDGE, 270, 360),
    ...roundEdge(EDGE, LID - EDGE, EDGE, 0, 90),
  ]), m.lacquer);
  const top = new Mesh(cap(W, D, EDGE, LID), m.lacquer);
  const lining = new Mesh(sweep(W, D, [
    { i: WALL + LINER, y: LID - CEILING, nr: -1, ny: 0 },
    { i: WALL + LINER, y: 0.032, nr: -1, ny: 0 },
    { i: WALL + LINER, y: 0.032, nr: 0, ny: -1 },
    { i: WALL, y: 0.032, nr: 0, ny: -1 },
  ]), m.velvetLidWall);
  const ceiling = new Mesh(cap(W, D, WALL + LINER, LID - CEILING, false), m.velvetPanel);
  body.add(shell, top, lining, ceiling);
  body.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      o.receiveShadow = true;
    }
  });

  const word = new Mesh(new PlaneGeometry(0.74, 0.139), m.foil);
  word.rotation.x = Math.PI / 2;
  word.position.set(0, LID - CEILING - 0.0015, 0);
  body.add(word);

  const hinge = new Group();
  hinge.position.set(0, BOX.H + BOX.GAP, -D / 2);
  hinge.add(body);
  return { hinge, body, word };
}

const LEAN_FLAT = 88.6 * RAD;
const LEAN_UP = 40 * RAD;
const CARD_W = 0.86;
const CARD_H = 1;
const FOOT_Z = 0.26;
export const MAX_PRINTS = 6;
export const ROW_RISER = 0.2;

/**
 * Where each gift stands, for one to six of them (the most a Gift Studio box can hold). Up to four share a row; five and
 * six use two, the back row on a low velvet step, so that every gift can be seen.
 */
export function printLayout(count) {
  // Far enough back that the box's front wall never cuts across a name.
  const row = (n, scale, spread, extra = { z: 0.1 }) => Array.from({ length: n }, (_, i) => {
    const at = n === 1 ? 0 : i / (n - 1) - 0.5;
    return { scale, x: at * spread, yaw: -at * 0.2, ...extra };
  });
  if (count <= 1) return row(1, 1, 0, {});
  if (count === 2) return row(2, 0.72, 1);
  if (count === 3) return row(3, 0.6, 1.44);
  if (count === 4) return row(4, 0.5, 1.68);
  const back = { z: -0.42, lift: ROW_RISER };
  const front = { z: 0.12 };
  return [...row(3, 0.46, 1.44, back), ...row(count - 3, 0.46, count === 5 ? 0.84 : 1.44, front)];
}

/**
 * One real product, shown as a gallery-mounted photograph: its photo set in an ivory mat with a fine champagne line, its
 * real name below, on a brass easel against a velvet bolster. It starts lying flat under the tissue, and rises on its
 * foot as the reveal ends. The photo is fitted without cropping. It's plainly a photograph, never a pretend 3D model.
 */
export function buildPrint(photo, name, m, { scale, x, yaw, z = FOOT_Z, lift = 0 }) {
  const WINDOW_W = 0.72;
  const WINDOW_H = 0.74;
  const windowY = (CARD_H - WINDOW_H) / 2 - 0.07; // a wider margin below, for the name
  const h = Math.min(WINDOW_H, WINDOW_W / photo.aspect);
  const w = h * photo.aspect;

  // Lit, so it sits in the scene, but kept out of the film-style tone curve: the product's colours stay true.
  // Without a texture (its host doesn't allow WebGL), this is the dark backing behind the real image laid over it.
  const photoMaterial = photo.texture
    ? new MeshStandardMaterial({ map: photo.texture, color: 0xc8c8c8, roughness: 0.62, envMapIntensity: 0.5, toneMapped: false })
    : new MeshStandardMaterial({ color: 0x17140f, roughness: 0.8 });
  const leaning = new Group();
  const mat = new Mesh(new RoundedBoxGeometry(CARD_W, CARD_H, 0.03, 2, 0.008), m.cardStock);
  const line = new Mesh(new PlaneGeometry(w + 0.014, h + 0.014), m.hairline);
  line.position.set(0, windowY, 0.0156);
  const image = new Mesh(new PlaneGeometry(w, h), photoMaterial);
  image.position.set(0, windowY, 0.0162);
  leaning.add(mat, line, image);
  const owned = [photoMaterial];
  if (name) {
    const captionMap = captionTexture(name);
    const captionMaterial = new MeshStandardMaterial({
      color: 0x2a2620, roughness: 0.6, alphaMap: captionMap, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    });
    const caption = new Mesh(new PlaneGeometry(0.72, 0.1125), captionMaterial);
    caption.position.set(0, -CARD_H / 2 + 0.085, 0.0158);
    leaning.add(caption);
    owned.push(captionMaterial);
  }
  mat.castShadow = true;
  mat.receiveShadow = true;
  leaning.position.y = (CARD_H / 2) * scale;

  const pivot = new Group();
  pivot.position.set(0, PAD_TOP + lift + 0.004, z);
  pivot.add(leaning);

  const print = new Group();
  print.position.set(x, 0, 0);
  print.rotation.y = yaw;
  print.scale.set(scale, 1, 1);
  // Scaled about the box's floor and its own foot, so a smaller card still stands on the velvet where it belongs.
  leaning.scale.set(1, scale, scale);
  print.add(pivot);

  // A low velvet bolster the mat's foot rests against.
  const bolsterGeometry = new RoundedBoxGeometry(CARD_W + 0.1, 0.066, 0.15, 4, 0.031);
  bolsterGeometry.setAttribute('uv1', bolsterGeometry.getAttribute('uv'));
  const bolster = new Mesh(bolsterGeometry, m.velvetPanel);
  bolster.position.set(0, PAD_TOP + lift + 0.03, z + 0.085);
  bolster.castShadow = true;
  bolster.receiveShadow = true;
  print.add(bolster);

  // The easel's brass leg behind it, for anyone looking from the side or the back.
  const top = new Vector3(0, PAD_TOP + lift + CARD_H * scale * 0.56 * Math.cos(LEAN_UP), z - CARD_H * scale * 0.56 * Math.sin(LEAN_UP) - 0.02);
  const foot = new Vector3(0, PAD_TOP + lift, top.z - 0.3);
  const leg = new Mesh(new CylinderGeometry(0.008, 0.008, top.distanceTo(foot), 10), m.brass);
  leg.position.copy(top).add(foot).multiplyScalar(0.5);
  leg.quaternion.setFromUnitVectors(new Vector3(0, 1, 0), top.clone().sub(foot).normalize());
  leg.castShadow = true;
  print.add(leg);

  const corners = [[-w / 2, h / 2], [w / 2, h / 2], [w / 2, -h / 2], [-w / 2, -h / 2]].map(([cx, cy]) => new Vector3(cx, windowY + cy, 0.0162));
  // The lowest the camera can go before the box's front wall would pass in front of this photo's window.
  const aboveFoot = (CARD_H / 2 + windowY - h / 2) * scale;
  const windowBottom = PAD_TOP + lift + aboveFoot * Math.cos(LEAN_UP);
  const windowFront = z - aboveFoot * Math.sin(LEAN_UP);
  const lowestTilt = (Math.atan2(BOX.H - windowBottom, BOX.D / 2 - windowFront) / RAD);

  return {
    group: print,
    plainUrl: photo.texture ? null : photo.url,
    aspect: w / h,
    windowImage: image,
    lowestTilt,
    /** The photo window's four corners in the scene right now. */
    worldCorners: () => corners.map((corner) => leaning.localToWorld(corner.clone())),
    setRise(v) {
      pivot.rotation.x = -(LEAN_FLAT + (LEAN_UP - LEAN_FLAT) * v);
      leg.visible = v > 0.97;
    },
    dispose() {
      print.traverse((o) => o.geometry?.dispose?.());
      owned.forEach((material) => {
        material.map?.dispose();
        material.alphaMap?.dispose();
        material.dispose();
      });
    },
  };
}

/** The shopper's own photo, framed on the lid: for the Memory look only, and only if they added one. */
function buildLidPrint(photo, m, x, z, tilt) {
  const fit = Math.min(0.62 / photo.aspect, 0.62);
  const h = fit;
  const w = fit * photo.aspect;
  const group = new Group();
  const frame = new Mesh(new RoundedBoxGeometry(w + 0.1, h + 0.1, 0.012, 2, 0.004), m.cardStock);
  frame.receiveShadow = true;
  frame.castShadow = true;
  const material = new MeshStandardMaterial({ map: photo.texture, color: 0xc8c8c8, roughness: 0.6, toneMapped: false, envMapIntensity: 0.5 });
  const image = new Mesh(new PlaneGeometry(w, h), material);
  image.position.z = 0.0066;
  group.add(frame, image);
  group.rotation.set(-Math.PI / 2, 0, tilt);
  group.position.set(x, BOX.LID + 0.007, z);
  return {
    group,
    dispose() {
      frame.geometry.dispose();
      image.geometry.dispose();
      material.dispose();
    },
  };
}

/**
 * The studio: one box on a flush turntable, one camera and one lighting rig, which every look shares. The camera and
 * lights stay still while the turntable moves, so highlights slide over the box as they do in a studio. It draws only
 * while something is moving; between movements it costs nothing. The reveal's positions all come from `stateAt`, so this
 * only has to ask what a moment looks like.
 */
export async function createStudioScene(canvas, {
  width, height, lookKey, gift, reducedMotion = false, quality: startQuality = 'high', pinQuality = false, onAngle, onContextLost, onTooSlow, onPhotos, onPhotoOverlays, onOverlayFrame,
}) {
  const timings = {};
  let mark = performance.now();
  const lap = (name) => {
    const now = performance.now();
    timings[name] = Math.round(now - mark);
    mark = now;
  };
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(pixelRatioFor(QUALITY[startQuality], window.devicePixelRatio || 1, width));
  renderer.setSize(width, height, false);
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = VSMShadowMap;
  renderer.info.autoReset = false;

  const maxAnisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  await Promise.race([
    Promise.all([
      document.fonts?.load?.('500 124px "Cormorant Garamond"'),
      document.fonts?.load?.('italic 500 96px "Cormorant Garamond"'),
    ]),
    new Promise((resolve) => { setTimeout(resolve, 800); }),
  ]);
  lap('fonts');
  const materials = studioMaterials(maxAnisotropy);
  lap('textures');

  const set = buildSet(renderer, materials);
  const { scene, floorMesh, inside } = set;
  lap('environment');

  const turntable = new Group();
  const contact = contactShadow();
  const boxGroup = new Group();
  const lid = buildLid(materials);
  boxGroup.add(buildBase(materials), lid.hinge);
  const effectsGroup = new Group();
  turntable.add(contact, boxGroup, effectsGroup);
  scene.add(turntable);

  const tissue = createTissue(materials.tissue);
  boxGroup.add(tissue.group);
  const printsGroup = new Group();
  boxGroup.add(printsGroup);
  const riserGeometry = new RoundedBoxGeometry(BOX.W - 2 * (BOX.WALL + BOX.LINER) - 0.02, ROW_RISER + 0.04, 0.62, 4, 0.03);
  riserGeometry.setAttribute('uv1', riserGeometry.getAttribute('uv'));
  const riser = new Mesh(riserGeometry, materials.velvetPanel);
  riser.position.set(0, PAD_TOP + ROW_RISER / 2 - 0.02, -0.61);
  riser.castShadow = true;
  riser.receiveShadow = true;
  riser.visible = false;
  printsGroup.add(riser);

  // The recipient's card lives in the lid, and can leave it to come right up to the camera.
  const anchor = new Object3D();
  anchor.rotation.x = Math.PI / 2;
  anchor.position.set(0, BOX.LID - BOX.CEILING - 0.014, -0.06);
  lid.body.add(anchor);
  const blankCard = new CanvasTexture(document.createElement('canvas'));
  const cardFaceMaterial = new MeshBasicMaterial({ toneMapped: false, map: blankCard });
  const card = new Group();
  const cardBack = new Mesh(new RoundedBoxGeometry(1.02, 0.745, 0.02, 2, 0.006), materials.cardStock);
  const cardFace = new Mesh(new PlaneGeometry(1.0, 0.725), cardFaceMaterial);
  cardFace.position.z = 0.0106;
  card.add(cardBack, cardFace);
  card.visible = false;
  scene.add(card);
  let cardTexture = null;

  const camera = new PerspectiveCamera(FOV, width / height, 0.5, 120);
  camera.layers.enable(1);
  const target = new Vector3();

  let look = LOOKS[lookKey];
  const bowParts = { loops: null, tails: null, knot: null, bands: null };
  const geometryCache = new Map();
  let effect = null;
  let effectStart = null;
  const lidPrints = [];
  let prints = [];
  let overlays = [];

  const m = { yawUser: 0, yawShown: 0, tiltUser: 0, tiltShown: 0, spin: false, drag: false };
  const clock = { offset: 0, pausedAt: null };
  const now = () => (clock.pausedAt ?? performance.now()) - clock.offset;
  let timeline = null; // { stage, start, ms }
  let current = stateAt(look, null);
  let frame = 0;
  let lastFrame = 0;
  let lastLid = -1;
  let visible = true;
  let w = width;
  let h = height;
  let intervals = 0;
  let intervalSum = 0;
  let disposed = false;
  let lastAngle = null;
  let quality = startQuality;
  let hasCard = false;
  let giftToken = 0;
  let sceneReady = false;

  /** Sets how much is asked of the GPU. The set and the box stay the same; only the cost of drawing them changes. */
  function applyQuality(level) {
    quality = level;
    set.applyQuality(QUALITY[level], w, h, look.set.reflection);
  }

  function cached(id, build) {
    if (!geometryCache.has(id)) geometryCache.set(id, build());
    return geometryCache.get(id);
  }

  /** Puts this look's ribbon on the lid: the same kind of satin, in the band and bow it calls for. */
  function dressRibbon() {
    Object.values(bowParts).forEach((mesh) => {
      if (mesh) lid.body.remove(mesh);
    });
    const bow = cached(`bow-${look.bow}`, () => ribbonBow(look.bow));
    ['loops', 'tails', 'knot'].forEach((part) => {
      bowParts[part] = null;
      if (!bow[part]) return;
      const mesh = new Mesh(bow[part], materials.ribbon);
      mesh.position.copy(bow.center);
      mesh.castShadow = true;
      lid.body.add(mesh);
      bowParts[part] = mesh;
    });
    const bandId = `bands-${look.band.width}-${look.band.cross}`;
    bowParts.bands = new Mesh(cached(bandId, () => ribbonBands(look.band)), materials.bands);
    bowParts.bands.receiveShadow = true;
    bowParts.bands.frustumCulled = false;
    lid.body.add(bowParts.bands);
  }

  function clearEffect() {
    if (effect) {
      effect.hide();
      effectStart = null;
    }
  }

  /** Dresses the whole set for a look. Same box, same camera, same rig: only colours, ribbon and timing change. */
  function dress(key_) {
    look = LOOKS[key_];
    materials.applyLook(look);
    set.dress(look, Boolean(QUALITY[quality].reflection));
    dressRibbon();
    if (effect) {
      effectsGroup.remove(effect.object);
      effect.dispose();
    }
    effect = reducedMotion ? null : createEffect(look.effect, quality === 'low' ? 0.6 : 1);
    effectStart = null;
    if (effect) {
      effectsGroup.add(effect.object);
      effect.hide();
    }
    tissue.group.visible = Boolean(look.reveal?.tissue);
  }

  /** Where the card should be and what it says, from the shopper's own words or photo. No words and no photo: no card. */
  function applyCardContents(content, image) {
    cardTexture?.dispose();
    cardTexture = null;
    const wants = look.reveal?.card;
    if (wants && look.photoPrints && image) cardTexture = photoCardTexture(image);
    else if (wants && !look.photoPrints && (content.heading || content.message)) cardTexture = noteTexture(content);
    hasCard = Boolean(cardTexture);
    cardFaceMaterial.map = cardTexture ?? blankCard;
    lid.word.position.z = hasCard ? 0.68 : 0;
  }

  /**
   * The gift itself: the real products, and the shopper's name, message and photo. Nothing is shown that they didn't give.
   * Words appear at once; photos arrive when their hosts answer, so a slow host can never hold up the box.
   */
  async function applyGift(next) {
    giftToken += 1;
    const token = giftToken;
    applyCardContents(next, null);
    const items = next.items.slice(0, MAX_PRINTS);
    const photos = await Promise.all(items.map((item) => loadPhoto(item.image, maxAnisotropy)));
    const own = look.photoPrints ? await Promise.all((next.photos ?? []).slice(0, 2).map((url) => loadPhoto(url, maxAnisotropy))) : [];
    if (disposed || token !== giftToken) return null;
    const shown = items.map((item, i) => ({ item, photo: photos[i] })).filter((entry) => entry.photo);
    const nextPrints = shown.map(({ item, photo }, i) => buildPrint(photo, item.name, materials, printLayout(shown.length)[i]));
    // Compiled before they appear, so they arrive without a stutter.
    const staging = new Group();
    nextPrints.forEach((print) => staging.add(print.group));
    await renderer.compileAsync(staging, camera, scene).catch(() => {});
    if (disposed || token !== giftToken) {
      nextPrints.forEach((print) => print.dispose());
      return null;
    }
    prints.forEach((print) => {
      printsGroup.remove(print.group);
      print.dispose();
    });
    prints = nextPrints;
    prints.forEach((print) => printsGroup.add(print.group));
    // Two rows need a low velvet step behind, and the tissue must lie higher to clear it; any more than one gift needs room.
    riser.visible = prints.length > 4;
    tissue.configure(prints.length > 1 ? 0.48 : 1, prints.length > 4 ? ROW_RISER : 0);
    overlays = prints.filter((print) => print.plainUrl).map((print, i) => ({ print, id: i, last: null }));
    onPhotoOverlays?.(overlays.map(({ id, print }) => ({ id, url: print.plainUrl, aspect: print.aspect })));
    lidPrints.forEach((print) => {
      lid.body.remove(print.group);
      print.dispose();
    });
    lidPrints.length = 0;
    own.forEach((photo, i) => {
      if (!photo) return;
      const print = buildLidPrint(photo, materials, i === 0 ? 0.68 : -0.68, i === 0 ? 0.44 : 0.5, i === 0 ? -0.07 : 0.05);
      lid.body.add(print.group);
      lidPrints.push(print);
    });
    if (own[0]) applyCardContents(next, own[0].image);
    const refused = items.filter((_, i) => !photos[i]).map((item) => item.name);
    if (sceneReady) {
      lastLid = -1;
      draw();
    }
    onPhotos?.(refused);
    return { refused };
  }

  /**
   * Compiles everything a reveal will need, including what's hidden until later, off the main thread where the browser
   * can. Otherwise each would be compiled the moment it first appears, and the animation would stutter right then.
   */
  async function warmShaders() {
    card.visible = true;
    printsGroup.visible = true;
    tissue.group.visible = true;
    await renderer.compileAsync(scene, camera).catch(() => {});
    tissue.group.visible = Boolean(look.reveal?.tissue);
  }

  /** Everything that follows from the state of the reveal. */
  function applyState(s) {
    const r = bowParts;
    if (s.lidDeg !== lastLid) {
      lastLid = s.lidDeg;
      lid.hinge.rotation.x = -s.lidDeg * RAD;
      inside.intensity = look.set.inside * smoothstep(s.lidDeg / 80);
    }
    boxGroup.position.y = s.boxY;
    const lifted = Math.min(1, s.boxY / 0.8);
    contact.material.opacity = (0.92 * look.set.shadow) / 0.72 * (1 - lifted * 0.85);
    contact.scale.setScalar(1 + lifted * 0.3);
    // The ribbon pulled through its knot: tails first, then the loops draw in, then the knot itself gives way.
    if (r.tails) {
      const q = s.bowTails;
      r.tails.visible = q < 1;
      r.tails.scale.set(1 - q * 0.96, 1 - q * 0.5, 1 - q * 0.96);
    }
    if (r.loops) {
      const q = s.bowLoops;
      r.loops.visible = q < 1;
      r.loops.scale.set(1 - q * 0.98, 1 - q * 0.72, 1 - q * 0.46);
      r.loops.rotation.y = q * 0.3;
    }
    if (r.knot) {
      const q = s.bowKnot;
      r.knot.visible = q < 1;
      r.knot.scale.set(1 - q * 0.9, 1 - q * 0.92, 1 - q * 0.92);
    }
    materials.peel.value = s.bands;
    if (r.bands) r.bands.visible = s.bands < 1;

    if (look.reveal?.tissue) tissue.update(s.tissue);
    // Several gifts rise one after another, not all at once.
    const stagger = prints.length > 1 ? 0.5 / prints.length : 0;
    prints.forEach((print, i) => {
      const span = 1 - stagger * (prints.length - 1);
      print.setRise(smoothstep((s.print - stagger * i) / span));
    });
    printsGroup.visible = s.lidDeg > 1;

    const hero = hasCard ? s.hero : 0;
    renderer.toneMappingExposure = look.set.exposure * (hasCard ? s.exposure : 1);

    turntable.rotation.y = (s.camera.yaw + m.yawShown) * RAD;
    floorMesh.material.uniforms.yaw.value = turntable.rotation.y;
    applyCamera(s);

    // The card sits in the lid unless it's in the middle of leaving it.
    card.visible = hasCard && s.lidDeg > 6 && s.cardPop > 0;
    if (card.visible) {
      const pop = s.cardPop;
      const back = 1 + 2.2 * (pop - 1) ** 3 + 1.2 * (pop - 1) ** 2; // a springy unfolding, with a touch of overshoot
      anchor.rotation.x = Math.PI / 2 + (1 - back) * 1.5;
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(restPosition);
      anchor.getWorldQuaternion(restRotation);
      if (hero > 0) {
        const distance = Math.max(3.7, 1.25 / (2 * Math.tan((FOV * Math.PI) / 360) * camera.aspect * 0.86));
        camera.getWorldDirection(heroPosition).multiplyScalar(distance).add(camera.position);
        card.position.lerpVectors(restPosition, heroPosition, hero);
        card.quaternion.slerpQuaternions(restRotation, camera.quaternion, hero);
      } else {
        card.position.copy(restPosition);
        card.quaternion.copy(restRotation);
      }
      cardFaceMaterial.color.setScalar(0.62 + 0.38 * hero);
    }
    placeOverlays(s, hero);
    const angle = dialAngle(s.camera.yaw + m.yawShown);
    if (angle !== lastAngle) {
      lastAngle = angle;
      onAngle?.(angle);
    }
  }
  const restPosition = new Vector3();
  const restRotation = new Quaternion();
  const heroPosition = new Vector3();
  const screenPoint = new Vector3();
  const printFacing = new Vector3();
  const toCamera = new Vector3();

  /** Keeps each plain photo exactly over its print's window, in true perspective, for as long as it can be seen there. */
  function placeOverlays(s, hero) {
    if (!overlays.length) return;
    turntable.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    const tilt = Math.max(MIN_TILT, Math.min(MAX_TILT, s.camera.tilt + m.tiltShown));
    overlays.forEach((overlay, index) => {
      const { print, id } = overlay;
      const stagger = prints.length > 1 ? 0.5 / prints.length : 0;
      const rise = smoothstep((s.print - stagger * prints.indexOf(print)) / (1 - stagger * (prints.length - 1)));
      const world = print.worldCorners();
      printFacing.subVectors(world[3], world[0]).cross(toCamera.subVectors(world[1], world[0])).normalize();
      toCamera.copy(camera.position).sub(world[0]).normalize();
      const opacity = s.lidDeg < 60 ? 0 : overlayOpacity({ rise, facing: printFacing.dot(toCamera), clearance: tilt - print.lowestTilt, hero });
      let matrix = null;
      if (opacity > 0) {
        const pixels = world.map((point) => {
          screenPoint.copy(point).project(camera);
          return [(screenPoint.x * 0.5 + 0.5) * w, (0.5 - screenPoint.y * 0.5) * h];
        });
        matrix = matrixForQuad(256, 256 / print.aspect, pixels);
      }
      print.windowImage.visible = opacity < 1;
      onOverlayFrame?.(id, matrix, opacity, index);
    });
  }

  function applyCamera(s) {
    const open = smoothstep(s.lidDeg / LID_OPEN_DEG);
    const halfW = 2.42;
    const halfH = 1.34 + open * 0.9;
    const distance = cameraDistance(w / h, FOV, halfW, halfH) * s.camera.dolly;
    // A closer camera looks at the top of the box, where the ribbon is; a wider one at the whole of it.
    target.set(0, 0.56 + open * 0.56 + Math.max(0, 1 - s.camera.dolly) * 0.9 + s.boxY * 0.15, 0);
    const e = Math.max(MIN_TILT, Math.min(MAX_TILT, s.camera.tilt + m.tiltShown)) * RAD;
    camera.position.set(target.x, target.y + Math.sin(e) * distance, target.z + Math.cos(e) * distance);
    camera.lookAt(target);
  }

  function draw() {
    applyState(current);
    renderer.info.reset();
    renderer.render(scene, camera);
  }

  /** Works out the current moment. Returns true while the timeline still has somewhere to go. */
  function advance(nowMs) {
    if (!timeline) return false;
    const p = timeline.instant ? 1 : (nowMs - timeline.start) / timeline.ms;
    current = stateAt(look, timeline.stage, p);
    const spec = look.effect;
    if (effect && effectStart === null && !timeline.instant && timeline.stage === spec.stage && p >= spec.at) {
      effectStart = nowMs - (p - spec.at) * timeline.ms;
    }
    return p < 1 && clock.pausedAt === null;
  }

  function advanceEffect(nowMs) {
    if (!effect || effectStart === null) return false;
    const t = (nowMs - effectStart) / 1000;
    effect.update(Math.min(t, effect.life));
    return t < effect.life && clock.pausedAt === null;
  }

  function tick(rafNow) {
    frame = 0;
    if (disposed || !visible) return;
    const dt = lastFrame ? Math.min(0.05, (rafNow - lastFrame) / 1000) : 1 / 60;
    if (lastFrame) {
      intervalSum += rafNow - lastFrame;
      intervals += 1;
      if (intervals === 45) {
        const average = intervalSum / intervals;
        intervals = 0;
        intervalSum = 0;
        if (!pinQuality) {
          const below = qualityBelow(quality);
          if (below && average > RUNNING_BUDGET_MS) applyQuality(below);
          else if (!below && average > GIVE_UP_MS) onTooSlow?.();
        }
      }
    }
    lastFrame = rafNow;
    if (m.spin && !m.drag) m.yawUser += SPIN_DEG_PER_S * dt;
    m.yawShown = approach(m.yawShown, m.yawUser, dt, 6);
    m.tiltShown = approach(m.tiltShown, m.tiltUser, dt, 6);
    const vNow = now();
    const moving = advance(vNow);
    const burst = advanceEffect(vNow);
    draw();
    const settling = Math.abs(m.yawShown - m.yawUser) + Math.abs(m.tiltShown - m.tiltUser) > 0.01;
    if (m.spin || moving || burst || settling) frame = requestAnimationFrame(tick);
    else lastFrame = 0;
  }

  function wake() {
    if (disposed) return;
    if (reducedMotion) {
      m.yawShown = m.yawUser;
      m.tiltShown = m.tiltUser;
      advance(now());
      draw();
      return;
    }
    if (!frame) frame = requestAnimationFrame(tick);
  }

  const onLost = (e) => {
    e.preventDefault();
    onContextLost?.();
  };
  canvas.addEventListener('webglcontextlost', onLost);

  /**
   * Times a few real frames, each forced to finish on the GPU, and takes the middle one: one slow frame (an upload, a
   * garbage collection, another tab) mustn't condemn a capable device to a lower quality for good.
   */
  function timeFrames(count) {
    const gl = renderer.getContext();
    const pixel = new Uint8Array(4);
    const start = m.yawShown;
    const times = [];
    for (let i = 0; i <= count; i += 1) {
      m.yawShown = start + i * 7;
      const t0 = performance.now();
      draw();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      if (i > 0) times.push(performance.now() - t0);
    }
    m.yawShown = start;
    times.sort((x, y) => x - y);
    return times[Math.floor(count / 2)];
  }

  dress(lookKey);
  applyQuality(startQuality);
  applyCamera(current);
  renderer.toneMappingExposure = look.set.exposure;
  await warmShaders();
  lap('shaders');
  draw();
  lap('firstDraw');

  let tooSlow = false;
  if (!pinQuality) {
    // The device's real answer, rather than a guess: step down until frames fit, or admit it can't manage this.
    for (;;) {
      const answer = verdict(quality, timeFrames(5));
      if (answer === 'give-up') tooSlow = true;
      if (answer !== 'step-down') break;
      applyQuality(qualityBelow(quality));
    }
  }
  draw();
  lap('probe');
  sceneReady = true;
  applyGift(gift);

  return {
    tooSlow,
    /** Changes look at rest. The reveal starts again from the top when it's next played. */
    setLook(next) {
      timeline = null;
      clock.pausedAt = null;
      dress(next);
      current = stateAt(look, null);
      lastLid = -1;
      wake();
      draw();
      warmShaders().then(() => {
        if (!disposed) draw();
      });
    },
    setGift: applyGift,
    /** Starts a stage of the reveal; it runs on this scene's own clock until the next one begins. */
    play(stage, ms) {
      clock.pausedAt = null;
      if (stage === 'entrance') clearEffect();
      timeline = { stage, start: now(), ms, instant: reducedMotion };
      wake();
    },
    setPaused(on) {
      if (on && clock.pausedAt === null) clock.pausedAt = performance.now();
      if (!on && clock.pausedAt !== null) {
        clock.offset += performance.now() - clock.pausedAt;
        clock.pausedAt = null;
        wake();
      }
    },
    showIdle() {
      timeline = null;
      clock.pausedAt = null;
      clearEffect();
      current = stateAt(look, null);
      m.yawUser = 0;
      m.tiltUser = 0;
      lastLid = -1;
      wake();
      draw();
    },
    showFinished() {
      timeline = null;
      clock.pausedAt = null;
      clearEffect();
      current = stateAt(look, 'finished');
      lastLid = -1;
      wake();
      draw();
    },
    /** Shows one exact moment, for comparing frames. */
    holdAt(stage, p) {
      timeline = null;
      clock.pausedAt = null;
      current = stateAt(look, stage, p);
      lastLid = -1;
      draw();
    },
    /** Shows an effect at an exact time, for comparing frames. */
    holdEffect(seconds) {
      if (effect) {
        effect.update(Math.min(seconds, effect.life));
        draw();
      }
    },
    setSpin(on) {
      const spin = on && !reducedMotion;
      if (spin === m.spin) return;
      m.spin = spin;
      if (spin) wake();
    },
    setDragging(on) {
      m.drag = on;
      if (!on) wake();
    },
    turnBy(dy, dx) {
      m.yawUser += dy;
      m.tiltUser += dx;
      wake();
    },
    /** Sets the dial: straight to that angle, the short way round. */
    turnTo(degrees) {
      const here = ((current.camera.yaw + m.yawUser) % 360 + 360) % 360;
      m.yawUser += ((degrees - here + 540) % 360) - 180;
      m.yawShown = m.yawUser;
      draw();
    },
    setVisible(on) {
      visible = on;
      if (on && (m.spin || timeline || effectStart !== null)) {
        lastFrame = 0;
        wake();
      }
    },
    resize(nextW, nextH) {
      w = nextW;
      h = nextH;
      renderer.setPixelRatio(pixelRatioFor(QUALITY[quality], window.devicePixelRatio || 1, w));
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      draw();
    },
    /** What the last frame cost, every pass included: the shadow map, the reflection and the view itself. */
    info() {
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'not reported',
        quality,
        timings,
        frame: renderer.info.render.frame,
        lidDegrees: current.lidDeg,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
        size: [w, h],
      };
    },
    /** Times real frames at the current moment, each one forced to finish on the GPU, while the box turns. */
    benchmark(frames = 120) {
      const gl = renderer.getContext();
      const pixel = new Uint8Array(4);
      const start = m.yawShown;
      const times = [];
      for (let i = 0; i < frames; i += 1) {
        m.yawShown = start + i * (360 / frames);
        const t0 = performance.now();
        draw();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        times.push(performance.now() - t0);
      }
      m.yawShown = start;
      draw();
      times.sort((a, b) => a - b);
      const average = times.reduce((a, b) => a + b, 0) / times.length;
      return { frames, averageMs: average, medianMs: times[Math.floor(frames / 2)], p95Ms: times[Math.floor(frames * 0.95)], worstMs: times[frames - 1] };
    },
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      canvas.removeEventListener('webglcontextlost', onLost);
      prints.forEach((print) => print.dispose());
      lidPrints.forEach((print) => print.dispose());
      effect?.dispose();
      tissue.dispose();
      cardTexture?.dispose();
      blankCard.dispose();
      geometryCache.forEach((g) => {
        if (g.isBufferGeometry) g.dispose();
        else Object.values(g).forEach((part) => part?.dispose?.());
      });
      scene.traverse((o) => {
        o.geometry?.dispose?.();
        const list = Array.isArray(o.material) ? o.material : [o.material];
        list.forEach((mat) => {
          if (!mat) return;
          Object.values(mat).forEach((value) => value?.isTexture && value.dispose());
          mat.dispose();
        });
      });
      materials.textures.forEach((t) => t.dispose());
      floorMesh.dispose();
      scene.environment?.dispose();
      renderer.dispose();
    },
  };
}
