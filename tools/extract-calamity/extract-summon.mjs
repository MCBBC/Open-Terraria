#!/usr/bin/env node
// 召唤物批译提取器(三百四十刀):Items/SummonItems C# → summon-rules.json
// 规则={item, npc(召唤 boss 键), zone(群系门), noBoss(共存门)}——
// main.js 批 sw.canUse+sw.itemUse(spawnNpc)。
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = process.env.CALAMITY_SRC ?? '/Users/vinlic/Project/GLM/SandboxWorld/CalamityModPublic';
const OUT = join(process.cwd(), 'mods/calamity/summon-rules.json');
const snake = (nm) => nm.replace(/\.cs$/, '').replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();

const ZONE_MAP = {
  ZoneJungle: 'zoneJungle', ZoneDesert: 'zoneDesert', ZoneHallow: 'zoneHallow',
  ZoneCorrupt: 'zoneCorrupt', ZoneCrimson: 'zoneCrimson', ZoneGlowshroom: 'zoneGlowshroom',
  ZoneDungeon: 'zoneDungeon', ZoneBeach: 'zoneBeach', ZoneSnow: 'zoneSnow',
  ZoneUnderworldHeight: 'zoneUnderworld', ZoneSulphur: 'mod:sulphur',
};

const files = readdirSync(join(SRC, 'Items/SummonItems')).filter(f => f.endsWith('.cs'));
const rows = [];
for (const f of files) {
  const src = readFileSync(join(SRC, 'Items/SummonItems', f), 'utf8');
  const key = snake(f);
  if (/abstract|class \w+ : ModItem/.test(src) === false) continue;
  const sbu0 = /SpawnBossUsingItem<\s*(\w+)\s*>/.exec(src);
  // 召唤目标:sbu 泛型直提(优先);否则 NPCType 引用+boss 名 filter
  const spawnBody = /SpawnOnPlayer|NewNPC/.exec(src) ? src : null;
  const bossRefs = sbu0
    ? [sbu0[1]]
    : [...src.matchAll(/NPCType(?:<\s*(\w+)\s*>\(\)|\(\s*"(\w+)"\s*\))/g)]
      .map(m => m[1] ?? m[2])
      .filter(n => /Head$|Body$|Boss$|Hive$|Queen$|King$|Goddess$|Weaver$|Void$|Signus$|Providence$|Yharon$|Calamitas$|Goliath$|Guardian$|Polterghast$|Perforator$|HiveMind$|SlimeGod$|Cryogen$|Crabulon$|Leviathan$|Anahita$|Aureus$|Deus$|Scourge$|Dog$|Devourer/i.test(n));
  if (bossRefs.length === 0) continue;
  // zone 门:CanUseItem 体里的 ZoneX
  const cu = /public override bool\?? CanUseItem\(/.exec(src);
  let cuBody = '';
  if (cu) {
    let i = src.indexOf('{', cu.index), depth = 0;
    for (; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) break; }
    }
    cuBody = src.slice(src.indexOf('{', cu.index), i);
  }
  const zones = [...cuBody.matchAll(/player\.(?:Calamity\(\)\.)?(Zone\w+)/g)].map(m => m[1]);
  const noBoss = [...cuBody.matchAll(/NPCType(?:<\s*(\w+)\s*>\(\)|\(\s*"(\w+)"\s*\))/g)].map(m => snake(m[1] ?? m[2]));
  rows.push({
    item: key,
    npc: snake(bossRefs[0]),
    zone: [...new Set(zones)].map(z => ZONE_MAP[z] ?? null).filter(Boolean),
    noBoss: [...new Set(noBoss)],
  });
}
writeFileSync(OUT, JSON.stringify(rows, null, 1));
console.log('summon 规则:', rows.length);
