"""批量文本导入适配层：把任意“网址 + 标签/备注”文本解析成标准记录，不碰数据库。"""

from __future__ import annotations

import re
import urllib.parse

from import_rules import load_bundle, select_profile


URL_TRAILING_CHARS = ".,，。；;、!！?？)]}）】》\"'"


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def _clean_note(value: str | None) -> str:
    return str(value or "").replace("\r\n", "\n").replace("\r", "\n").strip()


def _normalize_folder(value: str | None) -> str:
    if not value:
        return ""
    parts = []
    for part in str(value).replace("\\", "/").split("/"):
        part = _clean_text(part).strip("/")
        if part:
            parts.append(part[:80])
    return "/".join(parts)


def _normalize_tag(token: str) -> str:
    token = str(token or "").strip().lstrip("#")
    token = re.sub(r"[^\w\-]+", "", token, flags=re.UNICODE).lower()
    return token[:40]


def _normalize_tags(value, profile: dict) -> list[str]:
    if isinstance(value, (list, tuple)):
        tokens = [str(item) for item in value]
    else:
        pattern = str(profile.get("tag_separator_pattern") or r"[#,，、；;\s]+")
        try:
            tokens = re.split(pattern, str(value or ""))
        except re.error:
            tokens = re.split(r"[#,，、；;\s]+", str(value or ""))
    tags: list[str] = []
    for token in tokens:
        cleaned = _normalize_tag(token)
        if cleaned and cleaned not in tags:
            tags.append(cleaned)
    return tags[:20]


def _append_tags(item: dict, value, profile: dict) -> None:
    for tag in _normalize_tags(value, profile):
        if tag not in item["tags"]:
            item["tags"].append(tag)
    item["tags"] = item["tags"][:20]


def _append_note(item: dict, value: str, profile: dict, separator: str = "\n") -> None:
    text = _clean_note(value)
    if not text:
        return
    note = item.get("note") or ""
    if note:
        note += separator + text
    else:
        note = text
    item["note"] = note[: int(profile.get("max_note_chars") or 2000)]


def _match_directive(line: str, profile: dict) -> tuple[str, str] | None:
    pairs: list[tuple[str, str]] = []
    for kind in ("title", "folder", "note", "tag"):
        for prefix in profile.get(f"{kind}_prefixes", []):
            pairs.append((kind, prefix))
    pairs.sort(key=lambda pair: len(pair[1]), reverse=True)
    low = line.lower()
    for kind, prefix in pairs:
        if prefix and low.startswith(prefix.lower()):
            return kind, line[len(prefix) :].strip()
    return None


def _clean_url(raw: str, keep_trailing: bool = False) -> str:
    url = _clean_text(raw).strip("<>\"'")
    if not keep_trailing:
        while url and url[-1] in URL_TRAILING_CHARS:
            url = url[:-1]
    else:
        while url and url[-1] in ".,，。；;、!！":
            url = url[:-1]
    if url.startswith("//"):
        url = "https:" + url
    elif not re.match(r"^[a-zA-Z][a-zA-Z0-9+.\-]*:", url):
        url = "https://" + url
    parts = urllib.parse.urlsplit(url)
    if parts.netloc:
        return url
    if parts.scheme.lower() in {"file", "about", "mailto"} and (
        parts.path or parts.query or parts.fragment
    ):
        return url
    return ""


def _url_alone_on_line(block: str, match, tag_prefixes: list[str]) -> bool:
    line_start = block.rfind("\n", 0, match.start()) + 1
    line_end = block.find("\n", match.end())
    if line_end < 0:
        line_end = len(block)
    rest = block[match.end() : line_end].strip()
    if not rest:
        return True
    return all(
        any(token.startswith(prefix) for prefix in tag_prefixes)
        for token in rest.split()
    )


def _title_from_url(url: str, profile: dict) -> str:
    if not profile.get("title_from_url", True):
        return url
    parts = urllib.parse.urlsplit(url)
    segments = [
        urllib.parse.unquote(segment)
        for segment in (parts.path or "").split("/")
        if segment
    ]
    for segment in reversed(segments):
        low = segment.lower()
        if low in {"_", "-", "index.html", "index.htm", "index.php"}:
            continue
        if re.match(r"^(video\.)?[a-z]{0,3}[0-9a-z]{5,}$", low) and "_" not in segment and "-" not in segment:
            continue
        if low.startswith("video."):
            continue
        title = re.sub(r"[_\-]+", " ", segment).strip()
        title = re.sub(r"\s+", " ", title)
        if len(title) >= 3:
            return title[:600]
    host = parts.hostname or url
    if host.startswith("www."):
        host = host[4:]
    return host[:600]


def _line_markdown_title(line: str, url_start: int) -> str:
    prefix = line[:url_start]
    match = re.search(r"\[([^\]]{1,600})\]\s*\($", prefix)
    return _clean_text(match.group(1)) if match else ""


def _looks_like_short_tag(text: str, profile: dict) -> bool:
    if str(profile.get("short_line_mode", "tag")).lower() == "note":
        return False
    if not text:
        return False
    if len(text) > int(profile.get("max_tag_chars") or 18):
        return False
    sentence_chars = str(profile.get("sentence_chars") or "。！？!?；;")
    if any(char in text for char in sentence_chars):
        return False
    if len(re.split(r"\s+", text)) > int(profile.get("max_tag_words") or 3):
        return False
    return True


def _apply_fragment(item: dict, fragment: str, profile: dict) -> None:
    fragment = _clean_text(fragment)
    if not fragment:
        return
    directive = _match_directive(fragment, profile)
    if directive:
        kind, value = directive
        if kind == "tag":
            _append_tags(item, value, profile)
        elif kind == "note":
            _append_note(item, value, profile, str(profile.get("note_join") or "\n"))
        elif kind == "folder":
            item["folder"] = _normalize_folder(value)
        elif kind == "title":
            item["title"] = _clean_text(value)[:600]
        return

    inline_tags = re.findall(r"#[\w\-]+", fragment, flags=re.UNICODE)
    remainder = re.sub(r"#[\w\-]+", " ", fragment, flags=re.UNICODE).strip()
    if inline_tags:
        _append_tags(item, inline_tags, profile)
    if not remainder:
        return
    if _looks_like_short_tag(remainder, profile):
        _append_tags(item, remainder, profile)
    else:
        _append_note(item, remainder, profile, str(profile.get("note_join") or "\n"))


def _text_has_body(text: str, profile: dict) -> bool:
    for line in str(text or "").split("\n"):
        line = line.strip()
        if not line:
            continue
        directive = _match_directive(line, profile)
        if directive:
            if directive[0] == "note" and directive[1]:
                return True
            continue
        remainder = re.sub(r"#[\w\-]+", " ", line, flags=re.UNICODE).strip()
        if remainder:
            return True
    return False


def _apply_text_block(item: dict, text: str, profile: dict) -> None:
    for line in str(text or "").split("\n"):
        line = line.strip()
        if line:
            _apply_fragment(item, line, profile)


def _new_item(url: str, title: str, line_no: int, profile: dict) -> dict:
    return {
        "url": url,
        "title": _clean_text(title)[:600] or _title_from_url(url, profile),
        "folder": "",
        "tags": [],
        "note": "",
        "line": line_no,
    }


def parse_batch_text(text: str, profile_key: str | None = None) -> dict:
    loaded = load_bundle()
    bundle = loaded["bundle"]
    chosen, profile = select_profile(bundle, profile_key)
    try:
        url_re = re.compile(profile.get("url_pattern") or r"https?://[^\s]+", re.IGNORECASE)
    except re.error as exc:
        return {
            "items": [],
            "warnings": [{"line": 0, "text": "", "reason": f"规则中的网址正则无效：{exc}"}],
            "profile": chosen,
            "profile_name": profile.get("name", chosen),
            "rules_path": str(loaded["path"]),
            "rules_error": loaded["error"],
        }

    items: list[dict] = []
    warnings: list[dict] = []
    max_items = int(profile.get("max_items") or 5000)
    ignore_prefixes = profile.get("ignore_prefixes") or []

    def warn(line_no: int, raw: str, reason: str) -> None:
        if len(warnings) < 50:
            warnings.append({"line": line_no, "text": _clean_text(raw)[:120], "reason": reason})

    source = str(text or "").replace("\r\n", "\n").replace("\r", "\n")
    scope_match = re.compile(r"^标签作用\s*[:：]\s*(单条|整批)\s*$", re.IGNORECASE)
    cleaned_lines: list[str] = []
    profile = dict(profile)
    for line in source.split("\n"):
        match = scope_match.match(line.strip())
        if match:
            profile["tag_scope"] = "item" if match.group(1) == "单条" else "batch"
        else:
            cleaned_lines.append(line)
    source = "\n".join(cleaned_lines)
    blocks: list[tuple[int, str]] = []
    buffer: list[str] = []
    block_start = 1
    for line_no, raw_line in enumerate(source.split("\n"), 1):
        line = raw_line.strip()
        if any(line.startswith(prefix) for prefix in ignore_prefixes):
            continue
        if line:
            if not buffer:
                block_start = line_no
            buffer.append(raw_line.rstrip())
        elif buffer:
            blocks.append((block_start, "\n".join(buffer)))
            buffer = []
    if buffer:
        blocks.append((block_start, "\n".join(buffer)))

    for start_line, block in blocks:
        if len(items) >= max_items:
            warn(start_line, block, f"超过单次上限 {max_items} 条，剩余内容未解析")
            break
        tag_prefixes = list(profile.get("tag_prefixes") or [])
        metadata_prefixes = [
            str(prefix)
            for key in ("title", "folder", "note", "tag")
            for prefix in (profile.get(f"{key}_prefixes") or [])
            if prefix
        ]
        scan_lines: list[str] = []
        for line in block.split("\n"):
            stripped = line.lstrip().lower()
            if any(stripped.startswith(prefix.lower()) for prefix in metadata_prefixes):
                scan_lines.append(" " * len(line))
            else:
                scan_lines.append(line)
        scan_block = "\n".join(scan_lines)
        matches = list(url_re.finditer(scan_block))
        if not matches:
            warn(start_line, block, "这一段文字没有对应网址，已忽略")
            continue
        if len(items) + len(matches) > max_items:
            available = max_items - len(items)
            warn(start_line, block, f"超过单次上限 {max_items} 条，仅保留前 {available} 条")
            matches = matches[:available]

        pre_text = block[: matches[0].start()].strip()
        markdown_title = ""
        if pre_text:
            markdown = re.search(r"\[([^\]]{1,600})\]\s*\(\s*$", pre_text)
            if markdown:
                markdown_title = _clean_text(markdown.group(1))
                pre_text = pre_text[: markdown.start()].strip()

        created: list[dict] = []
        created_matches = []
        for match in matches:
            url = _clean_url(
                match.group(0),
                keep_trailing=_url_alone_on_line(block, match, tag_prefixes),
            )
            line_no = start_line + block.count("\n", 0, match.start())
            if not url:
                warn(line_no, block[max(0, match.start() - 20) : match.end() + 20], "网址格式无效")
                continue
            created.append(_new_item(url, markdown_title, line_no, profile))
            created_matches.append(match)
        if not created:
            continue
        if pre_text:
            _apply_text_block(created[0], pre_text, profile)

        association = str(profile.get("text_association", "auto")).lower()
        if association == "auto":
            association = "next" if _text_has_body(pre_text, profile) else "previous"

        for index, match in enumerate(created_matches):
            next_start = (
                created_matches[index + 1].start()
                if index + 1 < len(created_matches)
                else len(block)
            )
            segment = block[match.end() : next_start].strip()
            if segment:
                if association == "next" and index + 1 < len(created):
                    _apply_text_block(created[index + 1], segment, profile)
                else:
                    _apply_text_block(created[index], segment, profile)
        items.extend(created)

    if str(profile.get("tag_scope", "batch")).lower() == "batch":
        batch_tags: list[str] = []
        for item in items:
            for tag in item["tags"]:
                if tag not in batch_tags:
                    batch_tags.append(tag)
        for item in items:
            item["tags"] = batch_tags[:20]

    result_items = []
    for item in items:
        result_items.append(
            {
                "url": item["url"],
                "title": item["title"],
                "folder": item["folder"],
                "tags": item["tags"],
                "tag_text": " ".join(item["tags"]),
                "note": item["note"],
                "line": item["line"],
            }
        )
    return {
        "items": result_items,
        "warnings": warnings,
        "profile": chosen,
        "profile_name": profile.get("name", chosen),
        "rules_path": str(loaded["path"]),
        "rules_error": loaded["error"],
    }
