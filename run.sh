#!/data/data/com.termux/files/usr/bin/bash
# Termux 前台运行 LikeBox，适合调试。
set -u
ROOT="$(cd "$(dirname "$0")" && pwd)"
cd "$ROOT"
export LIKEBOX_NO_BROWSER=1
exec python launcher.py
