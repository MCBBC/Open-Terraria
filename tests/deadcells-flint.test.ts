// Dead Cells 联动武器组回归（火石枪 5462 + 蘑菇小伙伴 5456）：
//   ① 5462 使用 → 弹 1040（combatWeapon 路由 'shot'/shoot1040 + FlintChargeProj 实体）
//   ② 蓄力→释放：恒发 1043 波（伤×1.78）；满蓄（ai1≥30）另发地表尖刺列 1041；
//      未满蓄无尖刺；收势 useAnim 拍后亡
//   ③ 音节拍：deadcells_flint_charge 恰 ai1==30 一声（vol .5）/deadcells_flint_release+
//      dd2_monk_staff_ground_impact 收尾叠播（Spawn_DeadCellsFlint flag 门,无合格格静默）/
//      deadcells_flint_wave 每尖刺出土拍一声（vol .1,ai0<0 延迟段不播）
//   ④ deadcells_mushroom_explode 三槽轮换（50% 触发掷+随机槽占用置换,≤3 并发帽;
//      ParticleOrchestrator.cs:2430-2440）+ 1044 爆炸 AoE/1022 爆点折返
// 原版锚：Item.cs:43080-43097 / Projectile.cs:9836-9891/:53155-53305/:42735-42956/
//   :52299-52320/:15933-15946/:35094-35281/:50598-50630 / Player.cs:3833/:53912 /
//   SoundID.cs:1112/:1114/:1116/:1118 / ParticleOrchestrator.cs:1786-1901/:2426-2516
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';
import { FlintChargeProj, FlintWaveProj, FlintSpikeProj, emitFlintSpikes } from '../src/entities/DeadCellsFlint';
import { MushroomBoiExplosionProj, requestMushroomBoiExplosion, resetMushroomBoiExplosionSlots }
  from '../src/entities/DeadCellsMushroom';
import { MinionProj } from '../src/entities/MinionProj';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { combatWeapon } from '../src/data/vanillaItemCombat';

function makeGame(w: World, list: unknown[] = [], sfx?: Array<{ files: string[]; vol: number }>,
  added?: unknown[]) {
  const sfxCalls = sfx ?? [];
  const projectiles: unknown[] = [];
  return {
    world: w,
    player: null as unknown,
    enemies: () => list,
    entities: { nextId: 1, projectiles,
      add: (e: unknown, b: string) => { if (b === 'projectiles') { added?.push(e); projectiles.push(e); } } },
    playSfx: () => {}, playSfxFile: () => {},
    playSfxFiles: (files: string[], vol = 1) => { sfxCalls.push({ files, vol }); },
    spawnParticles: () => {}, addDamageNumber: () => {}, spawnDrop: () => null,
    damagePlayer: () => {}, critters: () => [], notifyInventoryChanged: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {}, cutTile: () => {},
    sfxCalls, added,
  } as unknown as GameHooks & { sfxCalls: Array<{ files: string[]; vol: number }>; added: unknown[] };
}

function emptyWorld(): World {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 180, 1, 0, 0);   // 地表一行实心
  return w;
}

function mkOwner(cx: number, cy: number) {
  return { cx, cy, facing: 1, dead: false, vx: 0, vy: 0 };
}

function mkEnemy(id: number, x: number, y: number, w = 40, h = 40) {
  const e = { id, x, y, w, h, dead: false, hurtCalls: 0, lastDmg: 0,
    def: { lifeMax: 100, friendly: false },
    get cx() { return e.x + e.w / 2; },
    get cy() { return e.y + e.h / 2; },
    hurt(d: number) { e.hurtCalls++; e.lastDmg = d; return true; } };
  return e;
}

describe('① 5462 火石枪 → 弹 1040', () => {
  it('数据面路由：combatWeapon(5462) = shot/shoot1040/useTime15/autoReuse（进 useCombatWeapon 分派）', () => {
    const cw = combatWeapon({ key: 'vi_5462_flint', vid: 5462 });
    expect(cw).not.toBeNull();
    expect(cw!.kind).toBe('shot');
    expect(cw!.shoot).toBe(1040);                     // Item.cs:43093
    expect(cw!.useTime).toBe(15);                     // :43085
    expect((cw as { autoReuse?: boolean }).autoReuse).toBe(true);   // :43083
  });

  it('实体面：使用即生成 1040 蓄力控制器（锚玩家中心、2×2、不可见）', () => {
    const game = makeGame(emptyWorld(), [], undefined, []);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const c = new FlintChargeProj(owner, 0, 0, 70, 5, () => true, () => ({ x: owner.cx + 500, y: owner.cy }), 15);
    (game as unknown as { added: unknown[] }).added.push(c);
    expect(c.projId).toBe(1040);
    expect(Math.abs(c.x - (owner.cx - 1))).toBeLessThan(1e-6);
    // 蓄力期不亡、pinUse 钉 useAnim+min(ai1,3)
    const pinned: number[] = [];
    c.pinUse = (t) => pinned.push(t);
    c.fixedUpdate(1, game);
    c.fixedUpdate(1, game);
    expect(c.dead).toBe(false);
    expect(pinned[1]).toBe(17);                       // 15+min(2,3)（:53216）
  });
});

describe('② 蓄力 → 释放转 1043 波 + 满蓄 1041 尖刺列', () => {
  it('满蓄松手：波伤=round(伤×1.78)、EmitSpikes 恰一次、收势 15t 后亡', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let held = true;
    let ended = false;
    const waves: Array<{ dmg: number; dir: number }> = [];
    const spikes: Array<{ x: number; dir: number; dmg: number }> = [];
    const c = new FlintChargeProj(owner, 0, 0, 100, 5, () => held,
      () => ({ x: owner.cx + 500, y: owner.cy }), 15);
    c.spawnWave = (_x, _y, _vx, _vy, dmg, dir) => waves.push({ dmg, dir });
    c.emitSpikes = (x, _y, dir, dmg) => spikes.push({ x, dir, dmg });
    for (let t = 0; t < 32 && !c.dead; t++) c.fixedUpdate(1, game);   // 蓄 32 拍（≥30 满蓄）
    expect(waves.length).toBe(0);
    held = false;
    c.fixedUpdate(1, game);                           // 松手拍：发波+尖刺
    expect(waves.length).toBe(1);
    expect(waves[0].dmg).toBe(178);                   // (int)(100×1.78)（:53171）
    expect(waves[0].dir).toBe(1);
    expect(spikes.length).toBe(1);                    // 满蓄 EmitSpikes（:53173-53176）
    for (let t = 0; t < 15 && !c.dead; t++) c.fixedUpdate(1, game);
    expect(c.dead).toBe(true);                        // 收势 useAnim 拍 Kill（:53182-53186）
    void ended;
  });

  it('未满蓄松手：仍发波但【无】尖刺列（flag=ai1>=30 门 :53165/:53173）', () => {
    const game = makeGame(emptyWorld());
    const owner = mkOwner(80 * TILE, 100 * TILE);
    let held = true;
    const waves: unknown[] = [];
    let spikeCalls = 0;
    const c = new FlintChargeProj(owner, 0, 0, 70, 5, () => held,
      () => ({ x: owner.cx + 500, y: owner.cy }), 15);
    c.spawnWave = (..._a) => waves.push(1);
    c.emitSpikes = () => { spikeCalls++; };
    for (let t = 0; t < 10; t++) c.fixedUpdate(1, game);   // 只蓄 10 拍
    held = false;
    c.fixedUpdate(1, game);
    expect(waves.length).toBe(1);
    expect(spikeCalls).toBe(0);
  });

  it('emitFlintSpikes：地表逐 2 格刺出 ≤13 根 1041（ai0=−i×2 出土延迟、初速 (dir,−10) 抖 ±9°）', () => {
    const w = emptyWorld();
    const game = makeGame(w, [], undefined, []);
    const spikes: FlintSpikeProj[] = [];
    emitFlintSpikes(game, 80 * TILE, 179 * TILE, 1, 70, 5, 0.04, 0,
      (e) => spikes.push(e as FlintSpikeProj));
    expect(spikes.length).toBe(13);                   // num=12 循环上限（:53247）
    expect(spikes[0].projId).toBe(1041);
    const a0 = (spikes[3] as unknown as { ai0: number }).ai0;
    expect(a0).toBe(-6);                              // −(num3×2)（:53270）
    const vy = spikes.map((s) => s.vy);
    expect(vy.every((v) => v < 0)).toBe(true);        // 初速向上（spinningpoint=(dir,-10)）
    expect(Math.abs(spikes[0].vx)).toBeLessThanOrEqual(10.01);
    // 出生位 = 地表格顶（colX*16+8 对齐格心、y=180*16 格顶）
    expect(spikes[0].y).toBe(180 * TILE - 16);
  });
});

describe('③ 音触发节拍（charge/release/wave）', () => {
  it('charge 恰 ai1==30 一拍播 deadcells_flint_charge（vol .5,SoundID.cs:1114）', () => {
    const sfx: Array<{ files: string[]; vol: number }> = [];
    const game = makeGame(emptyWorld(), [], sfx);
    const owner = mkOwner(80 * TILE, 100 * TILE);
    const c = new FlintChargeProj(owner, 0, 0, 70, 5, () => true,
      () => ({ x: owner.cx + 500, y: owner.cy }), 15);
    for (let t = 0; t < 29; t++) c.fixedUpdate(1, game);
    expect(sfx.length).toBe(0);
    c.fixedUpdate(1, game);                           // 第 30 拍
    expect(sfx.length).toBe(1);
    expect(sfx[0].files).toEqual(['deadcells_flint_charge']);
    expect(sfx[0].vol).toBe(0.5);
    for (let t = 0; t < 10; t++) c.fixedUpdate(1, game);
    expect(sfx.length).toBe(1);                       // 不重播
  });

  it('release 收尾：合格地表 → flint_release(vol .5)+monk_ground_impact 叠播;悬空静默', () => {
    const sfx: Array<{ files: string[]; vol: number }> = [];
    const game = makeGame(emptyWorld(), [], sfx, []);
    emitFlintSpikes(game, 80 * TILE, 179 * TILE, 1, 70, 5, 0.04, 0, () => {});
    const names = sfx.map((s) => s.files[0]);
    expect(names).toContain('deadcells_flint_release');               // :1884（SoundID.cs:1116）
    expect(names).toContain('dd2_monk_staff_ground_impact_0');        // :1888 叠播一声（三变体整组）
    const rel = sfx.find((s) => s.files[0] === 'deadcells_flint_release')!;
    expect(rel.vol).toBe(0.5);
    const monk = sfx.filter((s) => s.files[0].startsWith('dd2_monk_staff_ground_impact'));
    expect(monk.length).toBe(1);
    // 悬空（扫描盒内无「实心且顶裸」格 → Spawn_DeadCellsFlint flag=false 静默 :1879-1882）
    const sfx2: Array<{ files: string[]; vol: number }> = [];
    const game2 = makeGame(new World(160, 200, 30, 'open'), [], sfx2, []);
    emitFlintSpikes(game2, 80 * TILE, 60 * TILE, 1, 70, 5, 0.04, 0, () => {});
    expect(sfx2.length).toBe(0);
  });

  it('wave：每尖刺出土拍播 deadcells_flint_wave 一声（vol .1）;ai0<0 延迟段静默', () => {
    const sfx: Array<{ files: string[]; vol: number }> = [];
    const game = makeGame(emptyWorld(), [], sfx);
    const s = new FlintSpikeProj(1000, 2800, 1, -10, 70, 5, -4, 1.2);   // ai0=−4 出土延迟
    // 原版时序：ai[0] 先自增后判 ≥0 → |初值| 拍后的那一拍激活（−4→第 4 拍归 0 出声）
    for (let t = 0; t < 3; t++) s.fixedUpdate(1, game);
    expect(sfx.length).toBe(0);                       // 延迟段（ai0<0）不出声不判定
    s.fixedUpdate(1, game);                           // 第 4 拍：ai0 归 0 → 出土拍
    expect(sfx.length).toBe(1);
    expect(sfx[0].files).toEqual(['deadcells_flint_wave']);
    expect(sfx[0].vol).toBe(0.1);                     // SoundID.cs:1118
    for (let t = 0; t < 25; t++) s.fixedUpdate(1, game);
    expect(sfx.length).toBe(1);                       // localAI[0] 单次门
    expect(s.dead).toBe(true);                        // ≥19 Kill（num10=19）
  });

  it('1041 判定线（Center+速度向 200×scale,宽 22×scale）：线上敌中、线外敌不中', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    // 渐显期 scale=Opacity×ai1（前 4 拍 → 0.4×ai1 冻结,:52373-52376）——先走 5 拍定型,
    // 再按【当前判定线】布置敌怪（速度 (0,−1) 免斜向换算）
    const s = new FlintSpikeProj(1000, 2800, 0, -1, 70, 5, 0, 1.2);
    s.critChance = 0;
    for (let t = 0; t < 5; t++) s.fixedUpdate(1, game);
    const sc = (s as unknown as { scaleV: number }).scaleV;
    expect(sc).toBeGreaterThan(0.45);                 // ≈0.4×1.2（渐显终值）
    const segLen = 200 * sc;
    const mx = s.cx, my = s.cy - segLen / 2;          // 判定线中点
    const onLine = mkEnemy(1, mx - 20, my - 20);      // 敌心落线上（距离 0 < 半宽 11×sc）
    const offLine = mkEnemy(2, mx + 30, my - 20);     // 垂直偏 30px > 半宽 ≈5.3
    list.push(onLine, offLine);
    s.fixedUpdate(1, game);
    expect((onLine as { hurtCalls: number }).hurtCalls).toBe(1);
    expect((offLine as { hurtCalls: number }).hurtCalls).toBe(0);
  });
});

describe('④ 1022 爆炸音三槽轮换 + 1044 AoE + 爆点折返', () => {
  it('requestMushroomBoiExplosion：50% 触发掷 + 随机槽占用置换（≤3 并发,占满即跳过）', () => {
    resetMushroomBoiExplosionSlots();
    const sfx: Array<{ files: string[]; vol: number }> = [];
    const game = makeGame(emptyWorld(), [], sfx);
    const seq = (vals: number[]) => { let i = 0; return () => vals[i++ % vals.length]; };
    // 触发掷失败（rand.Next(2)!=0 → rng≥0.5）：完全不出声
    expect(requestMushroomBoiExplosion(game, 0, 0, seq([0.7]))).toBe(false);
    // 槽 0 播放（gate 0.1 / slot 0.1）
    expect(requestMushroomBoiExplosion(game, 0, 0, seq([0.1, 0.1]))).toBe(true);
    expect(sfx.length).toBe(1);
    expect(sfx[0].files).toEqual(['deadcells_mushroom_explode']);
    expect(sfx[0].vol).toBe(0.15);                    // SoundID.cs:1112
    // 同槽再命中 = 占用中跳过（原版 stop+replay 语义在本仓无停播 API 下取并发帽近似）
    expect(requestMushroomBoiExplosion(game, 0, 0, seq([0.1, 0.1]))).toBe(false);
    // 槽 2（slot draw 0.95）独立可用
    expect(requestMushroomBoiExplosion(game, 0, 0, seq([0.1, 0.95]))).toBe(true);
    // 重置后同参数恢复播放（槽生命周期隔离）
    resetMushroomBoiExplosionSlots();
    expect(requestMushroomBoiExplosion(game, 0, 0, seq([0.1, 0.1]))).toBe(true);
  });

  it('1044 爆炸弹：首拍 104 盒 AoE 每敌一次 + 编排回调恰一次,3 拍自灭', () => {
    const list: unknown[] = [];
    const game = makeGame(emptyWorld(), list);
    const inBox = mkEnemy(1, 1000 - 40, 1000 - 20);          // 盒心 (1000,1000) 半宽 52 内
    const outBox = mkEnemy(2, 1000 + 200, 1000);
    list.push(inBox, outBox);
    let booms = 0;
    const b = new MushroomBoiExplosionProj(1000, 1000, 133, 6, () => { booms++; });
    b.critChance = 0;
    b.fixedUpdate(1, game);
    expect(booms).toBe(1);
    expect((inBox as { lastDmg: number }).lastDmg).toBe(133);
    expect((outBox as { hurtCalls: number }).hurtCalls).toBe(0);
    expect(b.dead).toBe(false);
    b.fixedUpdate(1, game);
    b.fixedUpdate(1, game);
    expect(b.dead).toBe(true);                        // 3×projFrames Kill 门
    expect(booms).toBe(1);                            // 不重复编排
  });

  it('1022 爆点（AI_067 flag6 :50598-50621）：跃击中贴敌 60px → 弹 1044+折返玩家中心+小随机速', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list, undefined, []);
    const p = new Player(80 * TILE, 98 * TILE, new Inventory());
    (game as unknown as { player: unknown }).player = p;
    // 随从远离玩家 500px（爆后折返可无接触歧义）、敌贴随从
    const m = new MinionProj(p.cx - 500, p.cy, 1022, 100, 2, false, 0, false, () => p);
    list.push(mkEnemy(9, m.cx + 10, m.cy));           // 贴身敌
    (m as unknown as { mbA2: number }).mbA2 = 30;     // 跃击态（TryJumpingToTarget 置 30）
    m.fixedUpdate(1, game);
    const added = (game as unknown as { added: unknown[] }).added;
    const boom = added.find((e) => e instanceof MushroomBoiExplosionProj) as MushroomBoiExplosionProj | undefined;
    expect(boom).toBeDefined();
    expect(boom!.damage).toBe(133);                   // round(伤×1.33)（:50606）
    expect(boom!.knockback).toBe(6);                  // kb×3（:50606）
    // Center=玩家中心直写（:50609）——同拍后续行走段仍会位移/改速（原版同构：
    // AI 内直写 Center 后 Update 才积分）→ 取近邻断言
    expect(Math.hypot(m.cx - p.cx, m.cy - p.cy)).toBeLessThan(80);
    expect(Math.abs(m.vx)).toBeLessThanOrEqual(6.000001);   // 行走限速 clamp=6（有目标档）
    expect((m as unknown as { mbA2: number }).mbA2).toBe(-119);    // 爆后冷却 -120 → 本拍 decay ++（:50622）
    // 折返后远离敌怪 → 无接触伤结算
    const en = list[0] as { hurtCalls: number };
    expect(en.hurtCalls).toBe(0);
  });

  it('1022 高目标前摇跃击：TargetFound 15t 蓄势 → 32 速朝敌跃出（ai[2]=30）', () => {
    const w = emptyWorld();
    const list: unknown[] = [];
    const game = makeGame(w, list, undefined, []);
    const p = new Player(80 * TILE, 176 * TILE - 42, new Inventory());
    (game as unknown as { player: unknown }).player = p;
    const m = new MinionProj(p.cx, p.cy, 1022, 100, 2, false, 0, false, () => p);
    const target = mkEnemy(7, p.cx, p.cy - 200);      // 头顶 200px（>160 门）
    list.push(target);
    const parts: number[] = [];
    (game as unknown as { spawnParticles: (...a: unknown[]) => void }).spawnParticles =
      (...a: unknown[]) => parts.push(a.length);
    for (let t = 0; t < 14; t++) m.fixedUpdate(1, game);
    expect((m as unknown as { mbA2: number }).mbA2).toBe(0);       // 蓄势中未跃
    m.fixedUpdate(1, game);                           // 第 15 拍起跃
    expect((m as unknown as { mbA2: number }).mbA2).toBe(30);
    const sp = Math.hypot(m.vx, m.vy);
    expect(sp).toBeGreaterThan(30);                   // 直瞄 ×32 近似
    expect(m.vy).toBeLessThan(0);                     // 朝上方目标
    expect(parts.length).toBeGreaterThan(0);          // TargetFound 编排粒子近似
  });
});
