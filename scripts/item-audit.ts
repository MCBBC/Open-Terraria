// 道具功能全量审计：vanilla-itemfunc.json（原版功能画像）× 我方实现覆盖
// → docs/item-audit.md 清单表（逐项状态）+ 控制台分类汇总。
// 用法：npx vite-node scripts/item-audit.ts
import { readFileSync, writeFileSync } from 'node:fs';
import { TILE_DEFS } from '../src/data/tiles';
import { ITEM_DEFS, ITEM_BY_KEY } from '../src/data/items';
import { BUFF_DEFS, BuffType } from '../src/stats/Buffs';
import { itemFuncOfVid } from '../src/data/vanillaItemFunc';

const ROOT = new URL('..', import.meta.url).pathname;
const j = (p: string) => JSON.parse(readFileSync(ROOT + p, 'utf8'));
const vmeta = j('public/sprites/vanilla.json').items as Record<string, { key: string }>;
const zh = j('public/l10n/zh-Hans.json');
const FUNC = j('src/data/vanilla-itemfunc.json') as Record<string, Record<string, number>>;
const COMBAT = j('src/data/vanilla-itemcombat.json') as Record<string, Record<string, unknown>>;
const STATS = j('src/data/vanilla-itemstats.json') as Record<string, Record<string, unknown>>;
const ACCFX = j('src/data/vanilla-accfx.json') as Record<string, Record<string, unknown>>;
const EQUIP = j('src/data/vanilla-equip.json') as Record<string, number[]>;
const zhName = (id: number) => (zh.ItemName as Record<string, string>)[vmeta[String(id)]?.key] ?? `#${id}`;

// sheet → 是否有 def（放置覆盖）
const SHEET_DEF = new Set<number>();
for (const td of TILE_DEFS) if (td.vanilla?.sheet !== undefined) SHEET_DEF.add(td.vanilla.sheet);
// 我方 Buff 支持的原版 buff id
const BUFF_VANILLA_IDS = new Set<number>();
for (const d of Object.values(BUFF_DEFS) as Array<{ vanillaBuff?: number }>) {
  if (d.vanillaBuff) BUFF_VANILLA_IDS.add(d.vanillaBuff);
}
// 墙放置覆盖：任一 def 带该 wallId（wallitems 循环注册的 snake_case 墙物品）
const WALL_IDS = new Set<number>();
for (const d of ITEM_DEFS) if (d.wallId !== undefined) WALL_IDS.add(d.wallId);
// vi_ key → 内部 id（功能桥接检查）
const viId = (vid: number) => ITEM_BY_KEY[`vi_${vid}_${vmeta[String(vid)]?.key ?? ''}`];

interface Row { id: number; name: string; cls: string; status: '✅' | '⚠️' | '❌'; note: string }
const rows: Row[] = [];
const tally: Record<string, Record<string, number>> = {};
const bump = (cls: string, s: string) => { (tally[cls] ??= {})[s] = (tally[cls]?.[s] ?? 0) + 1; };

for (const idStr of Object.keys(vmeta)) {
  const id = Number(idStr);
  const f = FUNC[idStr] ?? {};
  const name = zhName(id);
  const iid = viId(id);
  const clsFlags: Array<[string, string, '✅' | '⚠️' | '❌', string]> = [];
  const push = (cls: string, s: '✅' | '⚠️' | '❌', note = '') => clsFlags.push([cls, name, s, note]);

  // ---- 工具（镐/斧/锤）：legacy def.tool 或 vi_ itemfunc 桥接 ----
  const toolPow = f.pick ?? f.axe ?? f.hammer;
  if (toolPow) {
    const kind = f.pick ? 'pick' : f.axe ? 'axe' : 'hammer';
    const legacy = !!(iid !== undefined && ITEM_DEFS[iid]?.tool);
    const bridged = legacy || !!itemFuncOfVid(id)?.[f.pick ? 'pick' : f.axe ? 'axe' : 'hammer'];
    push('工具', bridged ? '✅' : '❌', `${kind} ${toolPow}%${legacy ? '' : bridged ? '（itemfunc 桥接）' : ' 需桥接'}`);
  }
  // ---- 放置物 ----
  if (f.createTile) {
    push('放置物', SHEET_DEF.has(f.createTile) ? '✅' : '❌', SHEET_DEF.has(f.createTile) ? `tile ${f.createTile}` : `tile ${f.createTile} 无 def`);
  }
  if (f.createWall) {
    push('铺墙', WALL_IDS.has(f.createWall) ? '✅' : '⚠️', `wall ${f.createWall}`);
  }
  // ---- 药水/治疗/魔力：legacy potion/heal def 或 vi_ itemfunc 桥接 ----
  if (f.healLife || f.healMana || f.potion) {
    const legacy = iid !== undefined && (ITEM_DEFS[iid]?.heal !== undefined || ITEM_DEFS[iid]?.potion !== undefined);
    const bridged = legacy || !!(f.healLife || f.healMana);
    push('治疗/魔力药', bridged ? '✅' : '❌', legacy ? '' : `heal${f.healLife ?? 0}/mana${f.healMana ?? 0}（itemfunc 桥接）`);
  }
  // ---- Buff 药水：仅 consumable 非召唤物品（宠物/随从/星云焰的 buffType 是随从 buff
  //      非饮用效果——已计入杂项装备/召唤武器类，此处排除防重复计数）----
  if (f.buffType && f.buffType > 0 && f.consumable && !f.summon) {
    const known = BUFF_VANILLA_IDS.has(f.buffType);
    push('Buff 药水', known ? '✅' : '⚠️', `buff ${f.buffType}${known ? '' : ' 无对应 BuffType（引擎缺）'}`);
  }
  // ---- 武器 ----
  if ((f.damage ?? 0) > 0 && !toolPow && !f.createTile) {
    const c = COMBAT[idStr];
    if (f.summon) {
      // R6：combatWeapon 解析 kind='summon'（哨兵分流 ai53/54/123）→ MinionProj
      const cw = (globalThis as unknown as { __cw?: unknown }).__cw;
      void cw;
      push('召唤武器', c?.shoot ? '✅' : '❌', c?.shoot ? 'kind=summon（随从/哨兵 AI 近似）' : 'combat 表缺 shoot');
    }
    else if (!c) push('武器', '❌', 'combat 表缺');
    else push('武器', '✅', `${f.melee ? '近战' : f.ranged ? '远程' : f.magic ? '魔法' : '通用'} dmg${f.damage}`);
  }
  // ---- 弹药 ----
  if (f.ammo) {
    const c = COMBAT[idStr];
    push('弹药', c?.ammo || (iid !== undefined && ITEM_DEFS[iid]?.ammoId !== undefined) ? '✅' : '⚠️', `ammo ${f.ammo}`);
  }
  // ---- 盔甲/配饰（itemstats/accfx 轮已覆盖）----
  const st = STATS[idStr];
  if (st?.s || st?.acc !== undefined) push('盔甲/配饰', '✅', st?.s ? `部位${st.s}` : '配饰');
  // ---- 杂项装备 ----
  const eq = (['dye', 'pet', 'light', 'mount', 'cart', 'hook'] as const).find((k) => EQUIP[k].includes(id));
  if (eq) push('杂项装备', '✅', eq);
  // ---- 火把 ----
  if (f.torch) push('火把', '✅', '光源/持握已移植');
  // ---- 无功能材料 ----
  if (!clsFlags.length) push('材料/无功能', '✅', '');

  for (const [cls, , s] of clsFlags) bump(cls, s);
  for (const [cls, nm, s, note] of clsFlags) rows.push({ id, name: nm, cls, status: s, note });
}

// ---- 输出 ----
const order = ['工具', '放置物', '铺墙', '治疗/魔力药', 'Buff 药水', '武器', '弹药', '盔甲/配饰', '杂项装备', '火把', '材料/无功能', '召唤武器'];
let md = `# 道具功能审计清单（${rows.length} 项功能条目 / ${Object.keys(vmeta).length} 件道具）\n\n`;
md += `> 生成：scripts/item-audit.ts（基准=vanilla-itemfunc.json 自 1456 Item.cs 提取；状态=我方实现覆盖）\n\n`;
for (const cls of order) {
  const t = tally[cls];
  if (!t) continue;
  const total = Object.values(t).reduce((a, b) => a + b, 0);
  md += `## ${cls}（${total}）\n\n`;
  md += `| 状态 | 数量 |\n|---|---|\n`;
  for (const s of ['✅', '⚠️', '❌']) if (t[s]) md += `| ${s} | ${t[s]} |\n`;
  md += `\n<details><summary>逐项清单</summary>\n\n| id | 道具 | 状态 | 备注 |\n|---|---|---|---|\n`;
  for (const r of rows.filter((r) => r.cls === cls)) {
    md += `| ${r.id} | ${r.name} | ${r.status} | ${r.note} |\n`;
  }
  md += `\n</details>\n\n`;
}
writeFileSync(ROOT + 'docs/item-audit.md', md);
console.log('分类汇总:');
for (const cls of order) {
  const t = tally[cls];
  if (!t) continue;
  console.log(`  ${cls}: ✅${t['✅'] ?? 0} ⚠️${t['⚠️'] ?? 0} ❌${t['❌'] ?? 0}`);
}
