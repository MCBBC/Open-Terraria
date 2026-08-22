#!/bin/sh
# vanilla.json 踩踏一键恢复(并行会话覆盖事故,2026-08-22):
# ① git 回结构 → ② atlas-append 重放全部补丁(49 新物品/伪装箱 76/753/单图) → ③ 4722 矩形
# 用法:cd game && sh scripts/restore-vanilla-json.sh
set -e
cd "$(dirname "$0")/.."
git checkout HEAD -- public/sprites/vanilla.json
node scripts/atlas-append-1457.mjs
python3 - <<'PY'
import json, struct
v = json.load(open('public/sprites/vanilla.json'))
b = open('public/sprites/vanilla/Item_4722.png','rb').read()
w = struct.unpack('>I', b[16:20])[0]; h = struct.unpack('>I', b[20:24])[0]
v['items']['4722'].update(ix=0, iy=0, iw=w, ih=h)
json.dump(v, open('public/sprites/vanilla.json','w'), separators=(',',':'))
print('4722 ok')
PY
node tools/atlas-lint.mjs 2>&1 | tail -1
node tools/recon-item-1456-1457.mjs --fix 2>&1 | grep FIX || true
echo "vanilla.json 恢复完成——再跑 npx vitest run tests/atlas-append-golden.test.ts 验证"
