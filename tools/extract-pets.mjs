// 宠物物品提取器：Terarria1457/Terraria/Item.cs SetDefaults →
// { itemId: { buff, proj, light } }（light = Main.lightPet[buff]）。
// ★BJ215 2026-09-20 重锚 1457（BJ183 登记债清偿,petai 重锚习语）：本器为 case 结构扫描
//   （无局部号锚）,BJ215 沙箱重产三方对拍定谳——1457 重锚产物与现库【逐字节零差】
//   （83 件）,1458 同逐字节零差,零差只换锚。
// 判定：case 块内同时出现 `buffType = N` 与 `shoot = N`，且无 `consumable = true`
//（食物=consumable+buffType 无 shoot；武器=shoot 无 buffType）。
// 输出 src/data/vanilla-pets.json；vanity/light 分类取 Main.cs 的
// `vanityPet[N] = true` / `lightPet[N] = true` 赋值表。
//
// ★era guard（BJ215 落闸,四要素习语见 docs/era-guard-family.md）：
//   ① SW_ITEM_VER 缺省 1457（白名单 1457/1458——结构扫描两版语义同,1458=逐字节对拍面;
//     1456 锚已退役:数据面与 1457 全等已定谳,显式 1456 拒并给指引）;
//   ② 输出通道三分离：缺省=干跑对拍零写盘（重产 vs 现库逐字节对拍——零漂移 exit 0/
//     漂移 exit 1+物证,B-form）/ SW_OUT=<dir>（canonical）或 PETS_OUT=<path>（FX53
//     legacy 别名,向后兼容,可为完整文件路径或目录）写沙箱 / --write-real 逃生门;
//     SW_OUT/PETS_OUT 与 --write-real 双旗互斥;SW_ITEM_VER≠1457 禁写真库;
//   ③ 锚 fail-loud：DefaultToVanitypet 4797 公式块/vanityPet·lightPet 表基数/宠物总数
//     基数/4797-4817 boss 宠 21 件/3855-3857 SW-FX53 钉值,失配 throw;
//   ④ 判别力自证：tests/extract-pets-era-guard.test.ts（变异:摘干跑门=静默写库;毒化锚
//     =fail-loud）。注：本器读侧无探测注入面,g1 不适用。
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
// ================= era guard ①：源版本 fail-closed + 输出通道 =================
const VER = process.env.SW_ITEM_VER ?? '1457';
const VER_ALLOWED = new Set(['1457', '1458']);
if (!VER_ALLOWED.has(VER) || !existsSync(join(ROOT, `Terarria${VER}`, 'Terraria', 'Item.cs'))) {
  console.error(`[extract-pets] 拒绝运行：SW_ITEM_VER="${VER}" 非法（白名单 ${[...VER_ALLOWED].join('/')}，且需存在 Terarria${VER}/ 反编译目录）。`);
  if (VER === '1456') console.error('  1456 锚已随 BJ215 重锚退役：数据面与 1457 全等（BJ183 定谳 + BJ215 沙箱三方对拍逐字节零差），对拍用 SW_ITEM_VER=1458 或读定谳档案。');
  process.exit(1);
}
const WRITE_REAL = process.argv.includes('--write-real');
const SW_OUT = process.env.SW_OUT;
const PETS_OUT = process.env.PETS_OUT; // SW-FX53 legacy 别名（SW_OUT canonical）
const SANDBOX = SW_OUT !== undefined && SW_OUT !== '' ? SW_OUT : PETS_OUT;
if (SANDBOX !== undefined && SANDBOX !== '' && WRITE_REAL) {
  console.error('[extract-pets] 拒绝运行：SW_OUT/PETS_OUT 与 --write-real 双旗互斥（输出通道必须唯一）。');
  console.error('  处置：沙箱对拍用 SW_OUT=<dir>（或 PETS_OUT=<path>）；确认定谳后更新现库用 --write-real（且 SW_ITEM_VER=1457）。');
  process.exit(1);
}
if (WRITE_REAL && VER !== '1457') {
  console.error(`[extract-pets] 拒绝写真库：SW_ITEM_VER=${VER}≠1457（旧基线重放禁写 game/src/data/vanilla-pets.json）。`);
  console.error('  处置：重放对拍请走 SW_OUT 沙箱；确要回写 1457 终值请去掉 SW_ITEM_VER 显式注入（缺省即 1457）。');
  process.exit(1);
}
const SRC = join(ROOT, `Terarria${VER}`, 'Terraria', 'Item.cs');
const MAIN = join(ROOT, `Terarria${VER}`, 'Terraria', 'Main.cs');
const LIVE_JSON = join(ROOT, 'game', 'src', 'data', 'vanilla-pets.json');
// ★M1 变异锚:干跑臂 null(守卫测试把 null 换成假现库路径,证明缺省零写盘是唯一拦截面)
const OUT = WRITE_REAL ? LIVE_JSON
  : (SANDBOX !== undefined && SANDBOX !== ''
    ? (SANDBOX.endsWith('.json') ? SANDBOX : join(SANDBOX.replace(/\/+$/, ''), 'vanilla-pets.json'))
    : null);

const itemSrc = readFileSync(SRC, 'utf8');
const mainSrc = readFileSync(MAIN, 'utf8');
// era guard ③：锚 fail-loud（源码漂移即报错退出,petai 原旨——禁止静默兜底）
if (!/DefaultToVanitypet\(881 \+ type - 4797/.test(itemSrc)) {
  throw new Error('[extract-pets] 锚点失配: DefaultToVanitypet(881 + type - 4797) boss 宠公式块未找到（Item.cs 漂移）');
}

// ---- Main.cs vanityPet/lightPet 布尔表 ----
const grabBoolTable = (name) => {
  const set = new Set();
  const re = new RegExp(`(?:vanityPet|lightPet)\\[${name}\\]`); // 不抓表本身，见下方逐条
  void re;
  return set;
};
// 实际赋值形如 `vanityPet[N] = true;` 或 `lightPet[N] = true;`
const vanityPet = new Set();
const lightPet = new Set();
for (const m of mainSrc.matchAll(/vanityPet\[(\d+)\] = true;/g)) vanityPet.add(+m[1]);
for (const m of mainSrc.matchAll(/lightPet\[(\d+)\] = true;/g)) lightPet.add(+m[1]);
// era guard ③：Main.cs 表基数护栏（正则静默漏配=不变量校验假绿,禁止吃空表继续）
if (vanityPet.size < 70 || lightPet.size < 10) {
  throw new Error(`[extract-pets] 锚点失配: Main.vanityPet=${vanityPet.size}(<70?)/lightPet=${lightPet.size}(<10?) 表基数漂移（Main.cs 漂移或正则漏配）`);
}

// ---- Item.cs SetDefaults switch 逐 case 解析 ----
// switch 起止：`switch (type)`（SetDefaults 内第一个）到文件尾的 case 区。
// 用行扫描维护 case 标签栈（case N:/case N:/default: 共享块），块内收集赋值。
// ★SW-FX53 2026-09-13 两刀（FX48 boss 宠 21 件根因 + DD2 三宠伪值根治）：
//  ① DefaultToVanitypet 实参算式——`DefaultToVanitypet(881 + type - 4797,
//     284 + type - 4797)`（Item.cs 1456:39417-39440 共享块,1458:39417-39440 同值;
//     1456/1457/1458 三版 DefaultToVanitypet 调用 32 处逐字面 diff=0）此前只吃
//     字面量参数,4797-4817 boss 宠整批漏提（vanilla-pets.json 由 FX48 手补 21 行,
//     重产即回退——本刀转解析直出）。
//  ② 嵌套 switch(type) per-id 归属——`case 3855/3856/3857: 基值 200/703 +
//     switch (type) { case 3856: 201/702; case 3857: 202/701; }`（Item.cs:33997-34015
//     1458 同位:34022-34040）旧行扫描把嵌套 case 的赋值覆写到【全组】,3855 被打成
//     201/702（盘上值 200/703 才是反编译真值）——本刀嵌套 case 只归本 id。
const lines = itemSrc.split('\n');
let pets = {};
let curCases = [];
let block = null; // { buff, shoot, consumable, damage, vanityArgs?, nested? }
/** SW-FX53: 宠物实参求值——数字字面量 / `type` 线性算式（数字/四则/括号）,
 *  其余形态（形参名等）返回 undefined（沉默,宁缺勿伪）。 */
const evalPetArg = (expr, id) => {
  if (expr === undefined) return undefined;
  const js = expr.replace(/\(ushort\)/g, '').replace(/\btype\b/g, `(${id})`).replace(/\s+/g, '');
  if (!/^[-+*/()0-9]+$/.test(js)) return undefined;
  return Math.trunc(Function(`"use strict"; return (${js});`)());
};
/** 块 → 某 id 的终值（基值 + 嵌套 switch(type) per-id 覆写） */
const resolveBlock = (id) => {
  let { buff, shoot, damage, consumable } = block;
  if (block.vanityArgs) {
    const p = evalPetArg(block.vanityArgs[0], id);
    const b = evalPetArg(block.vanityArgs[1], id);
    if (p !== undefined) shoot = p;
    if (b !== undefined) buff = b;
  }
  const nz = block.nested;
  if (nz) {
    const o = nz.cases.get(id) ?? nz.def;
    if (o) {
      if (o.buff !== undefined) buff = o.buff;
      if (o.shoot !== undefined) shoot = o.shoot;
      if (o.damage !== undefined) damage = o.damage;
      if (o.consumable) consumable = true;
      if (o.vanityArgs) {
        const p = evalPetArg(o.vanityArgs[0], id);
        const b = evalPetArg(o.vanityArgs[1], id);
        if (p !== undefined) shoot = p;
        if (b !== undefined) buff = b;
      }
    }
  }
  return { buff, shoot, damage, consumable };
};
const flush = () => {
  // ★ damage>0 = 召唤杖/武器（buffType=随从 buff + shoot=随从弹——与宠物同模式，
  //   唯一区分 = 宠物恒 damage=0；曾漏此门混入 24 件召唤杖假阳性）
  if (block && curCases.length) {
    for (const id of curCases) {
      const r = resolveBlock(id);
      if (r.buff != null && r.shoot != null && !r.consumable && (r.damage ?? 0) === 0) {
        pets[id] = { buff: r.buff, proj: r.shoot, light: lightPet.has(r.buff) ? 1 : 0 };
      }
    }
  }
  block = null;
  pendingSw = false;
};
const startBlock = () => {
  flush();
  block = { buff: null, shoot: null, consumable: false, damage: null, nested: null };
};
let pendingSw = false;   // SW-FX53: `switch (type)` 行已见、待其 `{` 行进入嵌套态
/** 嵌套 case 目标（undefined = 当前赋值不落嵌套面,写基值） */
const nestedTarget = () => {
  const nz = block?.nested;
  if (!nz) return undefined;
  if (nz.cur === 'def') return nz.def ?? (nz.def = {});
  if (typeof nz.cur === 'number') {
    if (!nz.cases.has(nz.cur)) nz.cases.set(nz.cur, {});
    return nz.cases.get(nz.cur);
  }
  return undefined;
};
const applyAssign = (target, kind, v) => {
  if (!target) return false;
  if (kind === 'buff') target.buff = v;
  else if (kind === 'shoot') target.shoot = v;
  else if (kind === 'damage') target.damage = v;
  else if (kind === 'consumable') target.consumable = true;
  else if (kind === 'vanity') { target.shoot = v[0]; target.buff = v[1]; }
  return true;
};
for (const line of lines) {
  const t = line.trim();
  const cm = t.match(/^case (\d+):$/);
  if (cm) {
    if (block?.nested) {   // SW-FX53: 嵌套 case 只归本 id
      const nz = block.nested;
      nz.cur = +cm[1];
      if (!nz.cases.has(nz.cur)) nz.cases.set(nz.cur, {});
      continue;
    }
    if (!block) startBlock();
    curCases.push(+cm[1]);
    continue;
  }
  if (t === 'default:') {
    if (block?.nested) { block.nested.cur = 'def'; continue; }   // SW-FX53: 嵌套 default
    flush();
    curCases = [];
    block = { buff: null, shoot: null, consumable: false, damage: null, nested: null };
    continue;
  }
  if (t === 'switch (type)' && block) { pendingSw = true; continue; }   // SW-FX53: 嵌套 switch 头
  if (t === '{' && pendingSw && block) {
    block.nested = { cases: new Map(), def: null, cur: null };
    pendingSw = false;
    continue;
  }
  if (t === '}') {   // SW-FX53: 嵌套 switch 闭合（外层 case 无行级花括号,见 `}` 即嵌套尾）
    if (block?.nested) { block.nested.cur = null; block.nested.closed = true; }
    pendingSw = false;
    continue;
  }
  const bm = t.match(/^buffType = (\d+);$/);
  if (bm && block) {
    if (!applyAssign(nestedTarget(), 'buff', +bm[1])) block.buff = +bm[1];
    continue;
  }
  const sm = t.match(/^shoot = (\d+);$/);
  if (sm && block) {
    if (!applyAssign(nestedTarget(), 'shoot', +sm[1])) block.shoot = +sm[1];
    continue;
  }
  // DefaultToVanitypet(projId, buffId)（:47549——参数序与直赋值相反）
  // SW-FX53: 实参放宽为算式形态（881 + type - 4797 共享块,见文件头注①）
  const pm = t.match(/^DefaultToVanitypet\((.+),\s*(.+)\);$/);
  if (pm && block) {
    const args = [pm[1].trim(), pm[2].trim()];
    if (!applyAssign(nestedTarget(), 'vanity', args)) block.vanityArgs = args;
    continue;
  }
  const dm = t.match(/^damage = (\d+);$/);
  if (dm && block) {
    if (!applyAssign(nestedTarget(), 'damage', +dm[1])) block.damage = +dm[1];
    continue;
  }
  if (t === 'consumable = true;' && block) {
    if (!applyAssign(nestedTarget(), 'consumable')) block.consumable = true;
    continue;
  }
  if (t.startsWith('break;') || t.startsWith('return;')) {
    if (block?.nested && block.nested.cur !== null && block.nested.cur !== undefined && !block.nested.closed) {
      block.nested.cur = null;   // 嵌套 case 的 break：只出嵌套 case,不 flush
      continue;
    }
    flush();
    curCases = [];
  }
}
flush();

// ---- 交叉校验：vanilla-equip.json 的 pet/light 分类 ----
const eq = JSON.parse(readFileSync(join(ROOT, 'game', 'src', 'data', 'vanilla-equip.json'), 'utf8'));
const eqPet = new Set(eq.pet ?? []);
const eqLight = new Set(eq.light ?? []);
let eqOnly = [];
for (const id of [...eqPet, ...eqLight]) {
  if (!pets[id]) eqOnly.push(id);
}
console.log(`提取宠物物品 ${Object.keys(pets).length} 件（vanity ${Object.keys(pets).filter(k => !pets[k].light).length} / light ${Object.keys(pets).filter(k => pets[k].light).length}）`);
console.log(`Main.vanityPet 表 ${vanityPet.size} 项 / lightPet 表 ${lightPet.size} 项`);
if (eqOnly.length) console.log(`equip.json 有而本表无（非 buffType+shoot 模式，多为 DefaultTo* 变体）: ${eqOnly.join(', ')}`);
// ★ 强不变量：每条 buff 必须落在 vanityPet ∪ lightPet 表内（否则为解析假阳性）
const bad = Object.entries(pets).filter(([, v]) => !vanityPet.has(v.buff) && !lightPet.has(v.buff));
if (bad.length) {
  console.error(`不变量违反（buff 不在宠物表 = 假阳性）: ${JSON.stringify(bad)}`);
  process.exit(1);
}
console.log('不变量校验 ✓ 每条 buff ∈ vanityPet ∪ lightPet');

// ================= era guard ③：结果基数护栏 + SW-FX53 钉值（fail-loud） =================
{
  const petCount = Object.keys(pets).length;
  if (petCount < 80) throw new Error(`[extract-pets] 锚点失配: 宠物基数 ${petCount} < 80（解析面漂移,禁止静默半表）`);
  const bossPets = Object.keys(pets).filter((k) => +k >= 4797 && +k <= 4817);
  if (bossPets.length !== 21) {
    throw new Error(`[extract-pets] 锚点失配: boss 宠 4797-4817 应 21 件,实 ${bossPets.length}（DefaultToVanitypet 公式面漂移,FX48 补层回归）`);
  }
  // SW-FX53 ② 回归钉（Item.cs:33997-34015 嵌套 switch(type) per-id 归属——
  // 旧实现曾把嵌套 case 覆写污染到全组,3855 被打成 201/702）
  const PIN_3855_7 = { 3855: [200, 703], 3856: [201, 702], 3857: [202, 701] };
  for (const [id, [buff, proj]] of Object.entries(PIN_3855_7)) {
    const r = pets[id];
    if (!r || r.buff !== buff || r.proj !== proj) {
      throw new Error(`[extract-pets] 锚点失配: ${id} 钉值 buff=${buff}/proj=${proj}（SW-FX53 ② 嵌套 switch 归属回归）,实 ${JSON.stringify(r ?? null)}`);
    }
  }
}

// ================= era guard ②：干跑对拍 / 沙箱 / --write-real（头注见上） =================
const FRESH = JSON.stringify(pets, null, 0);
if (!OUT) {
  // 缺省干跑对拍（零写盘,B-form）
  const liveRaw = existsSync(LIVE_JSON) ? readFileSync(LIVE_JSON, 'utf8') : null;
  if (!liveRaw) {
    console.error('[extract-pets] 干跑（零写盘）：现库缺 vanilla-pets.json,跳过对拍。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else if (liveRaw === FRESH) {
    console.error('[extract-pets] 干跑对拍：重产与现库逐字节零漂移（零写盘）。写盘须显式 SW_OUT=<dir> 或 --write-real。');
  } else {
    let live = null;
    try { live = JSON.parse(liveRaw); } catch { /* 坏损:物证落空 */ }
    console.error('[extract-pets] 干跑对拍：漂移（零写盘 exit 1）。');
    if (live) {
      const liveOnly = Object.keys(live).filter((k) => pets[k] === undefined);
      const freshOnly = Object.keys(pets).filter((k) => live[k] === undefined);
      const drift = Object.keys(live).filter((k) => pets[k] !== undefined && JSON.stringify(pets[k]) !== JSON.stringify(live[k]));
      if (liveOnly.length) console.error(`  现库 ${liveOnly.length} 键重产盖不住: ${liveOnly.slice(0, 10).join(', ')}`);
      if (freshOnly.length) console.error(`  重产新增 ${freshOnly.length} 键: ${freshOnly.slice(0, 10).join(', ')}`);
      if (drift.length) console.error(`  值漂移 ${drift.length} 键: ${drift.slice(0, 2).map((k) => `${k}:${JSON.stringify(live[k])}→${JSON.stringify(pets[k])}`).join(' | ')}${drift.length > 2 ? '…' : ''}`);
    }
    console.error('  正常更新流：定谳漂移源后 --write-real 显式写盘（SW_ITEM_VER 缺省 1457）。');
    process.exit(1);
  }
} else {
  mkdirSync(OUT.slice(0, Math.max(OUT.lastIndexOf('/'), 0)) || '.', { recursive: true });
  writeFileSync(OUT, FRESH);
  console.error(`[extract-pets] 已写 ${OUT}（${WRITE_REAL ? '--write-real 真库' : 'SW_OUT/PETS_OUT 沙箱'}，SW_ITEM_VER=${VER}）`);
}
