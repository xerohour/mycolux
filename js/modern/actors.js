// MYCOLUX Modern – everything that lives on the field: painted sprites (site/assets/spr) placed in the 3D forest.
// Mushrooms are camera-facing billboards in one instanced mesh (worn away from the bottom up, tinted per world,
// poisoned ones turn toxic); worm, spider and scorpion lie on the ground and turn where they walk, their legs
// swing in the vertex shader; the beetle flies, the forest spirit faces the camera and carries the lantern light.
// sync() copies the game state into the scene every frame.
import * as THREE from 'three';
import { WORLDS } from './scene.js';

const MYX = window.MYX;
const COLS = 30, ROWS = 32;
// game pixels -> world: x is a centre column, y the top of an 8-pixel frame
export const PX = x => (x + 0.5) / 8 - 15;
export const PZ = y => (y + 4) / 8 - 16;
const TAU = Math.PI * 2;
export const KIND_COLORS = { triple: 0xffd23f, pierce: 0x6af0ff, flies: 0xb6ff3a, slow: 0xb89cff, bomb: 0xff6ad5 };

function hash(n) { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }

const loader = new THREE.TextureLoader();
function sprTex(name) {
  const t = loader.load('assets/spr/' + name + '.webp');
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// ------------------------------------------------------------------ lights the sprites react to (lantern, bolt, flashes)
export const SpriteLights = {
  pos: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3(0, -50, 0)),
  col: [0, 1, 2, 3, 4, 5].map(() => new THREE.Vector3()),
  amb: { value: 0.8 }
};
const LIGHT_GLSL = `
uniform vec3 uLP[6]; uniform vec3 uLC[6]; uniform float uAmb;
vec3 hueRot(vec3 c, float a) { const vec3 k = vec3(0.57735); float ca = cos(a); return c * ca + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - ca); }
// painted art: dark parts take the light around them, bright glowing parts stay bright and feed the bloom
vec3 shade(vec3 c, vec3 wp) {
  vec3 l = vec3(uAmb);
  for (int i = 0; i < 6; i++) { vec3 d = wp - uLP[i]; l += uLC[i] / (1.0 + dot(d, d) * 0.55); }
  float m = max(c.r, max(c.g, c.b));
  float glow = smoothstep(0.5, 0.95, m);
  return mix(c * l, c * (1.35 + 0.3 * glow), glow);
}`;
function lightUniforms() { return { uLP: { value: SpriteLights.pos }, uLC: { value: SpriteLights.col }, uAmb: SpriteLights.amb }; }

// ------------------------------------------------------------------ a sprite lying on the ground (or flying flat)
// legs: number of leg pairs around the body that swing, wob: swing amplitude (radians), flap: wing beat
function groundMat(tex, opt = {}) {
  return new THREE.ShaderMaterial({
    uniforms: Object.assign({ map: { value: tex }, uTime: { value: 0 }, uPhase: { value: 0 }, uWob: { value: opt.wob || 0 }, uLegs: { value: opt.legs || 3 },
      uFlap: { value: opt.flap || 0 }, uTint: { value: new THREE.Color(1, 1, 1) }, uTintAmt: { value: 0 }, uFlash: { value: 0 }, uAlpha: { value: 1 },
      uEdge: { value: new THREE.Color(opt.edge || 0x000000) }, uLift: { value: opt.lift || 1 } }, lightUniforms()),
    vertexShader: `uniform float uPhase; uniform float uWob; uniform float uLegs; uniform float uFlap; uniform float uTime;
      varying vec2 vUv; varying vec3 vWp;
      void main() {
        vUv = uv;
        vec3 p = position;
        float r = length(p.xz);
        // legs swing around the body: outer parts rotate back and forth, neighbours in counter phase
        float a = atan(p.z, p.x);
        float sw = uWob * smoothstep(0.18, 0.42, r) * sin(uPhase + a * uLegs);
        float cs = cos(sw), sn = sin(sw);
        p.xz = mat2(cs, -sn, sn, cs) * p.xz;
        // wing beat: the sides squeeze in and out
        p.x *= 1.0 - uFlap * smoothstep(0.15, 0.45, abs(p.x)) * (0.5 + 0.5 * sin(uTime * 55.0));
        vec4 wp = modelMatrix * vec4(p, 1.0);
        vWp = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: `uniform sampler2D map; uniform vec3 uTint; uniform float uTintAmt; uniform float uFlash; uniform float uAlpha; uniform vec3 uEdge; uniform float uLift;
      varying vec2 vUv; varying vec3 vWp;
      ${LIGHT_GLSL}
      void main() {
        vec4 c = texture2D(map, vUv);
        if (c.a < 0.3) discard;
        vec3 col = shade(c.rgb * uLift, vWp);
        // a glowing rim along the outline keeps the dark creatures readable on the dark ground
        float e = 0.014;
        float mn = min(min(texture2D(map, vUv + vec2(e, 0.0)).a, texture2D(map, vUv - vec2(e, 0.0)).a), min(texture2D(map, vUv + vec2(0.0, e)).a, texture2D(map, vUv - vec2(0.0, e)).a));
        col += uEdge * smoothstep(0.15, 0.9, c.a - mn) * 1.6;
        float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
        col = mix(col, uTint * (0.35 + lum * 1.6), uTintAmt);
        col += vec3(uFlash);
        gl_FragColor = vec4(col, c.a * uAlpha);
        #include <colorspace_fragment>
      }`,
    transparent: true, alphaToCoverage: true, depthWrite: true
  });
}
function groundQuad(mat, size) {
  const g = new THREE.PlaneGeometry(1, 1, 12, 12);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, mat);
  m.scale.setScalar(size);
  m.frustumCulled = false;
  return m;
}

// ------------------------------------------------------------------ camera-facing billboards (mushrooms, spirit)
const BILL_VERT = `
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);`;

class MushSprites {
  // one instanced mesh of billboards; used for the field (one slot per tile) and the forest around it
  constructor(scene, atlas, time, max, uni) {
    this.max = max;
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    this.state = new Float32Array(max * 4);
    this.vari = new Float32Array(max * 2);
    g.setAttribute('aState', new THREE.InstancedBufferAttribute(this.state, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aVar', new THREE.InstancedBufferAttribute(this.vari, 2).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ map: { value: atlas }, uTime: time, uHue: uni.hue, uPoison: uni.poison, uDim: { value: 1 } }, lightUniforms()),
      vertexShader: `attribute vec4 aState; attribute vec2 aVar; uniform float uTime;
        varying vec2 vUv; varying vec4 vState; varying vec2 vVar; varying vec3 vWp;
        void main() {
          vUv = uv; vState = aState; vVar = aVar;
          vec3 c = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
          float sx = length(instanceMatrix[0].xyz), sy = length(instanceMatrix[1].xyz);
          ${BILL_VERT}
          // a hit makes it wobble; everything sways a little
          float lean = instanceMatrix[1].x / max(sy, 0.001) + sin(uTime * 1.3 + aState.w * 30.0) * 0.02;
          vec3 p = c + right * (position.x * sx + position.y * sy * lean) + up * position.y * sy;
          vWp = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform sampler2D map; uniform float uTime; uniform float uHue; uniform vec3 uPoison; uniform float uDim;
        varying vec2 vUv; varying vec4 vState; varying vec2 vVar; varying vec3 vWp;
        ${LIGHT_GLSL}
        void main() {
          // worn away from the bottom up (stem first), with a ragged edge
          float cut = (1.0 - vState.x) * 0.78;
          float edge = cut + (sin(vUv.x * 41.0 + vState.w * 20.0) * 0.5 + 0.5) * 0.05 * step(0.01, cut);
          if (vUv.y < edge) discard;
          vec4 c = texture2D(map, vec2((vVar.x + vUv.x) / 3.0, vUv.y));
          if (c.a < 0.32) discard;
          vec3 col = hueRot(c.rgb, uHue + vVar.y);
          float lum = dot(c.rgb, vec3(0.3, 0.59, 0.11));
          float pulse = 0.7 + 0.3 * sin(uTime * 6.0 + vState.w * 40.0);
          col = mix(col, uPoison * (0.25 + lum * 1.9) * pulse, vState.y * 0.85);
          col = shade(col, vWp) * uDim;
          // a burnt rim where it was hit
          col *= mix(1.0, 0.45, smoothstep(0.08, 0.0, vUv.y - edge) * step(0.01, cut));
          col += vec3(1.0, 0.95, 0.85) * vState.z * 1.6;
          gl_FragColor = vec4(col, c.a);
          #include <colorspace_fragment>
        }`,
      transparent: true, alphaToCoverage: true, depthWrite: true
    });
    this.mesh = new THREE.InstancedMesh(g, this.mat, max);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.count = 0;
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
  }
  // x, z, width, height, lean, hp 0..1, poison, flash, seed, variant, hue offset
  put(n, x, z, w, h, lean, hp, pois, flash, seed, v, hue) {
    const e = this.m.elements;
    e[0] = w; e[1] = 0; e[2] = 0; e[3] = 0;
    e[4] = lean * h; e[5] = h; e[6] = 0; e[7] = 0;
    e[8] = 0; e[9] = 0; e[10] = 1; e[11] = 0;
    e[12] = x; e[13] = 0; e[14] = z; e[15] = 1;
    this.mesh.setMatrixAt(n, this.m);
    this.state[n * 4] = hp; this.state[n * 4 + 1] = pois; this.state[n * 4 + 2] = flash; this.state[n * 4 + 3] = seed;
    this.vari[n * 2] = v; this.vari[n * 2 + 1] = hue;
  }
  done(n) {
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.geometry.attributes.aState.needsUpdate = true;
    this.mesh.geometry.attributes.aVar.needsUpdate = true;
  }
}

// the three mushroom paintings side by side in one texture
function mushAtlas() {
  const cv = document.createElement('canvas');
  cv.width = 1152; cv.height = 384;
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  ['mush_a', 'mush_b', 'mush_c'].forEach((n, i) => {
    const img = new Image();
    img.onload = () => { cv.getContext('2d').drawImage(img, i * 384, 0, 384, 384); tex.needsUpdate = true; };
    img.src = 'assets/spr/' + n + '.webp';
  });
  return tex;
}

// hue turns from the cyan paintings to each world's colours (one per painting)
const WORLD_HUES = [[0, -0.22, 0.28], [-3.02, -2.78, -3.25], [0.98, 0.72, 1.22], [2.2, -1.85, 2.5]];

class MushField {
  constructor(scene, time) {
    this.uni = { hue: { value: 0 }, poison: { value: new THREE.Color(0xc7ff3a) } };
    this.atlas = mushAtlas();
    this.field = new MushSprites(scene, this.atlas, time, COLS * ROWS, this.uni);
    // per tile: hit flash, growing, wobble, the shown hit points
    const N = COLS * ROWS;
    this.flash = new Float32Array(N);
    this.grow = new Float32Array(N).fill(1);
    this.wob = new Float32Array(N);
    this.shown = new Uint8Array(N);
    this.hues = WORLD_HUES[0];
    // the forest around the field: big glowing mushrooms, dimmer, never touched by the game
    this.dressHue = { value: 0 };
    this.dress = new MushSprites(scene, this.atlas, time, 140, { hue: this.dressHue, poison: this.uni.poison });
    this.dress.mat.uniforms.uDim.value = 0.62;
    const rng = new MYX.Rng(99);
    let n = 0;
    this.dressVar = [];
    const add = (x, z, s) => { const v = rng.int(0, 2); this.dressVar.push(v); this.dress.put(n++, x, z, s * (v === 2 ? 0.75 : 1), s, (rng.next() - 0.5) * 0.15, 1, 0, 0, rng.next(), v, (rng.next() - 0.5) * 0.4); };
    for (let i = 0; i < 60; i++) { const side = i % 2 ? 1 : -1; add(side * (16.4 + Math.pow(rng.next(), 1.5) * 18), -20 + rng.next() * 40, 1 + rng.next() * 3.2); }
    for (let i = 0; i < 40; i++) add(-34 + rng.next() * 68, -19 - rng.next() * 30, 2 + rng.next() * 6);
    for (let i = 0; i < 30; i++) { const side = i % 2 ? 1 : -1; add(side * (15.8 + rng.next() * 2.5), -16.5 + rng.next() * 33, 0.6 + rng.next() * 0.9); }
    this.dress.done(n);
  }
  setWorld(W, i) {
    this.hues = WORLD_HUES[i];
    this.dressHue.value = WORLD_HUES[i][0];
    this.uni.poison.value.set(W.poison);
  }
  hit(i) { this.flash[i] = 1; this.wob[i] = 1; }
  sprout(i) { this.grow[i] = 0; }
  sync(game, dt) {
    let n = 0;
    const mush = game.mush, pois = game.poison;
    for (let i = 0; i < COLS * ROWS; i++) {
      if (this.flash[i] > 0) this.flash[i] = Math.max(0, this.flash[i] - dt * 6);
      if (this.wob[i] > 0) this.wob[i] = Math.max(0, this.wob[i] - dt * 3.5);
      if (this.grow[i] < 1) this.grow[i] = Math.min(1, this.grow[i] + dt * 4);
      const hp = mush[i];
      if (!hp) { this.shown[i] = 0; continue; }
      if (this.shown[i] && hp < this.shown[i]) this.hit(i);
      this.shown[i] = hp;
      const c = i % COLS, r = (i / COLS) | 0, seed = hash(i), v = (seed * 3) | 0;
      const g = this.grow[i], gs = g < 1 ? Math.sin(g * Math.PI * 0.5) * (1 + Math.sin(g * Math.PI) * 0.3) : 1;
      const w = this.wob[i];
      const size = (1.05 + hash(i + 7) * 0.22) * gs;
      const squash = 1 + Math.sin(w * 20) * w * 0.2;
      // the billboard stands slightly behind the tile centre so the cap covers the tile
      this.field.put(n++, c - 14.5 + (seed - 0.5) * 0.12, r - 15.5 + 0.3, size * (v === 2 ? 0.8 : 1) / squash, size * squash,
        Math.sin(w * 25) * w * 0.25, hp / 4, pois[i] ? 1 : 0, this.flash[i], seed, v, this.hues[v] + (hash(i + 3) - 0.5) * 0.3);
    }
    this.field.done(n);
  }
}

// ------------------------------------------------------------------ the shadow worm: twelve sprites like the twelve slots
class Worm {
  constructor(scene) {
    this.headTex = sprTex('worm_head');
    this.bodyTex = sprTex('worm_body');
    this.segs = [];
    for (let i = 0; i < 12; i++) {
      const mat = groundMat(this.bodyTex, { wob: 0.32, legs: 3, edge: 0x7a3cff, lift: 1.5 });
      const m = groundQuad(mat, 1.55);
      m.visible = false;
      m.renderOrder = 2;
      scene.add(m);
      this.segs.push({ m, mat, dir: new THREE.Vector2(1, 0), px: null, py: null, born: -1, head: false });
    }
  }
  sync(game, t, poisonColor) {
    for (let i = 0; i < 12; i++) {
      const s = game.slots[i], o = this.segs[i];
      if (!s.alive) { o.m.visible = false; o.px = null; continue; }
      if (o.px === null || o.born !== s.born) { o.px = s.x; o.py = s.y; o.born = s.born; }
      const ddx = s.x - o.px, ddy = s.y - o.py;
      if (ddx || ddy) {
        const len = Math.hypot(ddx, ddy);
        o.dir.x += (ddx / len - o.dir.x) * 0.4; o.dir.y += (ddy / len - o.dir.y) * 0.4;
        o.dir.normalize();
      }
      o.px = s.x; o.py = s.y;
      // in the score row the worm is still underground: it pushes up into the field
      const up = MYX.clamp(s.y / 8, 0, 1);
      o.m.visible = up > 0.1;
      const head = !s.body;
      if (head !== o.head) { o.head = head; o.mat.uniforms.map.value = head ? this.headTex : this.bodyTex; }
      o.m.position.set(PX(s.x), 0.06 + i * 0.002 + Math.sin(t * 9 + i * 0.8) * 0.015, PZ(s.y));
      o.m.rotation.y = -Math.atan2(o.dir.y, o.dir.x);
      o.m.scale.setScalar((head ? 1.85 : 1.62) * (0.5 + 0.5 * up));
      o.mat.uniforms.uPhase.value = s.leg / 8 * TAU + i * 0.9;
      o.mat.uniforms.uTime.value = t;
      o.mat.uniforms.uTintAmt.value = s.poisoned ? 0.55 + 0.2 * Math.sin(t * 12) : 0;
      o.mat.uniforms.uTint.value.copy(poisonColor);
    }
  }
}

// ------------------------------------------------------------------ the forest spirit (billboard) with its lantern
class Spirit {
  constructor(scene) {
    const g = new THREE.PlaneGeometry(1, 1);
    g.translate(0, 0.5, 0);
    this.mat = new THREE.ShaderMaterial({
      uniforms: Object.assign({ map: { value: sprTex('spirit') }, uC: { value: new THREE.Vector3() }, uS: { value: new THREE.Vector2(1.7, 1.7) }, uLean: { value: 0 }, uFlash: { value: 0 } }, lightUniforms()),
      vertexShader: `uniform vec3 uC; uniform vec2 uS; uniform float uLean; varying vec2 vUv; varying vec3 vWp;
        void main() {
          vUv = uv;
          ${BILL_VERT}
          vec3 p = uC + right * (position.x * uS.x + position.y * uS.y * uLean) + up * position.y * uS.y;
          vWp = p;
          gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: `uniform sampler2D map; uniform float uFlash; varying vec2 vUv; varying vec3 vWp;
        ${LIGHT_GLSL}
        void main() {
          vec4 c = texture2D(map, vUv);
          if (c.a < 0.3) discard;
          vec3 col = shade(c.rgb * 1.35, vWp) + vec3(uFlash);
          gl_FragColor = vec4(col, c.a);
          #include <colorspace_fragment>
        }`,
      transparent: true, alphaToCoverage: true, depthWrite: true
    });
    this.mesh = new THREE.Mesh(g, this.mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 3;
    scene.add(this.mesh);
    this.light = new THREE.PointLight(0xffc36a, 6, 8, 1.6);
    scene.add(this.light);
    this.vx = 0;
    this.lx = null;
    this.pos = new THREE.Vector3();
    this.lantern = new THREE.Vector3();
    this.flicker = 1;
    this.right = new THREE.Vector3();
    this.up = new THREE.Vector3();
  }
  sync(game, t, dt, cam) {
    const p = game.player;
    const X = PX(p.x), Z = PZ(p.y);
    if (this.lx === null) this.lx = X;
    const vx = (X - this.lx) / Math.max(dt, 1e-3);
    this.vx += (vx - this.vx) * 0.25;
    this.lx = X;
    const alive = game.phase === 'play' || game.phase === 'clear';
    this.mesh.visible = alive;
    const hop = Math.abs(Math.sin(t * 7)) * 0.06;
    const S = 2.25, squash = 1 + Math.sin(t * 14) * 0.02;
    this.pos.set(X, hop, Z + 0.15);
    this.mat.uniforms.uC.value.copy(this.pos);
    this.mat.uniforms.uS.value.set(S / squash, S * squash);
    this.mat.uniforms.uLean.value = MYX.clamp(this.vx * 0.012, -0.22, 0.22);
    // the lantern sits up left in the painting
    this.right.setFromMatrixColumn(cam.matrixWorld, 0);
    this.up.setFromMatrixColumn(cam.matrixWorld, 1);
    this.lantern.copy(this.pos).addScaledVector(this.right, -0.3 * S).addScaledVector(this.up, 0.86 * S);
    this.light.position.copy(this.lantern).addScaledVector(this.up, 0.2);
    this.flicker = 0.85 + Math.sin(t * 13) * 0.08 + Math.sin(t * 31) * 0.05;
    this.light.intensity = alive ? (game.shot.flying ? 4 : 6.5) * this.flicker : 0;
  }
}

// ------------------------------------------------------------------ weaver spider, spore beetle, night scorpion
class Creature {
  constructor(scene, name, size, opt) {
    this.mat = groundMat(sprTex(name), opt);
    this.m = groundQuad(this.mat, size);
    this.m.visible = false;
    this.m.renderOrder = 2;
    this.size = size;
    scene.add(this.m);
  }
}

// ------------------------------------------------------------------ bolts, seeds, helper fireflies, shadows
class Bolts {
  constructor(scene) {
    const geo = new THREE.CapsuleGeometry(0.06, 0.62, 4, 8);
    geo.rotateX(Math.PI / 2);
    this.mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3.2, 2.7, 1.6) });
    this.pmat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 3.2, 3.6) });
    this.list = [];
    for (let i = 0; i < 10; i++) {
      const m = new THREE.Mesh(geo, this.mat);
      m.visible = false;
      scene.add(m);
      this.list.push(m);
    }
    this.light = new THREE.PointLight(0xffd890, 0, 5, 1.7);
    scene.add(this.light);
    this.main = new THREE.Vector3(0, -50, 0);
  }
  sync(game) {
    let n = 0;
    this.main.set(0, -50, 0);
    const put = (b, main) => {
      if (n >= this.list.length) return;
      const m = this.list[n++];
      m.visible = true;
      m.position.set(PX(b.x), 0.6, PZ(b.y + 4));
      m.material = b.pierce > 0 ? this.pmat : this.mat;
      m.scale.setScalar(b.small ? 0.6 : 1);
      if (main) { this.light.position.copy(m.position); this.light.position.y = 0.9; this.main.copy(this.light.position); }
    };
    const s = game.shot, on = game.phase === 'play' || game.phase === 'clear';
    if (s.flying && on) put(s, true);
    if (on) for (const e of game.extra) put(e, false);
    this.light.intensity = s.flying && on ? 3.5 : 0;
    for (let i = n; i < this.list.length; i++) this.list[i].visible = false;
  }
}

class Seeds {
  constructor(scene) {
    this.list = [];
    const geo = new THREE.OctahedronGeometry(0.3, 0);
    const ringGeo = new THREE.TorusGeometry(0.45, 0.025, 6, 32);
    for (let i = 0; i < 3; i++) {
      const g = new THREE.Group();
      const mat = new THREE.MeshStandardMaterial({ color: 0x111111, emissive: 0xffffff, emissiveIntensity: 3, roughness: 0.2, metalness: 0.4 });
      const c = new THREE.Mesh(geo, mat);
      c.scale.set(1, 1.5, 1);
      g.add(c);
      const ring = new THREE.Mesh(ringGeo, mat);
      ring.rotation.x = Math.PI / 2;
      g.add(ring);
      g.visible = false;
      scene.add(g);
      this.list.push({ g, c, ring, mat });
    }
  }
  sync(game, t) {
    for (let i = 0; i < this.list.length; i++) {
      const d = game.drops[i], o = this.list[i];
      o.g.visible = !!d;
      if (!d) continue;
      o.mat.emissive.set(KIND_COLORS[d.kind] || 0xffffff);
      const blink = d.t > 60 * 8 ? (Math.sin(t * 20) > 0 ? 1 : 0.2) : 1;
      o.mat.emissiveIntensity = 3 * blink;
      o.g.position.set(PX(d.x), 0.75 + Math.sin(t * 3 + i) * 0.12, PZ(d.y));
      o.c.rotation.y = t * 2.4;
      o.ring.scale.setScalar(1 + Math.sin(t * 5) * 0.12);
    }
  }
}

class Helpers {
  constructor(scene) {
    this.list = [];
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 3.2, 1.2) });
    for (let i = 0; i < 2; i++) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 8), mat);
      m.visible = false;
      scene.add(m);
      this.list.push(m);
    }
  }
  sync(game, t) {
    for (let i = 0; i < 2; i++) {
      const f = game.flies[i], m = this.list[i];
      m.visible = !!f && game.power.flies > 0;
      if (m.visible) m.position.set(PX(f.x), 0.9 + Math.sin(t * 6 + i) * 0.1, PZ(f.y));
    }
  }
}

class Shadows {
  constructor(scene, tex) {
    this.mat = new THREE.MeshBasicMaterial({ color: 0x000000, alphaMap: tex, transparent: true, opacity: 0.6, depthWrite: false });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.InstancedMesh(geo, this.mat, 24);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    scene.add(this.mesh);
    this.m = new THREE.Matrix4();
  }
  sync(list) {
    let n = 0;
    for (const s of list) {
      if (n >= 24) break;
      this.m.makeScale(s[2], 1, s[3] || s[2]);
      this.m.setPosition(s[0], 0.02, s[1]);
      this.mesh.setMatrixAt(n++, this.m);
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}

// ------------------------------------------------------------------ all of them together
export class Actors {
  constructor(fs) {
    this.fs = fs;
    const scene = fs.scene;
    this.mush = new MushField(scene, fs.time);
    this.worm = new Worm(scene);
    this.spirit = new Spirit(scene);
    this.spider = new Creature(scene, 'spider', 2.8, { wob: 0.22, legs: 4, edge: 0xc46bff, lift: 1.4 });
    this.beetle = new Creature(scene, 'beetle', 1.8, { wob: 0.08, legs: 3, flap: 0.22, edge: 0x4a9cff, lift: 1.3 });
    this.scorp = new Creature(scene, 'scorpion', 2.6, { wob: 0.12, legs: 4, edge: 0x7dff3a, lift: 1.4 });
    this.bolts = new Bolts(scene);
    this.seeds = new Seeds(scene);
    this.helpers = new Helpers(scene);
    this.shadows = new Shadows(scene, fs.dot);
    this.setWorld(0);
  }
  setWorld(i) { this.world = i; this.mush.setWorld(WORLDS[i], i); }
  sync(game, alpha, t, dt) {
    const fs = this.fs;
    this.mush.sync(game, dt);
    this.worm.sync(game, t, this.mush.uni.poison.value);
    this.spirit.sync(game, t, dt, fs.camera);
    // spider: zig-zags, leans into its path
    const sp = game.spider, S = this.spider;
    S.m.visible = !!sp;
    if (sp) {
      S.m.position.set(PX(sp.x), 0.08 + Math.abs(Math.sin(t * 14)) * 0.05, PZ(sp.y));
      S.m.rotation.y = Math.sin(t * 2) * 0.12 - (sp.dx || sp.keep) * 0.12;
      S.mat.uniforms.uPhase.value = t * 15;
    }
    // beetle: comes down out of the night sky and flies low over the field
    const f = game.flea, B = this.beetle;
    B.m.visible = !!f && f.y > 0;
    if (B.m.visible) {
      const inY = MYX.clamp(f.y / 24, 0, 1);
      B.m.position.set(PX(f.x), 1.0 + (1 - inY) * 7 + Math.sin(t * 20) * 0.04, PZ(f.y));
      B.m.rotation.y = Math.sin(t * 3) * 0.15;
      B.m.scale.setScalar(B.size * (f.hp < 2 ? 1.08 : 1));
      B.mat.uniforms.uPhase.value = t * 10;
      B.mat.uniforms.uTime.value = t;
      B.mat.uniforms.uTintAmt.value = f.hp < 2 ? 0.45 + 0.2 * Math.sin(t * 25) : 0;
      B.mat.uniforms.uTint.value.set(0xff6a2a);
    }
    // scorpion
    const sc = game.scorp, C = this.scorp;
    C.m.visible = !!sc && sc.x > -16 && sc.x < 256;
    if (C.m.visible) {
      C.m.position.set(PX(sc.x), 0.07, PZ(sc.y));
      C.m.rotation.y = sc.dx > 0 ? 0 : Math.PI;
      C.mat.uniforms.uPhase.value = t * 12;
    }
    this.bolts.sync(game);
    this.seeds.sync(game, t);
    this.helpers.sync(game, t);
    // the lights the sprites feel: lantern, the bolt, three of the flashes, a seed's glow
    const L = SpriteLights;
    L.pos[0].copy(this.spirit.light.position);
    L.col[0].set(1.0, 0.72, 0.35).multiplyScalar(this.spirit.mesh.visible ? 1.6 * this.spirit.flicker : 0);
    L.pos[1].copy(this.bolts.main);
    L.col[1].set(1.0, 0.85, 0.55).multiplyScalar(this.bolts.light.intensity > 0 ? 1.2 : 0);
    for (let k = 0; k < 3; k++) {
      const fl = fs.flashes[k].light;
      L.pos[2 + k].copy(fl.position);
      L.col[2 + k].set(fl.color.r, fl.color.g, fl.color.b).multiplyScalar(fl.intensity * 0.12);
    }
    const d0 = game.drops[0];
    if (d0) { L.pos[5].set(PX(d0.x), 0.8, PZ(d0.y)); const c = new THREE.Color(KIND_COLORS[d0.kind]); L.col[5].set(c.r, c.g, c.b).multiplyScalar(0.8); } else L.col[5].set(0, 0, 0);
    // blob shadows under everything that walks or flies
    const sh = [];
    for (const o of this.worm.segs) if (o.m.visible) sh.push([o.m.position.x, o.m.position.z, 1.0]);
    if (this.spirit.mesh.visible) sh.push([this.spirit.pos.x, this.spirit.pos.z - 0.1, 1.2, 0.8]);
    if (S.m.visible) sh.push([S.m.position.x, S.m.position.z, 1.8, 1.4]);
    if (B.m.visible) sh.push([B.m.position.x, B.m.position.z, 1.1 * MYX.clamp(game.flea.y / 24, 0.2, 1)]);
    if (C.m.visible) sh.push([C.m.position.x, C.m.position.z, 2.0, 1.2]);
    this.shadows.sync(sh);
  }
}
