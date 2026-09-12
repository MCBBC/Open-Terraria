// 宠物物品提取器：Terarria1456/Terraria/Item.cs SetDefaults →
// { itemId: { buff, proj, light } }（light = Main.lightPet[buff]）。
// 判定：case 块内同时出现 `buffType = N` 与 `shoot = N`，且无 `consumable = true`
//（食物=consumable+buffType 无 shoot；武器=shoot 无 buffType）。
// 输出 src/data/vanilla-pets.json；vanity/light 分类取 Main.cs 的
// `vanityPet[N] = true` / `lightPet[N] = true` 赋值表。
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SRC = join(ROOT, 'Terarria1456', 'Terraria', 'Item.cs');
const MAIN = join(ROOT, 'Terarria1456', 'Terraria', 'Main.cs');
// SW-FX53 2026-09-13: PETS_OUT/SW_FX53_OUT 试产重定向（禁真写纪律——重产 dry-run
// 与盘上数据对拍用,同 extract-itemfunc ITEMFUNC_OUT / equip·journey SW_FX53_OUT 约定）
const OUT = process.env.PETS_OUT ?? join(ROOT, 'game', 'src', 'data', 'vanilla-pets.json');

const itemSrc = readFileSync(SRC, 'utf8');
const mainSrc = readFileSync(MAIN, 'utf8');

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

writeFileSync(OUT, JSON.stringify(pets, null, 0));
console.log(`写入 ${OUT}`);
