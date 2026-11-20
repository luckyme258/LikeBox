#!/data/data/com.termux/files/usr/bin/bash
# Termux 后台启动 LikeBox。必须在项目根目录或任意位置执行都可，脚本会自动切到项目根目录。
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export LIKEBOX_NO_BROWSER=1
mkdir -p data

if [ -f data/likebox.pid ]; then
  pid="$(cat data/likebox.pid)"
  if kill -0 "$pid" 2>/dev/null; then
    echo "already running: $pid"
    exit 0
  fi
  rm -f data/likebox.pid
fi

command -v termux-wake-lock >/dev/null 2>&1 && termux-wake-lock || true
nohup python launcher.py >> data/likebox.out 2>&1 &
echo $! > data/likebox.pid
sleep 2
pid="$(cat data/likebox.pid)"
if kill -0 "$pid" 2>/dev/null; then
  echo "started: $pid"
else
  echo "failed"
  tail -40 data/likebox.out 2>/dev/null
  exit 1
fi
