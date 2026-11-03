/* Prototype only: static data frozen at 34.2 s of a "Raid as in my log" fight, no engine. */
(function () {
  'use strict';
  var SP = '../../../public/icons/spells/';
  var IT = '../../../public/icons/items/';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var nf = new Intl.NumberFormat('en-US');
  var nf1 = new Intl.NumberFormat('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var S = {
    sb: ['Shadow Bolt', SP + 'spell_shadow_shadowbolt.jpg', 'shadow'],
    imm: ['Immolate', SP + 'spell_fire_immolation.jpg', 'fire'],
    cor: ['Corruption', SP + 'spell_shadow_abominationexplosion.jpg', 'shadow'],
    coe: ['Curse of the Elements', SP + 'spell_shadow_chilltouch.jpg', 'shadow'],
    sbn: ['Shadowburn', SP + 'spell_shadow_scourgebuild.jpg', 'shadow'],
    lt: ['Life Tap', SP + 'spell_shadow_burningspirit.jpg', 'shadow'],
    inc: ['Incinerate', SP + 'spell_fire_burnout.jpg', 'fire'],
    coa: ['Curse of Agony', SP + 'spell_shadow_curseofsargeras.jpg', 'shadow'],
    cod: ['Curse of Doom', SP + 'spell_shadow_auraofdarkness.jpg', 'shadow'],
    icon: ['Icon of the Silver Crescent', IT + 'inv_weapon_shortblade_23.jpg'],
    dpot: ['Destruction Potion', SP + 'inv_potion_107.jpg'],
    smp: ['Super Mana Potion', SP + 'inv_potion_137.jpg'],
    rune: ['Dark Rune', SP + 'inv_misc_rune_04.jpg'],
    hero: ['Heroism', SP + 'ability_shaman_heroism.jpg'],
    band: ['Band of the Eternal Sage', IT + 'inv_jewelry_ring_55.jpg']
  };

  /* ---------- Fight: action bar, item bar ---------- */
  var bar = [['1', 'sb'], ['2', 'imm'], ['3', 'cor'], ['4', 'coe'], ['5', 'sbn'], ['6', 'lt'], ['7', 'inc'], ['8', null], ['9', 'coa'], ['0', 'cod'], ['-', null], ['=', null]];
  $('#actionbar').innerHTML = bar.map(function (b) {
    var k = b[0], id = b[1];
    if (!id) return '<button type="button" class="slotbtn empty" aria-label="Empty slot (' + k + ')" disabled><span class="key">' + k + '</span></button>';
    var s = S[id];
    var cls = 'slotbtn' + (id === 'sb' ? ' next' : '');
    return '<button type="button" class="' + cls + '" aria-label="' + s[0] + ' (' + k + ')"><img src="' + s[1] + '" width="50" height="50" alt="" /><span class="sweep" style="--p:8%"></span><span class="key">' + k + '</span></button>';
  }).join('');
  var items = [['Z', 'icon', '95s'], ['X', 'dpot', '95s'], ['C', 'smp', '95s'], ['V', 'rune', null], ['B', null], ['N', null]];
  $('#itembar').insertAdjacentHTML('beforeend', items.map(function (b) {
    var k = b[0], id = b[1];
    if (!id) return '<button type="button" class="slotbtn empty" aria-label="Empty item slot (' + k + ')" disabled><span class="key">' + k + '</span></button>';
    var s = S[id], cd = b[2];
    return '<button type="button" class="slotbtn" aria-label="' + s[0] + ' (' + k + ')' + (cd ? ', ready in ' + cd : '') + '"><img src="' + s[1] + '" width="50" height="50" alt="" />' +
      (cd ? '<span class="sweep" style="--p:79%"></span><span class="cd">' + cd + '</span>' : '') + '<span class="key">' + k + '</span></button>';
  }).join(''));

  /* ---------- Fight: auras ---------- */
  function aura(a, cls) {
    return '<li class="aura ' + (cls || '') + (a.exp ? ' expiring' : '') + (a.mine ? ' mine' : '') + '" aria-label="' + esc(a.n) + (a.t ? ', ' + a.t + ' left' : '') + (a.stk ? ', ' + a.stk + ' charges' : '') + '" title="' + esc(a.n) + '">' +
      '<img src="' + a.i + '" width="36" height="36" alt="" />' + (a.stk ? '<span class="stk">' + a.stk + '</span>' : '') + (a.t ? '<span class="t">' + a.t + '</span>' : '') + '</li>';
  }
  var debuffs = [
    { n: 'Shadow Vulnerability (Improved Shadow Bolt)', i: SP + 'spell_shadow_shadowbolt.jpg', t: '8.6s', stk: 3, mine: true },
    { n: 'Immolate', i: SP + 'spell_fire_immolation.jpg', t: '4.1s', mine: true, exp: true },
    { n: 'Corruption', i: SP + 'spell_shadow_abominationexplosion.jpg', t: '11s', mine: true },
    { n: 'Curse of Doom', i: SP + 'spell_shadow_auraofdarkness.jpg', t: '26s', mine: true }
  ];
  var raidDebuffs = [
    { n: 'Judgement of Wisdom', i: SP + 'spell_holy_righteousnessaura.jpg' },
    { n: 'Misery', i: SP + 'spell_shadow_misery.jpg' }
  ];
  $('#debuffs').innerHTML = debuffs.map(function (a) { return aura(a, 'debuff'); }).join('') + '<li class="sep" aria-hidden="true"></li>' + raidDebuffs.map(function (a) { return aura(a, 'debuff small passive'); }).join('');
  var timed = [
    { n: 'Heroism', i: SP + 'ability_shaman_heroism.jpg', t: '12s' },
    { n: 'Band of the Eternal Sage', i: IT + 'inv_jewelry_ring_55.jpg', t: '4.3s', exp: true },
    { n: 'Fel Armor', i: SP + 'spell_shadow_felarmour.jpg', mine: true }
  ];
  $('#buffs-timed').innerHTML = timed.map(function (a) { return aura(a); }).join('');
  var setupBuffs = [
    ['Arcane Brilliance', 'spell_holy_arcaneintellect'], ['Gift of the Wild', 'spell_nature_giftofthewild'], ['Divine Spirit', 'spell_holy_prayerofspirit'],
    ['Moonkin Aura', 'spell_nature_moonglow'], ['Mana Spring Totem', 'spell_nature_manaregentotem'], ['Wrath of Air Totem', 'spell_nature_slowingtotem'],
    ['Blessing of Kings', 'spell_magic_greaterblessingofkings'], ['Blessing of Wisdom', 'spell_holy_greaterblessingofwisdom'], ['Flask of Pure Death', 'inv_potion_115'],
    ['Blackened Basilisk', 'spell_misc_food'], ['Brilliant Wizard Oil', 'inv_potion_105']
  ];
  $('#buffs-setup').innerHTML = setupBuffs.map(function (b) { return aura({ n: b[0], i: SP + b[1] + '.jpg' }, 'small passive'); }).join('');

  /* ---------- Fight: frozen combat text ---------- */
  $('#sct-out').innerHTML = [
    '<span class="ft shadow" style="left:6%;top:4%;opacity:.35">2,231</span>',
    '<span class="ft fire tick" style="left:46%;top:16%;opacity:.5">741</span>',
    '<span class="ft shadow tick" style="left:20%;top:30%;opacity:.7">612</span>',
    '<span class="ft miss" style="left:56%;top:42%;opacity:.8">Miss</span>',
    '<span class="ft shadow crit" style="left:2%;top:58%"><img src="' + S.sb[1] + '" width="22" height="22" alt="" />4,812!</span>'
  ].join('');
  $('#sct-notes').innerHTML = [
    '<span class="ft buff" style="left:30%;top:10%;opacity:.4">+Heroism</span>',
    '<span class="ft gain" style="left:16%;top:34%;opacity:.7">+1,622 Mana</span>',
    '<span class="ft proc" style="left:2%;top:58%"><img src="' + S.band[1] + '" width="22" height="22" alt="" />Band of the Eternal Sage!</span>'
  ].join('');

  /* ---------- Fight: meter, next, log ---------- */
  var meter = [['sb', 54994, 69.3], ['imm', 14980, 18.9], ['cor', 9410, 11.9]];
  $('#meter').innerHTML = meter.map(function (m) {
    var s = S[m[0]];
    return '<li class="' + s[2] + '"><i style="width:' + (m[2] / 69.3 * 100) + '%"></i><img src="' + s[1] + '" width="22" height="22" alt="" /><span>' + s[0] + '</span><b>' + nf.format(m[1]) + ' <small>(' + nf.format(Math.round(m[1] / 34.2)) + ', ' + m[2] + '%)</small></b></li>';
  }).join('');
  var next = [['sb', 'Shadow Bolt', 'now', true], ['imm', 'Immolate', 'at < 2 s', false], ['lt', 'Life Tap', 'mana < 35%', false], ['icon', 'Icon', 'cd 95 s', false]];
  $('#next').innerHTML = next.map(function (n) { return '<li class="' + (n[3] ? 'now' : '') + '"><img src="' + S[n[0]][1] + '" width="24" height="24" alt="" /><span>' + n[1] + '</span><small>' + n[2] + '</small></li>'; }).join('');
  var log = [
    ['34.1', '<span class="s">Shadow Bolt</span> crits for 4,812'],
    ['33.9', '<span class="s">Corruption</span> ticks for 612'],
    ['33.0', 'You begin casting <span class="s">Shadow Bolt</span>'],
    ['32.9', '<span class="f">Immolate</span> ticks for 741'],
    ['32.4', '<span class="m">Life Tap</span>: +1,622 mana'],
    ['32.3', '<span class="g">Band of the Eternal Sage</span> procs'],
    ['31.2', '<span class="s">Shadow Bolt</span> misses']
  ];
  $('#log').innerHTML = log.map(function (l) { return '<li><time>' + l[0] + '</time><span>' + l[1] + '</span></li>'; }).join('');

  /* ---------- Setup: gear ---------- */
  var gear = [
    ['Head', 'Hood of the Malefic', 'inv_helmet_103', '+63 SP, +32 crit, +16 hit', ['meta', 'blue']],
    ['Neck', 'Translucent Spellthread Necklace', 'inv_jewelry_necklace_30', '+46 SP, +24 crit, +15 hit', []],
    ['Shoulder', 'Mantle of the Malefic', 'inv_shoulder_68', '+46 SP, +13 crit, +21 hit', ['blue', 'yellow']],
    ['Back', 'Nethervoid Cloak', 'inv_misc_cape_10', '+53 shadow SP, +18 hit', []],
    ['Chest', 'Robes of Rhonin', 'inv_chest_cloth_49', '+81 SP, +24 crit, +27 hit', ['red', 'red', 'yellow']],
    ['Wrist', 'Bracers of Nimble Thought', 'inv_bracer_13', '+34 SP, +28 haste', []],
    ['Hands', 'Gloves of the Malefic', 'inv_gauntlets_66', '+46 SP, +19 crit, +11 hit', ['yellow']],
    ['Waist', 'Belt of Blasting', 'inv_belt_13', '+50 SP, +30 crit, +23 hit', ['red', 'yellow']],
    ['Legs', 'Leggings of the Malefic', 'inv_pants_cloth_29', '+62 SP, +37 crit, +19 hit', ['red']],
    ['Feet', 'Boots of Foretelling', 'inv_boots_cloth_05', '+26 SP, +19 crit', ['red', 'yellow']],
    ['Finger 1', 'Band of the Eternal Sage', 'inv_jewelry_ring_55', '+34 SP, +24 crit, proc', []],
    ['Finger 2', 'Ring of Captured Storms', 'inv_jewelry_ring_60', '+42 SP, +29 crit, +19 hit', []],
    ['Trinket 1', 'Icon of the Silver Crescent', 'inv_weapon_shortblade_23', '+43 SP, use: +155 SP', []],
    ['Trinket 2', 'Riding Crop', 'inv_misc_crop_02', 'Mount speed', []],
    ['Main hand', 'The Maelstrom’s Fury', 'inv_weapon_shortblade_58', '+236 SP, +22 crit', []],
    ['Off hand', 'Fetish of the Primal Gods', 'inv_offhand_zulaman_d_02', '+37 SP, +17 haste', []],
    ['Ranged', 'Wand of the Forgotten Star', 'inv_wand_15', '+23 SP, +14 crit, +11 hit', []]
  ];
  function slot(g, i) {
    var q = /Riding Crop/.test(g[1]) ? 'rare' : 'epic';
    return '<li><button type="button" class="slot ' + q + '" aria-pressed="' + (i === 0) + '" aria-label="' + esc(g[0] + ': ' + g[1]) + '"><img src="' + IT + g[2] + '.jpg" width="44" height="44" alt="" /><span style="min-width:0"><span class="sl">' + g[0] + '</span><span class="nm">' + g[1] + '</span><span class="st">' + g[3] + '</span>' +
      (g[4].length ? '<span class="gems" aria-hidden="true">' + g[4].map(function (c) { return '<i class="gem ' + c + '"></i>'; }).join('') + '</span>' : '') + '</span></button></li>';
  }
  $('#slots-left').innerHTML = gear.slice(0, 7).map(slot).join('');
  $('#slots-right').innerHTML = gear.slice(7, 14).map(function (g, i) { return slot(g, i + 7); }).join('');
  $('#slots-weapons').innerHTML = gear.slice(14).map(function (g, i) { return slot(g, i + 14).replace('<li>', '<div role="listitem">').replace('</li>', '</div>'); }).join('');
  $('#item-card').innerHTML =
    '<span class="slot-name">Head, item level 120, Tier 4</span><h2>Hood of the Malefic</h2>' +
    '<dl><dt>Spell power</dt><dd class="tnum">+63</dd><dt>Crit rating</dt><dd class="tnum">+32</dd><dt>Hit rating</dt><dd class="tnum">+16</dd><dt>Intellect</dt><dd class="tnum">+36</dd></dl>' +
    '<div class="socket"><img src="' + IT + 'inv_misc_gem_diamond_07.jpg" width="20" height="20" alt="" />Chaotic Skyfire Diamond <span class="bonus-on">(active: 2 blue gems)</span></div>' +
    '<div class="socket"><img src="' + IT + 'inv_jewelcrafting_shadowsongamethyst_02.jpg" width="20" height="20" alt="" />Glowing Shadowsong Amethyst</div>' +
    '<div class="socket bonus-on">Socket bonus: +5 SP</div>' +
    '<div class="socket">Enchant: Glyph of Power (+22 SP, +14 hit)</div>' +
    '<p class="set">Malefic Raiment (4/4): 2 pc and 4 pc active</p>' +
    '<div class="actions"><button class="btn small" type="button">Change Head…</button><button class="btn small quiet" type="button">Change Gems</button><button class="btn small quiet" type="button">Clear Head</button></div>';
  $$('.slot').forEach(function (b) {
    b.addEventListener('click', function () {
      $$('.slot').forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
    });
  });

  /* ---------- Setup: rotation script ---------- */
  function hl(src) {
    return esc(src)
      .replace(/\$[a-zA-Z]+/g, '<span class="d">$&</span>')
      .replace(/(&amp;&amp;|\|\||&lt;=?|&gt;=?|==|!)/g, '<span class="o">$1</span>')
      .replace(/\b([a-z]+(?:\.[a-zA-Z0-9:-]+)+(?:\(\d+\))?)/g, '<span class="v">$1</span>')
      .replace(/(^|[\s(])(\d+(?:\.\d+)?)(?=[\s)]|$)/g, '$1<span class="nn">$2</span>');
  }
  var rules = [
    ['use', 'icon', 'Icon of the Silver Crescent', '$burst', 1.0, ''],
    ['use', 'dpot', 'Destruction Potion', 'use.item:29370.count >= 1', 1.0, ''],
    ['cast', 'cod', 'Curse of Doom', '!target.aura.curse-of-doom.active && time.remaining > 60', 1.0, ''],
    ['cast', 'imm', 'Immolate', 'target.aura.immolate.remaining < 2 && !inflight(immolate)', 4.6, 'rules[3].if: position 46: expected “.” or “(” after “inflight”'],
    ['cast', 'cor', 'Corruption', 'target.aura.corruption.remaining < 1.5', 3.1, ''],
    ['cast', 'sbn', 'Shadowburn', 'fight.last(3)', 0.9, ''],
    ['cast', 'lt', 'Life Tap', '$lowMana && !heroism.active', 2.8, ''],
    ['use', 'smp', 'Super Mana Potion', 'mana.missing > 3000', 0.0, ''],
    ['cast', 'sb', 'Shadow Bolt', '', 27.4, '']
  ];
  $('#rules').innerHTML = rules.map(function (r, i) {
    var s = S[r[1]];
    return '<li class="rule' + (r[5] ? ' has-err' : '') + '">' +
      '<input type="checkbox" checked aria-label="Rule ' + (i + 1) + ' enabled" />' +
      '<span class="act"><img src="' + s[1] + '" width="30" height="30" alt="" /><span><em>' + (r[0] === 'use' ? 'Use' : 'Cast') + '</em> ' + r[2] + '</span></span>' +
      (r[3] ? '<div class="cond" role="textbox" aria-label="Rule ' + (i + 1) + ' condition" tabindex="0" contenteditable="false">' + hl(r[3]) + '</div>' : '<div class="cond always">Always (filler)</div>') +
      '<span class="fires"><b>' + r[4].toFixed(1) + '</b><small>per fight</small></span>' +
      '<span class="row-tools"><button type="button" aria-label="Move rule ' + (i + 1) + ' up"><svg aria-hidden="true"><use href="#i-up"/></svg></button><button type="button" aria-label="Move rule ' + (i + 1) + ' down"><svg aria-hidden="true"><use href="#i-down"/></svg></button><button type="button" aria-label="More actions for rule ' + (i + 1) + '"><svg aria-hidden="true"><use href="#i-more"/></svg></button></span>' +
      (r[5] ? '<p class="err" id="err-' + i + '"><b>' + esc(r[5].split(':')[0]) + '</b>' + esc(r[5].slice(r[5].indexOf(':'))) + '. Use <b>inflight.immolate</b>.</p>' : '') +
      '</li>';
  }).join('');

  /* ---------- Setup: buffs ---------- */
  var groups = [
    ['Raid and party', [['Arcane Brilliance', 'spell_holy_arcaneintellect', '+40 Int', 1], ['Gift of the Wild', 'spell_nature_giftofthewild', '+14 stats', 1], ['Divine Spirit', 'spell_holy_prayerofspirit', '+50 Spi', 1], ['Moonkin Aura', 'spell_nature_moonglow', '+5% crit', 1], ['Totem of Wrath', 'spell_fire_totemofwrath', '+3% crit, +3% hit', 0], ['Wrath of Air Totem', 'spell_nature_slowingtotem', '+101 SP', 1], ['Blessing of Kings', 'spell_magic_greaterblessingofkings', '+10% stats', 1]]],
    ['Consumables', [['Flask of Pure Death', 'inv_potion_115', '+80 shadow, fire, frost', 1], ['Flask of Supreme Power', 'inv_potion_41', '+70 SP', 0], ['Elixir of Major Shadow Power', 'inv_potion_145', '+55 shadow SP', 0], ['Blackened Basilisk', 'spell_misc_food', '+23 SP, +20 Spi', 1], ['Brilliant Wizard Oil', 'inv_potion_105', '+36 SP, +14 crit', 1]]],
    ['Target debuffs', [['Misery', 'spell_shadow_misery', '+5% spell damage', 1], ['Shadow Weaving', 'spell_shadow_blackplague', '+10% shadow', 0], ['Judgement of Wisdom', 'spell_holy_righteousnessaura', 'mana on hit', 1], ['Improved Shadow Bolt (other warlocks)', 'spell_shadow_shadowbolt', '+20% shadow', 1]]]
  ];
  $('#buff-groups').innerHTML = groups.map(function (g) {
    var on = g[1].filter(function (b) { return b[3]; }).length;
    return '<section><h2>' + g[0] + ' <small>' + on + ' of ' + g[1].length + ' on</small></h2><ul class="toggles">' + g[1].map(function (b) {
      return '<li><label><input type="checkbox"' + (b[3] ? ' checked' : '') + ' /><img src="' + SP + b[1] + '.jpg" width="28" height="28" alt="" /><span>' + b[0] + '<small>' + b[2] + '</small></span></label></li>';
    }).join('') + '</ul></section>';
  }).join('');

  /* ---------- Report: damage table ---------- */
  var dmg = [
    ['sb', 87640, 69.4, 31, '33.3%', '2,402', '3,960', 1],
    ['imm', 19720, 15.6, 4, '25.0%', '741', '1,190', 0],
    ['cor', 11628, 9.2, 3, 'n/a', '612', 'n/a', 0],
    ['cod', 7284, 5.8, 1, 'n/a', '7,284', 'n/a', 0],
    ['lt', 0, 0, 3, 'n/a', 'n/a', 'n/a', 0]
  ];
  $('#dmg-table tbody').innerHTML = dmg.map(function (d) {
    var s = S[d[0]];
    return '<tr><td class="sp"><div class="sp-cell"><img src="' + s[1] + '" width="28" height="28" alt="" /><div><div>' + s[0] + ' <span class="note">' + (d[2] ? d[2] + '%' : '') + '</span></div><div class="share"><i class="' + s[2] + '-bg" style="width:' + d[2] / 69.4 * 100 + '%"></i></div></div></div></td>' +
      '<td class="n">' + nf.format(d[1]) + '</td><td class="n">' + nf1.format(d[1] / 60) + '</td><td class="n">' + d[3] + '</td><td class="n">' + d[4] + '</td><td class="n opt">' + d[5] + '</td><td class="n opt">' + d[6] + '</td><td class="n opt">' + d[7] + '</td></tr>';
  }).join('');

  /* ---------- Charts (inline SVG, one axis) ---------- */
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function svgEl(w, h, body) { return '<svg viewBox="0 0 ' + w + ' ' + h + '" role="img">' + body + '</svg>'; }

  function dpsChart() {
    var host = $('#dps-chart'), old = host.querySelector('svg'); if (old) host.removeChild(old);
    if (!host.clientWidth) return;
    var r = rng(7), W = Math.max(300, host.clientWidth), H = W < 500 ? 260 : 320, L = 56, R = 10, T = 76, B = 28, pw = W - L - R, ph = H - T - B;
    var pts = [], cum = [], bot = [], tot = 0;
    for (var t = 1; t <= 60; t++) {
      var base = 1640 + (r() - 0.5) * 520;
      if (t > 6.4 && t <= 46.4) base *= 1.3;
      if (t > 8.8 && t <= 23.8) base *= 1.08;
      if (t > 8.8 && t <= 28.8) base *= 1.06;
      if ((t > 20 && t < 24) || (t > 46 && t < 50)) base *= 0.82;
      if (t === 60) base += 7284;
      pts.push(base); tot += base; cum.push(tot / t);
      bot.push(base * (1.06 + (r() - 0.5) * 0.05));
    }
    var roll = pts.map(function (_, i) { var a = Math.max(0, i - 4), s = 0; for (var j = a; j <= i; j++) s += pts[j]; return s / (i - a + 1); });
    var botRoll = bot.map(function (_, i) { var a = Math.max(0, i - 4), s = 0; for (var j = a; j <= i; j++) s += bot[j]; return s / (i - a + 1); });
    var max = 4000;
    var x = function (t) { return L + (t / 60) * pw; }, y = function (v) { return T + ph - (Math.min(v, max) / max) * ph; };
    var path = function (arr) { return arr.map(function (v, i) { return (i ? 'L' : 'M') + x(i + 1).toFixed(1) + ' ' + y(v).toFixed(1); }).join(''); };
    var body = '<title>DPS over the fight, 5 second rolling, with buff windows</title>';
    // buff lanes above the plot (no colour mixing over the line)
    var lanes = [['Heroism', 6.4, 46.4], ['Destruction Potion', 8.8, 23.8], ['Icon of the Silver Crescent', 8.8, 28.8], ['Band procs', [[12.1, 22.1], [31.9, 41.9], [50.5, 60]]]];
    lanes.forEach(function (ln, i) {
      var yy = 4 + i * 14;
      body += '<text class="lane-label" x="' + (L - 6) + '" y="' + (yy + 9) + '" text-anchor="end">' + (i === 2 ? 'Icon' : i === 1 ? 'Potion' : i === 3 ? 'Band' : 'Heroism') + '</text>';
      var spans = Array.isArray(ln[1]) ? ln[1] : [[ln[1], ln[2]]];
      spans.forEach(function (s) { body += '<rect x="' + x(s[0]).toFixed(1) + '" y="' + yy + '" width="' + (x(s[1]) - x(s[0])).toFixed(1) + '" height="10" rx="2" fill="var(--trim)" opacity="' + (0.85 - i * 0.15) + '"><title>' + ln[0] + ' ' + s[0] + '–' + s[1] + ' s</title></rect>'; });
    });
    body += '<g class="grid">';
    [0, 1000, 2000, 3000, 4000].forEach(function (v) { body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>'; });
    body += '</g><g class="axis">';
    [0, 1000, 2000, 3000, 4000].forEach(function (v) { body += '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + (v ? nf.format(v) : '0') + '</text>'; });
    (W < 500 ? [0, 20, 40, 60] : [0, 10, 20, 30, 40, 50, 60]).forEach(function (t) { body += '<text x="' + x(t) + '" y="' + (H - 8) + '" text-anchor="' + (t === 60 ? 'end' : t === 0 ? 'start' : 'middle') + '">' + t + ' s</text>'; });
    body += '</g>';
    body += '<path d="' + path(botRoll) + '" fill="none" stroke="var(--text-dim)" stroke-width="1.5" opacity=".5"/>';
    body += '<path d="' + path(cum) + '" fill="none" stroke="var(--text-dim)" stroke-width="2" stroke-dasharray="4 3"/>';
    body += '<path d="' + path(roll) + '" fill="none" stroke="var(--class)" stroke-width="2" stroke-linejoin="round"/>';
    body += '<line class="xh" x1="0" x2="0" y1="' + T + '" y2="' + (T + ph) + '" stroke="var(--text)" stroke-width="1" opacity="0"/>';
    body += '<circle class="dot" r="4" fill="var(--class)" stroke="var(--surface)" stroke-width="2" opacity="0"/>';
    body += '<rect class="hit" x="' + L + '" y="' + T + '" width="' + pw + '" height="' + ph + '" fill="transparent"/>';
    host.insertAdjacentHTML('afterbegin', svgEl(W, H, body));
    var svg = host.querySelector('svg'), tip = host.querySelector('.tip'), xh = svg.querySelector('.xh'), dot = svg.querySelector('.dot');
    svg.querySelector('.hit').addEventListener('pointermove', function (e) {
      var b = svg.getBoundingClientRect(), sx = (e.clientX - b.left) * (W / b.width);
      var t = Math.max(1, Math.min(60, Math.round(((sx - L) / pw) * 60)));
      xh.setAttribute('x1', x(t)); xh.setAttribute('x2', x(t)); xh.setAttribute('opacity', '0.4');
      dot.setAttribute('cx', x(t)); dot.setAttribute('cy', y(roll[t - 1])); dot.setAttribute('opacity', '1');
      tip.hidden = false;
      tip.innerHTML = '<div class="note">' + t + ' s</div><b>' + nf.format(Math.round(roll[t - 1])) + '</b> DPS (5 s)<br />' + nf.format(Math.round(cum[t - 1])) + ' so far, bot ' + nf.format(Math.round(botRoll[t - 1]));
      var px = (x(t) / W) * b.width;
      tip.style.left = Math.min(px + 12, b.width - 170) + 'px'; tip.style.top = '60px';
    });
    svg.querySelector('.hit').addEventListener('pointerleave', function () { tip.hidden = true; xh.setAttribute('opacity', '0'); dot.setAttribute('opacity', '0'); });
  }

  function histogram() {
    var host = $('#histogram'), old = host.querySelector('svg'); if (old) host.removeChild(old);
    if (!host.clientWidth) return;
    var W = Math.max(300, host.clientWidth), H = W < 500 ? 220 : 300, L = 40, R = 10, T = 34, B = 28, pw = W - L - R, ph = H - T - B;
    var lo = 1900, hi = 2725, step = 25, mean = 2294.1, sd = 118.6, n = (hi - lo) / step, bins = [];
    for (var i = 0; i < n; i++) { var c = lo + step * (i + 0.5); bins.push(Math.round(1000 * step / (sd * Math.sqrt(2 * Math.PI)) * Math.exp(-Math.pow(c - mean, 2) / (2 * sd * sd)))); }
    var max = 100, bw = pw / n;
    var x = function (v) { return L + ((v - lo) / (hi - lo)) * pw; }, y = function (c) { return T + ph - (c / max) * ph; };
    var body = '<title>Histogram of DPS over 1,000 simulated fights</title><g class="grid">';
    [0, 25, 50, 75, 100].forEach(function (v) { body += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/>'; });
    body += '</g><g class="axis">';
    [0, 50, 100].forEach(function (v) { body += '<text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>'; });
    (W < 500 ? [1900, 2300, 2700] : [1900, 2100, 2300, 2500, 2700]).forEach(function (v) { body += '<text x="' + x(v) + '" y="' + (H - 8) + '" text-anchor="' + (v === 2700 ? 'end' : v === 1900 ? 'start' : 'middle') + '">' + nf.format(v) + '</text>'; });
    body += '</g>';
    bins.forEach(function (c, i) {
      var x0 = L + i * bw + 1, h = Math.max(0, (c / max) * ph);
      body += '<path d="M' + x0.toFixed(1) + ' ' + (T + ph) + 'v' + (-Math.max(0, h - 3)).toFixed(1) + 'q0 -3 3 -3h' + (bw - 8).toFixed(1) + 'q3 0 3 3v' + Math.max(0, h - 3).toFixed(1) + 'z" fill="var(--class)" opacity="' + (c ? 0.85 : 0) + '"><title>' + (lo + i * step) + '–' + (lo + (i + 1) * step) + ' DPS: ' + c + ' fights</title></path>';
    });
    body += '<line x1="' + x(mean) + '" x2="' + x(mean) + '" y1="' + (T - 6) + '" y2="' + (T + ph) + '" stroke="var(--text)" stroke-width="1.5"/><text x="' + (x(mean) + 5) + '" y="' + (T - 10) + '" fill="var(--text)" font-size="12" font-weight="600">Mean 2,294</text>';
    body += '<line x1="' + x(2104.5) + '" x2="' + x(2104.5) + '" y1="' + (T - 6) + '" y2="' + (T + ph) + '" stroke="var(--gold)" stroke-width="2" stroke-dasharray="4 3"/><text x="' + (x(2104.5) - 5) + '" y="' + (T - 10) + '" fill="var(--gold)" font-size="12" font-weight="600" text-anchor="end">You 2,104.5</text>';
    host.insertAdjacentHTML('afterbegin', svgEl(W, H, body));
  }

  function timeline() {
    var host = $('#timeline'); if (!host.clientWidth) return;
    var W = Math.max(300, host.clientWidth), L = W < 500 ? 40 : 190, R = 10, laneH = 24, lanesDef = [
      ['Shadow Bolt', 'sb', 'cast'], ['Immolate', 'imm', 'aura'], ['Corruption', 'cor', 'aura'], ['Curse of Doom', 'cod', 'aura'], ['Life Tap', 'lt', 'cast'],
      ['Heroism', 'hero', 'buff'], ['Destruction Potion', 'dpot', 'buff'], ['Icon of the Silver Crescent', 'icon', 'buff']
    ];
    var H = lanesDef.length * laneH + 30, pw = W - L - R, x = function (t) { return L + t / 60 * pw; };
    var body = '<title>Timeline of casts and auras</title><g class="grid">';
    for (var t = 0; t <= 60; t += 10) body += '<line x1="' + x(t) + '" x2="' + x(t) + '" y1="0" y2="' + (H - 24) + '"/>';
    body += '</g><g class="axis">';
    for (t = 0; t <= 60; t += 10) body += '<text x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="middle">' + t + ' s</text>';
    body += '</g>';
    var spans = {
      sb: [], imm: [[1.6, 16.6], [17.2, 21.0], [27.9, 42.9], [43.4, 47.0], [53.9, 60]], cor: [[3.1, 21.1], [21.6, 39.6], [40.1, 58.1], [58.4, 60]], cod: [[4.5, 60]], lt: [[0.0, 1.5], [33.1, 33.9], [45.5, 46.4]],
      hero: [[6.4, 46.4]], dpot: [[8.8, 23.8]], icon: [[8.8, 28.8]]
    };
    for (var c = 6; c < 58; c += 2.05) spans.sb.push([c, Math.min(60, c + 1.9)]);
    lanesDef.forEach(function (ln, i) {
      var yy = i * laneH + 2, s = S[ln[1]], col = ln[2] === 'buff' ? 'var(--trim)' : s[2] === 'fire' ? 'var(--mark-fire)' : 'var(--mark-shadow)';
      body += '<image href="' + s[1] + '" x="' + (L - 24) + '" y="' + yy + '" width="18" height="18"><title>' + ln[0] + '</title></image>' + (W < 500 ? '' : '<text class="lane-label" x="' + (L - 30) + '" y="' + (yy + 13) + '" text-anchor="end">' + ln[0] + '</text>');
      spans[ln[1]].forEach(function (sp) { body += '<rect x="' + x(sp[0]).toFixed(1) + '" y="' + (yy + 3) + '" width="' + Math.max(2, x(sp[1]) - x(sp[0]) - 1).toFixed(1) + '" height="12" rx="2" fill="' + col + '" opacity="' + (ln[2] === 'cast' ? 0.95 : 0.6) + '"/>'; });
    });
    $('#timeline').innerHTML = svgEl(W, H, body);
  }

  /* ---------- Report: log, rotation ---------- */
  var logRows = [['0.0', 'You begin casting Life Tap', ''], ['0.0', 'Life Tap: mana', '+1,560'], ['1.6', 'Immolate hits Raid Target Dummy', '1,148'], ['3.1', 'Corruption is applied', ''], ['4.5', 'Curse of Doom is applied', ''], ['6.4', 'Heroism is applied', ''], ['8.8', 'You use Icon of the Silver Crescent', ''], ['8.8', 'You use Destruction Potion', ''], ['8.9', 'Shadow Bolt crits Raid Target Dummy', '4,377'], ['9.4', 'Immolate ticks', '741'], ['10.8', 'Shadow Bolt hits Raid Target Dummy', '2,402'], ['12.1', 'Band of the Eternal Sage procs', '']];
  $('#log-table tbody').innerHTML = logRows.map(function (r) { return '<tr><td class="n" style="text-align:left">' + r[0] + '</td><td>' + r[1] + '</td><td class="n">' + r[2] + '</td></tr>'; }).join('');
  var prio = [['icon', 'Icon of the Silver Crescent', '1', '1'], ['dpot', 'Destruction Potion', '1', '1'], ['cod', 'Curse of Doom', '1', '1'], ['imm', 'Immolate', '4', '5'], ['cor', 'Corruption', '3', '3'], ['lt', 'Life Tap', '3', '2'], ['sb', 'Shadow Bolt', '31', '33']];
  $('#prio').innerHTML = '<li style="font-weight:600;color:var(--text-dim)"><span></span><span>Rule</span><span class="cmp"><span>You</span><span>Bot</span></span></li>' + prio.map(function (p) { return '<li><img src="' + S[p[0]][1] + '" width="28" height="28" alt="" /><span>' + p[1] + '</span><span class="cmp"><span>' + p[2] + '</span><span>' + p[3] + '</span></span></li>'; }).join('');
  var hdr = $('#prio li'); if (hdr) hdr.style.counterIncrement = 'none';

  function charts() { dpsChart(); histogram(); timeline(); }
  var rz = 0;
  window.addEventListener('resize', function () { cancelAnimationFrame(rz); rz = requestAnimationFrame(charts); });

  /* ---------- Router: #/mode/section ---------- */
  var titles = { setup: 'Setup', fight: 'Fight', report: 'Report' };
  var lastMode = null;
  function route() {
    var h = location.hash.replace(/^#\/?/, '').split('/');
    var mode = titles[h[0]] ? h[0] : 'fight';
    var sub = h[1] || (mode === 'setup' ? 'gear' : mode === 'report' ? 'damage' : '');
    $$('.view').forEach(function (v) { v.hidden = v.id !== 'view-' + mode; });
    $$('[data-mode]').forEach(function (a) { if (a.dataset.mode === mode) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (mode === 'setup') {
      var known = ['gear', 'rotation', 'buffs'];
      $$('.setup-section').forEach(function (s) { s.hidden = s.dataset.sec !== (known.indexOf(sub) >= 0 ? sub : 'other'); });
      $$('.rail a[data-sec]').forEach(function (a) { if (a.dataset.sec === sub) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      if (known.indexOf(sub) < 0) { var a = $('.rail a[data-sec="' + sub + '"] .label'); $('#h-other').textContent = a ? a.textContent : 'Section'; }
    }
    if (mode === 'report') {
      $$('.rep-panel').forEach(function (p) { p.hidden = p.dataset.tab !== sub; });
      $$('.tabs a').forEach(function (a) { if (a.dataset.tab === sub) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
      var cur = $('.tabs a[aria-current]'), strip = $('.tabs');
      if (cur && strip.scrollWidth > strip.clientWidth) strip.scrollLeft = Math.max(0, cur.offsetLeft - 16);
      charts();
    }
    if (mode === 'fight') {
      $('#start').hidden = sub !== 'ready';
      var f = $('#view-fight');
      f.classList.toggle('is-ready', sub === 'ready');
      $('.timer .tnum').textContent = sub === 'ready' ? '0:00.0' : '0:34.2';
      $('.hud-dps b[aria-label="DPS"]').textContent = sub === 'ready' ? '0.0' : '2,321.2';
      $('.hud-dps b[aria-label="Total damage"]').textContent = sub === 'ready' ? '0' : '79,384';
      $('.timeline i').style.width = sub === 'ready' ? '0%' : '57%';
      if (lastMode !== 'fight') { f.classList.remove('entering'); void f.offsetWidth; f.classList.add('entering'); }
    }
    document.title = 'Rotation Trainer: ' + titles[mode] + (sub && sub !== 'ready' ? ', ' + sub.replace('-', ' ') : '');
    if (lastMode !== null && lastMode !== mode) $('#main').focus({ preventScroll: true });
    lastMode = mode;
  }
  window.addEventListener('hashchange', route);
  route();

  /* ---------- Theme ---------- */
  var tb = $('#theme');
  function paintTheme() {
    var light = document.documentElement.dataset.theme === 'light';
    tb.setAttribute('aria-label', light ? 'Switch to dark theme' : 'Switch to light theme');
    tb.querySelector('use').setAttribute('href', light ? '#i-moon' : '#i-sun');
    $('meta[name="theme-color"]').setAttribute('content', light ? '#fbfaff' : '#221c31');
  }
  tb.addEventListener('click', function () {
    var next = document.documentElement.dataset.theme === 'light' ? 'dark' : 'light';
    document.documentElement.dataset.theme = next;
    try { localStorage.setItem('rt-proto-theme', next); } catch (e) {}
    paintTheme();
  });
  paintTheme();

  /* Segmented buttons: single choice */
  $$('.seg').forEach(function (g) {
    g.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b) return;
      $$('button', g).forEach(function (o) { o.setAttribute('aria-pressed', String(o === b)); });
    });
  });
})();
