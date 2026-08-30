#!/bin/bash
# ── IIII84 任意种子 x86 rig 链运行器（常驻工具）────────────────────────────────
# 与 /tmp/iii81-out/run-rig.sh 同源；差异=目录根参数化 + 配方勘误警示。
#
# ★配方语义（WorldFileData.cs:232-289 TryApplyingCopiedSeed）：
#   seed=<size>.<gameMode+1>.<evil(1=腐/2=猩)>.<optionBits>.<secrets>|<base>
#   第 4 段是 AWorldGenerationOption 位掩码（bit0=Drunk,1=NTB,2=FTW,3=Anniv,
#   4=DontStarve,5=Remix,6=NoTraps,7=Everything,8=Skyblock；cs:71-82/:170-229）——
#   IIII78 批曾误写 `1.1.1.1.<flag>|<base>`＝静默开醉酒世界（本批定谳的伪发散根因）。
#   无特殊九种子时第 4 段写 0 或直接省略整段。
#
# 用法:
#   node? no—bash: scripts/anyseed-rig.sh <NAME> <RECIPE> [PORT]
#   例:   game/scripts/anyseed-rig.sh plain '20260903'
#         game/scripts/anyseed-rig.sh grv   '1.1.1.0.nightofthelivingdead|20260903'
# 环境位:
#   III_ROOT  输出根（默认 /tmp/iii84-out）；产物=$III_ROOT/x86-<NAME>
#   III_APP   rig 二进制（默认 /tmp/iii40-rig.app/Contents/MacOS/TerrariaServer）
set -u
NAME=${1:?NAME}; RECIPE=${2:?RECIPE}; PORT=${3:-$((5400 + RANDOM % 90))}
ROOT=${III_ROOT:-/tmp/iii84-out}
APP=${III_APP:-/tmp/iii40-rig.app/Contents/MacOS/TerrariaServer}
OUT=$ROOT/x86-$NAME
HOME_D=$ROOT/home-$NAME
CFG=$OUT/serverconfig.txt
mkdir -p "$OUT" "$HOME_D/Library/Application Support/Terraria/Worlds"
rm -f "$OUT"/pc.txt "$OUT"/w.wld "$OUT"/run.log "$OUT"/*.typ "$OUT"/*.act "$OUT"/*.wal \
      "$OUT"/*.liq "$OUT"/*.half "$OUT"/*.slope "$OUT"/*.lty "$OUT"/*.inact 2>/dev/null
cat > "$CFG" <<CFGEOF
world=$OUT/w.wld
autocreate=1
seed=$RECIPE
worldname=dchain-$NAME
difficulty=0
port=$PORT
password=anyseed84
maxplayers=8
CFGEOF
export HOME=$HOME_D SW_DUMP_ALL=$OUT SW_PASSCHAIN=$OUT/pc.txt
unset SW_EVIL
echo "[anyseed-rig] chain=$NAME port=$PORT seed=$RECIPE start $(date +%H:%M:%S)"
( cd /tmp && arch -x86_64 $APP -config "$CFG" ) > "$OUT/run.log" 2>&1 &
SH=$!
LAST=0; STABLE=0
for i in $(seq 1 600); do
  sleep 5
  if ! kill -0 $SH 2>/dev/null; then break; fi
  D=$(ls "$OUT"/*.typ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$D" != "$LAST" ]; then LAST=$D; STABLE=0; else STABLE=$((STABLE+1)); fi
  if [ "${D:-0}" -ge 107 ] && [ $STABLE -ge 48 ] && [ -f "$OUT/w.wld" ]; then
    echo "[anyseed-rig] $D dumps stable, SIGINT $(date +%H:%M:%S)"; kill -INT $SH 2>/dev/null; break
  fi
done
W=0
while kill -0 $SH 2>/dev/null && [ $W -lt 240 ]; do sleep 10; W=$((W+10)); done
sleep 3
kill -9 $SH 2>/dev/null
# 只杀本链实例（argv 含本链 serverconfig 绝对路径，不误伤并行会话）
for p in $(pgrep -f "$CFG" 2>/dev/null); do kill -9 $p 2>/dev/null; done
D=$(ls "$OUT"/*.typ 2>/dev/null | wc -l | tr -d ' ')
PL=$(grep -c "" "$OUT/pc.txt" 2>/dev/null || echo 0)
echo "[anyseed-rig] chain=$NAME done dumps=$D pslines=$PL end=$(date +%H:%M:%S)"
