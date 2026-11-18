// MYCOLUX Modern – the 3D forest floor: renderer, camera (play view and the low menu view), night lighting,
// ground painting, giant mushrooms and roots around the field, fireflies, particles, light flashes, bloom.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const MYX = window.MYX;

// four worlds, four waves each; colours: mushrooms (three hues), worm glow and accent, fog, sky light
export const WORLDS = [
  { id: 'w1', name: 'Mondmoos', en: 'Moonmoss', music: 'm_world1', mush: [0x26e6ff, 0x3f8cff, 0x7dfff0], poison: 0xc7ff3a, glow: 0x2ee8ff, accent: 0xff4fd0, fog: 0x050d1c, sky: 0x3a5a9a, ground: 0x6a7c90, moon: 0xb8d4ff, fly: 0xbfff6a },
  { id: 'w2', name: 'Glutsumpf', en: 'Ember Bog', music: 'm_world2', mush: [0xff8a24, 0xffb547, 0xff5a2a], poison: 0x7dff4f, glow: 0xffb030, accent: 0x2ee8ff, fog: 0x0e0603, sky: 0x5a2c16, ground: 0x6a5242, moon: 0xffc890, fly: 0xffd36a },
  { id: 'w3', name: 'Kristallhain', en: 'Crystal Grove', music: 'm_world3', mush: [0xb06bff, 0x7a8cff, 0xe2b4ff], poison: 0xb6ff3a, glow: 0xffd23f, accent: 0x9fe8ff, fog: 0x0a0620, sky: 0x5a4aa8, ground: 0x7a74a0, moon: 0xd8d0ff, fly: 0xe8d8ff },
  { id: 'w4', name: 'Sporensturm', en: 'Spore Storm', music: 'm_world4', mush: [0xff3fa4, 0x9dff4f, 0xff7ad8], poison: 0xfff23a, glow: 0x3fe0ff, accent: 0xb6ff3a, fog: 0x10051a, sky: 0x7a3a8a, ground: 0x84708e, moon: 0xffc8f0, fly: 0xd0ff6a }
];
export function worldOf(wave) { return Math.floor(wave / 4) % WORLDS.length; }

// game pixels -> world units (one tile = one unit, field centred on the origin, +z towards the player)
export const wx = px => px / 8 - 15;
export const wz = py => py / 8 - 16;

function softDot(size, hard) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d'), r = size / 2;
  const grd = g.createRadialGradient(r, r, 0, r, r, r);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(hard || 0.25, 'rgba(255,255,255,0.55)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ------------------------------------------------------------------ particles: one additive point cloud
export class Particles {
  constructor(max, tex) {
    this.max = max;
    this.n = 0;
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(max * 3);
    this.col = new Float32Array(max * 3);
    this.siz = new Float32Array(max);
    this.alp = new Float32Array(max);
    this.vel = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.age = new Float32Array(max);
    this.base = new Float32Array(max);
    this.grav = new Float32Array(max);
    this.drag = new Float32Array(max);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('color', new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('size', new THREE.BufferAttribute(this.siz, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('alpha', new THREE.BufferAttribute(this.alp, 1).setUsage(THREE.DynamicDrawUsage));
    g.setDrawRange(0, 0);
    this.geo = g;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 color; varying vec3 vC; varying float vA;
        uniform float scale;
        void main(){ vC = color; vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA;
        void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.points = new THREE.Points(g, this.mat);
    this.points.frustumCulled = false;
  }
  // p: position, v: velocity (units/s), c: THREE.Color, size, life (s), grav, drag
  emit(x, y, z, vx, vy, vz, c, size, life, grav = 0, drag = 0) {
    let i = this.n;
    if (i >= this.max) {
      // full: replace the oldest-ish particle
      i = (Math.random() * this.max) | 0;
    } else this.n++;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.col[i * 3] = c.r; this.col[i * 3 + 1] = c.g; this.col[i * 3 + 2] = c.b;
    this.base[i] = size; this.siz[i] = size;
    this.life[i] = life; this.age[i] = 0; this.alp[i] = 1;
    this.grav[i] = grav; this.drag[i] = drag;
  }
  burst(x, y, z, n, c, speed, size, life, opt = {}) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, up = opt.up !== undefined ? opt.up : 0.6;
      const s = speed * (0.35 + Math.random() * 0.65);
      const vy = (Math.random() * up + (opt.lift || 0)) * speed;
      const cc = opt.mix ? c.clone().lerp(opt.mix, Math.random()) : c;
      this.emit(x, y, z, Math.cos(a) * s, vy, Math.sin(a) * s, cc, size * (0.6 + Math.random() * 0.7), life * (0.6 + Math.random() * 0.6), opt.grav || 0, opt.drag || 1.5);
    }
  }
  update(dt) {
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.n; i++) {
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        // remove by swapping with the last one
        const j = --this.n;
        if (i !== j) {
          for (let k = 0; k < 3; k++) { P[i * 3 + k] = P[j * 3 + k]; V[i * 3 + k] = V[j * 3 + k]; this.col[i * 3 + k] = this.col[j * 3 + k]; }
          this.base[i] = this.base[j]; this.life[i] = this.life[j]; this.age[i] = this.age[j];
          this.grav[i] = this.grav[j]; this.drag[i] = this.drag[j];
        }
        i--;
        continue;
      }
      const d = Math.max(0, 1 - this.drag[i] * dt);
      V[i * 3] *= d; V[i * 3 + 1] = V[i * 3 + 1] * d - this.grav[i] * dt; V[i * 3 + 2] *= d;
      P[i * 3] += V[i * 3] * dt; P[i * 3 + 1] += V[i * 3 + 1] * dt; P[i * 3 + 2] += V[i * 3 + 2] * dt;
      if (P[i * 3 + 1] < 0.02) { P[i * 3 + 1] = 0.02; V[i * 3 + 1] *= -0.3; }
      const k = this.age[i] / this.life[i];
      this.alp[i] = k < 0.1 ? k * 10 : 1 - (k - 0.1) / 0.9;
      this.siz[i] = this.base[i] * (1 - k * 0.5);
    }
    this.geo.setDrawRange(0, this.n);
    for (const n of ['position', 'color', 'size', 'alpha']) this.geo.attributes[n].needsUpdate = true;
  }
  clear() { this.n = 0; this.geo.setDrawRange(0, 0); }
}

// ------------------------------------------------------------------ the scene
export class ForestScene {
  constructor(canvas) {
    this.canvas = canvas;
    const r = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.05;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0x050d1c, 0.014);
    this.scene.background = new THREE.Color(0x02040a);
    this.camera = new THREE.PerspectiveCamera(34, 1, 0.3, 400);
    this.time = { value: 0 };
    this.world = -1;
    this.quality = 'high';
    this.pixelRatio = Math.min(2, window.devicePixelRatio || 1);
    this.hudTop = 0.08;
    this.hudBottom = 0.03;
    this.shake = 0;
    this.camMode = 'menu';
    this.camBlend = 0;
    this.textures = {};
    this.loader = new THREE.TextureLoader();

    // light: dim blue night sky, a cool moon from behind, the lantern and a few flashes
    this.hemi = new THREE.HemisphereLight(0x3a5a9a, 0x050608, 0.65);
    this.scene.add(this.hemi);
    this.moon = new THREE.DirectionalLight(0xb8d4ff, 0.9);
    this.moon.position.set(-14, 30, -26);
    this.scene.add(this.moon);
    this.fill = new THREE.DirectionalLight(0x6a4aff, 0.25);
    this.fill.position.set(18, 10, 20);
    this.scene.add(this.fill);
    this.flashes = [];
    for (let i = 0; i < 4; i++) {
      const L = new THREE.PointLight(0xffffff, 0, 7, 1.6);
      L.position.set(0, 1.2, 0);
      this.scene.add(L);
      this.flashes.push({ light: L, t: 0, dur: 1, peak: 0 });
    }

    this.buildGround();
    this.buildDressing();
    this.dot = softDot(64, 0.22);
    this.fx = new Particles(3000, this.dot);
    this.scene.add(this.fx.points);
    this.buildFireflies();

    // post: bloom makes every emissive light glow
    this.composer = new EffectComposer(r);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.9, 0.55, 0.62);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());
    this.setWorld(0, true);
  }

  tex(name, srgb = true) {
    if (this.textures[name]) return this.textures[name];
    const t = this.loader.load('assets/img/' + name + '.jpg');
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    this.textures[name] = t;
    return t;
  }

  // ---------------------------------------------------------------- ground and field
  buildGround() {
    const g = new THREE.PlaneGeometry(140, 120, 1, 1);
    this.groundMat = new THREE.MeshStandardMaterial({ color: 0x6a7c90, roughness: 0.96, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.06 });
    this.groundMat.onBeforeCompile = sh => {
      sh.uniforms.uTime = this.time;
      sh.vertexShader = 'varying vec3 vWorldPos;\n' + sh.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\n vWorldPos = (modelMatrix * vec4(transformed,1.0)).xyz;');
      // darker and less colourful outside the playfield, a soft rim of moss light around it
      sh.fragmentShader = 'varying vec3 vWorldPos;\n' + sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
        vec2 q = abs(vWorldPos.xz) - vec2(15.4, 16.4);
        float outside = smoothstep(0.0, 6.0, max(q.x, q.y));
        float lum = dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114));
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), 0.35 + outside * 0.4) * (1.0 - outside * 0.55);`);
    };
    this.ground = new THREE.Mesh(g, this.groundMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.position.set(0, 0, -8);
    this.scene.add(this.ground);

    // a faint glowing moss carpet that marks the playfield
    const c = document.createElement('canvas');
    c.width = 256; c.height = 256;
    const gg = c.getContext('2d');
    const grd = gg.createRadialGradient(128, 128, 30, 128, 128, 160);
    grd.addColorStop(0, 'rgba(255,255,255,0.55)');
    grd.addColorStop(0.7, 'rgba(255,255,255,0.18)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    gg.fillStyle = grd;
    gg.fillRect(0, 0, 256, 256);
    const carpetTex = new THREE.CanvasTexture(c);
    this.carpet = new THREE.Mesh(new THREE.PlaneGeometry(36, 38), new THREE.MeshBasicMaterial({ map: carpetTex, color: 0x0c2a3a, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.carpet.rotation.x = -Math.PI / 2;
    this.carpet.position.y = 0.01;
    this.scene.add(this.carpet);

    // the distant forest painting, seen in the low menu view
    this.backdropMat = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false, depthWrite: false });
    this.backdrop = new THREE.Mesh(new THREE.PlaneGeometry(260, 111), this.backdropMat);
    this.backdrop.position.set(0, 36, -120);
    this.scene.add(this.backdrop);
  }

  // roots and stones outside the field (the big mushrooms around it are sprites, see actors.js)
  buildDressing() {
    this.dress = new THREE.Group();
    this.scene.add(this.dress);
    const rng = new MYX.Rng(777);
    // roots along the field edges: dark tubes wandering in the ground
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 0.9 });
    for (let s = -1; s <= 1; s += 2) {
      for (let k = 0; k < 3; k++) {
        const pts = [];
        let x = s * (15.6 + k * 0.6), z = -18;
        for (let j = 0; j < 12; j++) {
          pts.push(new THREE.Vector3(x + (rng.next() - 0.5) * 0.8, (j % 3 === 0 ? -0.05 : 0.12) + rng.next() * 0.1, z));
          z += 3.3;
        }
        const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 60, 0.12 + k * 0.05, 6, false), rootMat);
        this.dress.add(tube);
      }
    }
    // stones
    const stoneGeo = new THREE.IcosahedronGeometry(0.5, 1);
    const stoneMat = new THREE.MeshStandardMaterial({ color: 0x2a3038, roughness: 0.85, flatShading: true });
    for (let i = 0; i < 30; i++) {
      const m = new THREE.Mesh(stoneGeo, stoneMat);
      const side = i % 2 ? 1 : -1;
      m.position.set(side * (16.2 + rng.next() * 12), 0.05, -20 + rng.next() * 40);
      m.scale.set(0.4 + rng.next() * 1.4, 0.3 + rng.next() * 0.6, 0.4 + rng.next() * 1.4);
      m.rotation.set(rng.next() * 3, rng.next() * 3, rng.next() * 3);
      this.dress.add(m);
    }
  }

  // ---------------------------------------------------------------- fireflies (always there, drifting)
  buildFireflies() {
    const n = 140;
    this.flyN = n;
    const g = new THREE.BufferGeometry();
    this.flyPos = new Float32Array(n * 3);
    this.flySeed = new Float32Array(n * 4);
    const rng = new MYX.Rng(42);
    for (let i = 0; i < n; i++) {
      this.flySeed[i * 4] = (rng.next() - 0.5) * 70;
      this.flySeed[i * 4 + 1] = 0.6 + rng.next() * 6;
      this.flySeed[i * 4 + 2] = -40 + rng.next() * 60;
      this.flySeed[i * 4 + 3] = rng.next() * 100;
    }
    g.setAttribute('position', new THREE.BufferAttribute(this.flyPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.flyMat = new THREE.ShaderMaterial({
      uniforms: { map: { value: softDot(64, 0.15) }, color: { value: new THREE.Color(0xbfff6a) }, t: this.time, scale: { value: 400 }, play: { value: 0 } },
      vertexShader: `uniform float t; uniform float scale; uniform float play; varying float vA;
        void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0);
          float ph = fract(sin(dot(position.xz, vec2(12.9,78.2))) * 437.5) * 6.28;
          vA = 0.25 + 0.75 * pow(0.5 + 0.5 * sin(t * 2.3 + ph), 3.0);
          float inField = step(abs(position.x), 16.0) * step(abs(position.z), 17.0);
          vA *= 1.0 - inField * play * 0.9;
          gl_PointSize = 0.42 * scale / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; uniform vec3 color; varying float vA;
        void main(){ vec4 tx = texture2D(map, gl_PointCoord); gl_FragColor = vec4(color * 2.2 * tx.rgb, tx.a * vA); }`,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    this.flies = new THREE.Points(g, this.flyMat);
    this.flies.frustumCulled = false;
    this.scene.add(this.flies);
  }
  updateFireflies(t) {
    const P = this.flyPos, S = this.flySeed;
    for (let i = 0; i < this.flyN; i++) {
      const s = S[i * 4 + 3];
      P[i * 3] = S[i * 4] + Math.sin(t * 0.21 + s) * 2.5 + Math.sin(t * 0.53 + s * 2) * 0.8;
      P[i * 3 + 1] = S[i * 4 + 1] + Math.sin(t * 0.37 + s * 3) * 0.6;
      P[i * 3 + 2] = S[i * 4 + 2] + Math.cos(t * 0.17 + s) * 2.5;
    }
    this.flies.geometry.attributes.position.needsUpdate = true;
  }

  // ---------------------------------------------------------------- worlds
  setWorld(i, instant) {
    if (i === this.world) return;
    this.world = i;
    const W = WORLDS[i];
    this.W = W;
    this.groundMat.map = this.tex('ground_' + W.id);
    this.groundMat.map.wrapS = this.groundMat.map.wrapT = THREE.MirroredRepeatWrapping;
    this.groundMat.map.repeat.set(3.2, 2.75);
    this.groundMat.emissiveMap = this.groundMat.map;
    this.groundMat.needsUpdate = true;
    this.backdropMat.map = this.tex('backdrop_' + W.id);
    this.backdropMat.needsUpdate = true;
    this.target = {
      fog: new THREE.Color(W.fog), sky: new THREE.Color(W.sky), ground: new THREE.Color(W.ground),
      moon: new THREE.Color(W.moon), glow: new THREE.Color(W.mush[0]), carpet: new THREE.Color(W.glow).multiplyScalar(0.12),
      fly: new THREE.Color(W.fly)
    };
    if (instant) this.blendWorld(1);
  }
  blendWorld(k) {
    const T = this.target;
    if (!T) return;
    this.scene.fog.color.lerp(T.fog, k);
    this.scene.background.copy(this.scene.fog.color).multiplyScalar(0.5);
    this.hemi.color.lerp(T.sky, k);
    this.groundMat.color.lerp(T.ground, k);
    this.moon.color.lerp(T.moon, k);
    this.carpet.material.color.lerp(T.carpet, k);
    this.flyMat.uniforms.color.value.lerp(T.fly, k);
  }

  // ---------------------------------------------------------------- flashes of light (explosions, pick-ups)
  flash(x, z, color, peak = 6, dur = 0.35, y = 1.0) {
    let f = this.flashes[0];
    for (const c of this.flashes) if (c.t >= c.dur) { f = c; break; } else if (c.t / c.dur > f.t / f.dur) f = c;
    f.light.position.set(x, y, z);
    f.light.color.set(color);
    f.t = 0; f.dur = dur; f.peak = peak;
  }

  // ---------------------------------------------------------------- camera
  // the play view frames the whole field (with room for the HUD), the menu view looks low across the forest
  fitPlay() {
    const cam = this.camera, aspect = this.w / this.h;
    const pitch = THREE.MathUtils.degToRad(aspect < 0.8 ? 64 : 57);
    const dir = new THREE.Vector3(0, Math.sin(pitch), Math.cos(pitch));
    const corners = [[-15.3, 0, -16.4], [15.3, 0, -16.4], [-15.3, 0, 16.3], [15.3, 0, 16.3], [-15.3, 1.2, 16.3], [15.3, 1.2, 16.3]].map(c => new THREE.Vector3(...c));
    const top = 1 - this.hudTop * 2, bottom = -1 + this.hudBottom * 2;
    let zc = 0.8, dist = 40;
    for (let it = 0; it < 4; it++) {
      let lo = 10, hi = 200;
      for (let k = 0; k < 28; k++) {
        const d = (lo + hi) / 2;
        cam.position.set(0, 0, zc).addScaledVector(dir, d);
        cam.lookAt(0, 0, zc);
        cam.updateMatrixWorld();
        cam.aspect = aspect; cam.updateProjectionMatrix();
        let ok = true, ymin = 9, ymax = -9;
        for (const c of corners) {
          const p = c.clone().project(cam);
          if (Math.abs(p.x) > 0.97) ok = false;
          ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y);
        }
        if (ymax - ymin > top - bottom) ok = false;
        if (ok) hi = d; else lo = d;
        dist = hi;
      }
      // centre the field between HUD top and bottom
      cam.position.set(0, 0, zc).addScaledVector(dir, dist);
      cam.lookAt(0, 0, zc);
      cam.updateMatrixWorld();
      let ymin = 9, ymax = -9;
      for (const c of corners) { const p = c.clone().project(cam); ymin = Math.min(ymin, p.y); ymax = Math.max(ymax, p.y); }
      const off = ((ymin + ymax) / 2) - ((top + bottom) / 2);
      zc -= off * 9;
    }
    this.playPos = cam.position.clone();
    this.playLook = new THREE.Vector3(0, 0, zc);
  }
  fitMenu() {
    const portrait = this.w < this.h;
    this.menuPos = new THREE.Vector3(0, portrait ? 9 : 6.5, portrait ? 34 : 26);
    this.menuLook = new THREE.Vector3(0, portrait ? 4 : 6.5, -20);
  }
  setCamMode(m, instant) {
    this.camMode = m;
    if (instant) this.camBlend = m === 'play' ? 1 : 0;
  }
  updateCamera(dt, t) {
    const goal = this.camMode === 'play' ? 1 : 0;
    const sp = this.camSpeed || 2.2;
    this.camBlend += MYX.clamp(goal - this.camBlend, -dt * sp, dt * sp);
    const k = MYX.smooth(this.camBlend);
    const cam = this.camera;
    cam.position.lerpVectors(this.menuPos, this.playPos, k);
    const look = new THREE.Vector3().lerpVectors(this.menuLook, this.playLook, k);
    // a slow drift in the menu, a hint of breathing in play
    cam.position.x += Math.sin(t * 0.13) * 2.2 * (1 - k) + Math.sin(t * 0.4) * 0.05 * k;
    if (this.shake > 0 && MYX.Settings.get('shake')) {
      const s = this.shake * this.shake * 0.6;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      look.x += (Math.random() - 0.5) * s * 0.5;
    }
    this.shake = Math.max(0, this.shake - dt * 2.5);
    cam.lookAt(look);
  }

  // ---------------------------------------------------------------- quality and size
  setQuality(q) {
    this.qualitySetting = q;
    this.quality = q === 'auto' ? (this.quality || 'high') : q;
    this.applySize();
  }
  resize(w, h) { this.w = w; this.h = h; this.applySize(); this.fitPlay(); this.fitMenu(); }
  applySize() {
    if (!this.w) return;
    const pr = this.quality === 'low' ? Math.min(1, this.pixelRatio) : this.pixelRatio;
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(this.w, this.h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(this.w, this.h);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
    const sc = this.h * pr / (2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
    this.fx.mat.uniforms.scale.value = sc;
    this.flyMat.uniforms.scale.value = sc;
    this.bloom.resolution.set(this.w * pr / 2, this.h * pr / 2);
  }
  autoQuality(fps) {
    if (this.qualitySetting !== 'auto') return;
    if (fps < 46 && this.quality === 'high') { this.quality = 'low'; this.applySize(); }
  }

  render(dt) {
    this.time.value += dt;
    const t = this.time.value;
    if (this.target) this.blendWorld(Math.min(1, dt * 1.5));
    this.updateFireflies(t);
    this.fx.update(dt);
    for (const f of this.flashes) {
      f.t += dt;
      const k = Math.max(0, 1 - f.t / f.dur);
      f.light.intensity = f.peak * k * k;
    }
    this.updateCamera(dt, t);
    this.flyMat.uniforms.play.value = this.camBlend;
    const b = MYX.Settings.get('bloom');
    this.bloom.strength = 1.5 * (b === undefined ? 0.5 : b);
    this.bloom.enabled = this.bloom.strength > 0.01;
    this.composer.render(dt);
  }
}
