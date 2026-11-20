"""批量导入规则层：只负责读取规则、提供规则组，不碰解析和数据库。"""

from __future__ import annotations

import copy
import json
import sys
from pathlib import Path

DEFAULT_PROFILE = {
    "name": "#标签全批共用",
    "description": "只有 #标签 是标签，默认应用到整批链接；其余文字全部作为相邻链接的备注。",
    "url_pattern": r"\b(?:(?:[a-z][a-z0-9+.-]*://|mailto:|about:)[^\s<>\"]+|www\.[^\s<>\"]+)",
    "tag_prefixes": ["#"],
    "note_prefixes": ["备注：", "备注:", "note:", "说明：", "描述：", "备忘："],
    "folder_prefixes": ["文件夹：", "文件夹:", "folder:", "分类：", "目录："],
    "title_prefixes": ["标题：", "标题:", "title:"],
    "tag_separator_pattern": r"[#,，、；;\s]+",
    "max_tag_chars": 18,
    "max_tag_words": 3,
    "sentence_chars": "。！？!?；;，、：:",
    "short_line_mode": "note",
    "tag_scope": "batch",
    "text_association": "auto",
    "title_from_url": True,
    "note_join": "\n",
    "max_note_chars": 2000,
    "max_items": 5000,
    "ignore_prefixes": ["//", ">"],
}

DEFAULT_BUNDLE = {
    "version": 1,
    "default_profile": "general",
    "profiles": {"general": copy.deepcopy(DEFAULT_PROFILE)},
}


def _candidate_paths() -> list[Path]:
    paths: list[Path] = []
    if getattr(sys, "frozen", False):
        paths.append(Path(sys.executable).resolve().parent / "config" / "import_rules.json")
        bundle_dir = getattr(sys, "_MEIPASS", None)
        if bundle_dir:
            paths.append(Path(bundle_dir) / "config" / "import_rules.json")
    paths.append(Path(__file__).resolve().parent / "config" / "import_rules.json")
    unique: list[Path] = []
    for path in paths:
        if path not in unique:
            unique.append(path)
    return unique


def rules_path() -> Path:
    for path in _candidate_paths():
        if path.exists():
            return path
    return _candidate_paths()[0]


def _normalize_profile(raw: dict) -> dict:
    profile = copy.deepcopy(DEFAULT_PROFILE)
    for key, value in (raw or {}).items():
        if key.startswith("_"):
            continue
        profile[key] = value
    profile["name"] = str(profile.get("name") or "未命名规则")[:80]
    profile["description"] = str(profile.get("description") or "")[:300]
    profile["url_pattern"] = str(profile.get("url_pattern") or DEFAULT_PROFILE["url_pattern"])
    for key in (
        "tag_prefixes",
        "note_prefixes",
        "folder_prefixes",
        "title_prefixes",
        "ignore_prefixes",
    ):
        value = profile.get(key)
        if not isinstance(value, list):
            value = []
        profile[key] = [str(item) for item in value if str(item)]
    try:
        profile["max_tag_chars"] = max(1, min(int(profile.get("max_tag_chars", 18)), 120))
    except (TypeError, ValueError):
        profile["max_tag_chars"] = 18
    try:
        profile["max_tag_words"] = max(1, min(int(profile.get("max_tag_words", 3)), 30))
    except (TypeError, ValueError):
        profile["max_tag_words"] = 3
    try:
        profile["max_note_chars"] = max(20, min(int(profile.get("max_note_chars", 2000)), 20000))
    except (TypeError, ValueError):
        profile["max_note_chars"] = 2000
    try:
        profile["max_items"] = max(1, min(int(profile.get("max_items", 5000)), 50000))
    except (TypeError, ValueError):
        profile["max_items"] = 5000
    short_mode = str(profile.get("short_line_mode", "note")).lower()
    profile["short_line_mode"] = short_mode if short_mode in {"tag", "note"} else "note"
    tag_scope = str(profile.get("tag_scope", "batch")).lower()
    profile["tag_scope"] = tag_scope if tag_scope in {"batch", "item"} else "batch"
    text_association = str(profile.get("text_association", "auto")).lower()
    profile["text_association"] = (
        text_association if text_association in {"auto", "previous", "next"} else "auto"
    )
    profile["title_from_url"] = bool(profile.get("title_from_url", True))
    profile["note_join"] = str(profile.get("note_join", "\n"))[:8]
    profile["sentence_chars"] = str(profile.get("sentence_chars", "。！？!?；;，、：:"))
    profile["tag_separator_pattern"] = str(
        profile.get("tag_separator_pattern", DEFAULT_PROFILE["tag_separator_pattern"])
    )
    return profile


def load_bundle() -> dict:
    """读取规则文件；文件缺失或损坏时回退到内置规则，并返回 error。"""
    path = rules_path()
    bundle = copy.deepcopy(DEFAULT_BUNDLE)
    error = ""
    if not path.exists():
        error = f"规则文件不存在：{path}"
        return {"bundle": bundle, "path": path, "error": error}
    try:
        raw = json.loads(path.read_text(encoding="utf-8-sig"))
    except (OSError, UnicodeError, json.JSONDecodeError) as exc:
        error = f"规则文件读取失败：{exc}"
        return {"bundle": bundle, "path": path, "error": error}

    raw_profiles = raw.get("profiles") if isinstance(raw, dict) else None
    if not isinstance(raw_profiles, dict) or not raw_profiles:
        error = "规则文件缺少 profiles 对象"
        return {"bundle": bundle, "path": path, "error": error}

    profiles = {}
    for key, value in raw_profiles.items():
        if isinstance(value, dict):
            profiles[str(key)] = _normalize_profile(value)
    if not profiles:
        error = "规则文件中没有可用规则组"
        return {"bundle": bundle, "path": path, "error": error}

    default = str(raw.get("default_profile") or next(iter(profiles)))
    bundle = {
        "version": raw.get("version", 1),
        "default_profile": default if default in profiles else next(iter(profiles)),
        "profiles": profiles,
    }
    return {"bundle": bundle, "path": path, "error": ""}


def profile_list(bundle: dict) -> list[dict]:
    return [
        {
            "key": key,
            "name": profile.get("name") or key,
            "description": profile.get("description") or "",
            "short_line_mode": profile.get("short_line_mode", "note"),
            "tag_scope": profile.get("tag_scope", "batch"),
        }
        for key, profile in bundle.get("profiles", {}).items()
    ]


def select_profile(bundle: dict, key: str | None) -> tuple[str, dict]:
    profiles = bundle.get("profiles", {})
    chosen = str(key or bundle.get("default_profile") or "general")
    if chosen not in profiles:
        chosen = bundle.get("default_profile") or next(iter(profiles))
    return chosen, profiles[chosen]
