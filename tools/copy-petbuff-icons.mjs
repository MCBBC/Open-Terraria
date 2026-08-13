// 宠物 buff 图标拷贝器：按 src/data/vanilla-pets.json 的 buff 集合，把
// terraria-assets/Images/Buff_<buff>.png 拷入 public/sprites/vanilla/
// （buff 栏宠物条目用；缺失 Buff png 的款自动补拷其投射物贴图
//  Projectile_<proj>.png 作为 UI.ts onerror 兜底素材）。
//
// 用法：在 game/ 下 `node tools/copy-petbuff-icons.mjs`（幂等，重复跑只补缺）。
// 数据表再生（tools/extract-pets.mjs）后若 buff 集变化，重跑本脚本即可。
import { readFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');   // SandboxWorld/
const GAME = join(ROOT, 'game');
const IMAGES = join(ROOT, 'terraria-assets', 'Images');
const OUT = join(GAME, 'public', 'sprites', 'vanilla');

const pets = JSON.parse(readFileSync(join(GAME, 'src', 'data', 'vanilla-pets.json'), 'utf8'));

// ---- 收集 buff / proj 集（61 distinct buff / 61 distinct proj，2026-08 基线） ----
const buffSet = new Set();
const projSet = new Set();
for (const v of Object.values(pets)) {
  buffSet.add(v.buff);
  projSet.add(v.proj);
}

mkdirSync(OUT, { recursive: true });

// ---- 拷贝 Buff_<id>.png（正道）+ 记录缺失款 ----
const missingBuff = [];
for (const b of [...buffSet].sort((a, b) => a - b)) {
  const src = join(IMAGES, `Buff_${b}.png`);
  if (!existsSync(src)) {
    missingBuff.push(b);
    continue;
  }
  copyFileSync(src, join(OUT, `Buff_${b}.png`));
}

// ---- 拷贝 Projectile_<id>.png（Buff png 缺失款的回退图标；全量补齐，
//      款式未来增删不漏） ----
const missingProj = [];
for (const p of [...projSet].sort((a, b) => a - b)) {
  const src = join(IMAGES, `Projectile_${p}.png`);
  if (!existsSync(src)) {
    missingProj.push(p);
    continue;
  }
  copyFileSync(src, join(OUT, `Projectile_${p}.png`));
}

// 需要走 proj 回退的 buff（按数据表款数计，非 distinct buff 数）
const fallbackItems = Object.values(pets).filter((v) => missingBuff.includes(v.buff));

console.log(`pets.json: ${Object.keys(pets).length} items / ${buffSet.size} distinct buffs / ${projSet.size} distinct projs`);
console.log(`Buff_<id>.png     拷贝/在位: ${buffSet.size - missingBuff.length}/${buffSet.size}`);
console.log(`Projectile png    拷贝/在位: ${projSet.size - missingProj.length}/${projSet.size}`);
console.log(`走 proj 回退的款数: ${fallbackItems.length}`);
if (missingBuff.length) console.log(`缺 Buff png 的 buff id: ${missingBuff.join(', ')}`);
if (missingProj.length) console.log(`缺 Projectile png 的 proj id: ${missingProj.join(', ')}`);
