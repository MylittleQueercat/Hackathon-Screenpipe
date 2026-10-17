"""Accessibility text of the app screens a story passes through. The layout copies real
macOS captures on this Mac: one element per line, window chrome before content, labels
often repeated (a button's title and its description)."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(frozen=True)
class Screen:
    app: str
    window: str
    text: str
    url: str | None = None


@dataclass
class Step:
    """What the user does for `seconds` on one or more successive screens. `trigger` is the
    capture trigger of the frames after the first; `events` are UI events at the start."""
    screens: list[Screen]
    seconds: float
    trigger: str = "click"
    events: list[dict] = field(default_factory=list)
    key: str | None = None  # names the step for grounding checks, e.g. "rename"
    owner: str | None = None  # overrides the run's owner, e.g. a chat in the middle of a job


FINDER_SIDEBAR = ["Recents", "Shared", "Favorites", "Desktop", "Documents", "Downloads", "Pictures",
                  "Locations", "iCloud Drive", "Macintosh HD", "AirDrop", "Trash"]


def finder(folder: str, rows: list[tuple[str, str, str, str]], renaming: tuple[str, str] | None = None) -> Screen:
    """rows: (name, modified, size, kind). renaming: (old name, text typed so far)."""
    lines = [*FINDER_SIDEBAR, "Name", "Date Modified", "Size", "Kind"]
    for name, modified, size, kind in rows:
        if renaming and name == renaming[0]:
            lines += ["text field", renaming[1]]
        else:
            lines.append(name)
        lines += [modified, size, kind]
    # Finder windows on this Mac are titled with the full folder path.
    return Screen("Finder", folder, "\n".join(lines))


def preview(filename: str, page: list[str]) -> Screen:
    chrome = ["Sidebar", "Sidebar", filename, "Zoom Out", "Zoom In", "Share", "Share", "Highlight",
              "Rotate", "Markup", "Markup", "Search", "Page 1 of 1"]
    return Screen("Preview", filename, "\n".join([*chrome, *page]))


def textedit(filename: str, content: str) -> Screen:
    return Screen("TextEdit", filename, "\n".join([filename, "Edited", content]))


def browser(app: str, title: str, url: str, page: list[str]) -> Screen:
    host = url.split("/")[2]
    chrome = ["Back", "Forward", "Reload", host, url, "Bookmarks", "Downloads", "Tabs", title]
    return Screen(app, title, "\n".join([*chrome, *page]), url=url)


def mail(mailbox: str, rows: list[tuple[str, str, str]], message: list[str] | None, window: str) -> Screen:
    """rows: (sender, subject, received)."""
    lines = ["Get Mail", "Compose", "Archive", "Delete", "Reply", "Reply All", "Forward", "Search",
             "Favorites", "Inbox", "Sent", "Drafts", mailbox]
    for sender, subject, received in rows:
        lines += [sender, subject, received]
    return Screen("Mail", window, "\n".join(lines + (message or [])))


def discord(server: str, channel: str, messages: list[tuple[str, str, str]]) -> Screen:
    lines = ["Direct Messages", server, "Text Channels", "general", "random", "links", f"#{channel}"]
    for who, when, text in messages:
        lines += [who, when, text]
    lines += [f"Message #{channel}"]
    return Screen("Discord", f"#{channel} | {server}", "\n".join(lines))


def spotify(track: str, artist: str, playlist: str) -> Screen:
    lines = ["Home", "Search", "Your Library", playlist, track, artist, "Previous", "Pause", "Next",
             "Shuffle", "Repeat", "Lyrics", "Queue", "Volume"]
    return Screen("Spotify", f"{track} • {artist}", "\n".join(lines))


def app_screen(app: str, window: str, lines: list[str]) -> Screen:
    return Screen(app, window, "\n".join(lines))
