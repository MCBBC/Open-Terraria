// ★一百一十九刀:SpawnChance 机械提取器(单分支面)。
//  C# 形:`if (…ZoneX… && spawnInfo.Water) return 0.2f;` / `return SpawnCondition.X.Chance * Nf;`
//  首个非零分支=引擎单规则语义(first-match);SpawnCondition 基面逐型未解析→mult=N
//  (登记:OceanMonster 等基面近似)。多分支多 zone=取首支。
//  输出=patch content/npcs/<key>.json(仅 spawn 缺席件;零发明:未解析形跳过)。
import { readFileSync, writeFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '../../../CalamityModPublic/NPCs');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '../../mods/calamity/content/npcs');

const ZT_MAP = { ZoneSulphur: 'sulphur', ZoneAstral: 'astral', ZoneBrimstoneCrag: 'brimstone', ZoneCalamity: 'brimstone', ZoneSunkenSea: 'sunken' };
const ZONE_MAP = {
  ZoneSulphur: 'sulphur',
  ZoneAstral: 'astral',
  ZoneSnow: 'snow',
  ZoneJungle: 'jungle',
  ZoneDesert: 'desert',
  ZoneCorrupt: 'corrupt',
  ZoneCrimson: 'crimson',
  ZoneHallow: 'hallow',
  ZoneDungeon: 'dungeon',
  ZoneGlowshroom: 'glowshroom',
  ZoneBeach: 'beach',
  ZoneAbyssLayer1: 'abyss1',
  ZoneAbyssLayer2: 'abyss2',
  ZoneAbyssLayer3: 'abyss3',
  ZoneAbyssLayer4: 'abyss4',
  InAstral: 'astral',      // ★一百八十四刀:InXxx() 调用形(Player.InAstral 等)
};

const walk = (dir) => {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(p));
    else if (e.name.endsWith('.cs')) out.push(p);
  }
  return out;
};

const files = walk(SRC);
let parsed = 0, emitted = 0, skipped = 0, existing = 0;
const skippedLog = [];
for (const f of files) {
  const text = readFileSync(f, 'utf8');
  const m = text.match(/public override float SpawnChance\(NPCSpawnInfo spawnInfo\)\s*\{([\s\S]*?)\n        \}/);
  if (!m) continue;
  parsed++;
  const body = m[1];
  const cls = f.split('/').pop().replace(/\.cs$/, '').trim();
  const key = cls.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
  const outPath = join(OUT, `${key}.json`);
  if (!existsSync(outPath)) { skipped++; skippedLog.push(`${key}: no-json`); continue; }
  const json = JSON.parse(readFileSync(outPath, 'utf8'));
  if (json.spawn !== undefined) {
    existing++;
    // ★一百二十三刀:maxCount 富化(既有 spawn 缺闸时回扫分支形补齐;幂等)
    if (json.spawn.maxCount === undefined) {
      const rm = body.match(/CountNPCS\(.*?\)\s*<\s*(\d+)/);
      if (rm) { json.spawn.maxCount = Number(rm[1]) - 1; writeFileSync(outPath, JSON.stringify(json, null, 2) + '\n'); emitted++; }
    }
    continue;
  }

  // 分支序列:if (cond) return Nf; | return SpawnCondition.X.Chance * Nf;
  const branchRe = /if \(([^{]+?)\)\s*\{?\s*return (?:Main\.remixWorld \? [0-9.]+f? : )?(?:SpawnCondition\.\w+\.Chance \* )?([0-9.]+)f?\s*;/g;   // ★一百二十三刀:+remix 三元(取非 remix 支)   // ★一百二十刀:+SpawnCondition 乘式(基面近似=登记)
  let zone = null, water = false, mult = null, condZones = [], maxCount;
  let mm;
  while ((mm = branchRe.exec(body)) !== null) {
    const cond = mm[1], val = Number(mm[2]);
    if (val <= 0) continue;                      // 0 值守卫支=非生成条件,跳过
    const zs = Object.keys(ZONE_MAP).filter((z) => cond.includes(z));
    if (zs.length === 0) continue;               // 非 zone 门形=跳过(登记)
    condZones = zs;
    zone = ZONE_MAP[zs[0]];
    water = cond.includes('spawnInfo.Water');
    mult = val;
    const cm = cond.match(/CountNPCS\(.*?\)\s*<\s*(\d+)/);   // ★一百二十三刀(内层括号回溯)
    maxCount = cm ? Number(cm[1]) - 1 : undefined;
    break;                                       // first-match(登记:引擎单规则)
  }
  // 形②(负守卫+裸返回):`if (PlayerSafe || !ZoneX || !Water) return 0f; … return Nf;`
  //  负守卫项取反=正条件;Boss 击杀门(!DownedBossSystem.*)=gate 丢弃(引擎无旗,登记)
  if (mult === null) {
    const guards = [...body.matchAll(/if \(([^{}]+?)\)\s*\{\s*return 0f?\s*;/g)];
    const tail = body.match(/return ([0-9.]+)f?\s*;\s*$/);
    if (guards.length > 0 && tail && Number(tail[1]) > 0) {
      let zs = [], hasWater = false, gated = false;
      for (const g of guards) {
        const c = g[1];
        for (const z of Object.keys(ZONE_MAP)) if (c.includes(`!${z}`)) zs.push(ZONE_MAP[z]);
        if (c.includes('!spawnInfo.Water')) hasWater = true;
        if (c.includes('DownedBossSystem') || c.includes('downedBoss')) gated = true;
      }
      // 击杀门=条件被丢弃后 zone 面不完整 → 仅当守卫项里确有 zone 才发出(登记:门忽略)
      if (zs.length > 0 && !gated) {
        zone = zs[0]; water = hasWater; mult = Number(tail[1]);
      }
    }
  }
  // 形⑤:三元直返(`return ZoneX ? Nf : 0f;`;ZoneCalamity=陨石炼狱=brimstone 旗)
  if (mult === null) {
    const tern = body.match(/return\s+(?:spawnInfo\.Player\.Calamity\(\)\.)?(\w+)\s*\?\s*([0-9.]+)f?\s*:\s*0f?\s*;/);
    if (tern) {
      const zt = tern[1];
      if (ZT_MAP[zt]) { zone = ZT_MAP[zt]; mult = Number(tern[2]); }
    }
  }
  // 形②b:bare Chance 分支(`return SpawnCondition.X.Chance;`=mult 1)
  if (mult === null) {
    const bc = /if \(([^{]+?)\)\s*\{\s*return SpawnCondition\.\w+\.Chance;\s*\}/g.exec(body);
    if (bc) {
      const zs = Object.keys(ZONE_MAP).filter((z) => bc[1].includes(z));
      if (zs.length > 0) { zone = ZONE_MAP[zs[0]]; water = bc[1].includes('spawnInfo.Water'); mult = 1; }
    }
  }
  // 形③:尾支 SpawnCondition 基面(OceanMonster→beach 映射;其余基面类型=登记跳过)
  if (mult === null) {
    const tailC = body.match(/return SpawnCondition\.(\w+)\.Chance \* ([0-9.]+)f?\s*;/);
    if (tailC && tailC[1] === 'OceanMonster') { zone = 'beach'; water = false; mult = Number(tailC[2]); }
  }
  // 形④:BloodwormNormal 抛物线自薄(CountNPCS(5) 五倍衰减+OldDuke 基率)
  //  → 特批:zone sulphur+water+mult 0.2+maxCount 5(自薄+OldDuke 变率=登记)
  if (mult === null && key === 'bloodworm_normal') {
    json.spawn = { zone: 'sulphur', water: true, mult: 0.2, maxCount: 5 };
    writeFileSync(outPath, JSON.stringify(json, null, 2) + '\n');
    emitted++;
    continue;
  }
  if (mult === null) { skipped++; skippedLog.push(`${key}: no-simple-branch`); continue; }  if (mult === null) { skipped++; skippedLog.push(`${key}: no-simple-branch`); continue; }
  json.spawn = { zone, water, mult, ...(maxCount !== undefined ? { maxCount } : {}) };
  writeFileSync(outPath, JSON.stringify(json, null, 2) + '\n');
  emitted++;
}
console.log(JSON.stringify({ parsed, emitted, existing, skipped, skippedLog: skippedLog.slice(0, 12) }, null, 2));
