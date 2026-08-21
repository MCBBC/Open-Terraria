// 三方对账:game/src/data/vanilla-item*.json × Item.cs(1456) × Item.cs(1457)。
// 1.4.5.7 是数值补丁:Item.cs SetDefaults1-5 共 54 条数值/字段变化(docs/diff-1456-1457-full-report.md
// "Item.cs 行为差异清单"),本脚本把 1457 终值对进数据并常驻化为闸门。
//
// 覆盖面(与提取器同源,防"闸门与修复器两套逻辑漂移"):
//   vanilla-itemcombat.json  ← tools/extract-itemcombat.mjs(SW_ITEM_VER 双实例)
//   vanilla-itemrare.json / vanilla-itemvalue.json ← tools/extract-itemrare.mjs(同上)
//   vanilla-itemstats.json(def/life 两字段) ← 本文件内嵌 case 段扫描(与 extract-equip-prefix.mjs
//     的 outerCaseSegments/resolveCaseField 同法——该文件是多产物顶层脚本不宜参数化)
//   vanilla-whips.json(dmg/proj/kb/speed) ← DefaultToWhip(...) 形参直读
//
// 用法:node tools/recon-item-1456-1457.mjs           (只读对账,stdout 三类清单)
//      node tools/recon-item-1456-1457.mjs --fix    (把 json 对齐 1457 终值,先备份 /tmp/recon-item/)
// 库模式:export function recon()(tests/item-stats-golden-1457.test.ts 导入)
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TOOL = join(ROOT, 'game', 'tools');

// ---- 双版本提取器实例(子进程 --dump:提取器顶层执行读 SW_ITEM_VER,而 vitest 的
//      模块运行器按路径缓存忽略 query-string,库模式双实例不可靠——子进程各带 env 最稳) ----
function loadExtractor(rel, ver) {
  const out = execFileSync(process.execPath, [join(TOOL, rel), '--dump'], {
    env: { ...process.env, SW_ITEM_VER: ver },
    maxBuffer: 256 * 1024 * 1024,
  });
  const parsed = JSON.parse(out.toString('utf8'));
  if (parsed.src !== ver) throw new Error(`${rel}: 请求 ${ver} 实得 ${parsed.src}(env 未生效)`);
  return parsed;
}

// ---- case 段扫描(纯函数,与 tools/extract-equip-prefix.mjs 同法同注释;该文件多产物
//      顶层写盘不宜参数化,故按同法内嵌——语义漂移由闸门锚点值兜底) ----
function methodBodyOf(src, name) {
  const idx = src.indexOf(name);
  if (idx < 0) return '';
  const start = src.indexOf('{', idx);
  let depth = 0;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start + 1, i); }
  }
  return '';
}

/** case 段 → itemId: segmentSource(nested switch(type) 标签归属内层;fall-through 组全标签共享) */
function outerCaseSegments(src) {
  const out = new Map();
  const collect = (body) => {
    const tokRe = /switch\s*\(([^)]*)\)|case (\d+):|default:|[{}]/g;
    const stack = [];
    let depth = 0;
    let m;
    while ((m = tokRe.exec(body))) {
      const t = m[0];
      if (t.startsWith('switch')) {
        stack.push({ isType: /switch\s*\(\s*type\b/.test(t), opened: false, bodyDepth: -1, labels: [], segStart: 0 });
      } else if (t === '{') {
        depth++;
        const top = stack[stack.length - 1];
        if (top && !top.opened) { top.opened = true; top.bodyDepth = depth; top.segStart = m.index + 1; }
      } else if (t === '}') {
        const top = stack[stack.length - 1];
        if (top && top.opened && depth === top.bodyDepth) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') for (const id of top.labels) out.set(id, seg);
          stack.pop();
        }
        depth--;
      } else {
        const top = stack[stack.length - 1];
        if (top && top.opened && top.isType) {
          const seg = body.slice(top.segStart, m.index);
          if (seg.trim() !== '') { for (const id of top.labels) out.set(id, seg); top.labels = []; }
          if (t !== 'default:') top.labels.push(+m[2]);
          top.segStart = m.index + t.length;
        }
      }
    }
  };
  for (const n of [1, 2, 3, 4, 5]) {
    const body = methodBodyOf(src, `void SetDefaults${n}(`);
    if (body) collect(body);
  }
  return out;
}

function typeSwitchSpans(seg) {
  const spans = [];
  const re = /switch\s*\(\s*type\s*\)/g;
  let m;
  while ((m = re.exec(seg))) {
    const brace = seg.indexOf('{', m.index + m[0].length);
    if (brace < 0) break;
    let d = 0, end = -1;
    for (let i = brace; i < seg.length; i++) {
      if (seg[i] === '{') d++;
      else if (seg[i] === '}') { d--; if (d === 0) { end = i; break; } }
    }
    if (end < 0) break;
    spans.push([m.index, end + 1]);
    re.lastIndex = end + 1;
  }
  return spans;
}

function parseSwitchCases(swBody) {
  const cases = new Map();
  let def = null;
  const tokRe = /case (\d+):|default:|[{}]/g;
  let depth = 0, segStart = 0, m;
  let pending = [];
  const flush = (endIdx) => {
    const body = swBody.slice(segStart, endIdx);
    if (body.trim() === '') return;
    for (const L of pending) {
      if (L === 'def') def = body; else cases.set(L, body);
    }
    pending = [];
  };
  while ((m = tokRe.exec(swBody))) {
    const t = m[0];
    if (t.startsWith('case') || t === 'default:') {
      if (depth === 0) {
        flush(m.index);
        pending.push(t === 'default:' ? 'def' : +m[1]);
        segStart = m.index + t.length;
      }
    } else if (t === '{') depth++;
    else if (t === '}') depth--;
  }
  flush(swBody.length);
  return { cases, def };
}

/** 段 → 外层余体 + 嵌套 switch(type) 命中分支拼接(C# 顺序执行,后段覆盖先段) */
function caseParts(seg, id) {
  const spans = typeSwitchSpans(seg);
  const parts = [];
  let last = 0;
  for (const [s, e] of spans) {
    parts.push(seg.slice(last, s));
    const brace = seg.indexOf('{', s);
    const { cases, def } = parseSwitchCases(seg.slice(brace + 1, e - 1));
    parts.push(cases.has(id) ? cases.get(id) : (def ?? ''));
    last = e;
  }
  parts.push(seg.slice(last));
  return parts;
}

/** 字段按 id 求值:段内取首匹配(条件重赋值只在改写语境生效,首值=常观数值) */
function resolveCaseField(seg, pattern, id) {
  let val;
  for (const p of caseParts(seg, id)) {
    const m = p.match(new RegExp(pattern));
    if (m) val = m[1] !== undefined ? +m[1] : 1;
  }
  return val;
}

/** DefaultToWhip(projectileId, dmg, kb, shootspeed[, animationTotalTime=30]) 形参直读 */
function whipCallOf(seg) {
  const m = seg.match(/DefaultToWhip\((\d+),\s*(-?\d+),\s*(-?[\d.]+)f,\s*(-?[\d.]+)f(?:,\s*(\d+))?\)/);
  if (!m) return null;
  return { proj: +m[1], dmg: +m[2], kb: parseFloat(m[3]), speed: parseFloat(m[4]), anim: m[5] ? +m[5] : 30 };
}

function scanStats(src) {
  const segs = outerCaseSegments(src);
  const def = new Map();
  const life = new Map();
  const whip = new Map();
  const healMana = new Map();
  for (const [id, seg] of segs) {
    const d = resolveCaseField(seg, '\\bdefense\\s*=\\s*(\\d+);', id);
    if (d !== undefined) def.set(id, d);
    const l = resolveCaseField(seg, '\\blifeRegen\\s*=\\s*(\\d+);', id);
    if (l !== undefined) life.set(id, l);
    const w = whipCallOf(seg);
    if (w) whip.set(id, w);
    const hm = resolveCaseField(seg, '\\bhealMana\\s*=\\s*(\\d+);', id);
    if (hm !== undefined) healMana.set(id, hm);
  }
  return { def, life, whip, healMana };
}

// ---- 对账主体 ----
export async function recon() {
  const c56 = loadExtractor('extract-itemcombat.mjs', '1456');
  const c57 = loadExtractor('extract-itemcombat.mjs', '1457');
  const r56 = loadExtractor('extract-itemrare.mjs', '1456');
  const r57 = loadExtractor('extract-itemrare.mjs', '1457');
  const src56 = readFileSync(join(ROOT, 'Terarria1456/Terraria/Item.cs'), 'utf8');
  const src57 = readFileSync(join(ROOT, 'Terarria1457/Terraria/Item.cs'), 'utf8');
  const s56 = scanStats(src56);
  const s57 = scanStats(src57);
  // 弹幕面(Projectile.cs SetDefaults else-if 链;extract-projectiles.mjs 同源 dump)
  const p56 = loadExtractor('extract-projectiles.mjs', '1456').projectiles;
  const p57 = loadExtractor('extract-projectiles.mjs', '1457').projectiles;

  const J = (p) => JSON.parse(readFileSync(join(ROOT, 'game/src/data', p), 'utf8'));
  const json = {
    combat: J('vanilla-itemcombat.json'),
    rare: J('vanilla-itemrare.json'),
    value: J('vanilla-itemvalue.json'),
    stats: J('vanilla-itemstats.json'),
    whips: J('vanilla-whips.json'),
    func: J('vanilla-itemfunc.json'),
    proj: J('vanilla-projectiles.json'),
  };

  // 字段面:file → Map(id → {field: 1457值})(undefined = 1457 删除该字段)
  // 来源:combat/rare/value 用提取器全量;stats 只取 def/life(其余字段属 extract-equip-prefix 面);
  //       whips 取 DefaultToWhip 形参(dmg/proj/kb/speed/anim)。
  const surfaces = [];
  const pushSurface = (file, rec, fields) => {
    if (!rec) return;
    for (const [id, r] of rec instanceof Map ? rec : Object.entries(rec)) {
      if (!r || typeof r !== 'object') continue;
      for (const f of fields) {
        if (r[f] !== undefined) surfaces.push({ file, id: String(id), field: f, v57: r[f] });
      }
    }
  };
  pushSurface('combat', c57.items, ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'useAmmo',
    'shootSpeed', 'ammo', 'crit', 'scale', 'mana', 'maxStack', 'consumable', 'noMelee', 'autoReuse', 'melee',
    'ranged', 'magic', 'summon', 'useTurn', 'noUseGraphic']);
  for (const [id, v] of Object.entries(r57.RARE)) surfaces.push({ file: 'rare', id, field: 'rare', v57: v });
  for (const [id, v] of Object.entries(r57.VALUE)) surfaces.push({ file: 'value', id, field: 'value', v57: v });
  for (const [id, v] of s57.def) surfaces.push({ file: 'stats', id: String(id), field: 'def', v57: v });
  for (const [id, v] of s57.life) surfaces.push({ file: 'stats', id: String(id), field: 'life', v57: v });
  for (const [id, v] of s57.healMana) surfaces.push({ file: 'func', id: String(id), field: 'healMana', v57: v });
  for (const [id, w] of s57.whip) {
    for (const f of ['proj', 'dmg', 'kb', 'speed', 'anim']) surfaces.push({ file: 'whips', id: String(id), field: f, v57: w[f] });
  }
  pushSurface('proj', p57, ['aiStyle', 'width', 'height', 'penetrate', 'timeLeft', 'damage', 'light', 'scale',
    'extraUpdates', 'armorPenetration', 'friendly', 'melee', 'ranged', 'magic', 'minion', 'hostile',
    'tileCollide', 'ignoreWater', 'pierce', 'localNPCHitCooldown']);
  // 非字面量赋值补丁(提取器只认 `field = N;` 字面,表达式赋值按源码求值手工钉值):
  //   1226 叶绿巨剑 `useTime = useAnimation;`(Item.cs:15125)= 32
  const NON_LITERAL_57 = {
    combat: { '1226': { useTime: 32 } },
    // ApplyGemStaffStats()（Projectile.cs:10685-10691）展开（提取器不展开私有方法调用）:
    // friendly + usesLocalNPCImmunity + localNPCHitCooldown 60 + timeLeft 300,
    // 121-126/597 七弹共用（1456 的显式 penetrate 行已删 = 缺省 1）。
    // usesLocalNPCImmunity/localNPCHitCooldown 走 ProjectileData 扩展列（代码侧消费）。
    proj: {
      '121': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
      '122': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
      '123': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
      '124': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
      '125': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
      '126': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
      '597': { friendly: true, timeLeft: 300, localNPCHitCooldown: 60 },
    },
  };
  const seenSurface = new Set(surfaces.map((s) => `${s.file}:${s.id}:${s.field}`));
  for (const [file, recs] of Object.entries(NON_LITERAL_57)) {
    for (const [id, fields] of Object.entries(recs)) {
      for (const [f, v] of Object.entries(fields)) {
        const key = `${file}:${id}:${f}`;
        if (seenSurface.has(key)) continue;
        seenSurface.add(key);
        surfaces.push({ file, id, field: f, v57: v });
      }
    }
  }

  // 1456 侧同面记录(legacy 漂移检测:1456==1457 的字段上,json 不得偏离 1456)
  const v56of = (file, id, field) => {
    switch (file) {
      case 'combat': return c56.items[id]?.[field];
      case 'rare': return r56.RARE[id];
      case 'value': return r56.VALUE[id];
      case 'stats': return (field === 'def' ? s56.def.get(Number(id)) : s56.life.get(Number(id)));
      case 'func': return s56.healMana.get(Number(id));
      case 'whips': return s56.whip.get(Number(id))?.[field];
      case 'proj': return p56[id]?.[field];
      default: return undefined;
    }
  };
  const jsonOf = (file, id, field) => {
    switch (file) {
      case 'combat': return json.combat[id]?.[field];
      case 'rare': return json.rare[id];
      case 'value': return json.value[id];
      case 'stats': return json.stats[id]?.[field];
      case 'func': return json.func[id]?.[field];
      case 'whips': return json.whips[id]?.[field];
      case 'proj': return json.proj[id]?.[field];
      default: return undefined;
    }
  };

  const numEq = (a, b) => typeof a === 'number' && typeof b === 'number' && Math.abs(a - b) < 1e-6;
  const eq = (a, b) => a === b || numEq(a, b);

  const classB = [];  // 1456→1457 变化(移植确认清单)
  const drift = [];   // json vs 1457(--fix 载荷)
  const deferredDrift = []; // 已知暂缓项(新弹依赖,见 FIX_SHOOT_KEEP)
  const handPatches = [];   // 弹幕既知手补面(json 故意偏离源码字面,保留不回写)
  const legacy = [];  // 1456==1457 字段上 json 对 1456 的漂移(基线保护)
  const fixes = [];   // [file, id, field, v57]
  const seenId = new Set();
  for (const s of surfaces) seenId.add(`${s.file}:${s.id}`);
  // ① 1457 全量面:逐字段三分支(json/1456/1457)
  for (const { file, id, field, v57 } of surfaces) {
    const v56 = v56of(file, id, field);
    const vj = jsonOf(file, id, field);
    const changed56to57 = !eq(v56, v57);
    if (changed56to57) {
      classB.push(`${file}[${id}].${field}: 1456=${JSON.stringify(v56 ?? null)} → 1457=${JSON.stringify(v57)}`);
    }
    if (!eq(vj, v57)) {
      const deferred = file === 'combat' && field === 'shoot' && FIX_SHOOT_KEEP.has(id);
      // 弹幕手补面:json 对 1456 提取的既知故意偏离(提取盲区手补,如 96 火焰 scale 终值/
      // 悠悠球 scale/aiStyle 0→1 兜底),两版源码同值时不算漂移、不回写——否则 --fix 会
      // 把手补抹回源码字面。1457 真变更(v56≠v57)仍按 1457 终态覆写(手补被终态取代)。
      const handPatch = file === 'proj' && !changed56to57;
      if (handPatch) {
        handPatches.push(`${file}[${id}].${field}: json=${JSON.stringify(vj ?? null)} ≠ 源码=${JSON.stringify(v57)}(两版同值,既知手补保留)`);
      } else {
        (deferred ? deferredDrift : drift).push(`${file}[${id}].${field}: json=${JSON.stringify(vj ?? null)} → 1457=${JSON.stringify(v57)}${deferred ? '(新弹 1126/1127 未实装,暂保留 1456 弹 id)' : ''}`);
        if (!deferred) fixes.push([file, id, field, v57]);
      }
    } else if (!changed56to57 && !eq(vj, v56)) {
      legacy.push(`${file}[${id}].${field}: json=${JSON.stringify(vj)} ≠ 1456=${JSON.stringify(v56)}(两版同值)`);
    }
  }
  // ② json 独有条目(1457 面内无该 id/字段):1456 亦无 = 数据面多写(仅审阅);
  //    1456 有而 1457 无 = 1457 删除字段(--fix 需删键)
  for (const file of ['combat', 'rare', 'value', 'stats', 'whips', 'func', 'proj']) {
    const tbl = json[file];
    const fieldsOf = file === 'combat'
      ? ['damage', 'knockBack', 'useTime', 'useAnimation', 'shoot', 'useAmmo', 'shootSpeed', 'ammo', 'crit', 'scale', 'mana', 'maxStack', 'consumable', 'noMelee', 'autoReuse', 'melee', 'ranged', 'magic', 'summon', 'useTurn', 'noUseGraphic']
      : file === 'stats' ? ['def', 'life'] : file === 'whips' ? ['proj', 'dmg', 'kb', 'speed', 'anim']
        : file === 'func' ? ['healMana']
        : file === 'proj' ? ['aiStyle', 'width', 'height', 'penetrate', 'timeLeft', 'damage', 'light', 'scale', 'extraUpdates', 'armorPenetration', 'friendly', 'melee', 'ranged', 'magic', 'minion', 'hostile', 'tileCollide', 'ignoreWater', 'pierce', 'localNPCHitCooldown']
        : [file === 'rare' ? 'rare' : 'value'];
    for (const [id, rec] of Object.entries(tbl)) {
      if (!rec || typeof rec !== 'object') continue;
      for (const f of fieldsOf) {
        if (rec[f] === undefined) continue;
        if (seenId.has(`${file}:${id}`) && surfaces.some((s) => s.file === file && s.id === id && s.field === f)) continue;
        const v56 = v56of(file, id, f);
        if (v56 !== undefined) {
          // 1456 有而 1457 面(提取器)无:1457 删除该字段(如 1227 autoReuse/useTurn 重做删行)
          classB.push(`${file}[${id}].${f}: 1456=${JSON.stringify(v56)} → 1457=无(删除)`);
          if (!eq(jsonOf(file, id, f), undefined)) {
            drift.push(`${file}[${id}].${f}: json=${JSON.stringify(rec[f])} → 1457=无(删除)`);
            fixes.push([file, id, f, undefined]);
          }
        }
      }
    }
  }

  const coverage = {
    combat1456: Object.keys(c56.items).length, combat1457: Object.keys(c57.items).length,
    combatAnomalies: c56.anomalies.length + c57.anomalies.length,
    rare1456: Object.keys(r56.RARE).length, rare1457: Object.keys(r57.RARE).length,
    value1457: Object.keys(r57.VALUE).length,
    statsDef57: s57.def.size, statsLife57: s57.life.size, whips57: s57.whip.size,
    proj1456: Object.keys(p56).length, proj1457: Object.keys(p57).length,
  };
  return { classB, drift, deferredDrift, legacy, handPatches, fixes, coverage };
}

// ---- --fix:应用 1457 终值(写前备份;shoot 白名单见 FIX_SHOOT_KEEP) ----
// 1226/1227 叶绿双剑的 shoot 在 1457 指向新弹 1126/1127(ChlorophyteClaymoreBlade/
// ChlorophyteSaberStab)——新弹 AI/贴图属"登记不实装"批,数据侧保留 1456 弹 id,
// 其余数值照搬(伤害/攻速/noMelee/noUseGraphic 等),弹体替换随新弹批一并落。
export const FIX_SHOOT_KEEP = new Set(['1226', '1227']);

async function main() {
  const { classB, drift, deferredDrift, legacy, handPatches, fixes, coverage } = await recon();
  console.log(`== 覆盖 == combat ${coverage.combat1456}→${coverage.combat1457} / rare ${coverage.rare1456}→${coverage.rare1457} / value ${coverage.value1457} / stats def ${coverage.statsDef57} life ${coverage.statsLife57} / whips ${coverage.whips57}`);
  console.log(`\n== CLASS B: 1456→1457 变化 ${classB.length} 条(移植确认清单)==`);
  for (const l of classB) console.log(l);
  console.log(`\n== DRIFT: json→1457 ${drift.length} 条(--fix 载荷)==`);
  for (const l of drift) console.log(l);
  console.log(`\n== DEFERRED: 已知暂缓 ${deferredDrift.length} 条(新弹依赖,不进 --fix)==`);
  for (const l of deferredDrift) console.log(l);
  console.log(`\n== HANDPATCH: 弹幕既知手补(保留不回写)${handPatches.length} 条 ==`);
  for (const l of handPatches) console.log(l);
  console.log(`\n== LEGACY: 两版同值字段上 json≠1456 ${legacy.length} 条(基线保护)==`);
  for (const l of legacy.slice(0, 40)) console.log(l);
  if (process.argv.includes('--fix')) {
    const dir = '/tmp/recon-item';
    mkdirSync(dir, { recursive: true });
    const FILES = {
      combat: 'vanilla-itemcombat.json',
      rare: 'vanilla-itemrare.json',
      value: 'vanilla-itemvalue.json',
      stats: 'vanilla-itemstats.json',
      whips: 'vanilla-whips.json',
      func: 'vanilla-itemfunc.json',
      proj: 'vanilla-projectiles.json',
    };
    const tbl = {};
    for (const [k, f] of Object.entries(FILES)) {
      tbl[k] = JSON.parse(readFileSync(join(ROOT, 'game/src/data', f), 'utf8'));
      copyFileSync(join(ROOT, 'game/src/data', f), join(dir, f + '.bak'));
    }
    let applied = 0;
    // rare/value 是 id → 标量;其余是 id → 对象
    const SCALAR = new Set(['rare', 'value']);
    for (const [file, id, field, v57] of fixes) {
      if (file === 'combat' && field === 'shoot' && FIX_SHOOT_KEEP.has(id)) continue;
      if (SCALAR.has(file)) {
        if (v57 === undefined) delete tbl[file][id];
        else tbl[file][id] = v57;
        applied++;
        continue;
      }
      const rec = tbl[file][id];
      if (v57 === undefined) {
        if (rec && rec[field] !== undefined) { delete rec[field]; applied++; }
      } else if (!rec || typeof rec !== 'object') {
        tbl[file][id] = { [field]: v57 }; applied++;
      } else {
        rec[field] = v57; applied++;
      }
    }
    for (const [k, f] of Object.entries(FILES)) {
      writeFileSync(join(ROOT, 'game/src/data', f), JSON.stringify(tbl[k]));
    }
    console.log(`\n== FIX: 应用 ${applied}/${fixes.length} 条(shoot 白名单 ${[...FIX_SHOOT_KEEP].join(',')} 保留 1456 弹 id)→ 备份 ${dir}/ ==`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
