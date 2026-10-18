// 敌弹绘制尺寸对账盘点(G11):逐弹型列 贴图原生尺寸(IHDR) × SetDefaults(w/h/scale)
//  × projFrames × 当前仓库画法 → 失真判定。经 tools/run-diag.mjs 运行。
import { REPO_ROOT } from './_pathlib.mjs';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = REPO_ROOT;
const imgDir = path.join(ROOT, 'public/sprites/vanilla');
const projData = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/vanilla-projectiles.json'), 'utf8'));
const projFrames = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/data/vanilla-projframes.json'), 'utf8'));

function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) return null;
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
}

/** 自绘敌弹族(bossAI 系/SquidCloud)固定弹型 */
const CUSTOM = [
  [813, 'SquidCloud'],
  [456, 'MoonLeechProj'],
  [681, 'DD2GoblinBomb'],
  [683, 'DD2OgreSmash'],
  [961, 'DeerclopsSpikeProj'],
  [962, 'DeerclopsRubbleProj'],
  [965, 'InsanityShadowProj'],
  [490, 'CultistRitualCircle'],
  [539, 'LunarOrb 539'],
  [574, 'LunarOrb 574'],
];

/** TownShot(vanillaTownAttack.ts)全量弹型——proj 字段值 */
const TOWN_IDS = [1, 2, 10, 12, 13, 14, 15, 17, 18, 19, 20, 21, 22, 24, 30, 38, 48, 54, 107, 108, 124, 142, 160, 162, 178, 208, 209, 227, 228, 229, 242, 267, 357, 368, 369, 453, 520, 550, 582, 583, 585, 586, 587, 588, 589, 590, 633, 663, 669, 721, 880, 950];
/** 209 三选一与 229 panic 换弹的动态弹型 */
const TOWN_DYNAMIC = [134, 133, 135];

function audit(id, label, mode) {
  const f = path.join(imgDir, `Projectile_${id}.png`);
  const size = fs.existsSync(f) ? pngSize(f) : null;
  const d = projData[String(id)] ?? {};
  const frames = projFrames[String(id)] ?? 1;
  const scale = d.scale ?? 1;
  const setW = d.width ?? 10;
  const setH = d.height ?? 10;
  if (!size) return { id, label, tex: 'NO-TEX', frames, note: '缺贴图' };
  const fw = size.w;                       // 帧宽(多帧行:宽不变)
  const fh = size.h / frames;              // 帧高
  // 期望绘制尺寸 = 贴图原生帧 × SetDefaults scale
  const expW = fw * scale, expH = fh * scale;
  // 当前 TownShot 画法:(w, w*texH/texW) —— 整图比例(未帧切片!)
  const curW = setW, curH = setW * size.h / size.w;
  // 当前自绘族画法(w×h 或手写常量)由调用方给
  const ratio = Math.max(curW / expW, expW / curW, curH / expH, expH / curH);
  const aspectFlip = (expW > expH) !== (curW > curH);
  return {
    id, label, mode,
    tex: `${size.w}x${size.h}`, frames,
    hit: `${setW}x${setH}`, scale,
    expect: `${expW.toFixed(1)}x${expH.toFixed(1)}`,
    townCur: mode === 'town' ? `${curW.toFixed(1)}x${curH.toFixed(1)}` : '-',
    distort: ratio > 2 || aspectFlip ? `失真(${ratio.toFixed(2)}x${aspectFlip ? '/翻转' : ''})` : (ratio > 1.3 ? `偏${ratio.toFixed(2)}x` : 'ok'),
  };
}

const rows = [
  ...CUSTOM.map(([id, l]) => audit(id, l, 'custom')),
  ...TOWN_DYNAMIC.map((id) => audit(id, 'TownShot动态' + id, 'town')),
  ...TOWN_IDS.map((id) => audit(id, 'TownShot', 'town')),
];
console.table(rows.map((r) => {
  const { id, label, tex, frames, hit, scale, expect, townCur, distort } = r;
  return { id, label, tex, frames, hit, scale, expect, townCur, distort };
}));

// 多帧行未切片警示(TownShot 整图绘制会压成胶片条)
console.log('\n[多帧行·TownShot 未切片清单(胶片条风险)]:');
for (const r of rows) if (r.mode === 'town' && r.frames > 1) console.log(' ', r.id, r.label, r.tex, `${r.frames}帧`);
