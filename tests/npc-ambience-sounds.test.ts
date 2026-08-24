// NPC 环境声三表回归（IdleSounds/闲话/Critter + AI 事件音批,2026-08-18）：
//   数据表 data/vanillaNpcAmbience.ts 全量对账 + 代表性触发验证
import { describe, it, expect } from 'vitest';
import { IDLE_SOUNDS, CHATTER_SOUNDS, CRITTER_SOUNDS, PET_SLIME_HIT_VOICES, petSlimeHitVoice } from '../src/data/vanillaNpcAmbience';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import type { GameHooks } from '../src/entities/types';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

function makeGame(world: World, sounds: string[]): GameHooks {
  return {
    world,
    player: { x: 30 * 16 + 16, y: 30 * 16, w: 12, h: 28, dead: false,
      get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
      vx: 0, vy: 0, useTime: 5 },
    enemies: () => [],
    spawnParticles: () => {},
    playSfx: () => {},
    playSfxFiles: (files: string[]) => { sounds.push(...files); },
    playSfxWav: (file: string) => { sounds.push(file); },
    addDamageNumber: () => {},
    damagePlayer: () => {},
    spawnDrop: () => {},
    spawnEnemy: () => null,
    spawnProj: () => {},
    onEnemyKilled: () => {},
    critters: () => [],
  } as unknown as GameHooks;
}

describe('环境声三表数据对账', () => {
  it('IdleSounds 关键条目（denom/range/gate）', () => {
    expect(IDLE_SOUNDS[62]).toEqual({ denom: 700, range: [26, 30] });      // 恶魔
    expect(IDLE_SOUNDS[63]?.gate).toBe('wet');                              // 水母湿门
    expect(IDLE_SOUNDS[288]?.denom).toBe(400);                              // 地牢幽魂 1/400
    expect(IDLE_SOUNDS[391]?.range).toEqual([86, 87]);                      // Scutlix
    expect(Object.keys(IDLE_SOUNDS).length).toBeGreaterThanOrEqual(47);
  });
  it('闲话表:僵尸 1/1000 / 木乃伊 Zombie_3 / 吸血鬼 Zombie_7', () => {
    expect(CHATTER_SOUNDS[3]).toEqual({ denom: 1000, file: 'Zombie_0' });
    expect(CHATTER_SOUNDS[78]).toEqual({ denom: 500, file: 'Zombie_3' });
    expect(CHATTER_SOUNDS[159]).toEqual({ denom: 500, file: 'Zombie_7' });
    expect(CHATTER_SOUNDS[269]?.denom).toBe(1000);                          // 地牢骨铠
  });
  it('Critter 表:鸭 1/200 白天 / 青蛙 still / 鸟清晨池', () => {
    expect(CRITTER_SOUNDS[362]?.denom).toBe(200);
    expect(CRITTER_SOUNDS[362]?.gate).toBe('day');
    expect(CRITTER_SOUNDS[361]?.gate).toBe('still');
    // 鸟 74：原版 Next(3)!=0→style14(2/3) else style18(1/3)——重复项表达精确权重(R22)
    expect(CRITTER_SOUNDS[74]?.pool).toEqual(['Zombie_14', 'Zombie_14', 'Zombie_18']);
    expect(CRITTER_SOUNDS[611]?.gate).toBe('night');
  });
  it('引用的 wav 全部在库（防键拼错静默）', () => {
    const files = new Set<string>();
    for (const s of Object.values(IDLE_SOUNDS)) {
      for (let n = s.range[0]; n < s.range[1]; n++) files.add(`Zombie_${n}`);
    }
    for (const c of Object.values(CHATTER_SOUNDS)) files.add(c.file);
    for (const c of Object.values(CRITTER_SOUNDS)) {
      files.add(c.file);
      for (const f of c.pool ?? []) files.add(f);
    }
    files.add('Pixie'); files.add('Roar_1'); files.add('NPC_Killed_9');
    files.add('NPC_Hit_11'); files.add('Zombie_109');
    const missing: string[] = [];
    for (const f of files) {
      // public/sounds 目录直查（构建期已拷贝;测试环境以 fs 为准）
      try { readFileSync(`${ROOT}/public/sounds/${f}.wav`); } catch { missing.push(f); }
    }
    expect(missing.join(',')).toBe('');
  });
  it('宠物史莱姆受击语音表（StrikeNPC :82255-82302）：14 id 全键 + 鸡稀有掷骰', () => {
    // 14 条全键（5484 铃铛=BellHurt=LegacySoundStyle(2,35)→Item_35 ×0.75 自动档;
    // 曾误判"素材缺"实为 wav 名搞错,2026-08-18 补齐）；音量=WithVolume（鸡 0.8 其余 0.5）
    expect(Object.keys(PET_SLIME_HIT_VOICES).length).toBe(14);
    expect(PET_SLIME_HIT_VOICES[5507]).toEqual({ file: 'player_hit_balloon', vol: 0.5 });
    expect(PET_SLIME_HIT_VOICES[5485]).toEqual({ file: 'player_hit_chicken', vol: 0.8 });
    expect(PET_SLIME_HIT_VOICES[5484]).toEqual({ file: 'Item_35', vol: 1 });
    expect(PET_SLIME_HIT_VOICES[5509]).toEqual({ file: 'player_hit_vampire', vol: 0.5 });
    expect(petSlimeHitVoice(1345)).toBeNull();          // 派对帽 ai[1] → 默认 HitSound
    expect(petSlimeHitVoice(5484)).toEqual({ file: 'Item_35', vol: 1 });
    // 鸡稀有变体：多次掷骰两种结果都合法（1/5 rare 0.5 档）
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(petSlimeHitVoice(5485)!.file);
    expect(seen.has('player_hit_chicken')).toBe(true);
    expect([...seen].every((f) => f === 'player_hit_chicken' || f === 'player_hit_chicken_rare')).toBe(true);
    // 全表 wav 在库（含 Item_35——case2 音库 35 号档）
    const missing: string[] = [];
    for (const v of Object.values(PET_SLIME_HIT_VOICES)) {
      try { readFileSync(`${ROOT}/public/sounds/${v.file}.wav`); } catch { missing.push(v.file); }
    }
    try { readFileSync(`${ROOT}/public/sounds/player_hit_chicken_rare.wav`); } catch { missing.push('player_hit_chicken_rare'); }
    expect(missing.join(',')).toBe('');
  });
});

describe('蠕虫出生音触发', () => {
  it('水蛭 117 出生首帧 → NPC_Killed_13', () => {
    const w = new World(50, 50, 7, 't');
    const sounds: string[] = [];
    const g = makeGame(w, sounds);
    const e = Enemy.fromVanilla(117, 25 * 16, 25 * 16)!;
    e.fixedUpdate(1 / 60, g);
    expect(sounds).toContain('NPC_Killed_13');
  });
  it('幻影龙 454 出生首帧 → Item_119', () => {
    const w = new World(50, 50, 7, 't');
    const sounds: string[] = [];
    const g = makeGame(w, sounds);
    const e = Enemy.fromVanilla(454, 25 * 16, 25 * 16)!;
    e.fixedUpdate(1 / 60, g);
    expect(sounds).toContain('Item_119');
  });
});

describe('音效遗留缺口批（2026-08-18 审计收尾）', () => {
  it('TransformVisuals 158⇄159（NPC.cs:81742-81749）：吸血鬼离远化蝙蝠 → Item_8', () => {
    const w = new World(50, 50, 7, 't');
    const sounds: string[] = [];
    const g = makeGame(w, sounds);   // 玩家 (30*16+16,30*16)
    const e = Enemy.fromVanilla(159, 4 * 16, 4 * 16)!;   // 距玩家 >300 → Transform(158)
    e.fixedUpdate(1 / 60, g);
    expect(e.vanillaId).toBe(158);
    expect(sounds).toContain('Item_8');
  });
  it('378 咬齿炸弹自爆链（NPC.cs:30044-30107）：玩家 <64 触发 → ai2==9 播 Item_14,倒计时尽自灭', () => {
    const w = new World(50, 50, 7, 't');
    const sounds: string[] = [];
    const g = makeGame(w, sounds);
    const e = Enemy.fromVanilla(378, 30 * 16, 30 * 16 - 40)!;   // 贴玩家（<64px）
    for (let i = 0; i < 20 && !e.dead; i++) e.fixedUpdate(1 / 60, g);
    expect(e.dead).toBe(true);          // ai[2]==1 消散（:30087-30090,不走掉落）
    expect(sounds).toContain('Item_14');  // :30082 自爆音（ai2==9 首 tick）
    expect(e.dontTakeDamage).toBe(true);  // 引爆态免疫（:30054）
  });
});
