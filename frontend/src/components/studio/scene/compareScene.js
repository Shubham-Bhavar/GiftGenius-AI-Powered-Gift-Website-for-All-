import {
  ACESFilmicToneMapping, CanvasTexture, Group, Mesh, MeshBasicMaterial, Object3D, PerspectiveCamera, PlaneGeometry, Vector3, VSMShadowMap, WebGLRenderer,
} from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { BOX, PAD_TOP, ribbonBands, ribbonBow } from './boxGeometry.js';
import {
  approach, cameraDistance, LID_OPEN_DEG, MAX_TILT, MIN_TILT, openStateAt, smoothstep, SPIN_DEG_PER_S,
} from './choreography.js';
import { splitRects } from './compareLooks.js';
import { matrixForQuad, overlayOpacity } from './photoOverlay.js';
import { GIVE_UP_MS, pixelRatioFor, QUALITY, qualityBelow, RUNNING_BUDGET_MS, verdict } from './quality.js';
import { createTissue } from './studioEffects.js';
import { loadPhoto, noteTexture, studioMaterials, wrapTexture } from './studioMaterials.js';
import {
  buildBase, buildLid, buildPrint, buildSet, contactShadow, FOV, MAX_PRINTS, printLayout, ROW_RISER,
} from './studioScene.js';

const RAD = Math.PI / 180;
const OPEN_MS = 2800;
/**
 * Each frame draws the studio twice. The top quality, at its full sharpness, is where that cost lands, so it's kept only
 * if a frame fits in this; every other quality is judged as the reveal's is. Most devices simply start a step lower here.
 */
const HIGH_BUDGET_MS = 20;
const CLOSE_MS = 1700;
/** The angle every option is first seen from: the reveal's own resting view. */
const YAW = -30;
const TILT = 22;

/** Loads the shopper's own photos (local object URLs) as images, for a photo wrap or a photo card. */
function loadImages(urls) {
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  }))).then((images) => images.filter(Boolean));
}

/**
 * Compare: two options in the studio, through the same camera, under the same lights, on the same floor. There is one
 * box: each option is drawn into its own half of the stage, dressed in that option's look and holding its gifts, so the
 * only differences on screen are the shopper's choices. Both turn and open together. It draws only while something moves.
 * Given a single option, it's the shopper's own box on the whole stage (Your view).
 */
export async function createCompareScene(canvas, {
  width, height, options, reducedMotion = false, quality: startQuality = 'high', pinQuality = false, onContextLost, onTooSlow, onPhotos, onPhotoOverlays, onOverlayFrame,
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
  lap('environment');
  const { scene, floorMesh, inside } = set;
  set.dress(options[0].look, Boolean(QUALITY[startQuality].reflection));

  const turntable = new Group();
  const contact = contactShadow();
  const boxGroup = new Group();
  const lid = buildLid(materials);
  boxGroup.add(buildBase(materials), lid.hinge);
  turntable.add(contact, boxGroup);
  scene.add(turntable);

  // Every option has the same bow and band, so the ribbon is tied once and only its colour changes.
  const bow = ribbonBow(options[0].look.bow);
  const bowParts = {};
  ['loops', 'tails', 'knot'].forEach((part) => {
    if (!bow[part]) return;
    const mesh = new Mesh(bow[part], materials.ribbon);
    mesh.position.copy(bow.center);
    mesh.castShadow = true;
    lid.body.add(mesh);
    bowParts[part] = mesh;
  });
  bowParts.bands = new Mesh(ribbonBands(options[0].look.band), materials.bands);
  bowParts.bands.receiveShadow = true;
  bowParts.bands.frustumCulled = false;
  lid.body.add(bowParts.bands);

  // Each option's card rests in the lid, as in the reveal.
  const anchor = new Object3D();
  anchor.rotation.x = Math.PI / 2;
  anchor.position.set(0, BOX.LID - BOX.CEILING - 0.014, -0.06);
  lid.body.add(anchor);
  const blankCard = new CanvasTexture(document.createElement('canvas'));
  const cardFaceMaterial = new MeshBasicMaterial({ toneMapped: false, map: blankCard });
  cardFaceMaterial.color.setScalar(0.62);
  const card = new Group();
  const cardBack = new Mesh(new RoundedBoxGeometry(1.02, 0.745, 0.02, 2, 0.006), materials.cardStock);
  const cardFace = new Mesh(new PlaneGeometry(1.0, 0.725), cardFaceMaterial);
  cardFace.position.z = 0.0106;
  card.add(cardBack, cardFace);
  card.visible = false;
  scene.add(card);

  /** What belongs to one option: its look, its wrap, its gifts and its card. Only one is in the box at a time. */
  const sides = options.map(() => {
    const tissue = createTissue(materials.tissue);
    tissue.group.visible = false;
    boxGroup.add(tissue.group);
    const printsGroup = new Group();
    printsGroup.visible = false;
    boxGroup.add(printsGroup);
    const riserGeometry = new RoundedBoxGeometry(BOX.W - 2 * (BOX.WALL + BOX.LINER) - 0.02, ROW_RISER + 0.04, 0.62, 4, 0.03);
    riserGeometry.setAttribute('uv1', riserGeometry.getAttribute('uv'));
    const riser = new Mesh(riserGeometry, materials.velvetPanel);
    riser.position.set(0, PAD_TOP + ROW_RISER / 2 - 0.02, -0.61);
    riser.castShadow = true;
    riser.receiveShadow = true;
    riser.visible = false;
    printsGroup.add(riser);
    return { look: null, gift: null, wrap: null, wrapKey: '', cardTexture: null, cardKey: '', photos: [], prints: [], overlays: [], tissue, printsGroup, riser, token: 0 };
  });

  const camera = new PerspectiveCamera(FOV, 1, 0.5, 120);
  camera.layers.enable(1);
  const target = new Vector3();

  const m = { yawUser: 0, yawShown: 0, tiltUser: 0, tiltShown: 0, spin: false, drag: false };
  let openness = 0;
  let openTarget = 0;
  let current = openStateAt(options[0].look, 0);
  let frame = 0;
  let lastFrame = 0;
  let visible = true;
  let w = width;
  let h = height;
  let intervals = 0;
  let intervalSum = 0;
  let disposed = false;
  let quality = startQuality;
  let sceneReady = false;

  function applyQuality(level) {
    quality = level;
    set.applyQuality(QUALITY[level], w, h, options[0].look.set.reflection);
  }

  /** The wrap printed on an option's box, made again only when its pattern, colour or photos change. */
  function dressWrap(side) {
    const spec = side.look.wrap;
    const key = spec ? `${spec.pattern}|${spec.box}|${spec.pattern === 'polaroid' ? side.photos.length : 0}` : '';
    if (key === side.wrapKey) return;
    side.wrap?.dispose();
    side.wrap = spec ? wrapTexture(spec, maxAnisotropy, side.photos) : null;
    side.wrapKey = key;
    if (side.wrap) renderer.initTexture(side.wrap);
  }

  /** The card in an option's lid: their own words on the card style of that option. No words, no card. */
  function dressCard(side) {
    const { heading, message } = side.gift;
    const photo = side.look.card === 'photo' ? side.photos[0] ?? null : null;
    const key = heading || message ? `${side.look.card}|${heading}|${message}|${photo ? photo.src : ''}` : '';
    if (key === side.cardKey) return;
    side.cardTexture?.dispose();
    side.cardTexture = key ? noteTexture({ heading, message }, side.look.card, photo) : null;
    side.cardKey = key;
    // Sent to the GPU now, not the moment the lid first opens, so the opening never stalls on it.
    if (side.cardTexture) renderer.initTexture(side.cardTexture);
  }

  /** Puts one option in the box: its materials, its gifts, its tissue and its card. Nothing is rebuilt; only swapped. */
  function showSide(index, s) {
    sides.forEach((side, i) => {
      side.printsGroup.visible = i === index && s.lidDeg > 1;
      side.tissue.group.visible = i === index;
    });
    const side = sides[index];
    materials.applyLook(side.look, side.wrap);
    cardFaceMaterial.map = side.cardTexture ?? blankCard;
    lid.word.position.z = side.cardTexture ? 0.68 : 0;
    return side;
  }

  /** Everything that follows from how far open the boxes are, for the option being drawn. */
  function applyState(s, side) {
    lid.hinge.rotation.x = -s.lidDeg * RAD;
    inside.intensity = side.look.set.inside * smoothstep(s.lidDeg / 80);
    if (bowParts.tails) {
      const q = s.bowTails;
      bowParts.tails.visible = q < 1;
      bowParts.tails.scale.set(1 - q * 0.96, 1 - q * 0.5, 1 - q * 0.96);
    }
    if (bowParts.loops) {
      const q = s.bowLoops;
      bowParts.loops.visible = q < 1;
      bowParts.loops.scale.set(1 - q * 0.98, 1 - q * 0.72, 1 - q * 0.46);
      bowParts.loops.rotation.y = q * 0.3;
    }
    if (bowParts.knot) {
      const q = s.bowKnot;
      bowParts.knot.visible = q < 1;
      bowParts.knot.scale.set(1 - q * 0.9, 1 - q * 0.92, 1 - q * 0.92);
    }
    materials.peel.value = s.bands;
    bowParts.bands.visible = s.bands < 1;
    contact.material.opacity = 0.92 * (side.look.set.shadow / 0.72);
    side.tissue.update(s.tissue);
    const { prints } = side;
    const stagger = prints.length > 1 ? 0.5 / prints.length : 0;
    prints.forEach((print, i) => {
      const span = 1 - stagger * (prints.length - 1);
      print.setRise(smoothstep((s.print - stagger * i) / span));
    });
    turntable.rotation.y = (YAW + m.yawShown) * RAD;
    floorMesh.material.uniforms.yaw.value = turntable.rotation.y;
    card.visible = Boolean(side.cardTexture) && s.lidDeg > 6;
    if (card.visible) {
      anchor.updateWorldMatrix(true, false);
      anchor.getWorldPosition(card.position);
      anchor.getWorldQuaternion(card.quaternion);
    }
  }

  function aimCamera(s, rect) {
    camera.aspect = rect.w / rect.h;
    camera.updateProjectionMatrix();
    const open = smoothstep(s.lidDeg / LID_OPEN_DEG);
    // Closer than the reveal's framing: each box has half the stage, and there's nothing else in its frame.
    const distance = cameraDistance(camera.aspect, FOV, 1.92 + open * 0.22, 1.16 + open * 1.1);
    target.set(0, 0.56 + open * 0.56, 0);
    const e = Math.max(MIN_TILT, Math.min(MAX_TILT, TILT + m.tiltShown)) * RAD;
    camera.position.set(0, target.y + Math.sin(e) * distance, Math.cos(e) * distance);
    camera.lookAt(target);
  }

  const screenPoint = new Vector3();
  const facing = new Vector3();
  const toCamera = new Vector3();
  /** Keeps each plain photo exactly over its print, in its own option's half of the stage. */
  function placeOverlays(s, side, index, rect) {
    if (!side.overlays.length) return;
    turntable.updateWorldMatrix(true, true);
    camera.updateMatrixWorld();
    const tilt = Math.max(MIN_TILT, Math.min(MAX_TILT, TILT + m.tiltShown));
    const { prints } = side;
    const stagger = prints.length > 1 ? 0.5 / prints.length : 0;
    side.overlays.forEach(({ print, id }) => {
      const rise = smoothstep((s.print - stagger * prints.indexOf(print)) / (1 - stagger * (prints.length - 1)));
      const world = print.worldCorners();
      facing.subVectors(world[3], world[0]).cross(toCamera.subVectors(world[1], world[0])).normalize();
      toCamera.copy(camera.position).sub(world[0]).normalize();
      const opacity = s.lidDeg < 60 ? 0 : overlayOpacity({ rise, facing: facing.dot(toCamera), clearance: tilt - print.lowestTilt, hero: 0 });
      let matrix = null;
      if (opacity > 0) {
        const pixels = world.map((point) => {
          screenPoint.copy(point).project(camera);
          return [(screenPoint.x * 0.5 + 0.5) * rect.w, (0.5 - screenPoint.y * 0.5) * rect.h];
        });
        matrix = matrixForQuad(256, 256 / print.aspect, pixels);
      }
      print.windowImage.visible = opacity < 1;
      onOverlayFrame?.(id, matrix, opacity, index);
    });
  }

  /** One option, drawn into its rectangle of the canvas (CSS pixels from the top left). */
  function drawSide(index, rect, s = current) {
    const side = showSide(index, s);
    applyState(s, side);
    aimCamera(s, rect);
    placeOverlays(s, side, index, rect);
    renderer.setViewport(rect.x, h - rect.y - rect.h, rect.w, rect.h);
    renderer.setScissor(rect.x, h - rect.y - rect.h, rect.w, rect.h);
    renderer.render(scene, camera);
  }

  /**
   * Draws this option open, once, into a single pixel that the next full frame covers again: everything the opening will
   * show is then drawn at least once before it's needed, so the first opening doesn't stall on it.
   */
  function warmOpen(index) {
    const rect = { x: 0, y: h - 1, w: 1, h: 1 };
    renderer.setScissorTest(true);
    drawSide(index, rect, openStateAt(sides[index].look, 1));
    renderer.setScissorTest(false);
    draw();
  }

  function draw() {
    if (sides.some((side) => !side.look)) return;
    renderer.info.reset();
    renderer.setScissorTest(true);
    splitRects(w, h, sides.length).forEach((rect, i) => drawSide(i, rect));
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
  }

  /** Moves the boxes' opening toward where it's headed. Returns true while it still has somewhere to go. */
  function advanceOpening(dt) {
    if (openness === openTarget) return false;
    const step = (dt * 1000) / (openTarget > openness ? OPEN_MS : CLOSE_MS);
    openness = openTarget > openness ? Math.min(openTarget, openness + step) : Math.max(openTarget, openness - step);
    current = openStateAt(sides[0].look, openness);
    return openness !== openTarget;
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
    const moving = advanceOpening(dt);
    draw();
    const settling = Math.abs(m.yawShown - m.yawUser) + Math.abs(m.tiltShown - m.tiltUser) > 0.01;
    if (m.spin || moving || settling) frame = requestAnimationFrame(tick);
    else lastFrame = 0;
  }

  function wake() {
    if (disposed) return;
    if (reducedMotion) {
      m.yawShown = m.yawUser;
      m.tiltShown = m.tiltUser;
      openness = openTarget;
      current = openStateAt(sides[0].look, openness);
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
   * An option's gifts: the real products and the shopper's own photos and words. Photos arrive when their hosts answer,
   * so a slow host never holds up the boxes, and a photo that can't be loaded is never replaced by anything else.
   */
  async function applyGift(index, gift) {
    const side = sides[index];
    side.token += 1;
    const token = side.token;
    side.gift = gift;
    side.photos = await loadImages((gift.photos ?? []).slice(0, 3));
    if (disposed || token !== side.token) return null;
    dressWrap(side);
    dressCard(side);
    if (sceneReady) draw();
    const items = gift.items.slice(0, MAX_PRINTS);
    const photos = await Promise.all(items.map((item) => loadPhoto(item.image, maxAnisotropy)));
    if (disposed || token !== side.token) return null;
    const shown = items.map((item, i) => ({ item, photo: photos[i] })).filter((entry) => entry.photo);
    const next = shown.map(({ item, photo }, i) => buildPrint(photo, item.name, materials, printLayout(shown.length)[i]));
    const staging = new Group();
    next.forEach((print) => staging.add(print.group));
    await renderer.compileAsync(staging, camera, scene).catch(() => {});
    staging.traverse((o) => {
      if (o.material?.map) renderer.initTexture(o.material.map);
      if (o.material?.alphaMap) renderer.initTexture(o.material.alphaMap);
    });
    if (disposed || token !== side.token) {
      next.forEach((print) => print.dispose());
      return null;
    }
    side.prints.forEach((print) => {
      side.printsGroup.remove(print.group);
      print.dispose();
    });
    side.prints = next;
    next.forEach((print) => side.printsGroup.add(print.group));
    side.riser.visible = next.length > 4;
    side.tissue.configure(next.length > 1 ? 0.48 : 1, next.length > 4 ? ROW_RISER : 0);
    side.overlays = next.filter((print) => print.plainUrl).map((print, i) => ({ print, id: `${index}-${i}` }));
    onPhotoOverlays?.(index, side.overlays.map(({ id, print }) => ({ id, url: print.plainUrl, aspect: print.aspect })));
    const refused = items.filter((_, i) => !photos[i]).map((item) => item.name);
    if (sceneReady) warmOpen(index);
    onPhotos?.(index, refused);
    return { refused };
  }

  /** Sets an option's look at once; its gifts follow if they changed. */
  function setOption(index, { look, gift }) {
    const side = sides[index];
    side.look = look;
    const giftChanged = side.gift !== gift;
    if (side.gift) {
      dressWrap(side);
      dressCard(side);
    }
    if (giftChanged) return applyGift(index, gift);
    if (sceneReady) draw();
    return Promise.resolve(null);
  }

  /** Times a few real frames, each forced to finish on the GPU, and takes the middle one. */
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

  // Each option is dressed at once (wrap and card); its gifts and the shopper's photos follow once the scene is measured.
  options.forEach((option, i) => {
    Object.assign(sides[i], { look: option.look, gift: option.gift });
    dressWrap(sides[i]);
    dressCard(sides[i]);
  });
  applyQuality(startQuality);
  // Everything the boxes will need is compiled before they're shown, the open state included.
  sides.forEach((side) => {
    side.printsGroup.visible = true;
    side.tissue.group.visible = true;
  });
  card.visible = true;
  aimCamera(current, splitRects(w, h, sides.length)[0]);
  await renderer.compileAsync(scene, camera).catch(() => {});
  lap('shaders');
  draw();
  lap('firstDraw');

  let tooSlow = false;
  const probes = [];
  if (!pinQuality) {
    for (;;) {
      const ms = timeFrames(5);
      probes.push([quality, Math.round(ms)]);
      const answer = quality === 'high' ? verdict(quality, ms, HIGH_BUDGET_MS) : verdict(quality, ms);
      if (answer === 'give-up') tooSlow = true;
      if (answer !== 'step-down') break;
      applyQuality(qualityBelow(quality));
    }
  }
  sceneReady = true;
  draw();
  lap('probe');
  // The gifts follow, as in the reveal: their photos arrive when their hosts answer, never during the measurement.
  const gifts = options.map((option, i) => applyGift(i, option.gift));

  return {
    tooSlow,
    /** Resolves once both options' gifts are in their boxes (or have been given up on). */
    gifts: Promise.all(gifts),
    setOption,
    /** Opens or closes both boxes together. */
    setOpen(open) {
      openTarget = open ? 1 : 0;
      wake();
    },
    isOpen: () => openTarget === 1,
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
    /** Back to the view both boxes were first shown from. */
    front() {
      m.yawUser = Math.round(m.yawUser / 360) * 360;
      m.tiltUser = 0;
      wake();
    },
    setVisible(on) {
      visible = on;
      if (on && (m.spin || openness !== openTarget)) {
        lastFrame = 0;
        wake();
      }
    },
    resize(nextW, nextH) {
      w = nextW;
      h = nextH;
      renderer.setPixelRatio(pixelRatioFor(QUALITY[quality], window.devicePixelRatio || 1, w));
      renderer.setSize(w, h, false);
      draw();
    },
    /**
     * Stills of other looks, closed and at the resting angle, drawn by this same scene so they match the stage exactly.
     * Each is drawn and copied within one frame, then the stage is drawn again, so nothing ever flashes on screen.
     */
    async stills(looks, size) {
      const results = [];
      const pr = renderer.getPixelRatio();
      const scale = Math.min(1, w / size.w, h / size.h);
      const rect = { x: 0, y: h - Math.floor(size.h * scale), w: Math.floor(size.w * scale), h: Math.floor(size.h * scale) };
      const out = document.createElement('canvas');
      out.width = Math.round(rect.w * pr);
      out.height = Math.round(rect.h * pr);
      const ctx = out.getContext('2d');
      const sheet = sides[0];
      const kept = { look: sheet.look, wrap: sheet.wrap, wrapKey: sheet.wrapKey, card: sheet.cardTexture, yaw: m.yawShown, tilt: m.tiltShown };
      for (const look of looks) {
        await new Promise((resolve) => { requestAnimationFrame(resolve); });
        if (disposed) return [];
        sheet.look = look;
        sheet.wrap = look.wrap ? wrapTexture(look.wrap, maxAnisotropy, sheet.photos) : null;
        sheet.cardTexture = null;
        m.yawShown = 0;
        m.tiltShown = 0;
        renderer.setScissorTest(true);
        drawSide(0, rect, openStateAt(look, 0));
        renderer.setScissorTest(false);
        ctx.drawImage(canvas, rect.x * pr, rect.y * pr, out.width, out.height, 0, 0, out.width, out.height);
        results.push(out.toDataURL('image/jpeg', 0.9));
        sheet.wrap?.dispose();
        Object.assign(sheet, { look: kept.look, wrap: kept.wrap, wrapKey: kept.wrapKey, cardTexture: kept.card });
        m.yawShown = kept.yaw;
        m.tiltShown = kept.tilt;
        draw();
      }
      return results;
    },
    info() {
      const gl = renderer.getContext();
      const debug = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        gpu: debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : 'not reported',
        quality,
        timings,
        probes,
        open: openness,
        drawCalls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
        size: [w, h],
      };
    },
    /** Times real frames, both options drawn, each forced to finish on the GPU, while the boxes turn. */
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
      sides.forEach((side) => {
        side.prints.forEach((print) => print.dispose());
        side.tissue.dispose();
        side.wrap?.dispose();
        side.cardTexture?.dispose();
      });
      blankCard.dispose();
      [bow.loops, bow.tails, bow.knot].forEach((g) => g?.dispose());
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
