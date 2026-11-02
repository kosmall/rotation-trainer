// Captured at c121206 (before the item-use rules) by a scratch script with the helpers of
// item-use-reference.ts: per scenario and spell queue window the bot mean over seeds 1-10 and per
// seed [hash(JSON.stringify(log)), log length, RNG draws]; and the output of the pre-change
// buildItemSteps (ids, labels, hints, hash of the when() bits over randomSnapshots(20261102, 5000)).

import type { BotReference } from './item-use-reference';

export const HEAD_BOTS: Record<string, Record<number, BotReference>> = {
  default: {
    400: { mean: 1425.1766666666667, runs: [[3381318172082650, 171, 70], [2200449481489333, 173, 70], [2101861596025258, 172, 66], [8216540262247319, 174, 68], [452388571045092, 176, 66], [3094704763254617, 170, 68], [5269771019736539, 172, 70], [1285412670952374, 176, 70], [6822529372079077, 176, 70], [8672120567947985, 175, 70]] },
    0: { mean: 1428.3350000000003, runs: [[392507203395990, 137, 70], [4018059320429956, 145, 70], [3777692900546055, 144, 66], [4861355516436862, 146, 68], [5001126113295435, 148, 66], [2567864307077841, 139, 68], [1975526285604568, 141, 70], [1584071869397203, 148, 70], [7775533524245391, 148, 70], [6240386395417708, 147, 70]] },
  },
  iconBand: {
    400: { mean: 1379.2966666666666, runs: [[8932871105589827, 174, 94], [15855430168622, 178, 79], [1474531325333489, 178, 75], [3173747166815743, 176, 68], [1543423429289892, 174, 69], [7549746785561278, 177, 92], [1654230071233483, 172, 78], [4223931015370836, 180, 82], [3712875009213594, 182, 77], [5002636985154132, 181, 78]] },
    0: { mean: 1373.4900000000002, runs: [[2415769866437212, 143, 94], [3006161978567505, 150, 79], [8751990902027553, 150, 75], [4297405667323004, 148, 68], [6368440053040919, 144, 69], [4591101185525917, 145, 69], [8816278624401456, 141, 78], [5852375710084494, 152, 82], [6990994818690730, 154, 77], [7800902596253800, 153, 78]] },
  },
  raidLog: {
    400: { mean: 2294.108333333333, runs: [[512089242276857, 221, 119], [392944427048533, 222, 125], [801017590667942, 212, 116], [654618881645110, 216, 126], [6409968744747578, 219, 124], [2586192890873323, 227, 118], [7744387825646040, 211, 146], [6605640543209271, 218, 122], [1001334832450494, 213, 132], [8550615794320094, 217, 120]] },
    0: { mean: 2294.108333333333, runs: [[5700370253318712, 191, 119], [589881994413272, 192, 125], [3687319111648948, 182, 116], [887715934023583, 186, 126], [1261678312004813, 189, 124], [2502041591927858, 197, 118], [5300112249274401, 181, 146], [5483592222387529, 188, 122], [2843498200976156, 183, 132], [4194072673316277, 187, 120]] },
  },
  consumables: {
    400: { mean: 1709.42, runs: [[5474406233034866, 215, 81], [3409710579643821, 209, 82], [6023437679495521, 201, 84], [5875680278929142, 211, 86], [6514397140463032, 208, 84], [7171230281428279, 208, 84], [4729730964074004, 202, 84], [6933153887848796, 213, 86], [3443910833470979, 211, 83], [1634276393040846, 215, 86]] },
    0: { mean: 1730.8533333333337, runs: [[795788543283397, 169, 83], [1266762824350296, 170, 82], [8770687375221798, 162, 84], [2021504101879381, 172, 86], [1587162959782403, 169, 84], [2208127769187709, 168, 86], [323140992748948, 166, 84], [8109069535404122, 172, 83], [8703591207858892, 172, 86], [1030940957934651, 175, 86]] },
  },
  consumablesNoHeroism: {
    400: { mean: 1450.775, runs: [[4730594664627888, 179, 74], [2957178141684378, 179, 72], [3866895319115640, 181, 72], [3942882122041223, 185, 72], [6207188972736019, 181, 72], [7699275102877032, 180, 72], [1322417346195056, 176, 74], [1974912574781676, 184, 74], [8948624263171165, 180, 71], [1266871823081672, 188, 74]] },
    0: { mean: 1455.2649999999999, runs: [[2700097227215969, 148, 71], [2635529240904252, 147, 72], [4077952091687958, 155, 72], [8294437251628803, 154, 69], [7071240593347050, 151, 72], [3552685544350698, 152, 74], [3756342035347844, 147, 74], [2397777670624080, 152, 71], [4099791667714212, 155, 74], [6906112987308053, 160, 74]] },
  },
  long300: {
    400: { mean: 1433.7086666666667, runs: [[4138985187312735, 994, 393], [3127623300643322, 998, 383], [1875633190503537, 997, 354], [4243186760278159, 993, 394], [512938854207208, 993, 361], [5035708905614054, 987, 363], [7639187324819420, 993, 385], [1641171638154898, 1007, 388], [6413958464752750, 993, 371], [5925573805887262, 992, 393]] },
    0: { mean: 1457.9793333333334, runs: [[6799605735480155, 802, 386], [5376606750290273, 816, 361], [67394564262334, 816, 366], [7061033957660122, 806, 379], [5110892165594975, 821, 363], [4821483978859857, 813, 364], [2112450312577127, 811, 385], [6863870582696385, 827, 385], [8556939804511004, 803, 395], [5947008083613685, 815, 371]] },
  },
  quagBloodgem: {
    400: { mean: 1855.0166666666669, runs: [[6965706780651077, 218, 117], [6640953734670152, 221, 98], [2465237711957308, 221, 117], [7046972337599763, 215, 104], [8937602497378636, 224, 99], [1007710940913728, 216, 104], [1361208915784835, 219, 114], [6732946960915893, 222, 98], [8369896564164903, 217, 122], [5426451831201449, 224, 93]] },
    0: { mean: 1847.0366666666669, runs: [[2114339994568809, 178, 117], [2269710895914989, 180, 98], [4654920941918737, 185, 117], [2592751373117576, 173, 104], [76819961368847, 185, 99], [4282568126812900, 178, 94], [3592899533201994, 183, 114], [7780724520452984, 185, 98], [4592751664383018, 179, 122], [7581839975601836, 187, 93]] },
  },
};

export interface HeadSteps { name: string; h: number | null; ids: string[]; labels: string[]; hints: string[]; bits: number }

export const HEAD_STEPS: HeadSteps[] = [
  {
    "name": "author",
    "h": null,
    "ids": [
      "use-item-29370",
      "use-destruction-potion",
      "use-super-mana-potion",
      "use-dark-rune"
    ],
    "labels": [
      "Icon of the Silver Crescent",
      "Destruction Potion",
      "Super Mana Potion",
      "Dark Rune"
    ],
    "hints": [
      "Use it at the pull and whenever it is ready (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s.",
      "Use it at the pull and whenever it is ready (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own."
    ],
    "bits": 4184749204918886
  },
  {
    "name": "author",
    "h": 0,
    "ids": [
      "use-item-29370",
      "use-destruction-potion",
      "use-super-mana-potion",
      "use-dark-rune"
    ],
    "labels": [
      "Icon of the Silver Crescent",
      "Destruction Potion",
      "Super Mana Potion",
      "Dark Rune"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 0 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 0 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own."
    ],
    "bits": 4184749204918886
  },
  {
    "name": "author",
    "h": 6400,
    "ids": [
      "use-item-29370",
      "use-destruction-potion",
      "use-super-mana-potion",
      "use-dark-rune"
    ],
    "labels": [
      "Icon of the Silver Crescent",
      "Destruction Potion",
      "Super Mana Potion",
      "Dark Rune"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 6.4 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 6.4 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own."
    ],
    "bits": 5854257409919372
  },
  {
    "name": "author",
    "h": 46400,
    "ids": [
      "use-item-29370",
      "use-destruction-potion",
      "use-super-mana-potion",
      "use-dark-rune"
    ],
    "labels": [
      "Icon of the Silver Crescent",
      "Destruction Potion",
      "Super Mana Potion",
      "Dark Rune"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 46.4 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 46.4 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own."
    ],
    "bits": 3203066242897116
  },
  {
    "name": "author",
    "h": 300000,
    "ids": [
      "use-item-29370",
      "use-destruction-potion",
      "use-super-mana-potion",
      "use-dark-rune"
    ],
    "labels": [
      "Icon of the Silver Crescent",
      "Destruction Potion",
      "Super Mana Potion",
      "Dark Rune"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 300 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 300 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own."
    ],
    "bits": 303354831772305
  },
  {
    "name": "author-rev",
    "h": null,
    "ids": [
      "use-dark-rune",
      "use-super-mana-potion",
      "use-destruction-potion",
      "use-item-29370"
    ],
    "labels": [
      "Dark Rune",
      "Super Mana Potion",
      "Destruction Potion",
      "Icon of the Silver Crescent"
    ],
    "hints": [
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "Use it at the pull and whenever it is ready (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it at the pull and whenever it is ready (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s."
    ],
    "bits": 8856397378778048
  },
  {
    "name": "author-rev",
    "h": 0,
    "ids": [
      "use-dark-rune",
      "use-super-mana-potion",
      "use-destruction-potion",
      "use-item-29370"
    ],
    "labels": [
      "Dark Rune",
      "Super Mana Potion",
      "Destruction Potion",
      "Icon of the Silver Crescent"
    ],
    "hints": [
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 0 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 0 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s."
    ],
    "bits": 8856397378778048
  },
  {
    "name": "author-rev",
    "h": 6400,
    "ids": [
      "use-dark-rune",
      "use-super-mana-potion",
      "use-destruction-potion",
      "use-item-29370"
    ],
    "labels": [
      "Dark Rune",
      "Super Mana Potion",
      "Destruction Potion",
      "Icon of the Silver Crescent"
    ],
    "hints": [
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 6.4 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 6.4 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s."
    ],
    "bits": 320337030728266
  },
  {
    "name": "author-rev",
    "h": 46400,
    "ids": [
      "use-dark-rune",
      "use-super-mana-potion",
      "use-destruction-potion",
      "use-item-29370"
    ],
    "labels": [
      "Dark Rune",
      "Super Mana Potion",
      "Destruction Potion",
      "Icon of the Silver Crescent"
    ],
    "hints": [
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 46.4 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 46.4 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s."
    ],
    "bits": 571606745535824
  },
  {
    "name": "author-rev",
    "h": 300000,
    "ids": [
      "use-dark-rune",
      "use-super-mana-potion",
      "use-destruction-potion",
      "use-item-29370"
    ],
    "labels": [
      "Dark Rune",
      "Super Mana Potion",
      "Destruction Potion",
      "Icon of the Silver Crescent"
    ],
    "hints": [
      "When at least 1500 mana is missing (its largest gain): restores 900 to 1500 mana. 2 min cooldown of its own.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 300 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 300 s (off the GCD): +155 spell power for 20 s. 2 min cooldown; other items of its category wait 20 s."
    ],
    "bits": 2924015587068637
  },
  {
    "name": "quag",
    "h": null,
    "ids": [
      "use-destruction-potion",
      "use-item-29132",
      "use-super-mana-potion"
    ],
    "labels": [
      "Destruction Potion",
      "Scryer's Bloodgem",
      "Super Mana Potion"
    ],
    "hints": [
      "Use it at the pull and whenever it is ready (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it at the pull and whenever it is ready (off the GCD): +150 spell power for 15 s. 90 s cooldown; other items of its category wait 15 s.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion."
    ],
    "bits": 3803040700191398
  },
  {
    "name": "quag",
    "h": 0,
    "ids": [
      "use-destruction-potion",
      "use-item-29132",
      "use-super-mana-potion"
    ],
    "labels": [
      "Destruction Potion",
      "Scryer's Bloodgem",
      "Super Mana Potion"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 0 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 0 s (off the GCD): +150 spell power for 15 s. 90 s cooldown; other items of its category wait 15 s.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion."
    ],
    "bits": 3803040700191398
  },
  {
    "name": "quag",
    "h": 6400,
    "ids": [
      "use-destruction-potion",
      "use-item-29132",
      "use-super-mana-potion"
    ],
    "labels": [
      "Destruction Potion",
      "Scryer's Bloodgem",
      "Super Mana Potion"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 6.4 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 6.4 s (off the GCD): +150 spell power for 15 s. 90 s cooldown; other items of its category wait 15 s.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion."
    ],
    "bits": 1871661271883385
  },
  {
    "name": "quag",
    "h": 46400,
    "ids": [
      "use-destruction-potion",
      "use-item-29132",
      "use-super-mana-potion"
    ],
    "labels": [
      "Destruction Potion",
      "Scryer's Bloodgem",
      "Super Mana Potion"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 46.4 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 46.4 s (off the GCD): +150 spell power for 15 s. 90 s cooldown; other items of its category wait 15 s.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion."
    ],
    "bits": 7665178875097290
  },
  {
    "name": "quag",
    "h": 300000,
    "ids": [
      "use-destruction-potion",
      "use-item-29132",
      "use-super-mana-potion"
    ],
    "labels": [
      "Destruction Potion",
      "Scryer's Bloodgem",
      "Super Mana Potion"
    ],
    "hints": [
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 300 s (off the GCD): +120 spell power and +2% crit for 15 s. Shares the 2 min potion cooldown with Super Mana Potion.",
      "Use it while Heroism is up, then whenever it is ready once Heroism has ended at 300 s (off the GCD): +150 spell power for 15 s. 90 s cooldown; other items of its category wait 15 s.",
      "When at least 3000 mana is missing (its largest gain): restores 1800 to 3000 mana. Shares the 2 min potion cooldown with Destruction Potion."
    ],
    "bits": 4301340938574742
  }
];
