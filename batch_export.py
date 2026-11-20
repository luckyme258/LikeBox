"""批量文本导出层：把数据库记录序列化成可被批量导入规则重新识别的文本。"""

from __future__ import annotations

import re


def _compact(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def serialize_bookmarks(rows, include_title: bool = True, include_folder: bool = True) -> dict:
    blocks: list[str] = []
    all_tags: list[str] = []
    folders: set[str] = set()
    count = 0
    for row in rows:
        url = _compact(row["url"] if "url" in row.keys() else row.get("url"))
        if not url:
            continue
        count += 1
        title = _compact(row["title"] if "title" in row.keys() else row.get("title"))
        folder = _compact(row["folder"] if "folder" in row.keys() else row.get("folder"))
        note = str(row["note"] if "note" in row.keys() else row.get("note") or "").strip()
        tags = [
            tag
            for tag in str(row["tags"] if "tags" in row.keys() else row.get("tags") or "").split()
            if tag
        ]
        if folder:
            folders.add(folder)
        for tag in tags:
            if tag not in all_tags:
                all_tags.append(tag)

        block: list[str] = []
        if include_title and title:
            block.append(f"标题：{title}")
        header = url
        if tags:
            header += " " + " ".join(f"#{tag}" for tag in tags)
        block.append(header)
        if note:
            block.append("备注：" + re.sub(r"\s*\n+\s*", " ", note))
        if include_folder and folder:
            block.append(f"文件夹：{folder}")
        if block:
            blocks.append("\n".join(block))

    if not blocks:
        return {"text": "", "count": 0, "tags": [], "folders": []}
    text = "标签作用：单条\n\n" + "\n\n".join(blocks) + "\n"
    return {"text": text, "count": count, "tags": all_tags, "folders": sorted(folders)}
