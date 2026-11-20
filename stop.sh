#!/data/data/com.termux/files/usr/bin/bash
# 停止 Termux 中的 LikeBox 后台进程。
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"

if [ -f data/likebox.pid ]; then
  pid="$(cat data/likebox.pid)"
  if kill -0 "$pid" 2>/dev/null; then
    kill "$pid"
    sleep 1
    echo "stopped: $pid"
  else
    echo "not running"
  fi
  rm -f data/likebox.pid
else
  echo "pid file not found"
fi
