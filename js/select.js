// Start page: logo over the glowing forest, two cards (Original / Modern), best scores, how to play, language
// and sound. Floating spores are drawn on a small canvas behind the cards.
'use strict';

(function (MYX) {
  var In = MYX.Input, Au = MYX.Audio;

  var S = MYX.Select = {
    el: null,
    sel: 0,
    spores: [],
    build: function () {
      var t = MYX.t;
      var el = document.createElement('div');
      el.id = 'select';
      el.className = 'menu-dom';
      el.innerHTML =
        '<canvas class="spores" aria-hidden="true"></canvas>' +
        '<div class="sel-inner">' +
        '  <header>' +
        '    <canvas class="logo" role="img" aria-label="MYCOLUX"></canvas>' +
        '    <p class="tagline"></p>' +
        '  </header>' +
        '  <div class="cards">' +
        '    <button type="button" class="card" data-mode="original">' +
        '      <span class="shot"><img src="assets/img/card_original.jpg" alt=""></span>' +
        '      <span class="ttl"></span><span class="sub"></span><span class="best"></span>' +
        '    </button>' +
        '    <button type="button" class="card" data-mode="modern">' +
        '      <span class="shot"><img src="assets/img/card_modern.jpg" alt=""></span>' +
        '      <span class="ttl"></span><span class="sub"></span><span class="best"></span>' +
        '    </button>' +
        '  </div>' +
        '  <div class="sel-bar">' +
        '    <button type="button" class="pill" data-act="how"></button>' +
        '    <button type="button" class="pill" data-act="lang">DE / EN</button>' +
        '    <button type="button" class="pill" data-act="mute"></button>' +
        '    <button type="button" class="pill" data-act="fullscreen">⛶</button>' +
        '  </div>' +
        '  <div class="how hidden"></div>' +
        '  <footer><p class="homage"></p><p class="remake"></p></footer>' +
        '</div>';
      document.getElementById('ui').appendChild(el);
      this.el = el;
      var self = this;
      Array.prototype.forEach.call(el.querySelectorAll('.card'), function (c, i) {
        c.addEventListener('click', function () { self.sel = i; self.choose(c.dataset.mode); });
        c.addEventListener('pointerenter', function () { self.sel = i; self.mark(); });
        var img = c.querySelector('img');
        img.addEventListener('error', function () { img.style.visibility = 'hidden'; });
      });
      Array.prototype.forEach.call(el.querySelectorAll('[data-act]'), function (b) {
        b.addEventListener('click', function () {
          var a = b.dataset.act;
          if (a === 'how') { el.querySelector('.how').classList.toggle('hidden'); Au.play('click'); return; }
          MYX.App.action(a);
          self.texts();
        });
      });
      this.canvas = el.querySelector('canvas.spores');
      this.logoCanvas = el.querySelector('canvas.logo');
      MYX.loadImage('assets/img/logo.jpg').then(function (img) {
        if (!img) return;
        var cv = MYX.glowLogo(img), lc = self.logoCanvas;
        lc.width = cv.width; lc.height = cv.height;
        lc.getContext('2d').drawImage(cv, 0, 0);
        lc.classList.add('ready');
      });
      this.texts();
    },
    texts: function () {
      if (!this.el) return;
      var t = MYX.t, el = this.el;
      el.querySelector('.tagline').textContent = t('tagline');
      var cards = el.querySelectorAll('.card');
      var names = ['original', 'modern'];
      for (var i = 0; i < cards.length; i++) {
        var n = names[i];
        cards[i].querySelector('.ttl').textContent = t(n === 'original' ? 'versionOriginal' : 'versionModern');
        cards[i].querySelector('.sub').textContent = t(n === 'original' ? 'versionOriginalSub' : 'versionModernSub');
        cards[i].querySelector('.best').textContent = t('best') + ' ' + MYX.Scores.best(n);
      }
      el.querySelector('[data-act=how]').textContent = t('howTitle');
      el.querySelector('[data-act=mute]').textContent = Au.muted ? '🔇' : '🔊';
      el.querySelector('.homage').textContent = t('homage');
      el.querySelector('.remake').textContent = 'MYCOLUX – ' + t('remake');
      el.querySelector('.how').innerHTML = ['howMove', 'howFire', 'howWorm', 'howCreatures', 'howKeys'].map(function (k) { return '<p>' + t(k) + '</p>'; }).join('');
      this.mark();
    },
    mark: function () {
      var cards = this.el.querySelectorAll('.card');
      for (var i = 0; i < cards.length; i++) cards[i].classList.toggle('on', i === this.sel);
    },
    choose: function (mode) {
      Au.unlock();
      Au.play('coin');
      MYX.App.go(mode);
    },
    enter: function () {
      if (!this.el) this.build();
      this.el.classList.remove('hidden');
      this.sel = MYX.Settings.get('lastMode') === 'modern' ? 1 : 0;
      this.texts();
      this.resize();
      Au.stopLoops();
      if (Au.musicPlaying()) Au.stopMusic(0.6);
    },
    exit: function () { if (this.el) this.el.classList.add('hidden'); },
    tick: function () {
      if (In.take('left') || In.take('up')) { this.sel = 0; this.mark(); Au.play('move'); }
      if (In.take('right') || In.take('down')) { this.sel = 1; this.mark(); Au.play('move'); }
      if (In.take('start') || In.take('fire')) this.choose(this.sel ? 'modern' : 'original');
      In.take('tap'); In.take('click'); In.take('back');
      this.tickSpores();
    },
    onAction: function (a) {
      if (a === 'menu') return true;
      if (a === 'lang' || a === 'mute') { var self = this; setTimeout(function () { self.texts(); }, 0); }
      return false;
    },
    // ---------------------------------------------------------------- glowing spores drifting up
    resize: function () {
      if (!this.canvas) return;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      this.canvas.width = Math.round(window.innerWidth * dpr);
      this.canvas.height = Math.round(window.innerHeight * dpr);
      this.dpr = dpr;
    },
    tickSpores: function () {
      var cw = this.canvas.width, ch = this.canvas.height, sp = this.spores;
      while (sp.length < 70) sp.push({ x: Math.random() * cw, y: ch + Math.random() * ch, v: 0.2 + Math.random() * 0.7, r: 0.6 + Math.random() * 2.2, ph: Math.random() * 6.28, hue: [185, 300, 40, 140][(Math.random() * 4) | 0] });
      for (var i = 0; i < sp.length; i++) {
        var s = sp[i];
        s.y -= s.v * this.dpr;
        s.ph += 0.02;
        s.x += Math.sin(s.ph) * 0.3 * this.dpr;
        if (s.y < -10) { s.y = ch + 10; s.x = Math.random() * cw; }
      }
    },
    render: function () {
      if (!this.canvas) return;
      var g = this.canvas.getContext('2d'), cw = this.canvas.width, ch = this.canvas.height;
      g.clearRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'lighter';
      for (var i = 0; i < this.spores.length; i++) {
        var s = this.spores[i], r = s.r * this.dpr, a = 0.35 + 0.35 * Math.sin(s.ph * 2);
        var grd = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, r * 4);
        grd.addColorStop(0, 'hsla(' + s.hue + ',100%,75%,' + a + ')');
        grd.addColorStop(1, 'hsla(' + s.hue + ',100%,60%,0)');
        g.fillStyle = grd;
        g.fillRect(s.x - r * 4, s.y - r * 4, r * 8, r * 8);
      }
      g.globalCompositeOperation = 'source-over';
    }
  };
})(MYX);
