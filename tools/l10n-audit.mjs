// l10n 键完整性审计核心（供 vite 插件 / vitest / CLI 共用）。
// 提取 src 全部 Lang.text/Lang.has 字面键，对语言包解析（LanguageManager.getTextValue
// 同语义：点路径逐段下行 + 整段键兜底）。
//
// ★清偿刀 O（2026-09-29，J-2 结构性扩闸）：原形态 = zh 单语言 + used→present 单向门。
//  运行时语义先定谳（src/i18n/LanguageManager.ts:3-7）：运行时单文件单请求加载
//  public/l10n/<cult>.json，**en 兜底在构建期完成**——build-l10n.mjs:71-74 造 enBase
//  （en 7 分片 + custom en），:87 以 [enBase, customTarget, targetShards] 序合并
//  （后者覆盖前者），故目标语言包已按 en 基线 overlay 缺失键。据此扩为：
//  ① 全 12 语言 used→present 正向闸（对构建产物包解析 = 运行时同源）；
//  ② en 兜底 overlay 合法：语言包缺键但 en 产物包能解析出真值 → 合法（记 enFallback
//    计数，防个别语言包陈旧时的假红）；连 en 都没有 → 红；
//  ③ viaEnBase 计数：产物包命中但**该语言自有源**（tools/l10n 分片 + custom）
//    解析不出 = 该语言实际显示的是 enBase overlay 值（记录计数；zh-Hans 恒 0 =
//    缺省语言全覆盖纪律，tests 层硬闸）；
//  ④ zh-Hans 裸键占位哨兵（J-1）：custom zh 值 = 键名回显（value === 键尾段/整键）
//    即裸键名英文占位，裁定白名单外一律红。
//  动态拼键（BuffDescription.${...} 等 72 键）字面正则不可见，与刀 G 哨兵头注同口径，
//  不在本闸视野（见 tests/l10n-orphan-sentinel.test.ts 头注消费模式清单）。
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLenient, flattenDeep, mergePacks, validateTable } from '../scripts/l10n-merge.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME_ROOT = join(HERE, '..');            // game/（本文件在 game/tools/ 下）
const TOOLS = join(GAME_ROOT, '..', 'tools');  // 仓库根 tools/（l10n 分片 + custom 源）

/** 12 语言清单（与 scripts/build-l10n.mjs CULTURES 同名单。不直接 import：
 *  build-l10n 顶层有构建副作用——import 即跑全量构建写产物） */
export const CULTURES = [
  'en-US', 'de-DE', 'it-IT', 'fr-FR', 'es-ES', 'ru-RU',
  'zh-Hans', 'pt-BR', 'pl-PL', 'ja-JP', 'ko-KR', 'zh-Hant',
];

const SHARDS = ['', '.Game', '.Items', '.Legacy', '.NPCs', '.Projectiles', '.Town'];

/** 收集目录下全部 .ts 文件（递归） */
function collectTs(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) collectTs(p, out);
    else if (/\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

/** 点路径解析：逐段下行，剩余段按整段键兜底（扁平合并键如 Mods."SandboxWorld.NPC.X"） */
export function resolvePackKey(tree, path) {
  const segs = path.split('.');
  let cur = tree;
  for (let i = 0; i < segs.length; i++) {
    const key = segs.slice(i).join('.');
    if (typeof cur === 'object' && cur !== null && key in cur) return cur[key];
    if (typeof cur !== 'object' || cur === null || !(segs[i] in cur)) return undefined;
    cur = cur[segs[i]];
  }
  return cur;
}

/** 提取 src 全部 Lang.text/has 字面键 + 所有 Mods.SandboxWorld.* 字面串
 *  （含经 labelKey/descKey 等间接传递后仍走 Lang.text 的自定义键）。
 *  返回 Map: key → [file:line] */
export function collectUsedKeys(srcDir) {
  const used = new Map();
  const KEY_RE = /Lang\.(?:text|has)\(\s*['"]([A-Za-z0-9_.\-]+)['"]/g;
  const CUSTOM_RE = /['"](Mods\.SandboxWorld\.[A-Za-z0-9_.\-]+)['"]/g;
  for (const f of collectTs(srcDir)) {
    const lines = readFileSync(f, 'utf8').split('\n');
    lines.forEach((line, i) => {
      for (const re of [KEY_RE, CUSTOM_RE]) {
        for (const m of line.matchAll(re)) {
          if (!used.has(m[1])) used.set(m[1], []);
          used.get(m[1]).push(`${f}:${i + 1}`);
        }
      }
    });
  }
  return used;
}

/** 单语言两腿闸（纯函数，供单测构造夹具）：
 *  腿① 对语言产物包解析（= 运行时同源，enBase 已在构建期 overlay 进包）；
 *  腿② 腿① miss → en 产物包兜底解析：命中 = 合法 enFallback（计数）；也 miss = 红。
 *  命中判定与 auditL10n 同语义：必须解析到 **string** 值（NeedTempleKey 裸键
 *  事故：{"整键":{"":"文本"}} 假类别不算命中，2026-08-14）。 */
export function gateKeys(usedKeys, pack, enPack) {
  const hit = [];
  const enFallback = [];
  const red = [];
  for (const key of usedKeys) {
    if (typeof resolvePackKey(pack, key) === 'string') { hit.push(key); continue; }
    if (typeof resolvePackKey(enPack, key) === 'string') enFallback.push(key);
    else red.push(key);
  }
  return { hit, enFallback, red };
}

/** 审计：src 全部 Lang.text/has('字面键') + 所有 Mods.SandboxWorld.* 字面串是否都在 pack 命中。
 *  单包形态（vite 插件 l10n-audit-auto 消费；全语言扩面见 auditL10nAll）。 */
export function auditL10n(srcDir, packPath) {
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  const used = collectUsedKeys(srcDir);
  const missing = [];
  for (const [key, locs] of [...used.entries()].sort()) {
    // ★命中 = 解析到 **string** 值。NeedTempleKey 裸键事故:顶层点分键被 build
    // 整键当类别 → 包里 {"整键":{"":"文本"}} 假类别,整段键兜底把假类别当命中
    // 放行——值类型必须一并断言(2026-08-14)
    const v = resolvePackKey(pack, key);
    if (typeof v !== 'string') missing.push({ key, locs: locs.slice(0, 2) });
  }
  // 形状全表扫描(类别含点/空条目键/非字符串值)
  const shape = validateTable(pack);
  return { used: used.size, missing, shape };
}

/** 该语言自有源合并包（tools/l10n/<cult> 7 分片 + tools/l10n-custom/<cult>.json，
 *  不掺 enBase——供 viaEnBase 分类：产物命中但自有源解析不出 = 实际显示 en overlay 值）。
 *  自有源内部序（custom 在分片后）只影响同键双写时的取值，不影响"是否可解析"的
 *  成员判定。分片缺文件直接 throw（加载器腐化必须炸红，不得静默归零）。 */
export function ownSourcePack(cult) {
  const packs = SHARDS.map((s) => {
    const f = join(TOOLS, 'l10n', `${cult}${s}.json`);
    if (!existsSync(f)) throw new Error(`[l10n-audit] 缺自有源分片: ${f}`);
    return parseLenient(readFileSync(f, 'utf8'));
  });
  const cf = join(TOOLS, 'l10n-custom', `${cult}.json`);
  if (existsSync(cf)) packs.push(flattenDeep(parseLenient(readFileSync(cf, 'utf8'))));
  return mergePacks(packs).out;
}

/** 全 12 语言审计（清偿刀 O J-2 收敛形态）。
 *  返回 { used, cultures, langs, redTotal, shape }：
 *  langs[cult] = { hit, red: string[], enFallback: string[], viaEnBase: string[] }；
 *  red  = 两腿全 miss（连 en 兜底都没有）→ 测试层断言全 0；
 *  enFallback = 语言包缺但 en 兜底可解析（合法，计数）；
 *  viaEnBase = 产物命中但自有源解析不出（实际显示 en overlay 值，计数）；
 *  shape = 12 语言产物 validateTable 违例聚合。 */
export function auditL10nAll(srcDir) {
  const l10nDir = join(GAME_ROOT, 'public', 'l10n');
  const used = collectUsedKeys(srcDir);
  const keys = [...used.keys()];
  const enPack = JSON.parse(readFileSync(join(l10nDir, 'en-US.json'), 'utf8'));
  const ownCache = new Map();
  const langs = {};
  let redTotal = 0;
  for (const cult of CULTURES) {
    const pf = join(l10nDir, `${cult}.json`);
    if (!existsSync(pf)) throw new Error(`[l10n-audit] 缺语言包产物: ${pf}（先跑 node scripts/build-l10n.mjs）`);
    const pack = JSON.parse(readFileSync(pf, 'utf8'));
    const g = gateKeys(keys, pack, enPack);
    // viaEnBase 分类：产物命中 ∩ 自有源解析不出
    let own = ownCache.get(cult);
    if (!own) { own = ownSourcePack(cult); ownCache.set(cult, own); }
    const viaEnBase = g.hit.filter((k) => typeof resolvePackKey(own, k) !== 'string');
    langs[cult] = { hit: g.hit.length, red: g.red, enFallback: g.enFallback, viaEnBase };
    redTotal += g.red.length;
  }
  // 形状闸：12 语言产物全表扫描（build 期同闸的产物侧复核）
  const shape = [];
  for (const cult of CULTURES) {
    for (const bad of validateTable(JSON.parse(readFileSync(join(l10nDir, `${cult}.json`), 'utf8')))) {
      shape.push(`${cult}|${bad}`);
    }
  }
  return { used: used.size, cultures: [...CULTURES], langs, redTotal, shape };
}

// ---- zh-Hans 裸键占位哨兵（清偿刀 O J-1）----
// 定谳口径：custom 值 === 键尾段 或 === 整键 → 裸键名英文占位（zh 面直显 "TouchBtnAlpha"
// 这类键名回显）。注意 value===键尾段 对 en 面无意义（"Reload"="Reload" 是正当英文文案），
// 故只闸 zh-Hans（缺省语言，DEFAULT_LANG，全覆盖纪律面）。
//
// 全量普查（2026-09-29，含六键修复后余量）恰 9 键，逐键裁定：
//  · 债面 5 键（真占位）——清偿刀 S（2026-09-29）已补译并摘除白名单条目：
//    Settings.HudScaleFactor→"HUD 缩放"、Settings.CatTouch→"触控"、
//    Farewell.Hint→"世界仍保存在本地。"/Reload→"重新载入"/Title→"下次再见"
//    （Farewell 三键为 src/mainFlow.ts:1806-1812 退出告别幕布活键）。
//    摘除后若值回退占位形态，本闸白名单外命中即红（stale 自净闸的反向面）。
//  · 有意保留 4 键（en 同文镜像/品牌名，非占位腐化）：
//    Settings.On/Off（en-identical 开关文案）、TitleLinks.Bluesky（品牌名）、
//    UI.Dash（原版键 en 镜像覆写块成员，11 语言 custom 同步同值，src 无字面消费）。
const ZH_PLACEHOLDER_ALLOWLIST = [
  // 有意保留（长期条目）
  'Mods.SandboxWorld.Settings.On',
  'Mods.SandboxWorld.Settings.Off',
  'TitleLinks.Bluesky',
  'UI.Dash',
];

/** zh-Hans custom 裸键占位检测。
 *  返回 { flagged: 全部命中键, violations: 白名单外命中, stale: 白名单失效条目
 *  （键已不在 custom 或已不再是占位形态——补译后须同步摘白名单条目） } */
export function zhBarePlaceholderAudit() {
  const f = join(TOOLS, 'l10n-custom', 'zh-Hans.json');
  const flat = flattenDeep(parseLenient(readFileSync(f, 'utf8')));
  const flagged = [];
  for (const [cat, entries] of Object.entries(flat)) {
    for (const [k, v] of Object.entries(entries)) {
      const full = `${cat}.${k}`;
      if (typeof v === 'string' && v !== '' && (v === full || v === k || v === k.split('.').pop())) {
        flagged.push(full);
      }
    }
  }
  const violations = flagged.filter((k) => !ZH_PLACEHOLDER_ALLOWLIST.includes(k));
  const stale = ZH_PLACEHOLDER_ALLOWLIST.filter((k) => !flagged.includes(k));
  return { flagged, violations, stale };
}
