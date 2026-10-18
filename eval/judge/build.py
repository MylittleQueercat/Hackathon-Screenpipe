# Blinded judge packets: baseline r5 vs final stack r1, per phase and workflow, each in
# both orders. Stack timestamps shifted onto baseline's clock (per-phase anchor offset).
# The key (which letter is which run) stays here; packets go to /tmp/wfjudge.
# `build.py pair2`: baseline r6 vs stack r2, phase-1 receipts only (both runs were
# stopped in phase 2; r6 has no email workflow), packets in /tmp/wfjudge2, key2.json.
import json, random, re, shutil, sys
from datetime import datetime, timedelta
from pathlib import Path
EVAL = Path(__file__).resolve().parents[3]
PAIR2 = sys.argv[1:] == ["pair2"]
RUNS = {"base": EVAL / "runs/20261018T020827Z-baseline-receipts-s1-r5",
        "stack": EVAL / "runs/20261018T020907Z-idle-skip-receipts-s1-r1"}
OUT, KEY, CASES = Path("/tmp/wfjudge"), "key.json", [(p, j) for p in (1, 2, 3) for j in ("receipts", "email")]
if PAIR2:
    RUNS = {"base": EVAL / "runs/20261018T020847Z-baseline-receipts-s1-r6",
            "stack": EVAL / "runs/20261018T020927Z-idle-skip-receipts-s1-r2"}
    OUT, KEY, CASES = Path("/tmp/wfjudge2"), "key2.json", [(1, "receipts")]
STRIP = {"id", "createdAt", "lastReviewedAt", "revision", "evidenceVersion", "evidenceStatus", "quality",
         "rank", "catalogStatus", "screenshot", "screenshots"}
RANGE = re.compile(r"(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)?)(?:-(\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?))?")
TS = re.compile(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)?")
when = lambda s: datetime.fromisoformat(s.replace("Z", "+00:00")) if s[-1] == "Z" or "+" in s[10:] else datetime.fromisoformat(s + "+00:00")

seeded = {k: [json.loads(l) for l in open(r / "seeded.jsonl")] for k, r in RUNS.items()}
offsets = {}  # phase -> stack minus baseline
for p in (1, 2):
    d = {when(b["timestamp"]) - when(s["timestamp"]) for b, s in zip(seeded["base"], seeded["stack"])
         if b["phase"] == p and b["id"] == s["id"]}
    d = {x.total_seconds() for x in d}
    assert max(d) - min(d) < 0.01, (p, min(d), max(d))
    offsets[p] = -min(d)
rng = {k: (min(when(s["timestamp"]) for s in seeded["stack"] if s["phase"] == p),
           max(when(s["timestamp"]) for s in seeded["stack"] if s["phase"] == p)) for k, p in ((1, 1), (2, 2))}

def shift(text: str) -> str:
    """Stack timestamps onto baseline's clock: a time naming a stack capture (to the
    second, truncated, or to the millisecond) becomes that capture's baseline time at the
    same precision; any other time (cycle windows) moves by the phase's anchor offset.
    The end of a range written as `...T02:14:51-02:15:24Z` is shifted the same way."""
    def conv(s):
        t = when(s)
        frac = "." in s
        hit = next((b for b, x in zip(seeded["base"], seeded["stack"])
                    if (x["timestamp"][:23] == s[:23] if frac else x["timestamp"][:19] == s[:19])), None)
        if hit:
            u = when(hit["timestamp"])
        else:
            p = 2 if t >= rng[2][0] - timedelta(minutes=30) else 1
            u = t - timedelta(seconds=offsets[p])
        out = u.strftime("%Y-%m-%dT%H:%M:%S") + (f".{u.microsecond // 1000:03d}" if frac else "")
        return out + s[19:].lstrip(".0123456789")  # the same zone suffix (Z, +00:00 or none)
    def one(m):
        full, tail = m.group(1), m.group(2)
        out = conv(full)
        if tail:
            end = conv(full[:11] + tail.rstrip("Z") + ("Z" if tail.endswith("Z") else ""))
            out = out + "-" + end[11:]
        return out
    return RANGE.sub(one, text)

def clean(v):
    if isinstance(v, dict): return {k: clean(x) for k, x in v.items() if k not in STRIP}
    if isinstance(v, list): return [clean(x) for x in v]
    return re.sub(r"/Users/Shared/wfeval/live\d*", "/Users/Shared/wfeval/live", v) if isinstance(v, str) else v

def doc(run, phase, job):
    res = [json.loads(l) for l in open(RUNS[run] / "results.jsonl")][phase - 1]
    title = next(t for t, j in res["workflows_by_job"].items() if j == job)
    w = next(w for w in json.loads((RUNS[run] / f"phase{phase}/catalog.json").read_text())["analysis"]["workflows"]
             if w["title"] == title)
    text = json.dumps(clean(w), indent=1, ensure_ascii=False)
    return shift(text) if run == "stack" else text

if OUT.exists(): shutil.rmtree(OUT)
OUT.mkdir()
frames = {p: json.loads((EVAL / f"data/receipts-s1/phase{p}.json").read_text())["frames"] for p in (1, 2)}
rows, i = [], 0
for p in (1, 2):
    for f in frames[p]:
        s = seeded["base"][i]; i += 1
        assert s["phase"] == p and s["app_name"] == f["app_name"]
        rows.append({"id": s["id"], "phase": p, "time": s["timestamp"], "app": f["app_name"], "window": f.get("window_name"),
                     "url": f.get("browser_url"), "trigger": f.get("capture_trigger"), "planted_job": f.get("owner"),
                     "planted_run": f.get("run"), "planted_step": f.get("step"), "text": f.get("accessibility_text")})
(OUT / "history-phase1.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows if r["phase"] == 1))
(OUT / "history-phase1-2.jsonl").write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows))
shutil.copy(EVAL / "data/receipts-s1/truth.json", OUT / "truth.json")
(OUT / "BRIEF.md").write_text((Path(__file__).parent / "BRIEF.md").read_text().replace("/tmp/wfjudge/", f"{OUT}/"))

r = random.Random(20261018)
key, cases = {}, []
for phase, job in CASES:
    if True:
        first = r.choice(["base", "stack"])
        for order, x in (("a", first), ("b", "stack" if first == "base" else "base")):
            y = "stack" if x == "base" else "base"
            name = f"case-{len(cases) + 1:02d}"
            d = OUT / name; d.mkdir()
            (d / "X.json").write_text(doc(x, phase, job)); (d / "Y.json").write_text(doc(y, phase, job))
            key[name] = {"phase": phase, "job": job, "X": x, "Y": y, "pair": f"p{phase}-{job}", "order": order}
            cases.append(name)
# shuffle case numbering so a/b orders of one pair are not adjacent
names = cases[:]; r.shuffle(names)
final = {}
mapping = dict(zip(names, [f"j{n:02d}" for n in range(1, len(names) + 1)]))
for old, new in mapping.items():
    (OUT / old).rename(OUT / new); final[new] = key[old]
    (OUT / new / "case.json").write_text(json.dumps({"case": new, "phase": key[old]["phase"], "job": key[old]["job"],
        "history": "history-phase1.jsonl" if key[old]["phase"] == 1 else "history-phase1-2.jsonl"}))
(OUT / "results").mkdir()
(Path(__file__).parent / KEY).write_text(json.dumps(final, indent=1))
print(json.dumps(offsets), len(rows), sorted(final))
