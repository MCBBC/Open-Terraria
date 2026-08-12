// 微光转化表提取（1.4.5.6 = Terarria1456）→ src/data/vanilla-shimmer.json。
//   - ItemID.cs Sets（Terraria.ID/ItemID.cs）：
//       ShimmerTransformToItem   :84   CreateIntSet(-1, from,to,...) 物品→物品
//       ShimmerCountsAsItem      :86   等价计数（幻影类 5358-5361 → 5437）
//       ShimmerCountsAsItemForDecraft :88
//       ShimmerPostMoonlord      :90   月后解锁门（CreateBoolSet）
//       CommonCoin               :1098 钱币四档（铜银金铂 71-74 → coinLuck）
//   - NPCID.cs Sets（Terraria.ID/NPCID.cs）：
//       ShimmerTransformToItem   :4839 NPC → 物品后消散
//       ShimmerTownTransform     :4841 城镇 NPC 微光变体（ai[0]=25）
//       ShimmerTransformToNPC    :4843 NPC → NPC（Transform）
//   - Item.cs SetDefaults：DefaultToCapturedCritter(npcId)（:47613-47626）→
//       itemMakeNPC 玻璃瓶小动物物品 → 放生 NPC id（入微光 WorldItem.cs:1855-1876）
// 注意 CreateIntSet(default, k, v, ...) 是奇偶键值对；CreateBoolSet(list) 是成员表。
// ShimmerTransforms.GetTransformToItem 另有两个动态分支（音乐盒 createTile=139 按
// placeStyle / 3461 月砖按月相）——运行时查表未命中时按动态分支处理（src/stats/Shimmer.ts）。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';

const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

/** 取 `public static T[] NAME = Factory.CreateIntSet(args...);` 的实参数组 */
function intSetArgs(src, name) {
  const m = src.match(new RegExp(`public static int\\[\\] ${name} = Factory\\.CreateIntSet\\(([\\s\\S]*?)\\);`));
  if (!m) throw new Error(`int set ${name} not found`);
  return m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
}

/** CreateIntSet(default, k, v, ...) → { from: to }（保留 ≤0 值的显式覆盖项） */
function intSetMap(src, name) {
  const args = intSetArgs(src, name);
  const def = args[0];
  const out = {};
  for (let i = 1; i + 1 < args.length + 1; i += 2) {
    if (i + 1 >= args.length + 1) break;
    const k = args[i], v = args[i + 1];
    if (k === undefined || v === undefined) break;
    if (v === def) continue;
    out[k] = v;
  }
  return out;
}

/** 取 `public static bool[] NAME = Factory.CreateBoolSet(args...);` 成员表 */
function boolSetList(src, name) {
  const m = src.match(new RegExp(`public static bool\\[\\] ${name} = Factory\\.CreateBoolSet\\(([\\s\\S]*?)\\);`));
  if (!m) throw new Error(`bool set ${name} not found`);
  const args = m[1].split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n));
  // CreateBoolSet 可带第二参 default（CreateBoolSet(true, ids...) = 反选表）——
  // 本表全部为默认 false 的正向成员表，args 全为 id。
  return args;
}

const itemid = read('Terarria1456/Terraria.ID/ItemID.cs');
const npcid = read('Terarria1456/Terraria.ID/NPCID.cs');
const itemcs = read('Terarria1456/Terraria/Item.cs');

/** Item.cs SetDefaults 内 `case N:` → DefaultToCapturedCritter(X) 扫描。
 *  只收 SetDefaults 顶层 case（2 个 tab 缩进）——内层 switch 的 case 更深，
 *  避免多标签 fallthrough（如 1993/2001 共体）之外的内层标签污染。
 *  多标签共享体（case A: case B: 同一 DefaultToCapturedCritter）逐标签登记 */
function capturedCritterMap(src) {
  const out = {};
  const lines = src.split('\n');
  let pending = [];
  let sawSwitch = false;
  for (const line of lines) {
    if (/^	public void SetDefaults\(/.test(line) || /^	private void SetDefaults\(/.test(line)) sawSwitch = true;
    if (/^\t\tcase (\d+):\s*$/.test(line)) {
      pending.push(parseInt(RegExp.$1, 10));
      continue;
    }
    const m = line.match(/^\t\t\tDefaultToCapturedCritter\((\d+)\);/);
    if (m && pending.length) {
      for (const id of pending) out[id] = parseInt(m[1], 10);
      pending = [];
      continue;
    }
    // 块结束（break/return/goto）清空待定标签
    if (/^\t\t\t(break|return|goto )/.test(line)) pending = [];
    // 深层标签（内层 switch 体）不记入 pending 但也不能穿透到外层——
    // DefaultToCapturedCritter 只出现在 3 tab 深度，安全
  }
  return out;
}

const data = {
  itemTransformTo: intSetMap(itemid, 'ShimmerTransformToItem'),
  itemCountsAs: intSetMap(itemid, 'ShimmerCountsAsItem'),
  itemCountsAsDecraft: intSetMap(itemid, 'ShimmerCountsAsItemForDecraft'),
  itemPostMoonlord: boolSetList(itemid, 'ShimmerPostMoonlord'),
  commonCoin: boolSetList(itemid, 'CommonCoin'),
  itemMakeNPC: capturedCritterMap(itemcs),
  npcTransformTo: intSetMap(npcid, 'ShimmerTransformToNPC'),
  npcTransformToItem: intSetMap(npcid, 'ShimmerTransformToItem'),
  npcTownTransform: boolSetList(npcid, 'ShimmerTownTransform'),
};

writeFileSync(`${ROOT}/game/src/data/vanilla-shimmer.json`, JSON.stringify(data));
for (const [k, v] of Object.entries(data)) {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  console.error(`${k}: ${n} 条`);
}
