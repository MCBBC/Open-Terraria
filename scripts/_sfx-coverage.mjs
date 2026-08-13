// 音效接线覆盖率诊断（纯 fs，无 vite 依赖；node scripts/_sfx-coverage.mjs）：
//  1. per-NPC HitSound/DeathSound → public/sounds wav 命中率（vanilla-npcs.json 全 676 条）
//  2. 接线站点扫描：bossAI_dd2.ts / MinionProj.ts 的 playSfxFiles 引用的声轨/文件
//     是否都存在（防"接了不响"的文件名漂移）
//  3. 输出：已接线站点数 / 覆盖随从族 / DD2 状态数
// 声轨表 src/data/vanilla-soundtracks.json 是唯一数据源（SoundID.cs 160 条 × wav 实际文件）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const TRACKS = read('src/data/vanilla-soundtracks.json');
const NPCS = read('public/sprites/vanilla-npcs.json');
const USES = read('src/data/vanilla-itemusesound.json');
const wavFiles = new Set(fs.readdirSync(path.join(ROOT, 'public/sounds'))
  .filter((f) => f.endsWith('.wav')).map((f) => f.replace(/\.wav$/, '')));

// 与 src/data/vanillaNpcs.ts 的 SOUND_NAME_ALIASES 同表（诊断脚本侧副本——
// 两侧任一改动需同步；长度仅 7 条）
const ALIASES = {
  DD2_BetsysWrathShot: 'dd2_betsy_fireball_shot',
  DD2_BetsysWrathImpact: 'dd2_betsy_fireball_impact',
  DeadCellsMushroomSummon: 'deadcells_mushroom_summon',
  DeadCellsBarrelLauncherFire: 'deadcells_barrel_launcher_fire',
  JimsDrone: 'Drone',
  RCCar: 'rccar',
  LeafBlower: '',
};
const toTrack = (n) => (Object.prototype.hasOwnProperty.call(ALIASES, n)
  ? (ALIASES[n] || null)
  : (Object.prototype.hasOwnProperty.call(TRACKS, n.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase())
    ? n.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase()
    : null));
// itemUseSound.ts 的 USE_SOUND_ALIASES 副本（LegacySoundStyle 别名/遗留轨 → wav）
const USE_ALIASES = {
  DD2_BetsysWrathShot: 'dd2_betsy_fireball_shot',
  DD2_BetsysWrathImpact: 'dd2_betsy_fireball_impact',
  LeafBlower: 'Item_34',
};

/** SoundID 名 → wav 列表（vanillaNpcs.vanillaSoundFiles 同规则） */
const resolveFiles = (name) => {
  if (!name) return null;
  const legacy = name.match(/^(?:NPCHit|NPCKilled|NPCDeath)(\d+)$/);
  if (legacy) return [name.startsWith('NPCHit') ? `NPC_Hit_${legacy[1]}` : `NPC_Killed_${legacy[1]}`];
  if (/^NPC_(?:Hit|Killed)_\d+$/.test(name)) return [name];
  const t = toTrack(name);
  return t ? TRACKS[t] ?? null : null;
};

// ---------- 1. per-NPC hit/death 覆盖率 ----------
let hitOk = 0, hitTotal = 0, deathOk = 0, deathTotal = 0;
const missingHit = [], missingDeath = [];
for (const [id, v] of Object.entries(NPCS)) {
  const h = resolveFiles(v.HitSound);
  const d = resolveFiles(v.DeathSound);
  if (v.HitSound != null) {
    hitTotal++;
    if (h && h.every((f) => wavFiles.has(f))) hitOk++;
    else missingHit.push(`${id}:${v.HitSound}`);
  }
  if (v.DeathSound != null) {
    deathTotal++;
    if (d && d.every((f) => wavFiles.has(f))) deathOk++;
    else missingDeath.push(`${id}:${v.DeathSound}`);
  }
}
console.log('==== 1. per-NPC HitSound/DeathSound → wav 覆盖率 ====');
console.log(`HitSound   : ${hitOk}/${hitTotal} (${(hitOk / hitTotal * 100).toFixed(1)}%)`);
console.log(`DeathSound : ${deathOk}/${deathTotal} (${(deathOk / deathTotal * 100).toFixed(1)}%)`);
console.log(`缺 wav     : hit=${JSON.stringify(missingHit)} death=${JSON.stringify(missingDeath)}`);

// ---------- 1b. 命名轨 UseSound 解析率 ----------
let useOk = 0; const useTotal = Object.keys(USES).length; const useMiss = [];
for (const [id, s] of Object.entries(USES)) {
  if (/^Item_\d+$/.test(s)) { if (wavFiles.has(s)) useOk++; else useMiss.push(`${id}:${s}`); continue; }
  if (Object.prototype.hasOwnProperty.call(USE_ALIASES, s)) {
    const v = USE_ALIASES[s];
    const ok = wavFiles.has(v)
      || (TRACKS[v] ?? []).every((f) => wavFiles.has(f));
    if (ok) useOk++; else useMiss.push(`${id}:${s}`);
    continue;
  }
  const t = toTrack(s);
  if (t && TRACKS[t]?.length) useOk++; else useMiss.push(`${id}:${s}`);
}
console.log('---- 命名轨 UseSound（itemUseSound.ts）----');
console.log(`解析       : ${useOk}/${useTotal} (${(useOk / useTotal * 100).toFixed(1)}%) 未解析=${JSON.stringify(useMiss)}`);

// ---------- 2. 接线站点扫描 ----------
const WIRES = [
  { file: 'src/entities/bossAI_dd2.ts', label: 'DD2 状态机' },
  { file: 'src/entities/MinionProj.ts', label: '随从/哨兵' },
];
const SOUND_PREFIX = /^(dd2_|abigail_|pal_|deadcells_|deerclops_|chester_|Item_\d+$|NPC_(Hit|Killed)_\d+$)/;
let stations = 0;
const refMissing = [];
const dd2States = new Set(), minionFamilies = new Set();
const FAMILY_BY_TRACK = {
  dd2_betsy_wind_attack: 'Betsy:风压冲', dd2_betsy_flame_breath: 'Betsy:火焰吐息',
  dd2_betsy_fireball_shot: 'Betsy:空袭火球', dd2_betsy_flying_circle_attack: 'Betsy:翻转俯冲',
  dd2_betsy_scream: 'Betsy:召唤咆哮', dd2_betsy_summon: 'Betsy:召唤出怪',
  dd2_dark_mage_attack: 'DarkMage:暗影矢', dd2_dark_mage_cast_heal: 'DarkMage:治疗施法',
  dd2_dark_mage_heal_impact: 'DarkMage:治疗脉动', dd2_dark_mage_summon_skeleton: 'DarkMage:召骷髅施法',
  dd2_skeleton_summoned: 'DarkMage:骷髅阵眼', dd2_lightning_bug_zap: '荧光虫:电弧',
  dd2_wyvern_dive_down: '飞龙:俯冲', dd2_wyvern_scream: '飞龙:俯冲嘶鸣',
  dd2_kobold_flyer_charge_scream: '小妖魔滑翔怪:冲锋嘶鸣', dd2_kobold_ignite: '小妖魔滑翔怪:点火',
  dd2_etherian_portal_open: '神秘传送门:开门', dd2_etherian_portal_spawn_enemy: 'DD2:门出怪',
  dd2_flameburst_tower_shot: '哨兵:爆炸烈焰塔', dd2_ballista_tower_shot: '哨兵:弩车塔',
  dd2_lightning_aura_zap: '哨兵:闪电光环', dd2_explosive_trap_explode: '哨兵:爆炸机关',
  dd2_defense_tower_spawn: '哨兵:OOA 放置', abigail_summon: '阿比盖尔:召唤',
  abigail_attack: '阿比盖尔:挥击', abigail_cry: '阿比盖尔:哭声', abigail_upgrade: '阿比盖尔:升级',
  deadcells_mushroom_summon: '蘑菇随从:召唤', pal_summon: 'Pal:召唤',
  pal_cattiva: 'Cattiva:叫', pal_foxparks: 'Foxparks:叫',
};
for (const w of WIRES) {
  const src = fs.readFileSync(path.join(ROOT, w.file), 'utf8');
  stations += (src.match(/playSfxFiles\(/g) || []).length;
  // 扫全部"声音名形"字符串字面量（含 playSfxFiles 直取 / soundTrackFiles('…') /
  // PROJ_SHOT_SFX·MINION_SUMMON_SFX 表值）——任一引用必须能落到 wav
  for (const lit of src.matchAll(/'([A-Za-z0-9_]+)'/g)) {
    const n = lit[1];
    if (!SOUND_PREFIX.test(n)) continue;
    const files = Object.prototype.hasOwnProperty.call(TRACKS, n) ? TRACKS[n] : [n];
    for (const f of files) {
      if (!wavFiles.has(f)) refMissing.push(`${w.file}:${n}->${f}`);
    }
    if (FAMILY_BY_TRACK[n]) (w.label === 'DD2 状态机' ? dd2States : minionFamilies).add(FAMILY_BY_TRACK[n]);
  }
}
console.log('==== 2. 接线站点（playSfxFiles 直取 wav）====');
console.log(`站点总数   : ${stations}`);
console.log(`引用缺文件 : ${JSON.stringify([...new Set(refMissing)])}`);

// ---------- 3. 覆盖清单 ----------
console.log('==== 3. 覆盖清单 ====');
console.log(`DD2 状态/族  ${dd2States.size} 组: ${[...dd2States].sort().join(' / ')}`);
console.log(`随从/哨兵族  ${minionFamilies.size} 组: ${[...minionFamilies].sort().join(' / ')}`);
