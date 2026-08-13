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
const OUT = join(ROOT, 'game', 'src', 'data', 'vanilla-pets.json');

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
const lines = itemSrc.split('\n');
let pets = {};
let curCases = [];
let block = null; // { buff, shoot, consumable, damage }
const flush = () => {
  // ★ damage>0 = 召唤杖/武器（buffType=随从 buff + shoot=随从弹——与宠物同模式，
  //   唯一区分 = 宠物恒 damage=0；曾漏此门混入 24 件召唤杖假阳性）
  if (block && curCases.length && block.buff != null && block.shoot != null && !block.consumable
    && (block.damage ?? 0) === 0) {
    for (const id of curCases) {
      pets[id] = { buff: block.buff, proj: block.shoot, light: lightPet.has(block.buff) ? 1 : 0 };
    }
  }
  block = null;
};
const startBlock = () => {
  flush();
  block = { buff: null, shoot: null, consumable: false, damage: null };
};
for (const line of lines) {
  const t = line.trim();
  const cm = t.match(/^case (\d+):$/);
  if (cm) {
    if (!block) startBlock();
    curCases.push(+cm[1]);
    continue;
  }
  if (t === 'default:') {
    flush();
    curCases = [];
    block = { buff: null, shoot: null, consumable: false, damage: null };
    continue;
  }
  const bm = t.match(/^buffType = (\d+);$/);
  if (bm && block) { block.buff = +bm[1]; continue; }
  const sm = t.match(/^shoot = (\d+);$/);
  if (sm && block) { block.shoot = +sm[1]; continue; }
  // DefaultToVanitypet(projId, buffId)（:47549——参数序与直赋值相反）
  const pm = t.match(/^DefaultToVanitypet\((\d+), (\d+)\);$/);
  if (pm && block) { block.shoot = +pm[1]; block.buff = +pm[2]; continue; }
  const dm = t.match(/^damage = (\d+);$/);
  if (dm && block) { block.damage = +dm[1]; continue; }
  if (t === 'consumable = true;' && block) { block.consumable = true; continue; }
  if (t.startsWith('break;') || t.startsWith('return;')) {
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
