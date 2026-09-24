#!/bin/sh
# 孤儿/跑飞进程看守 v2（SandboxWorld 专用）——2026-09-22 用户令；v2 修复 worker 盲区
# 安全边界（硬编码，缺一不杀）：
#   ①类型白名单：仅 vitest | eslint
#   ②项目归属（双通道，满足其一）：
#     a) 命令行含 /Project/GLM/SandboxWorld（顶层 npm/vite 等有路径进程）
#     b) 进程 cwd 在 /Project/GLM/SandboxWorld 内（v2：修"node (vitest N)"worker 无路径盲区）
#   ③CPU>40% 且 etime>45min（双采样二次确认：首见标记进 STATE，下次运行复核仍高才杀）
#   ④先 TERM 等 5s 再 KILL；全程写 LOG；无任何清单外动作
STATE=/tmp/sw-orphan-watch.state
LOG=/tmp/sw-orphan-watch.log
PROJECT=/Users/vinlic/Project/GLM/SandboxWorld
now=$(date +%s)
touch "$STATE"
CAND=/tmp/sw-orphan-watch.candidates
: > "$CAND"

# 通道 a：命令行含项目路径（有全路径进程）
ps -axo pid=,ppid=,etime=,%cpu=,command= 2>/dev/null | grep -E "vitest|eslint" | grep -F "$PROJECT" | grep -v grep >> "$CAND.raw"

# 通道 b：无路径 worker（"node (vitest N)" 形态）→ lsof 取 cwd 判归属
ps -axo pid=,ppid=,etime=,%cpu=,command= 2>/dev/null | grep -E "node \((vitest|eslint)" | grep -vF "$PROJECT" | grep -v grep | \
while IFS= read -r line; do
  pid=$(echo "$line" | awk '{print $1}')
  cwd=$(lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | grep '^n' | sed 's/^n//' | head -1)
  case "$cwd" in
    "$PROJECT"*) echo "$line" ;;
  esac
done >> "$CAND.raw"

# ★冻结窗豁免：FREEZE.md 在位=实施期合法长跑，只检测不杀
if [ -f /tmp/planA-baseline/FREEZE.md ]; then
  rm -f "$STATE"
  cand_n=$(wc -l < "$CAND.raw" 2>/dev/null || echo 0)
  rm -f "$CAND.raw" "$CAND.filtered" "$LOG.new"
  echo "RUN ${now}: FREEZE-DETECT-ONLY killed=0 marked=0 candidates=${cand_n}"
  exit 0
fi

# CPU+年龄门槛
while IFS= read -r line; do
  [ -z "$line" ] && continue
  pid=$(echo "$line" | awk '{print $1}')
  etime=$(echo "$line" | awk '{print $3}')
  cpu=$(echo "$line" | awk '{print $4}' | cut -d. -f1)
  et=0
  case "$etime" in
    *-*) d=${etime%%-*}; r=${etime#*-}; h=${r%%:*}; r2=${r#*:}; m=${r2%%:*}; s=${r2##*:}; et=$((10#$d*86400+10#$h*3600+10#$m*60+10#$s));;
    *:*:*) h=${etime%%:*}; r=${etime#*:}; m=${r%%:*}; s=${r##*:}; et=$((10#$h*3600+10#$m*60+10#$s));;
    *:*) m=${etime%%:*}; s=${etime##*:}; et=$((10#$m*60+10#$s));;
  esac
  [ "$cpu" -gt 40 ] 2>/dev/null || continue
  [ "$et" -gt 2700 ] || continue   # 45min 年龄门槛
  echo "$pid|$ppid$(echo "$line" | cut -d' ' -f2- | sed "s/^$pid $ppid //;s/^/|/;s/^|$ppid|/;s|^|$ppid||" | cut -c1-200)"
done < "$CAND.raw" > "$CAND.filtered"

# 复核+处置（与 v1 相同）
killed=0; marked=0
while IFS= read -r cand; do
  [ -z "$cand" ] && continue
  pid=$(echo "$cand" | cut -d'|' -f1)
  first=$(command grep "^${pid}|" "$STATE" 2>/dev/null | head -1 | cut -d'|' -f2)
  if [ -n "$first" ] && [ $((now - first)) -ge 60 ]; then
    kill "$pid" 2>/dev/null
    sleep 5
    kill -9 "$pid" 2>/dev/null
    echo "[$(date '+%F %T')] KILLED pid=$pid $(echo "$cand" | cut -d'|' -f2-)" >> "$LOG"
    command grep -v "^${pid}|" "$STATE" > "$STATE.tmp" 2>/dev/null && mv "$STATE.tmp" "$STATE"
    killed=$((killed+1))
  else
    if [ -z "$first" ]; then
      echo "${pid}|${now}|$(echo "$cand" | cut -d'|' -f2-)" >> "$STATE"
      echo "[$(date '+%F %T')] MARKED pid=$pid (首见,待下次复核) $(echo "$cand" | cut -d'|' -f3-)" >> "$LOG"
      marked=$((marked+1))
    fi
  fi
done < "$CAND.filtered"

# state 清理（进程消失）
if [ -s "$STATE" ]; then
  while IFS='|' read -r spid rest; do
    ps -p "$spid" > /dev/null 2>&1 || { command grep -v "^${spid}|" "$STATE" > "$STATE.tmp" 2>/dev/null && mv "$STATE.tmp" "$STATE"; }
  done < "$STATE"
fi

cand_n=$(wc -l < "$CAND.filtered" 2>/dev/null || echo 0)
rm -f "$CAND" "$CAND.raw" "$CAND.filtered" "$LOG.new" "$LOG.new.candidates"
echo "RUN ${now}: killed=${killed} marked=${marked} candidates=${cand_n}"
