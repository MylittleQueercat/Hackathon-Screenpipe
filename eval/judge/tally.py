# Unblind the judges' results: per pair, the preference in both orders (counted only when
# both orders agree), and mean scores per metric and side. Offline.
# `tally.py pair2` for the second round (key2.json, /tmp/wfjudge2).
import json, statistics, sys
from pathlib import Path
PAIR2 = sys.argv[1:] == ["pair2"]
key = json.loads((Path(__file__).parent / ("key2.json" if PAIR2 else "key.json")).read_text())
R = Path("/tmp/wfjudge2/results" if PAIR2 else "/tmp/wfjudge/results")
M = ["faithful", "procedure", "exceptions", "rule_change", "usable", "calibration", "numbers", "clarity"]
res, missing = {}, []
for j, k in sorted(key.items()):
    f = R / f"{j}.json"
    if not f.exists(): missing.append(j); continue
    r = json.loads(f.read_text())
    side = {"X": k["X"], "Y": k["Y"], "tie": "tie"}
    pref = side[r["preference"]]
    scores = {k[L]: {m: (r["scores"][L].get(m) or {}).get("score") if r["scores"][L].get(m) else None for m in M} for L in "XY"}
    res[j] = {**k, "pref": pref, "strength": r["strength"], "reason": r["reason"], "scores": scores}
print("missing:", missing)
pairs = {}
for j, r in res.items(): pairs.setdefault(r["pair"], []).append((j, r))
print("\n| Pair | Judgment (order) | Preferred | Strength |\n|---|---|---|---|")
for p in sorted(pairs, key=lambda p: (p[1], p)):
    for j, r in sorted(pairs[p], key=lambda x: x[1]["order"]):
        print(f'| {p} | {j} ({r["order"]}: X={r["X"]}) | {r["pref"]} | {r["strength"]} |')
print("\n| Pair | Both orders agree | Verdict |\n|---|---|---|")
for p in sorted(pairs, key=lambda p: (p[1], p)):
    prefs = {r["pref"] for _, r in pairs[p]}
    print(f'| {p} | {"yes" if len(prefs) == 1 and len(pairs[p]) == 2 else "no"} | {prefs.pop() if len(prefs) == 1 else "inconsistent: " + "/".join(r["pref"] for _, r in pairs[p])} |')
print("\nMean score per metric (all judgments), base -> stack")
for m in M:
    v = {s: [r["scores"][s][m] for r in res.values() if r["scores"][s][m] is not None] for s in ("base", "stack")}
    if v["base"]: print(f'  {m:12} {statistics.mean(v["base"]):.2f} -> {statistics.mean(v["stack"]):.2f}  (n={len(v["base"])})')
print("\nPer pair mean (correctness = faithful, procedure, exceptions, rule_change), base -> stack")
for p in sorted(pairs, key=lambda p: (p[1], p)):
    c = {s: [r["scores"][s][m] for _, r in pairs[p] for m in M[:4] if r["scores"][s][m] is not None] for s in ("base", "stack")}
    a = {s: [r["scores"][s][m] for _, r in pairs[p] for m in M if r["scores"][s][m] is not None] for s in ("base", "stack")}
    print(f'  {p:12} correctness {statistics.mean(c["base"]):.2f} -> {statistics.mean(c["stack"]):.2f}; all {statistics.mean(a["base"]):.2f} -> {statistics.mean(a["stack"]):.2f}')
