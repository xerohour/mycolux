// MYCOLUX Original – draws the game on a 240 x 256 pixel picture like the 1981 raster board, then shows it on a
// 3:4 portrait monitor (every pixel 4 wide and 5 tall), with optional scanlines and glow (key C).
'use strict';

(function (MYX) {
  var W = MYX.W, H = MYX.H, T = MYX.T;
  var SX = 4, SY = 5;                 // pixel aspect of the portrait monitor: 960 x 1280 = 3:4

  var V = MYX.ViewOriginal = {
    cv: null, g: null,                // the 240 x 256 picture
    big: null, bg: null,              // the 960 x 1280 monitor picture
    out: null, og: null,              // the canvas on the page
    cache: {},

    init: function (canvas) {
      this.out = canvas;
      this.og = canvas.getContext('2d');
      this.cv = document.createElement('canvas');
      this.cv.width = W; this.cv.height = H;
      this.g = this.cv.getContext('2d');
      this.big = document.createElement('canvas');
      this.big.width = W * SX; this.big.height = H * SY;
      this.bg = this.big.getContext('2d');
      this.bg.imageSmoothingEnabled = false;
      // a small copy for the phosphor glow (scaled up soft; no canvas filter needed)
      this.soft = document.createElement('canvas');
      this.soft.width = W / 4; this.soft.height = H / 4;
      this.sg = this.soft.getContext('2d');
      this.scan = this.makeScanlines();
      this.n = 0;
      this.dark = 0;
    },
    // some browsers lose their GPU canvas (Firefox with broken graphics acceleration shows a black screen):
    // if the monitor stays black although the score line was drawn, the pictures move to memory canvases
    selfCheck: function () {
      var d;
      try { d = this.og.getImageData(0, 0, W * SX, T * SY).data; } catch (e) { return; }
      for (var i = 0; i < d.length; i += 16) if (d[i] + d[i + 1] + d[i + 2] > 40) { this.dark = 0; this.verified = true; return; }
      if (++this.dark >= 3) this.software();
    },
    software: function () {
      var old = this.out, c = document.createElement('canvas');
      c.id = old.id;
      c.className = old.className;
      c.setAttribute('aria-label', old.getAttribute('aria-label') || '');
      c.width = W * SX; c.height = H * SY;
      old.parentNode.replaceChild(c, old);
      this.out = c;
      this.og = c.getContext('2d', { willReadFrequently: true });
      this.big = document.createElement('canvas');
      this.big.width = W * SX; this.big.height = H * SY;
      this.bg = this.big.getContext('2d', { willReadFrequently: true });
      this.scanPat = null;
      this.verified = true;
      MYX.softCanvas = true;
      if (this.onSwap) this.onSwap(c);
    },

    // ---------------------------------------------------------------- sprite cache
    // rows of characters + colour map -> small canvas
    sprite: function (key, rows, colors) {
      var c = this.cache[key];
      if (c) return c;
      var h = rows.length, w = rows[0].length;
      c = document.createElement('canvas');
      c.width = w; c.height = h;
      var g = c.getContext('2d');
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var ch = rows[y].charAt(x);
        if (ch === '.' || !colors[ch]) continue;
        g.fillStyle = colors[ch];
        g.fillRect(x, y, 1, 1);
      }
      this.cache[key] = c;
      return c;
    },
    mushSprite: function (pal, pi, hp, poisoned) {
      var key = 'm' + pi + hp + (poisoned ? 'p' : '');
      if (this.cache[key]) return this.cache[key];
      var rows = MYX.SPR.mush.slice(0, MYX.MUSH_ROWS[hp]);
      var col = poisoned ? { a: pal.b, c: pal.a } : { a: pal.a, c: pal.c };
      return this.sprite(key, rows, col);
    },
    glyph: function (ch, color) {
      var key = 'f' + ch + color;
      var c = this.cache[key];
      if (c) return c;
      var rows = MYX.glyph(ch);
      c = document.createElement('canvas');
      c.width = 8; c.height = 8;
      var g = c.getContext('2d');
      g.fillStyle = color;
      // chunky: every pixel of the 5 x 7 font is drawn two wide
      for (var y = 0; y < 7; y++) for (var x = 0; x < 5; x++) if (rows[y] & (16 >> x)) g.fillRect(x + 1, y, 2, 1);
      this.cache[key] = c;
      return c;
    },
    text: function (s, x, y, color, scale) {
      var g = this.g;
      s = String(s);
      scale = scale || 1;
      for (var i = 0; i < s.length; i++) {
        var ch = s.charAt(i);
        if (ch !== ' ') g.drawImage(this.glyph(ch, color), x + i * 8 * scale, y, 8 * scale, 8 * scale);
      }
    },
    center: function (s, y, color, scale) {
      scale = scale || 1;
      this.text(s, Math.round((W - String(s).length * 8 * scale) / 2), y, color, scale);
    },

    palette: function (wave) {
      var n = MYX.PALETTES.length, pi = ((wave % n) + n) % n;
      return { pal: MYX.PALETTES[pi], pi: pi };
    },

    // ---------------------------------------------------------------- the playfield
    drawField: function (game, opt) {
      opt = opt || {};
      var g = this.g, P = this.palette(game.wave), pal = P.pal, pi = P.pi, SPR = MYX.SPR;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, H);
      // mushrooms
      var cols = MYX.COLS, rows = MYX.ROWS;
      for (var r = 1; r < rows; r++) for (var c = 0; c < cols; c++) {
        var i = r * cols + c, hp = game.mush[i];
        if (hp) g.drawImage(this.mushSprite(pal, pi, hp, game.poison[i]), c * T, r * T);
      }
      // moving things are invisible in the score row
      g.save();
      g.beginPath();
      g.rect(0, T, W, H - T);
      g.clip();
      // the worm
      for (var s = 11; s >= 0; s--) {
        var sg = game.slots[s];
        if (!sg.alive) continue;
        var fr = (sg.leg >> 1) & 3;
        if (!sg.body) g.drawImage(this.sprite('h' + pi + (sg.dx > 0 ? 'R' : 'L') + fr, sg.dx > 0 ? SPR.headR[fr] : SPR.headL[fr], pal), sg.x - 3, sg.y);
        else g.drawImage(this.sprite('b' + pi + fr, SPR.body[fr], pal), sg.x - 3, sg.y);
      }
      // creatures
      if (game.flea) g.drawImage(this.sprite('fl' + pi + ((game.flea.frame >> 2) & 1), SPR.beetle[(game.flea.frame >> 2) & 1], pal), game.flea.x - 4, game.flea.y);
      if (game.spider) g.drawImage(this.sprite('sp' + pi + ((game.spider.frame >> 2) & 1), SPR.spider[(game.spider.frame >> 2) & 1], pal), game.spider.x - 7, game.spider.y);
      if (game.scorp) {
        var sf = (game.scorp.frame >> 2) & 1, sr = game.scorp.dx > 0;
        g.drawImage(this.sprite('sc' + pi + (sr ? 'R' : 'L') + sf, sr ? SPR.scorpR[sf] : SPR.scorpL[sf], pal), game.scorp.x - 8, game.scorp.y);
      }
      // the spirit with its bolt (a loaded bolt pokes out of the lantern)
      var p = game.player, px = Math.floor(p.x), py = Math.floor(p.y);
      g.fillStyle = pal.c;
      if (game.phase === 'play' || game.phase === 'clear') {
        g.fillRect(game.shot.x, game.shot.y + 2, 1, MYX.CFG.shotLen);
        for (var e = 0; e < game.extra.length; e++) g.fillRect(game.extra[e].x, game.extra[e].y + 2, 1, MYX.CFG.shotLen);
        g.drawImage(this.sprite('pl' + pi, SPR.spirit, pal), px - 3, py);
      } else if (game.phase === 'dying' && game.phaseT < 32) {
        var df = Math.min(3, Math.floor(game.phaseT / 8));
        g.drawImage(this.sprite('d' + pi + df, SPR.death[df], pal), px - 8, py - 4);
      }
      // pops and spider points
      for (var k = 0; k < game.pops.length; k++) {
        var po = game.pops[k];
        if (po.kind === 'score') { if (po.t >= 0) this.text(String(po.pts), Math.round(po.x) - String(po.pts).length * 4, po.y, pal.c); }
        else g.drawImage(this.sprite('pop' + pi + Math.min(2, po.t >> 1), SPR.pop[Math.min(2, po.t >> 1)], pal), Math.round(po.x) - 3, po.y);
      }
      g.restore();
      if (!opt.noHud) this.drawHud(game, pal, pi);
    },
    // row 0: score (columns 0-5), reserve lives (6-11), high score (12-17), all in colour C
    drawHud: function (game, pal, pi) {
      var g = this.g;
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, T);
      this.text(game.hudText(game.score), 0, 0, pal.c);
      var icon = this.sprite('life' + pi, MYX.SPR.spirit, pal);
      for (var i = 0; i < Math.min(game.lives, 6); i++) g.drawImage(icon, 48 + i * 8, 0);
      this.text(game.hudText(Math.max(game.hiscore || 0, game.score)), 96, 0, pal.c);
    },

    // ---------------------------------------------------------------- on the monitor
    makeScanlines: function () {
      var c = document.createElement('canvas');
      c.width = 4; c.height = SY;
      var g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0)';
      g.fillRect(0, 0, 4, SY);
      g.fillStyle = 'rgba(0,0,0,0.38)';
      g.fillRect(0, SY - 1, 4, 1);
      g.fillStyle = 'rgba(0,0,0,0.12)';
      g.fillRect(0, 0, 4, 1);
      return c;
    },
    present: function () {
      var crt = MYX.Settings.get('crt');
      var bg = this.bg;
      bg.globalCompositeOperation = 'source-over';
      bg.imageSmoothingEnabled = false;
      bg.drawImage(this.cv, 0, 0, W * SX, H * SY);
      if (crt) {
        if (!this.scanPat) this.scanPat = bg.createPattern(this.scan, 'repeat');
        bg.fillStyle = this.scanPat;
        bg.fillRect(0, 0, W * SX, H * SY);
      }
      var o = this.out, og = this.og;
      if (o.width !== W * SX) { o.width = W * SX; o.height = H * SY; }
      og.globalCompositeOperation = 'source-over';
      og.imageSmoothingEnabled = true;
      og.drawImage(this.big, 0, 0);
      if (crt) {
        // phosphor glow: a quarter-size copy, scaled up soft and added on top
        var sg = this.sg;
        sg.imageSmoothingEnabled = true;
        sg.clearRect(0, 0, W / 4, H / 4);
        sg.drawImage(this.cv, 0, 0, W / 4, H / 4);
        og.globalCompositeOperation = 'lighter';
        og.globalAlpha = 0.6;
        og.drawImage(this.soft, 0, 0, W * SX, H * SY);
        og.globalAlpha = 1;
        og.globalCompositeOperation = 'source-over';
      }
      this.n++;
      if (!this.verified && this.n % 30 === 0 && this.n <= 900) this.selfCheck();
    }
  };
})(MYX);
