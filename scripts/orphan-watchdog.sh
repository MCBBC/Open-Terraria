#!/bin/sh
# 孤儿/跑飞进程看守（SandboxWorld 专用）——2026-09-22 用户令
# 安全边界（硬编码，缺一不杀）：
#   ①类型白名单：仅 vitest | eslint（vite 探针实例永不入名单）
#   ②项目路径：命令行含 /Project/GLM/SandboxWorld（他项目/系统进程结构性排除）
#   ③CPU>40% 且 etime>45min（双采样二次确认：首见标记进 STATE，下次运行复核仍高才杀）
#   ④先 TERM 等 5s 再 KILL；全程写 LOG；无任何清单外动作
STATE=/tmp/sw-orphan-watch.state
LOG=/tmp/sw-orphan-watch.log
PROJECT=/Users/vinlic/Project/GLM/SandboxWorld
now=$(date +%s)
touch "$STATE"
: > "$LOG.new"

# 候选采集：本项目路径 + vitest/eslint + CPU>40%
ps -axo pid=,ppid=,etime=,%cpu=,command= 2>/dev/null | grep -E "vitest|eslint" | grep -F "$PROJECT" | grep -v grep | \
while IFS= read -r line; do
  pid=$(echo "$line" | awk '{print $1}')
  ppid=$(echo "$line" | awk '{print $2}')
  etime=$(echo "$line" | awk '{print $3}')
  cpu=$(echo "$line" | awk '{print $4}' | cut -d. -f1)
  # etime 转秒（[[dd-]hh:]mm:ss）
  et=0
  case "$etime" in
    *-*) d=${etime%%-*}; r=${etime#*-}; h=${r%%:*}; r2=${r#*:}; m=${r2%%:*}; s=${r2##*:}; et=$((d*86400+h*3600+m*60+s));;
    *:*:*) h=${etime%%:*}; r=${etime#*:}; m=${r%%:*}; s=${r##*:}; et=$((h*3600+m*60+s));;
    *:*) m=${etime%%:*}; s=${etime##*:}; et=$((m*60+s));;
  esac
  [ "$cpu" -gt 40 ] 2>/dev/null || continue
  [ "$et" -gt 2700 ] || continue   # 45min 年龄门槛
  echo "$pid|$ppid|$et|$cpu|$(echo "$line" | cut -c1-160)"
done > "$LOG.new.candidates"

# 双采样复核：STATE 已有（≥60s 前标记）且本次仍在候选 → KILL；新面孔 → 标记待下次复核
# ★方案A冻结窗豁免：FREEZE.md 在位=实施期合法长跑（基线/战役 vitest），只检测不杀
if [ -f /tmp/planA-baseline/FREEZE.md ]; then
  echo "[$(date '+%F %T')] FREEZE window active — detect-only, no kill (方案A实施期)" >> "$LOG"
  rm -f "$STATE"
  cand_n=$(wc -l < "$LOG.new.candidates" 2>/dev/null || echo 0)
  rm -f "$LOG.new.candidates"
  echo "RUN ${now}: FREEZE-DETECT-ONLY killed=0 marked=0 candidates=${cand_n}"
  exit 0
fi
killed=0; marked=0
while IFS= read -r cand; do
  [ -z "$cand" ] && continue
  pid=$(echo "$cand" | cut -d'|' -f1)
  first=$(command grep "^${pid}|" "$STATE" 2>/dev/null | head -1 | cut -d'|' -f2)
  if [ -n "$first" ] && [ $((now - first)) -ge 60 ]; then
    # 二次确认成立 → TERM → 5s → KILL
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
done < "$LOG.new.candidates"

# 清理 state 中已消失的 pid（进程自然退出）
if [ -s "$STATE" ]; then
  while IFS='|' read -r spid rest; do
    ps -p "$spid" > /dev/null 2>&1 || { command grep -v "^${spid}|" "$STATE" > "$STATE.tmp" 2>/dev/null && mv "$STATE.tmp" "$STATE"; }
  done < "$STATE"
fi

mv "$LOG.new" "$LOG.new.done" 2>/dev/null
rm -f "$LOG.new"
echo "RUN ${now}: killed=$killed marked=$marked candidates=$(wc -l < "$LOG.new.candidates" 2>/dev/null || echo 0)"
rm -f "$LOG.new.candidates"
