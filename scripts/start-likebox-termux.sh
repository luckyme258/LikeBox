#!/data/data/com.termux/files/usr/bin/bash
# LikeBox（8180）开机自启入口
# 由 ~/.bashrc 在 Termux 会话（untrusted_app 域）里调用，保证能创建网络 socket；
# 直接以 Magisk/su 身份启动会被 SELinux 拦截 bind（PermissionError: Errno 13）。
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
L=$D/data/boot.log
mkdir -p "$D/data" 2>/dev/null
echo "[$(date '+%Y-%m-%d %H:%M:%S')] likebox hook start pid=$$" >> "$L"

termux-wake-lock 2>/dev/null || true

# 已在监听就跳过（.bashrc 每开一个会话都会调本脚本，必须幂等）
if (echo > /dev/tcp/127.0.0.1/8180) >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 8180 already listening, skip" >> "$L"
  exit 0
fi

cd "$D" || { echo "[$(date '+%Y-%m-%d %H:%M:%S')] cd likebox failed" >> "$L"; exit 1; }

# 清理失效 pid
if [ -f data/likebox.pid ]; then
  old=$(cat data/likebox.pid 2>/dev/null)
  if kill -0 "$old" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] stale pid $old alive but 8180 down, kill" >> "$L"
    kill "$old" 2>/dev/null
    sleep 1
  fi
  rm -f data/likebox.pid
fi

nohup python app.py </dev/null >> data/likebox.out 2>&1 &
echo $! > data/likebox.pid
echo "[$(date '+%Y-%m-%d %H:%M:%S')] app.py spawned pid=$(cat data/likebox.pid)" >> "$L"
exit 0
