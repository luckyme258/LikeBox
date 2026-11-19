#!/usr/bin/env python3
"""LikeBox —— 本地多收藏夹管理器（Flask + SQLite）

- 首次启动导入同目录下的 Edge 收藏夹导出文件
- 支持导入多个 Edge / Firefox / Chrome 收藏夹，并在 1~3 栏中对照整理
- 拖拽书签到任意收藏夹的任意文件夹（可跨收藏夹），指定「主收藏夹」
"""

from __future__ import annotations

import os
import re
import secrets
import socket
import sqlite3
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from html import escape, unescape
from html.parser import HTMLParser
from pathlib import Path

from flask import (
    Flask,
    g,
    jsonify,
    redirect,
    render_template,
    request,
    send_file,
    session,
    url_for,
)
from werkzeug.security import check_password_hash, generate_password_hash

BASE_DIR = (
    Path(sys.executable).resolve().parent
    if getattr(sys, "frozen", False)
    else Path(__file__).resolve().parent
)
RESOURCE_DIR = Path(getattr(sys, "_MEIPASS", BASE_DIR))
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "bookmarks.db"
DEFAULT_SOURCE = BASE_DIR / "favorites_2026_11_18.html"
EXPORT_NAME = "favorites_likebox.html"
PORT = 8180

BROWSER_EDGE = "Edge"
BROWSER_FIREFOX = "Firefox"
BROWSER_CHROME = "Chrome"
BROWSER_UNKNOWN = "商业浏览器"

DEFAULT_EXCLUDED_DOMAINS = ("github.com", "github.io", "raw.githubusercontent.com")

app = Flask(
    __name__,
    template_folder=str(RESOURCE_DIR / "templates"),
    static_folder=str(RESOURCE_DIR / "static"),
)

try:  # Flask 3.x
    app.json.ensure_ascii = False
except Exception:  # pragma: no cover
    app.config["JSON_AS_ASCII"] = False

SCHEMA = """
CREATE TABLE IF NOT EXISTS libraries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    browser    TEXT NOT NULL DEFAULT '商业浏览器',
    filename   TEXT,
    is_primary INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    tags       TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS folders (
    library_id INTEGER NOT NULL,
    path       TEXT NOT NULL,
    name       TEXT NOT NULL,
    parent     TEXT NOT NULL DEFAULT '',
    ord        INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (library_id, path)
);
CREATE TABLE IF NOT EXISTS bookmarks (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    library_id INTEGER NOT NULL,
    title      TEXT NOT NULL DEFAULT '',
    url        TEXT NOT NULL,
    folder     TEXT NOT NULL DEFAULT '',
    icon       TEXT,
    add_date   INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    tags       TEXT NOT NULL DEFAULT '',
    host       TEXT NOT NULL DEFAULT '',
    net_status INTEGER NOT NULL DEFAULT 0,
    net_error  TEXT NOT NULL DEFAULT '',
    net_checked INTEGER NOT NULL DEFAULT 0
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_bookmarks_lib_url_folder
    ON bookmarks(library_id, url, folder);
CREATE INDEX IF NOT EXISTS ix_bookmarks_library ON bookmarks(library_id);
CREATE INDEX IF NOT EXISTS ix_bookmarks_folder ON bookmarks(library_id, folder);
CREATE TABLE IF NOT EXISTS bookmark_opens (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    bookmark_id INTEGER NOT NULL,
    opened_at   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_opens_bookmark ON bookmark_opens(bookmark_id, opened_at);
CREATE TABLE IF NOT EXISTS excluded_domains (
    library_id INTEGER NOT NULL,
    domain     TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (library_id, domain)
);
CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL DEFAULT ''
);
"""


# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------
def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def clean_url(raw: str | None) -> str:
    url = clean_text(raw)
    if not url:
        return ""
    if url.startswith("//"):
        return "https:" + url
    if re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:", url):
        return url
    return "https://" + url


def sanitize_segment(segment: str) -> str:
    return clean_text(str(segment).replace("/", "／").replace("\\", "／"))


def normalize_folder(value: str | None) -> str:
    if not value:
        return ""
    parts = [sanitize_segment(p) for p in str(value).replace("\\", "/").split("/")]
    return "/".join([p for p in parts if p])


def domain_of(url: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return ""
    if parsed.scheme == "file":
        return "本地文件"
    return parsed.netloc or parsed.scheme


def host_of(url: str) -> str:
    try:
        parsed = urllib.parse.urlsplit(url)
    except ValueError:
        return ""
    return (parsed.hostname or "").lower()


def normalize_tags(value) -> str:
    """把 #标签 / 逗号 / 空格分隔的输入统一存成空格分隔的小写标签。"""
    if isinstance(value, (list, tuple)):
        tokens = [str(item) for item in value]
    else:
        tokens = re.split(r"[#,\s]+", str(value or ""))
    tags: list[str] = []
    for token in tokens:
        cleaned = re.sub(r"[^\w\-]+", "", token.strip(), flags=re.UNICODE).lower()
        if not cleaned or len(cleaned) > 40:
            continue
        if cleaned not in tags:
            tags.append(cleaned)
    return " ".join(tags[:20])


def tags_list(value: str | None) -> list[str]:
    return [tag for tag in (value or "").split() if tag]


def is_domain_excluded(host: str, domains: set[str]) -> bool:
    if not host:
        return False
    return any(host == domain or host.endswith("." + domain) for domain in domains)


def get_setting(con: sqlite3.Connection, key: str, default: str = "") -> str:
    row = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return row["value"] if row else default


def set_setting(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def local_ip_addresses() -> list[str]:
    addresses: list[str] = []
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(0.3)
        sock.connect(("8.8.8.8", 80))
        addresses.append(sock.getsockname()[0])
        sock.close()
    except OSError:
        pass
    try:
        for item in socket.gethostbyname_ex(socket.gethostname())[2]:
            if item not in addresses and not item.startswith("127."):
                addresses.append(item)
    except OSError:
        pass
    return [item for item in addresses if not item.startswith("127.")]


def is_local_request() -> bool:
    addr = (request.remote_addr or "").strip()
    return addr in {"127.0.0.1", "::1", "localhost"} or addr.startswith("127.")


def strip_tags(text: str) -> str:
    return re.sub(r"<[^>]+>", " ", text)


def detect_browser(raw: str, filename: str = "") -> str:
    """根据导出文件内容 / 文件名判断来源浏览器。无法判断时标记为「商业浏览器」。"""
    low = raw.lower()
    name = (filename or "").lower()
    scores = {BROWSER_EDGE: 0, BROWSER_FIREFOX: 0, BROWSER_CHROME: 0}

    # Edge：中文「收藏夹栏 / 其他收藏夹」，英文 Favorites bar
    for marker in ("收藏夹栏", "其他收藏夹", "收藏夹"):
        if marker in raw:
            scores[BROWSER_EDGE] += 2
            break
    if "favorites bar" in low or "favorites toolbar" in low or "other favorites" in low:
        scores[BROWSER_EDGE] += 2

    # Chrome：中文「书签栏 / 其他书签」，英文 Bookmarks bar
    if "书签栏" in raw or "其他书签" in raw:
        scores[BROWSER_CHROME] += 3
    if "bookmarks bar" in low or "other bookmarks" in low or "bookmarks toolbar" in low:
        scores[BROWSER_CHROME] += 3

    # Firefox：「书签菜单 / 书签工具栏 / 未分类」，英文 Bookmarks Menu
    if "书签菜单" in raw or "书签工具栏" in raw or "未分类书签" in raw:
        scores[BROWSER_FIREFOX] += 3
    if "bookmarks menu" in low or "unfiled" in low or "firefox" in low:
        scores[BROWSER_FIREFOX] += 3
    if re.search(r'tags\s*=\s*"', low):
        scores[BROWSER_FIREFOX] += 1

    # 文件名兜底
    if "edge" in name:
        scores[BROWSER_EDGE] += 2
    if "firefox" in name:
        scores[BROWSER_FIREFOX] += 3
    if "chrome" in name:
        scores[BROWSER_CHROME] += 2

    best = max(scores, key=lambda key: scores[key])
    return best if scores[best] >= 2 else BROWSER_UNKNOWN


# ---------------------------------------------------------------------------
# Netscape 收藏夹解析
# ---------------------------------------------------------------------------
class NetscapeParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.stack: list[str] = []
        self.pending_folder: str | None = None
        self.in_h3 = False
        self.in_a = False
        self.buf: list[str] = []
        self.a_attrs: dict[str, str] = {}
        self.folders: list[dict] = []
        self.bookmarks: list[dict] = []
        self._order = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        data = {k.lower(): (v or "") for k, v in attrs}
        if tag == "h3":
            self.in_h3 = True
            self.buf = []
        elif tag == "a":
            self.in_a = True
            self.buf = []
            self.a_attrs = data
        elif tag == "dl":
            if self.pending_folder is not None:
                parent = self.stack[-1] if self.stack else ""
                path = f"{parent}/{self.pending_folder}" if parent else self.pending_folder
                self.stack.append(path)
                self.folders.append(
                    {"path": path, "name": self.pending_folder, "parent": parent, "ord": self._order}
                )
                self._order += 1
                self.pending_folder = None
            else:
                self.stack.append("")

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag == "h3":
            self.in_h3 = False
            name = sanitize_segment("".join(self.buf))
            self.pending_folder = name or "未命名文件夹"
        elif tag == "a":
            self.in_a = False
            url = clean_url(self.a_attrs.get("href", ""))
            if url:
                title = clean_text("".join(self.buf)) or url
                try:
                    add_date = int(self.a_attrs.get("add_date") or 0)
                except ValueError:
                    add_date = 0
                self.bookmarks.append(
                    {
                        "title": title[:600],
                        "url": url,
                        "folder": self.stack[-1] if self.stack else "",
                        "icon": self.a_attrs.get("icon") or None,
                        "add_date": add_date,
                        "tags": normalize_tags(self.a_attrs.get("tags", "")),
                    }
                )
        elif tag == "dl":
            if self.stack:
                self.stack.pop()

    def handle_data(self, data):
        if self.in_h3 or self.in_a:
            self.buf.append(data)


def parse_netscape(raw: str) -> dict:
    parser = NetscapeParser()
    parser.feed(raw)
    parser.close()
    return {"folders": parser.folders, "bookmarks": parser.bookmarks}


# ---------------------------------------------------------------------------
# 数据库
# ---------------------------------------------------------------------------
def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    return con


def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = connect()
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def ensure_folder(con: sqlite3.Connection, library_id: int, path: str) -> None:
    if not path:
        return
    parent = ""
    for segment in path.split("/"):
        current = f"{parent}/{segment}" if parent else segment
        if not con.execute(
            "SELECT 1 FROM folders WHERE library_id = ? AND path = ?", (library_id, current)
        ).fetchone():
            max_ord = con.execute(
                "SELECT COALESCE(MAX(ord), -1) FROM folders WHERE library_id = ?", (library_id,)
            ).fetchone()[0]
            con.execute(
                "INSERT INTO folders(library_id, path, name, parent, ord) VALUES(?, ?, ?, ?, ?)",
                (library_id, current, segment, parent, max_ord + 1),
            )
        parent = current


def prune_empty_folders(con: sqlite3.Connection, library_id: int) -> None:
    while True:
        empty = con.execute(
            """
            SELECT f.path FROM folders f
            WHERE f.library_id = ?
              AND NOT EXISTS (
                  SELECT 1 FROM bookmarks b
                  WHERE b.library_id = f.library_id
                    AND (b.folder = f.path
                         OR substr(b.folder, 1, length(f.path) + 1) = f.path || '/')
              )
              AND NOT EXISTS (
                  SELECT 1 FROM folders c
                  WHERE c.library_id = f.library_id AND c.parent = f.path
              )
            """,
            (library_id,),
        ).fetchall()
        if not empty:
            return
        for row in empty:
            con.execute(
                "DELETE FROM folders WHERE library_id = ? AND path = ?",
                (library_id, row["path"]),
            )


def insert_bookmarks(con: sqlite3.Connection, library_id: int, parsed: dict) -> int:
    now = int(time.time())
    for folder in parsed["folders"]:
        if not con.execute(
            "SELECT 1 FROM folders WHERE library_id = ? AND path = ?",
            (library_id, folder["path"]),
        ).fetchone():
            con.execute(
                "INSERT INTO folders(library_id, path, name, parent, ord) VALUES(?, ?, ?, ?, ?)",
                (library_id, folder["path"], folder["name"], folder["parent"], folder["ord"]),
            )
    inserted = 0
    for item in parsed["bookmarks"]:
        folder = normalize_folder(item["folder"])
        ensure_folder(con, library_id, folder)
        cur = con.execute(
            """INSERT OR IGNORE INTO bookmarks
               (library_id, title, url, folder, icon, add_date, created_at, updated_at,
                tags, host, net_status, net_error, net_checked)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 0)""",
            (
                library_id,
                item["title"],
                item["url"],
                folder,
                item.get("icon"),
                item.get("add_date") or now,
                now,
                now,
                normalize_tags(item.get("tags", "")),
                host_of(item["url"]),
            ),
        )
        inserted += cur.rowcount
    return inserted


def unique_library_name(con: sqlite3.Connection, base: str) -> str:
    name = base[:70]
    if not con.execute("SELECT 1 FROM libraries WHERE name = ?", (name,)).fetchone():
        return name
    index = 2
    while True:
        candidate = f"{name[:64]} ({index})"
        if not con.execute("SELECT 1 FROM libraries WHERE name = ?", (candidate,)).fetchone():
            return candidate
        index += 1


def seed_default_exclusions(con: sqlite3.Connection, library_id: int) -> None:
    now = int(time.time())
    for domain in DEFAULT_EXCLUDED_DOMAINS:
        con.execute(
            "INSERT OR IGNORE INTO excluded_domains(library_id, domain, created_at) VALUES(?, ?, ?)",
            (library_id, domain, now),
        )


def create_library(
    con: sqlite3.Connection,
    name: str,
    browser: str,
    filename: str = "",
    is_primary: bool = False,
    parsed: dict | None = None,
) -> int:
    cur = con.execute(
        "INSERT INTO libraries(name, browser, filename, is_primary, created_at) VALUES(?, ?, ?, ?, ?)",
        (unique_library_name(con, name), browser, filename, 1 if is_primary else 0, int(time.time())),
    )
    library_id = cur.lastrowid
    seed_default_exclusions(con, library_id)
    if parsed:
        insert_bookmarks(con, library_id, parsed)
    return library_id


def migrate_legacy(con: sqlite3.Connection) -> None:
    """把旧版（单收藏夹）数据库迁移成多收藏夹结构。"""
    rows = con.execute(
        "SELECT title, url, folder, icon, add_date, created_at, updated_at FROM bookmarks"
    ).fetchall()
    try:
        old_folders = con.execute("SELECT path, name, parent, ord FROM folders").fetchall()
    except sqlite3.Error:
        old_folders = []

    con.executescript("DROP TABLE IF EXISTS bookmarks; DROP TABLE IF EXISTS folders;")
    con.executescript(SCHEMA)

    raw = ""
    if DEFAULT_SOURCE.exists():
        raw = DEFAULT_SOURCE.read_text(encoding="utf-8", errors="replace")
    browser = detect_browser(raw, DEFAULT_SOURCE.name) if raw else BROWSER_UNKNOWN
    name = f"{browser} · {DEFAULT_SOURCE.stem}" if raw else f"{BROWSER_UNKNOWN} · 旧数据"
    library_id = create_library(con, name, browser, DEFAULT_SOURCE.name, is_primary=True)

    for folder in old_folders:
        con.execute(
            "INSERT OR IGNORE INTO folders(library_id, path, name, parent, ord) VALUES(?, ?, ?, ?, ?)",
            (library_id, folder["path"], folder["name"], folder["parent"], folder["ord"]),
        )
    for row in rows:
        con.execute(
            """INSERT OR IGNORE INTO bookmarks
               (library_id, title, url, folder, icon, add_date, created_at, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)""",
            (
                library_id,
                row["title"],
                row["url"],
                row["folder"],
                row["icon"],
                row["add_date"],
                row["created_at"],
                row["updated_at"],
            ),
        )
    con.commit()
    print(f"[migrate] 旧数据已迁移为「{name}」，共 {len(rows)} 条收藏")


def ensure_columns(con: sqlite3.Connection, table: str, columns: list[tuple[str, str]]) -> None:
    existing = {row[1] for row in con.execute(f"PRAGMA table_info({table})")}
    for name, ddl in columns:
        if name not in existing:
            con.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")


def upgrade_schema(con: sqlite3.Connection) -> None:
    ensure_columns(
        con,
        "libraries",
        [("tags", "tags TEXT NOT NULL DEFAULT ''")],
    )
    ensure_columns(
        con,
        "bookmarks",
        [
            ("tags", "tags TEXT NOT NULL DEFAULT ''"),
            ("host", "host TEXT NOT NULL DEFAULT ''"),
            ("net_status", "net_status INTEGER NOT NULL DEFAULT 0"),
            ("net_error", "net_error TEXT NOT NULL DEFAULT ''"),
            ("net_checked", "net_checked INTEGER NOT NULL DEFAULT 0"),
        ],
    )
    # 补全 host，便于按域名排除检测
    rows = con.execute("SELECT id, url, host FROM bookmarks").fetchall()
    for row in rows:
        host = host_of(row["url"])
        if row["host"] != host:
            con.execute("UPDATE bookmarks SET host = ? WHERE id = ?", (host, row["id"]))
    con.execute("CREATE INDEX IF NOT EXISTS ix_bookmarks_host ON bookmarks(library_id, host)")
    con.execute("CREATE INDEX IF NOT EXISTS ix_opens_bookmark ON bookmark_opens(bookmark_id, opened_at)")
    con.commit()


def init_db() -> None:
    con = connect()
    tables = {row[0] for row in con.execute("SELECT name FROM sqlite_master WHERE type='table'")}
    is_legacy = False
    if "bookmarks" in tables:
        columns = [row[1] for row in con.execute("PRAGMA table_info(bookmarks)")]
        is_legacy = "library_id" not in columns
    if is_legacy:
        migrate_legacy(con)
    else:
        con.executescript(SCHEMA)
        con.commit()

    upgrade_schema(con)

    library_count = con.execute("SELECT COUNT(*) FROM libraries").fetchone()[0]
    if library_count == 0 and DEFAULT_SOURCE.exists():
        raw = DEFAULT_SOURCE.read_text(encoding="utf-8", errors="replace")
        parsed = parse_netscape(raw)
        browser = detect_browser(raw, DEFAULT_SOURCE.name)
        name = f"{browser} · {DEFAULT_SOURCE.stem}"
        with con:
            library_id = create_library(
                con, name, browser, DEFAULT_SOURCE.name, is_primary=True, parsed=parsed
            )
            prune_empty_folders(con, library_id)
        print(f"[init] 已导入 {len(parsed['bookmarks'])} 条收藏（识别为 {browser}）")

    # 保证有且只有一个主收藏夹
    library_rows = con.execute("SELECT id, is_primary FROM libraries ORDER BY id").fetchall()
    primaries = [row["id"] for row in library_rows if row["is_primary"]]
    if len(primaries) != 1 and library_rows:
        target = primaries[0] if primaries else library_rows[0]["id"]
        with con:
            con.execute("UPDATE libraries SET is_primary = 0")
            con.execute("UPDATE libraries SET is_primary = 1 WHERE id = ?", (target,))

    # 首次升级时给已有收藏夹补上默认排除域名（之后用户删除不会再自动加回）
    if get_setting(con, "exclusions_seeded", "") != "1":
        with con:
            for row in con.execute("SELECT id FROM libraries").fetchall():
                seed_default_exclusions(con, row["id"])
            set_setting(con, "exclusions_seeded", "1")

    for row in con.execute("SELECT id FROM libraries").fetchall():
        prune_empty_folders(con, row["id"])
    con.commit()
    con.close()


# ---------------------------------------------------------------------------
# 查询辅助
# ---------------------------------------------------------------------------
def primary_library_id(db: sqlite3.Connection) -> int | None:
    row = db.execute("SELECT id FROM libraries WHERE is_primary = 1 ORDER BY id LIMIT 1").fetchone()
    if row:
        return row["id"]
    row = db.execute("SELECT id FROM libraries ORDER BY id LIMIT 1").fetchone()
    return row["id"] if row else None


def requested_library(db: sqlite3.Connection) -> int | None:
    raw = request.args.get("library")
    if raw:
        try:
            return int(raw)
        except ValueError:
            return None
    return primary_library_id(db)


def build_library_payload(db: sqlite3.Connection) -> dict:
    libraries = []
    for row in db.execute(
        "SELECT id, name, browser, filename, is_primary, created_at, tags FROM libraries ORDER BY id"
    ):
        total = db.execute(
            "SELECT COUNT(*) AS c FROM bookmarks WHERE library_id = ?", (row["id"],)
        ).fetchone()["c"]
        folders = db.execute(
            "SELECT COUNT(*) AS c FROM folders WHERE library_id = ?", (row["id"],)
        ).fetchone()["c"]
        libraries.append(
            {
                "id": row["id"],
                "name": row["name"],
                "browser": row["browser"],
                "filename": row["filename"] or "",
                "is_primary": bool(row["is_primary"]),
                "created_at": row["created_at"],
                "total": total,
                "folders": folders,
                "tags": tags_list(row["tags"]),
            }
        )
    primary = primary_library_id(db)
    return {"libraries": libraries, "primary": primary}


def folder_tree(db: sqlite3.Connection, library_id: int) -> dict:
    total = db.execute(
        "SELECT COUNT(*) AS c FROM bookmarks WHERE library_id = ?", (library_id,)
    ).fetchone()["c"]
    folder_rows = db.execute(
        "SELECT path, name, parent, ord FROM folders WHERE library_id = ? ORDER BY ord, path",
        (library_id,),
    ).fetchall()
    direct = {
        row["folder"]: row["c"]
        for row in db.execute(
            "SELECT folder, COUNT(*) AS c FROM bookmarks WHERE library_id = ? GROUP BY folder",
            (library_id,),
        ).fetchall()
    }

    nodes: dict[str, dict] = {}
    for row in folder_rows:
        nodes[row["path"]] = {
            "name": row["name"],
            "path": row["path"],
            "parent": row["parent"],
            "ord": row["ord"],
            "count": direct.get(row["path"], 0),
            "children": [],
        }
    for path, count in direct.items():
        if not path or path in nodes:
            continue
        parts = path.split("/")
        for i in range(1, len(parts) + 1):
            sub = "/".join(parts[:i])
            if sub not in nodes:
                nodes[sub] = {
                    "name": parts[i - 1],
                    "path": sub,
                    "parent": "/".join(parts[:i - 1]),
                    "ord": 1_000_000 + i,
                    "count": direct.get(sub, 0),
                    "children": [],
                }

    roots: list[dict] = []
    for node in nodes.values():
        parent = node["parent"]
        if parent and parent in nodes:
            nodes[parent]["children"].append(node)
        else:
            roots.append(node)

    uncategorized = direct.get("", 0)
    if uncategorized:
        roots.append(
            {
                "name": "未分类",
                "path": "",
                "parent": "",
                "ord": 1_000_001,
                "count": uncategorized,
                "children": [],
            }
        )

    def walk(node: dict) -> int:
        node["children"].sort(key=lambda n: (n["ord"], n["name"]))
        node["total"] = node["count"] + sum(walk(child) for child in node["children"])
        return node["total"]

    for node in roots:
        walk(node)
    roots.sort(key=lambda n: (n["ord"], n["name"]))
    return {"total": total, "folders": roots}


def bookmark_payload(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "library_id": row["library_id"],
        "title": row["title"] or row["url"],
        "url": row["url"],
        "folder": row["folder"],
        "icon": row["icon"],
        "add_date": row["add_date"],
        "domain": domain_of(row["url"]),
        "host": row["host"] or host_of(row["url"]),
        "tags": tags_list(row["tags"]),
        "net_status": row["net_status"],
        "net_error": row["net_error"] or "",
        "net_checked": row["net_checked"],
    }


# ---------------------------------------------------------------------------
# 页面 & 接口
# ---------------------------------------------------------------------------
@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/libraries")
def api_libraries():
    db = get_db()
    return jsonify(build_library_payload(db))


@app.post("/api/libraries/<int:library_id>/primary")
def api_set_primary(library_id: int):
    db = get_db()
    if not db.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone():
        return jsonify({"error": "收藏夹不存在"}), 404
    with db:
        db.execute("UPDATE libraries SET is_primary = 0")
        db.execute("UPDATE libraries SET is_primary = 1 WHERE id = ?", (library_id,))
    payload = build_library_payload(db)
    return jsonify(payload)


@app.get("/api/folders")
def api_folders():
    db = get_db()
    library_id = requested_library(db)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    data = folder_tree(db, library_id)
    flat = [
        row["path"]
        for row in db.execute(
            "SELECT path FROM folders WHERE library_id = ? ORDER BY ord, path", (library_id,)
        ).fetchall()
    ]
    data.update({"library": library_id, "flat": flat, "count": len(flat)})
    return jsonify(data)


def folder_library(db: sqlite3.Connection, payload: dict) -> int | None:
    try:
        library_id = int(payload.get("library_id") or payload.get("library"))
    except (TypeError, ValueError):
        return None
    if not db.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone():
        return None
    return library_id


@app.post("/api/folders")
def api_create_folder():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = folder_library(db, payload)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    parent = normalize_folder(payload.get("parent"))
    name = sanitize_segment(payload.get("name"))
    if not name or "/" in name:
        return jsonify({"error": "文件夹名不能为空，且不能包含 /"}), 400
    if parent and not db.execute(
        "SELECT 1 FROM folders WHERE library_id = ? AND path = ?", (library_id, parent)
    ).fetchone():
        return jsonify({"error": "上级文件夹不存在"}), 404
    path = f"{parent}/{name}" if parent else name
    if db.execute(
        "SELECT 1 FROM folders WHERE library_id = ? AND path = ?", (library_id, path)
    ).fetchone():
        return jsonify({"error": "同级已存在同名文件夹"}), 409
    max_ord = db.execute(
        "SELECT COALESCE(MAX(ord), -1) FROM folders WHERE library_id = ?", (library_id,)
    ).fetchone()[0]
    with db:
        db.execute(
            "INSERT INTO folders(library_id, path, name, parent, ord) VALUES(?, ?, ?, ?, ?)",
            (library_id, path, name, parent, max_ord + 1),
        )
    return jsonify({"path": path}), 201


@app.put("/api/folders")
def api_update_folder():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = folder_library(db, payload)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    path = normalize_folder(payload.get("path"))
    row = db.execute(
        "SELECT path, name, parent, ord FROM folders WHERE library_id = ? AND path = ?",
        (library_id, path),
    ).fetchone()
    if row is None:
        return jsonify({"error": "文件夹不存在"}), 404

    name = sanitize_segment(payload.get("name", row["name"]))
    parent = normalize_folder(payload.get("parent", row["parent"]))
    if not name or "/" in name:
        return jsonify({"error": "文件夹名不能为空，且不能包含 /"}), 400
    new_path = f"{parent}/{name}" if parent else name
    if new_path == path:
        return jsonify({"ok": True, "path": path})
    if new_path.startswith(path + "/"):
        return jsonify({"error": "不能把文件夹移动到自己的子层"}), 400
    if parent and not db.execute(
        "SELECT 1 FROM folders WHERE library_id = ? AND path = ?", (library_id, parent)
    ).fetchone():
        return jsonify({"error": "上级文件夹不存在"}), 404

    subtree = db.execute(
        "SELECT path, name, parent, ord FROM folders WHERE library_id = ? "
        "AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/') ORDER BY ord",
        (library_id, path, path, path),
    ).fetchall()
    old_paths = {item["path"] for item in subtree}
    new_rows = []
    for item in subtree:
        old = item["path"]
        suffix = old[len(path):]
        mapped = new_path + suffix
        if mapped in old_paths:
            continue
        if db.execute(
            "SELECT 1 FROM folders WHERE library_id = ? AND path = ?", (library_id, mapped)
        ).fetchone():
            return jsonify({"error": "目标位置已存在同名文件夹"}), 409
        new_parent = new_path if old == path else new_path + item["parent"][len(path):]
        new_name = name if old == path else item["name"]
        new_rows.append((mapped, new_name, new_parent, item["ord"]))

    try:
        with db:
            bookmarks = db.execute(
                "SELECT id, folder FROM bookmarks WHERE library_id = ? "
                "AND (folder = ? OR substr(folder, 1, length(?) + 1) = ? || '/')",
                (library_id, path, path, path),
            ).fetchall()
            for bookmark in bookmarks:
                old_folder = bookmark["folder"]
                suffix = old_folder[len(path):]
                db.execute(
                    "UPDATE bookmarks SET folder = ? WHERE id = ?",
                    (new_path + suffix, bookmark["id"]),
                )
            db.execute(
                "DELETE FROM folders WHERE library_id = ? "
                "AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/')",
                (library_id, path, path, path),
            )
            for mapped, new_name, new_parent, ord_value in new_rows:
                db.execute(
                    "INSERT INTO folders(library_id, path, name, parent, ord) VALUES(?, ?, ?, ?, ?)",
                    (library_id, mapped, new_name, new_parent, ord_value),
                )
    except sqlite3.IntegrityError:
        return jsonify({"error": "目标位置已有相同链接，无法移动文件夹"}), 409
    return jsonify({"ok": True, "path": new_path})


@app.delete("/api/folders")
def api_delete_folder():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = folder_library(db, payload)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    path = normalize_folder(payload.get("path"))
    if not path or not db.execute(
        "SELECT 1 FROM folders WHERE library_id = ? AND path = ?", (library_id, path)
    ).fetchone():
        return jsonify({"error": "文件夹不存在"}), 404
    bookmarks = db.execute(
        "SELECT id FROM bookmarks WHERE library_id = ? "
        "AND (folder = ? OR substr(folder, 1, length(?) + 1) = ? || '/')",
        (library_id, path, path, path),
    ).fetchall()
    ids = [row["id"] for row in bookmarks]
    folders = db.execute(
        "SELECT COUNT(*) AS c FROM folders WHERE library_id = ? "
        "AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/')",
        (library_id, path, path, path),
    ).fetchone()["c"]
    with db:
        if ids:
            db.execute(
                f"DELETE FROM bookmark_opens WHERE bookmark_id IN ({','.join('?' * len(ids))})",
                ids,
            )
            db.execute(
                f"DELETE FROM bookmarks WHERE id IN ({','.join('?' * len(ids))})",
                ids,
            )
        db.execute(
            "DELETE FROM folders WHERE library_id = ? "
            "AND (path = ? OR substr(path, 1, length(?) + 1) = ? || '/')",
            (library_id, path, path, path),
        )
    return jsonify({"ok": True, "bookmarks": len(ids), "folders": folders})


@app.get("/api/bookmarks")
def api_bookmarks():
    db = get_db()
    library_id = requested_library(db)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    query = clean_text(request.args.get("q"))
    folder = request.args.get("folder") if "folder" in request.args else None
    sort = request.args.get("sort", "recent")
    try:
        page = max(1, int(request.args.get("page", 1)))
        per = min(200, max(10, int(request.args.get("per", 100))))
    except ValueError:
        page, per = 1, 100

    conditions = ["library_id = ?"]
    params: list[object] = [library_id]

    if folder is not None:
        if folder == "":
            conditions.append("folder = ''")
        else:
            conditions.append("(folder = ? OR folder LIKE ?)")
            params.extend([folder, folder + "/%"])

    if query:
        for token in query.split()[:6]:
            conditions.append("(title LIKE ? OR url LIKE ? OR folder LIKE ?)")
            like = f"%{token}%"
            params.extend([like, like, like])

    where_sql = " WHERE " + " AND ".join(conditions)
    order_sql = {
        "recent": "COALESCE(NULLIF(add_date, 0), created_at) DESC, id DESC",
        "title": "title COLLATE NOCASE ASC, id ASC",
        "folder": "folder COLLATE NOCASE ASC, title COLLATE NOCASE ASC",
        "oldest": "COALESCE(NULLIF(add_date, 0), created_at) ASC, id ASC",
    }.get(sort, "COALESCE(NULLIF(add_date, 0), created_at) DESC, id DESC")

    total = db.execute(f"SELECT COUNT(*) AS c FROM bookmarks{where_sql}", params).fetchone()["c"]
    rows = db.execute(
        f"SELECT * FROM bookmarks{where_sql} ORDER BY {order_sql} LIMIT ? OFFSET ?",
        params + [per, (page - 1) * per],
    ).fetchall()

    return jsonify(
        {
            "items": [bookmark_payload(row) for row in rows],
            "total": total,
            "page": page,
            "per": per,
            "has_more": page * per < total,
            "library": library_id,
        }
    )


@app.post("/api/bookmarks")
def api_create_bookmark():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = payload.get("library_id") or payload.get("library")
    try:
        library_id = int(library_id if library_id is not None else primary_library_id(db))
    except (TypeError, ValueError):
        return jsonify({"error": "请选择收藏夹"}), 400
    if not db.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone():
        return jsonify({"error": "收藏夹不存在"}), 404

    url = clean_url(payload.get("url"))
    if not url:
        return jsonify({"error": "网址不能为空"}), 400
    title = clean_text(payload.get("title"))[:600] or url
    folder = normalize_folder(payload.get("folder"))
    icon = payload.get("icon") or None
    tags = normalize_tags(payload.get("tags", ""))
    host = host_of(url)
    now = int(time.time())
    try:
        with db:
            ensure_folder(db, library_id, folder)
            cur = db.execute(
                """INSERT INTO bookmarks
                   (library_id, title, url, folder, icon, add_date, created_at, updated_at,
                    tags, host, net_status, net_error, net_checked)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '', 0)""",
                (library_id, title, url, folder, icon, now, now, now, tags, host),
            )
    except sqlite3.IntegrityError:
        return jsonify({"error": "该文件夹下已存在相同的链接"}), 409

    row = db.execute("SELECT * FROM bookmarks WHERE id = ?", (cur.lastrowid,)).fetchone()
    return jsonify({"item": bookmark_payload(row)}), 201


@app.put("/api/bookmarks/<int:bookmark_id>")
def api_update_bookmark(bookmark_id: int):
    payload = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    if row is None:
        return jsonify({"error": "收藏不存在"}), 404

    title = clean_text(payload.get("title", row["title"]))[:600] or row["url"]
    url = clean_url(payload.get("url", row["url"]))
    if not url:
        return jsonify({"error": "网址不能为空"}), 400

    library_raw = payload.get("library_id", payload.get("library"))
    try:
        library_id = int(library_raw) if library_raw is not None else row["library_id"]
    except (TypeError, ValueError):
        return jsonify({"error": "收藏夹无效"}), 400
    if not db.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone():
        return jsonify({"error": "收藏夹不存在"}), 404

    folder = normalize_folder(payload.get("folder", row["folder"]))
    tags = normalize_tags(payload.get("tags", row["tags"]))
    host = host_of(url)
    reset_net = url != row["url"]
    now = int(time.time())
    try:
        with db:
            ensure_folder(db, library_id, folder)
            if reset_net:
                db.execute(
                    """UPDATE bookmarks
                       SET title = ?, url = ?, folder = ?, library_id = ?, tags = ?, host = ?,
                           net_status = 0, net_error = '', net_checked = 0, updated_at = ?
                       WHERE id = ?""",
                    (title, url, folder, library_id, tags, host, now, bookmark_id),
                )
            else:
                db.execute(
                    """UPDATE bookmarks
                       SET title = ?, url = ?, folder = ?, library_id = ?, tags = ?, host = ?,
                           updated_at = ?
                       WHERE id = ?""",
                    (title, url, folder, library_id, tags, host, now, bookmark_id),
                )
            prune_empty_folders(db, row["library_id"])
    except sqlite3.IntegrityError:
        return jsonify({"error": "目标文件夹下已存在相同的链接"}), 409

    updated = db.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    return jsonify({"item": bookmark_payload(updated)})


@app.post("/api/bookmarks/<int:bookmark_id>/move")
def api_move_bookmark(bookmark_id: int):
    payload = request.get_json(silent=True) or {}
    db = get_db()
    row = db.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    if row is None:
        return jsonify({"error": "收藏不存在"}), 404

    try:
        library_id = int(payload.get("library_id") or payload.get("library"))
    except (TypeError, ValueError):
        return jsonify({"error": "目标收藏夹无效"}), 400
    if not db.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone():
        return jsonify({"error": "目标收藏夹不存在"}), 404

    folder = normalize_folder(payload.get("folder"))
    now = int(time.time())
    try:
        with db:
            ensure_folder(db, library_id, folder)
            db.execute(
                "UPDATE bookmarks SET library_id = ?, folder = ?, updated_at = ? WHERE id = ?",
                (library_id, folder, now, bookmark_id),
            )
            if row["library_id"] != library_id or row["folder"] != folder:
                prune_empty_folders(db, row["library_id"])
    except sqlite3.IntegrityError:
        return jsonify({"error": "目标文件夹下已存在相同的链接，未移动"}), 409

    updated = db.execute("SELECT * FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    return jsonify({"item": bookmark_payload(updated)})


@app.post("/api/bookmarks/batch-delete")
def api_batch_delete_bookmarks():
    payload = request.get_json(silent=True) or {}
    raw_ids = payload.get("ids")
    if not isinstance(raw_ids, list):
        return jsonify({"error": "请选择要删除的收藏"}), 400

    ids: list[int] = []
    for value in raw_ids[:1000]:
        try:
            bookmark_id = int(value)
        except (TypeError, ValueError):
            continue
        if bookmark_id > 0 and bookmark_id not in ids:
            ids.append(bookmark_id)
    if not ids:
        return jsonify({"error": "请选择要删除的收藏"}), 400

    db = get_db()
    placeholders = ",".join("?" * len(ids))
    libraries = [
        row["library_id"]
        for row in db.execute(
            f"SELECT DISTINCT library_id FROM bookmarks WHERE id IN ({placeholders})", ids
        ).fetchall()
    ]
    with db:
        db.execute(f"DELETE FROM bookmark_opens WHERE bookmark_id IN ({placeholders})", ids)
        deleted = db.execute(f"DELETE FROM bookmarks WHERE id IN ({placeholders})", ids).rowcount
        for library_id in libraries:
            prune_empty_folders(db, library_id)
    return jsonify({"ok": True, "deleted": deleted})


@app.delete("/api/bookmarks/<int:bookmark_id>")
def api_delete_bookmark(bookmark_id: int):
    db = get_db()
    row = db.execute("SELECT library_id FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone()
    if row is None:
        return jsonify({"error": "收藏不存在"}), 404
    with db:
        db.execute("DELETE FROM bookmark_opens WHERE bookmark_id = ?", (bookmark_id,))
        db.execute("DELETE FROM bookmarks WHERE id = ?", (bookmark_id,))
        prune_empty_folders(db, row["library_id"])
    return jsonify({"ok": True})


@app.post("/api/bookmarks/<int:bookmark_id>/open")
def api_record_open(bookmark_id: int):
    db = get_db()
    if not db.execute("SELECT 1 FROM bookmarks WHERE id = ?", (bookmark_id,)).fetchone():
        return jsonify({"error": "收藏不存在"}), 404
    with db:
        db.execute(
            "INSERT INTO bookmark_opens(bookmark_id, opened_at) VALUES(?, ?)",
            (bookmark_id, int(time.time())),
        )
    return jsonify({"ok": True}), 201


@app.post("/api/libraries/<int:library_id>/tags")
def api_library_tags(library_id: int):
    db = get_db()
    if not db.execute("SELECT 1 FROM libraries WHERE id = ?", (library_id,)).fetchone():
        return jsonify({"error": "收藏夹不存在"}), 404
    payload = request.get_json(silent=True) or {}
    tags = normalize_tags(payload.get("tags", ""))
    with db:
        db.execute("UPDATE libraries SET tags = ? WHERE id = ?", (tags, library_id))
    return jsonify({"library": library_id, "tags": tags_list(tags)})


@app.get("/api/tags")
def api_tags():
    db = get_db()
    library_id = requested_library(db)
    counts: dict[str, int] = {}

    def add(tag_string: str, weight: int = 1) -> None:
        for tag in tags_list(tag_string):
            counts[tag] = counts.get(tag, 0) + weight

    if library_id:
        for row in db.execute("SELECT tags FROM libraries WHERE id = ?", (library_id,)):
            add(row["tags"])
        for row in db.execute(
            "SELECT tags FROM bookmarks WHERE library_id = ?", (library_id,)
        ):
            add(row["tags"])
    else:
        for row in db.execute("SELECT tags FROM libraries"):
            add(row["tags"])
        for row in db.execute("SELECT tags FROM bookmarks"):
            add(row["tags"])
    ordered = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return jsonify({"tags": [{"tag": tag, "count": count} for tag, count in ordered]})


def tag_items(db: sqlite3.Connection, tag: str) -> list[sqlite3.Row]:
    return db.execute(
        """
        SELECT b.*, l.name AS library_name, l.browser AS library_browser
        FROM bookmarks b
        JOIN libraries l ON l.id = b.library_id
        WHERE instr(' ' || b.tags || ' ', ' ' || ? || ' ') > 0
           OR instr(' ' || l.tags || ' ', ' ' || ? || ' ') > 0
        ORDER BY b.add_date DESC, b.id DESC
        """,
        (tag, tag),
    ).fetchall()


def build_tag_payload(db: sqlite3.Connection, tag: str, sort: str, filter_key: str) -> dict:
    now = int(time.time())
    week_start = now - 7 * 86400
    day_start = now - 86400
    rows = tag_items(db, tag)
    ids = [row["id"] for row in rows]
    stats: dict[int, dict] = {}
    if ids:
        placeholders = ",".join("?" * len(ids))
        for stat in db.execute(
            f"""
            SELECT bookmark_id, COUNT(*) AS total,
                   SUM(CASE WHEN opened_at >= ? THEN 1 ELSE 0 END) AS week,
                   SUM(CASE WHEN opened_at >= ? THEN 1 ELSE 0 END) AS day,
                   MAX(opened_at) AS last_open
            FROM bookmark_opens WHERE bookmark_id IN ({placeholders})
            GROUP BY bookmark_id
            """,
            [week_start, day_start] + ids,
        ):
            stats[stat["bookmark_id"]] = {
                "use_count": stat["total"],
                "week_count": stat["week"],
                "day_count": stat["day"],
                "last_open": stat["last_open"] or 0,
            }

    items = []
    for row in rows:
        stat = stats.get(row["id"], {"use_count": 0, "week_count": 0, "day_count": 0, "last_open": 0})
        if filter_key == "week" and stat["week_count"] == 0:
            continue
        if filter_key == "day" and stat["day_count"] == 0:
            continue
        if filter_key == "none" and stat["use_count"] > 0:
            continue
        items.append(
            {
                "id": row["id"],
                "library_id": row["library_id"],
                "library_name": row["library_name"],
                "library_browser": row["library_browser"],
                "title": row["title"] or row["url"],
                "url": row["url"],
                "folder": row["folder"],
                "icon": row["icon"] or "",
                "tags": tags_list(row["tags"]),
                "add_date": row["add_date"],
                "host": row["host"] or host_of(row["url"]),
                "net_status": row["net_status"],
                "net_error": row["net_error"] or "",
                **stat,
            }
        )

    if sort == "uses":
        items.sort(key=lambda item: (item["use_count"], item["add_date"], item["id"]), reverse=True)
    elif sort == "week":
        items.sort(key=lambda item: (item["week_count"], item["use_count"], item["add_date"]), reverse=True)
    elif sort == "day":
        items.sort(key=lambda item: (item["day_count"], item["use_count"], item["add_date"]), reverse=True)
    elif sort == "title":
        items.sort(key=lambda item: (item["title"].casefold(), item["id"]))
    else:
        items.sort(key=lambda item: (item["add_date"], item["id"]), reverse=True)

    groups_map: dict[int, dict] = {}
    for item in items:
        group = groups_map.setdefault(
            item["library_id"],
            {
                "library": {
                    "id": item["library_id"],
                    "name": item["library_name"],
                    "browser": item["library_browser"],
                },
                "folders": {},
                "total": 0,
            },
        )
        group["total"] += 1
        folder = item["folder"]
        group["folders"].setdefault(folder, []).append(item)

    groups = []
    for group in groups_map.values():
        paths = set()
        for folder in group["folders"]:
            if not folder:
                paths.add("")
                continue
            parts = folder.split("/")
            for i in range(1, len(parts) + 1):
                paths.add("/".join(parts[:i]))
        folder_rows = {
            row["path"]: row
            for row in db.execute(
                "SELECT path, name, parent, ord FROM folders WHERE library_id = ?",
                (group["library"]["id"],),
            ).fetchall()
        }
        nodes: dict[str, dict] = {}
        for path in paths:
            if not path:
                nodes[""] = {
                    "path": "",
                    "name": "未分类",
                    "parent": None,
                    "ord": 10**9,
                    "depth": 0,
                    "children": [],
                    "items": group["folders"].get("", []),
                }
                continue
            source = folder_rows.get(path)
            parent = source["parent"] if source else path.rsplit("/", 1)[0]
            nodes[path] = {
                "path": path,
                "name": source["name"] if source else path.rsplit("/", 1)[-1],
                "parent": parent,
                "ord": source["ord"] if source else 10**8,
                "depth": path.count("/") + 1,
                "children": [],
                "items": group["folders"].get(path, []),
            }
        for path, node in nodes.items():
            if path and node["parent"] in nodes:
                nodes[node["parent"]]["children"].append(node)
        roots = [node for path, node in nodes.items() if not path or node["parent"] not in nodes]

        def sort_tree(node: dict) -> dict:
            node["children"].sort(key=lambda child: (child["ord"], child["name"]))
            for child in node["children"]:
                sort_tree(child)
            return node

        for root in roots:
            sort_tree(root)
        roots.sort(key=lambda node: (node["ord"], node["name"]))
        group["tree"] = roots
        group["folder_count"] = len([path for path in paths if path])
        group.pop("folders", None)
        groups.append(group)

    groups.sort(key=lambda group: group["library"]["name"])
    return {
        "tag": tag,
        "sort": sort,
        "filter": filter_key,
        "total": len(items),
        "groups": groups,
    }


@app.get("/api/tags/<tag>")
def api_tag_detail(tag: str):
    clean = normalize_tags(tag)
    tag = clean.split()[0] if clean else ""
    if not tag:
        return jsonify({"error": "标签无效"}), 400
    db = get_db()
    sort = request.args.get("sort", "recent")
    filter_key = request.args.get("filter", "all")
    if sort not in {"recent", "uses", "week", "day", "title"}:
        sort = "recent"
    if filter_key not in {"all", "week", "day", "none"}:
        filter_key = "all"
    return jsonify(build_tag_payload(db, tag, sort, filter_key))


@app.get("/tags/<tag>")
def tag_page(tag: str):
    clean = normalize_tags(tag)
    tag = clean.split()[0] if clean else ""
    if not tag:
        return "标签无效", 400
    return render_template("tag.html", tag=tag)


@app.get("/api/page-title")
def api_page_title():
    url = clean_url(request.args.get("url"))
    if not url.lower().startswith(("http://", "https://")):
        return jsonify({"error": "只支持 http/https 网址"}), 400
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": (
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                    "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
                )
            },
        )
        with urllib.request.urlopen(req, timeout=8) as resp:
            charset = resp.headers.get_content_charset() or "utf-8"
            body = resp.read(300_000)
        text = body.decode(charset, errors="replace")
        match = re.search(r"<title[^>]*>(.*?)</title>", text, re.I | re.S)
        if not match:
            return jsonify({"error": "页面里没有找到标题"}), 404
        title = clean_text(unescape(strip_tags(match.group(1))))
        return jsonify({"title": title[:200]})
    except Exception as exc:  # noqa: BLE001
        return jsonify({"error": f"获取失败：{exc}"}), 502


# ---------------------------------------------------------------------------
# 局域网访问（简单开关 + 简单密码）
# ---------------------------------------------------------------------------
def lane_enabled(db: sqlite3.Connection) -> bool:
    return get_setting(db, "lan_enabled", "0") == "1"


def password_hash(db: sqlite3.Connection) -> str:
    return get_setting(db, "lan_password_hash", "")


@app.before_request
def guard_lan_access():
    path = request.path
    if path.startswith("/static/") or path in {"/login", "/logout", "/api/network/status"}:
        return None
    if is_local_request():
        return None
    db = get_db()
    if not lane_enabled(db):
        return (
            "<h3>局域网访问未开启</h3><p>请在电脑端 LikeBox 的「局域网」设置中开启，并设置访问密码。</p>",
            403,
        )
    if not password_hash(db):
        return (
            "<h3>尚未设置访问密码</h3><p>请在电脑端打开 LikeBox，进入「局域网」设置并设置访问密码。</p>",
            403,
        )
    if session.get("lan_ok"):
        return None
    if path.startswith("/api/"):
        return jsonify({"error": "需要先在 /login 输入访问密码"}), 401
    next_path = request.full_path if request.query_string else request.path
    return redirect(url_for("login_page", next=next_path))


@app.get("/login")
def login_page():
    db = get_db()
    return render_template(
        "login.html",
        enabled=lane_enabled(db),
        has_password=bool(password_hash(db)),
    )


@app.post("/login")
def login_submit():
    db = get_db()
    if not lane_enabled(db) or not password_hash(db):
        return render_template(
            "login.html",
            enabled=lane_enabled(db),
            has_password=bool(password_hash(db)),
            error="局域网访问尚未开启或未设置密码，请在电脑端设置。",
        ), 403
    password = request.form.get("password", "")
    if check_password_hash(password_hash(db), password):
        session["lan_ok"] = True
        next_path = request.form.get("next", "/")
        if not next_path.startswith("/") or next_path.startswith("//"):
            next_path = "/"
        return redirect(next_path)
    return render_template(
        "login.html",
        enabled=True,
        has_password=True,
        error="密码不正确，请重试。",
    ), 401


@app.get("/logout")
def logout_page():
    session.clear()
    return redirect(url_for("login_page"))


@app.get("/api/network/status")
def api_network_status():
    db = get_db()
    return jsonify(
        {
            "is_local": is_local_request(),
            "enabled": lane_enabled(db),
            "has_password": bool(password_hash(db)),
            "authenticated": bool(session.get("lan_ok")) or is_local_request(),
            "port": PORT,
        }
    )


@app.get("/api/network")
def api_network():
    if not is_local_request():
        return jsonify({"error": "只有电脑端可以查看和修改局域网设置"}), 403
    db = get_db()
    return jsonify(
        {
            "is_local": True,
            "enabled": lane_enabled(db),
            "has_password": bool(password_hash(db)),
            "port": PORT,
            "addresses": local_ip_addresses(),
        }
    )


@app.post("/api/network/settings")
def api_network_settings():
    if not is_local_request():
        return jsonify({"error": "只有电脑端可以修改局域网设置"}), 403
    payload = request.get_json(silent=True) or {}
    db = get_db()
    enabled = bool(payload.get("enabled"))
    password = str(payload.get("password") or "")
    if password and (len(password) < 4 or len(password) > 64):
        return jsonify({"error": "访问密码长度需要 4-64 位"}), 400
    if enabled and not password_hash(db) and not password:
        return jsonify({"error": "开启局域网访问前请设置至少 4 位访问密码"}), 400
    with db:
        if password:
            set_setting(db, "lan_password_hash", generate_password_hash(password))
        set_setting(db, "lan_enabled", "1" if enabled else "0")
    return jsonify(
        {
            "is_local": True,
            "enabled": lane_enabled(db),
            "has_password": bool(password_hash(db)),
            "port": PORT,
            "addresses": local_ip_addresses(),
        }
    )


@app.post("/api/network/password")
def api_network_password():
    if not is_local_request():
        return jsonify({"error": "只有电脑端可以重置访问密码"}), 403
    payload = request.get_json(silent=True) or {}
    password = str(payload.get("password") or "")
    if len(password) < 4 or len(password) > 64:
        return jsonify({"error": "密码长度需要 4-64 位"}), 400
    db = get_db()
    with db:
        set_setting(db, "lan_password_hash", generate_password_hash(password))
    return jsonify({"ok": True, "length": len(password)})


# ---------------------------------------------------------------------------
# 链接可访问性检测 & 排除域名
# ---------------------------------------------------------------------------
CHECK_JOBS: dict[str, dict] = {}
CHECK_LOCK = threading.Lock()


def clean_domain(value: str | None) -> str:
    raw = clean_text(value)
    if not raw:
        return ""
    if "://" in raw:
        try:
            raw = urllib.parse.urlsplit(raw).hostname or ""
        except ValueError:
            raw = ""
    else:
        raw = raw.split("/")[0].split(":")[0]
    raw = raw.strip().lower()
    if raw.startswith("www."):
        raw = raw[4:]
    if not re.match(r"^[a-z0-9\.\-]+$", raw):
        return ""
    return raw


def status_is_reachable(code: int) -> bool:
    if 200 <= code < 400:
        return True
    return code in {401, 403, 405, 429}


def check_url(url: str) -> tuple[int, str]:
    """返回 (1 可访问 / 2 失效 / 0 跳过)。用 HEAD，必要时回退 GET。"""
    raw = (url or "").strip()
    if not raw.lower().startswith(("http://", "https://")):
        return 0, ""
    headers = {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            "(KHTML, like Gecko) Chrome/131.0 Safari/537.36"
        ),
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }

    def attempt(method: str) -> tuple[int, str]:
        req = urllib.request.Request(raw, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                if method == "GET":
                    resp.read(32_000)
                return int(getattr(resp, "status", 200)), ""
        except urllib.error.HTTPError as exc:
            return int(exc.code), f"HTTP {exc.code}"
        except Exception as exc:  # noqa: BLE001
            return 0, str(exc)[:160]

    code, error = attempt("HEAD")
    need_get = code == 0 or code in {400, 403, 404, 405, 500, 501, 502, 503, 504}
    if need_get:
        code2, error2 = attempt("GET")
        if code2 and (status_is_reachable(code2) or code == 0):
            code, error = code2, error2
        elif code == 0:
            code, error = code2, error2
    return (1 if status_is_reachable(code) else 2), ("" if status_is_reachable(code) else (error or f"HTTP {code}"))


def run_check_job(job_id: str, library_id: int, ids: list[int]) -> None:
    con = connect()
    domains = {
        row["domain"]
        for row in con.execute(
            "SELECT domain FROM excluded_domains WHERE library_id = ?", (library_id,)
        ).fetchall()
    }
    for bookmark_id in ids:
        row = con.execute(
            "SELECT url, host FROM bookmarks WHERE id = ? AND library_id = ?",
            (bookmark_id, library_id),
        ).fetchone()
        if row is None:
            with CHECK_LOCK:
                CHECK_JOBS[job_id]["done"] += 1
            continue
        if is_domain_excluded(row["host"], domains):
            status, error = 0, ""
        else:
            status, error = check_url(row["url"])
        with con:
            con.execute(
                "UPDATE bookmarks SET net_status = ?, net_error = ?, net_checked = ? WHERE id = ?",
                (status, error[:300], int(time.time()), bookmark_id),
            )
        with CHECK_LOCK:
            job = CHECK_JOBS[job_id]
            job["done"] += 1
            if status == 1:
                job["ok"] += 1
            elif status == 2:
                job["fail"] += 1
    con.close()
    with CHECK_LOCK:
        CHECK_JOBS[job_id]["running"] = False


@app.post("/api/check/start")
def api_check_start():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = folder_library(db, payload)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    scope = payload.get("scope", "ids")
    if scope == "library":
        ids = [
            row["id"]
            for row in db.execute(
                "SELECT id FROM bookmarks WHERE library_id = ? ORDER BY id", (library_id,)
            ).fetchall()
        ]
    else:
        raw_ids = payload.get("ids") or []
        try:
            ids = [int(item) for item in raw_ids][:1000]
        except (TypeError, ValueError):
            return jsonify({"error": "收藏 ID 无效"}), 400
        if ids:
            valid = {
                row["id"]
                for row in db.execute(
                    "SELECT id FROM bookmarks WHERE library_id = ? AND id IN ("
                    + ",".join("?" * len(ids))
                    + ")",
                    [library_id] + ids,
                ).fetchall()
            }
            ids = [item for item in ids if item in valid]
    if not ids:
        return jsonify({"error": "没有可检测的链接"}), 400

    with CHECK_LOCK:
        for existing in CHECK_JOBS.values():
            if existing["library_id"] == library_id and existing["running"]:
                return jsonify({"job": existing})
        job_id = secrets.token_hex(8)
        job = {
            "id": job_id,
            "library_id": library_id,
            "total": len(ids),
            "done": 0,
            "ok": 0,
            "fail": 0,
            "running": True,
        }
        CHECK_JOBS[job_id] = job
    thread = threading.Thread(
        target=run_check_job, args=(job_id, library_id, ids), daemon=True
    )
    thread.start()
    return jsonify({"job": job}), 201


@app.get("/api/check/<job_id>")
def api_check_status(job_id: str):
    job = CHECK_JOBS.get(job_id)
    if not job:
        return jsonify({"error": "检测任务不存在"}), 404
    return jsonify({"job": job})


@app.get("/api/exclusions")
def api_exclusions():
    db = get_db()
    library_id = requested_library(db)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    rows = db.execute(
        "SELECT domain, created_at FROM excluded_domains WHERE library_id = ? ORDER BY domain",
        (library_id,),
    ).fetchall()
    return jsonify(
        {
            "library": library_id,
            "domains": [{"domain": row["domain"], "created_at": row["created_at"]} for row in rows],
        }
    )


@app.post("/api/exclusions")
def api_add_exclusion():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = folder_library(db, payload)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    domain = clean_domain(payload.get("domain"))
    if not domain:
        return jsonify({"error": "域名无效"}), 400
    with db:
        db.execute(
            "INSERT OR IGNORE INTO excluded_domains(library_id, domain, created_at) VALUES(?, ?, ?)",
            (library_id, domain, int(time.time())),
        )
        rows = db.execute(
            "SELECT id, host FROM bookmarks WHERE library_id = ? AND net_status <> 0",
            (library_id,),
        ).fetchall()
        for row in rows:
            if is_domain_excluded(row["host"] or "", {domain}):
                db.execute(
                    "UPDATE bookmarks SET net_status = 0, net_error = '' WHERE id = ?",
                    (row["id"],),
                )
    return jsonify({"ok": True, "domain": domain})


@app.delete("/api/exclusions")
def api_delete_exclusion():
    payload = request.get_json(silent=True) or {}
    db = get_db()
    library_id = folder_library(db, payload)
    if library_id is None:
        return jsonify({"error": "收藏夹不存在"}), 404
    domain = clean_domain(payload.get("domain"))
    if not domain:
        return jsonify({"error": "域名无效"}), 400
    with db:
        db.execute(
            "DELETE FROM excluded_domains WHERE library_id = ? AND domain = ?",
            (library_id, domain),
        )
    return jsonify({"ok": True})


@app.post("/api/import")
def api_import():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return jsonify({"error": "没有收到文件"}), 400
    raw = upload.read().decode("utf-8", errors="replace")
    parsed = parse_netscape(raw)
    if not parsed["bookmarks"]:
        return jsonify({"error": "没有解析到任何收藏，请确认是浏览器导出的书签 HTML"}), 400

    browser = detect_browser(raw, upload.filename)
    filename = os.path.basename(upload.filename)
    name = f"{browser} · {Path(filename).stem}"
    db = get_db()
    try:
        with db:
            library_id = create_library(db, name, browser, filename, parsed=parsed)
            prune_empty_folders(db, library_id)
    except sqlite3.Error as exc:
        return jsonify({"error": f"导入失败：{exc}"}), 500

    payload = build_library_payload(db)
    library = next((lib for lib in payload["libraries"] if lib["id"] == library_id), None)
    return jsonify(
        {
            "parsed": len(parsed["bookmarks"]),
            "inserted": library["total"] if library else 0,
            "browser": browser,
            "library": library,
            "libraries": payload["libraries"],
            "primary": payload["primary"],
        }
    )


@app.get("/api/export")
def api_export():
    db = get_db()
    library_id = requested_library(db)
    if library_id is None:
        return jsonify({"error": "没有可导出的收藏夹"}), 404
    row = db.execute("SELECT name FROM libraries WHERE id = ?", (library_id,)).fetchone()
    doc = build_export(db, library_id)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / EXPORT_NAME
    path.write_text(doc, encoding="utf-8")
    return send_file(
        path,
        mimetype="text/html",
        as_attachment=True,
        download_name=EXPORT_NAME,
    )


def build_export(db: sqlite3.Connection, library_id: int) -> str:
    rows = db.execute(
        "SELECT id, title, url, folder, icon, add_date, tags FROM bookmarks WHERE library_id = ? ORDER BY folder, id",
        (library_id,),
    ).fetchall()
    by_folder: dict[str, list[sqlite3.Row]] = {}
    for row in rows:
        by_folder.setdefault(row["folder"], []).append(row)

    folder_rows = db.execute(
        "SELECT path, name, parent, ord FROM folders WHERE library_id = ? ORDER BY ord, path",
        (library_id,),
    ).fetchall()
    nodes = {
        row["path"]: {
            "name": row["name"],
            "parent": row["parent"],
            "ord": row["ord"],
            "children": [],
        }
        for row in folder_rows
    }
    for path, node in nodes.items():
        if node["parent"] in nodes:
            nodes[node["parent"]]["children"].append(path)
    roots = sorted(
        [p for p, n in nodes.items() if n["parent"] not in nodes],
        key=lambda p: (nodes[p]["ord"], nodes[p]["name"]),
    )

    def bookmark_lines(folder: str, indent: int) -> list[str]:
        out = []
        for row in by_folder.get(folder, []):
            attrs = f'HREF="{escape(row["url"], quote=True)}" ADD_DATE="{row["add_date"] or ""}"'
            if row["icon"]:
                attrs += f' ICON="{escape(row["icon"], quote=True)}"'
            if row["tags"]:
                attrs += f' TAGS="{escape(row["tags"], quote=True)}"'
            out.append(f'{" " * indent}<DT><A {attrs}>{escape(row["title"])}</A>')
        return out

    def render(path: str, indent: int) -> list[str]:
        node = nodes[path]
        lines = [f'{" " * indent}<DT><H3>{escape(node["name"])}</H3>', f'{" " * indent}<DL><p>']
        lines += bookmark_lines(path, indent + 4)
        for child in sorted(node["children"], key=lambda p: (nodes[p]["ord"], nodes[p]["name"])):
            lines += render(child, indent + 4)
        lines.append(f'{" " * indent}</DL><p>')
        return lines

    lines = [
        "<!DOCTYPE NETSCAPE-Bookmark-file-1>",
        "<!-- This is an automatically generated file.",
        "     It will be read and overwritten.",
        "     DO NOT EDIT! -->",
        '<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">',
        "<TITLE>Bookmarks</TITLE>",
        "<H1>Bookmarks</H1>",
        "<DL><p>",
    ]
    lines += bookmark_lines("", 4)
    for root in roots:
        lines += render(root, 4)
    lines += ["</DL><p>", ""]
    return "\n".join(lines)


init_db()


def load_secret_key() -> str:
    con = connect()
    key = get_setting(con, "secret_key", "")
    if not key:
        key = secrets.token_hex(32)
        with con:
            set_setting(con, "secret_key", key)
    con.close()
    return key


app.secret_key = load_secret_key()
app.config.update(SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax")


if __name__ == "__main__":
    if os.environ.get("LIKEBOX_OPEN") == "1":
        import webbrowser

        threading.Timer(1.2, lambda: webbrowser.open(f"http://127.0.0.1:{PORT}/")).start()
    print(f"LikeBox 已启动：http://127.0.0.1:{PORT}/  （局域网监听 0.0.0.0:{PORT}）")
    app.run(host="0.0.0.0", port=PORT, debug=False, threaded=True)
