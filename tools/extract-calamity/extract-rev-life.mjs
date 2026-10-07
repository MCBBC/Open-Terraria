// ★一百三十六刀:RevDeathStatChanges 提取(CalamityGlobalNPC.cs:1169 起
//  逐 vanilla Boss HP 乘表;simple 单 case 形+death 双值;fallthrough/条件支=跳)
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../../CalamityModPublic/NPCs/CalamityGlobalNPC.cs');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../mods/calamity/rev-life-mult.json');
const OUT2 = join(dirname(fileURLToPath(import.meta.url)), '../../mods/calamity/rev-ai-constants.json');
const text = readFileSync(SRC, 'utf8');
const start = text.indexOf('#region Revengeance and Death Mode Stat Changes');
const body = text.slice(start, text.indexOf('#endregion', start));
// NPCID.X → id(反编译映射困难→项目内已用 sheet 名;直接以 NPCID 名键发出,
// 消费端 main.js 以 NPCID 名→id 表解析;此处仅机械捕获)
// NPCID.cs 名→id(1457 反编译 short 形)
const npcIdSrc = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../Terarria1457/Terraria.ID/NPCID.cs'), 'utf8');
const NPCID = {};
for (const m of npcIdSrc.matchAll(/public const short (\w+) = (\d+)/g)) NPCID[m[1]] = Number(m[2]);
const entries = [];
const re = /case NPCID\.(\w+):\s*\n([^}]*?)break;/g;
let m;
while ((m = re.exec(body)) !== null) {
  const name = m[1];
  const seg = m[2];
  const sm = seg.match(/lifeMax \*= (\d+)/);
  const rm = seg.match(/lifeMax = \(int\)Math\.Round\(lifeMax \* ([0-9.]+)\)/);
  const dm = seg.match(/CalamityWorld\.death \? ([0-9.]+) : ([0-9.]+)/);
  const gm = seg.match(/lifeMax \* ([0-9.]+)/);
  let mult = null, deathMult = null;
  if (dm) { deathMult = Number(dm[1]); mult = Number(dm[2]); }
  else if (sm) mult = Number(sm[1]);
  else if (rm) mult = Number(rm[1]);
  else if (gm) mult = Number(gm[1]);
  if ((mult !== null || deathMult !== null) && NPCID[name] !== undefined) entries.push([name, NPCID[name], mult ?? 1, deathMult]);
}
writeFileSync(OUT, JSON.stringify(Object.fromEntries(entries.map(([n, id, a, b]) => [n, { id, mult: a, ...(b ? { deathMult: b } : {}) }])), null, 1));
console.log('revLifeMult entries:', entries.length);

// ★一百三十八刀:RevengeanceAndDeathAI 常数表(41 项;classic/rev/death 门+telegraph)
{
  const src2 = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../../CalamityModPublic/NPCs/VanillaNPCAIOverrides/RegularEnemies/RevengeanceAndDeaths/RevengeanceAndDeathAI.cs'), 'utf8');
  const consts = {};
  for (const m of src2.matchAll(/public const (?:float|int) (\w+) = ([0-9.]+)f?;/g)) consts[m[1]] = Number(m[2]);
  writeFileSync(OUT2, JSON.stringify(consts, null, 1));
  console.log('revAI constants:', Object.keys(consts).length);
}
