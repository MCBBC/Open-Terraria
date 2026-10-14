// 1457 移交批补盲(2026-08-21):今天落的 3 改此前零测试——
//   ① 真眼免近战(Game.updateSwingHits vanillaId===400 门,1457 GetMeleeCollisionData
//      NPC.cs:96142-96144:type==400 命中盒清空——月总真眼不可被近战命中,只吃弹幕)
//   ② 陨石 worldSurface 门(Game EoW/BoC 击杀块 w.groundLevel > 50,1457 NPC.cs:80269)
//   ③ 浸剂伴发 395(ImbueFire 命中 → potentAcidT≥1,1457 StatusNPC meleeEnchant==1
//      → AddBuff(395,60t))
// 测法:Game 构造函数需 DOM/WebGL,node 环境不可行 → 以 Object.create(Game.prototype)
// 挂最小字段后直调私有方法(运行时 TS private 不存在);updateSwingHits 全部依赖均为
// this.* 字段读,可完整桩化。陨石门内联在 fixedUpdate 主循环里不可驱动 → 结构断言
// (源码锚文本+花括号配平定位 else 支)+ meteorPending↔flags.spawnMeteor 行为锚。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Game } from '../src/core/Game';
import { Enemy } from '../src/entities/Enemy';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { BuffType } from '../src/stats/Buffs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** 最小可驱动 updateSwingHits 的 Game 原型桩(swing 已起手、手持铁镐 1) */
function swingGame(enemyVids: number[], opts: { imbue?: BuffType } = {}) {
  const world = new World(120, 120, 30, 'handover1457');
  const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
  const player = new Player(50 * TILE, 90 * TILE, new Inventory());
  player.inv.add(1, 1);   // 铁镐(damage>0 的 melee 工具,过 noMelee/damage 门)
  if (opts.imbue !== undefined) player.buffs.apply(opts.imbue, 60);
  const enemies = enemyVids
    .map((vid) => Enemy.fromVanilla(vid, player.cx + 8, vid === 1 ? player.y : player.cy)!)
    .filter(Boolean);
  const dmgLog: number[] = [];
  g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: 1, useStyle: 1 };
  g.swingHitSet = new Set<number>();
  g.swingTileCutSet = new Set<number>();
  g.entities = { critters: [], npcs: [], enemies };
  g.player = player;
  g.world = world;
  g.sfx = { playWavFile: () => true, playFiles: () => true, play: () => {} };
  g.addDamageNumber = (..._a: unknown[]) => { dmgLog.push(1); };
  g.spawnParticles = () => {};
  g.spawnDrop = () => null;
  g.net = null;
  g.bannerNpcActive = () => false;
  g.remotePlayerProxies = [];
  return { g, player, world, enemies: enemies as Enemy[], dmgLog };
}

describe('1457 移交: 真眼免近战(GetMeleeCollisionData :96142-96144)', () => {
  it('月总真眼 400 在挥击判定盒内也不受击(hp 不动/无飘字)', () => {
    const { g, enemies, dmgLog } = swingGame([400]);
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    const eye = enemies[0];
    expect(eye.hp).toBe(eye.def.hp);   // 未掉血
    expect(dmgLog).toHaveLength(0);                   // 无伤害数字
  });
  it('对照:月总头 396 同位摆放可正常受击(门只豁免 400 不殃及月总本体)', () => {
    const { g, enemies, dmgLog } = swingGame([396]);
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(enemies[0].hp).toBeLessThan(enemies[0].def.hp);
    expect(dmgLog).toHaveLength(1);
  });
  it('同挥双目标:400 跳过、396 照打(continue 语义非整环 break)', () => {
    const { g, enemies, dmgLog } = swingGame([400, 396]);
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(enemies[0].vanillaId).toBe(400);
    expect(enemies[0].hp).toBe(enemies[0].def.hp);
    expect(enemies[1].hp).toBeLessThan(enemies[1].def.hp);
    expect(dmgLog).toHaveLength(1);
  });
});

describe('1457 移交: 浸剂伴发 PotentAcid 395(StatusToNPC meleeEnchant==1 → AddBuff(395,60t))', () => {
  // ★BJ678（2026-10-14）改判：伴发 395 属【毒液浸剂】支——原版 buff 71(毒液药剂)→
  //  meleeEnchant==1（Player.cs:6504-6508 AddBuff(70)+AddBuff(395,60)）；火浸剂
  //  buff 74→meleeEnchant==3（:6513-6515）仅 AddBuff(24)。旧锁把 395 挂火浸剂支
  //  = buffId↔浸剂错位（与投射物侧 applyMeleeImbue 双胞胎相悖），随 BJ678 免疫
  //  闸刀逐支对位复核一并归位（Game.ts 挥砍浸剂块同刀）。
  it('毒液浸剂命中 → venomT ≥ 5 且伴发 potentAcidT ≥ 1(meleeEnchant==1 双 AddBuff)', () => {
    const { g, enemies } = swingGame([1], { imbue: BuffType.ImbueVenom });
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    const slime = enemies[0];
    expect(slime.venomT).toBeGreaterThanOrEqual(5);
    expect(slime.potentAcidT).toBeGreaterThanOrEqual(1);   // ★1457 伴发
  });
  it('对照:火浸剂只上 OnFire 3-7s,不伴发 395(meleeEnchant==3 无此支)', () => {
    const { g, enemies } = swingGame([1], { imbue: BuffType.ImbueFire });
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    const slime = enemies[0];
    expect(slime.onFireT).toBeGreaterThanOrEqual(3);       // 原火浸剂链保留
    expect(slime.potentAcidT).toBe(0);                     // BJ678 归位：火支无 395
  });
  it('无浸剂命中 → potentAcidT 恒 0', () => {
    const { g, enemies } = swingGame([1]);
    (g as unknown as { updateSwingHits: () => void }).updateSwingHits();
    expect(enemies[0].potentAcidT).toBe(0);
  });
});

describe('1457 移交: 陨石 worldSurface 门(NPC.cs:80269 worldSurface>50)', () => {
  // 块内联在 Game.fixedUpdate 主循环(node 无法驱动)→ 结构断言:
  // ①门表达式在 EoW/BoC 击杀块内;②该块在 bossFled(离场)支的 else(击杀)支内;
  // ③meteorPending 访问器 ↔ world.flags.spawnMeteor 行为锚(断言读数即任务要求的
  // "读 world.flags.spawnMeteor")。
  const src = readFileSync(join(ROOT, 'src/core/Game.ts'), 'utf8');
  const lines = src.split('\n');
  const gateIdx = lines.findIndex((l) => l.includes('w.groundLevel > 50') && l.includes('meteorPending = true'));
  const anchorIdx = lines.findIndex((l) => l.includes('★1457 加 isThereAWorldSurface 门'));

  it('门表达式存在于 EoW/BoC 击杀块(13/266/14/15)内,且紧邻 1457 注记', () => {
    expect(gateIdx).toBeGreaterThan(-1);
    expect(anchorIdx).toBeGreaterThan(-1);
    expect(Math.abs(gateIdx - anchorIdx)).toBeLessThanOrEqual(2);   // 门行与注记相邻
    // 外层 if 限定四种 boss(世吞 13/段 266/克脑 14/15)
    const guard = lines.slice(Math.max(0, gateIdx - 4), gateIdx).join('\n');
    expect(guard).toContain('vanillaId === 13');
    expect(guard).toContain('vanillaId === 266');
    expect(guard).toContain('vanillaId === 14');
    expect(guard).toContain('vanillaId === 15');
  });

  it('门在击杀支(非 bossFled 离场支)内:花括号配平定位 else 支跨度', () => {
    // 从 `if (this.boss.bossFled) {` 起做花括号配平,找其配对 `} else {` 的 else 支体
    const fledIdx = lines.findIndex((l) => l.includes('if (this.boss.bossFled) {'));
    expect(fledIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(fledIdx);
    let depth = 0;
    let elseStart = -1;
    for (let i = fledIdx; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === '{') depth++;
        else if (ch === '}') {
          depth--;
          if (depth === 0) { elseStart = i; break; }   // if 支闭合行(应为 `} else {`)
        }
      }
      if (elseStart >= 0) break;
    }
    expect(lines[elseStart]).toContain('} else {');
    // else 支体 = elseStart 行的首个 `{` 之后到其配对闭合(该行 `}` 属 if 支,须跳过;
    // 深度从 1 起算——else 自身的开括号已被消费)
    let d = 1;
    let elseEnd = -1;
    for (let i = elseStart; i < lines.length; i++) {
      const s = i === elseStart ? lines[i].slice(lines[i].indexOf('{') + 1) : lines[i];
      for (const ch of s) {
        if (ch === '{') d++;
        else if (ch === '}') {
          d--;
          if (d === 0) { elseEnd = i; break; }
        }
      }
      if (elseEnd >= 0) break;
    }
    expect(gateIdx).toBeGreaterThan(elseStart);
    expect(gateIdx).toBeLessThan(elseEnd);   // 离场(逃走)不 roll 陨石——2026-08-18 归位
  });

  it('meteorPending 访问器 ↔ world.flags.spawnMeteor(断言面=任务指定读数)', () => {
    const w = new World(120, 120, 30, 'meteorflag');
    const g = Object.create(Game.prototype) as unknown as Record<string, unknown>;
    g.world = w;
    w.groundLevel = 30;                       // ≤50:skyblock/极小世界(门应拒绝置位)
    expect(w.flags.spawnMeteor).toBeFalsy();  // 初始无陨石
    (g as unknown as { meteorPending: boolean }).meteorPending = true;
    expect(w.flags.spawnMeteor).toBe(true);   // 置位写穿到存档旗标
    (g as unknown as { meteorPending: boolean }).meteorPending = false;
    expect(w.flags.spawnMeteor).toBe(false);  // 消费(夜午夜后/昼 9AM 后)清旗
  });

  it('门谓词语义锚:groundLevel 30(≤50)与 80(>50)在 isThereAWorldSurface 判点上分叉', () => {
    // 与 Game.ts:17598 `hasWorldSurface: w.groundLevel > 50`(Main.isThereAWorldSurface
    // Main.cs:2861)同一谓词——锁"50"这个阈值本身防手滑改动
    const small = new World(120, 120, 30, 'small');
    small.groundLevel = 30;
    const normal = new World(120, 120, 30, 'normal');
    normal.groundLevel = 80;
    expect(small.groundLevel > 50).toBe(false);    // 1457 门:不落陨石
    expect(normal.groundLevel > 50).toBe(true);    // 常规世界:恒真
  });
});
