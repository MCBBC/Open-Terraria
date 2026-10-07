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
  let body = extractMethodBody(text, 'public override void SetDefaults()');
  if (body === null) {
    // ★三百零二:基类链 SetDefaults 回溯(noSetDefaults 族——BaseGunHoldoutProjectile
    // 等基类持 SetDefaults;沿 class X : Y 链上溯,上限 5 层)
    const baseMap = new Map();
    for (const f2 of walkFiles(projDir, '.cs')) {   // 未滤表(abstract 基类在链上)

      const h2 = readFileSync(f2, 'utf8');
      const m2 = h2.match(/class\s+(\w+)\s*:\s*([A-Za-z0-9_]+)/);
      if (m2) baseMap.set(m2[1], { file: f2, base: m2[2] });
    }
    const mself = text.match(/class\s+\w+\s*:\s*([A-Za-z0-9_]+)/);
    let base = mself ? mself[1] : null;
    for (let hop = 0; hop < 5 && base && base !== 'ModProjectile' && body === null; hop++) {
      const bk = baseMap.get(base);
      if (!bk) break;
      body = extractMethodBody(readFileSync(bk.file, 'utf8'), 'public override void SetDefaults()');
      base = bk.base;
    }
  }
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
  // ★B7 一百零七刀:AI 行为 census(C# AI() 信号 → 通用行为字段)
  {
    const aiIdx = text.indexOf('public override void AI()');
    if (aiIdx >= 0) {
      const ao = text.indexOf('{', aiIdx);
      let ad = 0, ae = -1;
      for (let ai2 = ao; ai2 < text.length; ai2++) {
        if (text[ai2] === '{') ad++;
        else if (text[ai2] === '}') { ad--; if (ad === 0) { ae = ai2; break; } }
      }
      if (ae > 0) {
        const aiBody = text.slice(ao + 1, ae);
        // homing:朝目标归一化推进(velocity += normalize(Δ)*v)
        if (/velocity \+= (Vector2\.)?Normalize\(/.test(aiBody) || /MoveTowards\(/.test(aiBody)) raw.homing = 6;
        // accelerate:沿速度向推进
        if (/velocity \*= 1\.0[2-9]f?/.test(aiBody)) raw.accelerate = 0.15;
        // gravity:显式 Y 重力
        const gm = aiBody.match(/velocity\.Y \+= (0\.[0-9]+f?)/);
        if (gm) raw.gravity = Number(gm[1].replace('f', ''));
      }
    }
    // boomerang:回返信号(AI 或 SetDefaults)
    if (/boomerang|Boomerang|returnHome/i.test(text)) raw.boomerang = { returnTicks: 30, accel: 0.5 };
  }

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

// ---------- ★三百零二:第二遍——物品文件内嵌套 ModProjectile 类 ----------
// SpadefishThrown 等嵌套在 Items/*.cs 的弹类(37 projRef missing 族)——
// 类切片提取最小声明面(width/height/aiStyle/damage/timeLeft/pierce/gravity),
// 贴图=占位;AI=ModProj 原语/直线近似(登记)。
{
  const missingProjKeys = new Set();
  if (existsSync(join(OUT, 'projref-missing.json'))) {
    for (const entry of JSON.parse(readFileSync(join(OUT, 'projref-missing.json'), 'utf8'))) {
      const at = entry.indexOf('→');
      if (at > 0) missingProjKeys.add(entry.slice(at + 1));
    }
  }
  const otherFiles = [];
  for (const sub of ['Items', 'Projectiles/ScriptedDraw']) {
    const dir = join(SRC, sub);
    if (existsSync(dir)) otherFiles.push(...walkFiles(dir, '.cs'));
  }
  let nestedEmitted = 0;
  for (const f of otherFiles) {
    const text = readFileSync(f, 'utf8');
    for (const cm of text.matchAll(/class\s+(\w+)\s*:\s*([A-Za-z0-9_<>]+)[^\n{]*\n?[\s\S]*?\{/g)) {
      const cls = cm[1];
      const key = pascalToSnake(cls);
      if (!missingProjKeys.has(key) || emittedKeys.has(key)) continue;
      // 类体切片(从此声明到下一 class 声明或文件尾)
      const start = cm.index;
      const nextClass = text.slice(start + 10).search(/\nclass\s+\w+/);
      const slice = nextClass < 0 ? text.slice(start) : text.slice(start, start + 10 + nextClass);
      const body = extractMethodBody(slice, 'public override void SetDefaults()') ?? '';
      const raw = { key, name: cls };
      const num = (re) => { const m2 = body.match(re); return m2 ? Number(m2[1]) : undefined; };
      const wd = num(/Projectile\.width\s*=\s*(\d+)/); if (wd !== undefined) raw.width = wd;
      const ht = num(/Projectile\.height\s*=\s*(\d+)/); if (ht !== undefined) raw.height = ht;
      const dm = num(/Projectile\.damage\s*=\s*(\d+)/); if (dm !== undefined) raw.damage = dm;
      const tl = num(/Projectile\.timeLeft\s*=\s*(\d+)/); if (tl !== undefined) raw.lifetime = tl;
      const pi = num(/Projectile\.pierce\s*=\s*(\d+)/); if (pi !== undefined) raw.pierce = pi;
      const ai = body.match(/Projectile\.aiStyle\s*=\s*(\d+)/);
      if (ai) raw.aiStyle = Number(ai[1]);
      raw.texture = 'textures/projectiles/_placeholder.png';
      emittedKeys.add(key);
      nestedEmitted++;
      if (WRITE) {
        mkdirSync(outDir, { recursive: true });
        writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
      }
    }
  }
  stats.nestedEmitted = nestedEmitted;
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
