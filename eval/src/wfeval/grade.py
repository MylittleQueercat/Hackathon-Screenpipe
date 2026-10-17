"""Deterministic grades for one phase of a run: which published workflow is which job,
then each check of the truth file (DATA.md), with mistake tags (MISTAKES.md).

A workflow is attributed to a job through the evidence it cites: every `(timestamp,
app)` in its evidence, stage evidence and procedure resolves to a seeded frame, whose
hidden owner is the job. Keyword checks read only what the agents wrote (titles,
descriptions, steps, variations, questions), never quoted evidence: a quote copies
screen text, so matching it would credit the history rather than the workflow.
"""

from __future__ import annotations

import json
from collections import Counter
from datetime import datetime
from pathlib import Path

NOISE = "noise"
TRACKED = {"unexpected_workflow", "idle_churn", "untriaged"}  # reported, never scored


def ts(value: str) -> float | None:
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (AttributeError, ValueError):
        return None


class Frames:
    """Seeded frames by second, to resolve cited evidence within a second."""

    def __init__(self, seeded: list[dict]):
        self.by_second: dict[int, list[dict]] = {}
        for f in seeded:
            t = ts(f["timestamp"])
            f = {**f, "_t": t}
            self.by_second.setdefault(int(t), []).append(f)

    def resolve(self, timestamp: str, app: str) -> dict | None:
        t = ts(timestamp)
        if t is None:
            return None
        best = None
        for s in (int(t) - 1, int(t), int(t) + 1):
            for f in self.by_second.get(s, []):
                if (f["app_name"] or "").lower() == (app or "").lower() and abs(f["_t"] - t) <= 1.0:
                    if best is None or abs(f["_t"] - t) < abs(best["_t"] - t):
                        best = f
        return best


def cited(w: dict) -> list[tuple[str, str]]:
    points = [(e.get("timestamp"), e.get("app")) for e in w.get("evidence") or []]
    for stage in w.get("stages") or []:
        points += [(e.get("timestamp"), e.get("app")) for e in stage.get("evidence") or []]
        points += [(p.get("timestamp"), p.get("app")) for p in stage.get("procedure") or []]
    return [(t, a) for t, a in points if t and a]


def authored(w: dict) -> str:
    parts = [w.get(k) or "" for k in ("title", "description", "trigger", "outcome")]
    for k in ("variations", "openQuestions", "limitations", "handoffs"):
        parts += [str(x) for x in w.get(k) or []]
    for b in w.get("bottlenecks") or []:
        parts += [str(b.get("label") or ""), str(b.get("detail") or "")]
    for stage in w.get("stages") or []:
        parts += [stage.get("name") or "", stage.get("description") or ""]
        parts += [str(x) for x in stage.get("openQuestions") or []]
        parts += [p.get("text") or "" for p in stage.get("procedure") or []]
    return "\n".join(str(p) for p in parts if p)


def apps_of(w: dict) -> set[str]:
    apps = {a.lower() for a in w.get("apps") or []}
    for stage in w.get("stages") or []:
        apps |= {a.lower() for a in stage.get("apps") or []}
        apps |= {(e.get("app") or "").lower() for e in stage.get("evidence") or []}
    return apps


def attribute(workflows: list[dict], frames: Frames, jobs: set[str]) -> list[dict]:
    out = []
    for w in workflows:
        points = cited(w)
        owners = Counter()
        unresolved = 0
        for t, a in points:
            f = frames.resolve(t, a)
            if f is None:
                unresolved += 1
            else:
                owners[f["owner"]] += 1
        work = {o: n for o, n in owners.items() if o != NOISE}
        total = sum(work.values())
        job = max(work, key=work.get) if total else (NOISE if owners else None)
        share = work.get(job, 0) / total if total else 0.0
        merged = sorted(o for o, n in work.items() if total and n / total >= 0.25)
        out.append({"id": w.get("id"), "title": w.get("title"), "revision": w.get("revision"),
                    "job": job if job in jobs else (NOISE if job == NOISE else None),
                    "share": round(share, 3), "owners": dict(owners), "merged": merged if len(merged) > 1 else [],
                    "cited": len(points), "unresolved": unresolved,
                    "quality": (w.get("quality") or {}).get("grade"),
                    "days": (w.get("quality") or {}).get("distinctDays"),
                    "text": authored(w), "apps": sorted(apps_of(w))})
    return out


def has_any(text: str, words: list[str]) -> bool:
    low = text.lower()
    return any(w.lower() in low for w in words)


def grade_phase(phase: int, catalog: dict, seeded: list[dict], truth: dict,
                previous: list[dict] | None = None) -> dict:
    """`previous`: the attributed workflows of the phase before, for drift."""
    workflows = (catalog.get("analysis") or {}).get("workflows") or []
    jobs = set(truth["jobs"])
    attributed = attribute(workflows, Frames(seeded), jobs)
    of = lambda job: [a for a in attributed if a["job"] == job]
    checks, tags = {}, Counter()

    for c in truth["checks"]:
        if c.get("phase") != phase and c["kind"] != "evidence":
            continue
        kind, job = c["kind"], c.get("job")
        mine = of(job) if job else []
        text = "\n".join(a["text"] for a in mine)
        result, reason = None, ""
        if kind == "published":
            result = bool(mine)
            if not result:
                tags["job_missed"] += 1
        elif kind == "single":
            result = len(mine) == 1 if mine else None
            if mine and len(mine) > 1:
                tags["duplicate_workflow"] += 1
        elif kind == "keywords":
            if not mine:
                result, reason = False, "no workflow"
            elif "all" in c:
                missing = [g[0] for g in c["all"] if not has_any(text, g)]
                result, reason = not missing, f"missing {missing}" if missing else ""
            else:
                result = has_any(text, c["any"])
            if result is False:
                tags["steps_incomplete" if c["id"] == "steps" else f"exception_missed:{c['id']}"] += 1
        elif kind == "absent_app":
            if mine:
                result = not any(c["app"].lower() in a["apps"] for a in mine)
                if not result:
                    tags["noise_as_step"] += 1
        elif kind == "drift":
            before = {a["id"] for a in previous or [] if a["job"] == job}
            if not before:
                result, reason = None, "no workflow before the change"
            else:
                same = [a for a in mine if a["id"] in before and has_any(a["text"], c["any"])]
                forked = [a for a in mine if a["id"] not in before and has_any(a["text"], c["any"])]
                result = bool(same)
                if not same:
                    tags["drift_forked" if forked else "drift_ignored"] += 1
        elif kind == "separate":
            merged = [a for a in attributed if job in a["merged"] and c["from"] in a["merged"]]
            result = bool(mine) and not merged
            if merged:
                tags["jobs_merged"] += 1
            elif not mine:
                tags["job_missed"] += 1
        elif kind == "unpublished":
            result = not mine
            if mine:
                tags["one_off_published"] += 1
        elif kind == "evidence":
            bad = sum(a["unresolved"] for a in attributed)
            result = bad == 0
            if bad:
                tags["invented_evidence"] += bad
        elif kind == "cost":
            result = None
        checks[c["id"]] = {"pass": result, **({"reason": reason} if reason else {})}

    for a in attributed:
        if a["job"] in (None, NOISE):
            tags["unexpected_workflow"] += 1
    scored = [v["pass"] for v in checks.values() if v["pass"] is not None]
    return {"phase": phase, "workflows": len(workflows), "checks": checks,
            "passed": sum(scored), "scored": len(scored),
            "score": round(sum(scored) / len(scored), 4) if scored else None,
            "mistakes": dict(sorted(tags.items())), "attributed": attributed}


def idle_churn(before: dict, after: dict) -> dict:
    """What an idle cycle changed in the catalog: it should change nothing."""
    old = {w["id"]: w.get("revision") for w in (before.get("analysis") or {}).get("workflows") or []}
    new = {w["id"]: w.get("revision") for w in (after.get("analysis") or {}).get("workflows") or []}
    return {"created": len(new.keys() - old.keys()),
            "updated": sum(1 for k in new.keys() & old.keys() if new[k] != old[k])}


def grade_run(run: Path) -> list[dict]:
    """Grades of every phase a run completed, from the files it kept."""
    truth = json.loads((run / "truth.json").read_text())
    seeded = [json.loads(l) for l in (run / "seeded.jsonl").read_text().splitlines()]
    out, previous, prev_catalog = [], None, None
    for phase_dir in sorted(run.glob("phase*")):
        meta = json.loads((phase_dir / "phase.json").read_text())
        catalog = json.loads((phase_dir / "catalog.json").read_text())
        phase = meta["phase"]
        g = grade_phase(phase, catalog, seeded, truth, previous)
        if phase == 3 and prev_catalog is not None:
            g["idle_changes"] = idle_churn(prev_catalog, catalog)
            if any(g["idle_changes"].values()):
                g["mistakes"]["idle_churn"] = sum(g["idle_changes"].values())
        g.update({"status": meta["status"], "cycle": meta.get("cycle_status"), "usage": meta.get("usage"),
                  "seconds": meta.get("seconds")})
        out.append(g)
        previous, prev_catalog = g["attributed"], catalog
    return out
