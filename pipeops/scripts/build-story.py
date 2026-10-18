# screenpipe — AI that knows everything you've seen, said, or heard
# https://screenpipe.com
"""Build pipeops/src/data/story.json, the only data the story app reads, from real wfeval
artifacts: the receipts history and its planted truth, the complete baseline/stack pair
(per phase: checks, requests, time, per-agent requests, the request-log stream, the
published workflows), the second pair's phase 1, the negative controls (graded by the
real grader on a real catalog) and the LLM judge verdicts.

    python3 pipeops/scripts/build-story.py <eval dir with runs/ and judge/>
"""

import copy
import json
import re
import sys
from datetime import datetime
from pathlib import Path

EVAL = Path(sys.argv[1]).resolve()
sys.path.insert(0, str(EVAL / "src"))
from wfeval.grade import grade_phase  # noqa: E402

OUT = Path(__file__).resolve().parents[1] / "src/data/story.json"
RUNS = {"base": "20261018T020827Z-baseline-receipts-s1-r5", "stack": "20261018T020907Z-idle-skip-receipts-s1-r1"}
PAIR2 = {"base": "20261018T020847Z-baseline-receipts-s1-r6", "stack": "20261018T020927Z-idle-skip-receipts-s1-r2"}
JUDGE = EVAL / "judge"
AGENTS = ["workflow-discover", "workflow-maintain", "workflow-deepen", "workflow-review"]
CHECKS = {  # what each check asks, in plain words
    "found": "Receipt filing found as a workflow",
    "no_duplicate": "Found once, not twice",
    "steps": "Steps: rename and log in tracker.csv",
    "missing_date": "Exception: a receipt with no date",
    "duplicate": "Exception: a receipt already filed",
    "high_value": "Exception: an amount over 500 flagged",
    "type_lookup": "Exception: unknown type looked up",
    "noise_excluded": "Background noise not made a workflow",
    "email_separate": "Email filing found, kept separate",
    "one_off_unpublished": "One-off printer setup not published",
    "evidence_resolves": "Every cited capture exists",
    "drift": "New naming rule updates the workflow",
    "idle_cost": "Nothing new: nothing published",
}
when = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00"))
lines = lambda p: [json.loads(l) for l in p.read_text().splitlines() if l.strip()]


def clip(s, n):
    s = re.sub(r"\s+", " ", s or "").strip()
    return s if len(s) <= n else s[: n - 1].rstrip() + "…"


def first_sentence(s, n=150):
    s = (s or "").removeprefix("Workflow operation failed: ")
    return clip(re.split(r"(?<=[.!?])\s", s.strip(), maxsplit=1)[0], n)


def workflow(w, job):
    return {
        "title": w["title"], "job": job, "trigger": clip(w.get("trigger"), 220), "outcome": clip(w.get("outcome"), 260),
        "confidence": w.get("confidence"),
        "stages": [{"name": s["name"], "steps": [{"text": clip(p.get("text"), 200), "quote": clip(p.get("quote"), 90),
                                                   "at": p.get("timestamp"), "app": p.get("app")}
                                                  for p in s.get("procedure") or []]} for s in w.get("stages") or []],
        "variations": [clip(v, 220) for v in w.get("variations") or []],
        "evidence": [{"at": e["timestamp"], "app": e["app"], "text": clip(e.get("detail"), 420)} for e in w.get("evidence") or []],
    }


def run(run_id, phases=(1, 2, 3)):
    r = EVAL / "runs" / run_id
    results = {d["phase"]: d for d in lines(r / "results.jsonl")}
    log = lines(r / "requests.jsonl")
    anchors = {}  # a phase starts when its cycle does: the end of the window that cycle reads
    for p in phases:
        f = r / f"phase{p}/phase.json"
        cycle = (json.loads(f.read_text()).get("cycle") or {}) if f.exists() else {}
        if cycle.get("end"):
            anchors[p] = when(cycle["end"])
    out = []
    for p in phases:
        if p not in results:
            continue
        d, lo, hi = results[p], anchors.get(p), anchors.get(p + 1)
        if p > 1 and lo and anchors.get(p - 1) and lo <= anchors[p - 1]:
            lo = None  # no new cycle started (an idle phase reports the last one): nothing ran
        if hi and lo and hi <= lo:
            hi = None
        rows = [e for e in log if lo and e.get("at") and lo <= when(e["at"]) and (hi is None or when(e["at"]) < hi)]
        stream = []
        for e in rows:
            t = round((when(e["at"]) - lo).total_seconds(), 1)
            if t > (d.get("seconds") or 0) + 0.5:
                continue  # after the harness closed the phase's window: not in its counts
            agent = (e.get("task") or "").removeprefix("workflow-")
            if e["type"] == "usage":  # a completed model reply: what the harness counts as a request
                stream.append({"t": t, "agent": agent, "kind": "request"})
                if e.get("stop") == "length":
                    stream.append({"t": t, "agent": agent, "kind": "cut"})
            elif e["type"] == "tool":
                stream.append({"t": t, "agent": agent, "kind": "tool", "tool": e.get("tool")})
            elif e["type"] == "workspace":
                stream.append({"t": t, "agent": agent, "kind": "workflows", "action": e.get("action"), "ok": bool(e.get("ok")),
                               "reply": first_sentence(e.get("reply")) if not e.get("ok") else None})
        u = d["usage"]
        catalog = json.loads((r / f"phase{p}/catalog.json").read_text())
        jobs = d.get("workflows_by_job") or {}
        out.append({
            "phase": p, "seconds": d.get("seconds"), "requests": u.get("requests", 0), "output": u.get("output", 0),
            "agents": {a.removeprefix("workflow-"): (u.get("by_task") or {}).get(a, {}).get("requests", 0) for a in AGENTS},
            "rejected": (u.get("workspace") or {}).get("failed", 0),
            "cut": sum(1 for e in stream if e["kind"] == "cut"),
            "checks": {k: v.get("pass") for k, v in d["checks"].items()},
            "passed": d.get("passed"), "scored": d.get("scored"), "mistakes": d.get("mistakes") or {},
            "workflows": [workflow(w, jobs.get(w["title"])) for w in (catalog.get("analysis") or {}).get("workflows") or []],
            "stream": stream,
        })
    return out


def history():
    seeded = lines(EVAL / "runs" / RUNS["base"] / "seeded.jsonl")
    frames, i = [], 0
    for p in (1, 2):
        for f in json.loads((EVAL / f"data/receipts-s1/phase{p}.json").read_text())["frames"]:
            s = seeded[i]; i += 1
            assert s["phase"] == p and s["app_name"] == f["app_name"]
            frames.append({"at": s["timestamp"], "phase": p, "app": f["app_name"], "window": clip(f.get("window_name"), 60),
                           "job": f.get("owner"), "run": f.get("run"), "step": f.get("step")})
    truth = json.loads((EVAL / "data/receipts-s1/truth.json").read_text())
    return {"frames": frames, "jobs": {k: v["summary"] for k, v in truth["jobs"].items()}, "truth": truth}


def controls(truth):
    """Damage the baseline's phase-1 catalog the way a bad change could; the real grader
    says which checks it costs."""
    r = EVAL / "runs" / RUNS["base"]
    catalog = json.loads((r / "phase1/catalog.json").read_text())
    seeded = lines(r / "seeded.jsonl")
    jobs = next(d for d in lines(r / "results.jsonl") if d["phase"] == 1)["workflows_by_job"]
    of = lambda c, job: next(w for w in c["analysis"]["workflows"] if jobs.get(w["title"]) == job)
    dup = re.compile("|".join(map(re.escape, next(x for x in truth["checks"] if x["id"] == "duplicate")["any"])), re.I)

    def scrub(v):
        if isinstance(v, str): return dup.sub("", v)
        if isinstance(v, list): return [scrub(x) for x in v]
        if isinstance(v, dict): return {k: x if k in ("evidence", "quote", "timestamp", "app") else scrub(x) for k, x in v.items()}
        return v

    def drop_email(c): c["analysis"]["workflows"].remove(of(c, "email"))
    def cut_duplicate(c):
        ws = c["analysis"]["workflows"]; i = ws.index(of(c, "receipts")); ws[i] = scrub(ws[i])
    def invent(c): of(c, "receipts")["evidence"].append({"timestamp": "2026-10-16T03:00:00Z", "app": "Finder"})
    def merge(c):
        a, b = of(c, "receipts"), of(c, "email"); a["evidence"] += b["evidence"] * 2; c["analysis"]["workflows"] = [a]

    out = []
    for key, label, damage in [("drop_email", "Forget the email job", drop_email),
                               ("cut_duplicate", "Lose the duplicate exception", cut_duplicate),
                               ("invent", "Cite a capture that never happened", invent),
                               ("merge", "Merge the two jobs into one", merge)]:
        c = copy.deepcopy(catalog); damage(c)
        g = grade_phase(1, c, seeded, truth)
        out.append({"id": key, "label": label, "failed": sorted(k for k, v in g["checks"].items() if v["pass"] is False),
                    "mistakes": sorted(g["mistakes"])})
    g = grade_phase(1, catalog, seeded, truth)
    assert not [k for k, v in g["checks"].items() if v["pass"] is False]
    return out


def judge():
    M = ["faithful", "procedure", "exceptions", "rule_change", "usable", "calibration", "numbers", "clarity"]
    out = []
    for name, key, res in (("Complete pair", "key.json", "results"), ("Second pair", "key2.json", "results2")):
        k = json.loads((JUDGE / key).read_text())
        pairs = {}
        for j, c in k.items():
            r = json.loads((JUDGE / res / f"{j}.json").read_text())
            side = {"X": c["X"], "Y": c["Y"], "tie": "tie"}
            corr = {c[L]: [r["scores"][L][m]["score"] for m in M[:4] if r["scores"][L].get(m)] for L in "XY"}
            p = pairs.setdefault((c["phase"], c["job"]), {"phase": c["phase"], "job": c["job"], "orders": [], "base": [], "stack": []})
            p["orders"].append({"preferred": side[r["preference"]], "strength": r["strength"]})
            p["base"] += corr["base"]; p["stack"] += corr["stack"]
        rows = []
        for p in sorted(pairs.values(), key=lambda p: (p["phase"], p["job"] != "receipts")):
            prefs = {o["preferred"] for o in p["orders"]}
            rows.append({"phase": p["phase"], "job": p["job"], "orders": p["orders"],
                         "verdict": prefs.pop() if len(prefs) == 1 else "split",
                         "correctness": {s: round(sum(p[s]) / len(p[s]), 2) for s in ("base", "stack")}})
        out.append({"name": name, "rows": rows})
    return out


h = history()
story = {
    "suite": "receipts", "seed": 1, "model": "Claude Sonnet 5 (both sides)", "engine": "a8aaee2d6",
    "runs": RUNS, "pair2": PAIR2,
    "history": {"frames": h["frames"], "jobs": h["jobs"]},
    "checks": CHECKS,
    "base": run(RUNS["base"]), "stack": run(RUNS["stack"]),
    "pair2Runs": {"base": run(PAIR2["base"], (1,)), "stack": run(PAIR2["stack"], (1,))},
    "controls": controls(h["truth"]),
    "judge": judge(),
}
for s in ("base", "stack"):
    for p in story["pair2Runs"][s]:
        p.pop("stream"); p.pop("workflows")
text = json.dumps(story, ensure_ascii=False, separators=(",", ":"))
leak = re.search(r"/Users/(?!morgan)[A-Za-z]|eyJ[A-Za-z0-9_-]{20,}\.|sk-ant-", text)
assert not leak, f"refusing: {leak.group(0)!r} in story data"
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(text)
print(f"{OUT} {len(text) // 1024} KB")
