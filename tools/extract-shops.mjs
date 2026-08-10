// 从反编译源码提取:①物品 value(铜币价) ②各 NPC 商店商品表(Chest.SetupShop case)
// 数据源:Terarria1456 Item.cs SetDefaults1-5(switch-case 块) + Chest.cs SetupShop + NPCInteractions.cs Shop() 映射
import { readFileSync, writeFileSync } from 'fs';

const SRC = '/Users/vinlic/Project/GLM/SandboxWorld/Terarria1456/Terraria';
const itemSrc = readFileSync(`${SRC}/Item.cs`, 'utf8');
const chestSrc = readFileSync(`${SRC}/Chest.cs`, 'utf8');

// ---- ① 物品 value:SetDefaults1-5 的 `case N:` 块内首个 `value = D;`(break/return 前最贴近的) ----
const values = {};
{
  const body = itemSrc.slice(itemSrc.indexOf('public void SetDefaults1'), itemSrc.indexOf('public void SetDefaults(int Type'));
  const caseRe = /\t\tcase (\d+):\n/g;
  const marks = [];
  let m;
  while ((m = caseRe.exec(body))) marks.push({ id: Number(m[1]), at: m.index });
  for (let i = 0; i < marks.length; i++) {
    const end = i + 1 < marks.length ? marks[i + 1].at : marks[i].at + 4000;
    const seg = body.slice(marks[i].at, end);
    const v = seg.match(/value = (\d+)[fL]?;/);
    if (v) { values[marks[i].id] = Number(v[1]); continue; }
    // buyPrice(plat, gold, silver, copper) 左锚缺省:值 = Σ arg[i]·100^(3-i)
    const bp = seg.match(/value = buyPrice\(([\d\s,]+)\)/);
    if (bp) {
      const args = bp[1].split(',').map((s) => Number(s.trim()));
      values[marks[i].id] = args.reduce((a, x) => a * 100 + x, 0) * 100 ** (4 - args.length);
    }
  }
}

// ---- ② 商店表:Chest.SetupShop 顶层 case 块(嵌套 switch 的 case 按深度排除) ----
// NPC type → shop slot(NPCInteractions.cs:489-513)
const SHOP_SLOT = {
  17: 1, 19: 2, 20: 3, 38: 4, 54: 5, 107: 6, 108: 7, 124: 8, 142: 9, 160: 10,
  178: 11, 207: 12, 208: 13, 209: 14, 227: 15, 228: 16, 229: 17, 353: 18,
  453: 20, 588: 22, 633: 23, 663: 24,
};
function parseGate(text) {
  if (!text) return null;
  const has = (s) => text.includes(s);
  // 复合门里的次要条件优先判（如 dayTime && IsItAHappyWindyDay = 起风日,未实现）
  if (has('IsItAHappyWindyDay') || has('IsItAHappyRainyDay')) return 'skip';
  if (has('hardMode')) return 'hardMode';
  if (has('downedMechBossAny')) return 'downedMechBossAny';
  if (has('downedBoss3')) return 'downedBoss3';
  if (has('downedBoss2')) return 'downedBoss2';
  if (has('downedBoss1')) return 'downedBoss1';
  if (has('moonPhase')) return 'moonPhase';
  if (/!Main\.dayTime|!\s*Main\.dayTime/.test(text)) return 'night';
  if (has('dayTime')) return 'day';
  if (has('ZoneSnow')) return 'zoneSnow';
  if (has('ZoneJungle')) return 'zoneJungle';
  if (has('ZoneGraveyard')) return 'zoneGraveyard';
  if (has('ZoneMeteor')) return 'zoneMeteor';
  if (has('UnderworldHeight')) return 'zoneUnderworld';
  if (has('crimson')) return 'crimson';
  if (has('xMas') || has('halloween')) return 'xMas';
  if (has('bloodMoon')) return 'bloodMoon';
  if (has('eclipse')) return 'eclipse';
  if (has('PartyIsUp') || has('birthdayParty')) return 'party';
  return 'skip';
}

const shops = {};
{
  const start = chestSrc.indexOf('public void SetupShop(int type)');
  const body = chestSrc.slice(start);
  // 先按括号深度找出顶层 case(depth==2:方法体1 + switch体2)
  const lines = body.split('\n');
  let depth = 0;
  const marks = [];
  let inMethod = false;
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    if (!inMethod && line.includes('switch (type)')) { inMethod = true; depth = 1; continue; }
    if (!inMethod) continue;
    const cm = line.match(/^\t\tcase (\d+):$/);
    if (cm && depth === 2) marks.push({ slot: Number(cm[1]), at: li });
    if (line.includes('\n\t}\n') && line.trim() === '}' && depth === 1) break; // 方法结束
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
    if (inMethod && depth <= 1 && marks.length) break; // switch 结束
  }
  // 逐 case 段解析(行号切片)
  for (let i = 0; i < marks.length; i++) {
    const li0 = marks[i].at + 1;
    const li1 = i + 1 < marks.length ? marks[i + 1].at : lines.length;
    const stock = [];
    let gateStack = [];
    let d = 2; // case 体起始深度
    for (let li = li0; li < li1; li++) {
      const line = lines[li];
      const ifM = line.match(/if \((.+)\)/);
      if (ifM) gateStack.push({ cond: parseGate(ifM[1]), depth: d });
      const defM = line.match(/array\[num\+?\+?\]\.SetDefaults\((\d+)\)/);
      if (defM) {
        const open = gateStack.filter((g) => g.depth <= d).map((g) => g.cond).filter(Boolean);
        stock.push({ id: Number(defM[1]), cond: open[open.length - 1] ?? null });
      }
      for (const ch of line) {
        if (ch === '{') d++;
        else if (ch === '}') { d--; while (gateStack.length && gateStack[gateStack.length - 1].depth >= d) gateStack.pop(); }
      }
    }
    shops[marks[i].slot] = stock;
  }
}

// ---- 输出:按 NPC id 组织,附价格 ----
const out = {};
for (const [npcId, slot] of Object.entries(SHOP_SLOT)) {
  const stock = (shops[slot] ?? []).filter((s) => s.cond !== 'skip');
  out[npcId] = stock.map((s) => ({ id: s.id, price: values[s.id] ?? null, cond: s.cond }));
}
writeFileSync('src/data/vanilla-shopstock.json', JSON.stringify({ values, shops: out }));
const total = Object.values(out).reduce((a, s) => a + s.length, 0);
console.log('item values:', Object.keys(values).length, '| stock entries:', total);
for (const [id, s] of Object.entries(out)) console.log(`  npc ${id}: ${s.length} items, priced: ${s.filter((x) => x.price != null).length}`);
