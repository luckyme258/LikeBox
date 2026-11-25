#!/data/data/com.termux/files/usr/bin/bash
# LikeBox（8180）看门狗
# 由 start-likebox.sh 在 Termux 会话（untrusted_app 域）里拉起，单实例。
# 每 WATCH_INTERVAL 秒（默认 300，可被 ~/likebox/data/watch.interval 覆盖）
# 探测一次 8180；不通就清理残留 pid 并重新拉起 app.py。
# 日志：~/likebox/data/watch.log
H=/data/data/com.termux/files/home
P=/data/data/com.termux/files/usr
export HOME=$H
export PREFIX=$P
export PATH=$P/bin:/system/bin
export LD_LIBRARY_PATH=$P/lib
export TMPDIR=$P/tmp
export LANG=C.UTF-8
export LIKEBOX_NO_BROWSER=1

D=$H/likebox
L=$D/data/watch.log
PIDF=$D/data/watch.pid
IFILE=$D/data/watch.interval
mkdir -p "$D/data" 2>/dev/null

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$L"; }

# 单实例：pid 文件里的进程还活着就直接退出
if [ -f "$PIDF" ]; then
  old=$(cat "$PIDF" 2>/dev/null)
  if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
    log "watchdog already running pid=$old, exit"
    exit 0
  fi
fi
echo $$ > "$PIDF"
log "watchdog start pid=$$"

up() { (echo > /dev/tcp/127.0.0.1/8180) >/dev/null 2>&1; }

restart_app() {
  log "8180 down, restart app.py"
  cd "$D" || { log "cd likebox failed"; return 1; }
  if [ -f data/likebox.pid ]; then
    old=$(cat data/likebox.pid 2>/dev/null)
    if [ -n "$old" ] && kill -0 "$old" 2>/dev/null; then
      log "stale pid $old alive but 8180 down, kill"
      kill "$old" 2>/dev/null
      sleep 1
    fi
    rm -f data/likebox.pid
  fi
  nohup python app.py </dev/null >> data/likebox.out 2>&1 &
  echo $! > data/likebox.pid
  log "app.py respawned pid=$(cat data/likebox.pid)"
  sleep 8
  if up; then
    log "8180 back up"
  else
    log "8180 still down after respawn, will retry next cycle"
  fi
  return 0
}

while :; do
  # 每轮重读间隔，改了 watch.interval 无需重启看门狗（下限 10 秒）
  I=$(cat "$IFILE" 2>/dev/null)
  case "$I" in
    ''|*[!0-9]*) I=300 ;;
  esac
  [ "$I" -lt 10 ] && I=10
  sleep "$I"
  # Termux 会话被系统回收后 bash 仍可能挂着但环境已失效，探测失败按需重拉
  if ! up; then
    restart_app
  fi
done
