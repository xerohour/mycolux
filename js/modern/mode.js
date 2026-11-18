// MYCOLUX MODERN: the same game core, remixed in 3D. Menus are HTML over a live demo in the forest, the game runs in
// the three.js scene with power seeds, combo, light bombs, four worlds with their own music, pictures and colours.
import * as THREE from 'three';
import { ForestScene, WORLDS, worldOf } from './scene.js';
import { Actors, PX, PZ, KIND_COLORS } from './actors.js';

const MYX = window.MYX, In = MYX.Input, Au = MYX.Audio, CFG = MYX.CFG, t = k => MYX.t(k);
const SFX = ['shot', 'mush', 'mushKill', 'pop', 'head', 'beetleHit', 'beetle', 'spider', 'scorp', 'die', 'restore', 'extra', 'poison', 'coin', 'click', 'move', 'power', 'combo', 'bomb', 'drop', 'newHead', 'grow', 'dive', 'clear', 'loop_spider', 'loop_beetle', 'loop_scorp'];
const LOOPS = ['spider', 'beetle', 'scorp'];
const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

MYX.I18n.add('de', {
  mmPlay: 'SPIELEN', mmScores: 'BESTENLISTE', mmHow: 'SO GEHT’S', mmOptions: 'OPTIONEN', mmBack: 'ZUR AUSWAHL',
  mmPause: 'PAUSE', mmResume: 'WEITER', mmQuitGame: 'SPIEL BEENDEN', mmMenu: 'HAUPTMENÜ',
  hudWave: 'WELLE', hudBest: 'BEST', hudBombs: 'LICHTBOMBE',
  bannerWave: 'WELLE', bannerWorld: 'WELT', extraLife: 'EXTRALEBEN!', cleared: 'WELLE GESCHAFFT',
  pw_triple: 'FÄCHERSCHUSS', pw_pierce: 'LICHTLANZE', pw_flies: 'GLÜHWÜRMCHEN', pw_slow: 'MONDLICHT', pw_bomb: 'LICHTBOMBE +1',
  combo: 'KOMBO', overTitle: 'GAME OVER', overScore: 'PUNKTE', overWave: 'WELLE', newRecordM: 'NEUER EINTRAG IN DER BESTENLISTE',
  nameHint: 'Buchstaben tippen oder auswählen, Enter bestätigt', ok: 'OK', del: '⌫',
  optGraphics: 'GRAFIK', optAuto: 'AUTO', optHigh: 'HOCH', optLow: 'NIEDRIG', optBloom: 'LEUCHTEN', optShake: 'BEBEN', optMenuMusic: 'MENÜMUSIK',
  optInst: 'INSTRUMENTAL', optSong: 'SONG', optVoice: 'ANSAGER',
  howM1: 'Der Schattenwurm kriecht von oben durchs Pilzfeld. Jeder Treffer macht aus einem Glied einen Pilz, und der Wurm teilt sich.',
  howM2: 'Weberspinne (frisst Pilze, mehr Punkte je näher), Sporenkäfer (sät Pilze, braucht zwei Treffer) und Nachtskorpion (vergiftet Pilze: der Wurm stürzt dann senkrecht herab).',
  howM3: 'Leuchtsamen: getroffene Köpfe und Kreaturen lassen manchmal einen Samen fallen. Einsammeln bringt Fächerschuss, Lichtlanze (durchschlagend), Glühwürmchen (Helfer), Mondlicht (Zeitlupe) oder eine Lichtbombe.',
  howM4: 'Lichtbombe: B, Shift, rechte Maustaste oder Gamepad B räumt die untere Hälfte frei. Schnelle Treffer hintereinander erhöhen die Kombo bis ×8.',
  howM5: 'Alle vier Wellen wechselt die Welt: Mondmoos, Glutsumpf, Kristallhain, Sporensturm.',
  touchBomb: 'BOMBE', loadingWorld: 'Der Wald erwacht …'
});
MYX.I18n.add('en', {
  mmPlay: 'PLAY', mmScores: 'HIGH SCORES', mmHow: 'HOW TO PLAY', mmOptions: 'OPTIONS', mmBack: 'BACK TO START',
  mmPause: 'PAUSED', mmResume: 'RESUME', mmQuitGame: 'QUIT GAME', mmMenu: 'MAIN MENU',
  hudWave: 'WAVE', hudBest: 'BEST', hudBombs: 'LIGHT BOMB',
  bannerWave: 'WAVE', bannerWorld: 'WORLD', extraLife: 'EXTRA LIFE!', cleared: 'WAVE CLEARED',
  pw_triple: 'FAN SHOT', pw_pierce: 'LIGHT LANCE', pw_flies: 'FIREFLIES', pw_slow: 'MOONLIGHT', pw_bomb: 'LIGHT BOMB +1',
  combo: 'COMBO', overTitle: 'GAME OVER', overScore: 'SCORE', overWave: 'WAVE', newRecordM: 'NEW HIGH SCORE ENTRY',
  nameHint: 'Type or pick your letters, Enter confirms', ok: 'OK', del: '⌫',
  optGraphics: 'GRAPHICS', optAuto: 'AUTO', optHigh: 'HIGH', optLow: 'LOW', optBloom: 'GLOW', optShake: 'SHAKE', optMenuMusic: 'MENU MUSIC',
  optInst: 'INSTRUMENTAL', optSong: 'SONG', optVoice: 'ANNOUNCER',
  howM1: 'The shadow worm crawls down through the mushroom field. Every hit turns a segment into a mushroom and splits the worm.',
  howM2: 'Weaver spider (eats mushrooms, more points the closer it is), spore beetle (sows mushrooms, takes two hits) and night scorpion (poisons mushrooms: the worm then plunges straight down).',
  howM3: 'Light seeds: shot heads and creatures sometimes drop a seed. Collect it for fan shot, light lance (piercing), fireflies (helpers), moonlight (slow motion) or a light bomb.',
  howM4: 'Light bomb: B, Shift, right mouse button or gamepad B clears the lower half. Quick hits in a row raise the combo up to ×8.',
  howM5: 'Every four waves the world changes: Moonmoss, Ember Bog, Crystal Grove, Spore Storm.',
  touchBomb: 'BOMB', loadingWorld: 'The forest awakens …'
});

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}
const C3 = h => new THREE.Color(h);

export class ModernMode {
  constructor() {
    this.canvas = document.getElementById('gl');
    this.hud = document.getElementById('hud');
    this.fs = new ForestScene(this.canvas);
    this.actors = new Actors(this.fs);
    this.root = el('div', 'mm');
    this.popLayer = el('div', 'mm-pops');
    this.loaded = {};
    this.state = 'menu';
    this.fps = { n: 0, t: 0 };
    this.world = 0;
    this.keyN = { x: 0, y: 0 };
    this.ray = new THREE.Raycaster();
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    this.buildHud();
  }

  // ------------------------------------------------------------------ lifecycle
  enter() {
    this.canvas.classList.remove('hidden');
    this.hud.classList.remove('hidden');
    MYX.App.ui.appendChild(this.root);
    MYX.App.ui.appendChild(this.popLayer);
    Au.useSet('modern');
    MYX.Settings.set('lastMode', 'modern');
    Au.load(SFX.map(n => ['modern:' + n, 'assets/sfx/modern/' + n]));
    this.fs.setQuality(MYX.Settings.get('quality'));
    this.resize();
    this.overlay = null;
    this.paused = false;
    if (MYX.autoplayStart) { MYX.autoplayStart = false; this.startGame(); }
    else this.showMenu();
    this.last = performance.now();
  }
  exit() {
    this.canvas.classList.add('hidden');
    this.hud.classList.add('hidden');
    for (const n of [this.root, this.popLayer]) if (n.parentNode) n.parentNode.removeChild(n);
    In.wantLock = false;
    In.releaseLock();
    In.onChar = null;
    Au.stopMusic(0.4);
    Au.stopLoops();
    this.game = null;
  }
  suspend() { if (this.state === 'game' && !this.overlay) this.openPause(); Au.stopLoops(); }
  texts() { this.renderUi(); this.hudCache = {}; }
  resize() {
    const w = window.innerWidth, h = window.innerHeight, portrait = h > w * 1.05;
    this.root.classList.toggle('portrait', portrait);
    this.fs.hudTop = portrait ? 0.075 : 0.07;
    this.fs.hudBottom = MYX.isTouchDevice && portrait ? 0.06 : 0.02;
    this.fs.resize(w, h);
  }

  music(name, opt) {
    const go = () => { if (this.wantMusic === name) Au.playMusic(name, Object.assign({ loop: true, fadeIn: 1.2 }, opt || {})); };
    this.wantMusic = name;
    if (this.loaded[name]) { this.loaded[name].then(go); return; }
    this.loaded[name] = Au.load([[name, 'assets/music/' + name]]);
    this.loaded[name].then(go);
    if (!Au.ready) Au.onUnlock = () => { Au.flushLoads().then(() => { if (this.wantMusic) Au.playMusic(this.wantMusic, { loop: true, fadeIn: 1 }); }); };
  }
  preload(name) { if (!this.loaded[name]) this.loaded[name] = Au.load([[name, 'assets/music/' + name]]); }
  menuMusic() { this.music(MYX.Settings.get('menuSong') ? 'm_song' : 'm_menu'); }

  // ------------------------------------------------------------------ flow
  newDemo() {
    this.demo = new MYX.Game({ modern: true, demo: true, seed: (Math.random() * 1e9) | 0 });
    this.demo.demoSafe = true;
    this.pilot = new MYX.Autopilot(this.demo, 0.8);
  }
  showMenu() {
    this.state = 'menu';
    this.game = null;
    this.newDemo();
    this.setWorld(0, true);
    this.fs.setCamMode('menu', this.fs.camBlend === 0);
    this.menuMusic();
    this.sel = 0;
    this.overlay = null;
    In.wantLock = false;
    In.releaseLock();
    In.onChar = null;
    Au.stopLoops();
    this.renderUi();
  }
  startGame() {
    Au.unlock();
    this.game = new MYX.Game({ modern: true, seed: MYX.seed, hiscore: MYX.Scores.best('modern') });
    if (MYX.startWave) { for (let i = 0; i < MYX.startWave; i++) { this.game.spd++; this.game.nextWave(); } MYX.startWave = 0; }
    this.demo = null;
    this.state = 'game';
    this.overlay = null;
    this.paused = false;
    this.keyN = { x: 0, y: 0 };
    this.fs.fx.clear();
    this.setWorld(worldOf(this.game.wave), false);
    this.fs.setCamMode('play');
    this.music(WORLDS[this.world].music);
    for (const w of WORLDS) this.preload(w.music);
    In.wantLock = true;
    In.takeRel();
    In.flush();
    Au.play('coin');
    this.renderUi();
    this.banner(t('bannerWorld') + ' 1', MYX.I18n.lang === 'de' ? WORLDS[this.world].name : WORLDS[this.world].en);
  }
  setWorld(i, instant) {
    this.world = i;
    this.fs.setWorld(i, instant);
    this.actors.setWorld(i);
  }
  endGame() {
    const g = this.game;
    Au.stopLoops();
    In.wantLock = false;
    In.releaseLock();
    this.music('m_over', { loop: false, fadeIn: 0.3 });
    this.overStats = { score: g.score, wave: g.wave + 1 };
    if (MYX.Scores.qualifies('modern', g.score)) {
      this.name = { letters: [0, 0, 0], pos: 0 };
      this.state = 'name';
      In.onChar = ch => this.nameChar(ch);
      setTimeout(() => { if (this.state === 'name') this.music('m_hiscore'); }, 2500);
    } else this.state = 'over';
    this.renderUi();
  }
  openPause() {
    this.overlay = 'pause';
    this.sel = 0;
    In.wantLock = false;
    In.releaseLock();
    Au.stopLoops();
    this.renderUi();
  }
  closeOverlay() {
    this.overlay = null;
    this.sel = 0;
    if (this.state === 'game') { In.wantLock = true; In.takeRel(); }
    this.renderUi();
  }

  // ------------------------------------------------------------------ input
  groundPx(cx, cy) {
    const r = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2((cx - r.left) / r.width * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    this.ray.setFromCamera(ndc, this.fs.camera);
    const p = new THREE.Vector3();
    if (!this.ray.ray.intersectPlane(this.plane, p)) return null;
    return { x: (p.x + 15) * 8 - 0.5, y: (p.z + 16) * 8 - 4 };
  }
  // screen pixels per game pixel near the spirit (for touch drags)
  screenScale() {
    const cam = this.fs.camera, a = new THREE.Vector3(-15, 0, 12).project(cam), b = new THREE.Vector3(15, 0, 12).project(cam);
    return Math.max(0.5, Math.abs(b.x - a.x) / 2 * window.innerWidth / 240);
  }
  keyAxis(dir, axis) {
    let n = this.keyN[axis];
    if (!dir) { this.keyN[axis] = 0; return 0; }
    if (Math.sign(n) !== dir) n = 0;
    n = MYX.clamp(Math.abs(n) + 1, 1, 6) * dir;
    this.keyN[axis] = n;
    return n * 0.5;
  }
  readMove() {
    const p = this.game.player;
    let mx = this.keyAxis((In.down('right') ? 1 : 0) - (In.down('left') ? 1 : 0), 'x');
    let my = this.keyAxis((In.down('down') ? 1 : 0) - (In.down('up') ? 1 : 0), 'y');
    if (In.stick.x || In.stick.y) { mx += In.stick.x * CFG.keySpeed; my += In.stick.y * CFG.keySpeed; }
    const rel = In.takeRel(), c = this.carry || (this.carry = { x: 0, y: 0 });
    if (rel.x || rel.y) {
      const k = (In.locked ? 0.5 : 1.25) * (MYX.Settings.get('sens') || 1) / this.screenScale();
      c.x += rel.x * k; c.y += rel.y * k;
    }
    // a quick swipe is faster than the spirit: the rest follows in the next frames
    const ax = MYX.clamp(c.x, -CFG.gunMax, CFG.gunMax), ay = MYX.clamp(c.y, -CFG.gunMax, CFG.gunMax);
    mx += ax; my += ay;
    c.x = (c.x - ax) * 0.9; c.y = (c.y - ay) * 0.9;
    const ptr = In.pointer;
    if (!In.locked && !ptr.touch && ptr.moved && MYX.Settings.get('mouse') === 'follow') {
      const q = this.groundPx(ptr.x, ptr.y);
      if (q) {
        const dx = q.x - p.x, dy = q.y - p.y;
        if (Math.abs(dx) >= 0.5) mx += dx;
        if (Math.abs(dy) >= 0.5) my += dy;
      }
    }
    return { mx, my };
  }

  // ------------------------------------------------------------------ tick (60 Hz)
  tick() {
    if (this.state === 'game') {
      if (this.overlay) { this.tickOverlay(); return; }
      if (In.take('back')) { this.openPause(); return; }
      const g = this.game, mv = this.readMove();
      g.step({ mx: mv.mx, my: mv.my, fire: In.fireHeld(), bomb: In.take('bomb') });
      this.events(g);
      this.loops(g);
      if (g.phase === 'over' && g.phaseT > 100) this.endGame();
      return;
    }
    // menu, scores, how-to, options, game over: the demo plays in the background
    if (this.demo) {
      this.demo.step(this.pilot.input());
      this.events(this.demo, true);
      if (this.demo.phase === 'over' || this.demo.wave > 3) this.newDemo();
    }
    this.tickMenu();
  }
  tickMenu() {
    const items = this.items();
    if (this.state === 'name') return this.tickName();
    if (!items.length) {
      if (In.take('start') || In.take('back') || In.take('fire')) { Au.play('click'); this.backFromPage(); }
      return;
    }
    if (In.take('up') || In.take('upRep') || In.take('left')) { this.sel = (this.sel + items.length - 1) % items.length; Au.play('move'); this.markSel(); }
    if (In.take('down') || In.take('downRep') || In.take('right')) { this.sel = (this.sel + 1) % items.length; Au.play('move'); this.markSel(); }
    if (In.take('start') || In.take('fire')) this.activate(items[this.sel]);
    if (In.take('back')) { Au.play('click'); this.backFromPage(); }
  }
  tickOverlay() {
    const items = this.items();
    if (In.take('up') || In.take('upRep')) { this.sel = (this.sel + items.length - 1) % items.length; Au.play('move'); this.markSel(); }
    if (In.take('down') || In.take('downRep')) { this.sel = (this.sel + 1) % items.length; Au.play('move'); this.markSel(); }
    const it = items[this.sel];
    if (In.take('left') && it && it.cycle) this.activate(it, -1);
    if (In.take('right') && it && it.cycle) this.activate(it, 1);
    if (In.take('start') || In.take('fire')) this.activate(it);
    if (In.take('back')) { Au.play('click'); if (this.overlay === 'options' && this.state === 'game') { this.overlay = 'pause'; this.sel = 0; this.renderUi(); } else this.closeOverlay(); }
  }
  backFromPage() {
    if (this.state === 'over') { this.showMenu(); return; }
    if (this.state === 'menu') return;
    this.state = 'menu';
    this.sel = 0;
    this.renderUi();
  }
  onAction(a) {
    if (a === 'menu') {
      if (this.state === 'game') { if (this.overlay) this.closeOverlay(); else this.openPause(); return true; }
      if (this.state === 'menu') { MYX.App.go('select'); return true; }
      this.backFromPage();
      return true;
    }
    if (a === 'pause' && this.state === 'game') { if (this.overlay) this.closeOverlay(); else this.openPause(); return true; }
    if (a === 'crt') return true;
    return false;
  }

  // ------------------------------------------------------------------ sound and spectacle from the game's events
  events(g, demo) {
    const ev = g.ev, fx = this.fs.fx, W = WORLDS[this.world];
    g.ev = [];
    for (const e of ev) {
      const X = PX(e.x), Z = PZ(e.y), pan = (e.x - 120) / 240;
      const tile = (e.x >> 3) + (e.y >> 3) * 30, TX = (e.x >> 3) - 14.5, TZ = (e.y >> 3) - 15.5;
      switch (e.t) {
        case 'shot':
          if (!demo) Au.play('shot', { vol: 0.5 });
          fx.burst(X, 1.6, Z - 0.3, 2, C3(0xffd890), 1.2, 0.22, 0.18, { up: 0.3 });
          break;
        case 'mush':
          fx.burst(TX, 0.45, TZ, 7, C3(W.mush[0]), 2.6, 0.22, 0.45, { up: 1, grav: 3, mix: C3(0xffffff) });
          if (!demo) Au.play('mush', { vol: 0.5 });
          break;
        case 'mushKill':
          fx.burst(TX, 0.4, TZ, 22, C3(W.mush[1]), 3.4, 0.32, 0.8, { up: 1.2, grav: 2.5, mix: C3(W.mush[2]) });
          this.fs.flash(TX, TZ, W.mush[0], 3, 0.25);
          if (!demo) Au.play('mushKill', { vol: 0.6 });
          break;
        case 'grow':
          this.actors.mush.sprout(tile);
          fx.burst(TX, 0.3, TZ, 8, C3(W.mush[2]), 1.6, 0.22, 0.6, { up: 1.4 });
          break;
        case 'eat':
          fx.burst(TX, 0.3, TZ, 10, C3(0xc46bff), 2.2, 0.22, 0.5, { up: 0.8, grav: 3 });
          break;
        case 'pop': case 'head': {
          const big = e.t === 'head';
          fx.burst(X, 0.45, Z, big ? 44 : 26, C3(W.glow), big ? 5.5 : 4.2, big ? 0.42 : 0.32, 0.75, { up: 0.9, grav: 1.5, mix: C3(W.accent) });
          fx.burst(X, 0.45, Z, 8, C3(0xffffff), 2, 0.5, 0.25, { up: 0.5 });
          this.fs.flash(X, Z, W.glow, big ? 9 : 5, 0.35);
          this.fs.shake = Math.max(this.fs.shake, big ? 0.32 : 0.18);
          if (!demo) {
            Au.play(big ? 'head' : 'pop', { pan });
            this.popup(X, Z, '+' + e.pts, big ? 'big' : '', W.glow);
          }
          break;
        }
        case 'fleaHit':
          fx.burst(X, 0.6, Z, 18, C3(0xff7a2a), 4, 0.3, 0.4, { up: 1 });
          if (!demo) Au.play('beetleHit');
          break;
        case 'flea': case 'spider': case 'scorp': {
          const col = e.t === 'flea' ? 0x6ab8ff : e.t === 'spider' ? 0xc46bff : 0xb6ff3a;
          fx.burst(X, 0.6, Z, 70, C3(col), 7, 0.45, 1.0, { up: 1, grav: 1.2, mix: C3(0xffffff) });
          this.fs.flash(X, Z, col, 14, 0.5);
          this.fs.shake = Math.max(this.fs.shake, 0.45);
          if (!demo) {
            Au.play(e.t, { pan });
            this.popup(X, Z, '+' + e.pts, 'huge', col);
          }
          break;
        }
        case 'poison':
          fx.burst(TX, 0.6, TZ, 14, C3(W.poison), 1.6, 0.4, 0.9, { up: 1.2 });
          if (!demo) Au.play('poison', { vol: 0.4 });
          break;
        case 'dive':
          fx.burst(X, 0.6, Z, 16, C3(W.poison), 3, 0.3, 0.5, { up: 1 });
          if (!demo) Au.play('dive', { vol: 0.6 });
          break;
        case 'newHead':
          fx.burst(PX(MYX.clamp(e.x, 0, 239)), 0.3, Z, 16, C3(0x8a6a4a), 3, 0.3, 0.6, { up: 1.3, grav: 4 });
          if (!demo) Au.play('newHead', { vol: 0.6 });
          break;
        case 'die':
          if (demo) break;
          Au.stopLoops();
          fx.burst(X, 0.7, Z, 160, C3(0xffc86a), 9, 0.55, 1.4, { up: 1.2, grav: 1, mix: C3(0xffffff) });
          fx.burst(X, 0.7, Z, 60, C3(W.glow), 5, 0.4, 1.2, { up: 1 });
          this.fs.flash(X, Z, 0xffc86a, 22, 0.9, 1.5);
          this.fs.shake = 1;
          Au.play('die');
          Au.duck(0.25, 2.5);
          break;
        case 'restore':
          fx.burst(TX, 0.5, TZ, 12, C3(0xffffff), 2, 0.3, 0.5, { up: 1.5, mix: C3(W.mush[0]) });
          if (!demo) Au.play('restore', { vol: 0.7 });
          break;
        case 'extra':
          if (!demo) { Au.play('extra'); this.banner(t('extraLife'), ''); }
          break;
        case 'cleared':
          if (!demo) { Au.play('clear'); this.banner(t('cleared'), ''); }
          this.sweep();
          break;
        case 'wave':
          if (e.wave > 0 && !demo) {
            const nw = worldOf(e.wave);
            if (nw !== this.world) {
              this.setWorld(nw, false);
              this.music(WORLDS[nw].music, { fadeOut: 1.2 });
              this.banner(t('bannerWorld') + ' ' + (nw + 1), MYX.I18n.lang === 'de' ? WORLDS[nw].name : WORLDS[nw].en);
            } else this.banner(t('bannerWave') + ' ' + (e.wave + 1), '');
          }
          break;
        case 'combo':
          if (!demo) { Au.play('combo', { n: e.mult }); this.popup(X, Z - 0.8, '×' + e.mult + ' ' + t('combo'), 'combo', W.accent); }
          break;
        case 'drop':
          fx.burst(X, 0.7, Z, 14, C3(KIND_COLORS[e.kind]), 2.4, 0.35, 0.6, { up: 1 });
          if (!demo) Au.play('drop', { vol: 0.7 });
          break;
        case 'power': {
          const col = KIND_COLORS[e.kind];
          fx.burst(X, 0.7, Z, 50, C3(col), 5, 0.4, 0.8, { up: 1.2, mix: C3(0xffffff) });
          this.fs.flash(X, Z, col, 10, 0.5);
          if (!demo) { Au.play('power'); this.banner(t('pw_' + e.kind), ''); }
          break;
        }
        case 'bomb': {
          this.fs.flash(X, Z, 0xffffff, 40, 1.0, 3);
          this.fs.shake = 1;
          for (let k = 0; k < 120; k++) {
            const a = k / 120 * Math.PI * 2;
            fx.emit(X, 0.4, Z, Math.cos(a) * 22, 0.5, Math.sin(a) * 22, C3(0xffe6b0), 0.7, 0.9, 0, 0.6);
          }
          fx.burst(X, 0.6, Z, 80, C3(0xff6ad5), 10, 0.5, 1.2, { up: 1 });
          if (!demo) Au.play('bomb');
          break;
        }
      }
    }
  }
  // continuous creature sounds (no march: the music drives Modern)
  loops(g) {
    const play = g.phase === 'play' || g.phase === 'clear';
    Au.setLoop('spider', play && !!g.spider, g.spider ? 1 - (g.spider.y - 152) / 88 : 0);
    Au.setLoop('beetle', play && !!g.flea, g.flea ? g.flea.y / 245 : 0);
    Au.setLoop('scorp', play && !!g.scorp, 0.5);
  }
  // a glow wave over the whole field when a wave is cleared
  sweep() {
    const fx = this.fs.fx, col = C3(WORLDS[this.world].glow);
    for (let k = 0; k < 90; k++) fx.emit(-15 + Math.random() * 30, 0.2 + Math.random() * 0.4, -16 + Math.random() * 32, 0, 1.5 + Math.random() * 2, 0, col, 0.35, 1.2, -0.5, 0.5);
  }

  // ------------------------------------------------------------------ floating texts and banners
  popup(X, Z, text, cls, color) {
    const v = new THREE.Vector3(X, 1.0, Z).project(this.fs.camera);
    const d = el('div', 'pop ' + (cls || ''), text);
    d.style.left = ((v.x + 1) / 2 * 100) + '%';
    d.style.top = ((1 - v.y) / 2 * 100) + '%';
    d.style.color = '#' + new THREE.Color(color).getHexString();
    this.popLayer.appendChild(d);
    setTimeout(() => d.remove(), 1100);
  }
  banner(a, b) {
    const d = el('div', 'banner', '<b>' + a + '</b>' + (b ? '<span>' + b + '</span>' : ''));
    this.popLayer.appendChild(d);
    setTimeout(() => d.remove(), 1900);
  }

  // ------------------------------------------------------------------ HUD
  buildHud() {
    this.hud.innerHTML = '';
    this.hudEl = el('div', 'mhud');
    this.hudEl.innerHTML =
      '<div class="h-left"><div class="h-score">0</div><div class="h-mult"></div></div>' +
      '<div class="h-mid"><div class="h-best"></div><div class="h-wave"></div><div class="h-powers"></div></div>' +
      '<div class="h-right"><div class="h-lives"></div><div class="h-bombs"></div></div>';
    this.hud.appendChild(this.hudEl);
    this.touchBtns = el('div', 'm-touch hidden');
    this.touchBtns.innerHTML = '<button type="button" data-k="bomb"></button><button type="button" data-a="pause">❚❚</button>';
    this.hud.appendChild(this.touchBtns);
    this.touchBtns.querySelector('[data-k=bomb]').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); In.press('bomb'); setTimeout(() => In.release('bomb'), 60); });
    this.touchBtns.querySelector('[data-a=pause]').addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); this.onAction('pause'); });
    this.hudCache = {};
  }
  updateHud() {
    const g = this.game, c = this.hudCache, h = this.hudEl;
    const show = this.state === 'game';
    this.hudEl.classList.toggle('hidden', !show);
    this.touchBtns.classList.toggle('hidden', !(show && MYX.isTouchDevice && !this.overlay));
    if (!show || !g) return;
    const set = (k, sel, v, html) => { if (c[k] !== v) { c[k] = v; const n = h.querySelector(sel); if (html) n.innerHTML = v; else n.textContent = v; } };
    set('score', '.h-score', g.score.toLocaleString('de-AT'));
    set('mult', '.h-mult', g.mult > 1 ? '×' + g.mult : '');
    set('best', '.h-best', t('hudBest') + ' ' + Math.max(g.hiscore, g.score).toLocaleString('de-AT'));
    const W = WORLDS[this.world];
    set('wave', '.h-wave', t('hudWave') + ' ' + (g.wave + 1) + ' · ' + (MYX.I18n.lang === 'de' ? W.name : W.en));
    set('lives', '.h-lives', '<i class="life"></i>'.repeat(Math.min(6, g.lives)), true);
    set('bombs', '.h-bombs', '<i class="bombi"></i>'.repeat(g.bombs), true);
    const pw = g.power;
    let ps = '';
    for (const k of ['triple', 'pierce', 'flies', 'slow']) if (pw[k] > 0) ps += '<span style="--c:#' + new THREE.Color(KIND_COLORS[k]).getHexString() + ';--p:' + Math.min(1, pw[k] / 600) + '">' + t('pw_' + k) + '</span>';
    set('powers', '.h-powers', ps, true);
    this.touchBtns.querySelector('[data-k=bomb]').textContent = t('touchBomb') + ' ' + g.bombs;
  }

  // ------------------------------------------------------------------ menus (HTML)
  items() {
    if (this.overlay === 'pause') return [{ id: 'resume', label: t('mmResume') }, { id: 'options', label: t('mmOptions') }, { id: 'quit', label: t('mmQuitGame') }];
    if (this.overlay === 'options' || this.state === 'options') return this.optionItems();
    if (this.state === 'menu') return [{ id: 'play', label: t('mmPlay') }, { id: 'scores', label: t('mmScores') }, { id: 'how', label: t('mmHow') }, { id: 'options', label: t('mmOptions') }, { id: 'back', label: t('mmBack') }];
    return [];
  }
  optionItems() {
    const S = MYX.Settings, onoff = v => (v ? t('on') : t('off'));
    const q = S.get('quality');
    return [
      { id: 'sound', label: t('mSound'), value: onoff(!Au.muted), cycle: true },
      { id: 'musicVol', label: t('mMusic'), value: Math.round(S.get('musicVol') * 10) + '', cycle: true },
      { id: 'sfxVol', label: t('mSfx'), value: Math.round(S.get('sfxVol') * 10) + '', cycle: true },
      { id: 'menuSong', label: t('optMenuMusic'), value: S.get('menuSong') ? t('optSong') : t('optInst'), cycle: true },
      { id: 'quality', label: t('optGraphics'), value: q === 'high' ? t('optHigh') : q === 'low' ? t('optLow') : t('optAuto'), cycle: true },
      { id: 'bloom', label: t('optBloom'), value: Math.round(S.get('bloom') * 10) + '', cycle: true },
      { id: 'shake', label: t('optShake'), value: onoff(S.get('shake')), cycle: true },
      { id: 'autofire', label: t('mAutofire'), value: onoff(S.get('autofire')), cycle: true },
      { id: 'mouse', label: t('mMouse'), value: S.get('mouse') === 'ball' ? t('mMouseBall') : t('mMouseFollow'), cycle: true },
      { id: 'lang', label: t('mLang'), value: MYX.I18n.lang.toUpperCase(), cycle: true },
      { id: 'clear', label: t('mClear') },
      { id: 'done', label: '←' }
    ];
  }
  activate(it, dir) {
    if (!it) return;
    const S = MYX.Settings;
    dir = dir || 1;
    Au.play('click');
    switch (it.id) {
      case 'play': this.startGame(); return;
      case 'scores': this.state = 'scores'; break;
      case 'how': this.state = 'how'; break;
      case 'options': if (this.state === 'game') this.overlay = 'options'; else this.state = 'options'; this.sel = 0; break;
      case 'back': MYX.App.go('select'); return;
      case 'resume': this.closeOverlay(); return;
      case 'quit': this.overlay = null; this.showMenu(); return;
      case 'done': if (this.state === 'game') { this.overlay = 'pause'; this.sel = 1; } else { this.state = 'menu'; this.sel = 3; } break;
      case 'sound': MYX.App.action('mute'); break;
      case 'musicVol': S.set('musicVol', MYX.clamp(Math.round(S.get('musicVol') * 10 + dir) / 10, 0, 1)); Au.applyVolumes(); break;
      case 'sfxVol': S.set('sfxVol', MYX.clamp(Math.round(S.get('sfxVol') * 10 + dir) / 10, 0, 1)); Au.applyVolumes(); break;
      case 'menuSong': S.set('menuSong', !S.get('menuSong')); if (this.state !== 'game') this.menuMusic(); break;
      case 'quality': { const l = ['auto', 'high', 'low']; S.set('quality', l[(l.indexOf(S.get('quality')) + (dir > 0 ? 1 : 2)) % 3]); this.fs.setQuality(S.get('quality')); break; }
      case 'bloom': S.set('bloom', Math.round(((S.get('bloom') * 10 + dir + 11) % 11)) / 10); break;
      case 'shake': S.set('shake', !S.get('shake')); break;
      case 'autofire': S.set('autofire', !S.get('autofire')); break;
      case 'mouse': S.set('mouse', S.get('mouse') === 'ball' ? 'follow' : 'ball'); break;
      case 'lang': MYX.App.action('lang'); return;
      case 'clear': MYX.Scores.clear('modern'); MYX.App.toast(t('mCleared')); break;
    }
    this.renderUi();
  }
  markSel() {
    const btns = this.root.querySelectorAll('.mbtn');
    btns.forEach((b, i) => b.classList.toggle('on', i === this.sel));
  }
  logo() {
    const lg = el('div', 'mlogo');
    if (this.logoCv) lg.appendChild(this.logoCv);
    else MYX.loadImage('assets/img/logo.jpg').then(img => {
      if (!img) return;
      this.logoCv = MYX.glowLogo(img);
      this.logoCv.className = 'logocv';
      if (lg.isConnected) lg.appendChild(this.logoCv);
    });
    return lg;
  }
  list(items) {
    const box = el('div', 'mlist');
    items.forEach((it, i) => {
      const b = el('button', 'mbtn' + (i === this.sel ? ' on' : ''));
      b.type = 'button';
      b.innerHTML = '<span>' + it.label + '</span>' + (it.value !== undefined ? '<em>' + it.value + '</em>' : '');
      b.addEventListener('pointerenter', () => { this.sel = i; this.markSel(); });
      b.addEventListener('click', e => {
        this.sel = i;
        const r = b.getBoundingClientRect();
        this.activate(it, it.cycle && e.clientX < r.left + r.width * 0.35 ? -1 : 1);
      });
      box.appendChild(b);
    });
    return box;
  }
  renderUi() {
    const r = this.root, s = this.state;
    r.className = 'mm ' + s + (this.overlay ? ' ov' : '') + (window.innerHeight > window.innerWidth * 1.05 ? ' portrait' : '');
    r.innerHTML = '';
    if (s === 'game' && !this.overlay) return;
    const panel = el('div', 'mpanel');
    r.appendChild(panel);
    if (this.overlay === 'pause') {
      panel.appendChild(el('h2', '', t('mmPause')));
      panel.appendChild(this.list(this.items()));
      return;
    }
    if (this.overlay === 'options' || s === 'options') {
      panel.appendChild(el('h2', '', t('mmOptions')));
      panel.appendChild(this.list(this.optionItems()));
      return;
    }
    if (s === 'menu') {
      r.insertBefore(this.logo(), panel);
      panel.classList.add('main');
      panel.appendChild(el('p', 'tag', t('tagline')));
      panel.appendChild(this.list(this.items()));
      panel.appendChild(el('p', 'foot', t('remake') + ' · ' + t('best') + ' ' + MYX.Scores.best('modern').toLocaleString('de-AT')));
      return;
    }
    if (s === 'scores') {
      panel.appendChild(el('h2', '', t('mmScores')));
      const tb = el('ol', 'mscores');
      MYX.Scores.list('modern').forEach((e, i) => tb.appendChild(el('li', i === this.lastRank ? 'new' : '', '<b>' + e.name + '</b><span>' + e.score.toLocaleString('de-AT') + '</span><em>' + t('hudWave') + ' ' + (e.wave || 1) + '</em>')));
      panel.appendChild(tb);
      panel.appendChild(this.backBtn());
      return;
    }
    if (s === 'how') {
      panel.appendChild(el('h2', '', t('mmHow')));
      const box = el('div', 'mhow');
      for (const k of ['howMove', 'howFire', 'howM1', 'howM2', 'howM3', 'howM4', 'howM5', 'howKeys']) box.appendChild(el('p', '', t(k)));
      panel.appendChild(box);
      panel.appendChild(this.backBtn());
      return;
    }
    if (s === 'over' || s === 'name') {
      panel.appendChild(el('h2', 'over', t('overTitle')));
      panel.appendChild(el('div', 'ostats', '<div><em>' + t('overScore') + '</em><b>' + this.overStats.score.toLocaleString('de-AT') + '</b></div><div><em>' + t('overWave') + '</em><b>' + this.overStats.wave + '</b></div>'));
      if (s === 'name') {
        panel.appendChild(el('p', 'tag', t('newRecordM')));
        const slots = el('div', 'nslots');
        this.name.letters.forEach((l, i) => slots.appendChild(el('span', i === this.name.pos ? 'on' : '', LETTERS.charAt(l))));
        panel.appendChild(slots);
        const kb = el('div', 'nkeys');
        for (const ch of LETTERS + '⌫✓') {
          const b = el('button', 'nk', ch === '✓' ? t('ok') : ch);
          b.type = 'button';
          b.addEventListener('click', () => { if (ch === '⌫') this.nameBack(); else if (ch === '✓') this.nameDone(); else this.nameChar(ch); });
          kb.appendChild(b);
        }
        panel.appendChild(kb);
        panel.appendChild(el('p', 'hint', t('nameHint')));
      } else panel.appendChild(this.backBtn(t('mmMenu')));
    }
  }
  backBtn(label) {
    const b = el('button', 'mbtn on back', '<span>' + (label || '←') + '</span>');
    b.type = 'button';
    b.addEventListener('click', () => { Au.play('click'); this.backFromPage(); });
    return b;
  }

  // ------------------------------------------------------------------ name entry
  nameChar(ch) {
    const i = LETTERS.indexOf(ch);
    if (i < 0 || this.state !== 'name') return;
    this.name.letters[this.name.pos] = i;
    Au.play('click');
    if (this.name.pos < 2) this.name.pos++;
    else { this.nameDone(); return; }
    this.renderUi();
  }
  nameBack() { if (this.name.pos > 0) this.name.pos--; Au.play('move'); this.renderUi(); }
  nameDone() {
    if (this.state !== 'name') return;
    const s = this.name.letters.map(i => LETTERS.charAt(i)).join('');
    this.lastRank = MYX.Scores.insert('modern', s, this.overStats.score, this.overStats.wave);
    In.onChar = null;
    Au.play('power');
    this.state = 'scores';
    this.newDemo();
    this.renderUi();
  }
  tickName() {
    const n = this.name, A = LETTERS.length;
    let step = 0;
    if (In.take('up') || In.take('upRep')) step = 1;
    if (In.take('down') || In.take('downRep')) step = -1;
    if (step) { n.letters[n.pos] = (n.letters[n.pos] + step + A) % A; Au.play('move'); this.renderUi(); }
    if (In.take('left')) this.nameBack();
    if (In.take('right')) { if (n.pos < 2) { n.pos++; this.renderUi(); } }
    if (In.take('start') || In.take('fire')) { if (n.pos < 2) { n.pos++; Au.play('click'); this.renderUi(); } else this.nameDone(); }
    if (In.take('back')) this.nameBack();
  }

  // ------------------------------------------------------------------ drawing
  render(alpha, dt) {
    const g = this.game || this.demo;
    if (!g) return;
    const now = performance.now();
    const realDt = Math.min(0.1, (now - (this.last || now)) / 1000);
    this.last = now;
    // keep the frame rate: drop to lower quality when the device struggles
    this.fps.n++; this.fps.t += realDt;
    if (this.fps.t > 2) { this.fs.autoQuality(this.fps.n / this.fps.t); this.fps.n = 0; this.fps.t = 0; }
    this.actors.sync(g, alpha, this.fs.time.value, realDt);
    // the bolt and the spirit leave light trails
    if (this.state === 'game' && g.shot.flying && Math.random() < 0.6) this.fs.fx.emit(PX(g.shot.x) + (Math.random() - 0.5) * 0.06, 0.6, PZ(g.shot.y + 6), 0, 0.1, 0.3, C3(g.power.pierce > 0 ? 0x6af0ff : 0xffd890), 0.2, 0.12);
    for (const e of g.extra) if (Math.random() < 0.4) this.fs.fx.emit(PX(e.x), 0.6, PZ(e.y + 6), 0, 0.1, 0.3, C3(0xffe08a), 0.16, 0.12);
    if (g.flea && g.flea.y > 8 && Math.random() < 0.5) this.fs.fx.emit(PX(g.flea.x) + (Math.random() - 0.5) * 0.5, 0.5, PZ(g.flea.y) - 0.2, 0, -0.3, -0.5, C3(0x6ab8ff), 0.3, 0.6, 0.5);
    if (g.scorp && Math.random() < 0.4) this.fs.fx.emit(PX(g.scorp.x) - Math.sign(g.scorp.dx) * 0.6, 1.2, PZ(g.scorp.y), 0, 0.3, 0, C3(WORLDS[this.world].poison), 0.3, 0.6);
    if (g.power.slow > 0 && Math.random() < 0.3) this.fs.fx.emit(-15 + Math.random() * 30, 0.1, -16 + Math.random() * 32, 0, 0.6, 0, C3(0xb89cff), 0.4, 1.4);
    this.fs.render(realDt);
    this.updateHud();
  }
}
