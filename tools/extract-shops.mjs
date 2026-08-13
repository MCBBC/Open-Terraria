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
  // 未实现的门直接整体跳过（如 dayTime && IsItAHappyWindyDay = 起风日限定商品）
  if (has('IsItAHappyWindyDay') || has('IsItAHappyRainyDay')) return 'skip';
  // remix/纪念种世界分支：正向 Main.remixWorld 合取 → 普通世界恒假 → skip；
  // !Main.remixWorld 合取 → 普通世界恒真 → 抹成 true 不贡献条件；
  // 纪念种旗（tenthAnniversaryWorld/getGoodWorld/infectedSeed）→ 恒 false。
  // 抹除后若整条只剩 true/false 字面量（如 `!remix || (纪念 && !getGood)`）
  // → 普通世界恒真，返回 null（无门）；仍含其它未映射内容 → 维持 skip
  if (/(^|[^!\w.])Main\.remixWorld/.test(text)) return 'skip';
  let t = text
    .replace(/!Main\.remixWorld/g, 'true')
    .replace(/Main\.tenthAnniversaryWorld|Main\.getGoodWorld|Main\.infectedSeed/g, 'false');
  const onlyLiterals = !t.replace(/true|false/g, '').replace(/[!|&()\s]/g, '');
  if (onlyLiterals) return t.includes('true') ? null : 'skip';
  // 复合门：收集全部可映射条件，按固定优先序去重后以 '&&' 连接（Chest.SetupShop 的
  // 嵌套 if 语义 = 外层门 && 内层门同时成立才上架，如 hardMode && ZoneGraveyard）
  const conds = [];
  const push = (c) => { if (!conds.includes(c)) conds.push(c); };
  if (has('hardMode')) push('hardMode');
  if (has('downedMechBossAny')) push('downedMechBossAny');
  // NPC.downedPlantBoss（世纪之花商店门：爆破专家地雷 937 / 松露自动锤 1551 /
  // 巫医 Tiki 套·俾格米项链·叶翼 / 画家回声涂层 5344 等，Chest.cs 多处）
  if (has('downedPlantBoss')) push('downedPlantBoss');
  if (has('downedPirates')) push('downedPirates');
  if (has('downedBoss3')) push('downedBoss3');
  if (has('downedBoss2')) push('downedBoss2');
  if (has('downedBoss1')) push('downedBoss1');
  if (has('moonPhase')) push('moonPhase');
  if (/!Main\.dayTime|!\s*Main\.dayTime/.test(text)) push('night');
  else if (has('dayTime')) push('day');
  if (has('ZoneSnow')) push('zoneSnow');
  if (has('ZoneJungle')) push('zoneJungle');
  if (has('ZoneGraveyard')) push('zoneGraveyard');
  if (has('ZoneMeteor')) push('zoneMeteor');
  if (has('UnderworldHeight')) push('zoneUnderworld');
  if (has('crimson')) push('crimson');
  if (has('xMas') || has('halloween')) push('xMas');
  if (has('bloodMoon')) push('bloodMoon');
  if (has('eclipse')) push('eclipse');
  if (has('PartyIsUp') || has('birthdayParty')) push('party');
  if (has('LanternNight.LanternsUp')) push('lanternNight');
  return conds.length ? conds.join('&&') : 'skip';
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
  // ★else-if 互斥链（2026-08-13 复审修复）：原解析把 `if (A) {x} else if (B) {y}`
  //   拍平成 x@A / y@B 两条独立门——原版 else 支只在全部前支不成立时执行（互斥，
  //   如 Chest.cs:1784-1793 裁缝 5577=墓地 else-if 242=白天，墓地白天不能双上架）。
  //   chainByDepth[d] 记录该深度当前链的前支门，else/else-if 支据此生成取反门。
  //   取反规则（不可取反的前支不生成取反，else 支维持外层门近似——登记失真）：
  //     - 单 token 且非 moonPhase/非 skip → '!token'
  //     - null（parseGate 判普通世界恒真）→ else 支不可达 → 'skip' 整支丢弃
  //     - 'skip'/复合门('&&')/moonPhase（token 丢相位值，!moonPhase 不可表达）→ 跳过
  //   同深度出现新的裸 if 即开新链（覆盖旧链）。
  const NO_NEGATE = new Set(['moonPhase']);
  const elseNegations = (preds) => {
    const negs = [];
    for (const g of preds) {
      if (g === null) return { dead: true, negs };
      if (g === 'skip' || g.includes('&&') || NO_NEGATE.has(g)) continue;
      negs.push('!' + g);
    }
    return { dead: false, negs };
  };
  for (let i = 0; i < marks.length; i++) {
    const li0 = marks[i].at + 1;
    const li1 = i + 1 < marks.length ? marks[i + 1].at : lines.length;
    const stock = [];
    let gateStack = [];
    const chainByDepth = new Map(); // depth → 前支门列表（else-if 链累积）
    let d = 2; // case 体起始深度
    for (let li = li0; li < li1; li++) {
      const line = lines[li];
      const isElse = /^\s*else\b/.test(line);
      const ifM = line.match(/if \((.+)\)/);
      if (ifM) {
        const own = parseGate(ifM[1]);
        let gate = own;
        if (isElse) {
          const preds = chainByDepth.get(d) ?? [];
          const r = elseNegations(preds);
          preds.push(own);
          chainByDepth.set(d, preds);
          if (r.dead || own === 'skip') gate = 'skip';
          else if (r.negs.length) gate = [...r.negs, ...(own ? [own] : [])].join('&&');
        } else {
          chainByDepth.set(d, [own]); // 裸 if = 新链起点
        }
        gateStack.push({ cond: gate, depth: d });
      } else if (isElse) {
        // 裸 else：无自身门，有效门 = 前支取反（无可取反项则无门，= 旧近似）
        const preds = chainByDepth.get(d) ?? [];
        const r = elseNegations(preds);
        preds.push(null);
        chainByDepth.set(d, preds);
        gateStack.push({ cond: r.dead ? 'skip' : (r.negs.length ? r.negs.join('&&') : null), depth: d });
      }
      const defM = line.match(/array\[num\+?\+?\]\.SetDefaults\((\d+)\)/);
      if (defM) {
        // 全部未闭合门的条件 AND（原版嵌套 if 语义）：任一门 'skip' → 整条丢弃
        const open = gateStack.filter((g) => g.depth <= d).map((g) => g.cond).filter(Boolean);
        stock.push({ id: Number(defM[1]), cond: open.length ? open.join('&&') : null });
      }
      for (const ch of line) {
        if (ch === '{') d++;
        else if (ch === '}') {
          d--;
          while (gateStack.length && gateStack[gateStack.length - 1].depth >= d) gateStack.pop();
          // 链生命周期 = 其所在块：块闭合（深度跌破链深度）才作废，分支自身闭合不清
          for (const k of [...chainByDepth.keys()]) if (k > d) chainByDepth.delete(k);
        }
      }
    }
    shops[marks[i].slot] = stock;
  }
}

// ---- 输出:按 NPC id 组织,附价格 ----
const out = {};
for (const [npcId, slot] of Object.entries(SHOP_SLOT)) {
  // 任一开门含 'skip'（未映射条件，如 HasItem/随机掷骰）→ 整条丢弃（AND 语义）；
  // cond=null（无开门）= 恒上架，保留
  const stock = (shops[slot] ?? []).filter((s) => s.cond === null || !s.cond.split('&&').includes('skip'));
  out[npcId] = stock.map((s) => ({ id: s.id, price: values[s.id] ?? null, cond: s.cond }));
}
writeFileSync('src/data/vanilla-shopstock.json', JSON.stringify({ values, shops: out }));
const total = Object.values(out).reduce((a, s) => a + s.length, 0);
console.log('item values:', Object.keys(values).length, '| stock entries:', total);
for (const [id, s] of Object.entries(out)) console.log(`  npc ${id}: ${s.length} items, priced: ${s.filter((x) => x.price != null).length}`);
