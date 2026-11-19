# LikeBox

LikeBox 是一个本地多收藏夹整理工具：导入 Edge / Firefox / Chrome 导出的书签 HTML，在左右结构的工作台里拖拽、归类、搜索和维护自己的收藏夹。

> Windows 免安装版：前往 [Releases](https://github.com/luckyme258/LikeBox/releases) 下载 `LikeBox.exe`。首次运行会在 EXE 同目录生成 `data/bookmarks.db`，不会上传任何收藏数据。

## 功能

- **单栏 / 双栏**：每栏左边是文件夹树，右边是链接列表，中间分隔条可拖动调宽，双击恢复默认。
- **左右对照整理**：双栏可分别载入两个收藏夹，把链接拖到任意目标文件夹；主收藏夹可一键指定。
- **浏览器识别**：识别 Edge / Firefox / Chrome，无法识别时标记为「商业浏览器」。
- **收藏维护**：新增、编辑、删除、批量删除、文件夹右键新建 / 重命名 / 删除。
- **批量删除**：每栏底部「批量」进入勾选模式，支持全选、清空、删除选中并二次确认。
- **链接检测**：检测网址可访问性，失效链接可直接点击排除该域名；默认排除 GitHub 等容易抽风的域名。
- **标签系统**：单条收藏或整个收藏夹可打 `#标签`，点击标签在新标签页打开按文件夹分组的聚合页，并支持最近添加、总次数、本周、24 小时排序/筛选。
- **打开统计**：记录每条收藏的打开总次数、本周频率、24 小时频率。
- **局域网访问**：可在设置中开启，带简单访问密码；密码仅用于基础防护，不适合暴露到不可信网络。
- **深色模式**：纯黑中性背景，青绿色仅作为强调色。
- **点击打开**：点击链接始终在新标签页打开。

## 从源码运行

```powershell
cd E:\codes\LikeBox
python -m pip install -r requirements.txt
python launcher.py
```

也可以直接运行开发模式：

```powershell
python app.py
```

启动后访问 <http://127.0.0.1:8180/>。端口固定为 `8180`。

## Windows EXE

发布包里的 `LikeBox.exe` 已内置 Flask 后端和前端资源：

1. 把 `LikeBox.exe` 放到一个可写目录。
2. 双击运行，程序会在后台启动服务并自动打开浏览器。
3. 首次运行会在同目录生成 `data/bookmarks.db`；日志写入 `data/likebox.log`。
4. 如果没有自动打开，手动访问 <http://127.0.0.1:8180/>。

EXE 不包含任何个人收藏数据。需要迁移时，把旧目录的 `data/bookmarks.db` 复制到 EXE 同目录的 `data/` 下即可。

## 构建 EXE

```powershell
python -m pip install -r requirements.txt
python -m pip install pyinstaller
powershell -ExecutionPolicy Bypass -File .\build.ps1
```

产物：`dist/LikeBox.exe`。

## 数据与隐私

以下内容不会进入 Git 仓库，也不会打包进 EXE：

- `favorites_2026_11_18.html` 以及 `favorites_*.html` 等浏览器导出文件
- `data/` 目录（数据库、导出文件、日志）
- 构建产物 `build/`、`dist/`

所有修改只写入本地的 `data/bookmarks.db`，不会回写原始书签 HTML。

## 目录结构

```text
LikeBox/
├─ app.py                  # Flask 后端、SQLite、导入导出、检测、标签、统计
├─ launcher.py             # EXE 后台启动器（Waitress + 自动打开浏览器）
├─ build.ps1               # PyInstaller 构建脚本
├─ templates/              # 页面模板
├─ static/                 # 前端 JS / CSS
├─ requirements.txt
└─ README.md
```

## 主要接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/libraries` | 收藏夹库列表、总数、主库 |
| POST | `/api/libraries/<id>/primary` | 设为主收藏夹 |
| GET | `/api/folders?library=` | 文件夹树、数量统计与扁平路径 |
| GET | `/api/bookmarks?library=&q=&folder=&sort=&page=&per=` | 列表 / 搜索 |
| POST | `/api/bookmarks` | 新增收藏 |
| PUT | `/api/bookmarks/<id>` | 修改收藏 |
| POST | `/api/bookmarks/<id>/move` | 拖拽移动 |
| POST | `/api/bookmarks/batch-delete` | 批量删除，JSON：`{"ids":[...]}` |
| DELETE | `/api/bookmarks/<id>` | 删除单条收藏 |
| GET | `/api/page-title?url=` | 抓取网页标题 |
| POST | `/api/import` | 上传书签 HTML |
| GET | `/api/export?library=` | 导出浏览器可导入的 HTML |

文件夹用 `/` 表示层级，例如 `收藏夹栏/工具/下载`。删除收藏后会自动清理变空的文件夹。
