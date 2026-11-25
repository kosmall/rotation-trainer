#!/usr/bin/env python3
"""Builds src/forever/data/classic_base.json from the cmangos Classic data (WoW Classic 1.12).

Inputs (clone them first, see docs/forever-data-ledger.md section 8):
  --mangos  path to cmangos/mangos-classic   (sql/base/mangos.sql: player_classlevelstats, player_levelstats)
  --classic path to ClassicDB_1_12_1_z2815.sql (gunzipped Full_DB of cmangos/classic-db: creature_template,
            creature_template_classlevelstats, pet_levelstats)
The values are WoW CLASSIC data. Forever-specific differences are noted in the output file.
"""
import argparse, json, re, statistics, collections

ap = argparse.ArgumentParser()
ap.add_argument('--mangos', required=True)
ap.add_argument('--classic', required=True)
ap.add_argument('--out', default='src/forever/data/classic_base.json')
a = ap.parse_args()

M = open(a.mangos + '/sql/base/mangos.sql', errors='ignore').read()
C = open(a.classic, errors='ignore').read()
LV = list(range(10, 61))

# --- player tables (mangos.sql)
def table_rows(text, name, ncols):
    i = text.index(f"INSERT INTO `{name}` VALUES")
    j = text.index(";", i)
    return re.findall(r"\(" + ",".join([r"(-?[\d.]+)"] * ncols) + r"\)", text[i:j])
cls_rows = table_rows(M, 'player_classlevelstats', 4)
warlock = {int(l): {'hp': int(hp), 'mana': int(mana)} for c, l, hp, mana in cls_rows if int(c) == 9}
lvl_rows = table_rows(M, 'player_levelstats', 8)
gnome = {int(l): {'str': int(s), 'agi': int(ag), 'sta': int(st), 'int': int(i), 'spi': int(sp)} for r, c, l, s, ag, st, i, sp in lvl_rows if int(r) == 7 and int(c) == 9}

# --- creature class level stats (classic.sql)
i = C.index("INSERT INTO `creature_template_classlevelstats` VALUES"); j = C.index(";", i)
cl = {}
for lvl, c, hp, mana, dmg, ap_, rap, arm in re.findall(r"\((\d+),(\d+),(\d+),(\d+),([\d.]+),([\d.]+),([\d.]+),(\d+)\)", C[i:j]):
    cl[(int(lvl), int(c))] = dict(hp=int(hp), mana=int(mana), dmg=float(dmg), ap=float(ap_), armor=int(arm))

# --- creature_template rows (all INSERT statements)
cols = []
k = C.index("CREATE TABLE `creature_template` (")
for line in C[k:C.index(") ENGINE", k)].split("\n"):
    m = re.match(r"\s+`(\w+)`", line)
    if m: cols.append(m.group(1))
idx = {c: n for n, c in enumerate(cols)}
pre = 'INSERT INTO `creature_template` VALUES '
rows = []; pos = 0
while True:
    s0 = C.find(pre, pos)
    if s0 < 0: break
    st = s0 + len(pre); e = C.index(');\n', st); s = C[st:e + 1]
    n = len(s); p = 0
    while p < n:
        if s[p] != '(':
            p += 1; continue
        q = p + 1; f = []; cur = []; inq = False
        while True:
            ch = s[q]
            if inq:
                if ch == '\\': cur.append(s[q + 1]); q += 2; continue
                if ch == "'":
                    if s[q + 1] == "'": cur.append("'"); q += 2; continue
                    inq = False; q += 1; continue
                cur.append(ch)
            else:
                if ch == "'": inq = True
                elif ch == ',': f.append(''.join(cur)); cur = []
                elif ch == ')': f.append(''.join(cur)); break
                else: cur.append(ch)
            q += 1
        rows.append(f); p = q + 1
    pos = e
g = lambda r, c: r[idx[c]]
norm = []
for r in rows:
    try:
        lo, hi, rank, npcf, ctype = int(g(r, 'MinLevel')), int(g(r, 'MaxLevel')), int(g(r, 'Rank')), int(g(r, 'NpcFlags')), int(g(r, 'CreatureType'))
        hp = int(g(r, 'MinLevelHealth')); dmin, dmax = float(g(r, 'MinMeleeDmg')), float(g(r, 'MaxMeleeDmg'))
    except ValueError:
        continue
    if rank == 0 and npcf == 0 and lo == hi and dmax > 0 and ctype not in (8, 11, 12, 13, 14) and hp > 0 and 'Trigger' not in g(r, 'Name'):
        norm.append(dict(level=lo, hp=hp, dmg=(dmin + dmax) / 2, armor=int(g(r, 'Armor')), atk=int(g(r, 'MeleeBaseAttackTime'))))
by = collections.defaultdict(list)
for m in norm: by[m['level']].append(m)
med = {L: dict(n=len(v), hp=statistics.median(m['hp'] for m in v), dmg=statistics.median(m['dmg'] for m in v), armor=statistics.median(m['armor'] for m in v)) for L, v in by.items() if 10 <= L <= 60}

# damage per swing: weighted least squares line over the levels with at least 8 mobs
pts = [(L, d['dmg'], d['n']) for L, d in med.items() if d['n'] >= 8 and L >= 38]  # the line is fitted on levels 38-60 only
sw = sum(w for _, _, w in pts); mx = sum(L * w for L, _, w in pts) / sw; my = sum(y * w for _, y, w in pts) / sw
slope = sum(w * (L - mx) * (y - my) for L, y, w in pts) / sum(w * (L - mx) ** 2 for L, _, w in pts)
icpt = my - slope * mx

mob = {}
for L in LV:
    base = cl[(L, 1)]
    mult = 1.15 + 0.01 * (L - 40)   # typical HealthMultiplier of normal mobs: 1.15 at 40, +0.01 per level (fits the medians at 38, 40, 45, 50, 55)
    # below level 38 the line (fitted on 38-60) is far off (negative at 10), so the swing is the median of the real mobs when there are 8+ samples
    mob[str(L)] = dict(hp=round(base['hp'] * mult), armor=base['armor'], swing=round(med[L]['dmg'] if L < 38 and med.get(L, {}).get('n', 0) >= 8 else icpt + slope * L, 1), medianHp=med.get(L, {}).get('hp'), medianSwing=med.get(L, {}).get('dmg'), samples=med.get(L, {}).get('n', 0))

# --- pets
i = C.index("INSERT INTO `pet_levelstats` VALUES"); j = C.index(";\n", i)
pets = {'416': 'imp', '1860': 'voidwalker', '1863': 'succubus', '417': 'felhunter'}
pet = {v: {} for v in pets.values()}
for r in re.findall(r"\((\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+),(\d+)\)", C[i:j]):
    if r[0] in pets and (int(r[1]) in LV or int(r[1]) == 1):
        pet[pets[r[0]]][r[1]] = dict(hp=int(r[2]), mana=int(r[3]), armor=int(r[4]), sta=int(r[7]))
pet_tpl = {}
for r in rows:
    if r[0] in pets:
        pet_tpl[pets[r[0]]] = dict(unitClass=int(g(r, 'UnitClass')), damageMultiplier=float(g(r, 'DamageMultiplier')), damageVariance=float(g(r, 'DamageVariance')), attackMs=int(g(r, 'MeleeBaseAttackTime')))
pet_melee = {}
for name, t in pet_tpl.items():
    pet_melee[name] = {}
    for L in LV:
        b = cl[(L, t['unitClass'])]
        mn = (b['dmg'] * t['damageVariance'] + (b['ap'] / 14) * (t['attackMs'] / 1000)) * t['damageMultiplier']
        pet_melee[name][str(L)] = round(mn * 1.25, 1)  # average of min and min x 1.5 (cmangos Pet::InitStatsForLevel)

out = dict(
    _comment="WoW CLASSIC (1.12) data from the cmangos emulator databases, used where Forever data could not be found. Forever differences: creature health was raised before launch by an unknown amount (Blizzard, 3 Nov 2026); pet health is now 2 per point of the master's Stamina (was 7.5); pets' health was raised ~15% on 10 Nov. Generated by scripts/forever-extract-classic.py.",
    sources=dict(
        player="cmangos/mangos-classic sql/base/mangos.sql tables player_classlevelstats (class 9) and player_levelstats (race 7 gnome, class 9)",
        creatures="cmangos/classic-db Full_DB ClassicDB_1_12_1_z2815.sql: creature_template_classlevelstats (class 1), creature_template (rank 0 mobs), pet_levelstats",
        formulas="cmangos/mangos-classic src/game/Entities/StatSystem.cpp, Unit.cpp (OCTRegenMPPerSpirit, OCTRegenHPPerSpirit), Pet.cpp (InitStatsForLevel)"),
    verify=True,
    warlock={str(L): warlock[L] for L in [1] + LV},
    gnomeWarlockBase={str(L): gnome[L] for L in [1] + LV},
    mob=mob,
    mobNote="hp = classlevelstats(class 1).hp x (1.15 + 0.01 x (level-40)); swing = weighted line through the median melee damage per swing of normal mobs (Classic); armor = classlevelstats(class 1).armor; attack speed 2.0 s. Forever raised higher-level creature health by an unknown factor: see param mob_hp_mult.",
    pet=pet,
    petTemplate=pet_tpl,
    petMeleeAvgPerSwing=pet_melee,
    formulas=dict(
        healthFromStamina="basehp + min(sta,20) + 10 x max(sta-20,0)",
        manaFromIntellect="basemana + min(int,20) + 15 x max(int-20,0)",
        manaRegenPerTick2s_warlock="spirit/5 + 15 (outside the five-second rule)",
        healthRegenPerTick2s_warlock="spirit x 0.12 + 1.5 (out of combat)",
    ),
)
json.dump(out, open(a.out, 'w'), indent=1)
print('written', a.out, 'mob slope', round(slope, 2), 'intercept', round(icpt, 1))
