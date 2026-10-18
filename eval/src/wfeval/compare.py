"""Paired comparison of two variants on the same histories (suite, seed, phase; for stage
runs also the snapshot step and the agent), the n-th repeat of A against the n-th of B:
check pass rates, mistake tags, checks that flipped, pass^k, and usage. Only phases
both sides graded are paired; reruns never count (eval-sketch's rule).

Run an A/A comparison (baseline repeats against other baseline repeats) first: its flips
and token spread are the noise any claimed improvement has to exceed.
"""

from __future__ import annotations

import argparse
import json
import math
import statistics
from collections import Counter, defaultdict
from pathlib import Path

from .grade import truth_id

USAGE = ("agent_runs", "requests", "tool_calls", "input", "cacheRead", "output")


def history(r: dict) -> tuple:
    """What a result was measured on: a phase of a suite, or one agent on a snapshot step."""
    return (r["suite"], r["seed"], r.get("snapshot") or "", r.get("stage") or "")


def load(runs: list[Path]) -> dict[tuple, dict]:
    out = {}
    for run in runs:
        f = run / "results.jsonl"
        if not f.exists():
            continue
        truth = json.loads((run / "truth.json").read_text()) if (run / "truth.json").exists() else None
        for line in f.read_text().splitlines():
            r = json.loads(line)
            r.setdefault("truth", truth and truth_id(truth))
            if r["status"] not in ("rerun", "invalid"):
                out[(history(r), r["repeat"], r["phase"])] = r  # a later rerun replaces it
    return out


def by_order(results: dict[tuple, dict]) -> dict[tuple, dict]:
    """Key (history, n, phase), n counting each history's repeats in order, so the n-th
    repeat on one side pairs with the n-th on the other whatever their numbers."""
    repeats = defaultdict(set)
    for hist, repeat, _ in results:
        repeats[hist].add(repeat)
    order = {key: {r: n for n, r in enumerate(sorted(rs), 1)} for key, rs in repeats.items()}
    return {(hist, order[hist][repeat], phase): r for (hist, repeat, phase), r in results.items()}


def mcnemar(fixed: int, broken: int) -> float:
    """Exact two-sided p for the flips (binomial, p = 0.5)."""
    n = fixed + broken
    if not n:
        return 1.0
    k = min(fixed, broken)
    p = 2 * sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, p)


def pass_k(results: list[dict]) -> dict[str, float]:
    """Per check: the share of histories (suite, seed, phase) on which every repeat passed."""
    by = defaultdict(list)
    for r in results:
        for cid, c in r["checks"].items():
            if c["pass"] is not None:
                by[(cid, history(r), r["phase"])].append(c["pass"])
    per = defaultdict(list)
    for (cid, *_), passes in by.items():
        per[cid].append(all(passes))
    return {cid: round(sum(v) / len(v), 3) for cid, v in sorted(per.items())}


def describe(values: list[float]) -> str:
    if not values:
        return "-"
    m = statistics.mean(values)
    sd = statistics.stdev(values) if len(values) > 1 else 0.0
    return f"{m:,.0f} ± {sd:,.0f}"


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wfeval-compare")
    ap.add_argument("--a", type=Path, nargs="+", required=True)
    ap.add_argument("--b", type=Path, nargs="+", required=True)
    ap.add_argument("--totals", action="store_true", help="no per-check lines (holdout)")
    a = ap.parse_args(argv)
    A, B = by_order(load(a.a)), by_order(load(a.b))
    both = sorted(A.keys() & B.keys())
    print(f"{len(both)} paired phases ({len(A)} in A, {len(B)} in B)")
    if not both:
        return 1

    same_variant = {A[k]["variant"] for k in both} == {B[k]["variant"] for k in both}
    differ = sorted({name for k in both for name in set(A[k].get("prompts") or {}) | set(B[k].get("prompts") or {})
                     if (A[k].get("prompts") or {}).get(name) != (B[k].get("prompts") or {}).get(name)})
    if any("prompts" not in r for k in both for r in (A[k], B[k])):
        print("note: some runs predate prompt records; what their agents were given is unchecked")
    elif differ:
        print(("WARNING: an A/A pair whose agents were given different prompts (diff runs/*/prompts/): "
               if same_variant else "prompts that differ between A and B: ") + ", ".join(differ))
    truths = {r.get("truth") for k in both for r in (A[k], B[k])}
    if len(truths) > 1:
        print("WARNING: these runs were graded with different versions of the suite's truth; regrade"
              " them all with `wfeval grade --truth data/<suite>-s<seed>/truth.json` before comparing checks")
    if any(r.get("host_path_leaks") for k in both for r in (A[k], B[k])):
        print("WARNING: host paths reached the agents in some runs (run.json host_path_leaks)")

    checks = sorted({c for k in both for c in A[k]["checks"]} | {c for k in both for c in B[k]["checks"]})
    flips = Counter()
    print(f"\n{'check':22} {'A pass':>8} {'B pass':>8} {'fixed':>6} {'broken':>7} {'p':>6}")
    for cid in checks:
        pa = [A[k]["checks"].get(cid, {}).get("pass") for k in both]
        pb = [B[k]["checks"].get(cid, {}).get("pass") for k in both]
        pairs = [(x, y) for x, y in zip(pa, pb) if x is not None and y is not None]
        if not pairs:
            continue
        fixed = sum(1 for x, y in pairs if not x and y)
        broken = sum(1 for x, y in pairs if x and not y)
        flips["fixed"] += fixed
        flips["broken"] += broken
        if not a.totals:
            print(f"{cid:22} {sum(x for x, _ in pairs):>4}/{len(pairs):<3} {sum(y for _, y in pairs):>4}/{len(pairs):<3}"
                  f" {fixed:>6} {broken:>7} {mcnemar(fixed, broken):>6.3f}")
    print(f"\nall checks: fixed {flips['fixed']}, broken {flips['broken']}, "
          f"p = {mcnemar(flips['fixed'], flips['broken']):.3f}")

    staged = [cid for cid in checks if any("in_stages" in r["checks"].get(cid, {}) for k in both for r in (A[k], B[k]))]
    if staged and not a.totals:
        print("\nin_stages: a passing keyword check whose words are in the stages, not only in a"
              " variation, question or limitation (reported, not scored)")
        for cid in staged:
            ha = [A[k]["checks"].get(cid, {}).get("in_stages") for k in both]
            hb = [B[k]["checks"].get(cid, {}).get("in_stages") for k in both]
            pairs = [(x, y) for x, y in zip(ha, hb) if x is not None and y is not None]
            if pairs:
                print(f"  {cid:22} {sum(x for x, _ in pairs):>4}/{len(pairs):<3} -> {sum(y for _, y in pairs)}/{len(pairs)}")

    ta = sum((Counter(A[k]["mistakes"]) for k in both), Counter())
    tb = sum((Counter(B[k]["mistakes"]) for k in both), Counter())
    print("\nmistakes (A -> B)")
    for t in sorted(set(ta) | set(tb)):
        print(f"  {t:34} {ta.get(t, 0):>3} -> {tb.get(t, 0)}")

    print("\npass^k (every repeat passed)")
    ka, kb = pass_k([A[k] for k in both]), pass_k([B[k] for k in both])
    for cid in sorted(set(ka) | set(kb)):
        print(f"  {cid:22} {ka.get(cid, '-'):>6} -> {kb.get(cid, '-')}")

    print("\nusage per phase, mean ± sd (A -> B)")
    sources = {(r.get("usage") or {}).get("source", "pipe_logs") for k in both for r in (A[k], B[k])}
    if sources != {"request_log"}:
        print("  WARNING: some runs predate the request-log usage record; their tokens come from"
              " truncated pipe logs and undercount long agent runs. Do not compare tokens.")
    for hist, phase in sorted({(k[0], k[2]) for k in both}):
        keys = [k for k in both if (k[0], k[2]) == (hist, phase)]
        what = f"phase {phase}" + (f", {hist[3]} on {hist[2]}" if hist[3] else "")
        print(f"  {what} ({len(keys)} pairs)")
        for field in USAGE + ("seconds",):
            get = (lambda r: r.get("seconds")) if field == "seconds" else (lambda r: (r.get("usage") or {}).get(field))
            va = [get(A[k]) for k in keys if get(A[k]) is not None]
            vb = [get(B[k]) for k in keys if get(B[k]) is not None]
            print(f"    {field:12} {describe(va):>22} -> {describe(vb)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
