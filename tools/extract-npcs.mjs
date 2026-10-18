// 从 Terarria1405 反编译源码提取全量 NPC 属性。
// ★producer 退役态（债刀-3 2026-09-17）：本脚本是 1405 锚时代 producer，自 1457 基准
//   切换（2026-08-23）后不再承担 vanilla-npcs.json 的再生产——现库已是 1457 终值态
//   （recon-npc --fix 活通道修正）+ 1405 输出面之外的增量（id 587-696 共 110 条 1405 后
//   新增 NPC；critter/color/value/boss/rarity/hide 等白名单外字段）。误重跑=对现库纯全量
//   覆写（不读现有），一次洗掉上述全部增量并把 586 以内数值打回 1405 态——vanilla-atlas.mjs
//   全量重跑四连事故同族（atlas era guard 判例 / recipes R25-B5② 强制门判例）。
//   故★追加时代守卫：检测到现库含本 producer 输出面之外的键（id>586 或白名单外字段）即拒 exit 1。
// 活通道：数值对账/修正走 node tools/recon-npc-1456-1457.mjs（--fix 一键重放 1457 终值）；
//   增量字段/条目走合并语义专用提取器（extract-critters / extract-npccolors 皆读现有合入）。
//   清空产物后的全量重建守卫天然不拦；原地强推须 --force-full --overwrite-append-era 双旗
//   （--force-full 单旗仍拒，rm -rf 式双键防误触），事后必须全绿 recon-npc 双闸门 +
//   tests/npc-stats-golden + tests/npc-frame-golden。测试注入面：SW_NPCS_JSON（守卫探测
//   路径）/ SW_OUT（写盘路径），缺省行为不变。★g1 footgun 硬化（红蓝-J1②,2026-09-18）：
//   探测 env 设置而 SW_OUT 缺省 → 拒跑 exit 1（fail-closed,守卫块前置）——探测与写盘
//   分离=守卫被绕过洗库。守卫测试：tests/extract-npcs-era-guard.test.ts。
// SetDefaults 反编译为 if/else-if 的 type 区间链（非 switch）：
//   if (this.type == N) {...} else if (this.type >= A && this.type <= B) {...} ...
// 每个 id 取链上首个命中的块（else-if 语义：命中后续块跳过）。
// 块内取深度1的 this.prop 赋值；块内嵌套小 switch 的 case {id} += 增量也并入。
// 另提取 Main.cs npcFrameCount[663]、TEdit bestiary 名字表。
// 输出 public/sprites/vanilla-npcs.json
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

const ROOT = process.env.SW_PROJECT_ROOT ?? new URL('../../', import.meta.url).pathname.replace(/\/+$/, '');   // ★C档可移植:game/ 父目录(反编译树/TEdit/Calamity 源所在)

// producer 输出面（守卫判据基线）：19 个 SetDefaults 白名单字段 + id/name/frames 框架字段
const KEYS = ['lifeMax', 'damage', 'defense', 'knockBackResist', 'aiStyle', 'width', 'height',
  'npcSlots', 'noGravity', 'noTileCollide', 'friendly', 'townNPC', 'HitSound', 'DeathSound',
  'scale', 'alpha', 'catchItem', 'lavaImmune', 'behindTiles'];
const MAX_ID = 586; // 1.4.0.5 最大 npc id（1457 NPCID.Count=696；现库 587-696 均为 1405 后增量）

// ★追加时代守卫（债刀-3 2026-09-17）：vanilla-npcs.json 已进入 recon-npc 活通道时代
//   （1457 终值 + 白名单外增量字段 + 587-696 新增 NPC）。本 producer 重跑=纯全量覆写，
//   与 vanilla-atlas.mjs 全量重跑事故（四连）同族，故照 atlas 判例设守卫。
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
const OUT_JSON = process.env.SW_OUT ?? `${ROOT}/game/public/sprites/vanilla-npcs.json`;
const GUARD_JSON = process.env.SW_NPCS_JSON ?? OUT_JSON;
// ★g1 footgun 硬化（红蓝-J1②,2026-09-18）：探测注入面（SW_NPCS_JSON）设置而 SW_OUT
//   缺省 → 拒跑 exit 1（fail-closed）。定谳（红蓝-J1 动态实证,write-blocking hook
//   exit 42 物证）：守卫探测读干净夹具（零增量→放行）而 writeFileSync 落缺省
//   OUT_JSON=现库 game/public/sprites/vanilla-npcs.json——探测与写盘分离=守卫被绕过
//   （全量覆写洗 587-696 新增 NPC+白名单外字段+1457 终值修正）。处置：显式 SW_OUT
//   （与探测同沙箱）或同时清探测 env。
const PROBE_ENV_SET = process.env.SW_NPCS_JSON !== undefined;
if (PROBE_ENV_SET && process.env.SW_OUT === undefined) {
  console.error('[extract-npcs] 拒绝运行：探测注入面（SW_NPCS_JSON）已设置而 SW_OUT 缺省（fail-closed）。');
  console.error('  守卫将探测注入夹具（零增量→放行），写盘却落缺省现库路径 game/public/sprites/vanilla-npcs.json——探测与写盘分离=守卫被绕过（footgun 洗库面）。');
  console.error('  处置：显式设置 SW_OUT 指向与探测一致的沙箱目录，或同时清掉探测 env 走真实现库守卫。');
  process.exit(1);
}
if (existsSync(GUARD_JSON)) {
  try {
    const prev = JSON.parse(readFileSync(GUARD_JSON, 'utf8'));
    const producerFields = new Set([...KEYS, 'id', 'name', 'frames']);
    const beyondIds = Object.keys(prev).filter((k) => Number(k) > MAX_ID);
    const extraFields = new Set();
    for (const e of Object.values(prev)) {
      if (e == null || typeof e !== 'object') continue;
      for (const k of Object.keys(e)) if (!producerFields.has(k)) extraFields.add(k);
    }
    const appendEra = beyondIds.length > 0 || extraFields.size > 0;
    if (appendEra && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      console.error('[extract-npcs] 拒绝全量重写：vanilla-npcs.json 已含 1405 producer 输出面之外的增量（追加时代）。');
      console.error(`  物证：id>${MAX_ID} 条目 ${beyondIds.length} 条（如 ${beyondIds.slice(0, 5).join(',')}…）；白名单外字段 {${[...extraFields].join(', ')}}。`);
      console.error('  全量重写会把现库打回 1405 锚态：洗掉 587-696 全部新增 NPC 与增量字段，并把 586 以内数值回退 1405（1457 终值修正全失）。');
      console.error('  数值对账/修正请走：node tools/recon-npc-1456-1457.mjs（--fix 一键重放 1457 终值，活通道）。');
      console.error('  增量字段/条目走合并语义提取器（tools/extract-critters.mjs / tools/extract-npccolors.mjs，读现有合入）。');
      console.error('  确需全量重建：清空 public/sprites/vanilla-npcs.json 后重跑（守卫天然不拦空产物）。');
      console.error('  原地强推须双旗 --force-full --overwrite-append-era（--force-full 单旗仍拒）；事后必须全绿 recon-npc 双闸门 + tests/npc-stats-golden + tests/npc-frame-golden。');
      process.exit(1);
    }
  } catch { /* GUARD_JSON 坏损时不拦（让正常流程自行报错） */ }
}

const npcCs = readFileSync(`${ROOT}/Terarria1405/NPC.cs`, 'utf8');
const mainCs = readFileSync(`${ROOT}/Terarria1405/Main.cs`, 'utf8');

// ---------- 1) npcFrameCount ----------
const fcMatch = mainCs.match(/npcFrameCount = new int\[\d+\]\s*\{([\s\S]*?)\n\s*\};/);
const frameCount = fcMatch[1].replace(/\/\/[^\n]*/g, '').split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => !Number.isNaN(n));
console.log('npcFrameCount:', frameCount.length);

// ---------- 2) SetDefaults if/else-if 链 ----------
const sdStart = npcCs.indexOf('public void SetDefaults(int Type');
const sdEnd = npcCs.indexOf('\n    public ', sdStart + 100);
const body = npcCs.slice(sdStart, sdEnd);
const chainStart = body.indexOf('if (this.type');
const chain = body.slice(chainStart);

// 拆出每个 条件→块。匹配 (else )if (cond)\n { ... }（配平花括号）
const blocks = [];
const condRe = /(else\s+)?if\s*\(([^)]*)\)\s*\n?\s*(?=\{)/g;
let m;
while ((m = condRe.exec(chain))) {
  const braceIdx = chain.indexOf('{', m.index);
  // 配平
  let depth = 0, end = -1;
  for (let i = braceIdx; i < chain.length; i++) {
    if (chain[i] === '{') depth++;
    else if (chain[i] === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0) break;
  const cond = m[2];
  if (!cond.includes('this.type')) { condRe.lastIndex = braceIdx; continue; }
  blocks.push({ cond, block: chain.slice(braceIdx + 1, end) });
  condRe.lastIndex = end;
}
console.log('type 条件块:', blocks.length);

// 条件 → id 判定函数
const matchIds = (cond) => {
  const mm = [];
  const eq = cond.match(/this\.type\s*==\s*(\d+)/);
  if (eq) { const n = parseInt(eq[1], 10); return [n, n]; }
  const rng = cond.match(/this\.type\s*>=\s*(\d+)\s*&&\s*this\.type\s*<=\s*(\d+)/);
  if (rng) return [parseInt(rng[1], 10), parseInt(rng[2], 10)];
  const rng2 = cond.match(/this\.type\s*<=\s*(\d+)\s*&&\s*this\.type\s*>=\s*(\d+)/);
  if (rng2) return [parseInt(rng2[2], 10), parseInt(rng2[1], 10)];
  const ge = cond.match(/this\.type\s*>=\s*(\d+)/);
  if (ge) return [parseInt(ge[1], 10), Infinity];
  const le = cond.match(/this\.type\s*<=\s*(\d+)/);
  if (le) return [-Infinity, parseInt(le[1], 10)];
  return null;
};

// 赋值解析：深度1 语句；值支持 数字/true/false/SoundID.XXX；+= 增量
const parseBlock = (blockText, exactId) => {
  const out = {};
  // 按行扫描，跟踪深度
  let depth = 0;
  const lines = blockText.split('\n');
  const reAssign = /^\s*(?:el)?se?\s*$|^\s*this\.(\w+)\s*(=|\+=|-=)\s*([^;]+);/;
  for (const line of lines) {
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const atTop = depth === 0;
    depth += opens - closes;
    const am = line.match(/^\s*this\.(\w+)\s*(\+=|-=|=)\s*([^;]+);/);
    if (am && atTop) {
      const [, prop, op, raw] = am;
      const v = raw.trim();
      let val;
      if (/^-?\d+(?:\.\d+)?f?$/.test(v)) val = parseFloat(v.replace(/f$/, ''));
      else if (v === 'true' || v === 'false') val = v === 'true';
      else if (/^SoundID\.(\w+)$/.test(v)) val = v.match(/^SoundID\.(\w+)$/)[1];
      else continue;
      if (op === '=') out[prop] = val;
      else if (op === '+=') out[`+${prop}`] = (out[`+${prop}`] ?? 0) + val;
      else if (op === '-=') out[`+${prop}`] = (out[`+${prop}`] ?? 0) - val;
    }
  }
  if (exactId != null) {
    // 块内嵌套 switch 的 case {exactId}: ... break; 的增量
    const caseRe = new RegExp(`case ${exactId}:([\\s\\S]*?)(?:break;|case \\d+:)`, 'g');
    let cm;
    while ((cm = caseRe.exec(blockText))) {
      const am2 = cm[1].matchAll(/this\.(\w+)\s*(\+=|-=)\s*([^;]+);/g);
      for (const a of am2) {
        const num = parseFloat(a[3].replace(/f$/, ''));
        out[`+${a[1]}`] = (out[`+${a[1]}`] ?? 0) + (a[2] === '+=' ? num : -num);
      }
    }
  }
  return out;
};

// ---------- 3) 逐 id 求值 ----------
const results = {};
for (let id = 1; id <= MAX_ID; id++) {
  for (const b of blocks) {
    const rng = matchIds(b.cond);
    if (!rng) continue;
    const [lo, hi] = rng;
    if (id >= lo && id <= hi) {
      const parsed = parseBlock(b.block, hi - lo === 0 ? id : (lo === hi ? id : null));
      results[id] = parsed;
      break; // else-if：命中后跳过剩余
    }
  }
}
console.log('求值到属性的 id 数:', Object.values(results).filter((r) => Object.keys(r).length).length, '/', MAX_ID);

// ---------- 4) 名字 + 输出 ----------
const bestiary = JSON.parse(readFileSync(`${ROOT}/Terraria-Map-Editor/src/TEdit.Terraria/Data/bestiaryNpcs.json`, 'utf8'));
const names = {};
for (const e of bestiary.npcData) if (typeof e.id === 'number' && e.id >= 1) names[e.id] = e.fullName ?? e.name;

const out = {};
for (let id = 1; id <= MAX_ID; id++) {
  const r = results[id] ?? {};
  const e = { id, name: names[id] ?? `NPC_${id}`, frames: frameCount[id] ?? 1 };
  let any = false;
  for (const k of KEYS) {
    if (r[k] !== undefined) { e[k] = r[k]; any = true; }
    if (r[`+${k}`] !== undefined) { e[k] = (e[k] ?? 0) + r[`+${k}`]; any = true; }
  }
  if (any) out[id] = e;
}
writeFileSync(OUT_JSON, JSON.stringify(out));
console.log('written', OUT_JSON, ':', Object.keys(out).length, 'npcs');
for (const id of [1, 3, 16, 25, 49, 111, 113, 525]) console.log(id, JSON.stringify(out[id]));
