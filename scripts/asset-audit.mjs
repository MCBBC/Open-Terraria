// 素材完整性审计：对比 terraria-assets PNG 实际尺寸 vs TEdit tiles.json 帧需求
// 用法：node scripts/asset-audit.mjs
// 输出需要重新解包的 Tiles_N.png 列表（TEdit 需要的帧超出 PNG 范围 = 素材版本旧于数据）
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = join(here, '..', '..', 'terraria-assets', 'Images');
const TEDIT_DATA = join(here, '..', '..', 'Terraria-Map-Editor', 'src', 'TEdit.Terraria', 'Data');

function pngSize(file) {
  const b = readFileSync(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

const tiles = JSON.parse(readFileSync(join(TEDIT_DATA, 'tiles.json'), 'utf8'));
const whitelist = JSON.parse(readFileSync(join(here, 'vanilla-whitelist.json'), 'utf8'));

const bad = [];
for (const id of whitelist.tiles) {
  const t = tiles.find((e) => e.id === id);
  if (!t) continue;
  const file = join(ASSETS, `Tiles_${id}.png`);
  let size;
  try { size = pngSize(file); } catch { bad.push({ id, name: t.name, reason: 'PNG 缺失' }); continue; }
  const grid = t.textureGrid ?? [16, 16];
  const gap = t.frameGap ?? [2, 2];
  const stride = [grid[0] + gap[0], grid[1] + gap[1]];
  // 帧需求：TEdit frames uv 最大值 + 帧尺寸。
  // textureWrap（换行纹理）：超出 wrapThreshold 的帧换算回带内坐标，
  // 实际需求 = 带内最大值 + 一带宽度/高度（渲染端已实现带换行兼容，非素材缺失）
  const wrap = t.textureWrap ?? null;
  const wrapMax = wrap ? wrap.wrapThreshold : Infinity;
  const inc = wrap ? wrap.offsetIncrement : 0;
  const isU = wrap?.axis === 'U';
  let needW = 0, needH = 0, wrappedStyles = 0;
  for (const f of t.frames ?? []) {
    if (!f?.uv) continue;
    let ux = f.uv[0], uy = f.uv[1];
    if (wrap) {
      if (isU) { if (ux >= wrapMax) { ux = inc + (ux - wrapMax) % (Math.max(1, size.w - inc)); wrappedStyles++; } }
      else { if (uy >= wrapMax) { uy = inc + (uy - wrapMax) % (Math.max(1, size.h - inc)); wrappedStyles++; } }
    }
    needW = Math.max(needW, ux + grid[0]);
    needH = Math.max(needH, uy + grid[1]);
  }
  if (wrappedStyles) t._wrapped = wrappedStyles;
  if (needW > size.w || needH > size.h) {
    bad.push({
      id, name: t.name,
      png: `${size.w}×${size.h}`, need: `${needW}×${needH}`,
      short: needW > size.w ? `宽缺 ${needW - size.w}px` : `高缺 ${needH - size.h}px`,
      reason: t._wrapped ? `（${t._wrapped} 个换行样式）` : undefined,
    });
  }
}
if (bad.length) {
  console.log(`素材不达标（TEdit 帧需求超出 PNG 尺寸）共 ${bad.length} 张，需从当前版本游戏重新解包：`);
  for (const b of bad) console.log(`  Tiles_${b.id}.png [${b.name}] PNG ${b.png} → 需要 ${b.need}（${b.short}）${b.reason ? '· ' + b.reason : ''}`);
} else {
  console.log('全部达标');
}
const wrappedCount = tiles.filter((t) => t._wrapped).length;
if (wrappedCount) console.log(`（${wrappedCount} 张为换行纹理 textureWrap，渲染端带换行兼容，非素材缺失）`);
