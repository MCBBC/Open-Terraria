#!/bin/bash
# IIII90b 金标链重产运行器（模板源自 /tmp/iii81-out/run-rig.sh，i46/run-sb.sh 同源）
# 用法: gc-run.sh <NAME> <AUTOCREATE> <SEED值> <额外serverconfig行|-> <EVIL|_> [WORLDNAME]
#   铁律: arch -x86_64 强制 / HOME 隔离 / 只杀本链实例(pgrep 钉本链 config 绝对路径)
#   基线 rig = TerrariaServer.bin.osx md5 3248fc76ee0aeb376990361371690de4 (L1 canon,
#   iii40-rig.app≡iii80-app.app≡rrrr-rigs/app，插桩中立性已多批双源实证)
set -u
NAME=$1; AUTO=$2; SEEDV=$3; EXTRA=$4; EVIL=$5; WNAME=${6:-gold-$NAME}
APP=${GC_APP:-/tmp/iii40-rig.app/Contents/MacOS/TerrariaServer}
OUT=/tmp/gc-regen/out/$NAME
HOME_D=/tmp/gc-regen/home-$NAME
CFG=$OUT/serverconfig.txt
PORT=${GC_PORT:-83$RANDOM}

# 洁净环境：清掉外层泄漏的 SW_* 插桩位，但显式保留调用方声明的 GC_KEEP_SW 白名单
KEEPSW=$(printenv GC_KEEP_SW 2>/dev/null || true)
while read k; do case "$KEEPSW" in *"|$k|"*) ;; *) unset "$k";; esac; done < <(env | grep '^SW_' | cut -d= -f1)

mkdir -p "$OUT" "$HOME_D/Library/Application Support/Terraria/Worlds"
rm -f "$OUT"/w.wld "$OUT"/pc.txt "$OUT"/run.log
rm -f "$OUT"/*.typ "$OUT"/*.act "$OUT"/*.wal "$OUT"/*.liq "$OUT"/*.half \
      "$OUT"/*.slope "$OUT"/*.lty "$OUT"/*.inact "$OUT"/*.frx "$OUT"/*.fry "$OUT"/*.wire 2>/dev/null
cat > "$CFG" <<CFGEOF
world=$OUT/w.wld
autocreate=$AUTO
seed=$SEEDV
worldname=$WNAME
difficulty=0
port=$PORT
password=iiiii90b
maxplayers=8
CFGEOF
[ "$EXTRA" != "-" ] && printf '%s\n' "$EXTRA" >> "$CFG"

export HOME=$HOME_D SW_DUMP_ALL=$OUT SW_PASSCHAIN=$OUT/pc.txt
[ "$EVIL" != "_" ] && export SW_EVIL=$EVIL || unset SW_EVIL

echo "[gc] $NAME start $(date '+%F %T') port=$PORT seed=$SEEDV auto=$AUTO evil=${EVIL:-unset} extra=${EXTRA}"
cd /tmp && arch -x86_64 "$APP" -config "$CFG" > "$OUT/run.log" 2>&1 &
SH=$!
LAST=0; STABLE=0
for i in $(seq 1 1440); do
  sleep 5
  kill -0 $SH 2>/dev/null || break
  D=$(ls "$OUT"/*.typ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$D" != "$LAST" ]; then LAST=$D; STABLE=0; else STABLE=$((STABLE+1)); fi
  if [ "${D:-0}" -ge 106 ] && [ "$STABLE" -ge 24 ] && [ -f "$OUT/w.wld" ]; then
    echo "[gc] $NAME dumps=$D stable -> SIGINT $(date '+%T')"; kill -INT $SH 2>/dev/null; break
  fi
done
W=0
while kill -0 $SH 2>/dev/null && [ "$W" -lt 240 ]; do sleep 10; W=$((W+10)); done
sleep 3
# pkill 自律: 仅钉本链 config 绝对路径串
pgrep -f "$CFG" | while read p; do kill -9 "$p" 2>/dev/null; done
kill -9 $SH 2>/dev/null
rm -f "$OUT"/*.wire "$OUT"/*.frx "$OUT"/*.fry 2>/dev/null
D=$(ls "$OUT"/*.typ 2>/dev/null | wc -l | tr -d ' '); PL=$(grep -c '' "$OUT/pc.txt" 2>/dev/null || echo 0)
WSZ=$(stat -f%z "$OUT/w.wld" 2>/dev/null || echo missing)
echo "[gc] DONE $NAME dumps=$D pslines=$PL wld=$WSZ end=$(date '+%F %T')"
echo "$(date '+%F %T') $NAME dumps=$D ps=$PL wld=$WSZ seed=$SEEDV auto=$AUTO evil=${EVIL:-unset} extra=${EXTRA}" >> /tmp/gc-regen/logs/progress.txt
