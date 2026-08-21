// 从反编译源码提取:①物品 value(铜币价) ②各 NPC 商店商品表(Chest.SetupShop case)
// 数据源:Terarria1456 Item.cs SetDefaults1-5(switch-case 块) + Chest.cs SetupShop + NPCInteractions.cs Shop() 映射
import { readFileSync, writeFileSync } from 'fs';

// SW_TREE（2026-08-22 增量对拍用）：缺省 Terarria1456 不变；配 --out 落 /tmp（禁直接覆盖现库）
const TREE = process.env.SW_TREE || 'Terarria1456';
if (!/^(Terarria14(56|57))$/.test(TREE)) throw new Error(`SW_TREE 非法: ${TREE}`);
const SRC = `/Users/vinlic/Project/GLM/SandboxWorld/${TREE}/Terraria`;
const itemSrc = readFileSync(`${SRC}/Item.cs`, 'utf8');
const chestSrc = readFileSync(`${SRC}/Chest.cs`, 'utf8');

// ---- ① 物品 value:SetDefaults1-5 的 `case N:` 块内 value 赋值（嵌套 switch 迷你求值）----
// 2026-08-20 重构：旧版扁平 case 标签有两坑——①【嵌套 switch(type) 的内层 case】
// 被当独立块（DD2 杖族 3818-3834 内层 3819/3825/… 的 value 覆写污染外层 fall-through
// 继承 → T1 杖错抄 T2 价）②段边界取「下一个任意深度 case」（蜂王掉落族 2883-2888
// 定义在外层 case 的内层 switch 里，深度过滤又整段漏收）。现按花括号深度建标签表：
// 每个 case 标签的段 = 到【同深度或更浅的下一个标签 / 所在块闭合】为止；段内做
// C# 序模拟：共享体 value 赋值 + 更深层 `case <自身id>:` 块内覆写，晚写胜出。
const values = {};
{
  // 1457 起 SetDefaults1-5 改 private（1456=public）——按可见性无关匹配（2026-08-22）
  const sd1 = itemSrc.match(/(public|private|internal) void SetDefaults1\(/);
  const body = itemSrc.slice(sd1.index, itemSrc.indexOf('public void SetDefaults(int Type'));
  const lines = body.split('\n');
  // 全深度收集 case 标签（含嵌套 switch 内层——蜂王族 2883+/石头人族等整段住在里面）
  const marks = [];
  let depth = 0; // 首行 'public void…' 无花括号，方法体 '{' 在第二行
  for (let li = 0; li < lines.length; li++) {
    const line = lines[li];
    const cm = line.match(/^\t+case (\d+):$/);
    if (cm) marks.push({ id: Number(cm[1]), li, depth });
    for (const ch of line) {
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
    }
  }
  const valueOf = (seg) => {
    let v;
    let innerCase = 0;   // 0=共享体；>0=更深层 case 对应 id
    let d = 0;
    for (const line of seg.split('\n')) {
      const ic = line.match(/^\t+case (\d+):$/);
      if (ic && d >= 1) innerCase = Number(ic[1]);
      if (line.includes('break;') && d >= 1) innerCase = 0; // 简化：块结束回落共享体
      const v1 = line.match(/value = (\d+)[fL]?;/);
      const v2 = line.match(/value = (?:Item\.)?(buyPrice|sellPrice)\(([\d\s,]*)\)/);
      const v3 = line.match(/SetShopValues\([^,]+, (?:(\d+)|(?:Item\.)?(buyPrice|sellPrice)\(([\d\s,]*)\))\)/);
      let got;
      if (v1) got = Number(v1[1]);
      else if (v2) {
        const args = v2[2] ? v2[2].split(',').map((x) => Number(x.trim())) : [];
        got = args.reduce((a, x) => a * 100 + x, 0) * 100 ** (4 - args.length);
        if (v2[1] === 'sellPrice') got *= 5;   // Item.cs:49019-49022 sellPrice = ×5
      } else if (v3) {
        if (v3[1] !== undefined) got = Number(v3[1]);
        else {
          const args = v3[3] ? v3[3].split(',').map((x) => Number(x.trim())) : [];
          got = args.reduce((a, x) => a * 100 + x, 0) * 100 ** (4 - args.length);
          if (v3[2] === 'sellPrice') got *= 5;
        }
      }
      if (got !== undefined && (innerCase === 0 || innerCase === seg.__id)) v = got;
      for (const ch of line) {
        if (ch === '{') d++;
        else if (ch === '}') { d--; if (d <= 0) innerCase = 0; }
      }
    }
    if (v === undefined && /DefaultToTorch\(/.test(seg)) v = 60; // Item.cs:48094
    return v;
  };
  // 段边界：从标签行起，到「下一个【同深度或更浅】标签」或「所在块闭合（深度跌
  // 破标签深度）」为止——更深的标签是段内嵌套 switch，留给 valueOf 以 __id 分流
  const segEndOf = (i) => {
    const d0 = marks[i].depth;
    let d = d0;
    for (let li = marks[i].li + 1; li < lines.length; li++) {
      const line = lines[li];
      const cm = line.match(/^\t+case (\d+):$/);
      if (cm && d <= d0) return li;              // 同/浅层标签 = 兄弟块起点
      for (const ch of line) {
        if (ch === '{') d++;
        else if (ch === '}') { d--; if (d < d0) return li; } // 所在块闭合
      }
    }
    return lines.length;
  };
  const segTextOf = (i) => lines.slice(marks[i].li, segEndOf(i)).join('\n');
  // fall-through 组求值：纯标签 mark（`case A: case B: … 共用体`）借用组尾块的
  // 代码段、以【自己的 id】求值——嵌套 switch(type) 的 `case <自身id>:` 覆写对
  // 每件各自生效（DD2 杖族 T1/T2/T3 三档价即出自此结构）
  const eff = marks.map(() => -1);
  for (let i = marks.length - 1; i >= 0; i--) {
    eff[i] = /^\t+case \d+:\s*$/.test(segTextOf(i)) ? (eff[i + 1] ?? i) : i;
  }
  for (let i = 0; i < marks.length; i++) {
    const seg = Object.assign(segTextOf(eff[i]), { __id: marks[i].id });
    const v = valueOf(seg);
    if (v !== undefined) values[marks[i].id] = v;
  }
}

// ---- ② 商店表:Chest.SetupShop 顶层 case 块(嵌套 switch 的 case 按深度排除) ----
// NPC type → shop slot(NPCInteractions.cs:489-513)
const SHOP_SLOT = {
  17: 1, 19: 2, 20: 3, 38: 4, 54: 5, 107: 6, 108: 7, 124: 8, 142: 9, 160: 10,
  178: 11, 207: 12, 208: 13, 209: 14, 227: 15, 228: 16, 229: 17, 353: 18,
  453: 20, 588: 22, 633: 23, 663: 24,
  550: 21, // 酒馆老板（OOA 双货币店,Chest.cs case 21——旧提取器漏收致永远无商店按钮）
};
function parseGate(text) {
  if (!text) return null;
  // 顶层 OR 切段递归（源码门无嵌套括号组合,split 安全）
  if (text.includes('||')) {
    return orOf(text.split('||').map((seg) => parseGate(seg.trim())));
  }
  let orSeg = false;
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
  if (/!\s*Main\.hardMode|!hardMode/.test(t) && !/[^!]\bhardMode/.test(t.replace(/!Main\.hardMode/g,''))) push('!hardMode');
  else if (has('hardMode')) push('hardMode');
  if (has('downedMechBossAny')) push('downedMechBossAny');
  // NPC.downedGolemBoss（酒保 num11 门 = hardMode && downedGolemBoss → T3 杖 60 勋章/
  // 3871-3882 配饰 50 勋章/3828 永恒水晶 4 铂金,Chest.cs:2944-2946/:3003-3128）
  if (has('downedGolemBoss')) push('downedGolemBoss');
  if (has('downedMechBoss1')) push('downedMechBoss1');
  if (has('downedMechBoss2')) push('downedMechBoss2');
  if (has('downedMechBoss3')) push('downedMechBoss3');
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
  if (!conds.length) return 'skip';
  const joined = conds.join('&&');
  // 顶层 OR（Chest.cs 如军火商银子弹 `(downedBoss2 && 夜) || hardMode`）：text 含
  // 顶层 || 时各 OR 段独立收集,本段结果作为一支——由下方 orOf 汇总（2026-08-13:
  // 旧实现一律 join('&&') 把 OR 收紧成与门,六家店条件语义失真）
  return orSeg ? { seg: joined } : joined;
}
// 顶层 OR 汇总:各段 mini-parse({seg} 形态),skip 段丢弃/null 段恒真
function orOf(segs) {
  const parts = [];
  for (const g of segs) {
    if (g === null) return null;
    if (g === 'skip') continue;
    parts.push(typeof g === 'string' ? g : g.seg);
  }
  if (!parts.length) return 'skip';
  return parts.join('||');
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
    const localBool = new Map();    // `bool flag = <expr>;` 声明 → 门（case 21 酒保
    //   flag/num11 两旗,旧提取器 `if (flag)` 无 token → skip → 勋章条目整段丢弃）
    let d = 2; // case 体起始深度
    let lastEntry = -1;             // 最近一条 SetDefaults 的 stock 下标（shopCustomPrice/
    //   shopSpecialCurrency 赋值行归属）
    let customPriceWrites = 0;      // 同一条目被多次赋价（3828 永恒水晶三档 if/else-if）
    //   → 提取器不表条件变价,放空交运行时直判（Game.shopStockFor Chest.cs:2947-2959）
    for (let li = li0; li < li1; li++) {
      const line = lines[li];
      const isElse = /^\s*else\b/.test(line);
      // `bool <ident> = <expr>;`（Chest.cs:2943-2944 case 21 首两行）→ 解析成门挂在
      // 名字上,后续 `if (<ident>)` 反查。仅收可映射 expr,不可映射不登记（if 时仍 skip）
      const varM = line.match(/^\t+bool (\w+) = (.+);\s*$/);
      if (varM && !localBool.has(varM[1])) {
        const g = parseGate(varM[2]);
        if (g !== null && g !== 'skip') localBool.set(varM[1], g);
      }
      const ifM = line.match(/if \((.+)\)/);
      if (ifM) {
        // 局部旗名先展开（`if (flag)` → flag 的定义门）再走 parseGate
        const condText = localBool.has(ifM[1].trim()) ? localBool.get(ifM[1].trim()) : ifM[1];
        const own = localBool.has(ifM[1].trim()) ? condText : parseGate(ifM[1]);
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
        lastEntry = stock.length - 1;
        customPriceWrites = 0;
      }
      // ---- shopCustomPrice / shopSpecialCurrency（Item.cs:268/:270 字段；
      //   Chest.cs case 21 酒保全段 shopCustomPrice=N + shopSpecialCurrency=
      //   CustomCurrencyID.DefenderMedals = 护卫勋章币种条目）----
      if (lastEntry >= 0) {
        const cpM = line.match(/array\[num\]\.shopCustomPrice = (?:(\d+)|(?:Item\.)?buyPrice\(([\d\s,]*)\));/);
        if (cpM) {
          customPriceWrites++;
          // 纯数字 = 原样（勋章条目时单位=勋章枚数,BuyItem(price, currency) 直比；
          // buyPrice(...) = 换算铜币（GetStoreValue → BuyItem(price) 铜币直比）
          let val;
          if (cpM[1] !== undefined) val = Number(cpM[1]);
          else {
            const args = cpM[2] ? cpM[2].split(',').map((x) => Number(x.trim())) : [];
            val = args.reduce((a, x) => a * 100 + x, 0) * 100 ** (4 - args.length);
          }
          // 单次赋值才落表；多档变价（3828）留空给运行时三档直判
          if (customPriceWrites === 1) stock[lastEntry].customPrice = val;
          else delete stock[lastEntry].customPrice;
        }
        if (/array\[num\]\.shopSpecialCurrency = CustomCurrencyID\.DefenderMedals;/.test(line)) {
          stock[lastEntry].currency = 'DefenderMedals';
        }
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
  out[npcId] = stock.map((s) => ({
    id: s.id, price: values[s.id] ?? null, cond: s.cond,
    ...(s.customPrice !== undefined ? { customPrice: s.customPrice } : {}),
    ...(s.currency !== undefined ? { currency: s.currency } : {}),
  }));
}
const outIdx = process.argv.indexOf('--out');
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : 'src/data/vanilla-shopstock.json';
writeFileSync(OUT_PATH, JSON.stringify({ values, shops: out, src: TREE }));
const total = Object.values(out).reduce((a, s) => a + s.length, 0);
console.log('item values:', Object.keys(values).length, '| stock entries:', total);
for (const [id, s] of Object.entries(out)) console.log(`  npc ${id}: ${s.length} items, priced: ${s.filter((x) => x.price != null).length}`);
