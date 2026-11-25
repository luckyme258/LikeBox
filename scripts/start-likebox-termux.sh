#!/data/data/com.termux/files/usr/bin/bash
# LikeBox（8180）开机自启入口
# 由 ~/.bashrc 在 Termux 会话（untrusted_app 域）里调用，保证能创建网络 socket；
# 直接以 Magisk/su 身份启动会被 SELinux 拦截 bind（PermissionError: Errno 13）。
# 幂等：每开一个会话都会执行，已在监听则只补看门狗。
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
W=$D/watch.sh
mkdir -p "$D/data" 2>/dev/null
echo "[$(date '+%Y-%m-%d %H:%M:%S')] likebox hook start pid=$$" >> "$L"

termux-wake-lock 2>/dev/null || true

cd "$D" || { echo "[$(date '+%Y-%m-%d %H:%M:%S')] cd likebox failed" >> "$L"; exit 1; }

# 1) 主服务 8180
if (echo > /dev/tcp/127.0.0.1/8180) >/dev/null 2>&1; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] 8180 already listening, skip spawn" >> "$L"
else
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
fi

# 2) 看门狗（每 5 分钟探一次 8180，挂了就重拉）
if [ -x "$W" ]; then
  wp=$(cat data/watch.pid 2>/dev/null)
  if [ -n "$wp" ] && kill -0 "$wp" 2>/dev/null; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] watchdog alive pid=$wp" >> "$L"
  else
    rm -f data/watch.pid
    nohup bash "$W" </dev/null >> data/watch.out 2>&1 &
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] watchdog spawned pid=$!" >> "$L"
  fi
fi

exit 0
