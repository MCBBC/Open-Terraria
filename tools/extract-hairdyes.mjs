// 发色剂表提取器（DyeInitializer.cs LoadHairDyes/LoadLegacyHairdyes →
// src/data/vanilla-hairdyes.json）。
//
// 数据 1:1：GameShaders.Hair.BindShader(itemId, shaderData) 按【执行序】分配
// shaderId（HairShaderDataSet.BindShader:22 `++_shaderDataCount`，首条=1）。
// 执行序 = LoadHairDyes(:143-148) 先调 LoadLegacyHairdyes(:146) 再绑 3259(:147)：
//   legacy 11 条（1977-1986 + 2863）→ shaderId 1-11；3259 暮光 → 12。
// 物品侧判定（Item.cs）：ResetStats 置 hairDye=-1(:48559) → SetDefaultsN 后
//   `if (hairDye != 0) hairDye = Hair.GetShaderIdFromItemId(type)`(:48320-48322)
//   → 未绑定物品得 -1、发色剂得 1-12；case 1990 显式 hairDye=0(:21275) 跳过查表
//   → 1990 去除剂 hairDye=0。使用链 Player.cs:42179-42186 `item.hairDye >= 0`
//   即 1990 也在内（使用 → player.hairDye=0 = 清除）。
// 存档：Player.cs:53805-53808 hair 后写 byte、:54214-54216 release≥82 读。
//
// 不变量：legacy 绑定 11 条 + twilight 1 条 = 12；shaderId 1..12 无重复；
//   1977-1986 连续段门 + case 1990 标记 + Item.cs 尾钩三锚点逐字校验。
// 用法：node tools/extract-hairdyes.mjs [--audit]（幂等：输出稳定排序键；
//   --audit 只打印 JSON 摘要不落盘）
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = join(here, '..');
const DYE_CS = join(ROOT, '..', 'Terarria1456', 'Terraria.Initializers', 'DyeInitializer.cs');
const ITEM_CS = join(ROOT, '..', 'Terarria1456', 'Terraria', 'Item.cs');
const OUT = join(ROOT, 'src', 'data', 'vanilla-hairdyes.json');

const audit = process.argv.includes('--audit');
const dye = readFileSync(DYE_CS, 'utf8');
const item = readFileSync(ITEM_CS, 'utf8');
const anomalies = [];

const lineOf = (text, needle) => {
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) if (lines[i].includes(needle)) return i + 1;
  return -1;
};

/** 切出方法体（`private static void NAME(` 起到下一个 `private static void` 前） */
function methodBody(src, name) {
  const start = src.indexOf(`private static void ${name}(`);
  if (start < 0) return null;
  const next = src.indexOf('\tprivate static void ', start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

/** 方法体内按源序收集 Hair.BindShader 的 itemId + 行号 + 数据类 */
function collectBinds(body, baseOffset) {
  const out = [];
  const re = /GameShaders\.Hair\.BindShader\(\s*(\d+)\s*,\s*new\s+(\w+)\(/g;
  let m;
  while ((m = re.exec(body))) {
    const before = body.slice(0, m.index);
    // 1 基行号：声明行起算 -1（before 以声明行残段开头，split 多出一段）
    out.push({
      itemId: +m[1],
      cls: m[2],
      line: baseOffset + before.split('\n').length - 1,
    });
  }
  return out;
}

const dyeLines = dye.split('\n');
const legacyBody = methodBody(dye, 'LoadLegacyHairdyes');
const hairBody = methodBody(dye, 'LoadHairDyes');
if (!legacyBody || !hairBody) throw new Error('LoadHairDyes/LoadLegacyHairdyes 方法体缺失');
const legacyOffset = dyeLines.findIndex((l) => l.includes('private static void LoadLegacyHairdyes(')) + 1;
const hairOffset = dyeLines.findIndex((l) => l.includes('private static void LoadHairDyes(')) + 1;

// 执行序：LoadLegacyHairdyes 全部条目（源序）→ LoadHairDyes 本体的 Bind（3259，:147）。
// LoadLegacyHairdyes 方法体【嵌在 LoadHairDyes 之后定义】——区分依据 = 行号：
// < legacyOffset（:150）的条目属于 LoadHairDyes 本体
const legacyBinds = collectBinds(legacyBody, legacyOffset);
const directBinds = collectBinds(hairBody, hairOffset).filter((b) => b.line < legacyOffset);

const ordered = [...legacyBinds, ...directBinds];
const table = {};
ordered.forEach((b, i) => {
  table[String(b.itemId)] = {
    shaderId: i + 1,
    kind: b.cls === 'LegacyHairShaderData' ? 'legacy' : b.cls === 'TwilightHairDyeShaderData' ? 'twilight' : b.cls,
    bindLine: b.line,
  };
});

// ---- 物品侧锚点（Item.cs）逐字校验 ----
const anchors = {
  rangeGate: ['\t\tif (type >= 1977 && type <= 1986)', 21210],
  removerCase: ['\t\tcase 1990:', 21267],
  removerMarker: ['\t\t\thairDye = 0;', 21275],
  tailHook: ['\t\t\thairDye = GameShaders.Hair.GetShaderIdFromItemId(type);', 48322],
  reset: ['\t\thairDye = -1;', 48559],
};
for (const [k, [needle, expect]] of Object.entries(anchors)) {
  const got = lineOf(item, needle);
  if (got !== expect) anomalies.push(`Item.cs 锚点 ${k} 行 ${got} ≠ ${expect}`);
}
// 1977-1986 十连：发色剂族恰好覆盖该连续段
for (let id = 1977; id <= 1986; id++) {
  if (!table[String(id)]) anomalies.push(`物品 ${id} 缺失（1977-1986 连续段）`);
}
// 三个散件：2863 火星 / 3259 暮光 / 1990 去除剂（1990 不绑 shader，hairDye=0）
for (const id of [2863, 3259]) {
  if (!table[String(id)]) anomalies.push(`物品 ${id} 缺失`);
}
// shaderId 唯一且 1..N
const ids = Object.values(table).map((e) => e.shaderId).sort((a, b) => a - b);
if (ids.join(',') !== Array.from({ length: ids.length }, (_, i) => i + 1).join(',')) {
  anomalies.push(`shaderId 非连续 1..N：${ids.join(',')}`);
}
// 钉死抽查（防源码漂移/解析错位）
const pinned = {
  1977: { shaderId: 1, kind: 'legacy' },   // LifeHairDye 首绑
  1980: { shaderId: 4, kind: 'legacy' },   // MoneyHairDye（buyPrice 段最长）
  2863: { shaderId: 11, kind: 'legacy' },  // MartianHairDye legacy 末条
  3259: { shaderId: 12, kind: 'twilight' }, // TwilightHairDyeShaderData 唯一非 legacy
};
for (const [id, want] of Object.entries(pinned)) {
  const got = table[id];
  if (!got || got.shaderId !== want.shaderId || got.kind !== want.kind) {
    anomalies.push(`钉死 ${id} 期望 ${JSON.stringify(want)} 实得 ${JSON.stringify(got)}`);
  }
}

const out = {
  meta: {
    source: 'Terarria1456/Terraria.Initializers/DyeInitializer.cs',
    itemSource: 'Terarria1456/Terraria/Item.cs',
    bindCount: ordered.length,
    legacyCount: legacyBinds.length,
    /** 发色剂去除剂（Item.cs:21275 hairDye=0 → Item.hairDye=0；使用即清 player.hairDye） */
    removerItem: 1990,
    entries: Object.keys(table).length,
    anchors: { loadHairDyes: 143, loadLegacyHairdyes: 150, twilightBind: 147 },
  },
  hairDyes: table,
};

if (audit) {
  process.stdout.write(JSON.stringify({ entries: out.meta.entries, bindCount: out.meta.bindCount, anomalies, pinned: table['1977'] && { '1977': table['1977'], '3259': table['3259'] } }) + '\n');
  process.exit(anomalies.length ? 1 : 0);
}
if (anomalies.length) {
  for (const a of anomalies) console.error(`ANOMALY: ${a}`);
  throw new Error(`锚点校验失败 ${anomalies.length} 处，拒绝写入`);
}

const sorted = {};
for (const k of Object.keys(table).map(Number).sort((a, b) => a - b)) sorted[k] = table[k];
out.hairDyes = sorted;
const json = JSON.stringify(out, null, 1) + '\n';
if (existsSync(OUT)) {
  const prev = readFileSync(OUT, 'utf8');
  if (prev === json) { console.log(`vanilla-hairdyes.json 已最新（${Object.keys(sorted).length} 条，幂等跳过）`); process.exit(0); }
}
writeFileSync(OUT, json);
console.log(`vanilla-hairdyes.json 写入 ${Object.keys(sorted).length} 条（shaderId 1..${Object.keys(sorted).length}）`);
