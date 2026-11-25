#!/system/bin/sh
# SI 备份中心 / LikeBox 开机自启（Magisk late_start service，root 身份）
# 装到位：/data/adb/service.d/si_boot.sh  权限 755
# 日志：/data/local/tmp/si_boot.log
#
# 原理：Magisk 域无法直接降权起网络进程（SELinux 不让建 socket），
# 所以这里只负责「唤起 Termux」——Termux 自己的会话跑在 untrusted_app 域，
# 它启动时会执行 ~/.bashrc，由 ~/.bashrc 依次调
#   ~/.termux/boot/start-si.sh      -> 8080
#   ~/.termux/boot/start-likebox.sh -> 8180（并拉起 ~/likebox/watch.sh 看门狗）
# 本脚本只做「唤起 + 校验端口」，不直接启动 python。

LOG=/data/local/tmp/si_boot.log
ACT=com.termux/com.termux.app.TermuxActivity

echo "[$(date '+%Y-%m-%d %H:%M:%S')] si_boot start" >> "$LOG"

# 1) 等 /data 解密 + Termux 运行时就绪（最多 5 分钟）
i=0
while [ ! -x /data/data/com.termux/files/usr/bin/bash ]; do
  sleep 2
  i=$((i + 1))
  if [ "$i" -gt 150 ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] timeout waiting for termux runtime" >> "$LOG"
    exit 1
  fi
done

# 2) 等开机完成，然后唤起 Termux；每次唤起后等 20 秒检查端口
i=0
OK=0
while [ "$i" -lt 60 ]; do
  if [ "$(getprop sys.boot_completed)" = "1" ]; then
    am start -n "$ACT" >> "$LOG" 2>&1
    sleep 20
    # 8080 = 0x1F90（si），8180 = 0x1FF4（LikeBox）
    if grep -q ":1F90 " /proc/net/tcp 2>/dev/null || grep -q ":1F90 " /proc/net/tcp6 2>/dev/null; then
      echo "[$(date '+%Y-%m-%d %H:%M:%S')] app.py listening on 8080 -> ok" >> "$LOG"
      OK=1
      break
    fi
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] retry $i : 8080 not up yet" >> "$LOG"
  fi
  sleep 15
  i=$((i + 1))
done

[ "$OK" = "1" ] || echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: 8080 still down after retries" >> "$LOG"

# 3) 等 8180（LikeBox）起来，最多 75 秒；起不来由 Termux 内的看门狗兜底
if grep -q ":1FF4 " /proc/net/tcp 2>/dev/null || grep -q ":1FF4 " /proc/net/tcp6 2>/dev/null; then
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] likebox listening on 8180 -> ok" >> "$LOG"
else
  j=0
  OK8180=0
  while [ "$j" -lt 15 ]; do
    sleep 5
    if grep -q ":1FF4 " /proc/net/tcp 2>/dev/null || grep -q ":1FF4 " /proc/net/tcp6 2>/dev/null; then
      OK8180=1
      break
    fi
    j=$((j + 1))
  done
  if [ "$OK8180" = "1" ]; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] likebox listening on 8180 -> ok" >> "$LOG"
  else
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] WARN: 8180 未起来，交给 Termux 看门狗（每 5 分钟重试）" >> "$LOG"
  fi
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] si_boot done" >> "$LOG"
