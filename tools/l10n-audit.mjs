// l10n 键完整性审计核心（供 vite 插件 / vitest / CLI 共用）。
// 提取 src 全部 Lang.text/Lang.has 字面键，对语言包解析（LanguageManager.getTextValue
// 同语义：点路径逐段下行 + 整段键兜底）。
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validateTable } from '../scripts/l10n-merge.mjs';

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

/** 审计：src 全部 Lang.text/has('字面键') + 所有 Mods.SandboxWorld.* 字面串
 *  （含经 labelKey/descKey 等间接传递后仍走 Lang.text 的自定义键）是否都在 pack 命中 */
export function auditL10n(srcDir, packPath) {
  const pack = JSON.parse(readFileSync(packPath, 'utf8'));
  const used = new Map(); // key → [file:line]
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
