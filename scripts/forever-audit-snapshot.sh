#!/usr/bin/env bash
# Seeded snapshot of the Forever simulator outputs for the audit run: bash scripts/forever-audit-snapshot.sh <out_dir>
set -euo pipefail
out="${1:?usage: forever-audit-snapshot.sh <out_dir>}"
mkdir -p "$out"
cd "$(dirname "$0")/.."
common="--profile average --mobs 1 --sessions 100 --seed 1"
run() { local name="$1"; shift; echo "== $name" >&2; npm run -s "$@" > "$out/$name.txt"; echo "$name.txt" >> "$out/index.txt"; }
: > "$out/index.txt"
run run forever:run -- --levels 40,50,59 $common
run ep forever:ep -- --all --levels 40,50,59 $common
run duel-demopact-vs-aff-wrack forever:duel -- --a DEMO_PACT_R1 --b AFF_WRACK --levels 40-59 $common
run duel-dtss-vs-aff-draintank forever:duel -- --a DT_SS --b AFF_DRAINTANK --levels 40-59 $common
state="$(mktemp -d)/discover-state.json"
run discover forever:discover -- --level 40 --quick --seed 1 --fresh --state "$state"
sed -E "s/run time [0-9]+ min/run time N min/" reports/forever_discover_L40_quick.md > "$out/discover-report.md"
cp reports/forever_discover_L40_quick.json "$out/discover-report.json"
git checkout -- reports/forever_discover_L40_quick.md reports/forever_discover_L40_quick.json 2>/dev/null || true
echo "snapshot written to $out" >&2
