#!/bin/bash
# IIII107c 回归矩阵：金标十件套 + 护卫四件 + seed-parity + spot 十六线 + sparkle/grv 守恒
cd "$(dirname "$0")/.."   # ★C档可移植:仓库根(game/)
OUT=/tmp/iii145-out/reg
mkdir -p "$OUT"

echo "== [1] 金标十件套 =="
npx vitest run tests/lighting-fastrandom-golden.test.ts tests/npc-stats-golden.test.ts \
  tests/lighting-scan-blur-golden.test.ts tests/atlas-append-golden.test.ts tests/npc-frame-golden.test.ts \
  tests/golden-wld-meta.test.ts tests/liquid-settle-golden.test.ts tests/vanilla-framing-golden.test.ts \
  tests/sfx-wiring-golden.test.ts tests/item-stats-golden-1457.test.ts > "$OUT/goldens.log" 2>&1
echo "[goldens] rc=$?"

echo "== [2] 护卫四件 + seed-parity =="
npx vitest run tests/skyblock-anchor-sets.test.ts tests/micro-biomes.test.ts \
  tests/worldgen-1457-rewire.test.ts tests/dungeon-1457-alignment.test.ts > "$OUT/guards1.log" 2>&1
echo "[guards1] rc=$?"
npx vitest run tests/seed-parity.test.ts > "$OUT/seed-parity.log" 2>&1
echo "[seed-parity] rc=$?"

echo "== [3] spot 十六线（关键槽五点） =="
for ch in g s22222 m const ntb notraps c12345 skyblock drunk celeb toadstool fishmox pumpkin jagged waterpark remix; do
  SW_MB_1457=1 SW_SPOT_CHAIN=$ch npx vitest run tools/_iii100spot.test.ts > "$OUT/spot-$ch.log" 2>&1
  echo "[spot-$ch] rc=$?"
done

echo "== [4] sparkle/graveyard 守恒 mile8 =="
SW_MB_1457=1 SW_M8_NOCACHE=1 SW_I81=1 SW_I81_MINNAMES=5 \
  SW_I81_G2=$HOME/GoldenChains/golden-sparkle SW_I81_VG=$HOME/GoldenChains/golden-sparkle \
  SW_I81_SEED='771004' SW_I81_EVIL=0 SW_I81_FLAGS=hallowOnTheSurface \
  npx vitest run tools/_iii81m8.test.ts > "$OUT/m8-sparkle.log" 2>&1
echo "[m8-sparkle] rc=$?"
SW_MB_1457=1 SW_M8_NOCACHE=1 SW_I81=1 SW_I81_MINNAMES=5 \
  SW_I81_G2=$HOME/GoldenChains/golden-grvfix SW_I81_VG=$HOME/GoldenChains/golden-grvfix \
  SW_I81_SEED='nightofthelivingdead|20260903' SW_I81_EVIL=0 SW_I81_FLAGS=graveyardBloodmoonStart \
  npx vitest run tools/_iii81m8.test.ts > "$OUT/m8-grv.log" 2>&1
echo "[m8-grv] rc=$?"
# ★IIIII174b（2026-09-05）：grv 段 SW_I81_EVIL -1→0 钉死——golden-grvfix 桶=SW_EVIL=0 产物
#   （runbook §1），EVIL=-1 误跑=JS 侧邪恶自然掷对桶伪红（#26 Shinies T22>204×752 配方伪红；
#   IIIRS158 判例 m8-grv EVIL=0 钉 105✓/0✗ 在案，IIIRS168 批「graveyard #26 先在债」同签名
#   误报——IIIII174b 批 EVIL=0 复跑 105✓/0✗ 复证后销账，脚本原文自此钉 0 防再犯）。

echo "== [5] tests/golden 零写入复核 =="
ls tests/golden/ > /tmp/iii145-out/golden-ls-after.txt
md5 -q tests/golden/* > /tmp/iii145-out/golden-md5-after.txt 2>/dev/null
diff -q /tmp/iii145-out/golden-ls-before.txt /tmp/iii145-out/golden-ls-after.txt && echo "golden ls identical"
diff -q /tmp/iii145-out/golden-md5-before.txt /tmp/iii145-out/golden-md5-after.txt && echo "golden md5 identical"
echo "reg-done $(date +%H:%M:%S)"
