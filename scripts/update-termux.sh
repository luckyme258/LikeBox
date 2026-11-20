#!/data/data/com.termux/files/usr/bin/bash
# 在 Termux 的 LikeBox Git 工作副本里拉取代码并重启服务。
# 要求：当前目录是 main 分支的 git 仓库，且没有未提交改动。
set -eu

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! command -v git >/dev/null 2>&1; then
  echo "没有安装 git。请先执行：pkg install git"
  exit 1
fi

if [ ! -d .git ]; then
  echo "当前目录不是 Git 仓库：$ROOT"
  echo "请先 clone 仓库，并保留原来的 data/ 目录。"
  exit 1
fi

branch="$(git rev-parse --abbrev-ref HEAD)"
if [ "$branch" != "main" ]; then
  echo "当前分支是 $branch，只允许在 main 分支更新。"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  echo "检测到未提交改动，拒绝自动更新："
  git status --short
  exit 1
fi

echo "拉取 origin/main..."
git pull --ff-only origin main

chmod +x start.sh stop.sh run.sh scripts/update-termux.sh 2>/dev/null || true

if [ -x ./stop.sh ]; then
  ./stop.sh || true
fi

if [ -x ./start.sh ]; then
  ./start.sh
else
  echo "找不到可执行的 start.sh"
  exit 1
fi

echo "同步状态："
python - <<'PY' || true
import json
import urllib.request

try:
    with urllib.request.urlopen("http://127.0.0.1:8180/api/sync/status", timeout=5) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    print(json.dumps(data, ensure_ascii=False, sort_keys=True))
except Exception as exc:
    print(f"读取同步状态失败：{exc}")
PY
