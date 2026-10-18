// 全面功能实装扫描(2026-08-13):已登记 vi_ 物品 × 原版使用画像 → 分类清单。
// 判定链:家族派发(combatWeapon 同构)→ 通用链(放置/药水/弹药/工具/钓)→
// src 内 vi_<id>_ 字面引用(专属路径信号)→ 仍无着落 = 未实装候选。
import { PROJECT_ROOT } from './_pathlib.mjs';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = PROJECT_ROOT;
const combat = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-itemcombat.json`, 'utf8'));
const func = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-itemfunc.json`, 'utf8'));
const itemsSrc = readFileSync(`${ROOT}/game/src/data/items.ts`, 'utf8');
const namesSrc = readFileSync(`${ROOT}/game/src/i18n/idNames.generated.ts`, 'utf8');

const names = {};
for (const m of namesSrc.matchAll(/\s'(\d+)': '([^']+)',/g)) names[+m[1]] = m[2];

// 全量登记 = vanilla.json .items(运行时 :946-951 合成注册)+ 显式 vi_ 字面
const vim = JSON.parse(readFileSync(`${ROOT}/game/public/sprites/vanilla.json`, 'utf8')).items ?? {};
const registered = new Set([...Object.keys(vim).map(Number), ...[...itemsSrc.matchAll(/vi_(\d+)_/g)].map((m) => +m[1]), 6145, 6146]);

// 专属实现引用信号:src 代码树(Game/entities/stats/world/render/ui),排除 src/data/**
// (data 下 recipes/drops/key 表是"可获得性"不是"功能实现")与 items.ts/idNames
const referenced = new Set();
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (!p.includes('node_modules') && !p.includes('/data')) walk(p);
      continue;
    }
    if (!/\.ts$/.test(e)) continue;
    if (p.includes('idNames.generated')) continue;
    const t = readFileSync(p, 'utf8');
    for (const m of t.matchAll(/vi_(\d+)_/g)) referenced.add(+m[1]);
  }
};
walk(`${ROOT}/game/src`);
// 数字 id 比较信号(Game.ts 大量 `mvid === 556` 式派发)
{
  const gameTs = readFileSync(`${ROOT}/game/src/core/Game.ts`, 'utf8');
  for (const m of gameTs.matchAll(/(?:mvid|svid|vid|Vid)\s*===\s*(\d+)/g)) referenced.add(+m[1]);
  // 坐骑/钩爪家族表
  const mountJson = JSON.parse(readFileSync(`${ROOT}/game/src/data/vanilla-mounts.json`, 'utf8'));
  for (const id of Object.keys(mountJson.itemMount ?? {})) referenced.add(+id);
  const hookSrc = readFileSync(`${ROOT}/game/src/data/grappleHooks.ts`, 'utf8');
  for (const m of hookSrc.matchAll(/^\s{2}(\d+):\s*HookItemStats/gm)) referenced.add(+m[1]);
}

const merge = (vid) => ({ ...(func[String(vid)] ?? {}), ...(combat[String(vid)] ?? {}) });

// 家族/通用链判定 → 已实装原因字符串;null = 无着落
function familyOf(c) {
  if (c.pick || c.axe || c.hammer) return '工具';
  if (c.createTile || c.createWall) return '放置物';
  if (c.ammo) return '弹药';
  if (c.healLife || c.healMana || c.buffType || c.potion) return '药水/Buff';
  if (c.fishingPole) return '鱼竿';
  if (c.bait) return '鱼饵(被动)';
  if (c.shoot) {   // 悠悠球/钩爪/钻头等 useStyle 可为 0,shoot 族判定先行
    if (c.summon) return '召唤武器';
    if (c.magic || c.mana) return '魔法武器';
    if (c.melee && !c.noMelee) return '近战武器(挥砍+弹)';
    if (c.useAmmo) return '远程武器(useAmmo)';
    return '射击/投掷兜底';
  }
  if (!c.useStyle) return null;                        // 无使用语义 = 材料/纯装备
  if (c.useAmmo) return '远程武器(useAmmo)';
  if (c.consumable && c.noMelee) return null;          // 消耗特例,待专属
  if (c.melee && !c.noMelee) return '近战武器';
  return null;
}

const buckets = { implemented: [], gapBehavior: [], missing: [], material: [] };
for (const vid of registered) {
  const c = merge(vid);
  const fam = familyOf(c);
  const ref = referenced.has(vid);
  const name = names[vid] ?? '?';
  if (fam) buckets.implemented.push({ vid, name, fam });
  else if (ref) buckets.implemented.push({ vid, name, fam: '专属路径(vi_引用)' });
  else if (!c.useStyle && !c.shoot && !c.buffType) buckets.material.push({ vid, name });
  else buckets.missing.push({ vid, name, useStyle: c.useStyle ?? 0, shoot: c.shoot ?? 0, consumable: !!c.consumable, damage: c.damage ?? 0 });
}

const fmt = (a) => a.map((x) => `| ${x.vid} | ${x.name} |`).join('\n');
console.log(`已登记物品 ${registered.size} | 实装 ${buckets.implemented.length} | 材料/无使用语义 ${buckets.material.length} | **未实装候选 ${buckets.missing.length}**\n`);
console.log('## 未实装候选(有 useStyle 但无家族无专属引用)\n');
console.log('| id | 名称 | useStyle | shoot | consumable |');
console.log('|---|---|---|---|---|');
for (const x of buckets.missing.sort((a, b) => a.vid - b.vid)) {
  console.log(`| ${x.vid} | ${x.name} | ${x.useStyle} | ${x.shoot} | ${x.consumable ? '是' : ''} |`);
}
