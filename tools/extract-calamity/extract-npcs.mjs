#!/usr/bin/env node
// 灾厄全量移植 B3:NPCs 机械提取器。
// 源=CalamityModPublic/NPCs(SetDefaults/SetStaticDefaults + hjson 名 + PNG);
// 目标=game/mods/calamity/content/npcs/*.json + textures/npcs/*.png(ModNpcContent)。
// ★手批 17 权威(.curated-npcs.json)。NPCLoot 掉落钩不在本批(数据面=SetDefaults;
//  掉落=B6 loot 相期)。
// aiStyle 表=tModLoader 1.4.4 NPCAIStyleID(WebFetch 权威;反编译树无此类)。
// 用法:node tools/extract-calamity/extract-npcs.mjs [--write]
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync, copyFileSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const SRC = join(ROOT, 'CalamityModPublic');
const OUT = join(ROOT, 'game', 'mods', 'calamity');
const WRITE = process.argv.includes('--write');

// tModLoader 1.4.4 Terraria/ID/NPCAIStyleID.cs(权威快照)
const AI_STYLE = {
  FaceClosestPlayer: 0, Slime: 1, DemonEye: 2, Fighter: 3, EyeOfCthulhu: 4, Flying: 5,
  Worm: 6, Passive: 7, Caster: 8, Spell: 9, CursedSkull: 10, SkeletronHead: 11,
  SkeletronHand: 12, ManEater: 13, Bat: 14, KingSlime: 15, Piranha: 16, Vulture: 17,
  Jellyfish: 18, Antlion: 19, SpikeBall: 20, BlazingWheel: 21, HoveringFighter: 22,
  EnchantedSword: 23, Bird: 24, Mimic: 25, Unicorn: 26, WallOfFleshMouth: 27,
  WallOfFleshEye: 28, TheHungry: 29, Retinazer: 30, Spaazmatism: 31,
  SkeletronPrimeHead: 32, PrimeSaw: 33, PrimeVice: 34, PrimeCannon: 35, PrimeLaser: 36,
  TheDestroyer: 37, Snowman: 38, GiantTortoise: 39, Spider: 40, Herpling: 41,
  LostGirl: 42, QueenBee: 43, FlyingFish: 44, GolemBody: 45, GolemHead: 46,
  GolemFist: 47, FreeGolemHead: 48, AngryNimbus: 49, Spore: 50, Plantera: 51,
  PlanteraHook: 52, PlanteraTentacle: 53, BrainOfCthulhu: 54, Creeper: 55,
  DungeonSpirit: 56, MourningWood: 57, Pumpking: 58, PumpkingScythe: 59, IceQueen: 60,
  SantaNK1: 61, ElfCopter: 62, Flocko: 63, Firefly: 64, Butterfly: 65, CritterWorm: 66,
  Snail: 67, Duck: 68, DukeFishron: 69, DukeFishronBubble: 70, Sharkron: 71,
  BubbleShield: 72, TeslaTurret: 73, Corite: 74, Rider: 75, MartianSaucer: 76,
  MoonLordCore: 77, MoonLordHand: 78, MoonLordHead: 79, MartianProbe: 80,
  TrueEyeOfCthulhu: 81, MoonLeachClot: 82, LunaticDevote: 83, LunaticCultist: 84,
  StarCell: 85, AncientVision: 86, BiomeMimic: 87, Mothron: 88, MothronEgg: 89,
  BabyMothron: 90, GraniteElemental: 91, TargetDummy: 92, FlyingDutchman: 93,
  CelestialPillar: 94, SmallStarCell: 95, FlowInvader: 96, NebulaFloater: 97,
  SolarFragment: 99, AncientLight: 100, AncientDoom: 101, SandElemental: 102,
  SandShark: 103, DD2EterniaCrystal: 105, DD2MysteriousPortal: 106, DD2Fighter: 107,
  DD2Flying: 108, DD2DarkMage: 109, DD2Betsy: 110, DD2LightningBug: 111, Fairy: 112,
  Balloon: 113, Dragonfly: 114, Ladybug: 115, WaterStrider: 116, Dreadnautilus: 117,
  Seahorse: 118, AngryDandelion: 119, EmpressOfLight: 120, QueenSlime: 121,
  PiratesCurse: 122,
};

function extractMethodBody(text, signature) {
  const idx = text.indexOf(signature);
  if (idx < 0) return null;
  const open = text.indexOf('{', idx);
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') { depth--; if (depth === 0) return text.slice(open + 1, i); }
  }
  return null;
}

const pascalToSnake = (s) => s
  .trim()
  .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
  .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
  .replace(/\s+/g, '')
  .toLowerCase();

function walkFiles(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkFiles(p, ext, out);
    else if (name.endsWith(ext)) out.push(p);
  }
  return out;
}

function loadFileConsts(text) {
  const map = {};
  for (const m of text.matchAll(/(?:const|static readonly)\s+(?:int|float|double|short|byte)\s+([A-Za-z0-9_]+)\s*=\s*([0-9.]+)f?\s*;/g)) {
    map[m[1]] = Number(m[2]);
  }
  for (const m of text.matchAll(/(?:int|float)\s+([A-Za-z0-9_]+)\s*(?:=>|=)\s*([0-9.]+)f?\s*;/g)) {
    if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
  }
  return map;
}

// ---------- 名字表(hjson 两种形:扁平 `X: name` 与点分 `X.DisplayName: name`) ----------
function parseNames() {
  const names = {};
  const text = readFileSync(join(SRC, 'Localization', 'en-US', 'Mods.CalamityMod.NPCs.hjson'), 'utf8');
  for (const m of text.matchAll(/^([A-Za-z0-9_]+)\.DisplayName: (.+)$/gm)) names[m[1]] = m[2].trim();
  for (const m of text.matchAll(/^([A-Za-z0-9_]+): \{\n\s+DisplayName: (.+)$/gm)) {
    if (names[m[1]] === undefined) names[m[1]] = m[2].trim();   // 块形
  }
  for (const m of text.matchAll(/^([A-Za-z0-9_]+): ([^{\n]+)$/gm)) {
    if (names[m[1]] === undefined) names[m[1]] = m[2].trim();
  }
  return names;
}
const NAMES = parseNames();

// ★蠕虫链 sidecar(B6 五十四刀恢复刀):手补 worm 声明曾被 --write 覆写(desert_scourge
//  aiStyle 6 幸存=提取器映射,worm=手补阵亡)——本表=蠕虫链权威,write 时合并进头 json。
const WORM_CHAINS = existsSync(join(OUT, '..', '..', 'tools', 'extract-calamity', 'worm-chains.json'))
  ? JSON.parse(readFileSync(join(OUT, '..', '..', 'tools', 'extract-calamity', 'worm-chains.json'), 'utf8'))
  : {};

const curatedNpcKeys = new Set(JSON.parse(readFileSync(join(OUT, '.curated-npcs.json'), 'utf8')));
// loot 材料键解析(盘键+curated 归一别名;与 recipes resolveItemKey 同式)
const diskItemKeysLoot = new Set(readdirSync(join(OUT, 'content', 'items')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')));
// buff 声明键集(OnHitPlayer/OnHitNPC 解析面;六十四刀)
const BUFF_KEYS_NPC = new Set(existsSync(join(OUT, 'content', 'buffs'))
  ? readdirSync(join(OUT, 'content', 'buffs')).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''))
  : []);
const normCuratedLoot = new Map(JSON.parse(readFileSync(join(OUT, '.curated-items.json'), 'utf8')).map((k) => [k.replace(/_/g, ''), k]));

const npcDir = join(SRC, 'NPCs');
const csFiles = walkFiles(npcDir, '.cs').filter((f) => {
  const head = readFileSync(f, 'utf8').slice(0, 2500);
  const clsM = head.match(/class\s+\w+\s*:\s*([A-Za-z0-9_]+)/);
  if (!clsM) return false;
  if (/(GlobalNPC|ModSystem|ModPlayer|ModProjectile|ModTile|ModBuff|ModDust|GlobalTile|BiomeMod|ModSceneEffect|ModWaterStyle|ModUndergroundBackgroundStyle|ModSurfaceBackgroundStyle|ModBackground)/.test(clsM[1])) return false;
  return !/abstract class/.test(head);
});
const pngs = walkFiles(npcDir, '.png').filter((p) => !/_Highlight|_Glow|_Bestiary|_Map|_Alt|_Belly/i.test(basename(p)));
const pngByBase = new Map();
for (const p of pngs) { const b = basename(p, '.png'); if (!pngByBase.has(b)) pngByBase.set(b, p); }

// —— ModifyNPCLoot 解析(B6):classic 曲线面 ——
// 支持形:npcLoot.Add(TYPE, d) 简单形 / DropHelper.NormalVsExpertQuantity(...)(经典=normal 支)/
//        ItemDropRule.Common(TYPE, d, min, max)。其余(条件/OneFromOptions/池)=保守跳过计数。
const lootSkips = new Map();
let lootSkipSamples = [];
function parseLootBody(body, resolveItemKey, pascalToSnake) {
  const drops = [];
  let idx = 0;
  for (;;) {
    const at = body.indexOf('npcLoot.Add(', idx);
    if (at < 0) break;
    // 平衡括号取实参串(嵌套泛型/调用安全)
    let depth = 0, end = -1;
    for (let i = at + 'npcLoot.Add'.length; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') { depth--; if (depth === 0) { end = i; break; } }
    }
    if (end < 0) break;
    const arg = body.slice(at + 'npcLoot.Add('.length, end).trim();
    idx = end + 1;
    // 平衡括号取实参串——模式梯
    const nveq = arg.match(/^\s*DropHelper\.NormalVsExpertQuantity\(\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)\s*$/);
    const common = arg.match(/^\s*ItemDropRule\.Common\(\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?)?\)\s*$/);
    const vidCommon = arg.match(/^\s*ItemDropRule\.Common\(\s*ItemID\.([A-Za-z0-9_]+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?)?\)\s*$/);
    const simple = arg.match(/^\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?)?\s*$/);
    const vidSimple = arg.match(/^\s*ItemID\.([A-Za-z0-9_]+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?)?\s*$/);
    // 前缀两形:Calamity 自有 DropHelper.NormalvsExpert + tML 内建 ItemDropRule.NormalvsExpert
    // (tML 1.4.4 ItemDropRules/TerrariaHooks;签名 (itemID, denom, min=1, max=1, …),经典=1/denom 掷 min..max)
    const nvsE = arg.match(/^\s*(?:DropHelper|ItemDropRule)\.NormalvsExpert\(\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?\s*\)\s*$/);
    const nvsE_v = arg.match(/^\s*(?:DropHelper|ItemDropRule)\.NormalvsExpert\(\s*ItemID\.([A-Za-z0-9_]+)\s*,\s*(\d+)\s*(?:,\s*(\d+)\s*(?:,\s*(\d+))?)?\s*\)\s*$/);
    const oneOpt = arg.match(/^ItemDropRule\.OneFromOptions(?:WithLuckDelta)?\(\s*(\d+)\s*,\s*([\s\S]+)\)$/);
    // ★三百:Fraction/三元栈/CalamityStyle 池三形
    const frac = arg.match(/^\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*,\s*new Fraction\((\d+),\s*(\d+)\)\s*$/);
    const tern = arg.match(/^\s*(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)\s*,\s*[^,]+\?\s*(\d+)\s*:\s*(\d+)\s*$/);
    const calStyle = arg.match(/^\s*DropHelper\.CalamityStyle\(\s*(?:DropHelper\.)?(?:NormalWeaponDropRateFraction|new Fraction\((\d+),\s*(\d+)\))\s*,\s*([A-Za-z0-9_]+)\s*\)\s*$/);
    const push = (item, denom, min, max) => {
      if (item === null) { lootSkips.set('itemMissing', (lootSkips.get('itemMissing') ?? 0) + 1); return; }
      const rec = { item };
      if (denom && denom > 1) rec.chance = 1 / denom;
      if ((min ?? 1) !== 1 || (max ?? 1) !== 1) { rec.min = min ?? 1; rec.max = max ?? min ?? 1; }
      if (!drops.some((d) => d.item === item && (d.chance ?? 1) === (rec.chance ?? 1) && (d.min ?? 1) === (rec.min ?? 1))) drops.push(rec);
    };
    if (nveq) {
      // NormalVsExpertQuantity → 经典=normal 支(min/max 第 3/4 参)
      const key = resolveItemKey(nveq[1].split('.').pop());
      push(key, Number(nveq[2]), Number(nveq[3]), Number(nveq[4]));
    } else if (nvsE) {
      // NormalvsExpert(ItemType<X>(), denom[, min[, max]]) → 经典=1/denom 掷 min..max
      push(resolveItemKey(nvsE[1].split('.').pop()), Number(nvsE[2]), Number(nvsE[3] ?? 1), Number(nvsE[4] ?? nvsE[3] ?? 1));
    } else if (common) {
      const key = resolveItemKey(common[1].split('.').pop());
      push(key, common[2] ? Number(common[2]) : 1, common[3] ? Number(common[3]) : 1, common[4] ? Number(common[4]) : (common[3] ? Number(common[3]) : 1));
    } else if (vidCommon) {
      push(ENUM_ITEM_ID[vidCommon[1]] ?? null, vidCommon[2] ? Number(vidCommon[2]) : 1, vidCommon[3] ? Number(vidCommon[3]) : 1, vidCommon[4] ? Number(vidCommon[4]) : (vidCommon[3] ? Number(vidCommon[3]) : 1));
    } else if (simple) {
      const key = resolveItemKey(simple[1].split('.').pop());
      push(key, simple[2] ? Number(simple[2]) : 1, 1, 1);
    } else if (nvsE_v) {
      // NormalvsExpert(ItemID.X, denom[, min[, max]]) → 经典=1/denom 掷 min..max
      push(ENUM_ITEM_ID[nvsE_v[1]] ?? null, Number(nvsE_v[2]), Number(nvsE_v[3] ?? 1), Number(nvsE_v[4] ?? nvsE_v[3] ?? 1));
    } else if (vidSimple) {
      // vidSimple(1-4 group):ItemID.X[, denom[, min[, max]]]
      const den = vidSimple[2] ? Number(vidSimple[2]) : 1;
      const mn = vidSimple[3] ? Number(vidSimple[3]) : 1;
      const mx = vidSimple[4] ? Number(vidSimple[4]) : mn;
      push(ENUM_ITEM_ID[vidSimple[1]] ?? null, den, mn, mx);
    } else if (oneOpt) {
      // OneFromOptions(denom, id1, id2, ...) → 每项独立 chance=1/(denom×N)(近似:期望同)
      const denom = Number(oneOpt[1]);
      const idRe = /(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)|ItemID\.([A-Za-z0-9_]+)/g;
      let m6;
      const opts = [];
      while ((m6 = idRe.exec(oneOpt[2])) !== null) {
        if (m6[1]) { const rk = resolveItemKey(m6[1].split('.').pop()); if (rk) opts.push(rk); }
        else if (ENUM_ITEM_ID[m6[2]] !== undefined) opts.push(ENUM_ITEM_ID[m6[2]]);
      }
      if (opts.length > 0) {
        const eff = denom * opts.length;
        for (const o of opts) push(o, eff, 1, 1);
      }
    } else if (/^ItemDropRule\.BossBag\(ModContent\.ItemType<([A-Za-z0-9_.]+)>\(\)\)/.test(arg)) {
      // ★BossBag 落地(六十刀难度档):{item, bossBag:1} → register → {k:'bossBag'}
      //  规则(专家档掉袋+zeroValue,经典不掉——1457 ItemDropRule.cs:10-13 语义)
      const bagM = arg.match(/^ItemDropRule\.BossBag\(ModContent\.ItemType<([A-Za-z0-9_.]+)>\(\)\)/);
      const bagKey = resolveItemKey(bagM[1].split('.').pop());
      if (bagKey && !drops.some((d) => d.item === bagKey && d.bossBag)) {
        drops.push({ item: bagKey, bossBag: 1 });
      } else lootSkips.set('itemMissing', (lootSkips.get('itemMissing') ?? 0) + 1);
    } else if (frac) {
      // ★三百:Fraction 形——ItemType<X>(), new Fraction(a, b) → chance=a/b(denom=b/a)
      push(resolveItemKey(frac[1].split('.').pop()), Math.max(1, Math.round(Number(frac[3]) / Number(frac[2]))), 1, 1);
    } else if (tern) {
      // ★三百:三元栈形——ItemType<X>(), <cond> ? a : b → 经典=else 支(条件=expert/日期等)
      push(resolveItemKey(tern[1].split('.').pop()), Number(tern[2]), 1, 1);
    } else if (calStyle) {
      // ★三百:CalamityStyle 池(DropHelper.cs:1374=AllOptionsAtOnceWithPityDropRule
      // =逐件独立 1/fraction 掷;NormalWeaponDropRateFraction=1/4(:84/:94); pity=登记)
      const listVar = calStyle[3];
      const lm = body.match(new RegExp(`List<int>\\s+${listVar}\\s*=\\s*new List<int>\\s*\\{([^}]*)\\}`));
      if (lm) {
        const idRe2 = /(?:ModContent\.)?ItemType<([A-Za-z0-9_.]+)>\(\)|ItemID\.([A-Za-z0-9_]+)/g;
        let m7;
        const opts2 = [];
        while ((m7 = idRe2.exec(lm[1])) !== null) {
          if (m7[1]) { const rk = resolveItemKey(m7[1].split('.').pop()); if (rk) opts2.push(rk); }
          else if (ENUM_ITEM_ID[m7[2]] !== undefined) opts2.push(ENUM_ITEM_ID[m7[2]]);
        }
        const fracDen = calStyle[2] ? Math.max(1, Math.round(Number(calStyle[2]) / Number(calStyle[1]))) : 4;
        for (const o of opts2) push(o, fracDen, 1, 1);
      } else lootSkips.set('unsupportedShape', (lootSkips.get('unsupportedShape') ?? 0) + 1);
    } else if (/^ItemDropRule\.BossBag(ByCondition)?\(/.test(arg)) {
      lootSkips.set('expertOnlyBossBag', (lootSkips.get('expertOnlyBossBag') ?? 0) + 1);
    } else if (/^ItemDropRule\.ByCondition\(/.test(arg)) {
      lootSkips.set('conditionGate', (lootSkips.get('conditionGate') ?? 0) + 1);
    } else {
      lootSkips.set('unsupportedShape', (lootSkips.get('unsupportedShape') ?? 0) + 1);
      if (!lootSkipSamples) lootSkipSamples = [];
      if (lootSkipSamples.length < 8) lootSkipSamples.push(arg.slice(0, 120));
    }
  }
  return drops;
}
// ItemID 名→vid(掉落 vidCommon/vidSimple 用)
const ENUM_ITEM_ID = (() => {
  const map = {};
  try {
    const text = readFileSync(join(ROOT, 'Terarria1457', 'Terraria.ID', 'ItemID.cs'), 'utf8');
    for (const m of text.matchAll(/public const (?:ushort|short|int|byte) ([A-Za-z0-9_]+) = (\d+)/g)) {
      if (map[m[1]] === undefined) map[m[1]] = Number(m[2]);
    }
  } catch { /* 表缺=vid 掉落跳过 */ }
  return map;
})();

// —— 基类链 SetDefaults 回溯(noSetDefaults 家族;B6 前置刀)——
// 沿 class 继承链上溯解析基类 SetDefaults 体(Calamity 基类公开源码可机械解;
// 实证:SlimeGodCore 等的 lifeMax/damage 全在基类)。上限 6 层防环。
const csByClass = new Map();
for (const f of walkFiles(SRC, '.cs')) csByClass.set(basename(f, '.cs').trim(), f);   // 全树索引(基类可能在任何目录)   // 全 .cs(含被内容过滤排除的基类)
function findBaseSetDefaults(className, depth = 0) {
  if (depth > 6) return null;
  const f = csByClass.get(className);
  if (!f) return null;
  const text = readFileSync(f, 'utf8');
  const body = extractMethodBody(text, 'public override void SetDefaults()')
    ?? extractMethodBody(text, 'public override void SetDefaults(Item preset)');
  if (body !== null) return body;
  const head = text.slice(0, 2500);
  const clsM = head.match(/class\s+\w+\s*:\s*([A-Za-z0-9_]+)/);
  if (!clsM || clsM[1] === 'ModNPC') return null;
  return findBaseSetDefaults(clsM[1], depth + 1);
}

const stats = { total: 0, emitted: 0, curated: 0, noName: 0, noTexture: 0, noSetDefaults: 0, customAi: 0, lootDrops: 0, lootNpcs: 0 };
const outDir = join(OUT, 'content', 'npcs');
const texDir = join(OUT, 'textures', 'npcs');

for (const f of csFiles) {
  const cls = basename(f, '.cs').trim();
  const key = pascalToSnake(cls);
  if (curatedNpcKeys.has(key)) { stats.curated++; continue; }
  if (NAMES[cls] === undefined && !/^[A-Za-z0-9_]+$/.test(cls)) { /* key 卫生兜底 */ }
  stats.total++;
  const text = readFileSync(f, 'utf8');
  const fileConsts = loadFileConsts(text);
  const num = (expr) => {
    if (expr === undefined) return undefined;
    const e = String(expr).trim().replace(/;$/, '').trim();
    if (/^-?\d+(\.\d+)?f?$/.test(e)) return Number(e.replace(/f$/, ''));
    if (fileConsts[e] !== undefined) return fileConsts[e];
    const add = e.match(/^(.+)\s*\*\s*(.+)$/);
    if (add) { const l = num(add[1]); const r = num(add[2]); if (l !== undefined && r !== undefined) return l * r; }
    return undefined;
  };

  const raw = { key, name: NAMES[cls] ?? cls, aiStyle: 0 };
  if (NAMES[cls] === undefined) stats.noName++;

  // frames:SetStaticDefaults Main.npcFrameCount[Type] = N
  const staticBody = extractMethodBody(text, 'public override void SetStaticDefaults()');
  if (staticBody) {
    const fm = staticBody.match(/Main\.npcFrameCount\[Type\]\s*=\s*([^;]+);/);
    if (fm) { const v = num(fm[1]); if (v !== undefined) raw.frames = v; }
  }

  let body = extractMethodBody(text, 'public override void SetDefaults()');
  let baseResolved = false;
  if (body === null) {
    // ★B6 基类链回溯(noSetDefaults 家族):基类 SetDefaults 字段为本体
    body = findBaseSetDefaults(cls);
    if (body === null) { stats.noSetDefaults++; continue; }
    baseResolved = true;
  }
  for (const line of body.split('\n')) {
    const t = line.trim();
    // ★二百七十九刀:行尾注释剥离——`NPC.damage = 40; // 64 (1.6x expert scaling)`
    //  族行曾因 $ 锚不匹配整行静默回退缺省(damage 0/width 缺)→ Boss 接触伤全 0
    //  根因。仅剥 ` // ` 起的注释(SetDefaults 内无字符串字面量含该序)。
    const tc = /\s\/\//.test(t) ? t.replace(/\s\/\/.*$/, '') : t;
    // ★灾厄 LifeMaxNERB(N)=lifeMax 基值(方法调用形,不走赋值正则)
    // ★三元 lifeMax(cond ? A : B)——经典=else 支(B;A=BossRush/hardMode 特化)
    const tern = tc.match(/^NPC\.lifeMax\s*=\s*[^?]+\?\s*[-0-9.]+\s*:\s*([-0-9.]+)\s*;/);
    if (tern) { raw.lifeMax = Math.max(1, Number(tern[1])); continue; }
    const nm = tc.match(/^NPC\.LifeMaxNERB\(([^)]*)\);/);
    if (nm) {
      // 三参形(classic, expert, revengeBase)——经典=首参;单参同式
      const first = nm[1].split(',')[0].trim();
      const v = num(first);
      if (v !== undefined) raw.lifeMax = Math.max(1, v);
      continue;
    }
    const fm = tc.match(/^NPC\.([A-Za-z0-9_]+)\s*=\s*([^;]+);$/);
    if (!fm) continue;
    const [, field, expr] = fm;
    const e = String(expr).trim();
    if (field === 'aiStyle') {
      const aiM = e.match(/^(?:NPCAIStyleID|AIStyleID)\.([A-Za-z0-9_]+)/);
      if (aiM && AI_STYLE[aiM[1]] !== undefined) raw.aiStyle = AI_STYLE[aiM[1]];
      else { const v = num(e); raw.aiStyle = v !== undefined ? v : 0; if (v === undefined) stats.customAi++; }
    }
    else if (field === 'lifeMax') { const v = num(e); if (v !== undefined) raw.lifeMax = v; }
    else if (field === 'damage') { const v = num(e); if (v !== undefined) raw.damage = v; }
    else if (field === 'defense') { const v = num(e); if (v !== undefined) raw.defense = v; }
    else if (field === 'knockBackResist') { const v = num(e); if (v !== undefined) raw.knockBackResist = v; }
    else if (field === 'width') { const v = num(e); if (v !== undefined) raw.width = v; }
    else if (field === 'height') { const v = num(e); if (v !== undefined) raw.height = v; }
    else if (field === 'scale') { const v = num(e); if (v !== undefined) raw.scale = v; }
    else if (field === 'alpha') { const v = num(e); if (v !== undefined) raw.alpha = v; }
    else if (field === 'noGravity' && e === 'true') raw.noGravity = true;
    else if (field === 'noTileCollide' && e === 'true') raw.noTileCollide = true;
    else if (field === 'behindTiles' && e === 'true') raw.behindTiles = true;
    else if (field === 'boss' && e === 'true') raw.boss = true;
    else if (field === 'friendly' && e === 'true') { raw.friendly = true; raw.townNPC = true; }
    else if (field === 'value') {
      const buy = e.match(/Item\.buyPrice\(([^)]*)\)/);
      if (buy) {
        const a = { copper: 0, silver: 0, gold: 0, platinum: 0 };
        const pos = [a.copper, a.silver, a.gold, a.platinum];
        buy[1].split(',').forEach((part, i) => {
          const kv = part.split(':');
          if (kv.length === 2) a[kv[0].trim()] = Number(kv[1].trim());
          else if (part.trim() !== '') pos[i] = Number(part.trim());
        });
        raw.value = a.copper + a.silver * 100 + a.gold * 10000 + a.platinum * 1000000;
      }
    }
    else if (field === 'HitSound') {
      const sm = e.match(/SoundID\.NPCHit(\d+)/);
      if (sm) raw.HitSound = `NPC_Hit_${sm[1]}`;
    }
    else if (field === 'DeathSound') {
      if (/^\s*null\s*$/.test(e)) raw.DeathSound = null;
      else { const sm = e.match(/SoundID\.NPCDeath(\d+)/); if (sm) raw.DeathSound = `NPC_Killed_${sm[1]}`; }
    }
  }
  // 必填面守卫(lifeMax/damage/defense 缺=引擎 mod NPC 面未定义)
  if (raw.lifeMax === undefined || raw.damage === undefined || raw.defense === undefined) {
    // 城镇 NPC/收藏品等有 friendly 位先行;其余按缺省 1 补(占位语义,GAPS 记录)
    raw.lifeMax ??= 1; raw.damage ??= 0; raw.defense ??= 0;
    stats.customAi++;
  }
  raw.lifeMax = Math.max(1, raw.lifeMax);

  // —— ModifyNPCLoot 掉落(B6)——
  const lootBody = (() => {
    const m2 = text.match(/public override void ModifyNPCLoot\(NPCLoot npcLoot\)\s*\{/);
    if (!m2) return null;
    const i2 = text.indexOf('{', m2.index);
    let depth = 0;
    for (let j = i2; j < text.length; j++) {
      if (text[j] === '{') depth++;
      else if (text[j] === '}') { depth--; if (depth === 0) return text.slice(i2 + 1, j); }
    }
    return null;
  })();
  if (lootBody !== null) {
    const drops = parseLootBody(lootBody, (cls2) => {
      const key = pascalToSnake(cls2);
      if (diskItemKeysLoot.has(key)) return key;
      return normCuratedLoot.get(key.replace(/_/g, '')) ?? null;
    }, pascalToSnake);
    if (drops.length) { raw.drops = drops; stats.lootDrops += drops.length; stats.lootNpcs++; }
  }

  // —— OnHitPlayer → onHitPlayer 声明面(六十四刀 CalPlayer 基建):AddBuff(BuffType<X>(), T) ——
  {
    const ohIdx = text.indexOf('public override void OnHitPlayer');
    if (ohIdx >= 0) {
      const ohOpen = text.indexOf('{', ohIdx);
      let d2 = 0, ohEnd = -1;
      for (let i2 = ohOpen; i2 < text.length; i2++) {
        if (text[i2] === '{') d2++;
        else if (text[i2] === '}') { d2--; if (d2 === 0) { ohEnd = i2; break; } }
      }
      if (ohEnd > 0) {
        const ohBody = text.slice(ohOpen + 1, ohEnd);
        const bm = ohBody.match(/AddBuff\(\s*(?:ModContent\.)?BuffType<([A-Za-z0-9_.]+)>\(\)\s*,\s*([0-9]+)\s*(?:,|\))/);
        if (bm && BUFF_KEYS_NPC.has(pascalToSnake(bm[1].split('.').pop()))) {
          const gm = ohBody.match(/hurt(?:Info)?\.Damage\s*>\s*0/);
          raw.onHitPlayer = {
            buff: pascalToSnake(bm[1].split('.').pop()),
            duration: Number(bm[2]) / 60,
            ...(gm ? {} : {}),
          };
        }
      }
    }
  }

  // ★B6 Texture 重定向解析(11 件无 pngByBase 命中的 npc):
  //  源 override string Texture → "CalamityMod/..."(树内路径)或 "Terraria/Images/NPC_<vid>"(原版表)
  let texOverride = null;
  {
    const tm = text.match(/override string Texture\s*=>\s*"([^"]+)"/);
    if (tm) {
      const tp = tm[1];
      if (tp.startsWith('Terraria/Images/NPC_')) {
        const vid = Number(tp.split('NPC_')[1]);
        const src = join(ROOT, 'game', 'public', 'sprites', 'vanilla', `NPC_${vid}.png`);
        if (existsSync(src)) texOverride = src;
      } else {
        const cand = join(SRC, tp.replace(/^CalamityMod\//, '') + '.png');
        if (existsSync(cand)) texOverride = cand;
      }
    }
  }
  const png = pngByBase.get(cls) ?? texOverride;
  // 贴图(魔数校验)

  let hasPng = false;
  if (png) {
    const head = readFileSync(png).subarray(0, 4);
    if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) hasPng = true;
  }
  if (!hasPng) stats.noTexture++;

  if (WRITE) {
    // ★蠕虫链 sidecar 合并(五十四刀恢复刀):--write 不再覆写手补 worm 声明
    if (WORM_CHAINS[key]) raw.worm = WORM_CHAINS[key];
    // ★二百七十九刀:spawn 声明透传(SpawnChance 战役面=extract-spawn.mjs 权威;
    //  本轮 --write 曾整批覆写 105 条=五十四刀判例族再现,透传后 --write 安全)
    const prevPath = join(outDir, `${key}.json`);
    if (existsSync(prevPath)) {
      try {
        const prev = JSON.parse(readFileSync(prevPath, 'utf8'));
        if (prev.spawn !== undefined) raw.spawn = prev.spawn;
      } catch { /* 损坏文件走全新 raw */ }
    }
    mkdirSync(outDir, { recursive: true });
    writeFileSync(join(outDir, `${key}.json`), JSON.stringify(raw, null, 2) + '\n');
    if (hasPng) { mkdirSync(texDir, { recursive: true }); copyFileSync(png, join(texDir, `${key}.png`)); }
  }
  stats.emitted++;
}

console.log(JSON.stringify({ ...stats, lootSkips: Object.fromEntries([...lootSkips.entries()].sort((a, b) => b[1] - a[1])), lootSkipSamples }, null, 2));
