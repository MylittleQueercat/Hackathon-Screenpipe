"""Hidden stories of a suite: the jobs, one-offs and noise of a synthetic week, and the
truth they imply. Nothing here is seeded as is: `generate.py` lays the runs out in time
and renders frames; the truth file never reaches the engine.

Times of day are local. Dates the user would see on screen as capture dates (Finder's
"Date Modified") are written as `⟦d:<offset>⟧`, days before the frame's own capture day,
and filled in when the history is anchored.
Document dates (on receipts) are fixed: people file paperwork days after it is issued.
"""

from __future__ import annotations

import random
from dataclasses import dataclass, field

from .screens import (Screen, Step, app_screen, browser, discord, finder, mail, preview,
                      spotify, textedit)

TRACKER_HEADER = "original_file,new_filename,date,amount,type,status,notes"


@dataclass
class Run:
    owner: str  # job id in the truth file, or "noise"
    steps: list[Step]


@dataclass
class Day:
    offset: int  # local days from the anchor; phase 2 is today (0)
    runs: list[Run]


@dataclass
class Suite:
    name: str
    phases: dict[int, list[Day]]  # phase 3 has no days: it measures an idle cycle
    truth: dict
    noise: "Noise"
    leak_allow: list[tuple[str, str]] = field(default_factory=list)  # (window, word)


@dataclass(frozen=True)
class Doc:
    name: str
    date: str | None  # None: the receipt has no legible date
    amount: str
    type: str  # "UNKNOWN" when the receipt doesn't say


@dataclass(frozen=True)
class Thread:
    sender: str
    address: str
    project: str
    subject: str
    attachment: str
    attachment_page: tuple[str, ...]
    body: tuple[str, ...]
    reply: str


@dataclass(frozen=True)
class Cast:
    """Everything a variant of the `receipts` suite may rename."""
    user: str = "Morgan Lee"
    home: str = "/Users/morgan"
    browser: str = "Zen"
    chat_server: str = "Weekend Climbers"
    docs: dict[str, Doc] = field(default_factory=lambda: {
        "acme": Doc("Acme Office Supplies", "2026-10-05", "84.20", "receipt"),
        "bluebird": Doc("Bluebird Books", "2026-10-06", "26.50", "receipt"),
        "transport": Doc("City Transport", "2026-10-08", "18.00", "receipt"),
        "market": Doc("Green Market", None, "41.75", "receipt"),
        "cafe": Doc("Metro Cafe", "2026-10-09", "15.40", "receipt"),
        "studio": Doc("Studio Equipment", "2026-10-10", "780.00", "receipt"),
        "pharmacy": Doc("Harbor Pharmacy", "2026-10-11", "12.90", "receipt"),
        "print": Doc("Lumen Print Shop", "2026-10-13", "32.00", "receipt"),
        "northwind": Doc("Northwind", "2026-10-14", "180.00", "UNKNOWN"),
        "hardware": Doc("Hardware Store", "2026-10-15", "76.20", "receipt"),
        "bakery": Doc("Lakeside Bakery", "2026-10-16", "9.80", "receipt"),
    })
    client_types: tuple[tuple[str, str], ...] = (
        ("Fabrikam", "invoice"), ("Northwind", "contract"), ("Contoso", "contract"))
    threads: tuple[Thread, ...] = (
        Thread("Alex Moreau", "alex@northbeam.co", "Atlas", "Project brief for Atlas",
               "Atlas-project-brief.pdf",
               ("Project Brief", "Project: Atlas", "Owner: Alex Moreau", "Status: Draft",
                "Kick-off: week 43"),
               ("Hi Morgan,", "Here is the brief for Atlas. Could you save it with the other",
                "project files and let me know once you have it?", "Thanks,", "Alex"),
               "Hi Alex, got it, saved with the Atlas files. Thanks, Morgan"),
        Thread("Priya Shah", "priya@northbeam.co", "Beacon", "Beacon budget v2",
               "Beacon-budget-v2.pdf",
               ("Budget", "Project: Beacon", "Version 2", "Total: 18,400 EUR",
                "Approved by: Priya Shah"),
               ("Morgan,", "Second version of the Beacon budget attached. Please file it",
                "in the project folder and confirm.", "Priya"),
               "Thanks Priya, filed in the Beacon folder. Morgan"),
        Thread("Alex Moreau", "alex@northbeam.co", "Atlas", "Atlas timeline",
               "Atlas-timeline.pdf",
               ("Timeline", "Project: Atlas", "Phase 1: research", "Phase 2: prototype",
                "Review: end of November"),
               ("Hi again,", "Timeline for Atlas attached, same place as the brief please.",
                "Alex"),
               "Saved next to the brief. Thanks Alex"),
    )


# ---------------------------------------------------------------------------- helpers

def typed(rng: random.Random, text: str, parts: int) -> list[str]:
    """Successive prefixes of `text` as a keystroke capture would see them."""
    cuts = sorted(rng.sample(range(1, len(text)), min(parts - 1, len(text) - 1)))
    return [text[:c] for c in cuts] + [text]


def click(role: str, name: str | None = None) -> dict:
    return {"event_type": "click", "element_role": role, "element_name": name}


def secs(rng: random.Random, lo: float, hi: float) -> float:
    return round(rng.uniform(lo, hi), 1)


def receipt_name(doc: Doc, rule: str = "DATE_NAME_TYPE") -> str:
    date = doc.date or "UNKNOWN-DATE"
    name = doc.name.replace(" ", "-")
    parts = {"DATE": date, "NAME": name, "TYPE": doc.type}
    return "_".join(parts[p] for p in rule.split("_")) + ".pdf"


class Paperwork:
    """The receipt folder and tracker as they change over the week."""

    def __init__(self, cast: Cast):
        self.cast = cast
        self.folder = f"{cast.home}/Documents/Paperwork"
        self.inbox = f"{self.folder}/Inbox"
        self.files: list[tuple[str, str, str]] = []  # (name, day offset, size)
        self.rows: list[str] = []
        self.next_scan = 412
        self.today = 0  # day offset of the run being written

    def arrive(self, rng: random.Random, offset: int, count: int) -> list[str]:
        scans = []
        for _ in range(count):
            name = f"scan-{self.next_scan:04d}.pdf"
            self.next_scan += 1
            self.files.append((name, str(offset), f"{rng.randint(90, 260)} KB"))
            scans.append(name)
        return scans

    def listing(self, renaming: tuple[str, str] | None = None) -> Screen:
        rows = [(n, f"⟦d:{int(d) - self.today}⟧", size, "PDF document")
                for n, d, size in sorted(self.files)]
        return finder(self.inbox, rows, renaming)

    def rename(self, old: str, new: str) -> None:
        self.files = [(new if n == old else n, d, s) for n, d, s in self.files]

    def tracker(self, partial: str | None = None) -> Screen:
        lines = [TRACKER_HEADER, *self.rows] + ([partial] if partial is not None else [])
        return textedit("tracker.csv", "\n".join(lines))


def doc_page(doc: Doc) -> list[str]:
    lines = ["Document Record", f"Name: {doc.name}"]
    if doc.date:
        lines.append(f"Date: {doc.date}")
    return lines + [f"Amount: {doc.amount} EUR", f"Type: {doc.type}"]


# ------------------------------------------------------------------------ receipt job

def receipt_run(rng: random.Random, pw: Paperwork, scan: str, doc: Doc, *,
                order: str = "rename_first", rule: str = "DATE_NAME_TYPE",
                status: str = "filed", notes: str = "", type_from: str | None = None,
                interruption: Step | None = None, lookup: bool = False) -> Run:
    filed = doc if not type_from else Doc(doc.name, doc.date, doc.amount, type_from)
    new = receipt_name(filed, rule)
    row = f"{scan},{new},{doc.date or ''},{doc.amount},{filed.type},{status},{notes}"

    steps = [Step([pw.listing()], secs(rng, 8, 20), "click", [click("AXRow", scan)], key="open"),
             Step([preview(scan, doc_page(doc))], secs(rng, 20, 50), "scroll_stop",
                  [click("AXButton", "Zoom In")] if rng.random() < 0.5 else [], key="read")]
    if lookup:
        types = "\n".join(["Client document types", ""] +
                          [f"{c}: {t}" for c, t in pw.cast.client_types])
        steps += [Step([finder(pw.folder, [("Inbox", "⟦d:0⟧", "--", "Folder"),
                                           ("client-types.txt", "⟦d:-30⟧", "1 KB", "Plain Text"),
                                           ("tracker.csv", "⟦d:0⟧", "2 KB", "CSV Document")])],
                       secs(rng, 6, 12), "click", [click("AXRow", "client-types.txt")]),
                  Step([textedit("client-types.txt", types)], secs(rng, 15, 30), "window_focus",
                       key="lookup")]

    def rename() -> list[Step]:
        start = pw.listing((scan, scan))
        screens = [pw.listing((scan, t)) for t in typed(rng, new.removesuffix(".pdf"), rng.randint(3, 5))]
        pw.rename(scan, new)
        done = pw.listing()
        return [Step([start], secs(rng, 3, 6), "click", [click("AXRow", scan)]),
                Step(screens + [done], secs(rng, 15, 35), "key_press", key="rename")]

    def track() -> list[Step]:
        screens = [pw.tracker(t) for t in typed(rng, row, rng.randint(4, 6))]
        pw.rows.append(row)
        return [Step(screens + [pw.tracker()], secs(rng, 30, 70), "key_press",
                     [click("AXTextArea")], key="track")]

    first, second = (rename, track) if order == "rename_first" else (track, rename)
    steps += first()
    if interruption:
        steps.append(interruption)
    steps += second()
    return Run("receipts", steps)


def duplicate_run(rng: random.Random, pw: Paperwork, scan: str, doc: Doc, original: str) -> Run:
    """The receipt was filed before: compare it with the filed copy, log it, don't rename."""
    row = f"{scan},,{doc.date},{doc.amount},{doc.type},duplicate,same as {original}"
    screens = [pw.tracker(t) for t in typed(rng, row, rng.randint(4, 6))]
    steps = [Step([pw.listing()], secs(rng, 8, 15), "click", [click("AXRow", scan)], key="open"),
             Step([preview(scan, doc_page(doc))], secs(rng, 20, 40), "scroll_stop", key="read"),
             Step([pw.listing()], secs(rng, 5, 10), "click", [click("AXRow", original)]),
             Step([preview(original, doc_page(doc))], secs(rng, 15, 30), "window_focus", key="compare"),
             Step([preview(scan, doc_page(doc))], secs(rng, 5, 12), "window_focus", key="compare")]
    pw.rows.append(row)
    steps.append(Step(screens + [pw.tracker()], secs(rng, 30, 60), "key_press",
                      [click("AXTextArea")], key="track"))
    return Run("receipts", steps)


def rule_notice(rng: random.Random, pw: Paperwork) -> Run:
    text = "\n".join(["Naming rule update", "", "From today, filed receipts are named:",
                      "Old: DATE_NAME_TYPE.pdf", "New: TYPE_DATE_NAME.pdf", "", "Example:",
                      receipt_name(pw.cast.docs["hardware"], "TYPE_DATE_NAME")])
    listing = finder(pw.folder, [("Inbox", "⟦d:0⟧", "--", "Folder"),
                                 ("client-types.txt", "⟦d:-30⟧", "1 KB", "Plain Text"),
                                 ("naming-rule-update.txt", "⟦d:0⟧", "1 KB", "Plain Text"),
                                 ("tracker.csv", "⟦d:-1⟧", "2 KB", "CSV Document")])
    return Run("receipts", [
        Step([listing], secs(rng, 6, 12), "click", [click("AXRow", "naming-rule-update.txt")]),
        Step([textedit("naming-rule-update.txt", text)], secs(rng, 25, 45), "window_focus",
             key="rule")])


# ------------------------------------------------------------------------- email job

def email_run(rng: random.Random, cast: Cast, thread: Thread, others: list[tuple[str, str, str]]) -> Run:
    rows = [(thread.sender, thread.subject, "09:12")] + others
    project = f"{cast.home}/Documents/Projects/{thread.project}"
    message = [f"From: {thread.sender} <{thread.address}>", f"To: {cast.user}",
               f"Subject: {thread.subject}", *thread.body,
               f"{thread.attachment}", "Save", "Quick Look"]
    existing = {"Atlas": [("Atlas-notes.txt", "⟦d:-12⟧", "4 KB", "Plain Text")],
                "Beacon": [("Beacon-budget-v1.pdf", "⟦d:-20⟧", "96 KB", "PDF document")]}
    folder_rows = existing.get(thread.project, []) + [(thread.attachment, "⟦d:0⟧", "188 KB", "PDF document")]
    if thread.project == "Atlas" and thread.attachment != "Atlas-project-brief.pdf":
        folder_rows.insert(0, ("Atlas-project-brief.pdf", "⟦d:-3⟧", "212 KB", "PDF document"))
    reply_window = f"Re: {thread.subject}"
    replies = [mail("Inbox", [], [f"To: {thread.sender}", f"Subject: Re: {thread.subject}", t],
                    reply_window) for t in typed(rng, thread.reply, rng.randint(3, 5))]
    return Run("email", [
        Step([mail("Inbox", rows, None, "Inbox")], secs(rng, 8, 20), "window_focus", key="inbox"),
        Step([mail("Inbox", rows, message, thread.subject)], secs(rng, 20, 45), "click",
             [click("AXRow", thread.subject)], key="message"),
        Step([preview(thread.attachment, list(thread.attachment_page))], secs(rng, 15, 35),
             "window_focus", [click("AXButton", "Quick Look")], key="attachment"),
        Step([app_screen("Mail", "Save", ["Save As:", thread.attachment, "Where:", thread.project,
                                          "Cancel", "Save"])], secs(rng, 6, 12), "click",
             [click("AXButton", "Save")], key="save"),
        Step([finder(project, folder_rows)], secs(rng, 6, 15), "window_focus", key="folder"),
        Step(replies, secs(rng, 20, 45), "key_press", [click("AXButton", "Reply")], key="reply"),
        Step([mail("Sent", [(thread.sender, f"Re: {thread.subject}", "09:31")], None, "Sent")],
             secs(rng, 3, 8), "click", [click("AXButton", "Send")], key="sent"),
    ])


# --------------------------------------------------------------------------- one-off

def printer_setup(rng: random.Random, cast: Cast) -> Run:
    b = cast.browser
    q = "laserjet m110w driver mac"
    return Run("printer", [
        Step([browser(b, f"{q} - Search", f"https://duckduckgo.com/?q={q.replace(' ', '+')}",
                      ["HP LaserJet M110w Printer Software and Driver Downloads | HP Support",
                       "support.hp.com", "HP Easy Start for macOS"])], secs(rng, 20, 40),
             "key_press", key="search"),
        Step([browser(b, "HP LaserJet M110w Software and Driver Downloads | HP Support",
                      "https://support.hp.com/drivers/laserjet-m110w",
                      ["Software and Drivers", "macOS 15", "HP Easy Start", "Download"])],
             secs(rng, 20, 40), "click", [click("AXButton", "Download")], key="download"),
        Step([finder(f"{cast.home}/Downloads", [("HP-Easy-Start.dmg", "⟦d:0⟧", "12.4 MB", "Disk Image")])],
             secs(rng, 8, 15), "click", [click("AXRow", "HP-Easy-Start.dmg")]),
        Step([app_screen("HP Easy Start", "HP Easy Start", ["Select a printer", "HP LaserJet M110w",
                                                           "Continue"]),
              app_screen("HP Easy Start", "HP Easy Start", ["Installing software", "62%"]),
              app_screen("HP Easy Start", "HP Easy Start", ["Setup complete", "Done"])],
             secs(rng, 90, 150), "click", [click("AXButton", "Continue")], key="install"),
        Step([app_screen("System Settings", "Printers & Scanners",
                         ["Printers & Scanners", "Default printer", "Last Printer Used",
                          "HP LaserJet M110w", "Idle", "Add Printer, Scanner or Fax…"])],
             secs(rng, 20, 40), "window_focus", key="settings"),
    ])


# ----------------------------------------------------------------------------- noise

ARTICLES = [
    ("Why the Rhine is running low again", "https://www.dw.com/en/rhine-low-water/a-701",
     ["Barges are carrying half loads", "Shipping costs rise", "Forecast for November"]),
    ("A beginner's guide to bouldering grades", "https://www.ukclimbing.com/articles/grades",
     ["Font and V scales", "Why grades feel soft indoors", "Comments (42)"]),
    ("Show HN: A tiny SQLite browser", "https://news.ycombinator.com/item?id=41890211",
     ["312 points", "Comments", "How does it compare to Datasette?"]),
    ("Sourdough hydration explained", "https://www.theperfectloaf.com/hydration",
     ["What hydration means", "70% vs 80%", "Flour matters"]),
    ("Weather Paris - 10 day forecast", "https://www.meteoblue.com/en/weather/14-days/paris",
     ["Mon 14° rain", "Tue 16° cloudy", "Wed 17° sunny"]),
    ("The best budget mechanical keyboards", "https://www.rtings.com/keyboard/reviews/best/budget",
     ["Keychron V1", "Royal Kludge RK84", "Typing feel"]),
    ("Night trains in Europe: the 2026 map", "https://www.seat61.com/night-trains.htm",
     ["Paris - Berlin", "Vienna - Rome", "Booking tips"]),
    ("Rust 1.94 release notes", "https://blog.rust-lang.org/2026/09/18/Rust-1.94.0.html",
     ["Stabilized APIs", "Cargo", "Compatibility notes"]),
]

CHAT = ["anyone up for Saturday?", "fontainebleau if it's dry", "I can drive", "rain forecast :(",
        "new set at the gym looks fun", "who has a spare crash pad", "pizza after?",
        "my shoulder is still sore", "lol", "send pics", "leaving at 8", "I'm in"]
PEOPLE = ["jules", "noor", "tomás", "ines", "kai"]
TRACKS = [("Midnight City", "M83"), ("Dreams", "Fleetwood Mac"), ("Nightcall", "Kavinsky"),
          ("Teardrop", "Massive Attack"), ("Sunset Lover", "Petit Biscuit"), ("Holocene", "Bon Iver")]


class Noise:
    """Unstructured activity between runs: nothing here repeats as trigger, steps, outcome."""

    def __init__(self, cast: Cast):
        self.cast = cast

    def chat(self, rng: random.Random) -> Step:
        when = f"{rng.randint(8, 21)}:{rng.randint(0, 59):02d}"
        msgs = [(rng.choice(PEOPLE), when, rng.choice(CHAT)) for _ in range(rng.randint(3, 6))]
        channel = rng.choice(["general", "outdoor", "random"])
        return Step([discord(self.cast.chat_server, channel, msgs)], secs(rng, 25, 35),
                    "window_focus", owner="noise")

    def segment(self, rng: random.Random) -> Run:
        steps = []
        for _ in range(rng.randint(1, 3)):
            kind = rng.choice(["article", "article", "chat", "music"])
            if kind == "article":
                title, url, page = rng.choice(ARTICLES)
                steps.append(Step([browser(self.cast.browser, title, url, page)], secs(rng, 40, 240),
                                  "scroll_stop", [{"event_type": "scroll"}]))
            elif kind == "chat":
                step = self.chat(rng)
                step.seconds = secs(rng, 30, 150)
                steps.append(step)
            else:
                track, artist = rng.choice(TRACKS)
                steps.append(Step([spotify(track, artist, "Focus Mix")], secs(rng, 8, 20), "click",
                                  [click("AXButton", "Next")]))
        return Run("noise", steps)


# ----------------------------------------------------------------------------- suite

def receipts(rng: random.Random, cast: Cast = Cast(), name: str = "receipts") -> Suite:
    pw = Paperwork(cast)
    noise = Noise(cast)
    d = cast.docs
    inbox_others = [("Northbeam HR", "Holiday calendar 2027", "Mon"),
                    ("Gym Bloc", "Your October membership", "Sun"),
                    ("Bank", "Statement available", "Fri")]
    acme = {}

    def day(offset: int, docs: list[str]) -> dict[str, str]:
        pw.today = offset
        return dict(zip(docs, pw.arrive(rng, offset, len(docs))))

    # Day -4: three ordinary receipts; the first Atlas email.
    s = day(-4, ["acme", "bluebird", "transport"])
    d4 = [receipt_run(rng, pw, s["acme"], d["acme"]),
          email_run(rng, cast, cast.threads[0], inbox_others),
          receipt_run(rng, pw, s["bluebird"], d["bluebird"]),
          receipt_run(rng, pw, s["transport"], d["transport"])]
    acme["filed"] = receipt_name(d["acme"])

    # Day -3: an undated receipt; one run logs before renaming; the printer one-off.
    s = day(-3, ["market", "cafe"])
    d3 = [receipt_run(rng, pw, s["market"], d["market"], notes="missing date"),
          printer_setup(rng, cast),
          receipt_run(rng, pw, s["cafe"], d["cafe"], order="track_first")]

    # Day -2: the Acme receipt again; a high amount; a chat in the middle of a run; email.
    s = day(-2, ["acme", "studio", "pharmacy"])
    d2 = [duplicate_run(rng, pw, s["acme"], d["acme"], acme["filed"]),
          email_run(rng, cast, cast.threads[1], inbox_others[1:]),
          receipt_run(rng, pw, s["studio"], d["studio"], status="review needed", notes="over 500"),
          receipt_run(rng, pw, s["pharmacy"], d["pharmacy"], interruption=noise.chat(rng))]

    # Day -1: a receipt without a type, looked up in the client list; email.
    s = day(-1, ["northwind", "print"])
    d1 = [receipt_run(rng, pw, s["northwind"], d["northwind"], lookup=True,
                      type_from=dict(cast.client_types)[d["northwind"].name],
                      notes="type from client list"),
          receipt_run(rng, pw, s["print"], d["print"]),
          email_run(rng, cast, cast.threads[2], inbox_others[:2])]

    # Phase 2, today: the naming rule changes, two receipts filed under the new rule.
    s = day(0, ["hardware", "bakery"])
    today = [rule_notice(rng, pw),
             receipt_run(rng, pw, s["hardware"], d["hardware"], rule="TYPE_DATE_NAME"),
             receipt_run(rng, pw, s["bakery"], d["bakery"], rule="TYPE_DATE_NAME")]

    lookup_client = d["northwind"].name
    looked_up = Doc(lookup_client, d["northwind"].date, d["northwind"].amount,
                    dict(cast.client_types)[lookup_client])
    truth = {
        "suite": name,
        "jobs": {
            "receipts": {"expect": "published",
                         "summary": "Rename scanned receipts DATE_NAME_TYPE.pdf and log them in tracker.csv"},
            "email": {"expect": "published",
                      "summary": "Save an emailed attachment into the project folder and reply"},
            "printer": {"expect": "unpublished", "summary": "One-off printer driver setup"},
        },
        # kind: how grade.py decides. on_screen: text that must be in a frame of `job` in
        # `phase` (generate.py refuses the suite otherwise). any/all: authored-field keywords.
        "checks": [
            {"id": "found", "job": "receipts", "phase": 1, "kind": "published"},
            {"id": "no_duplicate", "job": "receipts", "phase": 1, "kind": "single"},
            {"id": "steps", "job": "receipts", "phase": 1, "kind": "keywords",
             "all": [["rename", "renamed", "renaming"],
                     ["tracker", "tracker.csv", "csv", "log", "spreadsheet"]],
             "on_screen": [receipt_name(d["acme"]), TRACKER_HEADER]},
            {"id": "missing_date", "job": "receipts", "phase": 1, "kind": "keywords",
             "any": ["missing date", "no date", "unknown-date", "unknown date", "undated",
                     "without a date", "date is missing", "date missing", "lacks a date"],
             "on_screen": [receipt_name(d["market"]), "missing date"]},
            {"id": "duplicate", "job": "receipts", "phase": 1, "kind": "keywords",
             "any": ["duplicate", "already filed", "already been filed", "same as", "filed before",
                     "previously filed", "compare", "already exists"],
             "on_screen": [f"duplicate,same as {acme['filed']}"]},
            {"id": "high_value", "job": "receipts", "phase": 1, "kind": "keywords",
             "any": ["review needed", "needs review", "over 500", "above 500", "high amount",
                     "high-value", "high value", "large amount", "flag"],
             "on_screen": [f"Amount: {d['studio'].amount} EUR", "review needed"]},
            {"id": "type_lookup", "job": "receipts", "phase": 1, "kind": "keywords",
             "any": ["client-types", "client types", "client list", "unknown type", "type is unknown",
                     "type unknown", "look up the type", "looks up the type", "lookup"],
             "on_screen": ["Type: UNKNOWN", f"{lookup_client}: {looked_up.type}",
                           receipt_name(looked_up)]},
            {"id": "noise_excluded", "job": "receipts", "phase": 1, "kind": "absent_app",
             "app": "Discord"},
            {"id": "drift", "job": "receipts", "phase": 2, "kind": "drift",
             "any": ["TYPE_DATE_NAME", "type first", "type, date", "type_date_name",
                     receipt_name(d["hardware"], "TYPE_DATE_NAME")],
             "on_screen": ["New: TYPE_DATE_NAME.pdf", receipt_name(d["hardware"], "TYPE_DATE_NAME")]},
            {"id": "email_separate", "job": "email", "phase": 1, "kind": "separate",
             "from": "receipts", "on_screen": [t.attachment for t in cast.threads]},
            {"id": "one_off_unpublished", "job": "printer", "phase": 1, "kind": "unpublished",
             "on_screen": ["Printers & Scanners"]},
            {"id": "evidence_resolves", "kind": "evidence"},
            {"id": "idle_cost", "phase": 3, "kind": "cost"},
        ],
    }
    phases = {1: [Day(-4, d4), Day(-3, d3), Day(-2, d2), Day(-1, d1)], 2: [Day(0, today)], 3: []}
    # The user's own tracker note is allowed to say what they did (DATA.md, rule 4).
    return Suite(name, phases, truth, noise, leak_allow=[("tracker.csv", "duplicate")])


SUITES = {"receipts": receipts}
