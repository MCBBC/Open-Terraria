#!/usr/bin/env node
// 灾厄全量移植 B4:projectiles 机械提取器。
// 源=CalamityModPublic/Projectiles(ModProjectile SetDefaults 数据面 + PNG);
// 目标=game/mods/calamity/content/projectiles/*.json + textures/projectiles/*.png。
// ★ModProjContent 域=引擎 ModProj 支持面(width/height/pierce/timeLeft/tileCollide/
//   aiStyle/gravity);AI/OnHit 代码面走 L2 projectileHook(B6 相期)。
// ★同时回填物品的 projRef:content/items 中 shoot 指向本批已声明弹的 sidecar 记录
//  (tools/extract-calamity/extract-items.mjs)→ combat.shoot='proj:<key>' 直通。
// 用法:node tools/extract-calamity/extract-projectiles.mjs [--write]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, copyFileSync, unlinkSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'CalamityModPublic');
const OUT = join(ROOT, 'game', 'mods', 'calamity');
const WRITE = process.argv.includes('--write');

// ---------- 枚举(弹 aiStyle=ProjectileID?否——aiStyle 是原版数字域,直接字面) ----------
function extractMethodBody(text, signature) {
  const idx = text.indexOf(signature);
  if (idx < 0) return null;
  const open = text.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}

const pascalToSnake = (s) => s
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/\s+/g, '')
  .toLowerCase();

function walkFiles(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function loadFileConsts(text) {
  const map = {};
  for (const m of text.matchAll(/(?:const|static readonly)\s+(?:int|float|double|short|byte)\s+([A-Za-z0-9_]+)\s*=\s*([0-9.]+)f?\s*;/g)) {
    map[m[1]] = Number(m[2]);
  }
  for (const m of text.matchAll(/(?:int|float)\s+([A-Za-z0-9_]+)\s*(?:=>|=)\s*([0-9.]+)f?\s*;/g)) {
    if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
  }
  return map;
}

// ---------- 源普查 ----------
const projDir = join(SRC, 'Projectiles');
const csFiles = walkFiles(projDir, '.cs').filter((f) => {
  const base = basename(f);
  if (/Global|CommonProjectileAI|PowderTransformations/.test(base)) return false;
  const head = readFileSync(f, 'utf8').slice(0, 2500);
  if (!/class\s+\w+\s*:\s*\w*Projectile/.test(head)) return false;
  if (/abstract class/.test(head)) return false;
  return true;
});
const pngs = walkFiles(projDir, '.png').filter((p) => !/_Highlight|_Glow|_Trail|_Color|_Alt/i.test(basename(p)));
const pngByBase = new Map();
for (const p of pngs) { const b = basename(p, '.png'); if (!pngByBase.has(b)) pngByBase.set(b, p); }

// 4×4 全透明 PNG(基线编码,无依赖)
const PLACEHOLDER_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAFklEQVR4nGNkYGD4z0AEYBxVSF8AAgcSAOs0nK0AAAAASUVORK5CYII=', 'base64');
// ★手批权威弹幕(.curated-projectiles.json,如 desert-scourge 手裁首帧贴图族):
//  清单内键跳过重写——提取器全量重发不触碰
const curatedProjKeys = new Set(existsSync(join(OUT, '.curated-projectiles.json'))
  ? JSON.parse(readFileSync(join(OUT, '.curated-projectiles.json'), 'utf8'))
  : []);
const stats = { total: 0, emitted: 0, noSetDefaults: 0, noTexture: 0, nonPngTexture: 0 };
const emittedKeys = new Set();
const outDir = join(OUT, 'content', 'projectiles');
const texDir = join(OUT, 'textures', 'projectiles');

for (const f of csFiles) {
  const cls = basename(f, '.cs').trim();
  const key = pascalToSnake(cls);
  if (emittedKeys.has(key) || curatedProjKeys.has(key)) continue;
  stats.total++;
  const text = readFileSync(f, 'utf8');
  const body = extractMethodBody(text, 'public override void SetDefaults()');
  if (body === null) { stats.noSetDefaults++; continue; }   // 未落盘键不进 emittedKeys(回填信任面)
  const fileConsts = loadFileConsts(text);
  const num = (expr) => {
    if (expr === undefined) return undefined;
    const e = String(expr).trim().replace(/;$/, '');
    if (/^-?\d+(\.\d+)?f?$/.test(e)) return Number(e.replace(/f$/, ''));
    if (fileConsts[e] !== undefined) return fileConsts[e];
    const add = e.match(/^(.+)\s*\+\s*(.+)$/);
    if (add) {
      const l = num(add[1]); const r = num(add[2]);
      if (l !== undefined && r !== undefined) return l + r;
    }
    return undefined;
  };

  const raw = { key, texture: `textures/projectiles/${key}.png` };
  let anyField = false;
  for (const line of body.split('\n')) {
    const t = line.trim();
    const fm = t.match(/^Projectile\.([A-Za-z0-9_]+)\s*=\s*([^;]+);$/);
    if (!fm) continue;
    const [, field, expr] = fm;
    if (field === 'width') { const v = num(expr); if (v !== undefined) { raw.width = v; anyField = true; } }
    else if (field === 'height') { const v = num(expr); if (v !== undefined) { raw.height = v; anyField = true; } }
    else if (field === 'penetrate') { const v = num(expr); if (v !== undefined) { raw.pierce = v; anyField = true; } }
    else if (field === 'timeLeft') { const v = num(expr); if (v !== undefined) { raw.lifetime = v; anyField = true; } }
    else if (field === 'tileCollide') {
      const e = String(expr).trim();
      if (e === 'true') { raw.tileCollide = true; anyField = true; }
      else if (e === 'false') { raw.tileCollide = false; anyField = true; }
    }
    else if (field === 'aiStyle') { const v = num(expr); if (v !== undefined) { raw.aiStyle = v; anyField = true; } }
  }

  // 贴图(魔数校验)
  const png = pngByBase.get(cls) ?? pngByBase.get(cls.replace(/\s+/g, ''));
  let hasPng = false;
  if (png) {
    const head = readFileSync(png).subarray(0, 4);
    if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) hasPng = true;
    else stats.nonPngTexture++;
  }
  if (!hasPng) {
    // 程序化绘制/无独立贴图弹 → 共享占位(4×4 透明);真实绘制=B6 projectileHook 相期
    stats.noTexture++;
    raw.texture = 'textures/projectiles/_placeholder.png';
  }

  emittedKeys.add(key);
  if (WRITE) {
    mkdirSync(outDir, { recursive: true });
    mkdirSync(texDir, { recursive: true });
    const phPath = join(texDir, '_placeholder.png');
    if (!existsSync(phPath)) writeFileSync(phPath, PLACEHOLDER_PNG);
    writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
    if (hasPng) { mkdirSync(texDir, { recursive: true }); copyFileSync(png, join(texDir, `${key}.png`)); }
  }
  stats.emitted++;
}

// ---------- 回填物品 projRef ----------
// extract-items 的 sidecar 记录 shootProj=<类名>;本批声明面就绪后,凡键存在者直通。
const reportPath = join(OUT, 'items-extract-report.json');
if (existsSync(reportPath)) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  const sidecar = report.sidecar ?? {};
  let wired = 0; let missing = [];
  for (const [key, sc] of Object.entries(sidecar)) {
    if (sc.shootProj === undefined) continue;
    const projKey = pascalToSnake(sc.shootProj);
    const itemPath = join(OUT, 'content', 'items', `${key}.json`);
    if (!existsSync(itemPath)) { missing.push(key); continue; }
    if (!emittedKeys.has(projKey)) { missing.push(`${key}→${projKey}`); continue; }
    if (!WRITE) { wired++; continue; }
    const spec = JSON.parse(readFileSync(itemPath, 'utf8'));
    spec.combat = spec.combat ?? {};
    spec.combat.shoot = `proj:${projKey}`;
    writeFileSync(itemPath, JSON.stringify(spec, null, 2) + '\n');
    wired++;
  }
  stats.projRefWired = wired;
  stats.projRefMissing = missing.length;
  if (WRITE && missing.length) writeFileSync(join(OUT, 'projref-missing.json'), JSON.stringify(missing, null, 2));
}

console.log(JSON.stringify(stats, null, 2));
