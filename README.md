# LikeBox

A local bookmark manager built with Flask + SQLite. It imports browser bookmark exports, organizes links in folders, and supports batch text import/export and LAN access.

一个基于 Flask + SQLite 的本地书签整理工具。支持导入浏览器书签、文件夹整理、批量文本导入导出和局域网访问。

---

## 中文

### 功能

- 单栏 / 双栏收藏夹整理，支持拖拽移动。
- 导入 Edge / Firefox / Chrome 导出的书签 HTML。
- 批量文本导入、批量文本导出。
- 文件夹新建、重命名、移动、删除。
- 标签、备注、打开统计、链接检测。
- 电脑与手机 Termux 双向同步主收藏夹。
- 深色界面，数据只保存在本地 SQLite。
- Windows 桌面版带系统托盘图标：打开页面、开机自启、退出程序。

### 快速开始

Windows：

```powershell
python -m pip install -r requirements.txt
python launcher.py
```

打开 `http://localhost:8180/`。

Termux：

```bash
pkg install python
python -m pip install -r requirements.txt
bash start.sh
```

后台日志在 `data/likebox.out`，停止服务用 `bash stop.sh`。

### 电脑 / 手机同步

电脑作为服务端：

```powershell
python sync_engine.py --role server
```

命令会生成同步令牌。手机作为客户端，使用同一个令牌：

```bash
python sync_engine.py --role client --peer http://<电脑局域网地址>:8180 --token <同步令牌>
```

同步范围是主收藏夹的文件夹、书签和排除域名；不同步数据库文件、打开统计和设置。同步接口需要 `X-LikeBox-Sync-Token` 请求头。

### 数据与隐私

- `data/`、`*.db`、日志、个人书签导出文件不会进入 Git。
- 同步令牌保存在本地数据库，不写入代码。
- 局域网密码只用于基础防护，不建议直接暴露到公网。

### 已知限制

- 移动端布局尚未适配，当前界面主要面向桌面浏览器；下一步将补移动端适配。

### GitHub 代码同步

电脑端发布：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish.ps1 -Message "chore: update"
```

手机端拉取并重启：

```bash
bash scripts/update-termux.sh
```

`scripts/publish.ps1` 会先做语法检查，并拒绝提交数据库、备份和私人书签。

---

## English

### Features

- Single-pane and dual-pane bookmark organization with drag and drop.
- Import bookmark HTML exported by Edge / Firefox / Chrome.
- Batch text import and export.
- Create, rename, move, and delete folders.
- Tags, notes, open statistics, and link checks.
- Two-way sync between the desktop app and Termux on Android.
- Dark UI; all data stays in a local SQLite database.
- Windows desktop build includes a system tray icon for opening the page, enabling startup, and quitting.

### Quick start

Windows:

```powershell
python -m pip install -r requirements.txt
python launcher.py
```

Open `http://localhost:8180/`.

Termux:

```bash
pkg install python
python -m pip install -r requirements.txt
bash start.sh
```

Logs are written to `data/likebox.out`. Stop the service with `bash stop.sh`.

### Desktop / phone sync

Run the desktop as the server:

```powershell
python sync_engine.py --role server
```

The command prints a sync token. Configure the phone as a client with the same token:

```bash
python sync_engine.py --role client --peer http://<desktop-lan-address>:8180 --token <sync-token>
```

Only the primary library's folders, bookmarks, and excluded domains are synced. Database files, open statistics, and settings are not synced. The sync endpoint requires the `X-LikeBox-Sync-Token` header.

### Data and privacy

- `data/`, `*.db`, logs, and personal bookmark exports are excluded from Git.
- The sync token is stored in the local database, not in source code.
- The LAN password is basic protection only. Do not expose the app directly to the public internet.

### Known limitations

- The mobile layout is not adapted yet. The current UI targets desktop browsers; mobile support is the next step.

### GitHub code sync

Publish from the desktop:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\publish.ps1 -Message "chore: update"
```

Pull and restart on the phone:

```bash
bash scripts/update-termux.sh
```

`scripts/publish.ps1` runs a syntax check first and refuses to commit databases, backups, or personal bookmark exports.

---

## Project layout

```text
LikeBox/
├─ app.py
├─ sync_engine.py
├─ batch_import.py
├─ batch_export.py
├─ import_rules.py
├─ launcher.py
├─ config/import_rules.json
├─ templates/
├─ static/
├─ scripts/publish.ps1
├─ scripts/update-termux.sh
├─ start.sh / stop.sh / run.sh
├─ run.bat / build.ps1
├─ .gitignore
└─ .gitattributes
```
