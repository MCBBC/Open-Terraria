// 从反编译源码提取:①物品 value(铜币价) ②各 NPC 商店商品表(Chest.SetupShop case)
// 数据源:Terarria1457 Item.cs SetDefaults1-5(switch-case 块) + Chest.cs SetupShop + NPCInteractions.cs Shop() 映射
//
// ★era guard（BJ215 落闸,四要素习语见 docs/era-guard-family.md;与 extract-travelshop
// 同构守卫）：①SW_TREE 缺省 1457（白名单 1456/1457）;②输出通道三分离——缺省=干跑对拍
// 零写盘（重产 vs 现库动态 diff:「现库有而重产无」的 values 键/商店条目非空=洗库预警
// exit 1+差异清单）/--out <path>=显式写（沙箱）/--write-real=写真库;双旗互斥;--write-real
// 非纯增量拒+差异清单,强推须 --force-full --overwrite-append-era 双旗;③缺省 OUT_PATH
// 锚定脚本自身位置（import.meta.url 派生绝对路径,修 cwd footgun——旧实现相对路径
// 'src/data/...' 从非 game/ 目录跑=写错位置）;④锚 fail-loud（SetupShop 签名/基数护栏）;
// ⑤判别力自证 tests/extract-shops-era-guard.test.ts。BJ215 定谳：values 5334 与现库零
// 漂移;shops 十余家现库领先（richer cond 词表 tenthNotBees/windyDay/notTheBees/has:N/
// downed_4/downed_50/zoneGlowshroom/downedClown/getGoodWorld/anyNpc:N/golfer500/life400/
// mana200/coins1pt/zoneBeach/downed_398/downed_657/moonPhase4 等,本器 parseGate 不识=
// 整条丢弃）——裸跑重产=整批回退（BJ183 登记债「数据面领先差=另一形态」）。
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const GAME_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// SW_TREE（★BJ183 2026-09-20 勘误:缺省已系 Terarria1457,旧注"缺省 1456"系笔误）
const TREE = process.env.SW_TREE || 'Terarria1457';
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
// ---- ① 物品 value:事件回放模型(2026-08-24 R14-C2/C3 重写) ----
// 旧版"case 段迷你求值"三缺陷(蓝队 R14 定谳):
//   a) 只评 `case N:` 直属段——switch 外共享分支族(制作站台 2192-2204/染发剂
//      1977-1986/配重 3309-3314/建造工具 2214-2217/披风 2284-2287/画作
//      1479-1494/派对食物 3739-3741 等)整族漏采 → 货架价塌 100 铜/卖价 0;
//   b) 段内 `if (type == N)`/`if (Variant...)` 守卫不建模,晚写胜出——
//      变体价冒充默认价(3069/517/725/1319/1325/5147)、细分价互相覆盖
//      (5222-5245 画族/2290-2321 海报族/2827-2855 灯笼族);
//   c) SetDefaults 分派器(:48694-48715)不建模——五段按 id 区间五选一
//      (非顺序链),IsFood 走 SetFoodDefaults 替代,尾段(:48716-48929)对全体生效。
// 新模型:作用域栈(switch/case/default/guard)+ 事件回放,逐 id 独立求终值。
//   - case N 事件只对 id==N 生效(fall-through 连续标签并组);
//   - default 对"所属 switch 全量 case 之外"的 id 生效(caseIds 回放时已完整);
//   - 守卫 if(type==N / >=a&&<=b / <a||>b / <=N / >N)收窄,else/else if 取
//     【刚闭合守卫在父约束内的补集】;if(Variant..) 丢弃(商店恒默认变体);
//   - `goto case N`(全文件唯一 Chest 无关,Item.cs:30003)桥接到目标 case 组;
//   - DefaultToXxx 助手调用=按位赋值(源码序,后续 value/SetShopValues 可覆写);
//   - 只读价字段 hellPrice 等 7 个(:71-83)机械换算。
const values = {};
{
  const MAXID = 6250;
  const allLines = itemSrc.split('\n');
  const priceOf = (fn, argStr) => {
    const a = argStr && argStr.trim() ? argStr.split(',').map((x) => Number(x.trim())) : [];
    let v = a.reduce((acc, x) => acc * 100 + x, 0) * 100 ** (4 - a.length);
    if (fn === 'sellPrice') v *= 5;   // Item.cs:49019-49022 sellPrice = ×5
    return v;
  };
  const PRICE_VARS = {   // Item.cs:71-83
    shadowOrbPrice: 75000, dungeonPrice: 87500, queenBeePrice: 100000,
    hellPrice: 125000, eclipsePrice: 375000, eclipsePostPlanteraPrice: 500000,
    eclipseMothronPrice: 625000,
  };
  const valOfLine = (line) => {
    let m = line.match(/value = (\d+)[fFlL]?;/);
    if (m) return Number(m[1]);
    m = line.match(/value = (?:Item\.)?(buyPrice|sellPrice)\(([\d\s,]*)\)/);
    if (m) return priceOf(m[1], m[2]);
    m = line.match(/SetShopValues\(ItemRarityColor\.\w+,\s*(?:(\d+)|(?:Item\.)?(buyPrice|sellPrice)\(([\d\s,]*)\))\)/);
    if (m) return m[1] !== undefined ? Number(m[1]) : priceOf(m[2], m[3]);
    m = line.match(/value = (\w+);/);
    if (m && PRICE_VARS[m[1]] !== undefined) return PRICE_VARS[m[1]];
    return undefined;
  };
  function findMethod(name) {
    const re = new RegExp(`\\n\\t(?:public|private|internal) void ${name}\\(`);
    const mm = itemSrc.match(re);
    if (!mm) return null;
    const startLine = itemSrc.slice(0, mm.index).split('\n').length + 1;
    let d = 0; let started = false;
    for (let i = startLine; i <= allLines.length; i++) {
      for (const ch of allLines[i - 1]) { if (ch === '{') { d++; started = true; } else if (ch === '}') d--; }
      if (started && d <= 0) return { from: startLine, to: i };
    }
    return null;
  }
  function parseTypeGuard(cond) {
    const c = cond.trim();
    if (/^Variant/.test(c) || /ItemID\.Count/.test(c)) return 'never';
    if (/^type == /.test(c) && c.includes('||')) {
      return { discrete: [...c.matchAll(/== (\d+)/g)].map((x) => Number(x[1])) };
    }
    let m = c.match(/^type == (\d+)$/); if (m) return { min: Number(m[1]), max: Number(m[1]) };
    m = c.match(/^type >= (\d+) && type <= (\d+)$/); if (m) return { min: Number(m[1]), max: Number(m[2]) };
    m = c.match(/^type <= (\d+)$/); if (m) return { min: 1, max: Number(m[1]) };
    m = c.match(/^type < (\d+)$/); if (m) return { min: 1, max: Number(m[1]) - 1 };
    m = c.match(/^type > (\d+)$/); if (m) return { min: Number(m[1]) + 1, max: MAXID };
    m = c.match(/^type >= (\d+)$/); if (m) return { min: Number(m[1]), max: MAXID };
    m = c.match(/^type < (\d+) \|\| type > (\d+)$/); if (m) return { complement: { min: Number(m[1]), max: Number(m[2]) } };
    return 'unknown';
  }
  function complementOf(r) {
    if (r === 'never') return null;
    if (r.discrete) {
      const ids = [];
      for (let i = 1; i <= MAXID; i++) if (!r.discrete.includes(i)) ids.push(i);
      return { discrete: ids };
    }
    if (r.complement) return { min: r.complement.min, max: r.complement.max };
    return { complement: { min: r.min, max: r.max } };
  }
  function intersectDiscreteRange(discrete, r) {
    const ranges = r.complement ? [[1, r.complement.min - 1], [r.complement.max + 1, MAXID]] : [[r.min, r.max]];
    const ids = discrete.filter((x) => ranges.some(([lo, hi]) => x >= lo && x <= hi));
    return ids.length ? { discrete: ids } : null;
  }
  function intersect(a, b) {
    if (!a || !b) return null;
    if (a === 'never' || b === 'never') return 'never';
    if (a.discrete && b.discrete) { const s = a.discrete.filter((x) => b.discrete.includes(x)); return s.length ? { discrete: s } : null; }
    if (a.discrete) return intersectDiscreteRange(a.discrete, b);
    if (b.discrete) return intersectDiscreteRange(b.discrete, a);
    const rangesA = a.complement ? [[1, a.complement.min - 1], [a.complement.max + 1, MAXID]] : [[a.min, a.max]];
    const rangesB = b.complement ? [[1, b.complement.min - 1], [b.complement.max + 1, MAXID]] : [[b.min, b.max]];
    const segs = [];
    for (const [x1, x2] of rangesA) for (const [y1, y2] of rangesB) {
      const lo = Math.max(x1, y1), hi = Math.min(x2, y2);
      if (lo <= hi) segs.push([lo, hi]);
    }
    if (!segs.length) return null;
    if (segs.length === 1) return { min: segs[0][0], max: segs[0][1] };
    return { multi: segs };
  }
  // 单方法体事件表(作用域栈:switch/case/default/guard)
  function buildEvents(from, to) {
    const events = [];
    const stack = [];
    let depth = 0;
    let pendingIds = null;
    let prevWasLabel = false;
    let pendingElse = null;
    let pendingGoto = null;
    const innermostSw = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].kind === 'switch') return stack[i]; return null; };
    for (let ln = from; ln <= to; ln++) {
      const line = allLines[ln - 1];
      const closes = (line.match(/\}/g) || []).length;
      const opens = (line.match(/\{/g) || []).length;
      if (closes > 0 && /^\t+\}/.test(line)) {
        while (stack.length && stack[stack.length - 1].depth >= depth) {
          const p = stack.pop();
          if (p.kind === 'guard' && p.r && p.r !== 'never') pendingElse = p.r;
        }
        depth--;
      }
      const cm = line.match(/^\t+case (\d+):\s*$/);
      if (cm) {
        const sw = innermostSw();
        if (sw) sw.caseIds.add(Number(cm[1]));
        if (prevWasLabel && pendingIds) pendingIds.push(Number(cm[1]));
        else pendingIds = [Number(cm[1])];
        prevWasLabel = true;
        continue;
      }
      prevWasLabel = false;
      if (/^\t+switch \(type\)\s*$/.test(line) && /^\t+\{\s*$/.test(allLines[ln] || '')) {
        if (pendingIds) flushCase(false);   // 嵌套 switch 在外层 case 体内:不弹兄弟
        stack.push({ kind: 'switch', caseIds: new Set(), depth: depth + 1 });
        continue;   // 深度由下一行 { 递增(避免双计)
      }
      const elseM = line.match(/^\t+\}?\s*else if \(([^)]*)\)\s*\{?\s*$/) || line.match(/^\t+\}?\s*else\s*\{?\s*$/);
      const gotoM = line.match(/^\t+goto case (\d+);\s*$/);
      if (gotoM) {
        // goto case N(Item.cs 全文件唯一 :30003):可达路径 = 刚闭合守卫的补集
        const ranges = pendingElse ? [complementOf(pendingElse)].filter(Boolean) : [];
        pendingGoto = { target: Number(gotoM[1]), ranges };
        pendingElse = null;
        continue;
      }
      if (elseM && pendingElse) {
        const comp = complementOf(pendingElse);
        let r = comp;
        if (elseM[1]) {
          const g = parseTypeGuard(elseM[1]);
          r = intersect(g === 'never' ? null : g, comp);
          if (!r) r = 'never';
        }
        pendingElse = null;
        const blockBrace = /\{\s*$/.test(line) || /^\t+\{\s*$/.test(allLines[ln] || '');
        if (r !== 'never' && blockBrace) stack.push({ kind: 'guard', r, depth: depth + 1 });
        continue;   // 深度由本行/下一行 { 递增
      }
      if (!elseM && closes === 0) pendingElse = null;   // 真实语句行清除(} 行刚设的补集留给 else/goto)
      function flushCase(popSiblings = true) {
        const sw = innermostSw();
        if (popSiblings) while (stack.length && (stack[stack.length - 1].kind === 'case' || stack[stack.length - 1].kind === 'default') && stack[stack.length - 1].depth >= depth) stack.pop();
        let alsoIds = null;
        if (pendingGoto && pendingIds && pendingIds.includes(pendingGoto.target)) {
          alsoIds = pendingGoto.ranges.length ? pendingGoto.ranges : null;
          pendingGoto = null;
        }
        stack.push({ kind: 'case', ids: new Set(pendingIds), depth, sw, alsoIds });
        pendingIds = null;
      }
      if (/^\t+default:\s*$/.test(line)) {
        const sw = innermostSw();
        while (stack.length && (stack[stack.length - 1].kind === 'case' || stack[stack.length - 1].kind === 'default') && stack[stack.length - 1].depth >= depth) stack.pop();
        stack.push({ kind: 'default', sw, depth });
      } else {
        if (pendingIds) flushCase();
      }
      {
        if (/^\t+if \(/.test(line)) {
          const condM = line.match(/^\t+if \(([^)]*)\)\s*\{?\s*$/);
          const blockBrace = /\{\s*$/.test(line) || /^\t+\{\s*$/.test(allLines[ln] || '');
          if (condM) {
            const g = parseTypeGuard(condM[1]);
            if (g === 'never' || g === 'unknown') {
              if (blockBrace) stack.push({ kind: 'guard', r: 'never', depth: depth + 1 });
            } else if (blockBrace) {
              stack.push({ kind: 'guard', r: g, depth: depth + 1 });
            }
          } else if (blockBrace) {
            stack.push({ kind: 'guard', r: 'never', depth: depth + 1 });  // 复杂多条件:保守不计
          }
        }
        const v = valOfLine(line);
        if (v !== undefined) events.push({ ln, value: v, stack: stack.map((s) => ({ ...s })) });
        for (const hm of line.matchAll(/(?:^|[^.\w])(DefaultTo\w+)\(/g)) {
          events.push({ ln, helper: hm[1], stack: stack.map((s) => ({ ...s })) });
        }
        if (/^\t+return;\s*$/.test(line)) events.push({ ln, ret: true, stack: stack.map((s) => ({ ...s })) });
      }
      depth += opens;
    }
    return events;
  }
  function inRanges(ranges, id) {
    return ranges.every((r) => {
      if (r === 'never') return false;
      if (r.discrete) return r.discrete.includes(id);
      if (r.complement) return id < r.complement.min || id > r.complement.max;
      if (r.multi) return r.multi.some(([lo, hi]) => id >= lo && id <= hi);
      return id >= r.min && id <= r.max;
    });
  }
  function scopeApplies(st, id) {
    if (st.kind === 'case') return st.ids.has(id) || (st.alsoIds && inRanges(st.alsoIds, id));
    if (st.kind === 'default') return st.sw ? !st.sw.caseIds.has(id) : true;
    if (st.kind === 'guard') {
      if (st.r === 'never') return false;
      if (st.r.discrete) return st.r.discrete.includes(id);
      if (st.r.complement) return id < st.r.complement.min || id > st.r.complement.max;
      if (st.r.multi) return st.r.multi.some(([lo, hi]) => id >= lo && id <= hi);
      return id >= st.r.min && id <= st.r.max;
    }
    return true;
  }
  const helperCache = new Map();
  const helperVisiting = new Set();
  function evalHelper(name, id) {
    const key = `${name}:${id}`;
    if (helperCache.has(key)) return helperCache.get(key);
    if (helperVisiting.has(key)) return undefined;   // 环:断开
    helperVisiting.add(key);
    const r = findMethod(name);
    let v;
    if (r) {
      for (const ev of buildEvents(r.from, r.to)) {
        if (!ev.stack.every((s) => scopeApplies(s, id))) continue;
        if (ev.ret) break;
        if (ev.helper) { const hv = evalHelper(ev.helper, id); if (hv !== undefined) v = hv; }
        else v = ev.value;
      }
    }
    helperVisiting.delete(key);
    helperCache.set(key, v);
    return v;
  }
  // SetDefaults 分派(:48694-48715):IsFood→SetFoodDefaults【替代】;否则 id 段五选一
  const IS_FOOD = new Set([353, 357, 1787, 1911, 1912, 1919, 1920, 2266, 2267, 2268, 2425, 2426, 2427, 3195, 3532, 4009, 4010, 4011, 4012, 4013, 4014, 4015, 4016, 4017, 4018, 4019, 4020, 4021, 4022, 4023, 4024, 4025, 4026, 4027, 4028, 4029, 4030, 4031, 4032, 4033, 4034, 4035, 4036, 4037, 967, 969, 4282, 4283, 4284, 4285, 4286, 4287, 4288, 4289, 4290, 4291, 4292, 4293, 4294, 4295, 4296, 4297, 4403, 4411, 4614, 4615, 4616, 4617, 4618, 4619, 4620, 4621, 4622, 4623, 4624, 4625, 5009, 5042, 5041, 5092, 5093, 5275, 5277, 5278, 5537, 5645]);  // ItemID.cs:264
  const methodEvents = {};
  for (const n of ['SetDefaults1', 'SetDefaults2', 'SetDefaults3', 'SetDefaults4', 'SetDefaults5', 'SetFoodDefaults']) {
    const r = findMethod(n);
    methodEvents[n] = r ? buildEvents(r.from, r.to) : [];
  }
  const sdTail = findMethod('SetDefaults');
  const tailEvents = sdTail ? buildEvents(sdTail.to - 213, sdTail.to) : [];   // 尾段=分派后(~:48716 起)
  const ownerMethod = (id) => IS_FOOD.has(id) ? 'SetFoodDefaults'
    : id <= 1000 ? 'SetDefaults1' : id <= 2001 ? 'SetDefaults2'
      : id <= 3000 ? 'SetDefaults3' : id <= 3989 ? 'SetDefaults4' : 'SetDefaults5';
  for (let id = 1; id <= MAXID; id++) {
    let v;
    for (const ev of methodEvents[ownerMethod(id)]) {
      if (!ev.stack.every((s) => scopeApplies(s, id))) continue;
      if (ev.ret) break;
      if (ev.helper) { const hv = evalHelper(ev.helper, id); if (hv !== undefined) v = hv; }
      else v = ev.value;
    }
    for (const ev of tailEvents) {
      if (!ev.stack.every((s) => scopeApplies(s, id))) continue;
      if (ev.ret) break;
      if (ev.helper) { const hv = evalHelper(ev.helper, id); if (hv !== undefined) v = hv; }
      else v = ev.value;
    }
    if (v !== undefined) values[id] = v;
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
  if (start < 0) throw new Error('[extract-shops] 锚点失配: SetupShop(int type) 签名未找到（Chest.cs 漂移,禁止静默空扫）');
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
// ================= ★BJ215 era guard：干跑对拍 / --out 沙箱 / --write-real（头注见上） =================
const total = Object.values(out).reduce((a, s) => a + s.length, 0);
if (Object.keys(values).length < 5000 || total < 250) {
  throw new Error(`[extract-shops] 锚点失配: 基数护栏 values=${Object.keys(values).length}(<5000?) stock=${total}(<250?)——解析面漂移,禁止静默半表`);
}
const FRESH = JSON.stringify({ values, shops: out, src: TREE });
const LIVE_JSON = join(GAME_ROOT, 'src', 'data', 'vanilla-shopstock.json');
const outIdx = process.argv.indexOf('--out');
// ★M1 变异锚:干跑臂 null(守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面)
const OUT_PATH = outIdx >= 0 ? process.argv[outIdx + 1] : null;
const WRITE_REAL = process.argv.includes('--write-real');
const FORCE_FULL = process.argv.includes('--force-full');
const OVERWRITE_APPEND_ERA = process.argv.includes('--overwrite-append-era');
if (OUT_PATH && WRITE_REAL) {
  console.error('[extract-shops] 拒绝运行：--out 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 --out <path>；确认定谳后更新现库用 --write-real。');
  process.exit(1);
}
/** 现库 vs 重产动态 diff：values 缺键/值漂移 + 每店条目多重集差（键=id,值=整条 JSON）。 */
function washOf(liveRaw) {
  let live;
  try { live = JSON.parse(liveRaw); } catch { return null; } // 坏损:不拦
  const wash = { valuesMissing: [], valuesDrift: [], shops: {} };
  const lv = live.values ?? {};
  for (const [k, v] of Object.entries(lv)) {
    if (values[k] === undefined) wash.valuesMissing.push(k);
    else if (values[k] !== v) wash.valuesDrift.push(`${k}:${v}→${values[k]}`);
  }
  const sig = (e) => JSON.stringify(e);
  for (const [npc, stock] of Object.entries(live.shops ?? {})) {
    const freshSet = new Set((out[npc] ?? []).map(sig));
    const liveOnly = (stock ?? []).filter((e) => !freshSet.has(sig(e)));
    if (liveOnly.length) wash.shops[npc] = { n: liveOnly.length, samples: liveOnly.slice(0, 2).map(sig) };
  }
  return wash;
}
const washEmpty = (w) => !w || (w.valuesMissing.length === 0 && w.valuesDrift.length === 0 && Object.keys(w.shops).length === 0);
const washReport = (w) => {
  console.error('  物证（现库领先面——重产整批回退面/差异清单）：');
  if (w.valuesMissing.length) console.error(`    values 现库 ${w.valuesMissing.length} 键重产盖不住: ${w.valuesMissing.slice(0, 8).join(', ')}${w.valuesMissing.length > 8 ? '…' : ''}`);
  if (w.valuesDrift.length) console.error(`    values 值漂移 ${w.valuesDrift.length} 键: ${w.valuesDrift.slice(0, 4).join(' | ')}`);
  for (const [npc, s] of Object.entries(w.shops)) console.error(`    npc ${npc}: 现库 ${s.n} 条重产盖不住（如 ${s.samples.join(' | ')}）`);
};
const liveRaw = existsSync(LIVE_JSON) ? readFileSync(LIVE_JSON, 'utf8') : null;
const wash = liveRaw === null ? null : washOf(liveRaw);
if (OUT_PATH || WRITE_REAL) {
  if (WRITE_REAL) {
    if (wash && !washEmpty(wash) && !(FORCE_FULL && OVERWRITE_APPEND_ERA)) {
      console.error('[extract-shops] 拒绝 --write-real：重产 diff 非纯增量（现库领先面非空）——禁止静默覆盖领先条目（BJ183 登记债:重产前先恢复 parseGate 词表）。');
      washReport(wash);
      console.error('  确需原地强推：--force-full --overwrite-append-era 双旗（单旗仍拒）。');
      process.exit(1);
    }
    if (wash && !washEmpty(wash)) console.error('[extract-shops] 双旗强推：静默覆盖预警已确认——现库领先条目将被整批回退（责任在操作者定谳）。');
  }
  writeFileSync(WRITE_REAL ? LIVE_JSON : OUT_PATH, FRESH);
  console.error(`[extract-shops] 已写 ${WRITE_REAL ? LIVE_JSON : OUT_PATH}（${WRITE_REAL ? '--write-real 真库' : '--out 显式路径'}）`);
} else {
  // 缺省干跑对拍（零写盘）
  if (!liveRaw) {
    console.error('[extract-shops] 干跑（零写盘）：现库缺 vanilla-shopstock.json,跳过对拍。写盘须显式 --out <path> 或 --write-real。');
  } else if (wash && !washEmpty(wash)) {
    console.error('[extract-shops] 干跑对拍：检测到「现库有而重产无」的条目=洗库预警（裸跑重产=整批回退）——零写盘。');
    washReport(wash);
    console.error('  活通道：重产前先恢复 parseGate 词表（BJ183 登记债）；沙箱试验用 --out <path>。');
    process.exit(1);
  } else {
    console.error('[extract-shops] 干跑对拍：重产盖住现库（零写盘）。写盘须显式 --out <path> 或 --write-real。');
  }
}
console.log('item values:', Object.keys(values).length, '| stock entries:', total);
for (const [id, s] of Object.entries(out)) console.log(`  npc ${id}: ${s.length} items, priced: ${s.filter((x) => x.price != null).length}`);
