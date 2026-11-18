// A simple player for the demo and for tests: stays low, lines up under the lowest worm piece, keeps away from
// the spider and from worm heads in the zone, fires all the time.
'use strict';

(function (MYX) {
  var CFG = MYX.CFG;

  var Pilot = MYX.Autopilot = function (game, skill) {
    this.g = game;
    this.skill = skill === undefined ? 1 : skill;
  };
  Pilot.prototype.input = function () {
    var g = this.g, p = g.player, tx = p.x, ty = 236, i;
    var target = null, best = -1;
    for (i = 0; i < 12; i++) {
      var s = g.slots[i];
      if (!s.alive || s.y <= 0) continue;
      var score = s.y + (s.body ? 0 : 6);
      if (score > best) { best = score; target = s; }
    }
    if (g.flea && g.flea.y < p.y - 30) target = g.flea;
    if (target) tx = target.x + (target.dx ? MYX.sign(target.dx) * 5 : 0);
    // danger: spider or worm parts close to the spirit
    var dangerX = 0;
    var near = function (ex, ey, rx, ry) { return Math.abs(ex - p.x) < rx && Math.abs(ey - p.y) < ry; };
    if (g.spider && near(g.spider.x, g.spider.y, 36, 30)) dangerX += (p.x < g.spider.x ? -1 : 1);
    for (i = 0; i < 12; i++) {
      var q = g.slots[i];
      if (q.alive && q.y >= 192 && near(q.x, q.y, 22, 18)) dangerX += (p.x < q.x ? -1 : 1);
    }
    if (dangerX) tx = p.x + MYX.sign(dangerX) * 40;
    tx = MYX.clamp(tx, CFG.gunMinX, CFG.gunMaxX);
    var mx = MYX.clamp((tx - p.x) * 0.4, -3, 3) * this.skill;
    var my = MYX.clamp((ty - p.y) * 0.3, -2, 2);
    return { mx: mx, my: my, fire: true, bomb: false };
  };
})(MYX);
