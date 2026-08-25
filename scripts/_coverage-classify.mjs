// 覆盖矩阵分类:A=行为级深审 / B=族代表或数据面 / C=从未检查 + 风险分级
import { readFileSync, writeFileSync } from 'node:fs';
const ROOT = new URL('..', import.meta.url).pathname;
const read = (p) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const jread = (p) => JSON.parse(readFileSync(p, 'utf8'));

const cov = jread('/tmp/recon/_coverage-audit.json');
const { wIds: itemAuditW, sIds: itemAuditS } = jread('/tmp/recon/_itemaudit-weapons.json');
const masterIds = jread('/tmp/recon/_weaponaudit0822-ids.json');
const whips = read('src/data/vanilla-whips.json');

const A = new Set();
const ANote = {};
const addA = (ids, note) => { for (const i of ids) { A.add(i); ANote[i] ||= note; } };

addA([739,740,741,742,743,744,3377,157,518,519,1336,165,272,127,4347,4348,64,788,495], 'R27 魔法前期族');
addA([112,683,1264,1444,1445,1801,1930,1931,3105,3209,3269,3476,3542,3570,3779], 'R28 魔法中期族');
addA([3540,1229,4381,679,3788,434,4703,197,4060,4058,1121], 'R29 远程多发重灾区');
addA([2624,3029,4953,3859,2797,3019,2888,682,725,120,3052,2223,3854,964,534,39,44,99,655,658,661], 'R29§10 达标样板/弓基线');
addA([284,670,163,220,280,277,274,3317], 'R30 近战投掷在册件');
addA([1309,1572,1802,4281,4607,4758,5005], 'R31 召唤在册7杖');
addA([2366,3569,5119,5463,3571], 'R31§C 哨兵放置面');
addA(Object.keys(whips).map(Number), 'R31§B 鞭18全族视觉/tag/proc');
addA(masterIds, 'weapon-audit-0822 总账');
addA([6153], 'R26 P2 GlacierFang chargeRate 行为级核对');

const B = new Set();
const BNote = {};
const addB = (ids, note) => {
  for (const i of ids) {
    if (A.has(i)) continue;
    B.add(i); BNote[i] ||= note;
  }
};
addB(itemAuditW, 'item-audit 武器442 功能面✅');
addB(itemAuditS, 'item-audit 召唤31 功能面✅');
addB(itemAuditS, 'R31§A 召唤59数据面对拍');
// R30 族代表（行为实体族审,个体未注册未单审）
for (const p of cov.perItem) {
  if (p.kind === 'boomerang') addB([p.id], 'R30 回旋镖族(rep 284/670)');
  else if (p.kind === 'flail') addB([p.id], 'R30 链枷族(rep 163/220)');
  else if (p.kind === 'spear') addB([p.id], 'R30 矛族(rep 280/277/274)');
  else if (p.kind === 'yoyo') addB([p.id], 'R30 悠悠球族(rep 3317)+机制核全在');
}
// R26 多发周期 11 件数据面点名
addB([157,1178,1336,1931,3053,3787,3852,4270,4952,6152,6173], 'R26 multishotPerCycle 点名(数据面)');
// 钩爪族：grappleHooks.ts 全量数据表 + GrappleProj + master0822 类别二含钩爪
const gh = readFileSync(ROOT + 'src/data/grappleHooks.ts', 'utf8');
const hookProjs = new Set([...gh.matchAll(/^ {2}(\d+):/gm)].map(m => +m[1]));
for (const p of cov.perItem) {
  if (p.shoot && p.shoot.split('/').some(s => hookProjs.has(+s))) addB([p.id], '钩爪族(grappleHooks 数据表全量+GrappleProj)');
}
// R31 召唤注册批点名（注册+A② alphaFade/哨兵面逐件处理）
addB([6149,6164,6148,6161,3818,3819,3820,3821,3824,3825,3826,3827,3829,3830,3831,3832,3833,3834], 'R31 召唤注册批点名');
// 坐骑族：vanilla-mounts.json itemMount 全量表
const mountsJson = read('src/data/vanilla-mounts.json');
const mountItems = new Set(Object.keys(mountsJson.itemMount ?? {}).map(Number));
for (const p of cov.perItem) if (mountItems.has(p.id)) addB([p.id], '坐骑族(vanilla-mounts itemMount 全量表)');
// 钓鱼竿族：钓鱼系统(Bobber/钓力链)实现族
for (const p of cov.perItem) if (/Fishing(Pole|Rod)/.test(p.name)) addB([p.id], '钓鱼竿族(Bobber+钓力数据链)');
// 传送门枪：firePortalGun 专支(vanillaItemCombat.ts 显式退出注释)
addB([3384], '传送门枪 firePortalGun 专支');

// C = 其余
const rows = [];
for (const p of cov.perItem) {
  let tier = 'C', note = '';
  if (A.has(p.id)) { tier = 'A'; note = ANote[p.id]; }
  else if (B.has(p.id)) { tier = 'B'; note = BNote[p.id]; }
  rows.push({ ...p, tier, note });
}
// 纯近战(no-shoot melee)单独列
const pmRows = cov.pureMeleeAll.map(p => {
  const inA = A.has(p.id);
  const inB = itemAuditW.includes(p.id) || masterIds.includes(p.id);
  return { ...p, name: cov.names[p.id] ?? '?',
    tier: inA ? 'A' : (inB ? 'B' : 'C'),
    note: inA ? (ANote[p.id] ?? '') : (inB ? (itemAuditW.includes(p.id) ? 'item-audit 武器442 功能面✅' : 'weapon-audit-0822') : '') };
});

// ---- 风险分级(C 类)----
// 族键 = kind + aiStyle；统计 A∪B 内各族的代表数
const famAB = {};
for (const r of rows) {
  if (r.tier === 'C') continue;
  const k = r.kind + '/' + r.ai;
  famAB[k] = (famAB[k] ?? 0) + 1;
}
const cRows = [];
for (const r of rows.filter(x => x.tier === 'C')) {
  const famKey = r.kind + '/' + r.ai;
  const hasFamRep = (famAB[famKey] ?? 0) > 0;
  const noData = cov.missingInOurs.includes(r.id);
  const sp = r.special;
  // glowstick 六件白名单有显式实现支 → 降为低
  if (r.kind === 'glowstick') {
    cRows.push({ ...r, risk: '低', why: 'combatWeapon 显式 glowstick 白名单支(6件),纯消耗投掷物' });
    continue;
  }
  // 非武器杂件(坐骑/宠物/染料粉等 other 类,dmg0)不进"高风险真武器"序列 → 最高只到中
  let risk, why;
  if (!hasFamRep || noData || r.branches || sp.some(s => /^(channel|reuseDelay|multishotPerCycle|shootsOnRelease|gunProj|branches)/.test(s))) {
    risk = '高';
    why = [
      !hasFamRep && `独特族 ${famKey} 无 A/B 代表`,
      noData && 'vanilla-itemcombat.json 无条目(数据面整缺)',
      r.branches && 'Player.cs ItemCheck_Shoot 专支(branches)',
      ...(sp.length ? [`特殊字段:${sp.join('/')}`] : []),
    ].filter(Boolean).join('; ');
  } else if (sp.length) {
    risk = '中'; why = '共享族但有特殊字段组合:' + sp.join('/');
  } else {
    risk = '低'; why = `纯数值变体(族 ${famKey} 有代表)`;
  }
  if (r.cls === 'other' && r.damage === 0 && risk === '高') {
    risk = '中'; why += ';〔非武器杂件,降序列〕';
  }
  cRows.push({ ...r, risk, why });
}
cRows.sort((a, b) => ({ 高: 0, 中: 1, 低: 2 })[a.risk] - ({ 高: 0, 中: 1, 低: 2 })[b.risk] || b.damage - a.damage);

const out = {
  counts: {
    total: rows.length,
    A: rows.filter(r => r.tier === 'A').length,
    B: rows.filter(r => r.tier === 'B').length,
    C: cRows.length,
    pureMelee: pmRows.length,
    pmA: pmRows.filter(r => r.tier === 'A').length,
    pmB: pmRows.filter(r => r.tier === 'B').length,
    pmC: pmRows.filter(r => r.tier === 'C').length,
  },
  byClassTier: {},
  cRows, pmRows, rows,
};
for (const r of rows) {
  const k = `${r.cls}/${r.tier}`;
  out.byClassTier[k] = (out.byClassTier[k] ?? 0) + 1;
}
writeFileSync('/tmp/recon/_coverage-final.json', JSON.stringify(out));
console.log(JSON.stringify(out.counts));
console.log('byClass:', JSON.stringify(out.byClassTier));
console.log('C-risk:', JSON.stringify({
  高: cRows.filter(r => r.risk === '高').length,
  中: cRows.filter(r => r.risk === '中').length,
  低: cRows.filter(r => r.risk === '低').length }));
