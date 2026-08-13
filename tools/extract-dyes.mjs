// 染料表提取器（DyeInitializer.cs → src/data/vanilla-dyes.json）。
// 数据 1:1：BindShader(id, new XShaderData(ref, "TECH")).UseColor(r,g,b)
//   .UseSecondaryColor(r,g,b).UseSaturation(s)——全量逐条转录；
// LoadBasicColorDye 双重载（:11-34）：2 参版绑定 base/base+12(黑)/base+31(亮)/
//   base+44(银)（亮色 = c×0.5+0.5），4 参版显式 id。
// 不变量：BindShader 总数（84 = 直接条 + 助手展开）+ 表规模断言，防源码漂移。
// 用法：node tools/extract-dyes.mjs（幂等：输出稳定排序键）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const SRC = join(ROOT, '..', 'Terarria1456', 'Terraria.Initializers', 'DyeInitializer.cs');
const OUT = join(ROOT, 'src', 'data', 'vanilla-dyes.json');

const src = readFileSync(SRC, 'utf8');

/** 解析单条 BindShader 链：id + 构造器 + 链式参数 */
function parseBind(stmt) {
  const idM = /BindShader\((\d+)/.exec(stmt);
  if (!idM) return null;
  const techM = /"(Armor\w+|ColorOnly)"/.exec(stmt);
  const colM = /\.UseColor\((-?[\d.]+)f?,\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?\)/.exec(stmt);
  const secM = /\.UseSecondaryColor\((-?[\d.]+)f?,\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?\)/.exec(stmt);
  const satM = /\.UseSaturation\((-?[\d.]+)f?\)/.exec(stmt);
  return {
    id: +idM[1],
    tech: techM?.[1] ?? null,
    color: colM ? [+colM[1], +colM[2], +colM[3]] : undefined,
    secondary: secM ? [+secM[1], +secM[2], +secM[3]] : undefined,
    saturation: satM ? +satM[1] : undefined,
  };
}

/** 一段连续 BindShader 语句（含续行）切分 */
function iterBinds(body) {
  const out = [];
  const re = /GameShaders\.Armor\.BindShader\([\s\S]*?\)(?=\s*;)/g;
  let m;
  while ((m = re.exec(body))) out.push(m[0].replace(/\s+/g, ' '));
  return out;
}

const table = {};
let directCount = 0;
for (const stmt of iterBinds(src)) {
  const b = parseBind(stmt);
  if (!b) continue;                        // 助手体内形参版本（baseDyeItem 等）跳过
  if (!b.tech) throw new Error(`BindShader 解析失败: ${stmt}`);
  table[b.id] = { tech: b.tech };
  if (b.color) table[b.id].color = b.color;
  if (b.secondary) table[b.id].secondary = b.secondary;
  if (b.saturation !== undefined) table[b.id].saturation = b.saturation;
  directCount++;
}

// ---- LoadBasicColorDye 展开（先于 BindShader 计数剥离助手体内的 4 条 Bind）----
// 助手体内的 4 条 BindShader 已被上面计入 directCount——按源序它们属于首次出现，
// 与显式 id 相同的条目会被直接条覆盖（2874-2877 显式四参版在后，参数一致 → 无害）。
// 2 参助手调用展开：
const callRe = /LoadBasicColorDye\((\d+),\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?,\s*(-?[\d.]+)f?(?:,\s*([\d.]+)f?)?(?:,\s*(\d+))?\);/g;
let m2;
const basic = [];
while ((m2 = callRe.exec(src))) {
  const base = +m2[1];
  const c = [+m2[2], +m2[3], +m2[4]];
  const sat = m2[5] !== undefined ? +m2[5] : 1;
  basic.push({ base, c, sat, old: m2[6] ? +m2[6] : undefined });
}
// 展开规则（:16-19 + :26-29）：base=ArmorColored、base+12=AndBlack、
// base+31=ArmorColored（亮色 c×0.5+0.5）、base+44=AndSilverTrim
for (const e of basic) {
  const set = (id, tech, c) => {
    table[id] = { tech, color: c, saturation: e.sat };
  };
  set(e.base, 'ArmorColored', e.c);
  set(e.base + 12, 'ArmorColoredAndBlack', e.c);
  set(e.base + 31, 'ArmorColored', e.c.map((v) => v * 0.5 + 0.5));
  set(e.base + 44, 'ArmorColoredAndSilverTrim', e.c);
}

// ---- 不变量 ----
// 源文件字面 BindShader 数 = 助手体内 4（形参版，跳过）+ 数字 id 直接条
const literalBinds = (src.match(/GameShaders\.Armor\.BindShader\(/g) || []).length;
if (directCount !== literalBinds - 4) throw new Error(`BindShader 直接条 ${directCount} ≠ 字面 ${literalBinds}−4`);
// 2 参助手调用数（1007-1018 共 12 条）
if (basic.length !== 12) throw new Error(`LoadBasicColorDye 2参调用 ${basic.length} ≠ 12`);
// 抽查锚点
const anchors = {
  1007: ['ArmorColored', [1, 0, 0]],
  1018: ['ArmorColored', [1, 0.1, 0.5]],
  1031: ['ArmorColoredGradient', [1, 0, 0]],
  3558: ['ArmorBrightnessColored', [1.5, 1.5, 1.5]],
  4778: ['ArmorHallowBoss', null],
  3026: ['ArmorReflectiveColor', null],
};
for (const [id, [tech, color]] of Object.entries(anchors)) {
  const t = table[+id];
  if (!t) throw new Error(`锚点 ${id} 缺失`);
  if (t.tech !== tech) throw new Error(`锚点 ${id} 技术 ${t.tech} ≠ ${tech}`);
  if (color && JSON.stringify(t.color) !== JSON.stringify(color)) {
    throw new Error(`锚点 ${id} 色 ${JSON.stringify(t.color)} ≠ ${JSON.stringify(color)}`);
  }
}

const sorted = {};
for (const k of Object.keys(table).map(Number).sort((a, b) => a - b)) sorted[k] = table[k];

const out = {
  meta: {
    source: 'Terarria1456/Terraria.Initializers/DyeInitializer.cs',
    directBindCount: directCount,
    basicFamilyCalls: basic.length,
    entries: Object.keys(sorted).length,
  },
  dyes: sorted,
};
const json = JSON.stringify(out, null, 1) + '\n';
if (existsSync(OUT)) {
  const prev = readFileSync(OUT, 'utf8');
  if (prev === json) { console.log(`vanilla-dyes.json 已最新（${Object.keys(sorted).length} 条，幂等跳过）`); process.exit(0); }
}
writeFileSync(OUT, json);
console.log(`vanilla-dyes.json 写入 ${Object.keys(sorted).length} 条（直接 ${directCount} + 基础族展开）`);
