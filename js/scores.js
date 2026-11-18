// High scores: top 10 with three letters, separate for the original and the modern version, plus the
// highest wave reached.
'use strict';

(function (MYX) {
  var DEFAULT = [
    ['NIK', 40000, 14], ['LUX', 32000, 12], ['MOS', 26000, 10], ['SPO', 21000, 9], ['FUN', 17000, 8],
    ['GLO', 13000, 7], ['FIR', 10000, 6], ['FAR', 7500, 5], ['MYC', 5000, 4], ['ELF', 3000, 3]
  ];

  MYX.Scores = {
    list: function (mode) {
      var l = MYX.Store.get('scores.' + mode, null);
      if (!l || !l.length) l = DEFAULT.map(function (d) { return { name: d[0], score: d[1], wave: d[2] }; });
      return l;
    },
    best: function (mode) { return this.list(mode)[0].score; },
    qualifies: function (mode, score) {
      var l = this.list(mode);
      return score > 0 && (l.length < 10 || score > l[l.length - 1].score);
    },
    // returns the rank (0..9) of the new entry
    insert: function (mode, name, score, wave) {
      var l = this.list(mode).slice();
      var e = { name: name, score: score, wave: wave };
      var i = 0;
      while (i < l.length && l[i].score >= score) i++;
      l.splice(i, 0, e);
      l = l.slice(0, 10);
      MYX.Store.set('scores.' + mode, l);
      return i;
    },
    clear: function (mode) { MYX.Store.remove('scores.' + mode); }
  };
})(MYX);
