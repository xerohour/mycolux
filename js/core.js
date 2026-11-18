// MYCOLUX – namespace, constants, small helpers, persistent settings.
'use strict';

var MYX = window.MYX = {
  VERSION: '1.0.0',
  // the playfield of the 1981 cabinet: 240 x 256 pixels, 30 x 32 tiles of 8 x 8 (portrait monitor)
  W: 240,
  H: 256,
  T: 8,
  COLS: 30,
  ROWS: 32,
  TICK: 1 / 60
};

(function (MYX) {
  MYX.clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  MYX.lerp = function (a, b, t) { return a + (b - a) * t; };
  MYX.sign = function (v) { return v < 0 ? -1 : v > 0 ? 1 : 0; };
  MYX.smooth = function (t) { t = MYX.clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  MYX.TAU = Math.PI * 2;

  MYX.pad = function (n, len, ch) {
    var s = String(n);
    while (s.length < len) s = (ch || '0') + s;
    return s;
  };
  MYX.num = function (n) { return String(Math.max(0, Math.floor(n))); };

  // deterministic random generator (mulberry32): the same seed plays out the same way
  MYX.Rng = function (seed) { this.s = (seed >>> 0) || 1; };
  MYX.Rng.prototype.next = function () {
    var t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  MYX.Rng.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  MYX.Rng.prototype.int = function (a, b) { return a + Math.floor(this.next() * (b - a + 1)); };
  MYX.Rng.prototype.chance = function (p) { return this.next() < p; };
  MYX.Rng.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };

  // localStorage that never throws (private mode, iframes with blocked storage …)
  var mem = {};
  MYX.Store = {
    get: function (key, fallback) {
      try {
        var v = window.localStorage.getItem('mycolux.' + key);
        if (v !== null) return JSON.parse(v);
      } catch (e) {
        if (key in mem) return mem[key];
      }
      return fallback;
    },
    set: function (key, value) {
      mem[key] = value;
      try { window.localStorage.setItem('mycolux.' + key, JSON.stringify(value)); } catch (e) {}
    },
    remove: function (key) {
      delete mem[key];
      try { window.localStorage.removeItem('mycolux.' + key); } catch (e) {}
    }
  };

  // user settings, saved
  MYX.Settings = {
    data: null,
    defaults: {
      lang: null,          // null = browser language
      muted: false,
      musicVol: 0.8,
      sfxVol: 0.9,
      crt: true,           // original: scanlines and glow of the raster monitor
      bezel: true,         // cabinet frame around the original version on wide screens
      autofire: false,     // fire is held for you
      mouse: 'follow',     // follow: the spirit runs to the pointer | ball: mouse moves like a trackball (pointer lock)
      sens: 1,             // trackball / touch sensitivity
      quality: 'auto',     // modern: auto | high | low
      shake: true,         // modern: screen shake
      bloom: 0.5,          // modern: bloom strength 0..1 (0.5 = as designed, 0 = off)
      voice: true,         // modern: the announcer
      menuSong: false,     // modern: the title song with vocals in the menu instead of the instrumental
      lastMode: 'original'
    },
    load: function () {
      var d = MYX.Store.get('settings', {}) || {};
      this.data = {};
      for (var k in this.defaults) this.data[k] = (k in d) ? d[k] : this.defaults[k];
    },
    get: function (k) { return this.data[k]; },
    set: function (k, v) {
      this.data[k] = v;
      MYX.Store.set('settings', this.data);
    }
  };
  MYX.Settings.load();

  MYX.isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
  MYX.inFrame = (function () { try { return window.self !== window.top; } catch (e) { return true; } })();

  // picture on black -> canvas with real transparency (brightness becomes coverage), e.g. for the logo
  MYX.lumaKey = function (img, lo, gain, maxW) {
    var w = img.naturalWidth || img.width, h = img.naturalHeight || img.height, k = Math.min(1, (maxW || 1600) / w);
    var cv = document.createElement('canvas');
    cv.width = Math.round(w * k);
    cv.height = Math.round(h * k);
    var g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(img, 0, 0, cv.width, cv.height);
    try {
      var id = g.getImageData(0, 0, cv.width, cv.height), d = id.data;
      lo = lo === undefined ? 14 : lo;
      gain = gain || 2.6;
      for (var i = 0; i < d.length; i += 4) {
        var m = Math.max(d[i], d[i + 1], d[i + 2]);
        var a = Math.min(1, Math.max(0, (m - lo) / 255 * gain));
        if (a <= 0) { d[i + 3] = 0; continue; }
        var c = Math.max(a, m / 255);
        d[i] = Math.min(255, d[i] / c);
        d[i + 1] = Math.min(255, d[i + 1] / c);
        d[i + 2] = Math.min(255, d[i + 2] / c);
        d[i + 3] = Math.round(c * 255);
      }
      g.putImageData(id, 0, 0);
    } catch (e) { /* file:// pages may not read pixels; the picture stays as it is */ }
    return cv;
  };

  // a keyed logo with its own soft glow baked in (CSS filters on big canvases are slow or fail on some GPUs)
  MYX.glowLogo = function (img) {
    var key = MYX.lumaKey(img, 10, 2.2, 1600), pad = Math.round(key.width * 0.04);
    var cv = document.createElement('canvas');
    cv.width = key.width + pad * 2; cv.height = key.height + pad * 2;
    var g = cv.getContext('2d');
    g.filter = 'blur(' + Math.round(key.width / 70) + 'px)';
    g.globalAlpha = 0.7;
    g.drawImage(key, pad, pad);
    g.filter = 'none';
    g.globalAlpha = 1;
    g.drawImage(key, pad, pad);
    return cv;
  };

  // loads an image, resolves with null if it fails (the game runs without pictures)
  MYX.loadImage = function (src) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () { resolve(img); };
      img.onerror = function () { resolve(null); };
      img.src = src;
    });
  };
})(MYX);
