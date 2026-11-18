// MYCOLUX – the game rules, shared by both versions, following the 1981 board frame by frame (docs/original-spec.md).
// Arcade units: 240 x 256 pixels, tiles of 8, one step per 60 Hz frame, speeds in pixels per frame.
// Every moving object has x = its centre column and y = the top row of its 8-pixel frame; the tile it stands on
// (its "hotspot") is (x / 8, (y + 3) / 8). No drawing here: the views read the state and the events (game.ev).
'use strict';

(function (MYX) {
  var T = MYX.T, COLS = MYX.COLS, ROWS = MYX.ROWS;

  var CFG = MYX.CFG = {
    gunStartX: 119, gunStartY: 240,
    gunMinX: 3, gunMaxX: 236, gunMinY: 200, gunMaxY: 240,
    gunMax: 4,              // px per frame and axis at most (trackball)
    keySpeed: 3,            // keys / joystick ramp up to this
    shotSpeed: 7,
    shotLen: 6,
    chainLen: 12,
    fastScore: 40000,       // from here on every wave is fast
    headInterval: 192,      // first new head from the side after this many frames, then 8 fewer each time, down to 88
    headMin: 88,
    extraLife: 12000,
    maxReserve: 6,
    startLives: 3,
    spiderFirst: 96,
    spiderAfterKill: 224,
    spiderY: 152,           // entry row 19, the spider climbs no higher than this early on
    restoreEvery: 8,
    deathWait: 76,          // explosion and its sound before the mushrooms grow back
    waveWait: 64
  };

  function idx(c, r) { return r * COLS + c; }
  function sgn(v) { return v < 0 ? -1 : v > 0 ? 1 : 0; }
  function hotCol(x) { var c = Math.floor(x / 8); return c < 0 ? 0 : c > 29 ? 29 : c; }
  function hotRow(y) { return Math.floor((y + 3) / 8); }
  MYX.hotCol = hotCol;
  MYX.hotRow = hotRow;

  var Game = MYX.Game = function (opt) {
    opt = opt || {};
    this.modern = !!opt.modern;
    this.demo = !!opt.demo;
    this.rng = new MYX.Rng(opt.seed || ((Date.now() * 7919) >>> 0));
    this.mush = new Uint8Array(COLS * ROWS);     // hit points left: 0 none, 1..4
    this.poison = new Uint8Array(COLS * ROWS);
    this.low = 0;                                // mushrooms in rows 20..29 (decides the spore beetle)
    this.slots = [];
    for (var i = 0; i < 12; i++) this.slots.push({ i: i, alive: false, body: false, poisoned: false, x: 0, y: 0, dx: 0, dy: 0, leg: 0, born: 0 });
    this.player = { x: CFG.gunStartX, y: CFG.gunStartY };
    this.shot = { x: CFG.gunStartX, y: CFG.gunStartY - 4, flying: false };
    this.extra = [];                             // Modern: extra bolts (fan, fireflies)
    this.flea = null;
    this.spider = null;
    this.scorp = null;
    this.pops = [];
    this.ev = [];
    this.score = 0;
    this.hiscore = opt.hiscore || 0;
    this.lives = (opt.lives || CFG.startLives) - 1;   // reserve lives (icons); one is in play
    this.nextExtra = CFG.extraLife;
    this.wave = 0;            // waves cleared so far = colour set
    this.len = CFG.chainLen;
    this.spd = 2;
    this.frame = 0;
    this.phase = 'play';      // play | clear (pause after a wave) | dying | restore | over
    this.phaseT = 0;
    this.newHeadFlag = false;
    this.headInterval = CFG.headInterval;
    this.headTimer = CFG.headInterval;
    this.spiderTimer = CFG.spiderFirst;
    this.liveCount = 0;
    // Modern only: powers (frames left), combo, light bombs, drops lying in the field
    this.power = { triple: 0, pierce: 0, flies: 0, slow: 0 };
    this.combo = 0;
    this.comboT = 0;
    this.mult = 1;
    this.bombs = this.modern ? 1 : 0;
    this.drops = [];
    this.flies = [];
    this.plant();
    this.setupWave();
  };

  Game.prototype = {
    emit: function (type, x, y, extra) {
      var e = { t: type, x: x, y: y };
      if (extra) for (var k in extra) e[k] = extra[k];
      this.ev.push(e);
      return e;
    },
    addScore: function (n) {
      if (this.demo) return;
      var before = this.score;
      this.score += n;
      while (this.score >= this.nextExtra) {
        this.nextExtra += CFG.extraLife;
        if (this.lives < CFG.maxReserve) { this.lives++; this.emit('extra', this.player.x, this.player.y); }
      }
      // every 10 000 points the worm sends its side heads 2 frames sooner
      if (Math.floor(this.score / 10000) > Math.floor(before / 10000)) this.headInterval = Math.max(16, this.headInterval - 2);
    },
    // the HUD line (row 0) is part of the field for heads entering there: digits and life icons are obstacles
    hudText: function (n) {
      var s = String(Math.floor(n) % 1000000);
      if (s.length < 2) s = '0' + s;
      while (s.length < 6) s = ' ' + s;
      return s;
    },
    hudBlocked: function (c) {
      if (c < 6) return this.hudText(this.score).charAt(c) !== ' ';
      if (c < 12) return c - 6 < this.lives;
      if (c < 18) return this.hudText(Math.max(this.hiscore, this.score)).charAt(c - 12) !== ' ';
      return false;
    },

    // ------------------------------------------------------------------ mushrooms
    mushAt: function (c, r) {
      if (c < 0 || c >= COLS || r < 0 || r >= ROWS) return 0;
      return this.mush[idx(c, r)];
    },
    // what a head sees in a tile: mushroom, poisoned mushroom or a HUD glyph
    tileAt: function (c, r) {
      if (r === 0) return this.hudBlocked(c) ? 1 : 0;
      var i = idx(c, r);
      return this.mush[i] ? (this.poison[i] ? 2 : 1) : 0;
    },
    addMush: function (c, r) {
      if (c < 0 || c >= COLS || r <= 0 || r >= 30) return false;
      var i = idx(c, r);
      if (this.mush[i]) return false;
      this.mush[i] = 4; this.poison[i] = 0;
      if (r >= 20) this.low++;
      this.emit('grow', c * T, r * T);
      return true;
    },
    removeMush: function (c, r) {
      var i = idx(c, r);
      if (!this.mush[i]) return;
      this.mush[i] = 0; this.poison[i] = 0;
      if (r >= 20) this.low--;
    },
    plant: function () {
      for (var i = 0; i < 46; i++) {
        var r = 4 + (i % 26), c = this.rng.int(0, 31);
        if (c <= 29 && !this.mush[idx(c, r)]) { this.mush[idx(c, r)] = 4; if (r >= 20) this.low++; }
      }
    },

    // ------------------------------------------------------------------ the worm: twelve slots, chains in order
    setupWave: function () {
      var dir = this.rng.chance(0.5) ? 1 : -1, s, i;
      for (i = 0; i < 12; i++) {
        s = this.slots[i];
        s.alive = true; s.poisoned = false; s.born = this.frame;
        if (i < this.len) {
          s.body = i > 0;
          s.y = 0;
          s.x = 119 - dir * 8 * i;
          s.dx = dir * this.spd; s.dy = this.spd;
          s.leg = ((2 - i) % 8 + 8) % 8;
        } else {
          s.body = false;
          s.y = 0;
          s.x = 247 - 8 * this.rng.int(0, 31);
          s.dx = this.rng.chance(0.5) ? 2 : -2; s.dy = 2;
          s.leg = 0;
        }
      }
      this.liveCount = 12;
      this.newHeadFlag = false;
      this.emit('wave', 0, 0, { wave: this.wave });
    },
    wormAlive: function () { return this.liveCount > 0; },
    // another head-blocking object in the same row just ahead (segments, beetle, scorpion)
    blockedAhead: function (s) {
      var lo = s.dx < 0 ? s.x - 12 : s.x, hi = s.dx < 0 ? s.x - 1 : s.x + 11;
      for (var i = 0; i < 12; i++) {
        var o = this.slots[i];
        if (o === s || !o.alive || o.y !== s.y) continue;
        if (o.x >= lo && o.x <= hi) return true;
      }
      if (this.flea && this.flea.y === s.y && this.flea.x >= lo && this.flea.x <= hi) return true;
      if (this.scorp && this.scorp.y === s.y && this.scorp.x >= lo && this.scorp.x <= hi) return true;
      return false;
    },
    // a head turning back up on the bottom row lets its tail go as a new head
    releaseTail: function (h) {
      var k = h.i + 1;
      if (k > 11 || !this.slots[k].alive || !this.slots[k].body) return;
      while (k + 1 <= 11 && this.slots[k + 1].alive && this.slots[k + 1].body) k++;
      var t = this.slots[k];
      if (t.y < 240) return;
      t.body = false; t.poisoned = false;
      t.dx = -t.dx; t.y = 240; t.dy = 0;
      this.emit('newHead', t.x, t.y);
    },
    // one frame for every segment, slots 11 down to 0 (a body compares with its leader's last position)
    stepWorm: function () {
      for (var i = 11; i >= 0; i--) {
        var s = this.slots[i];
        if (!s.alive) continue;
        if ((this.frame & 1) === 0) s.leg = (s.leg + 1) & 7;
        if (!s.body && !s.poisoned && s.y >= 240) this.newHeadFlag = true;
        var go = 'h';
        if (s.y % 8 !== 0) go = 'v';
        else {
          if (this.liveCount === 1) { s.dx = sgn(s.dx || 1) * 2; s.dy = s.dy < 0 ? -2 : (s.dy === 0 ? 0 : 2); }
          if (s.body) {
            go = Math.abs(this.slots[i - 1].y - s.y) >= 8 ? 'v' : 'h';
          } else if (s.poisoned) go = 'v';
          else if (s.x <= 7 && (s.dy === 0 || s.dx < 0)) go = s.dy === 0 ? 'r' : 'v';
          else if (s.x >= 232 && (s.dy === 0 || s.dx > 0)) go = s.dy === 0 ? 'r' : 'v';
          else {
            var t = this.tileAt(hotCol(s.x + 8 * sgn(s.dx)), hotRow(s.y));
            if (t) {
              if (t === 2) { s.poisoned = true; this.emit('dive', s.x, s.y); }
              go = 'v';
            } else if (this.blockedAhead(s)) go = 'v';
          }
        }
        if (go === 'v') {
          if (s.dy === 0) go = 'r';
          else {
            if (s.dy < 0 && s.y <= 200) s.dy = -s.dy;
            else if (s.dy > 0 && s.y >= 240) {
              if (!s.body) { s.poisoned = false; this.releaseTail(s); }
              s.dy = -s.dy;
            }
            s.y += s.dy;
            go = 'h';
          }
        }
        if (go === 'h') {
          s.x += s.dx;
          if (this.touchesGun(s.x, s.y, 7, 7, 12)) { this.die(s); return; }
          if ((s.y & 7) === 4) go = 'r';
          else continue;
        }
        // reverse horizontally
        s.dx = -s.dx;
        if (s.dy === 0) {
          s.dy = -Math.abs(s.dx);
          s.x += 4 * sgn(s.dx);
        }
      }
    },
    killSeg: function (s, how) {
      s.alive = false;
      this.liveCount--;
      var head = !s.body;
      if (s.i < 11 && this.slots[s.i + 1].alive && this.slots[s.i + 1].body) {
        var n = this.slots[s.i + 1];
        n.body = false; n.poisoned = false;
      }
      // a mushroom grows in the tile one step ahead of the segment
      this.addMush(hotCol(s.x + 8 * sgn(s.dx)), hotRow(s.y));
      var pts = this.killScore(head ? 100 : 10, s.x, s.y);
      this.emit(head ? 'head' : 'pop', s.x, s.y, { pts: pts, mult: this.mult, how: how || 'shot', dx: s.dx, slot: s.i });
      this.pops.push({ x: s.x, y: s.y, t: 0, kind: 'pop' });
      if (head) this.maybeDrop(s.x, s.y, 0.08);
      if (this.liveCount === 0 && this.phase === 'play') {
        this.phase = 'clear';
        this.phaseT = 0;
        this.spd++;
        this.emit('cleared', s.x, s.y, { wave: this.wave });
      }
    },
    // after the pause: next colour set, next chain (slow and fast in turns until 40 000 points)
    nextWave: function () {
      this.wave++;
      if (this.spd >= 3) {
        this.len--;
        if (this.len === 0) this.len = 12;
        this.spd = this.score >= CFG.fastScore ? 2 : 1;
      }
      this.setupWave();
    },
    // new heads crawl in from the sides once a head has reached the bottom row
    stepHeads: function () {
      if (!this.newHeadFlag) return;
      if (this.headTimer > 0) { this.headTimer--; return; }
      var free = null;
      for (var i = 11; i >= 0; i--) if (!this.slots[i].alive) { free = this.slots[i]; break; }
      if (!free) return;
      var left = this.rng.chance(0.5);
      free.alive = true; free.body = false; free.poisoned = false; free.born = this.frame;
      free.y = 184; free.dy = 2;
      free.x = left ? -5 : 243; free.dx = left ? -2 : 2;
      this.liveCount++;
      if (this.headInterval >= 96) this.headInterval -= 8;
      this.headTimer = this.headInterval;
      this.emit('newHead', free.x, free.y);
    },

    // ------------------------------------------------------------------ the spirit and its bolt
    touchesGun: function (x, y, rx, ry, sum) {
      var p = this.player, ax = Math.abs(x - Math.floor(p.x)), ay = Math.abs(y - Math.floor(p.y));
      return this.phase === 'play' && !this.demoSafe && ax < rx && ay < ry && ax + ay < sum;
    },
    movePlayer: function (mx, my) {
      var p = this.player, lim = CFG.gunMax;
      mx = MYX.clamp(mx, -lim, lim);
      my = MYX.clamp(my, -lim, lim);
      // half-pixel steps like the trackball counters; each axis is blocked by a mushroom at its hotspot
      mx = Math.round(mx * 2) / 2;
      my = Math.round(my * 2) / 2;
      if (mx) {
        var nx = MYX.clamp(p.x + mx, CFG.gunMinX, CFG.gunMaxX);
        if (!this.mushAt(hotCol(nx), hotRow(Math.floor(p.y)))) p.x = nx;
      }
      if (my) {
        var ny = MYX.clamp(p.y + my, CFG.gunMinY, CFG.gunMaxY);
        if (!this.mushAt(hotCol(Math.floor(p.x)), hotRow(ny))) p.y = ny;
      }
    },
    stepShot: function (fire) {
      var p = this.player, s = this.shot;
      if (s.flying && s.y <= 5) s.flying = false;
      if (!s.flying) {
        s.x = Math.floor(p.x); s.y = Math.floor(p.y) - 4;
        if (!fire) return;
        s.flying = true;
        s.pierce = this.modern && this.power.pierce > 0 ? 8 : 0;
        s.done = null;
        this.emit('shot', s.x, s.y, { pierce: s.pierce > 0 });
        if (this.modern && this.power.triple > 0) {
          this.extra.push({ x: s.x, fx: s.x, y: s.y, vx: -0.9 }, { x: s.x, fx: s.x, y: s.y, vx: 0.9 });
        }
      }
      if (this.moveBolt(s)) s.flying = false;
    },
    // one bolt, 7 pixels up; true when it is used up
    moveBolt: function (s) {
      var yOld = s.y;
      s.y -= CFG.shotSpeed;
      if (s.vx) { s.fx += s.vx; s.x = Math.round(s.fx); if (s.x < 0 || s.x > 239) return true; }
      var c = Math.floor(s.x / 8), r = Math.floor((yOld + 2) / 8);
      if (r >= 1 && r < ROWS && this.mush[idx(c, r)] && !(s.done && s.done.indexOf('m' + c + '_' + r) >= 0)) {
        this.hitMush(c, r);
        if (s.pierce > 1) { s.pierce--; (s.done = s.done || []).push('m' + c + '_' + r); return false; }
        return true;
      }
      if (r <= 0) return true;
      var hit = this.boltTarget(s);
      if (!hit) return false;
      this.hit(hit, s);
      if (s.pierce > 1) { s.pierce--; (s.done = s.done || []).push(hit.ref); return false; }
      return true;
    },
    boltTarget: function (s) {
      var x = s.x, y = s.y, d = s.done;
      var near = function (o, rx, ry) { return o && o.y > 0 && Math.abs(o.x - x) < rx && Math.abs(o.y - y) < ry && !(d && d.indexOf(o) >= 0); };
      if (near(this.spider, 10, 5)) return { kind: 'spider', ref: this.spider };
      if (near(this.flea, 6, this.flea && this.flea.hp < 2 ? 7 : 5)) return { kind: 'flea', ref: this.flea };
      if (near(this.scorp, 10, 5)) return { kind: 'scorp', ref: this.scorp };
      for (var i = 11; i >= 0; i--) {
        var sg = this.slots[i];
        if (sg.alive && near(sg, 6, 5)) return { kind: 'seg', ref: sg };
      }
      return null;
    },
    hitMush: function (c, r) {
      var i = idx(c, r);
      this.mush[i]--;
      if (this.mush[i] === 0) {
        this.poison[i] = 0;
        if (r >= 20) this.low--;
        this.addScore(1);
        this.emit('mushKill', c * T, r * T);
      } else this.emit('mush', c * T, r * T, { hp: this.mush[i] });
    },
    hit: function (b) {
      var p = this.player;
      if (b.kind === 'seg') this.killSeg(b.ref);
      else if (b.kind === 'flea') {
        var f = this.flea;
        if (--f.hp > 0) { f.spd = 4; this.emit('fleaHit', f.x, f.y); }
        else this.killFlea();
      } else if (b.kind === 'spider') {
        var sp = this.spider, d = Math.abs(sp.y - p.y);
        this.killSpider(d < 22 ? 900 : d < 64 ? 600 : 300);
      } else if (b.kind === 'scorp') this.killScorp();
    },
    killFlea: function () {
      var f = this.flea;
      this.flea = null;
      var fp = this.killScore(200, f.x, f.y);
      this.emit('flea', f.x, f.y, { pts: fp });
      this.pops.push({ x: f.x, y: f.y, t: 0, kind: 'pop' });
      this.maybeDrop(f.x, f.y, 0.4);
    },
    killSpider: function (pts) {
      var sp = this.spider;
      this.spider = null;
      this.spiderTimer = CFG.spiderAfterKill;
      pts = this.killScore(pts, sp.x, sp.y);
      this.emit('spider', sp.x, sp.y, { pts: pts });
      this.pops.push({ x: sp.x, y: sp.y, t: 0, kind: 'pop' });
      this.pops.push({ x: MYX.clamp(sp.x, 7, 231), y: sp.y, t: -6, kind: 'score', pts: pts });
      this.maybeDrop(sp.x, sp.y, 0.25);
    },
    killScorp: function () {
      var sc = this.scorp;
      this.scorp = null;
      var pts = this.killScore(1000, sc.x, sc.y);
      this.emit('scorp', sc.x, sc.y, { pts: pts });
      this.pops.push({ x: sc.x, y: sc.y, t: 0, kind: 'pop' });
      this.maybeDrop(sc.x, sc.y, 1);
    },

    // ------------------------------------------------------------------ spore beetle (falls, sows mushrooms)
    fleaLimit: function () {
      if (this.score < 20000) return 5;
      if (this.score < 120000) return 9;
      return 6 + Math.floor(this.score / 20000);
    },
    stepFlea: function () {
      var f = this.flea;
      if (!f) {
        if (this.scorp || this.len >= 12 || this.low > this.fleaLimit()) return;
        this.flea = { x: 8 * this.rng.int(0, 29) + 3, y: 0, spd: this.score >= 60000 ? 3 : 2, hp: 2, frame: 0 };
        this.emit('fleaIn', this.flea.x, 0);
        return;
      }
      f.y += f.spd;
      f.frame++;
      if ((this.frame & 3) === 0 && this.rng.chance(0.25)) {
        var r = Math.floor((f.y - 1) / 8);
        if (r >= 1) this.addMush(hotCol(f.x), r);
      }
      if (f.y >= 245) { this.flea = null; return; }
      if (this.touchesGun(f.x, f.y, 7, 7, 12)) this.die(f);
    },
    // ------------------------------------------------------------------ weaver spider (zig-zags in the zone, eats mushrooms)
    spiderTop: function () {
      var k = this.score < 80000 ? 0 : Math.min(5, 1 + Math.floor((this.score - 80000) / 20000));
      return CFG.spiderY + 8 * k;
    },
    stepSpider: function () {
      var sp = this.spider;
      if (!sp) {
        // after a kill the first part of the wait only runs while the worm is out
        if (this.spiderTimer > 96 && (!this.liveCount || this.phase !== 'play')) return;
        if (--this.spiderTimer > 0) return;
        var left = this.rng.chance(0.5), s = this.score >= 5100 ? 2 : 1;
        this.spider = { x: left ? -8 : 248, y: CFG.spiderY, dx: left ? s : -s, keep: left ? s : -s, dy: s, s: s, t: this.rng.chance(0.5) ? 15 : 47, frame: 0, top: this.spiderTop() };
        this.emit('spiderIn', this.spider.x, this.spider.y);
        return;
      }
      if (--sp.t <= 0) {
        sp.t = 48;
        if (this.rng.chance(0.5) && sp.x > -4 && sp.x < 243) {
          if (sp.dx) { sp.keep = sp.dx; sp.dx = 0; } else sp.dx = sp.keep;
        }
        if (this.rng.chance(0.75)) sp.dy = -sp.dy;
      }
      sp.x += sp.dx;
      sp.y += sp.dy;
      sp.frame++;
      if (sp.y >= 240 && sp.dy > 0) sp.dy = -sp.dy;
      if (sp.y < sp.top && sp.dy < 0) sp.dy = -sp.dy;
      // eats the mushroom it stands on
      var c = hotCol(sp.x), r = hotRow(sp.y);
      if (r >= 1 && r < 31 && this.mush[idx(c, r)]) { this.removeMush(c, r); this.emit('eat', c * T, r * T); }
      if ((sp.keep > 0 && sp.x >= 248) || (sp.keep < 0 && sp.x <= -8)) {
        this.spider = null;
        this.spiderTimer = 96;
        return;
      }
      if (this.touchesGun(sp.x, sp.y, 10, 7, 14)) this.die(sp);
    },
    // ------------------------------------------------------------------ night scorpion (upper field, poisons)
    stepScorp: function () {
      var s = this.scorp;
      if (!s) {
        if (this.flea || this.len > 10 || (this.frame & 255) !== 0 || !this.rng.chance(0.25)) return;
        var left = this.rng.chance(0.5), sp = this.score >= 20000 && this.rng.chance(0.75) ? 2 : 1;
        var r = this.rng.int(2, 17);
        this.scorp = { x: left ? 247 - sp : sp - 9, y: r * 8, dx: left ? -sp : sp, frame: 0 };
        this.emit('scorpIn', this.scorp.x, this.scorp.y);
        return;
      }
      s.x += s.dx;
      s.frame++;
      var c = hotCol(s.x), r = hotRow(s.y), i = idx(c, r);
      if (s.x >= 0 && s.x <= 239 && this.mush[i] && !this.poison[i]) {
        this.poison[i] = 1;
        this.emit('poison', c * T, r * T);
      }
      if ((s.dx > 0 && s.x > 255) || (s.dx < 0 && s.x < -16)) this.scorp = null;
    },

    // ------------------------------------------------------------------ one frame
    // input: { mx, my } movement in pixels, fire: held, bomb: pressed (Modern)
    step: function (input) {
      this.frame++;
      this.phaseT++;
      var slow = this.power.slow > 0 && (this.frame & 1);
      if (this.phase === 'play') {
        if (!slow) this.stepWorm();
        if (this.phase === 'play') {
          this.movePlayer(input.mx || 0, input.my || 0);
          if (!slow) this.stepSpider();
          if (this.phase === 'play') {
            this.stepShot(!!input.fire);
            if (this.modern) this.stepModern(input);
            if (!slow) { this.stepHeads(); this.stepScorp(); this.stepFlea(); }
          }
        }
      } else if (this.phase === 'clear') {
        // the worm is gone: a short breath, the other creatures go on
        this.movePlayer(input.mx || 0, input.my || 0);
        this.stepSpider();
        this.stepShot(!!input.fire);
        if (this.modern) this.stepModern(input);
        this.stepScorp();
        this.stepFlea();
        if (this.phase === 'clear' && this.phaseT >= (this.modern ? 40 : CFG.waveWait)) {
          this.phase = 'play';
          this.phaseT = 0;
          this.nextWave();
        }
      } else if (this.phase === 'dying') {
        if (this.phaseT >= CFG.deathWait) { this.phase = 'restore'; this.phaseT = 0; }
      } else if (this.phase === 'restore') {
        if (this.restoreDone) {
          if (this.phaseT - this.restoreDone >= 16) this.respawn();
        } else if (this.frame % CFG.restoreEvery === 0 && !this.restoreOne()) this.restoreDone = this.phaseT;
      }
      // short-lived pops (6 frames) and spider points (about two seconds)
      for (var i = this.pops.length - 1; i >= 0; i--) if (++this.pops[i].t > (this.pops[i].kind === 'score' ? 128 : 6)) this.pops.splice(i, 1);
    },
    die: function (who) {
      var p = this.player;
      this.phase = 'dying';
      this.phaseT = 0;
      this.restoreDone = 0;
      this.shot.flying = false;
      this.extra = [];
      this.scorp = null;
      // the creature that touched the spirit bursts with it
      if (!who) { /* a test or a timeout: nobody touched the spirit */ }
      else if (who === this.spider) { this.spider = null; this.pops.push({ x: who.x, y: who.y, t: 0, kind: 'pop' }); }
      else if (who === this.flea) { this.flea = null; this.pops.push({ x: who.x, y: who.y, t: 0, kind: 'pop' }); }
      else if (who && who.i !== undefined) {
        who.alive = false;
        this.liveCount--;
        if (who.i < 11 && this.slots[who.i + 1].alive && this.slots[who.i + 1].body) this.slots[who.i + 1].body = false;
        this.pops.push({ x: who.x, y: who.y, t: 0, kind: 'pop' });
      }
      this.drops = [];
      this.combo = 0; this.mult = 1;
      for (var k in this.power) this.power[k] = 0;
      this.emit('die', p.x, p.y);
    },
    // one damaged or poisoned mushroom grows back (5 points); column by column, bottom to top
    restoreOne: function () {
      for (var c = 0; c < COLS; c++) for (var r = ROWS - 1; r >= 1; r--) {
        var i = idx(c, r);
        if (this.mush[i] && (this.mush[i] < 4 || this.poison[i])) {
          this.mush[i] = 4; this.poison[i] = 0;
          this.addScore(5);
          this.emit('restore', c * T, r * T);
          this.pops.push({ x: c * T + 3, y: r * T, t: 0, kind: 'pop' });
          return true;
        }
      }
      return false;
    },
    // after a lost life the whole wave starts again from the top
    respawn: function () {
      if (this.lives <= 0) {
        this.phase = 'over';
        this.phaseT = 0;
        this.emit('over', 0, 0);
        return;
      }
      this.lives--;
      this.player.x = CFG.gunStartX; this.player.y = CFG.gunStartY;
      this.shot.flying = false;
      this.spider = null; this.flea = null; this.scorp = null;
      this.spiderTimer = CFG.spiderFirst;
      this.phase = 'play';
      this.phaseT = 0;
      this.setupWave();
      this.emit('resume', this.player.x, this.player.y);
    },

    // ------------------------------------------------------------------ Modern extras
    killScore: function (pts, x, y) {
      if (this.modern) {
        this.combo = this.comboT > 0 ? this.combo + 1 : 1;
        this.comboT = 75;
        var m = Math.min(8, 1 + Math.floor(this.combo / 6));
        if (m > this.mult) this.emit('combo', x, y, { mult: m });
        this.mult = m;
        pts *= m;
      }
      this.addScore(pts);
      return pts;
    },
    maybeDrop: function (x, y, chance) {
      if (!this.modern || this.drops.length >= 2 || !this.rng.chance(chance)) return;
      var kind = this.rng.pick(['triple', 'pierce', 'flies', 'slow', 'bomb', 'triple', 'flies']);
      this.drops.push({ x: MYX.clamp(x, 6, 233), y: Math.min(y, 232), kind: kind, t: 0 });
      this.emit('drop', x, y, { kind: kind });
    },
    stepModern: function (input) {
      var p = this.player, pw = this.power, i;
      for (var k in pw) if (pw[k] > 0) { pw[k]--; if (pw[k] === 0) this.emit('powerEnd', p.x, p.y, { kind: k }); }
      if (this.comboT > 0 && --this.comboT === 0) { this.combo = 0; this.mult = 1; }
      // drops float down into the zone and wait there a few seconds
      for (i = this.drops.length - 1; i >= 0; i--) {
        var d = this.drops[i];
        d.t++;
        if (d.y < 232) d.y += 0.6;
        if (Math.abs(d.x - p.x) < 10 && Math.abs(d.y - p.y) < 10) {
          this.drops.splice(i, 1);
          this.collect(d.kind, d.x, d.y);
          continue;
        }
        if (d.t > 60 * 10) this.drops.splice(i, 1);
      }
      // firefly helpers circle the spirit and shoot on their own
      if (pw.flies > 0) {
        for (var f = 0; f < 2; f++) {
          var a = this.frame * 0.09 + f * Math.PI;
          var fx = p.x + Math.cos(a) * 14, fy = p.y + 2 + Math.sin(a) * 6;
          this.flies[f] = { x: fx, y: fy };
          if ((this.frame + f * 9) % 18 === 0 && fx > 0 && fx < 239) this.extra.push({ x: Math.round(fx), fx: Math.round(fx), y: Math.round(fy) - 2, vx: 0, small: true });
        }
      } else this.flies.length = 0;
      for (i = this.extra.length - 1; i >= 0; i--) if (this.extra[i].y <= 5 || this.moveBolt(this.extra[i])) this.extra.splice(i, 1);
      if (input.bomb && this.bombs > 0 && this.phase === 'play') this.bomb();
    },
    collect: function (kind, x, y) {
      var dur = { triple: 600, pierce: 420, flies: 600, slow: 360 };
      if (kind === 'bomb') this.bombs = Math.min(3, this.bombs + 1);
      else this.power[kind] = dur[kind];
      this.addScore(50);
      this.emit('power', x, y, { kind: kind });
    },
    // the light bomb: every creature and every worm piece in the lower half is gone, all poison too
    bomb: function () {
      this.bombs--;
      var p = this.player;
      this.emit('bomb', p.x, p.y);
      for (var i = 11; i >= 0; i--) {
        var s = this.slots[i];
        if (s.alive && s.y >= 112) this.killSeg(s, 'bomb');
      }
      if (this.spider) this.killSpider(600);
      if (this.flea) this.killFlea();
      if (this.scorp) this.killScorp();
      for (var k = 0; k < this.poison.length; k++) this.poison[k] = 0;
    }
  };
})(MYX);
