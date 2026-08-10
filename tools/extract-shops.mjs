// 从反编译源码提取:①物品 value(铜币价) ②各 NPC 商店商品表(Chest.SetupShop case)
// 数据源:Terarria1456 Item.cs SetDefaults1/2/3 + Chest.cs SetupShop + NPCInteractions.cs Shop() 映射
import { readFileSync, writeFileSync } from 'fs';

const SRC = '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria';
const itemSrc = readFileSync(`${SRC}/Item.cs`, 'utf8');
const chestSrc = readFileSync(`${SRC}/Chest.cs`, 'utf8');

// ---- ① 物品 value:扫 SetDefaults1/2/3 的 `else if (type == N)` 块内首个 `value = D;` ----
const values = {};
{
  const body = itemSrc.slice(itemSrc.indexOf('public void SetDefaults1'));
  // 逐块扫:type 判定行之后的 value 赋值(块内第一次)
  const re = /if \(type ==?=? ?(\d+)\)|else if \(type ==?=? ?(\d+)\)/g;
  const marks = [];
  let m;
  while ((m = re.exec(body))) marks.push({ id: Number(m[1] ?? m[2]), at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : marks[i].at + 800;
    const seg = body.slice(marks[i].at, end);
    const v = seg.match(/value = (\d+)[fL]?;/);
    if (v) values[marks[i].id] = Number(v[1]);
  }
}

// ---- ② 商店表:Chest.SetupShop case 块内 SetDefaults 序列(含 if 门) ----
// NPC type → shop slot(NPCInteractions.cs:489-513)
const SHOP_SLOT = {
  17: 1, 19: 2, 20: 3, 38: 4, 54: 5, 107: 6, 108: 7, 124: 8, 142: 9, 160: 10,
  178: 11, 207: 12, 208: 13, 209: 14, 227: 15, 228: 16, 229: 17, 353: 18,
  588: 22, 633: 23, 663: 24,
};
// 门 → 可实现性/标记;未知门 → skip(保守不上架)
function parseGate(text) {
  if (!text) return null;
  const has = (s) => text.includes(s);
  if (has('hardMode') && has('!')) return 'hardMode';
  if (has('hardMode')) return 'hardMode';
  if (has('downedMechBossAny')) return 'downedMechBossAny';
  if (has('downedBoss3')) return 'downedBoss3';
  if (has('downedBoss2')) return 'downedBoss2';
  if (has('downedBoss1')) return 'downedBoss1';
  if (has('moonPhase')) return 'moonPhase';
  if (has('!dayTime') || (has('dayTime') && has('!'))) return 'night';
  if (has('dayTime')) return 'day';
  if (has('ZoneSnow')) return 'zoneSnow';
  if (has('ZoneJungle')) return 'zoneJungle';
  if (has('ZoneGraveyard')) return 'zoneGraveyard';
  if (has('ZoneUnderworldHeight') || has('UnderworldHeight')) return 'zoneUnderworld';
  if (has('ZoneMeteor')) return 'zoneMeteor';
  if (has('crimson')) return 'crimson';
  if (has('xMas')) return 'xMas';
  if (has('bloodMoon')) return 'bloodMoon';
  if (has('eclipse')) return 'eclipse';
  if (has('birthdayParty') || has('PartyIsUp')) return 'party';
  return 'skip';
}

const shops = {};
{
  const start = chestSrc.indexOf('public void SetupShop(int type)');
  const end = chestSrc.indexOf('\n\t}', start);
  const body = chestSrc.slice(start, end);
  const caseRe = /\t\tcase (\d+):\n/g;
  const marks = [];
  let m;
  while ((m = caseRe.exec(body))) marks.push({ slot: Number(m[1]), at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const seg = body.slice(marks[i].at, i + 1 < marks.length ? marks[i + 1].at : body.length);
    const stock = [];
    const lines = seg.split('\n');
    // 简化状态机:跟踪最近 if 门的深度(SetDefaults 属于哪个 if)
    let gateStack = []; // {cond, depth}
    let depth = 0;
    for (const line of lines) {
      const ifM = line.match(/if \((.+)\)/);
      if (ifM) { gateStack.push({ cond: parseGate(ifM[1]), depth }); }
      const defM = line.match(/array\[num\+?\+?\]\.SetDefaults\((\d+)\)/);
      if (defM) {
        const gates = gateStack.filter((g) => g.depth < depth || g.depth === depth).map((g) => g.cond);
        // 取栈上非 null 门(最近且仍开放的);简化:取最后 push 且 depth ≤ 当前的
        const open = gateStack.filter((g) => g.depth <= depth).map((g) => g.cond).filter(Boolean);
        stock.push({ id: Number(defM[1]), cond: open[open.length - 1] ?? null });
      }
      // 花括号深度跟踪(粗略:行首缩进 + {} 计数)
      for (const ch of line) {
        if (ch === '{') depth++;
        else if (ch === '}') { depth--; while (gateStack.length && gateStack[gateStack.length - 1].depth >= depth) gateStack.pop(); }
      }
    }
    shops[marks[i].slot] = stock;
  }
}

// ---- 输出:按 NPC id 组织,附价格(缺 value 用 1) ----
const out = {};
for (const [npcId, slot] of Object.entries(SHOP_SLOT)) {
  const stock = (shops[slot] ?? []).filter((s) => s.cond !== 'skip');
  out[npcId] = stock.map((s) => ({
    id: s.id,
    price: values[s.id] ?? null,
    cond: s.cond,
  }));
}
writeFileSync('src/data/vanilla-shopstock.json', JSON.stringify({ values, shops: out }, null, 0));
const total = Object.values(out).reduce((a, s) => a + s.length, 0);
console.log('item values:', Object.keys(values).length, '| shops:', Object.keys(out).length, '| stock entries:', total);
for (const [id, s] of Object.entries(out)) console.log(`  npc ${id}: ${s.length} items, priced: ${s.filter((x) => x.price).length}`);
