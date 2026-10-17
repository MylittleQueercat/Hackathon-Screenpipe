from wfeval.grade import grade_phase, idle_churn


def frame(seeded, owner, phase=1, app=None, nth=0, day_run=None):
    xs = [f for f in seeded if f["owner"] == owner and f["phase"] == phase and (app is None or f["app_name"] == app)
          and (day_run is None or f["run"] == day_run)]
    return xs[nth % len(xs)]


def workflow(wid, title, frames, text="", apps=None, revision=1):
    ev = [{"timestamp": f["timestamp"], "app": f["app_name"]} for f in frames]
    return {"id": wid, "title": title, "description": text, "revision": revision, "apps": apps or [],
            "stages": [{"name": "Rename", "description": text, "evidence": ev[:len(ev) // 2] or ev,
                        "procedure": [], "apps": apps or []},
                       {"name": "Log", "description": "", "evidence": ev[len(ev) // 2:], "procedure": []}],
            "evidence": ev, "quality": {"grade": "strong", "distinctDays": 4}}


def receipts_wf(seeded, text, wid="wf-1", revision=1, phase=1):
    fs = [frame(seeded, "receipts", phase, nth=i * 7) for i in range(8)]
    return workflow(wid, "File receipts", fs, text, apps=["Finder", "Preview", "TextEdit"], revision=revision)


GOOD = ("Open the scan in Preview, rename it DATE_NAME_TYPE in Finder, add a row to tracker.csv. "
        "Missing date: file as UNKNOWN-DATE. Duplicate: mark duplicate. Over 500: review needed. "
        "Unknown type: look up client-types.txt.")


def email_wf(seeded):
    return workflow("wf-2", "Save attachments", [frame(seeded, "email", nth=i * 5) for i in range(6)], "save and reply")


def test_perfect_phase1(built, seeded):
    _, truth = built
    g = grade_phase(1, {"analysis": {"workflows": [receipts_wf(seeded, GOOD), email_wf(seeded)]}}, seeded, truth)
    failed = {k: v for k, v in g["checks"].items() if v["pass"] is False}
    assert not failed, failed
    assert g["score"] == 1.0 and not g["mistakes"]


def test_empty_catalog(built, seeded):
    _, truth = built
    g = grade_phase(1, {"analysis": {"workflows": []}}, seeded, truth)
    assert g["checks"]["found"]["pass"] is False
    assert g["checks"]["one_off_unpublished"]["pass"] is True
    assert g["mistakes"]["job_missed"] == 2


def test_duplicate_one_off_noise_and_invented(built, seeded):
    _, truth = built
    printer = workflow("wf-3", "Printer", [frame(seeded, "printer", nth=i) for i in range(4)])
    bad = receipts_wf(seeded, GOOD, wid="wf-4")
    bad["apps"].append("Discord")
    bad["stages"][0]["apps"] = ["Discord"]
    bad["evidence"].append({"timestamp": "2026-10-01T00:00:00Z", "app": "Finder"})
    cat = {"analysis": {"workflows": [receipts_wf(seeded, GOOD), bad, printer, email_wf(seeded)]}}
    g = grade_phase(1, cat, seeded, truth)
    assert g["checks"]["no_duplicate"]["pass"] is False
    assert g["checks"]["one_off_unpublished"]["pass"] is False
    assert g["checks"]["noise_excluded"]["pass"] is False
    assert g["checks"]["evidence_resolves"]["pass"] is False
    assert {"duplicate_workflow", "one_off_published", "noise_as_step", "invented_evidence"} <= set(g["mistakes"])


def test_merged_jobs(built, seeded):
    _, truth = built
    fs = [frame(seeded, "receipts", nth=i * 9) for i in range(4)] + [frame(seeded, "email", nth=i * 4) for i in range(4)]
    g = grade_phase(1, {"analysis": {"workflows": [workflow("wf-5", "Paperwork", fs, GOOD)]}}, seeded, truth)
    assert g["checks"]["email_separate"]["pass"] is False
    assert g["mistakes"].get("jobs_merged") == 1


def test_keywords_ignore_quotes(built, seeded):
    _, truth = built
    w = receipts_wf(seeded, "Rename the scan and add a tracker.csv row.")
    w["stages"][0]["procedure"] = [{"text": "Rename in Finder", "quote": "UNKNOWN-DATE_Green-Market_receipt.pdf",
                                    "timestamp": w["evidence"][0]["timestamp"], "app": w["evidence"][0]["app"]}]
    g = grade_phase(1, {"analysis": {"workflows": [w]}}, seeded, truth)
    assert g["checks"]["missing_date"]["pass"] is False


def test_drift(built, seeded):
    _, truth = built
    p1 = grade_phase(1, {"analysis": {"workflows": [receipts_wf(seeded, GOOD)]}}, seeded, truth)
    updated = receipts_wf(seeded, GOOD + " From the rule update: TYPE_DATE_NAME.", revision=2)
    g = grade_phase(2, {"analysis": {"workflows": [updated]}}, seeded, truth, p1["attributed"])
    assert g["checks"]["drift"]["pass"] is True
    forked = receipts_wf(seeded, "New naming TYPE_DATE_NAME", wid="wf-9", phase=2)
    g = grade_phase(2, {"analysis": {"workflows": [receipts_wf(seeded, GOOD), forked]}}, seeded, truth, p1["attributed"])
    assert g["checks"]["drift"]["pass"] is False and g["mistakes"]["drift_forked"] == 1


def test_idle_churn():
    a = {"analysis": {"workflows": [{"id": "1", "revision": 1}]}}
    b = {"analysis": {"workflows": [{"id": "1", "revision": 2}, {"id": "2", "revision": 1}]}}
    assert idle_churn(a, b) == {"created": 1, "updated": 1}
    assert idle_churn(a, a) == {"created": 0, "updated": 0}
