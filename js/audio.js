// Audio: Web Audio with samples (OGG or MP3) in two sets (original / modern), a voice limit, seamless music
// loops (loop points from music_meta.js), continuous creature sounds (spider, beetle, scorpion), an analyser
// that the modern version reads, and a small sound-chip synthesizer in the manner of the 1981 boards
// (square waves, stepped noise). The synthesizer is the Original's default sound and the stand-in for every
// missing sample. Sound starts after the first input (browser rule).
'use strict';

(function (MYX) {
  var ctx = null, master, comp, musicBus, sfxBus, analyser = null, freq = null;
  var buffers = {}, pending = {}, voices = [], loops = {};
  var music = null, musicName = null;
  var unlocked = false;
  var MAX_VOICES = 16;
  var PER_SOUND = { _: 3, shot: 2, mush: 3, pop: 4, restore: 2, march: 2, move: 2, click: 2 };

  var A = MYX.Audio = {
    muted: MYX.Settings.get('muted'),
    ready: false,
    ext: null,
    soundSet: 'original',
    chip: true,          // original: the synthesized sound chip (Modern plays the recorded effects)

    unlock: function () {
      if (unlocked) { if (ctx && ctx.state === 'suspended') ctx.resume(); return; }
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try { ctx = new AC({ latencyHint: 'interactive' }); } catch (e) { ctx = new AC(); }
      unlocked = true;
      comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -10; comp.knee.value = 8; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.18;
      master = ctx.createGain();
      master.gain.value = this.muted ? 0 : 1;
      musicBus = ctx.createGain();
      sfxBus = ctx.createGain();
      analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.72;
      freq = new Uint8Array(analyser.frequencyBinCount);
      this.applyVolumes();
      musicBus.connect(analyser);
      musicBus.connect(master); sfxBus.connect(master); master.connect(comp); comp.connect(ctx.destination);
      var probe = document.createElement('audio');
      this.ext = probe.canPlayType && probe.canPlayType('audio/ogg; codecs="vorbis"') ? 'ogg' : 'mp3';
      this.ready = true;
      if (ctx.state === 'suspended') ctx.resume();
      if (this.onUnlock) this.onUnlock();
    },
    context: function () { return ctx; },
    now: function () { return ctx ? ctx.currentTime : 0; },
    applyVolumes: function () {
      if (!ctx) return;
      musicBus.gain.value = MYX.Settings.get('musicVol') * 0.8;
      sfxBus.gain.value = MYX.Settings.get('sfxVol');
    },
    toggleMute: function () {
      this.muted = !this.muted;
      MYX.Settings.set('muted', this.muted);
      if (master) master.gain.setTargetAtTime(this.muted ? 0 : 1, ctx.currentTime, 0.02);
      return this.muted;
    },
    useSet: function (set) {
      this.soundSet = set;
      this.chip = set === 'original';
      this.stopLoops();
    },

    // loads samples: list of [name, pathWithoutExtension]
    load: function (list) {
      var self = this;
      if (!ctx) { this.toLoad = (this.toLoad || []).concat(list); return Promise.resolve(); }
      return Promise.all(list.map(function (it) {
        var name = it[0], url = it[1] + '.' + self.ext;
        if (buffers[name] !== undefined || pending[name]) return pending[name];
        pending[name] = fetch(url).then(function (r) { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); })
          .then(function (ab) { return new Promise(function (res, rej) { ctx.decodeAudioData(ab, res, rej); }); })
          .then(function (buf) { buffers[name] = buf; }).catch(function () { buffers[name] = null; });
        return pending[name];
      }));
    },
    flushLoads: function () {
      if (this.toLoad && ctx) { var l = this.toLoad; this.toLoad = null; return this.load(l); }
      return Promise.resolve();
    },
    sample: function (name) {
      if (this.chip) return null;
      return buffers[this.soundSet + ':' + name] || null;
    },

    // a sound effect; falls back to the synthesizer
    play: function (name, opt) {
      if (!ctx || this.muted) return null;
      opt = opt || {};
      var buf = this.sample(name);
      var limit = opt.limit || PER_SOUND[name] || PER_SOUND._;
      var same = voices.filter(function (v) { return v.name === name; });
      if (same.length >= limit) stop(same[0]);
      if (voices.length >= MAX_VOICES) stop(voices[0]);
      var t = ctx.currentTime, g = ctx.createGain();
      g.gain.value = opt.vol === undefined ? 1 : opt.vol;
      var out = g;
      if (opt.pan && ctx.createStereoPanner) {
        var p = ctx.createStereoPanner();
        p.pan.value = MYX.clamp(opt.pan, -1, 1);
        g.connect(p);
        out = p;
      }
      out.connect(sfxBus);
      var v = { name: name, gain: g, nodes: [], end: t + 2 };
      if (buf) {
        var src = ctx.createBufferSource();
        src.buffer = buf;
        if (opt.rate) src.playbackRate.value = opt.rate;
        src.connect(g);
        src.start(t);
        v.nodes.push(src);
        v.end = t + buf.duration / (opt.rate || 1);
        src.onended = function () { remove(v); };
      } else if (Synth[name]) {
        v.end = t + Synth[name](g, t, opt) + 0.05;
        v.nodes = g._nodes || [];
      } else return null;
      voices.push(v);
      return v;
    },

    // ---------------------------------------------------------------- continuous sounds
    // setLoop(name, on, param): param 0..1 bends the sound (spider height, beetle fall, …)
    setLoop: function (name, on, param) {
      if (!ctx) return;
      var l = loops[name];
      if (!on || this.muted) {
        if (l) { delete loops[name]; l.stop(); }
        return;
      }
      if (!l) {
        var buf = this.sample('loop_' + name);
        l = loops[name] = buf ? sampleLoop(buf) : (LoopSynth[name] ? LoopSynth[name]() : null);
        if (!l) { delete loops[name]; return; }
      }
      if (l.set) l.set(param || 0);
    },
    stopLoops: function () {
      for (var k in loops) { loops[k].stop(); delete loops[k]; }
    },

    // ---------------------------------------------------------------- music
    playMusic: function (name, opt) {
      opt = opt || {};
      if (!ctx) return;
      if (musicName === name && music && !opt.restart) return;
      this.stopMusic(opt.fadeOut !== undefined ? opt.fadeOut : 0.5);
      musicName = name;
      var buf = buffers[name], t = ctx.currentTime, g = ctx.createGain();
      g.connect(musicBus);
      var vol = opt.vol === undefined ? 1 : opt.vol;
      if (opt.fadeIn) { g.gain.value = 0; g.gain.linearRampToValueAtTime(vol, t + opt.fadeIn); } else g.gain.value = vol;
      var meta = (MYX.MusicMeta || {})[name] || {};
      if (buf) {
        var src = ctx.createBufferSource();
        src.buffer = buf;
        src.loop = !!opt.loop;
        var ls = 0, le = buf.duration;
        if (opt.loop) {
          ls = meta.loopStart || 0;
          le = meta.loopEnd && meta.loopEnd <= buf.duration + 0.01 ? Math.min(meta.loopEnd, buf.duration) : buf.duration;
          var extra = buf.duration - (meta.seconds || buf.duration);
          if (extra > 0.001 && meta.startOffset) { var off = Math.min(meta.startOffset, extra); ls += off; le += off; }
          src.loopStart = ls; src.loopEnd = le;
        }
        src.connect(g);
        var t0 = t + 0.01;
        src.start(t0, opt.from || 0);
        music = { src: src, gain: g, name: name, t0: t0 - (opt.from || 0), loopStart: ls, loopEnd: le, loop: !!opt.loop, bpm: meta.bpm || 0, beat0: meta.beat0 || 0 };
        src.onended = function () { if (music && music.src === src) { music = null; musicName = null; if (opt.onEnd) opt.onEnd(); } };
      } else {
        music = null; musicName = null;
        if (opt.onEnd) setTimeout(opt.onEnd, 10);
      }
    },
    stopMusic: function (fade) {
      if (!music || !ctx) { musicName = null; return; }
      var m = music, t = ctx.currentTime;
      music = null; musicName = null;
      fade = fade === undefined ? 0.4 : fade;
      m.gain.gain.cancelScheduledValues(t);
      m.gain.gain.setValueAtTime(m.gain.gain.value, t);
      m.gain.gain.linearRampToValueAtTime(0, t + Math.max(0.01, fade));
      setTimeout(function () {
        try { if (m.src) m.src.stop(); } catch (e) {}
        try { m.gain.disconnect(); } catch (e) {}
      }, fade * 1000 + 80);
    },
    musicPlaying: function () { return musicName; },
    hasBuffer: function (name) { return !!buffers[name]; },
    musicClock: function () {
      if (!music || !ctx) return null;
      var p = ctx.currentTime - music.t0;
      if (music.loop && p > music.loopEnd) p = music.loopStart + (p - music.loopStart) % (music.loopEnd - music.loopStart);
      var bpm = music.bpm || 0, beat = bpm ? (p - music.beat0) * bpm / 60 : 0;
      return { pos: p, bpm: bpm, beat: beat, phase: beat - Math.floor(beat) };
    },
    spectrum: function (n, out) {
      out = out || new Float32Array(n);
      if (!analyser) { for (var z = 0; z < n; z++) out[z] = 0; return out; }
      analyser.getByteFrequencyData(freq);
      var bins = freq.length, lo = 2, hi = bins * 0.7;
      for (var i = 0; i < n; i++) {
        var a = Math.floor(lo * Math.pow(hi / lo, i / n)), b = Math.max(a + 1, Math.floor(lo * Math.pow(hi / lo, (i + 1) / n)));
        var s = 0;
        for (var k = a; k < b; k++) s += freq[k];
        out[i] = s / ((b - a) * 255);
      }
      return out;
    },
    bass: function () {
      if (!analyser) return 0;
      analyser.getByteFrequencyData(freq);
      return (freq[1] + freq[2] + freq[3] + freq[4]) / (4 * 255);
    },
    duck: function (amount, time) {
      if (!ctx) return;
      var t = ctx.currentTime, full = MYX.Settings.get('musicVol') * 0.8;
      musicBus.gain.cancelScheduledValues(t);
      musicBus.gain.setTargetAtTime(full * amount, t, 0.05);
      musicBus.gain.setTargetAtTime(full, t + (time || 0.8), 0.35);
    },
    // a jingle over the running music (or alone)
    jingle: function (name, vol, onEnd) {
      if (!ctx || this.muted) { if (onEnd) setTimeout(onEnd, 300); return 0; }
      var buf = this.chip ? null : buffers[name];
      if (buf) {
        var src = ctx.createBufferSource(), g = ctx.createGain();
        src.buffer = buf; g.gain.value = vol || 1;
        src.connect(g); g.connect(musicBus); src.start();
        if (onEnd) src.onended = onEnd;
        return buf.duration;
      }
      var key = 'j_' + name.replace(/^.*?:/, '');
      if (Synth[key]) {
        var g2 = ctx.createGain(); g2.gain.value = 0.9; g2.connect(sfxBus);
        var d = Synth[key](g2, ctx.currentTime);
        if (onEnd) setTimeout(onEnd, d * 1000);
        return d;
      }
      if (onEnd) setTimeout(onEnd, 300);
      return 0;
    }
  };

  function remove(v) { var i = voices.indexOf(v); if (i >= 0) voices.splice(i, 1); }
  function stop(v) {
    remove(v);
    try { v.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.01); } catch (e) {}
    setTimeout(function () {
      v.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} });
      try { v.gain.disconnect(); } catch (e) {}
    }, 60);
  }
  setInterval(function () {
    if (!ctx) return;
    var t = ctx.currentTime;
    for (var i = voices.length - 1; i >= 0; i--) if (voices[i].end < t) voices.splice(i, 1);
  }, 500);

  function sampleLoop(buf) {
    var src = ctx.createBufferSource(), g = ctx.createGain();
    src.buffer = buf; src.loop = true;
    g.gain.value = 0;
    g.gain.setTargetAtTime(0.8, ctx.currentTime, 0.03);
    src.connect(g); g.connect(sfxBus); src.start();
    return {
      set: function (p) { src.playbackRate.setTargetAtTime(0.85 + p * 0.3, ctx.currentTime, 0.05); },
      stop: function () {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.04);
        setTimeout(function () { try { src.stop(); g.disconnect(); } catch (e) {} }, 250);
      }
    };
  }

  // ------------------------------------------------------------------ the sound chip
  // square waves with stepped pitch and a 4-bit volume feel, noise from a short shift-register pattern
  function tone(out, type, f0, f1, t, dur, vol, curve) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    if (f1 && f1 !== f0) {
      if (curve === 'lin') o.frequency.linearRampToValueAtTime(f1, t + dur);
      else if (curve === 'step') {
        var n = Math.max(2, Math.round(dur / 0.017));
        for (var i = 1; i <= n; i++) o.frequency.setValueAtTime(f0 * Math.pow(f1 / f0, i / n), t + dur * i / n);
      } else o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    }
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(vol, t + 0.003);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(out);
    o.start(t); o.stop(t + dur + 0.02);
    (out._nodes = out._nodes || []).push(o);
    return o;
  }
  var noiseBuf = null;
  function noiseBuffer() {
    if (!noiseBuf) {
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      var d = noiseBuf.getChannelData(0), hold = 0, v = 0, lfsr = 0x1ff;
      for (var i = 0; i < d.length; i++) {
        if (hold-- <= 0) {
          var bit = ((lfsr >> 0) ^ (lfsr >> 4)) & 1;
          lfsr = (lfsr >> 1) | (bit << 8);
          v = (lfsr & 1) ? 1 : -1; hold = 2;
        }
        d[i] = v;
      }
    }
    return noiseBuf;
  }
  function noise(out, t, dur, vol, f0, f1) {
    var s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuffer(); s.loop = true;
    f.type = 'bandpass'; f.Q.value = 0.7;
    f.frequency.setValueAtTime(f0 || 2000, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t); s.stop(t + dur + 0.02);
    (out._nodes = out._nodes || []).push(s);
  }
  function notes(out, list, t, step, type, vol) {
    for (var i = 0; i < list.length; i++) if (list[i]) tone(out, type || 'square', list[i], list[i], t + i * step, step * 0.92, vol || 0.1);
    return list.length * step;
  }
  var Synth = {
    // the lantern bolt: a tiny falling chirp (autofire repeats it fast)
    shot: function (o, t) { noise(o, t, 0.17, 0.32, 5200, 900); tone(o, 'square', 1900, 700, t, 0.06, 0.035, 'step'); return 0.18; },
    // a mushroom takes a hit / is used up
    mush: function (o, t) { tone(o, 'square', 900, 700, t, 0.03, 0.035); return 0.035; },
    mushKill: function (o, t) { tone(o, 'square', 1200, 300, t, 0.07, 0.07, 'step'); noise(o, t, 0.05, 0.12, 5000, 2000); return 0.08; },
    // worm segment / head popped
    pop: function (o, t) { noise(o, t, 0.25, 0.55, 4200, 280); return 0.26; },
    head: function (o, t) { noise(o, t, 0.16, 0.4, 3000, 400); tone(o, 'square', 780, 160, t, 0.15, 0.1, 'step'); return 0.17; },
    // the march of the worm: low pulses, alternating pitch (opt.alt)
    // the march of the worm: a quick run of low, fading thumps (one beat every 16 frames)
    march: function (o, t) {
      var f = [104, 0, 131, 0, 156, 0, 208], v = 0.16;
      for (var i = 0; i < f.length; i++) if (f[i]) { tone(o, 'square', f[i], f[i], t + i / 60, 1 / 60 * 0.95, v); v *= 0.72; }
      return 0.13;
    },
    beetleHit: function (o, t) { tone(o, 'square', 600, 1800, t, 0.08, 0.08, 'step'); return 0.09; },
    beetle: function (o, t) { noise(o, t, 0.3, 0.45, 2500, 200); tone(o, 'square', 1500, 200, t, 0.28, 0.08, 'step'); return 0.3; },
    spider: function (o, t) { noise(o, t, 0.45, 0.5, 2200, 120); tone(o, 'square', 400, 60, t, 0.42, 0.1, 'step'); return 0.45; },
    scorp: function (o, t) { noise(o, t, 0.55, 0.5, 4000, 150); for (var i = 0; i < 5; i++) tone(o, 'square', 1400 - i * 220, 1300 - i * 220, t + i * 0.06, 0.05, 0.07); return 0.55; },
    // the spirit bursts: noise sweep down with a falling buzz
    die: function (o, t) {
      noise(o, t, 1.25, 0.85, 3600, 60);
      tone(o, 'square', 300, 40, t, 1.1, 0.07, 'step');
      return 1.3;
    },
    // a damaged mushroom grows back after a lost life
    restore: function (o, t) { tone(o, 'square', 1568, 1760, t, 0.05, 0.06, 'step'); return 0.06; },
    // extra life: a bright bell, rung several times
    // extra life: an own rising chime run, sixteen short notes
    extra: function (o, t) {
      var n = [196, 247, 294, 392, 294, 392, 494, 392, 494, 587, 784, 587, 784, 988, 1175, 1568];
      for (var i = 0; i < n.length; i++) tone(o, 'square', n[i], n[i], t + i * 8 / 60, 7.5 / 60, 0.07 * (0.6 + i / 40));
      return n.length * 8 / 60;
    },
    poison: function (o, t) { tone(o, 'square', 300, 900, t, 0.06, 0.05, 'step'); return 0.07; },
    wave: function (o, t) { return notes(o, [523, 659, 784, 1047], t, 0.05, 'square', 0.07); },
    coin: function (o, t) { tone(o, 'square', 988, 988, t, 0.07, 0.1); tone(o, 'square', 1319, 1319, t + 0.07, 0.22, 0.1); return 0.3; },
    click: function (o, t) { tone(o, 'square', 1200, 1200, t, 0.03, 0.07); return 0.04; },
    move: function (o, t) { tone(o, 'square', 700, 700, t, 0.02, 0.05); return 0.03; },
    // modern extras
    power: function (o, t) { return notes(o, [659, 784, 988, 1319, 1568], t, 0.045, 'square', 0.08); },
    combo: function (o, t, opt) { var f = 660 * Math.pow(1.12, (opt && opt.n) || 0); tone(o, 'square', f, f * 2, t, 0.09, 0.06); return 0.1; },
    bomb: function (o, t) { tone(o, 'sawtooth', 60, 1400, t, 0.35, 0.16); noise(o, t + 0.3, 1.2, 0.6, 4000, 90); tone(o, 'sine', 80, 30, t + 0.32, 1.0, 0.5); return 1.5; },
    // jingles (own melodies, eighth notes; 0 = rest)
    j_start: function (o, t) {
      var d = notes(o, [523, 0, 659, 784, 0, 1047, 988, 784, 880, 0, 1047, 0, 1319, 1319, 0, 0], t, 0.09, 'square', 0.08);
      notes(o, [131, 0, 0, 0, 165, 0, 0, 0, 175, 0, 0, 0, 196, 0, 0, 0], t, 0.09, 'triangle', 0.18);
      return d;
    },
    j_over: function (o, t) {
      var d = notes(o, [784, 740, 698, 659, 0, 587, 554, 523, 0, 494, 0, 466, 440, 440, 0, 0], t, 0.16, 'square', 0.08);
      notes(o, [196, 0, 0, 0, 185, 0, 0, 0, 175, 0, 0, 0, 110, 110, 110, 0], t, 0.16, 'triangle', 0.18);
      return d;
    },
    j_hiscore: function (o, t) { return notes(o, [523, 659, 784, 1047, 784, 1047, 1319, 0, 1175, 1047, 1175, 1319, 1568, 0, 1568], t, 0.1, 'square', 0.08); }
  };

  // continuous creature sounds of the chip
  function chipLoop(build) {
    var g = ctx.createGain();
    g.gain.value = 0;
    g.connect(sfxBus);
    var parts = build(g);
    g.gain.setTargetAtTime(1, ctx.currentTime, 0.02);
    return {
      set: function (p) { if (parts.set) parts.set(p); },
      stop: function () {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.03);
        setTimeout(function () { parts.nodes.forEach(function (n) { try { n.stop(); } catch (e) {} }); try { g.disconnect(); } catch (e) {} }, 200);
      }
    };
  }
  var LoopSynth = {
    // the weaver spider: a warbling two-step buzz whose pitch follows its height
    spider: function () {
      return chipLoop(function (g) {
        // short blips (2 frames on, 2 off) whose pitch springs up and falls again: a boing that never stops
        var o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain();
        var gate = ctx.createOscillator(), gg = ctx.createGain(), amp = ctx.createGain(), v = ctx.createGain();
        o.type = 'square'; o.frequency.value = 560;
        lfo.type = 'sawtooth'; lfo.frequency.value = 1.5; lg.gain.value = -260;
        lfo.connect(lg); lg.connect(o.frequency);
        gate.type = 'square'; gate.frequency.value = 15; gg.gain.value = 0.5;
        amp.gain.value = 0.5;
        gate.connect(gg); gg.connect(amp.gain);
        v.gain.value = 0.07;
        o.connect(amp); amp.connect(v); v.connect(g);
        o.start(); lfo.start(); gate.start();
        return { nodes: [o, lfo, gate], set: function (p) { o.frequency.setTargetAtTime(480 + p * 180, ctx.currentTime, 0.05); } };
      });
    },
    // the spore beetle falling: a whistle sliding down as it drops
    beetle: function () {
      return chipLoop(function (g) {
        var o = ctx.createOscillator(), v = ctx.createGain();
        o.type = 'square'; o.frequency.value = 420;
        v.gain.value = 0.05;
        o.connect(v); v.connect(g);
        o.start();
        return { nodes: [o], set: function (p) { o.frequency.setTargetAtTime(420 - p * 205, ctx.currentTime, 0.02); } };
      });
    },
    // the night scorpion: a tone gliding up and down, like a far-off siren
    scorp: function () {
      return chipLoop(function (g) {
        var o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), v = ctx.createGain();
        o.type = 'square'; o.frequency.value = 270;
        lfo.type = 'triangle'; lfo.frequency.value = 3; lg.gain.value = 62;
        lfo.connect(lg); lg.connect(o.frequency);
        v.gain.value = 0.05;
        o.connect(v); v.connect(g);
        o.start(); lfo.start();
        return { nodes: [o, lfo] };
      });
    }
  };
})(MYX);
