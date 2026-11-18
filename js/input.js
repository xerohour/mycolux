// Input: keyboard, mouse (follow the pointer, or trackball with pointer lock), touch (drag anywhere like a
// trackball, the finger on the glass also fires), gamepad (stick = speed). Buttons are kept as "held" plus
// one-shot "pressed" edges that a mode takes. Movement sources are collected and read once per tick.
'use strict';

(function (MYX) {
  var KEYS = {
    ArrowLeft: ['left'], KeyA: ['left'],
    ArrowRight: ['right'], KeyD: ['right'],
    ArrowUp: ['up'], KeyW: ['up'],
    ArrowDown: ['down'], KeyS: ['down'],
    Space: ['fire'], ControlLeft: ['fire'], ControlRight: ['fire'], KeyK: ['fire'], KeyJ: ['fire'], KeyX: ['fire'],
    ShiftLeft: ['bomb'], ShiftRight: ['bomb'], KeyB: ['bomb'],
    Enter: ['start'], NumpadEnter: ['start'],
    Backspace: ['back']
  };
  var ACTIONS = { Escape: 'menu', KeyP: 'pause', KeyM: 'mute', KeyF: 'fullscreen', KeyC: 'crt', KeyL: 'lang' };

  var In = MYX.Input = {
    held: {},
    pressed: {},
    // relative movement in screen pixels since the last read (trackball, touch drag)
    rel: { x: 0, y: 0 },
    pointer: { x: 0, y: 0, active: false, moved: false, down: false, touch: false, id: null },
    touches: 0,
    stick: { x: 0, y: 0 },
    onAction: null,
    onChar: null,
    locked: false,
    wantLock: false,      // set by a mode while playing with the trackball mouse setting
    lastDevice: 'keys',

    press: function (name) {
      if (!this.held[name]) this.pressed[name] = true;
      this.held[name] = true;
    },
    release: function (name) { this.held[name] = false; },
    take: function (name) {
      if (this.pressed[name]) { this.pressed[name] = false; return true; }
      return false;
    },
    down: function (name) { return !!this.held[name]; },
    flush: function () {
      this.pressed = {};
      this.rel.x = this.rel.y = 0;
    },
    takeRel: function () {
      var r = { x: this.rel.x, y: this.rel.y };
      this.rel.x = this.rel.y = 0;
      return r;
    },
    fireHeld: function () {
      return this.down('fire') || this.down('padFire') || this.down('mouseFire') || this.touches > 0 || !!MYX.Settings.get('autofire');
    },

    // ------------------------------------------------------------------ keyboard
    keydown: function (e) {
      if (e.ctrlKey && (e.code === 'KeyR' || e.code === 'KeyF')) return;
      if (this.onChar && !e.repeat && (/^Key[A-Z]$/.test(e.code) || /^Digit\d$/.test(e.code))) {
        this.onChar(e.code.charAt(e.code.length - 1));
        e.preventDefault();
        return;
      }
      var a = ACTIONS[e.code];
      if (a) {
        if (!e.repeat && this.onAction) this.onAction(a);
        e.preventDefault();
        return;
      }
      var names = KEYS[e.code];
      if (!names) return;
      e.preventDefault();
      this.lastDevice = 'keys';
      this.pointer.moved = false;
      if (e.repeat) {
        for (var i = 0; i < names.length; i++) if (/^(up|down|left|right)$/.test(names[i])) this.pressed[names[i] + 'Rep'] = true;
        return;
      }
      for (var k = 0; k < names.length; k++) this.press(names[k]);
    },
    keyup: function (e) {
      var names = KEYS[e.code];
      if (!names) return;
      for (var i = 0; i < names.length; i++) this.release(names[i]);
    },

    // ------------------------------------------------------------------ mouse and touch on the game
    bindSurface: function (el) {
      var self = this, p = this.pointer, ids = {};
      this.surface = el;
      window.addEventListener('keydown', function (e) { self.keydown(e); });
      window.addEventListener('keyup', function (e) { self.keyup(e); });
      window.addEventListener('blur', function () { self.held = {}; self.touches = 0; ids = {}; });

      el.addEventListener('pointerdown', function (e) {
        if (e.target.closest && e.target.closest('#touchbar, button, input, select, .menu-dom')) return;
        if (e.pointerType !== 'mouse') {
          ids[e.pointerId] = { x: e.clientX, y: e.clientY };
          self.touches = Object.keys(ids).length;
          if (p.id === null || !p.down) { p.id = e.pointerId; p.x = e.clientX; p.y = e.clientY; }
          p.touch = true; p.down = true; p.active = true;
          self.lastDevice = 'touch';
          self.press('tap');
          try { el.setPointerCapture(e.pointerId); } catch (err) {}
          e.preventDefault();
          return;
        }
        p.touch = false; p.x = e.clientX; p.y = e.clientY; p.active = true;
        self.lastDevice = 'mouse';
        if (e.button === 0) { self.press('mouseFire'); self.press('click'); }
        if (e.button === 2) self.press('bomb');
        if (self.wantLock && MYX.Settings.get('mouse') === 'ball' && !self.locked && el.requestPointerLock) {
          try { var r = el.requestPointerLock(); if (r && r.catch) r.catch(function () {}); } catch (err) {}
        }
      });
      window.addEventListener('pointermove', function (e) {
        if (e.pointerType === 'mouse') {
          if (self.locked) {
            self.rel.x += e.movementX || 0;
            self.rel.y += e.movementY || 0;
            self.lastDevice = 'mouse';
            return;
          }
          if (Math.abs(e.clientX - p.x) + Math.abs(e.clientY - p.y) > 1) { p.moved = true; self.lastDevice = 'mouse'; }
          p.touch = false; p.active = true;
          p.x = e.clientX; p.y = e.clientY;
          return;
        }
        var t = ids[e.pointerId];
        if (!t) return;
        // the first finger steers like a trackball; every finger counts for fire
        if (e.pointerId === p.id) {
          self.rel.x += e.clientX - t.x;
          self.rel.y += e.clientY - t.y;
          p.x = e.clientX; p.y = e.clientY;
        }
        t.x = e.clientX; t.y = e.clientY;
      });
      var up = function (e) {
        if (e.pointerType === 'mouse') {
          if (e.button === 0) self.release('mouseFire');
          if (e.button === 2) self.release('bomb');
          return;
        }
        delete ids[e.pointerId];
        self.touches = Object.keys(ids).length;
        if (e.pointerId === p.id) {
          var rest = Object.keys(ids);
          if (rest.length) { p.id = Number(rest[0]); } else { p.id = null; p.down = false; }
        }
      };
      window.addEventListener('pointerup', up);
      window.addEventListener('pointercancel', up);
      el.addEventListener('contextmenu', function (e) { e.preventDefault(); });
      el.addEventListener('touchmove', function (e) { if (self.wantLock) e.preventDefault(); }, { passive: false });
      document.addEventListener('pointerlockchange', function () {
        self.locked = document.pointerLockElement === el;
      });
    },
    releaseLock: function () {
      if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock();
    },

    // ------------------------------------------------------------------ gamepad
    padPrev: {},
    poll: function () {
      var pads = navigator.getGamepads ? navigator.getGamepads() : [];
      var gp = null;
      for (var i = 0; i < pads.length; i++) if (pads[i] && pads[i].connected) { gp = pads[i]; break; }
      if (!gp) { this.stick.x = this.stick.y = 0; return; }
      var b = function (n) { return !!(gp.buttons[n] && (gp.buttons[n].pressed || gp.buttons[n].value > 0.5)); };
      var ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
      var dz = function (v) { return Math.abs(v) < 0.18 ? 0 : (v - MYX.sign(v) * 0.18) / 0.82; };
      this.stick.x = dz(ax);
      this.stick.y = dz(ay);
      var st = {
        left: b(14) || ax < -0.5, right: b(15) || ax > 0.5,
        up: b(12) || ay < -0.5, down: b(13) || ay > 0.5,
        padFire: b(0) || b(2) || b(5) || b(7),
        bomb: b(1) || b(4) || b(6),
        start: b(9) || b(0)
      };
      var prev = this.padPrev, any = false;
      for (var k in st) {
        if (st[k] && !prev[k]) { this.pressed[k] = true; any = true; }
        if (st[k] !== !!prev[k]) this.held[k] = st[k];
      }
      if (st.padFire && !prev.padFire) this.pressed.fire = true;
      if (b(9) && !prev.pause && this.onAction) this.onAction('pause');
      if (b(8) && !prev.menu && this.onAction) this.onAction('menu');
      st.pause = b(9); st.menu = b(8);
      if (any || this.stick.x || this.stick.y) { this.lastDevice = 'pad'; this.pointer.moved = false; }
      this.padPrev = st;
    }
  };
})(MYX);
