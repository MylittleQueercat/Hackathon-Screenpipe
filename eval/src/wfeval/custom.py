"""Suites written as JSON files in `suites/`, next to the built-in ones in `stories.py`.

A developer describes a suite as data: the jobs it hides in a week of activity, what each
job looks like on screen (steps, each with the accessibility text of the screen), and the
checks that say what the workflow agents should find. This module turns that into the same
`Suite` object the built-in suites are, so generation, the rules in DATA.md (a job to find
runs on 3 or more days, key text is on screen, no answer on screen), seeding and grading are
shared, not reimplemented. Noise between runs is the built-in noise (browsing, chat, music).

    {
      "description": "Weekly report filing",
      "jobs": {"report": {"expect": "published", "summary": "File the weekly sales report"}},
      "phases": {
        "1": [{"offset": -3, "runs": [
          {"job": "report", "steps": [
            {"app": "Excel", "window": "sales.xlsx", "text": "Revenue\\n41,200", "seconds": 40},
            {"app": "Mail", "window": "Weekly report", "text": "To: finance", "seconds": 30}]}]}]
      },
      "checks": [{"id": "found", "job": "report", "phase": 1, "kind": "published"}]
    }

`phases` maps "1" (days with offset -6..-1) and optionally "2" (offset 0, new history after
the first cycle). Phase 3, an idle cycle, and the two checks every suite has
(`evidence_resolves`, `idle_cost`) are added here.
"""

from __future__ import annotations

import json
import random
import re
from pathlib import Path

from .screens import Screen, Step
from .stories import SUITES, Cast, Day, Noise, Run, Suite

ROOT = Path(__file__).resolve().parents[2]
SUITES_DIR = ROOT / "suites"
NAME = re.compile(r"^[a-z][a-z0-9-]{0,30}$")
TRIGGERS = {"click", "key_press", "window_focus", "scroll_stop", "idle"}
CHECK_KINDS = {"published", "single", "unpublished", "keywords", "absent_app", "drift", "separate"}
EXPECT = {"published", "unpublished"}


class SpecError(Exception):
    pass


def need(ok: bool, where: str, message: str) -> None:
    if not ok:
        raise SpecError(f"{where}: {message}")


def is_text_list(value) -> bool:
    return isinstance(value, list) and bool(value) and all(isinstance(w, str) and w.strip() for w in value)


def parse_screen(raw: dict, where: str) -> Screen:
    need(isinstance(raw, dict), where, "expected an object with app, window and text")
    text = raw.get("text")
    if isinstance(text, list):
        text = "\n".join(str(t) for t in text)
    for field in ("app", "window"):
        need(isinstance(raw.get(field), str) and raw[field].strip(), where, f"`{field}` is required")
    need(isinstance(text, str) and text.strip(), where, "`text` is required: what the screen shows")
    return Screen(raw["app"], raw["window"], text, raw.get("url"))


def parse_step(raw: dict, where: str) -> Step:
    need(isinstance(raw, dict), where, "expected an object")
    screens = raw.get("screens") or [raw]  # one screen can sit directly in the step
    need(isinstance(screens, list) and screens, where, "`screens` must be a non-empty list")
    seconds = raw.get("seconds")
    need(isinstance(seconds, (int, float)) and 5 <= seconds <= 600, where, "`seconds` must be between 5 and 600")
    trigger = raw.get("trigger", "click")
    need(trigger in TRIGGERS, where, f"`trigger` must be one of {sorted(TRIGGERS)}")
    return Step([parse_screen(s, f"{where}.screens[{i}]") for i, s in enumerate(screens)],
                float(seconds), trigger, key=raw.get("key"))


def parse_days(raw, phase: int, jobs: dict, where: str) -> list[Day]:
    need(isinstance(raw, list) and raw, where, "expected a non-empty list of days")
    days = []
    for i, d in enumerate(raw):
        at = f"{where}[{i}]"
        need(isinstance(d, dict), at, "expected {offset, runs}")
        offset = d.get("offset")
        if phase == 1:
            need(isinstance(offset, int) and -6 <= offset <= -1, at, "`offset` is days before today: -6 to -1")
        else:
            need(offset == 0, at, "phase 2 happens today: `offset` 0")
        runs = []
        need(isinstance(d.get("runs"), list) and d["runs"], at, "`runs` must be a non-empty list")
        for j, r in enumerate(d["runs"]):
            rat = f"{at}.runs[{j}]"
            need(isinstance(r, dict) and r.get("job") in jobs, rat, f"`job` must be one of {sorted(jobs)}")
            need(isinstance(r.get("steps"), list) and r["steps"], rat, "`steps` must be a non-empty list")
            runs.append(Run(r["job"], [parse_step(s, f"{rat}.steps[{k}]") for k, s in enumerate(r["steps"])]))
        days.append(Day(offset, runs))
    return days


def parse_checks(raw, jobs: dict, phases: set[int]) -> list[dict]:
    need(isinstance(raw, list) and raw, "checks", "expected a non-empty list")
    out, seen = [], {"evidence_resolves", "idle_cost"}
    for c in raw:
        cid = c.get("id") if isinstance(c, dict) else None
        need(isinstance(cid, str) and re.fullmatch(r"\w+", cid), "checks", f"id {cid!r}: letters, digits and underscores")
        need(cid not in seen, f"checks.{cid}", "this id is taken")
        seen.add(cid)
        where = f"checks.{cid}"
        need(c.get("kind") in CHECK_KINDS, where, f"`kind` must be one of {sorted(CHECK_KINDS)}")
        need(c.get("job") in jobs, where, f"`job` must be one of {sorted(jobs)}")
        need(c.get("phase") in phases, where, f"`phase` must be one of {sorted(phases)}")
        kind = c["kind"]
        if kind == "keywords":
            need(is_text_list(c.get("any")) or (isinstance(c.get("all"), list) and c["all"]
                 and all(is_text_list(g) for g in c["all"])), where,
                 "keywords needs `any` (a list of words) or `all` (a list of word lists)")
        if kind == "drift":
            need(c["phase"] == 2 and is_text_list(c.get("any")), where, "drift is a phase 2 check with an `any` list")
        if kind == "absent_app":
            need(isinstance(c.get("app"), str) and c["app"], where, "`app` is required")
        if kind == "separate":
            need(c.get("from") in jobs and c["from"] != c["job"], where, "`from` must be another job")
        if "on_screen" in c:
            need(is_text_list(c["on_screen"]), where, "`on_screen` must be a list of texts")
        keep = ("id", "kind", "job", "phase", "any", "all", "app", "from", "on_screen")
        out.append({k: c[k] for k in keep if k in c})
    return out


def parse(spec: dict, name: str):
    """A spec as a suite factory, `rng -> Suite`, the shape `SUITES` holds."""
    need(isinstance(spec, dict), name, "expected a JSON object")
    jobs = spec.get("jobs")
    need(isinstance(jobs, dict) and jobs, "jobs", "expected an object of job id to {expect, summary}")
    for job, j in jobs.items():
        need(re.fullmatch(r"[a-z][a-z0-9_]*", job) and job != "noise", f"jobs.{job}", "id: lower case letters, digits, _")
        need(isinstance(j, dict) and j.get("expect") in EXPECT, f"jobs.{job}", "`expect` is published or unpublished")
        need(isinstance(j.get("summary"), str) and j["summary"].strip(), f"jobs.{job}", "`summary` is required")
    raw_phases = spec.get("phases")
    need(isinstance(raw_phases, dict) and "1" in raw_phases and set(raw_phases) <= {"1", "2"},
         "phases", 'expected "1" (and optionally "2")')
    phases = {int(p): parse_days(d, int(p), jobs, f"phases.{p}") for p, d in raw_phases.items()}
    phases[3] = []
    checks = parse_checks(spec.get("checks"), jobs, set(phases))
    truth = {
        "suite": name,
        "jobs": {k: {key: v for key, v in j.items() if key in ("expect", "summary", "min_days")}
                 for k, j in jobs.items()},
        "checks": checks + [{"id": "evidence_resolves", "kind": "evidence"},
                            {"id": "idle_cost", "phase": 3, "kind": "cost"}],
    }

    def factory(rng: random.Random) -> Suite:
        return Suite(name, phases, truth, Noise(Cast()))
    return factory


def custom_suites() -> dict:
    """Every valid file in `suites/`. A broken one is left out here and reported by
    `problems()`; it never stops the built-in suites or the other custom ones."""
    out = {}
    for f in sorted(SUITES_DIR.glob("*.json")):
        try:
            out[f.stem] = load(f)
        except (SpecError, ValueError, OSError):
            pass
    return out


def load(file: Path):
    name = file.stem
    need(NAME.fullmatch(name) is not None, name, "the file name is the suite name: lower case letters, digits, -")
    need(name not in SUITES, name, "a built-in suite already has this name")
    return parse(json.loads(file.read_text()), name)


def problems() -> dict[str, str]:
    out = {}
    for f in sorted(SUITES_DIR.glob("*.json")):
        try:
            load(f)
        except (SpecError, ValueError, OSError) as e:
            out[f.stem] = str(e)
    return out


def all_suites() -> dict:
    return {**SUITES, **custom_suites()}
