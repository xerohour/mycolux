// MYCOLUX Original – the cabinet: attract mode (the game plays itself, silent, with the high scores and the
// creature table laid over it), play, pause, the in-monitor menu, game over and name entry. Everything is drawn
// into the 240 x 256 picture.
'use strict';

(function (MYX) {
  var In = MYX.Input, Au = MYX.Audio, V = MYX.ViewOriginal, CFG = MYX.CFG, W = MYX.W, H = MYX.H, T = MYX.T;
  var LETTERS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  var M = MYX.ModeOriginal = {
    state: 'attract',
    sub: 'scores',
    t: 0,
    game: null,
    demo: null,
    paused: false,
    menu: null,
    name: null,
    keyN: { x: 0, y: 0 },

    init: function () {
      this.wrap = document.getElementById('orig-wrap');
      this.canvas = document.getElementById('orig');
      V.init(this.canvas);
      this.sides = this.wrap.querySelectorAll('.cab-side');
      var self = this;
      var bind = function (c) { self.canvas = c; c.addEventListener('pointerdown', function (e) { self.pointerDown(e); }); };
      bind(this.canvas);
      V.onSwap = bind;
    },
    enter: function () {
      this.wrap.classList.remove('hidden');
      document.body.classList.add('in-original');
      Au.useSet('original');
      MYX.Settings.set('lastMode', 'original');
      this.applyBezel();
      this.toAttract('scores');
      this.resize();
      if (MYX.autoplayStart) { MYX.autoplayStart = false; this.start(); }
    },
    exit: function () {
      this.wrap.classList.add('hidden');
      document.body.classList.remove('in-original');
      Au.stopLoops();
      In.wantLock = false;
      In.releaseLock();
      In.onChar = null;
      this.showTouch(false);
    },
    suspend: function () { if (this.state === 'play' && !this.paused && !this.menu) this.paused = true; Au.stopLoops(); },
    texts: function () {},

    // ---------------------------------------------------------------- flow
    toAttract: function (sub) {
      this.state = 'attract';
      this.sub = sub || 'scores';
      this.t = 0;
      this.game = null;
      this.paused = false;
      this.menu = null;
      In.wantLock = false;
      In.onChar = null;
      In.releaseLock();
      Au.stopLoops();
      this.showTouch(false);
      this.newDemo();
    },
    newDemo: function () {
      this.demo = new MYX.Game({ demo: true, seed: (Math.random() * 1e9) | 0, hiscore: MYX.Scores.best('original') });
      this.pilot = new MYX.Autopilot(this.demo, 0.9);
    },
    start: function () {
      Au.unlock();
      Au.stopLoops();
      this.game = new MYX.Game({ seed: MYX.seed, hiscore: MYX.Scores.best('original') });
      if (MYX.startWave) { for (var i = 0; i < MYX.startWave; i++) { this.game.spd++; this.game.nextWave(); } }
      this.demo = null;
      this.state = 'play';
      this.t = 0;
      this.paused = false;
      this.menu = null;
      this.keyN = { x: 0, y: 0 };
      In.wantLock = true;
      In.takeRel();
      this.showTouch(MYX.isTouchDevice);
      Au.play('coin');
    },
    gameOver: function () {
      var g = this.game;
      In.wantLock = false;
      In.releaseLock();
      Au.stopLoops();
      if (MYX.Scores.qualifies('original', g.score)) {
        this.state = 'name';
        this.name = { letters: [1, 1, 1], pos: 0, done: false, acc: 0 };
        this.t = 0;
        var self = this;
        In.onChar = function (ch) { self.nameChar(ch); };
        Au.play('extra');
      } else this.toAttract('scores');
    },

    // ---------------------------------------------------------------- input -> movement of the spirit
    gamePos: function (cx, cy) {
      var r = this.canvas.getBoundingClientRect();
      return { x: (cx - r.left) / r.width * W, y: (cy - r.top) / r.height * H };
    },
    // keys like the joystick: 0.5, 1, 1.5 … 3 px per frame on consecutive frames; reversing starts over
    keyAxis: function (dir, axis) {
      var n = this.keyN[axis];
      if (!dir) { this.keyN[axis] = 0; return 0; }
      if (MYX.sign(n) !== dir) n = 0;
      n = MYX.clamp(Math.abs(n) + 1, 1, 6) * dir;
      this.keyN[axis] = n;
      return n * 0.5;
    },
    readMove: function () {
      var p = this.game.player, mx = 0, my = 0;
      mx += this.keyAxis((In.down('right') ? 1 : 0) - (In.down('left') ? 1 : 0), 'x');
      my += this.keyAxis((In.down('down') ? 1 : 0) - (In.down('up') ? 1 : 0), 'y');
      // stick: further out = faster
      if (In.stick.x || In.stick.y) { mx += In.stick.x * CFG.keySpeed; my += In.stick.y * CFG.keySpeed; }
      // trackball (pointer lock) and touch drag: relative, in monitor pixels
      var rel = In.takeRel(), c = this.carry || (this.carry = { x: 0, y: 0 });
      if (rel.x || rel.y) {
        var b = this.canvas.getBoundingClientRect();
        var sens = MYX.Settings.get('sens') || 1;
        var k = In.locked ? 0.5 : 1.2;
        c.x += rel.x * W / Math.max(1, b.width) * k * sens;
        c.y += rel.y * H / Math.max(1, b.height) * k * sens;
      }
      // a quick swipe is faster than the spirit: the rest follows in the next frames
      var ax = MYX.clamp(c.x, -CFG.gunMax, CFG.gunMax), ay = MYX.clamp(c.y, -CFG.gunMax, CFG.gunMax);
      mx += ax; my += ay;
      c.x = (c.x - ax) * 0.9; c.y = (c.y - ay) * 0.9;
      // mouse "follow": the spirit runs to the pointer as fast as the trackball allows
      var ptr = In.pointer;
      if (!In.locked && !ptr.touch && ptr.moved && MYX.Settings.get('mouse') === 'follow') {
        var q = this.gamePos(ptr.x, ptr.y);
        var dx = q.x - p.x, dy = q.y - (p.y + 4);
        if (Math.abs(dx) >= 0.5) mx += dx;
        if (Math.abs(dy) >= 0.5) my += dy;
      }
      return { mx: mx, my: my };
    },

    // ---------------------------------------------------------------- tick
    tick: function () {
      this.t++;
      if (this.state === 'attract') return this.tickAttract();
      if (this.state === 'name') return this.tickName();
      if (this.state !== 'play') return;
      if (this.menu) return this.tickMenu();
      if (In.take('back')) { this.openMenu(); return; }
      if (this.paused) {
        if (In.take('fire') || In.take('start') || In.take('tap') || In.take('click')) this.paused = false;
        return;
      }
      var g = this.game;
      var mv = this.readMove();
      g.step({ mx: mv.mx, my: mv.my, fire: In.fireHeld() });
      this.events(g);
      this.loops(g);
      if (g.phase === 'over' && g.phaseT > 150) this.gameOver();
    },
    tickAttract: function () {
      if (In.take('fire') || In.take('start') || In.take('tap') || In.take('click')) { this.start(); return; }
      var d = this.demo;
      d.step(this.pilot.input());
      d.ev = [];
      if (d.phase === 'over' && d.phaseT > 90) this.newDemo();
      if (this.t > 60 * 9) { this.t = 0; this.sub = this.sub === 'scores' ? 'title' : 'scores'; }
    },

    // sounds from the game's events
    events: function (g) {
      var ev = g.ev;
      g.ev = [];
      for (var i = 0; i < ev.length; i++) {
        var e = ev[i], pan = (e.x - W / 2) / W;
        switch (e.t) {
          case 'shot': Au.play('shot', { vol: 0.6 }); break;
          case 'mushKill': Au.play('mushKill', { vol: 0.5 }); break;
          case 'pop': case 'head': case 'flea': case 'spider': case 'scorp': case 'restore': Au.play('pop', { pan: pan }); break;
          case 'fleaHit': Au.play('beetleHit'); break;
          case 'die': Au.stopLoops(); Au.play('die'); break;
          case 'extra': Au.play('extra'); break;
        }
      }
    },
    // continuous sounds: the worm's march (every 16 frames), spider, beetle, scorpion
    loops: function (g) {
      var play = g.phase === 'play' || g.phase === 'clear';
      Au.setLoop('spider', play && !!g.spider, g.spider ? 1 - (g.spider.y - 152) / 88 : 0);
      Au.setLoop('beetle', play && !!g.flea, g.flea ? g.flea.y / 245 : 0);
      Au.setLoop('scorp', play && !!g.scorp, 0.5);
      // the beetle and the scorpion take the march's channel, like on the board
      if (g.phase === 'play' && g.liveCount > 0 && !g.flea && !g.scorp && g.frame % 16 === 0) Au.play('march', { vol: 0.9 });
    },

    // ---------------------------------------------------------------- name entry (letters: blank, A-Z)
    nameChar: function (ch) {
      var n = this.name;
      if (!n || n.done) return;
      var i = LETTERS.indexOf(ch);
      if (i < 1) return;
      n.letters[n.pos] = i;
      this.nameNext();
    },
    nameNext: function () {
      var n = this.name;
      Au.play('click');
      if (n.pos < 2) { n.pos++; return; }
      n.done = true;
      In.onChar = null;
      var s = n.letters.map(function (i) { return LETTERS.charAt(i); }).join('');
      MYX.Scores.insert('original', s, this.game.score, this.game.wave + 1);
      var self = this;
      setTimeout(function () { if (self.state === 'name') self.toAttract('scores'); }, 700);
    },
    tickName: function () {
      var n = this.name;
      if (n.done) return;
      var A = LETTERS.length, step = 0;
      if (In.take('up') || In.take('upRep')) step = 1;
      if (In.take('down') || In.take('downRep')) step = -1;
      // trackball / swipe: one letter per few pixels
      var rel = In.takeRel();
      n.acc += rel.y * -0.05 + rel.x * 0.05;
      while (n.acc > 1) { step++; n.acc--; }
      while (n.acc < -1) { step--; n.acc++; }
      if (In.stick.y && this.t % 8 === 0) step = In.stick.y < 0 ? 1 : -1;
      if (step) { n.letters[n.pos] = ((n.letters[n.pos] + step) % A + A) % A; Au.play('move'); }
      if ((In.take('left') || In.take('back')) && n.pos > 0) { n.pos--; Au.play('move'); }
      if (In.take('right') || In.take('fire') || In.take('start') || In.take('tap') || In.take('click')) this.nameNext();
    },

    // ---------------------------------------------------------------- menu inside the monitor
    menuItems: function () {
      var t = MYX.t, S = MYX.Settings, onoff = function (v) { return v ? t('on') : t('off'); };
      return [
        { id: 'continue', label: t('mContinue') },
        { id: 'sound', label: t('mSound'), value: onoff(!Au.muted) },
        { id: 'sfx', label: t('mSfx'), value: String(Math.round(S.get('sfxVol') * 10)) },
        { id: 'crt', label: t('mCrt'), value: onoff(S.get('crt')) },
        { id: 'bezel', label: t('mBezel'), value: onoff(S.get('bezel')) },
        { id: 'mouse', label: t('mMouse'), value: S.get('mouse') === 'ball' ? t('mMouseBall') : t('mMouseFollow') },
        { id: 'autofire', label: t('mAutofire'), value: onoff(S.get('autofire')) },
        { id: 'lang', label: t('mLang'), value: MYX.I18n.lang.toUpperCase() },
        { id: 'clear', label: t('mClear') },
        { id: 'quit', label: t('mQuit') }
      ];
    },
    openMenu: function () {
      this.menu = { sel: 0, t: 0, msg: null };
      In.wantLock = false;
      In.releaseLock();
      Au.stopLoops();
      Au.play('click');
    },
    closeMenu: function () {
      this.menu = null;
      In.wantLock = this.state === 'play';
      In.takeRel();
    },
    menuChange: function (id, dir) {
      var S = MYX.Settings;
      switch (id) {
        case 'continue': this.closeMenu(); return;
        case 'sound': MYX.App.action('mute'); break;
        case 'sfx': S.set('sfxVol', MYX.clamp(Math.round(S.get('sfxVol') * 10 + (dir || 1)) / 10, 0, 1)); Au.applyVolumes(); break;
        case 'crt': S.set('crt', !S.get('crt')); break;
        case 'bezel': S.set('bezel', !S.get('bezel')); this.applyBezel(); this.resize(); break;
        case 'mouse': S.set('mouse', S.get('mouse') === 'ball' ? 'follow' : 'ball'); break;
        case 'autofire': S.set('autofire', !S.get('autofire')); break;
        case 'lang': MYX.App.action('lang'); break;
        case 'clear': MYX.Scores.clear('original'); this.menu.msg = MYX.t('mCleared'); if (this.game) this.game.hiscore = MYX.Scores.best('original'); break;
        case 'quit': this.menu = null; MYX.App.go('select'); return;
      }
      Au.play('click');
    },
    tickMenu: function () {
      var m = this.menu, items = this.menuItems();
      m.t++;
      if (In.take('up') || In.take('upRep')) { m.sel = (m.sel + items.length - 1) % items.length; Au.play('move'); }
      if (In.take('down') || In.take('downRep')) { m.sel = (m.sel + 1) % items.length; Au.play('move'); }
      if (In.take('left')) this.menuChange(items[m.sel].id, -1);
      if (In.take('right')) this.menuChange(items[m.sel].id, 1);
      if (In.take('fire') || In.take('start')) this.menuChange(items[m.sel].id, 1);
      if (In.take('back')) this.closeMenu();
      In.take('tap'); In.take('click');
    },
    menuRowAt: function (cx, cy) {
      var q = this.gamePos(cx, cy);
      var row = Math.floor((q.y - 45) / 15);
      return row >= 0 && row < this.menuItems().length ? row : -1;
    },
    pointerDown: function (e) {
      if (this.state === 'play' && this.menu) {
        var row = this.menuRowAt(e.clientX, e.clientY);
        if (row >= 0) {
          this.menu.sel = row;
          var q = this.gamePos(e.clientX, e.clientY);
          this.menuChange(this.menuItems()[row].id, q.x < W * 0.4 ? -1 : 1);
        }
      }
    },
    onAction: function (a) {
      if (a === 'menu') {
        if (this.state === 'play') { if (this.menu) this.closeMenu(); else this.openMenu(); return true; }
        if (this.state === 'name') return true;
        MYX.App.go('select');
        return true;
      }
      if (a === 'pause' && this.state === 'play' && !this.menu) { this.paused = !this.paused; if (this.paused) Au.stopLoops(); return true; }
      if (a === 'crt') { MYX.Settings.set('crt', !MYX.Settings.get('crt')); MYX.App.toast(MYX.t(MYX.Settings.get('crt') ? 'crtOn' : 'crtOff')); return true; }
      return false;
    },

    // ---------------------------------------------------------------- drawing
    render: function () {
      var t = MYX.t;
      if (this.state === 'attract') {
        V.drawField(this.demo);
        if (this.sub === 'scores') this.drawScores(); else this.drawTitle();
        if ((this.t >> 5) & 1) this.label(MYX.isTouchDevice ? t('oTap') : t('oPress'), 27, V.palette(this.demo.wave).pal.c);
        this.label('(C) 2026 NIKOMEDIA', 31, V.palette(this.demo.wave).pal.c);
      } else {
        var g = this.game, pal = V.palette(g.wave).pal;
        V.drawField(g);
        if (this.state === 'play') {
          if (g.phase === 'over') this.label(t('gameOver'), 16, pal.c);
          if (this.paused) this.label(t('paused'), 16, pal.c);
          if (this.menu) this.drawMenu();
        }
        if (this.state === 'name') this.drawName();
      }
      V.present();
    },
    // text the way the board writes it: whole tiles, black behind every letter
    label: function (s, row, color, col) {
      s = String(s);
      var x = col === undefined ? Math.floor((MYX.COLS - s.length) / 2) * T : col * T;
      V.g.fillStyle = '#000';
      V.g.fillRect(x, row * T, s.length * T, T);
      V.text(s, x, row * T, color);
    },
    drawScores: function () {
      var t = MYX.t, d = this.demo, pal = V.palette(d.wave).pal;
      this.label(t('highScores'), 2, pal.c);
      var l = MYX.Scores.list('original');
      for (var i = 0; i < Math.min(8, l.length); i++) this.label(d.hudText(l[i].score) + ' ' + l[i].name, 4 + i, pal.c, 9);
      this.label(t('oBonus'), 14, pal.c);
    },
    drawTitle: function () {
      var g = V.g, t = MYX.t, d = this.demo, pal = V.palette(d.wave).pal, pi = V.palette(d.wave).pi, SPR = MYX.SPR;
      g.fillStyle = '#000';
      g.fillRect(4 * T, 2 * T, 22 * T, 3 * T);
      V.center('MYCOLUX', 2 * T + 4, pal.a, 2);
      this.label(t('oScores'), 6, pal.c);
      var rows = [
        [V.sprite('h' + pi + 'R0', SPR.headR[0], pal), 3, t('oHead'), '100'],
        [V.sprite('b' + pi + '0', SPR.body[0], pal), 3, t('oBody'), '10'],
        [V.sprite('sp' + pi + '0', SPR.spider[0], pal), 7, t('oSpider'), '300-900'],
        [V.sprite('fl' + pi + '0', SPR.beetle[0], pal), 4, t('oBeetle'), '200'],
        [V.sprite('sc' + pi + 'R0', SPR.scorpR[0], pal), 8, t('oScorp'), '1000'],
        [V.mushSprite(pal, pi, 4, 0), 4, t('oMush'), '1']
      ];
      for (var r = 0; r < rows.length; r++) {
        var y = (8 + r * 2) * T;
        g.fillStyle = '#000';
        g.fillRect(2 * T, y, 26 * T, T);
        g.drawImage(rows[r][0], 4 * T - rows[r][1] + 3, y);
        V.text(rows[r][2], 7 * T, y, pal.b);
        V.text(rows[r][3], (28 - rows[r][3].length) * T, y, pal.c);
      }
      this.label(t('remake').toUpperCase(), 21, pal.b);
    },
    drawName: function () {
      var t = MYX.t, n = this.name, pal = V.palette(this.game.wave).pal;
      this.label(t('newRecord'), 18, pal.c);
      this.label(t('enterName'), 20, pal.c);
      var s = n.letters.map(function (i) { return LETTERS.charAt(i) === ' ' ? '_' : LETTERS.charAt(i); }).join('');
      this.label(s, 22, pal.c, 13);
      if (!n.done && (this.t >> 4) & 1) { V.g.fillStyle = pal.b; V.g.fillRect((13 + n.pos) * T + 1, 23 * T, 6, 1); }
    },
    drawMenu: function () {
      var g = V.g, m = this.menu, items = this.menuItems(), pal = V.palette(this.game.wave).pal;
      g.fillStyle = 'rgba(0,0,0,0.88)';
      g.fillRect(8, 2 * T, W - 16, H - 4 * T);
      V.center(MYX.t('menuTitle'), 3 * T, pal.a, 2);
      for (var i = 0; i < items.length; i++) {
        var y = 48 + i * 15, on = i === m.sel;
        if (on) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(12, y - 3, W - 24, 13); }
        V.text((on ? '►' : ' ') + items[i].label, 14, y, on ? '#ffffff' : pal.b);
        if (items[i].value !== undefined) V.text(items[i].value, W - 16 - items[i].value.length * 8, y, on ? pal.c : '#9a9a9a');
      }
      if (m.msg) V.center(m.msg, H - 3 * T, '#ffffff');
    },

    // ---------------------------------------------------------------- page layout
    applyBezel: function () {
      this.wrap.classList.toggle('no-bezel', !MYX.Settings.get('bezel'));
    },
    showTouch: function (on) {
      var b = document.getElementById('touchbar');
      if (b) b.classList.toggle('hidden', !on);
    },
    resize: function () {
      if (!this.wrap) return;
      var vw = window.innerWidth, vh = window.innerHeight;
      // the monitor keeps 3:4 and fills the height; side art only when there is room
      var mh = vh, mw = mh * 0.75;
      if (mw > vw) { mw = vw; mh = mw / 0.75; }
      var mon = this.wrap.querySelector('.cab-monitor');
      mon.style.width = Math.floor(mw) + 'px';
      mon.style.height = Math.floor(mh) + 'px';
      var side = Math.floor((vw - mw) / 2);
      var show = MYX.Settings.get('bezel') && side > 120;
      for (var i = 0; i < this.sides.length; i++) {
        this.sides[i].style.width = side + 'px';
        this.sides[i].classList.toggle('hidden', !show);
      }
    }
  };
})(MYX);
