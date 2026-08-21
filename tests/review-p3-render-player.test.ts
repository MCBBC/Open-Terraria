// 复审 P3 渲染/玩家域三件（2026-08-21）回归：
//  ① 抚摸宠物复合手臂渲染（Player.cs:49499-49508 ItemCheck_ApplyHoldStyle petting
//    分支 → PaperDoll.petArm 烘焙参数；petArmParams = 渲染侧档位/角度解算纯函数）
//  ② 虫洞药水全屏地图头像点击（Main.cs:55376-55450 头像环 → wormholeHeadHit
//    命中盒纯函数 + Game.tryWormholeHeadTeleport 点击链；渲染侧悬停/高亮消费同源）
//  ③ 粒子编排器生产者补齐（module8 新接 PetExchange/VampireOnFire/Digestion/
//    LoadoutChange 四型——全 wire 面逐型评估清单见 syncModules.ParticleOrchestraType 注）
import { describe, it, expect } from 'vitest';
import { petArmParams } from '../src/player/PaperDoll';
import {
  ParticleOrchestraType, writeParticleModule, readParticleModule,
} from '../src/net/syncModules';
import { NetReader, NetModule } from '../src/net/protocol';
import { wormholeHeadHit } from '../src/render/Renderer';
import { Player, solidCollisionBox } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { World } from '../src/world/World';
import type { GameHooks } from '../src/entities/types';

// ===================== ① 抚摸宠物复合手臂渲染 =====================
describe('抚摸复合后臂参数（ItemCheck_ApplyHoldStyle :49499-49508）', () => {
  it('petArmParams：phase0=ThreeQuarters 行1 / phase1=Full 行0（UpdateCompositeArm :2210-2237 反相映射）', () => {
    // vanilla：num3 = miscCounter%14/7；stretch=ThreeQuarters，num3==1 才 Full
    // → 拉伸行（compBackArmFrame 行序 0=Full/1=ThreeQuarters）= 1−phase
    expect(petArmParams(0, false)).toEqual({ stretch: 1, rot: -Math.PI * 2 * 0.3 });
    expect(petArmParams(1, false)).toEqual({ stretch: 0, rot: -Math.PI * 2 * 0.3 });
  });

  it('小宠 0.2 档（isPetSmall，:49517-49519）；0.36 坐骑档依赖 PetMount（未实装）', () => {
    expect(petArmParams(0, true).rot).toBeCloseTo(-Math.PI * 2 * 0.2, 12);
    expect(petArmParams(1, true).rot).toBeCloseTo(-Math.PI * 2 * 0.2, 12);
    expect(petArmParams(0, true).stretch).toBe(1);
  });

  it('petAnimal → isPetSmall 贯通渲染档（1098 小宠 → −2π·0.2）+ miscCounter 两相节奏', () => {
    const w = new World(60, 60, 72, 'p3-petarm');
    for (let x = 10; x <= 44; x++) w.store.setTileSilent(x, 40, 1 /* dirt */);
    const hooks = {
      world: w, player: null, enemies: () => [], critters: () => [],
      spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
      cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
      spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
      playSfxFiles: () => {}, showPickupLabel: () => {}, playerEmote: () => {},
      spawnRainForced: () => {},
    } as never as GameHooks;
    const p = new Player(20 * 16, 38 * 16, new Inventory());
    p.fixedUpdate(1 / 60, hooks);
    expect(solidCollisionBox(w.store, 20 * 16, 39 * 16 + 8, 20, 16)).toBe(true);
    const ok = p.petAnimal(hooks, {
      cx: p.cx + 50, bottomY: 40 * 16, isSmall: true, reach: 48,   // 1098 小宠档
      valid: () => true,
    });
    expect(ok).toBe(true);
    expect(p.petting.isPetSmall).toBe(true);
    // 渲染侧消费（Renderer.drawPlayer 同式）：petArmParams(pettingArmPhase, isPetSmall)
    const a0 = petArmParams(Math.min(1, p.pettingArmPhase) as 0 | 1, p.petting.isPetSmall);
    expect(a0.rot).toBeCloseTo(-Math.PI * 2 * 0.2, 12);
    // miscCounter 7-13 → phase 1 → Full 行 0（抚摸起落节奏 7t 两相）
    (p as unknown as { miscCounter: number }).miscCounter = 7;
    expect(petArmParams(Math.min(1, p.pettingArmPhase) as 0 | 1, p.petting.isPetSmall).stretch).toBe(0);
    (p as unknown as { miscCounter: number }).miscCounter = 6;
    expect(petArmParams(Math.min(1, p.pettingArmPhase) as 0 | 1, p.petting.isPetSmall).stretch).toBe(1);
  });
});

// ===================== ② 虫洞全屏地图头像点击 =====================
describe('虫洞头像命中盒（Main.cs:55376-55450 头像环）', () => {
  it('28×28×UIScale 命中盒（半宽 14×1.1=15.4px）中心 = 头像绘制中心 mapX(cx)', () => {
    const cx0 = 100, cy0 = 50, zoom = 2;
    // 远端玩家 tile(30,20) → 头像中心 (100+30×2, 50+20×2) = (160, 90)
    const remotes = [{ cx: 30 * 16, cy: 20 * 16 }];
    expect(wormholeHeadHit(160, 90, cx0, cy0, zoom, remotes)).toBe(0);
    expect(wormholeHeadHit(160 + 15, 90 - 15, cx0, cy0, zoom, remotes)).toBe(0);   // 盒内四角（留边避浮点界）
    expect(wormholeHeadHit(160 - 15, 90 + 15, cx0, cy0, zoom, remotes)).toBe(0);
    expect(wormholeHeadHit(160 + 16, 90, cx0, cy0, zoom, remotes)).toBe(-1);       // 盒外
    expect(wormholeHeadHit(0, 0, cx0, cy0, zoom, remotes)).toBe(-1);
  });

  it('首中优先（flag3 :55406 break 语义）+ 空表/无网静默', () => {
    const cx0 = 0, cy0 = 0, zoom = 2;
    const remotes = [
      { cx: 16 * 10, cy: 16 * 10 },   // 中心 (20,20)
      { cx: 16 * 10 + 8, cy: 16 * 10 },   // 重叠在盒内
    ];
    expect(wormholeHeadHit(22, 20, cx0, cy0, zoom, remotes)).toBe(0);   // 先者胜
    expect(wormholeHeadHit(500, 500, cx0, cy0, zoom, [])).toBe(-1);
  });

  it('zoom 缩放联动：zoom=4 时头像中心随地图缩放（cx/16×zoom）', () => {
    const remotes = [{ cx: 16 * 30, cy: 16 * 20 }];
    // zoom=4 → 中心 (120, 80)
    expect(wormholeHeadHit(120, 80, 0, 0, 4, remotes)).toBe(0);
    expect(wormholeHeadHit(160, 90, 0, 0, 4, remotes)).toBe(-1);   // zoom=2 的中心点已出盒
  });
});

// ===================== ③ module8 编排粒子生产者补齐 =====================
describe('编排粒子新四型（2026-08-21 生产者补齐批）', () => {
  it('注册序对表（ParticleOrchestraType.cs）+ 既有微光两型不回归', () => {
    expect(ParticleOrchestraType.PetExchange).toBe(19);        // NPC.cs:81733 Broadcast
    expect(ParticleOrchestraType.VampireOnFire).toBe(22);      // Player.cs:28178
    expect(ParticleOrchestraType.LoadoutChange).toBe(27);      // Player.cs:5444
    expect(ParticleOrchestraType.Digestion).toBe(29);          // Player.cs:18751
    expect(ParticleOrchestraType.ShimmerTownNPC).toBe(32);
    expect(ParticleOrchestraType.ShimmerTownNPCSend).toBe(33);
  });

  it('LoadoutChange 编解码：UniqueInfoPiece = 配装档序（Player.cs:5448）往返', () => {
    const s = { posX: 1234.5, posY: -67.25, moveX: 0, moveY: 0, uniqueInfo: 2, invoker: 5 };
    const frame = writeParticleModule(ParticleOrchestraType.LoadoutChange, s);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.Particles);
    const m = readParticleModule(r);
    expect(m.type).toBe(27);
    expect(m.settings).toEqual(s);   // 配装档序经 uniqueInfo 全网往返
  });

  it('Digestion 编解码：MovementVector = (−direction, 0)（Player.cs:18754）', () => {
    const d = { posX: 5, posY: 6, moveX: -1, moveY: 0, uniqueInfo: 0, invoker: 3 };
    const frame = writeParticleModule(ParticleOrchestraType.Digestion, d);
    const r = new NetReader(frame.subarray(3));
    expect(r.u16()).toBe(NetModule.Particles);   // 消费 moduleId 后再读载荷
    expect(readParticleModule(r)).toEqual({ type: 29, settings: d });
  });

  it('PetExchange/VampireOnFire 编解码往返（MovementVector=velocity / 纯落点）', () => {
    const pe = { posX: 100, posY: 200, moveX: 1.5, moveY: -0.5, uniqueInfo: 0, invoker: 7 };
    const rpe = new NetReader(writeParticleModule(ParticleOrchestraType.PetExchange, pe).subarray(3));
    rpe.u16();
    expect(readParticleModule(rpe)).toEqual({ type: 19, settings: pe });
    const vf = { posX: 300, posY: 400, moveX: 0, moveY: 0, uniqueInfo: 0, invoker: 1 };
    const rvf = new NetReader(writeParticleModule(ParticleOrchestraType.VampireOnFire, vf).subarray(3));
    rvf.u16();
    expect(readParticleModule(rvf)).toEqual({ type: 22, settings: vf });
  });
});
