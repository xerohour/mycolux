// Modern version: three.js and the 3D renderer are ES modules (js/modern/), loaded on demand when the modern
// version is chosen. This stand-in loads them and hands every call through.
'use strict';

(function (MYX) {
  var M = MYX.ModeModern = {
    impl: null,
    loading: null,
    init: function () {},
    load: function () {
      if (this.loading) return this.loading;
      var self = this;
      this.loading = import('./modern/mode.js').then(function (mod) {
        self.impl = new mod.ModernMode();
        return self.impl;
      });
      return this.loading;
    },
    enter: function () {
      var self = this;
      if (this.impl) { this.impl.enter(); return; }
      var cover = document.createElement('div');
      cover.id = 'modern-loading';
      cover.textContent = MYX.t('loading');
      MYX.App.ui.appendChild(cover);
      this.load().then(function (impl) {
        if (cover.parentNode) cover.parentNode.removeChild(cover);
        if (MYX.App.mode === M) impl.enter();
      }).catch(function (e) {
        // usually no WebGL 2 right now (graphics acceleration off or hung): explain, offer the Original, allow a retry
        console.error(e);
        self.loading = null;
        self.impl = null;
        cover.className = 'fail';
        cover.innerHTML = '<div><h2></h2><p class="why"></p><p class="err"></p><div class="btns"><button type="button" data-go="original"></button><button type="button" data-go="select"></button></div></div>';
        cover.querySelector('h2').textContent = MYX.t('modernFail');
        cover.querySelector('.why').textContent = MYX.t('modernFailHelp');
        cover.querySelector('.err').textContent = String(e && e.message || e);
        cover.querySelector('[data-go=original]').textContent = MYX.t('modernFailOriginal');
        cover.querySelector('[data-go=select]').textContent = MYX.t('modernFailBack');
        Array.prototype.forEach.call(cover.querySelectorAll('button'), function (b) {
          b.addEventListener('click', function () { MYX.App.go(b.dataset.go); });
        });
      });
    },
    exit: function () { if (this.impl) this.impl.exit(); var c = document.getElementById('modern-loading'); if (c && c.parentNode) c.parentNode.removeChild(c); },
    tick: function () { if (this.impl && MYX.App.mode === M) this.impl.tick(); },
    render: function (a, dt) { if (this.impl && MYX.App.mode === M) this.impl.render(a, dt); },
    resize: function () { if (this.impl) this.impl.resize(); },
    texts: function () { if (this.impl) this.impl.texts(); },
    suspend: function () { if (this.impl) this.impl.suspend(); },
    onAction: function (a) {
      return this.impl ? this.impl.onAction(a) : (a === 'menu' ? (MYX.App.go('select'), true) : false);
    }
  };
})(MYX);
