// 图鉴"出没环境"提取（1.4.5.6 = Terarria1456）→ src/data/vanilla-bestiary-spawn.json。
//   - BestiaryDatabaseNPCsPopulator.cs：
//       CommonTags.SpawnConditions.{Invasions,Events,Biomes,Times,Visuals} 静态声明
//       （:14-302）带文本元素两类：SpawnConditionBestiaryInfoElement（Biomes/Times/
//       Invasions/Events 主条目）与 SpawnConditionBestiaryOverlayInfoElement
//       （Events.Rain/Blizzard/Sandstorm 叠层，:57 同样首参=langKey 次参=
//       DisplayTextPriority）——
//       `new X("Bestiary_Biomes.Surface", 0, ...)` 次参 = FilterProviderInfoElement.
//       DisplayTextPriority（风味回退取最高者用，populator:693-700）
//       FindEntryByNPCID(id).Info.AddRange(new IBestiaryInfoElement[N] { ... })
//       ×732（AddNPCBiomeRelationships_Automated :802 / _Manual :1661）——每 NPC 的
//       出没环境注册序（UIBestiaryEntryInfoPage 按注册序呈现）
//   - Visuals.* 是 SpawnConditionDecorativeOverlayInfoElement（纯装饰叠层，无文本），
//     且其挂载可从条件推导（Rain+Snow→Blizzard 等 :1942-1985）——不提取，UI 不消费
// 产物结构：{ conditions: { "<Group>.<Name>": { key, priority } },
//            byNpc: { "<npcId>": ["<Group>.<Name>", ...] } }
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const src = readFileSync(`${ROOT}/Terarria1456/Terraria.GameContent.Bestiary/BestiaryDatabaseNPCsPopulator.cs`, 'utf8');

// ---- 嵌套类栈 → 字段全路径 ----
// `public static class X` 按缩进深度入栈；字段声明深度 d 的路径 = 1..d-1 层类名 + 字段名
const classAt = new Map(); // tabDepth → className
const conditions = {};     // "Group.Name" → { key, priority }
for (const line of src.split('\n')) {
  const cm = line.match(/^\t+public static class (\w+)/);
  if (cm) {
    classAt.set(cm[0].length - cm[0].trimStart().length, cm[1]);
    continue;
  }
  const fm = line.match(/^\t+public static SpawnCondition(?:Bestiary|BestiaryOverlay|Overlay)InfoElement (\w+) = new SpawnCondition(?:Bestiary|BestiaryOverlay|Overlay)InfoElement\("([^"]+)", (-?\d+)/);
  if (!fm) continue;
  const depth = fm[0].length - fm[0].trimStart().length;
  const chain = [];
  for (let d = 1; d < depth; d++) {
    const c = classAt.get(d);
    if (c) chain.push(c);
  }
  // 跳过外层类名（CommonTags/SpawnConditions），保留 Invasions/Events/Biomes/Times 分组
  const group = chain[chain.length - 1];
  conditions[`${group}.${fm[1]}`] = { key: fm[2], priority: Number(fm[3]) };
}
const nCond = Object.keys(conditions).length;
if (nCond === 0) throw new Error('no spawn conditions parsed');

// ---- 每 NPC 注册序 ----
const byNpc = {};
const re = /FindEntryByNPCID\((-?\d+)\)\.Info\.AddRange\(new IBestiaryInfoElement\[\d+\]\s*\{([\s\S]*?)\}\s*\);/g;
let m;
let total = 0;
while ((m = re.exec(src))) {
  const id = m[1];
  const body = m[2];
  const paths = [...body.matchAll(/CommonTags\.SpawnConditions\.([\w.]+)/g)].map((x) => x[1]);
  for (const p of paths) {
    if (!conditions[p]) throw new Error(`unknown condition path: ${p}`);
  }
  if (!paths.length) continue;
  byNpc[id] = [...(byNpc[id] ?? []), ...paths];
  total += paths.length;
}

const data = { conditions, byNpc };
writeFileSync(`${ROOT}/game/src/data/vanilla-bestiary-spawn.json`, JSON.stringify(data));
console.error(`conditions: ${nCond} 条 / byNpc: ${Object.keys(byNpc).length} NPC / 条目: ${total}`);
