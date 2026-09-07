// ★SW-BJ16 2026-09-07（用户令：召唤物盒精灵错位永久防护）
// 召唤物绘制分派链家族提取器（半自动）：解析反编译 Main.DrawProjDirect 的
// 绘制分支条件 → vid 集，与本仓召唤物实体域求交，输出分类表（markdown/json）。
//
// 证据阶梯：本脚本只做「分派条件 → vid 集」的机械投影（源码锚级），
// 分支内改锚特例（num467/origin 覆写/锚 Y 修正/网格切片）不在解析面内，
// 须按 docs/audit/summon-draw-branch-registry-2026-09-07.md 逐型人工核验——
// BJ13 教训：折算公式只适用「支内无改锚者」，特例表是本批的人工核验产物。
//
// 用法：node tools/extract-draw-branch-families.mjs [--md]
//   默认输出 JSON（stdout）；--md 输出 markdown 表（供审计文档直接粘贴）。
//   终端重跑 = 再生分类表；与 tests/sw-bj16-draw-branch-guard.test.ts 内冻结表
//   不一致时以本脚本输出为准（先核 Main.cs 行号漂移，再更新测试冻结值）。
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GAME = join(HERE, '..');
const MAIN_CS = join(GAME, '..', 'Terarria1457', 'Terraria', 'Main.cs');
const COMBAT_JSON = join(GAME, 'src', 'data', 'vanilla-itemcombat.json');

// ---- ① 反编译分派条件行（1457 行号锚；版本切换时先核行号） ----
const BRANCHES = [
  {
    key: 'A_33161',
    title: 'A 支 Main.cs:33161（中心锚·整图）',
    anchor: 'proj.type == 444 || proj.type == 446 || proj.type == 490',
    // 锚=盒心+gfxOffY（:33162 vector81）、origin=整图尺寸/2（:33165 origin24）、
    // source=null 整图、rotation/scale/dir 直传。支内特例（578/579/641/813 叠环
    // :33444 等）不在此解析面。
  },
  {
    key: 'B_33693',
    title: 'B 支 Main.cs:33693（中心锚·帧切片=Frame(1,projFrames,0,frame)）',
    anchor: 'proj.type == 465 || proj.type == 467 || proj.type == 468',
    // 锚=盒心+gfxOffY（:33694-33695 vector99）、帧矩形 :33701、origin=帧尺寸/2
    // （:33787 origin32）、主绘 :34212。支内改锚/改切片特例 = 人工核验面
    // （758/759/773/963/1092/1098/1123/623/1094/1113/663/691…见审计文档）。
  },
  {
    key: 'C_34788',
    title: 'C 支 Main.cs:34788（帕鲁地面专绘·帧心@盒心上方 num467）',
    anchor: '(proj.type >= 393 && proj.type <= 395) || proj.type == 398',
    // 锚=Center+(0,gfxOffY−num467)（:34796）、origin=(整图宽/2, 帧高/2+num151)
    // （:34797）。SW-BJ13 已清偿九型。
  },
];

/** 解析一条 `proj.type == N`/`proj.type >= A && proj.type <= B` 条件串 → vid 集 */
function parseVids(cond) {
  const vids = new Set();
  const eq = cond.matchAll(/proj\.type == (\d+)/g);
  for (const m of eq) vids.add(Number(m[1]));
  const ge = cond.matchAll(/proj\.type >= (\d+) && proj\.type <= (\d+)/g);
  for (const m of ge) {
    const a = Number(m[1]), b = Number(m[2]);
    if (b - a > 4000) continue; // 防御：异常区间不展开
    for (let v = a; v <= b; v++) vids.add(v);
  }
  return vids;
}

const src = readFileSync(MAIN_CS, 'utf8');
const lines = src.split('\n');
const branchSets = {};
for (const b of BRANCHES) {
  const lineNo = lines.findIndex((l) => l.includes(b.anchor));
  if (lineNo < 0) {
    console.error(`!! 分支锚行未命中：${b.key}（anchor="${b.anchor}"）——Main.cs 行号漂移，先人工定位`);
    process.exit(1);
  }
  b.line = lineNo + 1; // 1-based（锚行=条件行）
  branchSets[b.key] = parseVids(lines[lineNo]);
}

// ---- ② 本仓召唤物实体域（数据驱动）----
// a) 召唤武器 shoot（vanilla-itemcombat.json summon=true 且有 shoot）
// b) 鞭伴生召唤（WeaponProj.WHIP_HIT_SIDEKICK：酷鞭 4911→917 / 麻线鞭 5473→1036）
// c) 计数器/套装派生体（MinionProj.spawnBody/extendDragon/Game 套装：
//    831→838 虎体、970→963 阿比盖尔体、625→626/627/628 龙链段、套装→623 守护者）
// d) Game 特殊命令直召（不走 combatWeapon summon 旗）：1098/1123 钻地龟
//    （Game.spawnDigtoiseOnCursor 指挥链,物品 5667/6174）
const combat = JSON.parse(readFileSync(COMBAT_JSON, 'utf8'));
const weaponShoots = new Set();
for (const [, v] of Object.entries(combat)) {
  if (v && v.summon && Number.isInteger(v.shoot) && v.shoot > 0) weaponShoots.add(v.shoot);
}
const whipSidekicks = new Set([917, 1036]);
const derivedBodies = new Set([623, 626, 627, 628, 963, 838]);
const specialSpawns = new Set([1098, 1123]);
const domain = new Set([...weaponShoots, ...whipSidekicks, ...derivedBodies, ...specialSpawns]);

// ---- ③ 求交分类 ----
const rows = [];
for (const vid of [...domain].sort((a, b) => a - b)) {
  let branch = 'generic（num143/144 表+通用尾绘 :34919/:35470）';
  for (const b of BRANCHES) {
    if (branchSets[b.key].has(vid)) { branch = b.key; break; }
  }
  rows.push({ vid, branch });
}

const summary = {};
for (const b of BRANCHES) summary[b.key] = rows.filter((r) => r.branch === b.key).map((r) => r.vid);
summary.generic = rows.filter((r) => r.branch.startsWith('generic')).map((r) => r.vid);

if (process.argv.includes('--md')) {
  console.log('| projId | 分支 |');
  console.log('|---|---|');
  for (const r of rows) console.log(`| ${r.vid} | ${r.branch} |`);
} else {
  console.log(JSON.stringify({
    source: { file: 'Terarria1457/Terraria/Main.cs', branches: BRANCHES.map((b) => ({ key: b.key, line: b.line, title: b.title })) },
    domainCounts: { weapons: weaponShoots.size, whipSidekicks: [...whipSidekicks], derivedBodies: [...derivedBodies], total: domain.size },
    classification: summary,
    rows,
  }, null, 2));
}
