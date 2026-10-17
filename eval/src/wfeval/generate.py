"""Render a suite's stories into frames, deterministically from (suite, seed).

Writes `data/<suite>-s<seed>/`: `phase<N>.json` (frames with owners, not yet anchored),
`truth.json`, `manifest.json` (hashes). Refuses to write when a check's key text is on
no frame of its job, a job breaks its recurrence rule, or a leak term is on screen
(DATA.md rules 1, 3, 4).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import random
import re
import sys
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

from .screens import Step
from .stories import SUITES, Run, Suite

FRAMES_PER_MINUTE = 7.0
DAY_START, DAY_END = 9 * 3600, 18 * 3600
REPEAT_TRIGGERS = ["idle", "scroll_stop", "visual_change"]
LEAK = re.compile(r"\b(C\d{2}|duplicates?|noise|tests?|evals?|screenpipe|synthetic|fixtures?)\b", re.I)
DATE_TOKEN = re.compile(r"⟦d:(-?\d+)⟧")
ROOT = Path(__file__).resolve().parents[2]


class SuiteError(Exception):
    pass


@dataclass
class Cursor:
    app: str | None = None
    window: str | None = None


def render_step(rng: random.Random, step: Step, t: float, owner: str, run_id: str,
                cursor: Cursor) -> list[dict]:
    n = max(len(step.screens), round(step.seconds * FRAMES_PER_MINUTE / 60 * rng.uniform(0.7, 1.3)))
    counts = [1] * len(step.screens)
    for _ in range(n - len(step.screens)):
        # A screen that stays up (the last one, where the user reads or pauses) collects
        # most of the near-identical repeats.
        i = len(counts) - 1 if rng.random() < 0.6 else rng.randrange(len(counts))
        counts[i] += 1
    offsets = sorted(rng.uniform(0.3, step.seconds) for _ in range(n - 1))
    offsets = [round(rng.uniform(0.0, 0.3), 3)] + [round(o, 3) for o in offsets]

    frames, k = [], 0
    for screen, count in zip(step.screens, counts):
        for j in range(count):
            changed = (screen.app, screen.window) != (cursor.app, cursor.window)
            if j:
                trigger = rng.choice(REPEAT_TRIGGERS)
            elif changed:
                trigger = "window_focus"
            else:
                trigger = step.trigger
            events = []
            if not j and screen.app != cursor.app:
                events.append({"dt": 0.0, "event_type": "app_switch", "element_role": "AXApplication"})
            elif not j and changed:
                events.append({"dt": 0.0, "event_type": "window_focus", "element_role": "AXWindow"})
            if not k:
                events += [{"dt": round(0.1 * (i + 1), 3), **e} for i, e in enumerate(step.events)]
            frames.append({
                "t": round(t + offsets[k], 3), "app_name": screen.app, "window_name": screen.window,
                "browser_url": screen.url, "capture_trigger": trigger,
                "accessibility_text": screen.text, "events": events,
                "owner": step.owner or owner, "run": run_id, "step": step.key,
            })
            cursor.app, cursor.window = screen.app, screen.window
            k += 1
    return frames


def render_run(rng: random.Random, run: Run, t: float, run_id: str, cursor: Cursor) -> tuple[list[dict], float]:
    frames = []
    for step in run.steps:
        frames += render_step(rng, step, t, run.owner, run_id, cursor)
        t += step.seconds + rng.uniform(0.8, 4.0)
    return frames, t


def layout(rng: random.Random, suite: Suite, runs: list[Run], start: float, gaps: tuple[float, float],
           prefix: str, counter: dict[str, int], noise_p: float = 0.8) -> tuple[list[dict], float]:
    """Runs in story order, with noise before most of them and idle stretches between."""
    frames, t, cursor = [], start, Cursor()
    for run in runs + [None]:
        if run is None or rng.random() < noise_p:
            noise = suite.noise.segment(rng)
            counter["noise"] = counter.get("noise", 0) + 1
            f, t = render_run(rng, noise, t, f"{prefix}noise-{counter['noise']:02d}", cursor)
            frames += f
            t += rng.uniform(*gaps) * 60
        if run is not None:
            counter[run.owner] = counter.get(run.owner, 0) + 1
            f, t = render_run(rng, run, t, f"{run.owner}-{counter[run.owner]:02d}", cursor)
            frames += f
            t += rng.uniform(*gaps) * 60
    return frames, t


def build(suite_name: str, seed: int) -> tuple[dict[int, dict], dict]:
    rng = random.Random(f"{suite_name}:{seed}")
    suite = SUITES[suite_name](rng)
    phases: dict[int, dict] = {}
    counter: dict[str, int] = {}
    for phase, days in sorted(suite.phases.items()):
        frames = []
        if phase == 1:
            for day in days:
                start = DAY_START + rng.uniform(0, 50 * 60)
                f, end = layout(rng, suite, day.runs, start, (5, 75), "", counter)
                if end > DAY_END:
                    raise SuiteError(f"day {day.offset} runs past 18:00 ({end / 3600:.1f} h)")
                frames += [{**x, "day": day.offset} for x in f]
        elif days:
            # Phase 2 is dated relative to its seeding: the last frame a minute before.
            # Kept short: it has to fit between the last cycle's checkedThrough and seeding.
            f, end = layout(rng, suite, [r for d in days for r in d.runs], 0.0, (0.3, 1.5), "p2-",
                            counter, noise_p=0.4)
            shift = (f[-1]["t"] if f else 0.0) + 60
            frames = [{**x, "t": round(x["t"] - shift, 3), "day": 0} for x in f]
        phases[phase] = {"suite": suite_name, "seed": seed, "phase": phase,
                         "relative_to": "local_day" if phase == 1 else "seeding",
                         "span_seconds": round(-frames[0]["t"], 1) if phase > 1 and frames else None,
                         "frames": frames}
    truth = {**suite.truth, "seed": seed}
    verify(suite, phases, truth)
    return phases, truth


def verify(suite: Suite, phases: dict[int, dict], truth: dict) -> None:
    problems = []
    frames = [(p, f) for p, doc in phases.items() for f in doc["frames"]]
    for check in truth["checks"]:
        for text in check.get("on_screen", []):
            if not any(p == check["phase"] and f["owner"] == check["job"]
                       and (text in f["accessibility_text"] or text in f["window_name"]) for p, f in frames):
                problems.append(f"{check['id']}: no {check['job']} frame in phase {check['phase']} shows {text!r}")
    for job, spec in truth["jobs"].items():
        days = {f["day"] for p, f in frames if p == 1 and f["owner"] == job}
        if spec["expect"] == "published" and len(days) < 3:
            problems.append(f"{job}: on {len(days)} days, a job to find needs 3 (rule 1)")
        if spec["expect"] == "unpublished" and len(days) != 1:
            problems.append(f"{job}: a one-off must be on exactly 1 day, is on {len(days)}")
    allow = suite.leak_allow
    for p, f in frames:
        for field in ("window_name", "browser_url", "accessibility_text"):
            value = f[field] or ""
            for m in LEAK.finditer(value):
                if field == "accessibility_text" and (f["window_name"], m.group(1).lower()) in allow:
                    continue
                problems.append(f"leak {m.group(0)!r} in {field} of {f['app_name']} {f['window_name']!r}")
    if problems:
        raise SuiteError("\n".join(sorted(set(problems))))


def dump(value) -> bytes:
    return (json.dumps(value, ensure_ascii=False, sort_keys=True, indent=1) + "\n").encode()


def write(suite_name: str, seed: int, out: Path | None = None) -> Path:
    phases, truth = build(suite_name, seed)
    out = out or ROOT / "data" / f"{suite_name}-s{seed}"
    out.mkdir(parents=True, exist_ok=True)
    files = {f"phase{p}.json": dump(doc) for p, doc in phases.items()} | {"truth.json": dump(truth)}
    for name, data in files.items():
        (out / name).write_bytes(data)
    manifest = {"suite": suite_name, "seed": seed,
                "sha256": {n: hashlib.sha256(d).hexdigest() for n, d in sorted(files.items())},
                "frames": {p: len(doc["frames"]) for p, doc in phases.items()}}
    (out / "manifest.json").write_bytes(dump(manifest))
    return out


# --------------------------------------------------------------------------- anchoring

def anchor(doc: dict, now: datetime) -> list[dict]:
    """Seed-ready frames: absolute UTC timestamps, capture dates filled in, owners dropped.
    Phase 1 days are local days before `now`'s date; later phases end just before `now`.
    `now` must be timezone-aware (local)."""
    tz = now.tzinfo
    out = []
    for f in doc["frames"]:
        if doc["relative_to"] == "local_day":
            day = now.date() + timedelta(days=f["day"])
            ts = datetime.combine(day, datetime.min.time(), tz) + timedelta(seconds=f["t"])
        else:
            ts = now + timedelta(seconds=f["t"])
        local_day = ts.astimezone(tz).date()
        text = DATE_TOKEN.sub(lambda m: capture_date(local_day + timedelta(days=int(m.group(1)))),
                              f["accessibility_text"])
        events = [{k: v for k, v in e.items() if k != "dt"} |
                  {"timestamp": iso(ts + timedelta(seconds=e["dt"]))} for e in f["events"]]
        out.append({"timestamp": iso(ts), "app_name": f["app_name"], "window_name": f["window_name"],
                    "browser_url": f["browser_url"], "focused": True,
                    "capture_trigger": f["capture_trigger"], "accessibility_text": text,
                    "events": events})
    return out


def capture_date(d: date) -> str:
    return f"{d.day} {d.strftime('%b %Y')}"


def iso(ts: datetime) -> str:
    return ts.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="wfeval-generate")
    ap.add_argument("suite", choices=sorted(SUITES))
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", type=Path)
    args = ap.parse_args(argv)
    try:
        out = write(args.suite, args.seed, args.out)
    except SuiteError as e:
        print(f"refusing to write {args.suite}:\n{e}", file=sys.stderr)
        return 1
    print(out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
