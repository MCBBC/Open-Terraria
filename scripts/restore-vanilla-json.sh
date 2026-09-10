#!/bin/sh
# vanilla.json 踩踏一键恢复(并行会话覆盖事故,2026-08-22):
# ① git 回结构 → ② atlas-append 重放全部补丁(49 新物品/伪装箱 76/753/单图) → ③ 4722 矩形
# 用法:cd game && sh scripts/restore-vanilla-json.sh
set -e
cd "$(dirname "$0")/.."
git checkout HEAD -- public/sprites/vanilla.json
# ★SW-RB12c（2026-09-10）:事故面=四文件（FX22 定谳:vanilla.json/vanilla-ui.json/
# Item_Atlas_0/1）,此前只回 vanilla.json——PNG 侧重排（8/23 0042c846、9/10 15:41/17:44
# 三发）必须连 PNG 一起回;vanilla-ui.json 的 bulk 键（UI_Camera 8 件手修）同样在
# 重跑中经 :472 seen.has 跳过被静默丢键。Atlas_2/3 为追加页,事故管线不写,不回。
git checkout HEAD -- public/sprites/vanilla-ui.json
git checkout HEAD -- public/sprites/vanilla/Item_Atlas_0.png
git checkout HEAD -- public/sprites/vanilla/Item_Atlas_1.png
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
