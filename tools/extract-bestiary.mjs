// 图鉴排序/稀有度静态表提取（1.4.5.6 = Terarria1456）→ src/data/vanilla-bestiary.json。
//   - NPCID.cs Sets 三张优先级表（GetSortedBestiaryEntriesList orderby 链的键，ContentSamples.cs:745-753）：
//       TownNPCBestiaryPriority            :4427
//       NormalGoldCritterBestiaryPriority  :4407
//       BossBestiaryPriority               :4416
//   - ContentSamples.cs FillNpcRarities 显式覆盖表（:1084-1220，循环公式算完后再覆写，
//     城镇 NPC 钳 1-3 / Boss 钳 4-5）→ rarityStarOverrides
//   - npcStats：逐 NPC 投影（rarity/boss/damage/defense/lifeMax/aiStyle 六元组）——
//     FillNpcRarities（:1072-1083）对每个 id 实例化 NPC 后 SetDefaults(i, Classic)
//     再读这些字段算星数；CreateBestiarySortingIds 的键 7/8（aiStyle/战力）同源
//     （NpcsByNetId = SetDefaults(i)，Main.Difficulty=Classic 时 ScaleStats 乘数恒 1）。
//     取值 = 1456 SetDefaults type 链求值：
//       · 链内嵌套 if（type == / num2 == 逐 id 分支、switch (type) case、else-if 链）
//         按精确 id 求值（骷髅 305-314 逐档三围、史莱姆王护卫 525-527 += 增量、
//         金蝴蝶 601/金蜻蜓 605/金龟 613/金鼠 627 rarity=3 都在这里）
//       · 世界态旗标在 ContentSamples.Initialize 时全为默认：Main.hardMode/remixWorld/
//         getGoodWorld/expertMode/masterMode/zenithWorld/tenthAnniversaryWorld/downedGolemBoss/
//         downedMechBossAny = false（!Main.hardMode 反之为真——85 独角兽 / 629 冰冻傀儡
//         的肉前三围 30/12/300 即由此段生效，与原版读数一致）
//       · 负 netID 变体走 SetDefaultsFromNetId（:7633+）：damage/defense(/rarity) 按 case
//         覆写，lifeMax/aiStyle/boss 取母体（NetIdMap :10445；case 内 `life =` 是当前
//         生命值不改 lifeMax）
//       · 5 个无独立链分支的 id（76/146/403/404/408）全部在 NPCBestiaryDrawOffset Hide 表
//         中（不进图鉴），按零值登记不影响任何消费方
//     注意：src/data/bestiaryStatics.generated.ts 头注亦署名本脚本，但其原始生成逻辑已
//     遗失（本仓仅存产物）；本脚本**不**重写该文件，只产出本 JSON。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

const npcid = read('Terarria1456/Terraria.ID/NPCID.cs');
const npccs = read('Terarria1456/Terraria/NPC.cs');
const samples = read('Terarria1456/Terraria.ID/ContentSamples.cs');

/** `public static List<int> NAME = new List<int> { ... };` 数字表 */
function intList(src, name) {
  const m = src.match(new RegExp(`public static List<int> ${name} = new List<int>\\s*\\{([\\s\\S]*?)\\};`));
  if (!m) throw new Error(`list ${name} not found`);
  return m[1].split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
}

/** ContentSamples.FillNpcRarities 显式覆盖（`NpcBestiaryRarityStars[id] = N;`） */
function rarityStarOverrides(src) {
  const m = src.match(/private static void FillNpcRarities\(\)([\s\S]*?)private static int GetNPCBestiaryRarityStarsCount/);
  if (!m) throw new Error('FillNpcRarities not found');
  const out = {};
  for (const hit of m[1].matchAll(/NpcBestiaryRarityStars\[(-?\d+)\] = (\d+);/g)) {
    out[hit[1]] = parseInt(hit[2], 10);
  }
  return out;
}

// ============ SetDefaults type 链求值 → npcStats 投影 ============

const TARGET_FIELDS = ['rarity', 'boss', 'damage', 'defense', 'lifeMax', 'aiStyle'];

/** 把 SetDefaults 方法体解析成 if/else-if/else/switch 语句树。
 *  ilspy 风格：控制头与 `{` 常分行；节点 opened 旗标记"体括号已消费"，避免占位块多吃一层。 */
function parseStatementTree(text) {
  const lines = text.split('\n');
  const root = { kind: 'block', children: [] };
  const stack = [root];
  const skipped = [];
  const attach = (node) => {
    const parent = stack[stack.length - 1];
    parent.children.push(node);
    stack.push(node);
  };
  for (const raw of lines) {
    const s = raw.trim();
    if (!s) continue;
    if (s === '}') {
      // switch 收尾：最后一个 case 无显式闭合，`}` 先终结 case 再关 switch
      const top = stack[stack.length - 1];
      if (top?.kind === 'case') stack.pop();
      if (stack.length > 1) stack.pop();
      continue;
    }
    if (s === '{') {
      const top = stack[stack.length - 1];
      if (top && (top.kind === 'if' || top.kind === 'switch' || top.kind === 'case') && !top.opened) {
        top.opened = true;          // 控制头自己的体括号
        continue;
      }
      attach({ kind: 'block', children: [] });
      continue;
    }
    if (s.startsWith('case ') || s === 'default:' || s === 'default') {
      const top = stack[stack.length - 1];
      if (top?.kind === 'case') stack.pop();   // 新标签终结上一 case
      const sw = [...stack].reverse().find((n) => n.kind === 'switch');
      if (!sw) { skipped.push(s); continue; }
      const node = { kind: 'case', label: s, children: [], opened: true };
      sw.cases.push(node);
      stack.push(node);
      continue;
    }
    const head = s.endsWith('{') ? s.slice(0, -1).trim() : s;
    const hm = head.match(/^(else if|if|switch)\s*\((.*)\)$/) ?? (head === 'else' ? ['else', 'else', null] : null);
    if (hm) {
      const [, kw, condRaw] = hm;
      const node = { kind: 'if', cond: condRaw ?? null, children: [], opened: s.endsWith('{') };
      if (kw === 'else if' || kw === 'else') {
        // 归属 = 当前栈顶节点的最后一个孩子（嵌套 if 的 else-if 链与顶层链同构）
        const owner = stack[stack.length - 1];
        const last = owner?.children[owner.children.length - 1];
        if (last?.kind === 'if') {
          if (kw === 'else if') { last.elif = last.elif ?? []; last.elif.push(node); }
          else last.els = node;
          stack.push(node);
        } else skipped.push(head);
      } else {
        attach(kw === 'if'
          ? node
          : { kind: 'switch', cond: condRaw, cases: [], opened: s.endsWith('{') });
      }
      continue;
    }
    if (s.endsWith('{')) { attach({ kind: 'block', children: [] }); continue; }  // 非控制流初始化块
    stack[stack.length - 1].children.push(s);
  }
  if (skipped.length) console.error('parse skipped:', skipped.length, '处：', [...new Set(skipped)].slice(0, 5));
  return root;
}

/** 条件静态求值：type/Type/numN → id；其余标识（世界态旗标/参数/纹理探测/数组长度）在
 *  ContentSamples.Initialize 语境下一律取 0（布尔假）——全部登记进 COND_ZEROS 供审计，
 *  构建时人工核对无"门控目标字段赋值"的漏判 */
const COND_ZEROS = new Map(); // 标识 → 出现次数
function evalCond(cond, id) {
  if (cond === null) return true;
  let expr = cond;
  expr = expr.replace(/\bNPCID\.Count\b/g, '697');
  expr = expr.replace(/\b(type|Type|num\d+)\b/g, String(id));
  expr = expr.replace(/\[[^\]]*\]/g, '');                  // 下标表达式整段抹除
  // 方法调用（TryGetValue/HasValue/Width 等）连实参表一并抹为 0（循环处理嵌套）
  for (let k = 0; k < 4; k++) {
    expr = expr.replace(/\b[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*\s*\((?:[^()]*)\)/g, '0');
  }
  expr = expr.replace(/\b(?:Main|spawnparams|TextureAssets|NPCID|GameDifficultyData|WorldGen)\.[\w.]*/g, '0');
  expr = expr.replace(/\b(null|true|false|out|var)\b/g, '0');
  expr = expr.replace(/\b[A-Za-z_]\w*(?:\.\w+)*\b/g, (m) => {
    COND_ZEROS.set(m, (COND_ZEROS.get(m) ?? 0) + 1);
    return '0';
  });
  if (!/^[\s\d!=&|()<>!,]+$/.test(expr)) throw new Error(`unresolvable condition: ${cond}`);
  // eslint-disable-next-line no-new-func
  return Function(`"use strict";return (${expr});`)();
}

/** 对一个 id 跑完整 SetDefaults 语句树，收集目标字段终值 */
function evalForId(root, id) {
  const state = { damage: 0, defense: 0, lifeMax: 0, aiStyle: 0, rarity: 0, boss: false };
  const exprAssigns = [];
  const runStmts = (nodes) => {
    for (const n of nodes) {
      if (typeof n === 'string') {
        const m = n.match(/^(\w+)\s*(\+=|-=|=)\s*([^;]+);$/);
        if (!m) continue;
        const [, field, op, raw] = m;
        if (!(field in state)) continue;
        const v = raw.trim();
        if (/^-?\d+$/.test(v)) {
          const num = parseInt(v, 10);
          if (op === '=') state[field] = num;
          else state[field] += op === '+=' ? num : -num;
        } else if (field === 'boss' && (v === 'true' || v === 'false')) {
          state.boss = v === 'true';
        } else {
          exprAssigns.push(`${field} ${op} ${v}`);
        }
        continue;
      }
      if (n.kind === 'if') {
        if (evalCond(n.cond, id)) { runStmts(n.children); continue; }
        let taken = false;
        for (const e of n.elif ?? []) {
          if (evalCond(e.cond, id)) { runStmts(e.children); taken = true; break; }
        }
        if (!taken && n.els) runStmts(n.els.children);
        continue;
      }
      if (n.kind === 'switch') {
        for (const c of n.cases) {
          const ids = [...c.label.matchAll(/case\s+(-?\d+)\s*:/g)].map((x) => parseInt(x[1], 10));
          if (c.label.startsWith('default') || ids.includes(id)) runStmts(c.children);
        }
      }
    }
  };
  runStmts(root.children);
  return { state, exprAssigns };
}

function buildNpcStats(npccsSrc, npcidSrc) {
  const start = npccsSrc.indexOf('public void SetDefaults(int Type');
  if (start < 0) throw new Error('SetDefaults not found');
  const openIdx = npccsSrc.indexOf('{', start);
  let depth = 0, end = -1;
  for (let i = openIdx; i < npccsSrc.length; i++) {
    if (npccsSrc[i] === '{') depth++;
    else if (npccsSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const tree = parseStatementTree(npccsSrc.slice(openIdx + 1, end));
  const out = {};
  const exprTotal = new Map();
  const NPC_COUNT = 697;   // NPCID.cs:12459 Count
  for (let id = 1; id < NPC_COUNT; id++) {
    const { state, exprAssigns } = evalForId(tree, id);
    out[id] = [state.rarity, state.boss ? 1 : 0, state.damage, state.defense, state.lifeMax, state.aiStyle];
    for (const e of exprAssigns) exprTotal.set(e, (exprTotal.get(e) ?? 0) + 1);
  }
  if (exprTotal.size) console.error('非字面量目标字段赋值（按 0/前值计）:', [...exprTotal].map(([k, n]) => `${n}× ${k}`));
  console.error('条件求值取 0 的标识（审计）:', [...COND_ZEROS.entries()].map(([k, n]) => `${n}× ${k}`).join(', '));

  // ---- 负 netID 变体（SetDefaultsFromNetId :7633+）----
  // 流程 = SetDefaults(0) → SetDefaults_ForNetId(母体) → case 体覆写 damage/defense(/rarity)。
  // lifeMax/aiStyle/boss 取母体（case 里的 `life = N` 是当前生命值字段，不改 lifeMax）。
  // 母体映射 = NetIdMap[-id-1]（NPCID.cs:10445，65 项）。
  const netIdMap = [...npcidSrc.match(/NetIdMap = new int\[65\]\s*\{([\s\S]*?)\n\t\};/)[1].matchAll(/\d+/g)]
    .map((x) => parseInt(x[0], 10));
  if (netIdMap.length !== 65) throw new Error(`NetIdMap 长度异常: ${netIdMap.length}`);
  const sdniStart = npccsSrc.indexOf('private void SetDefaultsFromNetId');
  const sdniOpen = npccsSrc.indexOf('{', sdniStart);
  depth = 0; end = -1;
  for (let i = sdniOpen; i < npccsSrc.length; i++) {
    if (npccsSrc[i] === '{') depth++;
    else if (npccsSrc[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  const sdniTree = parseStatementTree(npccsSrc.slice(sdniOpen + 1, end));
  const overrides = {};   // id(-N) → { damage?, defense?, rarity? }
  const collectCases = (nodes) => {
    for (const n of nodes) {
      if (typeof n === 'string') continue;
      if (n.kind === 'switch') {
        for (const c of n.cases) {
          const ids = [...c.label.matchAll(/case\s+(-\d+)\s*:/g)].map((x) => parseInt(x[1], 10));
          for (const cid of ids) {
            const ov = {};
            for (const st of c.children) {
              const m2 = String(st).match(/^(damage|defense|rarity)\s*=\s*(-?\d+);$/);
              if (m2) ov[m2[1]] = parseInt(m2[2], 10);
            }
            overrides[cid] = ov;
          }
        }
      }
      if (n.children) collectCases(n.children);
      if (n.elif) collectCases(n.elif);
      if (n.els?.children) collectCases(n.els.children);
    }
  };
  collectCases(sdniTree.children);
  let nNeg = 0;
  for (let id = -65; id <= -1; id++) {
    const base = out[netIdMap[-id - 1]];
    if (!base) throw new Error(`netId ${id} 母体缺失`);
    const ov = overrides[id] ?? {};
    out[id] = [ov.rarity ?? base[0], base[1], ov.damage ?? base[2], ov.defense ?? base[3], base[4], base[5]];
    nNeg++;
  }
  console.error(`负 netID 变体: ${nNeg} 条（case 覆写 ${Object.keys(overrides).length} 条）`);
  return out;
}

const data = {
  townNpcBestiaryPriority: intList(npcid, 'TownNPCBestiaryPriority'),
  normalGoldCritterBestiaryPriority: intList(npcid, 'NormalGoldCritterBestiaryPriority'),
  bossBestiaryPriority: intList(npcid, 'BossBestiaryPriority'),
  rarityStarOverrides: rarityStarOverrides(samples),
  npcStats: buildNpcStats(npccs, npcid),
};

writeFileSync(`${ROOT}/game/src/data/vanilla-bestiary.json`, JSON.stringify(data));
for (const [k, v] of Object.entries(data)) {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  console.error(`${k}: ${n} 条`);
}
