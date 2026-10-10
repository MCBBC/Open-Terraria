// ★五百八十四:monolith.ts AST 级域提取器(2026-10-11)
// 背景:boss-ai 线级提取三连败(花括号失衡=块跨界)——定谳=线级切片对跨边界域
// 不安全,须 AST 级。本器以 acorn 解析 esbuild 产物(monolith.ts),按 monolithMain
// 顶层语句序做【字节精确切片】(node.start/node.end),零括号失衡面。
//
// 提取面:boss-ai.ts(monolithMain #16-#26+#28-#36 npcAi 块)/ misc.ts(#27 杂域巨块)
// ——外部依赖分析=零引用(仅 sw2+块内局部),共享 helper(mouseWorld 等)零耦合。
//
// 用法:node tools/extract-calamity/extract-monolith-ast.mjs [--check]
//   --check  只做注册键奇偶校验(当前盘面 vs 重放),不落刀
//
// 纪律:提取前 monolith 必须与盘上最新一致(共享热文件禁整文件回写——本器是
// 生成器不是人工 Edit,全量重写经自验后允许);sw2→sw 重命名以 \bsw2\b 词界
// 正则做(标识符单一名,子串污染面=字符串内 "sw2" 由词界排除)。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
const require2 = createRequire(import.meta.url);
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as acorn from 'acorn';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MONO = join(root, 'mods/calamity/src/monolith.ts');
const src = readFileSync(MONO, 'utf8');
const ast = acorn.parse(src, { ecmaVersion: 2022, sourceType: 'module', allowAwaitOutsideFunction: true });

const main = ast.body.find((s) => s.type === 'FunctionDeclaration' && s.id?.name === 'monolithMain');
if (!main) throw new Error('monolithMain 不存在——盘面已变?先重跑普查');
const stmts = main.body.body;
const ALREADY_EXTRACTED = stmts.length <= 20;   // 一切后=18 语句(二切重入面)

// —— 块分类(★598 二切:重普查后 monolithMain=18 语句) ——
// 一切(已落):boss-ai=#16-#26+#28-#36 misc=#27(旧 37 语句口径)
// 二切:gen=#5-#8(registerGenPass 四块)/bgm=#9-#11(music+menuTheme+recipeGroups)/
//       summon=#13+#15(召唤物 itemUse)
const BOSS_IDX = [];
const MISC_IDX = [];
const GEN_IDX = [5, 6, 7, 8];
const BGM_IDX = [9, 10, 11];
const SUMMON_IDX = [];
const ROGUE_IDX = [4];   // ★599 三切:monolithMain=#4 BlockStatement(潜袭全域;零外部引用)
for (const i of [...BOSS_IDX, ...MISC_IDX]) {
  const s = stmts[i];
  if (!s) {
    if (ALREADY_EXTRACTED) break;   // --check 重入:索引断言仅提取时点有效
    throw new Error(`块 #${i} 不存在(语句数=${stmts.length})——盘面已变,重跑普查`);
  }
}

// —— 注册键普查器(奇偶校验用;与普查脚本同径) ——
function censusKeys(node) {
  const found = [];
  const seen = new Set();
  (function walk(n) {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression'
      && n.callee.object?.name === 'sw2' && typeof n.callee.property?.name === 'string') {
      const k = n.arguments?.[0];
      found.push(`${n.callee.property.name}|${k?.type === 'Literal' ? String(k.value) : '?'}`);
    }
    for (const kk of Object.keys(n)) {
      const v = n[kk];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  })(node);
  return found;
}

const before = [...BOSS_IDX, ...MISC_IDX].flatMap((i) => censusKeys(stmts[i])).sort();
// ★基线冻结:提取前全文件 sw2.<api>("key") 注册键多重集(--check 全量奇偶锚)
const fullCensus = (() => {
  const seen = new Set();
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object' || seen.has(n)) return;
    seen.add(n);
    if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression'
      && n.callee.object?.name === 'sw2' && typeof n.callee.property?.name === 'string') {
      const k = n.arguments?.[0];
      out.push(`${n.callee.property.name}|${k?.type === 'Literal' ? String(k.value) : '?'}`);
    }
    for (const kk of Object.keys(n)) {
      const v = n[kk];
      if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
    }
  })(ast);
  return out.sort();
})();

if (process.argv.includes('--check')) {
  // 重放校验(全量口径):monolith+boss-ai+misc 三文件的 sw(2).<api>("key")
  // 注册键多重集并与【提取前 monolith 全文件普查】比——不只验提取块,
  // 也验 monolith 改写零误伤。索引断言只对提取时点有效,--check 跳过块索引。
  const censusIn = (text, objName) => {
    const out = [];
    const seen = new Set();
    let a;
    try {
      // TS 容忍:esbuild transform 先行(全域注解面;同步 API)
      const esbuild = require2('esbuild');
      const js = esbuild.transformSync(text, { loader: 'ts', format: 'esm' }).code;
      a = acorn.parse(js, { ecmaVersion: 2022, sourceType: 'module', allowAwaitOutsideFunction: true });
    } catch (e) {
      throw new Error(`parse 失败: ${e.message}`);
    }
    (function walk(n) {
      if (!n || typeof n !== 'object' || seen.has(n)) return;
      seen.add(n);
      if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression'
        && n.callee.object?.name === objName && typeof n.callee.property?.name === 'string') {
        const k = n.arguments?.[0];
        out.push(`${n.callee.property.name}|${k?.type === 'Literal' ? String(k.value) : '?'}`);
      }
      for (const kk of Object.keys(n)) {
        const v = n[kk];
        if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
      }
    })(a);
    return out;
  };
  const baselinePath = join(root, 'tools/extract-calamity/monolith-census-baseline.json');
  const beforeAll = JSON.parse(readFileSync(baselinePath, 'utf8'));   // 提取时点冻结(重入 src=已提取面,不可当基线)
  const after = [
    ...censusIn(readFileSync(MONO, 'utf8'), 'sw2'),
    ...censusIn(readFileSync(join(root, 'mods/calamity/src/boss-ai.ts'), 'utf8'), 'sw'),
    ...censusIn(readFileSync(join(root, 'mods/calamity/src/misc.ts'), 'utf8'), 'sw'),
    ...['gen.ts', 'bgm.ts', 'summon.ts', 'rogue.ts', 'armor.ts', 'holdout.ts', 'effects.ts', 'acc-extra.ts', 'acc-procs.ts', 'psc-guardians.ts'].flatMap((f) => {
      const p2 = join(root, 'mods/calamity/src', f);
      return existsSync(p2) ? censusIn(readFileSync(p2, 'utf8'), 'sw') : [];
    }),
  ].sort();
  const same = beforeAll.length === after.length && beforeAll.every((x, i) => x === after[i]);
  console.log(`注册键全量奇偶: before=${beforeAll.length} after=${after.length} ${same ? '一致 ✓' : '漂移 ✗'}`);
  if (!same) {
    const bs = new Map();
    for (const x of beforeAll) bs.set(x, (bs.get(x) ?? 0) + 1);
    const as = new Map();
    for (const x of after) as.set(x, (as.get(x) ?? 0) + 1);
    for (const [x, n] of bs) if ((as.get(x) ?? 0) !== n) console.log(`  丢失/变 ${x}: ${n}→${as.get(x) ?? 0}`);
    for (const [x, n] of as) if (!bs.has(x)) console.log(`  多出 ${x}: ${n}`);
    process.exit(1);
  }
  process.exit(0);
}

// —— 字节切片 + sw2→sw 重命名 ——
function slice(idx) {
  const s = stmts[idx];
  return src.slice(s.start, s.end).replace(/\bsw2\b/g, 'sw');
}

// ★598 二切模式:boss/misc 已落(索引空);gen/bgm/summon 各自成文件
if (ROGUE_IDX.length) {
  const s0 = stmts[4];
  const body = src.slice(s0.start + 1, s0.end - 1).replace(/\bsw2\b/g, 'sw');
  writeFileSync(join(root, 'mods/calamity/src/rogue.ts'),
    `// 灾厄潜袭域(★599 AST 三切自 monolith #4;蓄能/潜伤/潜杀/暴击门/rogue 武器 itemUse/
// holdItem 全域——字节精确切片,sw2→sw 词界重命名)
import type { Sw } from './types';

export function setupRogue(sw: Sw) {
` + body + '\n}\n');
  const replaced = src.slice(0, s0.start) + '    setupRogue(sw2);\n  ' + src.slice(s0.end);
  const imp = "import { setupRogue } from './rogue';\n";
  const ai = replaced.indexOf('function monolithMain');
  if (ai < 0) throw new Error('monolithMain 锚丢失');
  writeFileSync(MONO, replaced.slice(0, ai) + imp + replaced.slice(ai));
  // 基线=当前全六域并集重置(多重集)
  const all = ['monolith', 'boss-ai', 'misc', 'gen', 'bgm', 'summon', 'rogue'];
  const censusAll = [];
  for (const f of all) {
    const p2 = join(root, 'mods/calamity/src', f + '.ts');
    if (!existsSync(p2)) continue;
    const isMono = f === 'monolith';
    const t = readFileSync(p2, 'utf8');
    const obj = isMono ? 'sw2' : 'sw';
    const a = acorn.parse(t.replace(/^import type .*?;$/gm, '').replace(/\(sw: Sw\)/g, '(sw)'), { ecmaVersion: 2022, sourceType: 'module', allowAwaitOutsideFunction: true });
    const seen2 = new Set();
    (function walk(n) {
      if (!n || typeof n !== 'object' || seen2.has(n)) return;
      seen2.add(n);
      if (n.type === 'CallExpression' && n.callee?.type === 'MemberExpression' && n.callee.object?.name === obj && typeof n.callee.property?.name === 'string') {
        const k = n.arguments?.[0];
        censusAll.push(`${n.callee.property.name}|${k?.type === 'Literal' ? String(k.value) : '?'}`);
      }
      for (const kk of Object.keys(n)) {
        const v = n[kk];
        if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v);
      }
    })(a);
  }
  writeFileSync(join(root, 'tools/extract-calamity/monolith-census-baseline.json'), JSON.stringify(censusAll.sort(), null, 0));
  console.log(`三切完成: rogue.ts(${(s0.end - s0.start)} 字节);monolith ${replaced.length} 字节;基线 ${censusAll.length}`);
} else if (GEN_IDX.length && !BOSS_IDX.length) {
  const mk = (name, idxs, banner) => {
    writeFileSync(join(root, 'mods/calamity/src', name),
      banner + idxs.map(slice).join('\n') + '\n}\n');
  };
  // gen 依赖三 helper(pushSchChests/placeSchematicAt/pf)=monolithMain 作用域
  // #2/#3/#4 声明——随域迁移(gen 专属;monolith 余部零引用)
  const helpers = [2, 3, 4].map(slice).join('\n');
  mk('gen.ts', GEN_IDX, `// 灾厄世界生成域(★598 AST 二切自 monolith;registerGenPass 四块——
// 硫磺海/深渊/机械棚/地牢档案/巨蜂巢/神庙——字节精确切片;三 helper 随域迁移)
import type { Sw } from './types';

export function setupGen(sw: Sw) {
` + helpers + '\n');
  mk('bgm.ts', BGM_IDX, `// 灾厄 BGM/主题/配方组域(★598 AST 二切——music+bossMusic+biomeMusic+
// menuTheme+recipeGroups;字节精确切片)
import type { Sw } from './types';

export function setupBgm(sw: Sw) {
`);
  mk('summon.ts', SUMMON_IDX, `// 灾厄召唤物域(★598 AST 二切——desert_medallion 等召唤物 itemUse;
// 字节精确切片)
import type { Sw } from './types';

export function setupSummon(sw: Sw) {
`);
  // monolith 重写:三域区间 [GEN首,BGM尾]+[SUMMON首,SUMMON尾] → 三调用
  const first = stmts[GEN_IDX[0]];
  const bgmLast = stmts[BGM_IDX[BGM_IDX.length - 1]];
  const summonFirst = stmts[SUMMON_IDX[0]];
  const summonLast = stmts[SUMMON_IDX[SUMMON_IDX.length - 1]];
  const helperFirst = stmts[2];
  let replaced = src.slice(0, helperFirst.start)
    + '    setupGen(sw2);\n    setupBgm(sw2);\n  '
    + src.slice(bgmLast.end, summonFirst.start)
    + '    setupSummon(sw2);\n  '
    + src.slice(summonLast.end);
  const imp = "import { setupGen } from './gen';\nimport { setupBgm } from './bgm';\nimport { setupSummon } from './summon';\n";
  const ai = replaced.indexOf('function monolithMain');
  if (ai < 0) throw new Error('monolithMain 锚丢失');
  writeFileSync(MONO, replaced.slice(0, ai) + imp + replaced.slice(ai));
  // 基线冻结续写(二切:读旧基线+全文件新普查→合并写回)
  const baselinePath = join(root, 'tools/extract-calamity/monolith-census-baseline.json');
  const oldBase = JSON.parse(readFileSync(baselinePath, 'utf8'));
  writeFileSync(baselinePath, JSON.stringify([...oldBase, ...fullCensus].sort(), null, 0));   // 多重集保序(禁 Set 去重)
  console.log(`二切完成: gen.ts(${GEN_IDX.length})/bgm.ts(${BGM_IDX.length})/summon.ts(${SUMMON_IDX.length});monolith ${replaced.length} 字节`);
} else {
const bossBody = BOSS_IDX.map(slice).join('\n');
const miscBody = MISC_IDX.map(slice).join('\n');

// —— 生成 boss-ai.ts ——
const banner = `// 灾厄 Boss AI 域(★五百八十四 AST 级提取自 monolith.ts;字节精确切片零失衡面)
// npcAi 家族 20 块(荒漠灾祸虫/史莱姆神/蜂巢心灵/克隆灾厄/湮灭/以太/亚龙/
// 普罗维登斯/老鲨/龙裔/驱魂者/双影/虚空/瘟疫王等)+ 兄弟召唤块。
// 注册序:与原 monolith 内联序一致(#16-#26+#28-#36;相对 #27 misc 块的次序
// 经独立性分析=per-key Map 注册+独立状态机,次序无语义面——见提取器注)。
import type { Sw } from './types';

export function setupBossAi(sw: Sw) {
`;
writeFileSync(join(root, 'mods/calamity/src/boss-ai.ts'),
  banner + bossBody + '\n}\n');

// —— 生成 misc.ts ——
const banner2 = `// 灾厄杂域(★五百八十四 AST 级提取自 monolith.ts #27;同门杂域巨块——
// accEffect/holdItem/projectileHook/system/onHitAny/canUse/itemUse/tileInteract
// 多 API 混排;字节精确切片)
import type { Sw } from './types';

export function setupMisc(sw: Sw) {
`;
writeFileSync(join(root, 'mods/calamity/src/misc.ts'),
  banner2 + miscBody + '\n}\n');

// —— 重写 monolith.ts:#16-#36 连续区间(含 #27)→ 两调用 ——
const first = stmts[16], last = stmts[36];
const replaced = src.slice(0, first.start)
  + '    setupBossAi(sw2);\n    setupMisc(sw2);\n  '
  + src.slice(last.end);
// import 行(顶部 import 区后插)
const imp = 'import { setupBossAi } from \'./boss-ai\';\nimport { setupMisc } from \'./misc\';\n';
const anchor = 'function monolithMain';
const ai = replaced.indexOf(anchor);
if (ai < 0) throw new Error('monolithMain 锚丢失');
writeFileSync(MONO, replaced.slice(0, ai) + imp + replaced.slice(ai));
}

if (BOSS_IDX.length) {
  writeFileSync(join(root, 'tools/extract-calamity/monolith-census-baseline.json'),
    JSON.stringify(fullCensus, null, 0));
  console.log(`提取完成: boss-ai.ts(${BOSS_IDX.length} 块)/ misc.ts(${MISC_IDX.length} 块);monolith 缩至 ${replaced.length} 字节;基线 census=${fullCensus.length}`);
}
console.log('下一步: node mods/calamity/build.ts && node tools/extract-calamity/extract-monolith-ast.mjs --check');
