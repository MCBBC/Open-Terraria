// 图鉴排序/稀有度静态表提取（1.4.5.6 = Terarria1456）→ src/data/vanilla-bestiary.json。
//   - NPCID.cs Sets 三张优先级表（GetSortedBestiaryEntriesList orderby 链的键，ContentSamples.cs:745-753）：
//       TownNPCBestiaryPriority            :4427
//       NormalGoldCritterBestiaryPriority  :4407
//       BossBestiaryPriority               :4416
//   - NPC.cs SetDefaults if/else-if 链的 rarity 赋值（GetNPCBestiaryRarityStarsCount
//     公式入参，ContentSamples.cs:1223-1285；链式条件 `else if (type == X || ...)` 逐 id 登记）
//   - ContentSamples.cs FillNpcRarities 显式覆盖表（:1084-1220，循环公式算完后再覆写，
//     城镇 NPC 钳 1-3 / Boss 钳 4-5）→ rarityStarOverrides
// 注意：src/data/bestiaryStatics.generated.ts 头注亦署名本脚本，但其原始生成逻辑已遗失
//   （本仓仅存产物）；本脚本**不**重写该文件，只产出本 JSON。
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = '/Users/vinlic/Project/GLM/SandboxWorld';
const read = (p) => readFileSync(`${ROOT}/${p}`, 'utf8');

const npcid = read('Terarria1456/Terraria.ID/NPCID.cs');
const npccs = read('Terarria1456/Terraria/NPC.cs');
const samples = read('Terarria1456/Terraria.ID/ContentSamples.cs');

/** `public static List<int> NAME = new List<int> { ... };` 数字表 */
function intList(src, name) {
  const m = src.match(new RegExp(`public static List<int> ${name} = new List<int>\\s*\\{([\\s\\S]*?)\\};`));
  if (!m) throw new Error(`list ${name} not found`);
  return m[1].split(/[,\s]+/).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
}

/** NPC.cs SetDefaults if/else-if 链的 rarity：`else if (type == 45)` / `type == 46 || type == 303`
 *  块内首条 `rarity = N;`（块内无条件单赋值，首条即终值） */
function npcRarityMap(src) {
  const out = {};
  const lines = src.split('\n');
  let ids = null;            // 当前条件块命中的 id 列表（null = 链外）
  for (const line of lines) {
    const depth = (line.match(/^\t*/) ?? [''])[0].length;
    const s = line.trim();
    const cond = s.match(/^(?:else )?if \(type (.+?)\)\s*\{?$/);
    if (cond && depth === 2) {
      ids = [...cond[1].matchAll(/==\s*(-?\d+)/g)].map((m) => parseInt(m[1], 10));
      continue;
    }
    if (ids && depth === 3) {
      const r = s.match(/^rarity = (\d+);$/);
      if (r) {
        for (const id of ids) out[id] = parseInt(r[1], 10);
        ids = null;
        continue;
      }
    }
    if (depth <= 1) ids = null;   // 块结束离开 SetDefaults 链
  }
  return out;
}

/** ContentSamples.FillNpcRarities 显式覆盖（`NpcBestiaryRarityStars[id] = N;`） */
function rarityStarOverrides(src) {
  const m = src.match(/private static void FillNpcRarities\(\)([\s\S]*?)private static int GetNPCBestiaryRarityStarsCount/);
  if (!m) throw new Error('FillNpcRarities not found');
  const out = {};
  for (const hit of m[1].matchAll(/NpcBestiaryRarityStars\[(-?\d+)\] = (\d+);/g)) {
    out[hit[1]] = parseInt(hit[2], 10);
  }
  return out;
}

const data = {
  townNpcBestiaryPriority: intList(npcid, 'TownNPCBestiaryPriority'),
  normalGoldCritterBestiaryPriority: intList(npcid, 'NormalGoldCritterBestiaryPriority'),
  bossBestiaryPriority: intList(npcid, 'BossBestiaryPriority'),
  npcRarity: npcRarityMap(npccs),
  rarityStarOverrides: rarityStarOverrides(samples),
};

writeFileSync(`${ROOT}/game/src/data/vanilla-bestiary.json`, JSON.stringify(data));
for (const [k, v] of Object.entries(data)) {
  const n = Array.isArray(v) ? v.length : Object.keys(v).length;
  console.error(`${k}: ${n} 条`);
}
