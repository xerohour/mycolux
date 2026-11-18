// App shell: screens (start page, original, modern), fixed 60 Hz loop, fades, global keys, test switches.
'use strict';

(function (MYX) {
  var In = MYX.Input, Au = MYX.Audio;
  var TICK = MYX.TICK;

  var App = MYX.App = {
    modes: {},
    mode: null,
    modeName: '',
    acc: 0,
    last: 0,
    fade: 0,
    fadeDir: 0,
    pending: null,

    // tests: ?fast=4 runs the game four times as fast
    speed: Math.max(1, Math.min(16, Number((/[?&]fast=(\d+)/.exec(location.search) || [0, 1])[1]))),

    register: function (name, mode) { this.modes[name] = mode; },
    go: function (name) {
      if (this.pending || this.fadeDir > 0) return;
      this.pending = name;
      this.fadeDir = 1;
    },
    switchTo: function (name) {
      if (this.mode && this.mode.exit) this.mode.exit();
      this.mode = this.modes[name];
      this.modeName = name;
      document.body.dataset.mode = name;
      if (this.mode.enter) this.mode.enter();
      In.flush();
    },
    toast: function (text) {
      var t = this.toastEl;
      t.textContent = text;
      t.classList.add('show');
      clearTimeout(this.toastTimer);
      this.toastTimer = setTimeout(function () { t.classList.remove('show'); }, 1400);
    },
    toggleFullscreen: function () {
      var d = document, el = d.documentElement;
      if (d.fullscreenElement || d.webkitFullscreenElement) (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      else if (el.requestFullscreen) el.requestFullscreen().catch(function () {});
      else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    },

    // global keys, also used by the in-game menus
    action: function (a) {
      Au.unlock();
      if (a !== 'lang' && this.mode && this.mode.onAction && this.mode.onAction(a)) {
        if (a !== 'mute') return;
      }
      switch (a) {
        case 'mute': this.toast(MYX.t(Au.toggleMute() ? 'soundOff' : 'soundOn')); if (Au.muted) Au.stopLoops(); break;
        case 'fullscreen': this.toggleFullscreen(); break;
        case 'crt':
          MYX.Settings.set('crt', !MYX.Settings.get('crt'));
          this.toast(MYX.t(MYX.Settings.get('crt') ? 'crtOn' : 'crtOff'));
          break;
        case 'lang':
          MYX.I18n.toggle();
          this.toast(MYX.t('langName'));
          for (var k in this.modes) if (this.modes[k].texts) this.modes[k].texts();
          this.touchTexts();
          break;
        case 'menu':
          if (this.modeName !== 'select') this.go('select');
          break;
      }
    },
    touchTexts: function () {
      var b = document.querySelector('#touchbar [data-act=menu]');
      if (b) b.textContent = MYX.t('touchMenu');
    },

    frame: function (ts) {
      requestAnimationFrame(App.frame);
      var dt = (ts - App.last) / 1000;
      App.last = ts;
      if (!(dt > 0) || dt > 0.25) dt = TICK;
      if (Math.abs(dt - TICK) < 0.0025) dt = TICK;
      App.acc += dt * App.speed;
      var steps = 0, max = 5 * App.speed;
      while (App.acc >= TICK - 0.0005 && steps < max) {
        App.acc -= TICK;
        App.tick();
        steps++;
      }
      if (steps >= max) App.acc = 0;
      App.render(MYX.clamp(App.acc / TICK, 0, 1), dt);
    },
    tick: function () {
      In.poll();
      if (this.fadeDir > 0) {
        this.fade += 0.08;
        if (this.fade >= 1) { this.fade = 1; this.fadeDir = -1; this.switchTo(this.pending); this.pending = null; }
      } else if (this.fadeDir < 0) {
        this.fade -= 0.06;
        if (this.fade <= 0) { this.fade = 0; this.fadeDir = 0; }
      }
      if (this.mode && this.mode.tick && this.fadeDir <= 0) this.mode.tick();
    },
    render: function (alpha, dt) {
      this.fadeEl.style.opacity = this.fade;
      if (this.mode && this.mode.render) this.mode.render(alpha, dt);
    },
    resize: function () {
      for (var k in this.modes) if (this.modes[k].resize && (this.modes[k] === this.mode || k === 'original')) this.modes[k].resize();
    }
  };

  window.addEventListener('DOMContentLoaded', function () {
    App.ui = document.getElementById('ui');
    App.toastEl = document.getElementById('toast');
    App.fadeEl = document.getElementById('fade');
    var root = document.getElementById('app');

    In.bindSurface(root);
    In.onAction = function (a) { App.action(a); };
    Array.prototype.forEach.call(document.querySelectorAll('#touchbar [data-act]'), function (b) {
      b.addEventListener('pointerdown', function (e) { e.preventDefault(); e.stopPropagation(); App.action(b.dataset.act); });
    });
    App.touchTexts();

    // sound only after the first input (browser rule); keyboard focus after a click (arcade iframe)
    var unlock = function () { Au.unlock(); Au.flushLoads(); };
    window.addEventListener('pointerdown', unlock, true);
    window.addEventListener('keydown', unlock, true);
    root.addEventListener('pointerdown', function () { try { window.focus(); } catch (e) {} });

    window.addEventListener('resize', function () { App.resize(); });
    document.addEventListener('visibilitychange', function () {
      if (document.hidden && App.mode && App.mode.suspend) App.mode.suspend();
    });

    MYX.ModeOriginal.init();
    App.register('select', MYX.Select);
    App.register('original', MYX.ModeOriginal);
    if (MYX.ModeModern) { MYX.ModeModern.init(); App.register('modern', MYX.ModeModern); }
    else App.register('modern', MYX.ModeOriginal);

    App.switchTo('select');
    App.resize();

    // test switches: ?mode=original|modern skips the start page, ?autoplay starts a game, ?wave=5 starts there,
    // ?seed=123 fixes the randomness
    var q = location.search;
    var m = /[?&]mode=(original|modern)/.exec(q);
    if (/[?&]autoplay/.test(q)) MYX.autoplayStart = true;
    var w = /[?&]wave=(\d+)/.exec(q);
    if (w) MYX.startWave = Number(w[1]);
    var sd = /[?&]seed=(\d+)/.exec(q);
    if (sd) MYX.seed = Number(sd[1]);
    if (m) App.switchTo(m[1]);

    requestAnimationFrame(function (ts) {
      App.last = ts;
      requestAnimationFrame(App.frame);
    });
  });
})(MYX);
