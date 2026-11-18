// MYCOLUX Original – own pixel art in the manner of the 1981 raster board: small sprites with at most three
// colours, A / B / C, taken from the colour set of the current wave (14 sets, one more for every cleared wave).
// As on the board: mushrooms fill A rim C, poisoned ones rim A fill B; the worm A with B legs and C eyes; the
// spirit B with C; shot and score C. Sprites are strings: '.' is transparent, a / b / c pick the colour.
'use strict';

(function (MYX) {
  // ---------------------------------------------------------------- colour sets
  MYX.PALETTES = [
    { a: '#22e6ff', b: '#ffe8b0', c: '#ff3fc0' },   // 1 moonmoss: cyan, tan, magenta
    { a: '#ff3fc0', b: '#ffb020', c: '#9dff4a' },   // 2
    { a: '#8dff3a', b: '#22e6ff', c: '#ff7a1a' },   // 3
    { a: '#ff8a1f', b: '#c8a0ff', c: '#22e6ff' },   // 4
    { a: '#a050ff', b: '#6affc8', c: '#ffe44a' },   // 5
    { a: '#ffe44a', b: '#4a7aff', c: '#ff5aa0' },   // 6
    { a: '#1affb0', b: '#ff6ad5', c: '#ffffff' },   // 7
    { a: '#ff3a3a', b: '#ffe8b0', c: '#22e6ff' },   // 8
    { a: '#4a8aff', b: '#ffa040', c: '#6affc8' },   // 9
    { a: '#ff6ad5', b: '#3aff6a', c: '#ffe44a' },   // 10
    { a: '#6affc8', b: '#a050ff', c: '#ff8a1f' },   // 11
    { a: '#ffb020', b: '#22e6ff', c: '#ff3a3a' },   // 12
    { a: '#f0f0ff', b: '#ff3fc0', c: '#3aff6a' },   // 13
    { a: '#9fdcff', b: '#ff4a4a', c: '#b6ff3a' }    // 14
  ];
  MYX.palette = function (wave) { var n = MYX.PALETTES.length; return MYX.PALETTES[((wave % n) + n) % n]; };

  // ---------------------------------------------------------------- sprites
  // mushroom (tile): fill a, rim and spots c; hits wear it away from the bottom up
  var MUSH = [
    '..cccc..',
    '.caaaac.',
    'caacaaac',
    'caaaacac',
    'cccccccc',
    '..caac..',
    '..caac..',
    '..cccc..'
  ];
  // rows that stay visible for 4 / 3 / 2 / 1 hit points left
  MYX.MUSH_ROWS = [0, 2, 4, 6, 8];

  // worm pieces are 7 wide, centred on x; legs ripple in four steps
  var LEGS = [['b.b.b.b', '.b.b.b.'], ['.b.b.b.', '.b.b.b.'], ['.b.b.b.', 'b.b.b.b'], ['b.b.b.b', 'b.b.b.b']];
  var BODY = LEGS.map(function (l) {
    return [l[0], '.aaaaa.', 'aaabaaa', 'aabbbaa', 'aaabaaa', '.aaaaa.', l[1], '.......'];
  });
  // head looking right: glowing eyes c, small jaws b
  var HEAD = LEGS.map(function (l) {
    return [l[0], '.aaaab.', 'aaaacaa', 'aaaaaab', 'aaaacaa', '.aaaab.', l[1], '.......'];
  });
  // the forest spirit: hood b, glowing face c with dark eyes, the lantern spark on top
  var SPIRIT = [
    '...c...',
    '..bbb..',
    '.bcccb.',
    'bc.c.cb',
    'bcccccb',
    '.bcccb.',
    '..bbb..',
    '.bb.bb.'
  ];
  // weaver spider (15 wide, centred): legs b, body a, eyes c
  var SPIDER = [[
    'b...b.....b...b',
    '.b...b...b...b.',
    '..b..aaaaa..b..',
    '...bbacacabb...',
    '..b.aaaaaaa.b..',
    '.b...aaaaa...b.',
    'b...b..a..b...b',
    '...............'
  ], [
    '..b.........b..',
    '.b.b.......b.b.',
    'b...baaaaab...b',
    '....bacacab....',
    '..bbaaaaaaabb..',
    '.b...aaaaa...b.',
    '..b...bab...b..',
    '.b...........b.'
  ]];
  // spore beetle (9 wide): shell b, spots c, legs a – it falls head first
  var BEETLE = [[
    '..bbbbb..',
    '.bcbbbcb.',
    'bbbbbbbbb',
    'bcbbcbbcb',
    'bbbbbbbbb',
    '.bbbbbbb.',
    'a.a...a.a',
    '.a.....a.'
  ], [
    '..bbbbb..',
    '.bcbbbcb.',
    'bbbbbbbbb',
    'bcbbcbbcb',
    'bbbbbbbbb',
    '.bbbbbbb.',
    '.a.a.a.a.',
    'a.......a'
  ]];
  // night scorpion looking right (16 wide): body b, glowing tail and claws c
  var SCORP = [[
    '..cc............',
    '.c..c...........',
    '.c...c......cc..',
    '..c..bbbbbb.c..c',
    '...bbbbbbbbbbcc.',
    '..bbbbbbbbbbb...',
    '...b.b.b.b.b....',
    '..b.b.b.b.b.....'
  ], [
    '..cc............',
    '.c..c.......cc..',
    '.c...c.....c..c.',
    '..c..bbbbbb.cc..',
    '...bbbbbbbbbbb..',
    '..bbbbbbbbbbb...',
    '..b.b.b.b.b.....',
    '...b.b.b.b.b....'
  ]];
  // pops: a little burst (6 frames, 3 pictures)
  var POP = [[
    '.......',
    '...a...',
    '..aba..',
    '.abcba.',
    '..aba..',
    '...a...',
    '.......',
    '.......'
  ], [
    '.a...a.',
    '..b.b..',
    '...c...',
    '.bc.cb.',
    '...c...',
    '..b.b..',
    '.a...a.',
    '.......'
  ], [
    'a.....a',
    '...b...',
    '.b...b.',
    '...c...',
    '.c...c.',
    '...b...',
    'a.....a',
    '.......'
  ]];
  // the spirit bursting into sparks (player death), 16 x 16, grown from the centre
  var DEATH = [[
    '................',
    '................',
    '................',
    '................',
    '.......aa.......',
    '......abba......',
    '.....abccba.....',
    '....abccccba....',
    '....abccccba....',
    '.....abccba.....',
    '......abba......',
    '.......aa.......',
    '................',
    '................',
    '................',
    '................'
  ], [
    '................',
    '.......a........',
    '...a...b...a....',
    '....b..c..b.....',
    '.....c.b.c......',
    '..a...cbc...a...',
    '...bccbcbccb....',
    'abcbcc.a.ccbcba.',
    '...bccbcbccb....',
    '..a...cbc...a...',
    '.....c.b.c......',
    '....b..c..b.....',
    '...a...b...a....',
    '.......a........',
    '................',
    '................'
  ], [
    '.......a........',
    '.a.....b.....a..',
    '..b....c....b...',
    '...c.......c....',
    '....b.....b.....',
    '................',
    '..........c.....',
    'abc....a....cba.',
    '....c...........',
    '................',
    '....b.....b.....',
    '...c.......c....',
    '..b....c....b...',
    '.a.....b.....a..',
    '.......a........',
    '................'
  ], [
    'a......a......a.',
    '................',
    '.b.....b.....b..',
    '................',
    '................',
    '.......c........',
    '................',
    'b..............b',
    '................',
    '.......c........',
    '................',
    '................',
    '.b.....b.....b..',
    '................',
    'a......a......a.',
    '................'
  ]];

  function mirror(rows) { return rows.map(function (r) { return r.split('').reverse().join(''); }); }

  MYX.SPR = {
    mush: MUSH,
    body: BODY,
    headR: HEAD,
    headL: HEAD.map(mirror),
    spirit: SPIRIT,
    spider: SPIDER,
    beetle: BEETLE,
    scorpR: SCORP,
    scorpL: SCORP.map(mirror),
    pop: POP,
    death: DEATH
  };

  // ---------------------------------------------------------------- font (5 x 7, one row per number, bit 4 = left)
  var F = {
    'A': [14, 17, 17, 31, 17, 17, 17], 'B': [30, 17, 17, 30, 17, 17, 30], 'C': [14, 17, 16, 16, 16, 17, 14],
    'D': [30, 17, 17, 17, 17, 17, 30], 'E': [31, 16, 16, 30, 16, 16, 31], 'F': [31, 16, 16, 30, 16, 16, 16],
    'G': [14, 17, 16, 23, 17, 17, 15], 'H': [17, 17, 17, 31, 17, 17, 17], 'I': [14, 4, 4, 4, 4, 4, 14],
    'J': [7, 2, 2, 2, 2, 18, 12], 'K': [17, 18, 20, 24, 20, 18, 17], 'L': [16, 16, 16, 16, 16, 16, 31],
    'M': [17, 27, 21, 21, 17, 17, 17], 'N': [17, 17, 25, 21, 19, 17, 17], 'O': [14, 17, 17, 17, 17, 17, 14],
    'P': [30, 17, 17, 30, 16, 16, 16], 'Q': [14, 17, 17, 17, 21, 18, 13], 'R': [30, 17, 17, 30, 20, 18, 17],
    'S': [15, 16, 16, 14, 1, 1, 30], 'T': [31, 4, 4, 4, 4, 4, 4], 'U': [17, 17, 17, 17, 17, 17, 14],
    'V': [17, 17, 17, 17, 17, 10, 4], 'W': [17, 17, 17, 21, 21, 21, 10], 'X': [17, 17, 10, 4, 10, 17, 17],
    'Y': [17, 17, 17, 10, 4, 4, 4], 'Z': [31, 1, 2, 4, 8, 16, 31],
    '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
    '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
    '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14],
    '9': [14, 17, 17, 15, 1, 2, 12],
    'Ä': [10, 0, 14, 17, 31, 17, 17], 'Ö': [10, 0, 14, 17, 17, 17, 14], 'Ü': [10, 0, 17, 17, 17, 17, 14],
    'ß': [12, 18, 18, 28, 18, 18, 28],
    ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12], ',': [0, 0, 0, 0, 12, 4, 8],
    ':': [0, 12, 12, 0, 12, 12, 0], '!': [4, 4, 4, 4, 4, 0, 4], '?': [14, 17, 1, 2, 4, 0, 4],
    '-': [0, 0, 0, 31, 0, 0, 0], '/': [1, 1, 2, 4, 8, 16, 16], '©': [14, 17, 23, 25, 23, 17, 14],
    '\'': [4, 4, 8, 0, 0, 0, 0], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
    '+': [0, 4, 4, 31, 4, 4, 0], '=': [0, 0, 31, 0, 31, 0, 0], '>': [8, 4, 2, 1, 2, 4, 8],
    '<': [2, 4, 8, 16, 8, 4, 2], '%': [24, 25, 2, 4, 8, 19, 3], '*': [0, 4, 21, 14, 21, 4, 0],
    '_': [0, 0, 0, 0, 0, 0, 31], '"': [10, 10, 0, 0, 0, 0, 0], '#': [10, 31, 10, 10, 31, 10, 0],
    '►': [8, 12, 14, 15, 14, 12, 8], '◄': [2, 6, 14, 30, 14, 6, 2]
  };
  var MAP = { 'ä': 'Ä', 'ö': 'Ö', 'ü': 'Ü', '–': '-', '—': '-', '„': '"', '“': '"', '”': '"', '’': '\'', '…': '.' };
  MYX.glyph = function (ch) {
    if (MAP[ch]) ch = MAP[ch];
    var g = F[ch] || F[ch.toUpperCase()];
    return g || F['?'];
  };
})(MYX);
