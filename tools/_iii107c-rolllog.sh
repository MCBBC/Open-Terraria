#!/bin/bash
# IIII107c：iamerror 链 canon rig 重跑 + 全进程掷值流（SW_ROLLLOG）
# 产物目录 /tmp/iii145-out/x86-iamerror-rl（与 G2 逐字节复核用）；G2 只读不动。
set -u
APP=/tmp/iii109-rig.app/Contents/MacOS/TerrariaServer
OUT=/tmp/iii145-out/x86-iamerror-rl
HOME_D=/tmp/iii145-out/home-iamerror-rl
RL=/tmp/iii145-out/x86-rl.txt
CFG=$OUT/serverconfig.txt
mkdir -p "$OUT" "$HOME_D/Library/Application Support/Terraria/Worlds"
rm -f "$OUT"/*.typ "$OUT"/*.act "$OUT"/*.wal "$OUT"/*.liq "$OUT"/*.half "$OUT"/*.slope "$OUT"/*.lty "$OUT"/*.inact "$OUT"/pc.txt "$RL" 2>/dev/null
cat > "$CFG" <<CFGEOF
world=$OUT/w.wld
autocreate=1
seed=1.1.1.0.iamerror|106103
worldname=mch2-iamerror
difficulty=0
port=8125
password=i106
maxplayers=8
CFGEOF
export HOME=$HOME_D SW_DUMP_ALL=$OUT SW_ROLLLOG=$RL
unset SW_DUMP_PAINT SW_EVIL 2>/dev/null || true
echo "[107c-rl] start $(date +%H:%M:%S)"
( cd /tmp && arch -x86_64 $APP -config "$CFG" ) > "$OUT/run.log" 2>&1 &
SH=$!
LAST=0; STABLE=0
for i in $(seq 1 240); do
  sleep 5
  if ! kill -0 $SH 2>/dev/null; then break; fi
  D=$(ls "$OUT"/*.typ 2>/dev/null | wc -l | tr -d ' ')
  if [ "$D" != "$LAST" ]; then LAST=$D; STABLE=0; else STABLE=$((STABLE+1)); fi
  if [ "${D:-0}" -ge 106 ] && [ $STABLE -ge 24 ] && [ -f "$OUT/w.wld" ]; then
    echo "[107c-rl] $D dumps stable, SIGINT $(date +%H:%M:%S)"; kill -INT $SH 2>/dev/null; break
  fi
done
W2=0
while kill -0 $SH 2>/dev/null && [ $W2 -lt 120 ]; do sleep 5; W2=$((W2+5)); done
for p in $(pgrep -f "$CFG" 2>/dev/null); do kill -9 "$p" 2>/dev/null; done
D=$(ls "$OUT"/*.typ 2>/dev/null | wc -l | tr -d ' ')
echo "[107c-rl] done dumps=$D end=$(date +%H:%M:%S) rollrows=$(grep -c '' "$RL" 2>/dev/null)"
