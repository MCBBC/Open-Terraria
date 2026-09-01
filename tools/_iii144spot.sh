#!/bin/bash
# IIIII111b 回归十三线驱动（用毕可删）。证据落盘 /tmp/iii144-out/spot-<chain>.log
cd "$(dirname "$0")/.." || exit 1
OUT=/tmp/iii144-out
mkdir -p "$OUT"
export SW_MB_1457=1
SUM="$OUT/spot-summary.txt"
: > "$SUM"
run() {
  local chain=$1; shift
  echo "== $chain $(date '+%T')" >> "$SUM"
  SW_SPOT_CHAIN="$chain" npx vitest run tools/_iii100spot.test.ts > "$OUT/spot-$chain.log" 2>&1
  local rc=$?
  local verdict=$(grep -c '✓$' "$OUT/spot-$chain.log" 2>/dev/null)
  echo "rc=$rc green_rows=$verdict" >> "$SUM"
}
for c in g s22222 m ntb notraps c12345 skyblock drunk celeb toadstool fishmox pumpkin jagged; do
  run "$c"
done
# const：AB 记账（无 G2 桶）：基线写 + 对读
echo "== const ABW $(date '+%T')" >> "$SUM"
SW_SPOT_CHAIN=const SW_SPOT_NOFIX=1 SW_SPOT_ABW=$OUT/ab-const npx vitest run tools/_iii100spot.test.ts > "$OUT/spot-const-abw.log" 2>&1
echo "rc=$?" >> "$SUM"
echo "== const ABC $(date '+%T')" >> "$SUM"
SW_SPOT_CHAIN=const SW_SPOT_ABC=$OUT/ab-const npx vitest run tools/_iii100spot.test.ts > "$OUT/spot-const-abc.log" 2>&1
echo "rc=$?" >> "$SUM"
echo "ALL DONE $(date '+%T')" >> "$SUM"
