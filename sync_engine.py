#!/usr/bin/env python3
"""LikeBox 双向同步引擎。

设计要点：
- 只同步主收藏夹的文件夹、书签和排除域名。
- 每端保留自己的 SQLite 文件，不做数据库文件覆盖。
- 以稳定业务键匹配：文件夹 path、书签 (url, folder)、排除域名 domain。
- 用 row hash + 本地状态表检测新增/修改/删除；删除写入 tombstone。
- 冲突按版本号后写优先；版本相同且内容不同时，服务端（电脑）优先。
- 手机端作为客户端轮询电脑端的 /api/sync/merge。
"""

from __future__ import annotations

import hashlib
import json
import logging
import secrets
import sqlite3
import threading
import time
import urllib.error
import urllib.request
from typing import Any

LOG = logging.getLogger("likebox.sync")

SYNC_SCHEMA = """
CREATE TABLE IF NOT EXISTS sync_state (
    entity     TEXT NOT NULL,
    key        TEXT NOT NULL,
    hash       TEXT NOT NULL DEFAULT '',
    version    INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (entity, key)
);
CREATE TABLE IF NOT EXISTS sync_tombstones (
    entity     TEXT NOT NULL,
    key        TEXT NOT NULL,
    deleted_at INTEGER NOT NULL DEFAULT 0,
    origin     TEXT NOT NULL DEFAULT '',
    PRIMARY KEY (entity, key)
);
CREATE INDEX IF NOT EXISTS ix_sync_tombstones_deleted
    ON sync_tombstones(deleted_at);
"""

BOOKMARK_FIELDS = (
    "title",
    "url",
    "folder",
    "icon",
    "add_date",
    "created_at",
    "updated_at",
    "tags",
    "host",
    "net_status",
    "net_error",
    "domain_status",
    "domain_error",
    "net_checked",
    "note",
)
BOOKMARK_TEXT_FIELDS = {
    "title",
    "url",
    "folder",
    "icon",
    "tags",
    "host",
    "net_error",
    "domain_error",
    "note",
}
BOOKMARK_INT_FIELDS = {
    "add_date",
    "created_at",
    "updated_at",
    "net_status",
    "domain_status",
    "net_checked",
}
FOLDER_FIELDS = ("path", "name", "parent", "ord")
LIBRARY_FIELDS = ("name", "browser", "filename", "is_primary", "created_at", "tags")
EXCLUDED_FIELDS = ("domain", "created_at")

ENTITIES = ("library", "folder", "bookmark", "excluded")

_WORKER_LOCK = threading.Lock()
_WORKER_STARTED = False


# ---------------------------------------------------------------------------
# 基础工具
# ---------------------------------------------------------------------------
def get_setting(con: sqlite3.Connection, key: str, default: str = "") -> str:
    row = con.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    if row is None:
        return default
    return str(row["value"] if isinstance(row, sqlite3.Row) else row[0])


def set_setting(con: sqlite3.Connection, key: str, value: str) -> None:
    con.execute(
        "INSERT INTO settings(key, value) VALUES(?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, str(value)),
    )


def ensure_sync_schema(con: sqlite3.Connection) -> None:
    con.executescript(SYNC_SCHEMA)


def ensure_device_id(con: sqlite3.Connection) -> str:
    device_id = get_setting(con, "sync_device_id", "")
    if not device_id:
        device_id = secrets.token_hex(16)
        set_setting(con, "sync_device_id", device_id)
    return device_id


def verify_token(con: sqlite3.Connection, supplied: str | None) -> bool:
    expected = get_setting(con, "sync_token", "")
    if not expected or not supplied:
        return False
    # 常量时间比较，避免令牌被时序侧信道猜测
    return secrets.compare_digest(expected, supplied)


def _int(value: Any, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _text(value: Any) -> str:
    if value is None:
        return ""
    return str(value)


def _json_hash(data: dict[str, Any]) -> str:
    raw = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def _normalize_bookmark(row: sqlite3.Row) -> dict[str, Any]:
    result: dict[str, Any] = {}
    for field in BOOKMARK_FIELDS:
        value = row[field]
        if field in BOOKMARK_TEXT_FIELDS:
            result[field] = _text(value)
        elif field in BOOKMARK_INT_FIELDS:
            result[field] = _int(value)
        else:
            result[field] = value
    return result


def _normalize_folder(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "path": _text(row["path"]),
        "name": _text(row["name"]),
        "parent": _text(row["parent"]),
        "ord": _int(row["ord"]),
    }


def _normalize_library(row: sqlite3.Row) -> dict[str, Any]:
    return {
        "name": _text(row["name"]),
        "browser": _text(row["browser"]),
        "filename": _text(row["filename"]),
        "is_primary": _int(row["is_primary"]),
        "created_at": _int(row["created_at"]),
        "tags": _text(row["tags"]),
    }


def _normalize_excluded(row: sqlite3.Row) -> dict[str, Any]:
    return {"domain": _text(row["domain"]), "created_at": _int(row["created_at"])}


def _bookmark_key(url: str, folder: str) -> str:
    return json.dumps([url, folder], ensure_ascii=False, separators=(",", ":"))


def _parse_bookmark_key(key: str) -> tuple[str, str]:
    value = json.loads(key)
    if not isinstance(value, list) or len(value) != 2:
        raise ValueError("bad bookmark key")
    return _text(value[0]), _text(value[1])


def _primary_library(con: sqlite3.Connection) -> sqlite3.Row:
    row = con.execute(
        "SELECT * FROM libraries WHERE is_primary = 1 ORDER BY id LIMIT 1"
    ).fetchone()
    if row is None:
        row = con.execute("SELECT * FROM libraries ORDER BY id LIMIT 1").fetchone()
    if row is None:
        raise RuntimeError("数据库里没有收藏夹")
    return row


def _base_version(entity: str, data: dict[str, Any]) -> int:
    if entity == "bookmark":
        return max(
            _int(data.get("updated_at")),
            _int(data.get("created_at")),
            _int(data.get("add_date")),
        )
    if entity in ("library", "excluded"):
        return _int(data.get("created_at"))
    return 0


def _collect_rows(con: sqlite3.Connection) -> list[dict[str, Any]]:
    library = _primary_library(con)
    library_id = _int(library["id"])
    rows: list[dict[str, Any]] = []

    data = _normalize_library(library)
    rows.append(
        {
            "entity": "library",
            "key": "primary",
            "data": data,
            "hash": _json_hash(data),
            "base_version": _base_version("library", data),
        }
    )

    for row in con.execute(
        "SELECT path, name, parent, ord FROM folders WHERE library_id = ? ORDER BY path",
        (library_id,),
    ):
        data = _normalize_folder(row)
        rows.append(
            {
                "entity": "folder",
                "key": data["path"],
                "data": data,
                "hash": _json_hash(data),
                "base_version": 0,
            }
        )

    for row in con.execute(
        "SELECT * FROM bookmarks WHERE library_id = ? ORDER BY id",
        (library_id,),
    ):
        data = _normalize_bookmark(row)
        key = _bookmark_key(data["url"], data["folder"])
        rows.append(
            {
                "entity": "bookmark",
                "key": key,
                "data": data,
                "hash": _json_hash(data),
                "base_version": _base_version("bookmark", data),
            }
        )

    for row in con.execute(
        "SELECT domain, created_at FROM excluded_domains WHERE library_id = ? ORDER BY domain",
        (library_id,),
    ):
        data = _normalize_excluded(row)
        rows.append(
            {
                "entity": "excluded",
                "key": data["domain"],
                "data": data,
                "hash": _json_hash(data),
                "base_version": _base_version("excluded", data),
            }
        )
    return rows


def _load_state(con: sqlite3.Connection) -> dict[tuple[str, str], tuple[str, int]]:
    state: dict[tuple[str, str], tuple[str, int]] = {}
    for row in con.execute("SELECT entity, key, hash, version FROM sync_state"):
        state[(_text(row["entity"]), _text(row["key"]))] = (
            _text(row["hash"]),
            _int(row["version"]),
        )
    return state


def _load_tombstones(con: sqlite3.Connection) -> dict[tuple[str, str], dict[str, Any]]:
    result: dict[tuple[str, str], dict[str, Any]] = {}
    for row in con.execute(
        "SELECT entity, key, deleted_at, origin FROM sync_tombstones"
    ):
        result[(_text(row["entity"]), _text(row["key"]))] = {
            "deleted_at": _int(row["deleted_at"]),
            "origin": _text(row["origin"]),
        }
    return result


def _upsert_tombstone(
    con: sqlite3.Connection, entity: str, key: str, deleted_at: int, origin: str
) -> None:
    current = con.execute(
        "SELECT deleted_at, origin FROM sync_tombstones WHERE entity = ? AND key = ?",
        (entity, key),
    ).fetchone()
    if current is not None and _int(current["deleted_at"]) > deleted_at:
        return
    con.execute(
        "INSERT INTO sync_tombstones(entity, key, deleted_at, origin) VALUES(?, ?, ?, ?) "
        "ON CONFLICT(entity, key) DO UPDATE SET "
        "deleted_at = excluded.deleted_at, origin = excluded.origin",
        (entity, key, deleted_at, origin),
    )


def ensure_state(con: sqlite3.Connection) -> None:
    """首次启用同步时，以当前数据库作为基线，不把已有数据当成新增。"""
    count = con.execute("SELECT COUNT(*) FROM sync_state").fetchone()[0]
    if count:
        return
    save_state(con)


def build_snapshot(
    con: sqlite3.Connection, device_id: str, now: int | None = None
) -> dict[str, Any]:
    """生成当前端的同步快照，并把本端删除动作写入 tombstone。"""
    now = int(now or time.time())
    state = _load_state(con)
    current = _collect_rows(con)
    current_keys = {(row["entity"], row["key"]) for row in current}

    # 状态里有、当前库里没有 -> 本端删除
    for (entity, key), (_hash, _version) in state.items():
        if (entity, key) in current_keys:
            continue
        if entity == "library":
            continue
        _upsert_tombstone(con, entity, key, now, device_id)

    result_rows: list[dict[str, Any]] = []
    for row in current:
        previous = state.get((row["entity"], row["key"]))
        changed = previous is None or previous[0] != row["hash"]
        if changed:
            version = max(_int(row["base_version"]), now)
        else:
            version = previous[1] if previous is not None else _int(row["base_version"])
        result_rows.append(
            {
                "entity": row["entity"],
                "key": row["key"],
                "hash": row["hash"],
                "version": int(version),
                "data": row["data"],
            }
        )

    tombstones = [
        {
            "entity": entity,
            "key": key,
            "deleted_at": value["deleted_at"],
            "origin": value["origin"],
        }
        for (entity, key), value in _load_tombstones(con).items()
        if entity != "library"
    ]

    return {
        "device_id": device_id,
        "generated_at": now,
        "rows": result_rows,
        "deletions": tombstones,
    }


def _find_local_row(
    con: sqlite3.Connection, entity: str, key: str, library_id: int
) -> sqlite3.Row | None:
    if entity == "library":
        return _primary_library(con)
    if entity == "folder":
        return con.execute(
            "SELECT path, name, parent, ord FROM folders "
            "WHERE library_id = ? AND path = ?",
            (library_id, key),
        ).fetchone()
    if entity == "excluded":
        return con.execute(
            "SELECT domain, created_at FROM excluded_domains "
            "WHERE library_id = ? AND domain = ?",
            (library_id, key),
        ).fetchone()
    if entity == "bookmark":
        url, folder = _parse_bookmark_key(key)
        return con.execute(
            "SELECT * FROM bookmarks WHERE library_id = ? AND url = ? AND folder = ?",
            (library_id, url, folder),
        ).fetchone()
    return None


def _local_data(con: sqlite3.Connection, entity: str, key: str, library_id: int):
    row = _find_local_row(con, entity, key, library_id)
    if row is None:
        return None, None, None
    if entity == "library":
        data = _normalize_library(row)
    elif entity == "folder":
        data = _normalize_folder(row)
    elif entity == "excluded":
        data = _normalize_excluded(row)
    else:
        data = _normalize_bookmark(row)
    return data, _json_hash(data), _base_version(entity, data)


def _delete_local_row(
    con: sqlite3.Connection, entity: str, key: str, library_id: int
) -> None:
    if entity == "folder":
        con.execute(
            "DELETE FROM folders WHERE library_id = ? AND path = ?",
            (library_id, key),
        )
    elif entity == "excluded":
        con.execute(
            "DELETE FROM excluded_domains WHERE library_id = ? AND domain = ?",
            (library_id, key),
        )
    elif entity == "bookmark":
        url, folder = _parse_bookmark_key(key)
        con.execute(
            "DELETE FROM bookmarks WHERE library_id = ? AND url = ? AND folder = ?",
            (library_id, url, folder),
        )


def _apply_library(con: sqlite3.Connection, data: dict[str, Any]) -> None:
    library = _primary_library(con)
    con.execute(
        "UPDATE libraries SET name = ?, browser = ?, filename = ?, tags = ?, "
        "is_primary = 1 WHERE id = ?",
        (
            _text(data.get("name")) or "主收藏夹",
            _text(data.get("browser")) or "商业浏览器",
            _text(data.get("filename")),
            _text(data.get("tags")),
            _int(library["id"]),
        ),
    )


def _apply_row(
    con: sqlite3.Connection, entity: str, key: str, data: dict[str, Any], library_id: int
) -> None:
    if entity == "library":
        _apply_library(con, data)
        return
    if entity == "folder":
        path = _text(data.get("path")) or key
        con.execute(
            "INSERT INTO folders(library_id, path, name, parent, ord) "
            "VALUES(?, ?, ?, ?, ?) "
            "ON CONFLICT(library_id, path) DO UPDATE SET "
            "name = excluded.name, parent = excluded.parent, ord = excluded.ord",
            (
                library_id,
                path,
                _text(data.get("name")),
                _text(data.get("parent")),
                _int(data.get("ord")),
            ),
        )
        return
    if entity == "excluded":
        domain = _text(data.get("domain")) or key
        con.execute(
            "INSERT INTO excluded_domains(library_id, domain, created_at) VALUES(?, ?, ?) "
            "ON CONFLICT(library_id, domain) DO UPDATE SET created_at = excluded.created_at",
            (library_id, domain, _int(data.get("created_at"))),
        )
        return
    if entity == "bookmark":
        url, folder = _parse_bookmark_key(key)
        values = {
            "title": _text(data.get("title")),
            "url": url,
            "folder": folder,
            "icon": _text(data.get("icon")) or None,
            "add_date": _int(data.get("add_date")),
            "created_at": _int(data.get("created_at")),
            "updated_at": _int(data.get("updated_at")),
            "tags": _text(data.get("tags")),
            "host": _text(data.get("host")),
            "net_status": _int(data.get("net_status")),
            "net_error": _text(data.get("net_error")),
            "domain_status": _int(data.get("domain_status")),
            "domain_error": _text(data.get("domain_error")),
            "net_checked": _int(data.get("net_checked")),
            "note": _text(data.get("note")),
        }
        existing = con.execute(
            "SELECT id FROM bookmarks WHERE library_id = ? AND url = ? AND folder = ?",
            (library_id, url, folder),
        ).fetchone()
        if existing is not None:
            con.execute(
                "UPDATE bookmarks SET title = ?, icon = ?, add_date = ?, created_at = ?, "
                "updated_at = ?, tags = ?, host = ?, net_status = ?, net_error = ?, "
                "domain_status = ?, domain_error = ?, net_checked = ?, note = ? "
                "WHERE id = ?",
                (
                    values["title"],
                    values["icon"],
                    values["add_date"],
                    values["created_at"],
                    values["updated_at"],
                    values["tags"],
                    values["host"],
                    values["net_status"],
                    values["net_error"],
                    values["domain_status"],
                    values["domain_error"],
                    values["net_checked"],
                    values["note"],
                    _int(existing["id"]),
                ),
            )
        else:
            con.execute(
                "INSERT INTO bookmarks(library_id, title, url, folder, icon, add_date, "
                "created_at, updated_at, tags, host, net_status, net_error, "
                "domain_status, domain_error, net_checked, note) "
                "VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    library_id,
                    values["title"],
                    values["url"],
                    values["folder"],
                    values["icon"],
                    values["add_date"],
                    values["created_at"],
                    values["updated_at"],
                    values["tags"],
                    values["host"],
                    values["net_status"],
                    values["net_error"],
                    values["domain_status"],
                    values["domain_error"],
                    values["net_checked"],
                    values["note"],
                ),
            )


def apply_remote(
    con: sqlite3.Connection,
    payload: dict[str, Any],
    *,
    prefer_remote_on_tie: bool,
    device_id: str,
) -> None:
    """把对端快照合并进本地库。调用方负责 commit/rollback。"""
    library = _primary_library(con)
    library_id = _int(library["id"])
    tombstones = _load_tombstones(con)

    # 先处理删除：tombstone 覆盖旧版本行；更新的行会在后面重新插入。
    for deletion in payload.get("deletions") or []:
        entity = _text(deletion.get("entity"))
        key = _text(deletion.get("key"))
        if entity not in ENTITIES or entity == "library":
            continue
        deleted_at = _int(deletion.get("deleted_at"))
        origin = _text(deletion.get("origin")) or "remote"
        local_tomb = tombstones.get((entity, key))
        if local_tomb is not None and local_tomb["deleted_at"] > deleted_at:
            continue

        local_data, local_hash, local_version = _local_data(
            con, entity, key, library_id
        )
        if local_data is not None:
            if local_version > deleted_at:
                # 本地有更新的编辑，删除失败；不要让旧 tombstone 继续传播。
                continue
            _delete_local_row(con, entity, key, library_id)

        _upsert_tombstone(con, entity, key, deleted_at, origin)
        tombstones[(entity, key)] = {
            "deleted_at": deleted_at,
            "origin": origin,
        }

    # 再处理行：比 tombstone 新的行代表“删除后重建/更新”，允许复活。
    for row in payload.get("rows") or []:
        entity = _text(row.get("entity"))
        key = _text(row.get("key"))
        if entity not in ENTITIES:
            continue
        data = row.get("data")
        if not isinstance(data, dict):
            continue
        remote_version = _int(row.get("version"))
        remote_hash = _text(row.get("hash")) or _json_hash(data)
        local_tomb = tombstones.get((entity, key))
        if local_tomb is not None and local_tomb["deleted_at"] >= remote_version:
            continue
        if local_tomb is not None:
            con.execute(
                "DELETE FROM sync_tombstones WHERE entity = ? AND key = ?",
                (entity, key),
            )
            tombstones.pop((entity, key), None)

        local_data, local_hash, local_version = _local_data(
            con, entity, key, library_id
        )
        if local_data is not None and local_hash == remote_hash:
            continue
        should_apply = (
            local_data is None
            or remote_version > local_version
            or (remote_version == local_version and prefer_remote_on_tie)
        )
        if should_apply:
            _apply_row(con, entity, key, data, library_id)


def save_state(con: sqlite3.Connection) -> None:
    """同步完成后，以当前库为基线重建状态，避免下一轮重复上报。"""
    con.execute("DELETE FROM sync_state")
    for row in _collect_rows(con):
        con.execute(
            "INSERT INTO sync_state(entity, key, hash, version, updated_at) "
            "VALUES(?, ?, ?, ?, ?)",
            (
                row["entity"],
                row["key"],
                row["hash"],
                _int(row["base_version"]),
                int(time.time()),
            ),
        )


def handle_server_merge(
    con: sqlite3.Connection, payload: dict[str, Any], device_id: str
) -> dict[str, Any]:
    """电脑端：先拍本地快照，再合并手机快照，最后返回本地快照。"""
    remote_device = _text(payload.get("device_id"))
    if remote_device and remote_device == device_id:
        raise ValueError("不能和自己同步")

    local_snapshot = build_snapshot(con, device_id)
    apply_remote(
        con,
        payload,
        prefer_remote_on_tie=False,
        device_id=device_id,
    )
    save_state(con)
    set_setting(con, "sync_last_at", str(int(time.time())))
    set_setting(con, "sync_last_error", "")
    set_setting(
        con,
        "sync_last_result",
        json.dumps(
            {
                "remote_device": remote_device,
                "received_rows": len(payload.get("rows") or []),
                "sent_rows": len(local_snapshot.get("rows") or []),
                "deletions": len(local_snapshot.get("deletions") or []),
            },
            ensure_ascii=False,
            sort_keys=True,
        ),
    )
    local_snapshot["server_device_id"] = device_id
    return local_snapshot


def http_merge(
    peer_url: str, token: str, payload: dict[str, Any], timeout: float = 15.0
) -> dict[str, Any]:
    url = peer_url.rstrip("/") + "/api/sync/merge"
    body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json; charset=utf-8",
            "X-LikeBox-Sync-Token": token,
        },
    )
    with urllib.request.urlopen(req, timeout=timeout) as response:
        if response.status != 200:
            raise RuntimeError(f"同步接口返回 HTTP {response.status}")
        data = json.loads(response.read().decode("utf-8"))
    if not isinstance(data, dict):
        raise RuntimeError("同步接口返回格式错误")
    return data


def run_client_cycle(
    con: sqlite3.Connection,
    *,
    device_id: str,
    peer_url: str,
    token: str,
) -> dict[str, Any]:
    """手机端执行一轮：上传本地快照，合并电脑返回的快照。"""
    snapshot = build_snapshot(con, device_id)
    con.commit()

    response = http_merge(peer_url, token, snapshot)
    if _text(response.get("server_device_id")) == device_id:
        raise RuntimeError("对端设备 ID 与本机相同，请检查 sync_peer_url")

    apply_remote(
        con,
        response,
        prefer_remote_on_tie=True,
        device_id=device_id,
    )
    save_state(con)
    con.commit()
    return {
        "sent_rows": len(snapshot.get("rows") or []),
        "received_rows": len(response.get("rows") or []),
        "deletions": len(response.get("deletions") or []),
    }


def status(con: sqlite3.Connection) -> dict[str, Any]:
    return {
        "enabled": get_setting(con, "sync_enabled", "0") == "1",
        "role": get_setting(con, "sync_role", ""),
        "peer_url": get_setting(con, "sync_peer_url", ""),
        "device_id": get_setting(con, "sync_device_id", ""),
        "last_at": _int(get_setting(con, "sync_last_at", "0")),
        "last_error": get_setting(con, "sync_last_error", ""),
        "last_result": get_setting(con, "sync_last_result", ""),
        "state_rows": con.execute("SELECT COUNT(*) FROM sync_state").fetchone()[0],
        "tombstones": con.execute("SELECT COUNT(*) FROM sync_tombstones").fetchone()[0],
    }


def maybe_start_worker(db_path: str) -> None:
    global _WORKER_STARTED
    with _WORKER_LOCK:
        if _WORKER_STARTED:
            return
        try:
            con = sqlite3.connect(db_path, timeout=15)
            con.row_factory = sqlite3.Row
            enabled = get_setting(con, "sync_enabled", "0") == "1"
            role = get_setting(con, "sync_role", "")
            con.close()
        except Exception:
            LOG.exception("读取同步配置失败")
            return
        if not enabled or role != "client":
            return
        _WORKER_STARTED = True
        thread = threading.Thread(
            target=_worker_loop, args=(db_path,), name="likebox-sync", daemon=True
        )
        thread.start()
        LOG.info("双向同步客户端已启动")


def _worker_loop(db_path: str) -> None:
    con = sqlite3.connect(db_path, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA busy_timeout = 15000")
    last_error_log_at = 0.0

    while True:
        try:
            enabled = get_setting(con, "sync_enabled", "0") == "1"
            role = get_setting(con, "sync_role", "")
            peer_url = get_setting(con, "sync_peer_url", "")
            token = get_setting(con, "sync_token", "")
            interval = max(3, _int(get_setting(con, "sync_interval", "8"), 8))
            if not enabled or role != "client" or not peer_url or not token:
                time.sleep(10)
                continue

            device_id = ensure_device_id(con)
            con.commit()
            result = run_client_cycle(
                con,
                device_id=device_id,
                peer_url=peer_url,
                token=token,
            )
            with con:
                set_setting(con, "sync_last_at", str(int(time.time())))
                set_setting(con, "sync_last_error", "")
                set_setting(
                    con,
                    "sync_last_result",
                    json.dumps(result, ensure_ascii=False, sort_keys=True),
                )
            time.sleep(interval)
        except Exception as exc:  # 网络断开、对端未启动等都在这里消化
            try:
                with con:
                    set_setting(con, "sync_last_error", str(exc)[:300])
            except Exception:
                pass
            now = time.time()
            if now - last_error_log_at > 60:
                LOG.warning("双向同步失败：%s", exc)
                last_error_log_at = now
            time.sleep(10)


if __name__ == "__main__":
    # 配置工具：python sync_engine.py --role server|client [--peer URL] [--token TOKEN]
    import argparse
    import os

    parser = argparse.ArgumentParser(description="LikeBox 双向同步配置")
    parser.add_argument("--db", default=str((__import__("pathlib").Path(__file__).parent / "data" / "bookmarks.db")))
    parser.add_argument("--role", choices=["server", "client"], required=True)
    parser.add_argument("--peer", default="")
    parser.add_argument("--token", default="")
    parser.add_argument("--disable", action="store_true")
    args = parser.parse_args()

    con = sqlite3.connect(args.db, timeout=15)
    con.row_factory = sqlite3.Row
    ensure_sync_schema(con)
    token = args.token.strip()
    if not token:
        token = get_setting(con, "sync_token", "") or secrets.token_hex(32)
    with con:
        set_setting(con, "sync_enabled", "0" if args.disable else "1")
        set_setting(con, "sync_role", args.role)
        set_setting(con, "sync_token", token)
        if args.peer:
            set_setting(con, "sync_peer_url", args.peer.rstrip("/"))
        ensure_device_id(con)
        ensure_state(con)
    print(json.dumps({"ok": True, "role": args.role, "token": token, "db": os.path.abspath(args.db)}, ensure_ascii=False))
    con.close()
