// ★BJ385 落刀批判别面二（EoL/皇后 iframes=2 反模式退役 + 535 本体零接触面定谳）：
//   件 4 = bossAI_lategame EoL 族四处 iframes=2 每 tick 刷新近似 → AI 真持续态
//     （dontTakeDamage 全通道闸）+ fromVanilla 手补表 636:
//       · 636 光之女皇 AI_120:flag6 缺省 true（:46510）→ case0 :46561 / case8-9
//         :47142（6..40t 窗）/ case10 :47188（30..170t 窗）置 false → :47431
//         `dontTakeDamage = !flag6` 每拍重算;SetDefaults :17234 亦静态置 true。
//       · 657 史莱姆皇后 AI_121:flag 缺省 false（:45701）→ case2 :45916
//         `if (ai[1] >= 60) flag = true` → :46240 `dontTakeDamage = (hide = flag)`
//         每拍重算;SetDefaults :17342-17358 无该行（无手补项）。
//       反模式病灶:Enemy.hurt 免疫门 `pierce!==1 && iframes>0` 的单发弹豁免支
//       （Enemy.ts:13965）——pierce===1 单发弹（箭/枪弹/多数随从）在无敌相位直伤,
//       真持续态全通道闸堵死（R23b-P1/BJ347 同族,BJ347 登记债清偿）。
//   件 2 = 535 美杜莎挂首本体零接触面定谳（BJ382 登记债注销,零修刀）:
//       Damage() 总闸 Damage_CanDealDamage 排除表【显式列出 type==535】
//       （Terarria1457/Projectile.cs:12463;1456 :11782 同位）→ Damage_PVE/PVP/EVP
//       三通道整跳;伤害唯一载体 = AI_100 volley 逐目标 536 凝视束生成拍 Damage()
//       （:45413-45415,随后 damage=0）。判别面:挂首与敌持续重叠 20 拍仅两轮 volley
//       结算（若存在"本体逐子步接触面"则应逐拍结算=20 命中）。
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { TILE_BY_KEY } from '../src/data/tiles';
import { empressOfLightAI, queenSlimeAI } from '../src/entities/bossAI_lategame';
import { MedusaHeadProj } from '../src/entities/MedusaHeadProj';
import type { GameHooks } from '../src/entities/types';

afterEach(() => vi.restoreAllMocks());

const STONE = TILE_BY_KEY['stone'] ?? 1;

function makeHooks(): { hooks: GameHooks; enemies: Enemy[]; player: Record<string, unknown> } {
  const w = new World(200, 140, 7, 'bj385-boss');
  for (let x = 0; x < 200; x++) {
    w.store.setTile(x, 100, STONE);
    w.store.setTile(x, 101, STONE);
  }
  w.groundLevel = 50;
  w.clock.timeOfDay = 0.9;   // 夜间（避开光女白天暴怒分支）
  const enemies: Enemy[] = [];
  const player = {
    x: 100 * TILE, y: 65 * TILE, w: 20, h: 42,
    cx: 100 * TILE + 10, cy: 65 * TILE + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false, iframes: 0,
    buffs: { apply: () => {}, has: () => false },
    useTime: 1, equipStats: {}, addDPS: () => {},
  };
  const hooks = {
    world: w,
    player,
    enemies: () => enemies,
    critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    cutTile: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    entities: { nextId: 1, add: () => {}, projectiles: [] as unknown[] },
  } as unknown as GameHooks;
  return { hooks, enemies, player };
}

// ---------------------------------------------------------------------------
// 件 4a 636 光之女皇:AI 真持续态 + SetDefaults 手补表
// ---------------------------------------------------------------------------
describe('BJ385-④ 636 光之女皇 dontTakeDamage 真持续态（AI_120 :46510/:47431）', () => {
  it('SetDefaults 手补表:fromVanilla 出生即 dontTakeDamage=true（:17234,首拍前兜底）', () => {
    const e = Enemy.fromVanilla(636, 100 * TILE, 80 * TILE)!;
    expect(e.dontTakeDamage).toBe(true);
  });

  it('case0 出生相位:每拍重算置真持续态,不落 iframes 近似（iframes 恒 0）', () => {
    const { hooks } = makeHooks();
    const e = Enemy.fromVanilla(636, 100 * TILE, 80 * TILE)!;
    e.dontTakeDamage = false;                  // 强置假:证明 AI 每拍重算接管
    empressOfLightAI(e, hooks, hooks.player as never);
    expect(e.dontTakeDamage).toBe(true);       // :46561 flag6=false → :47431
    expect(e.iframes).toBe(0);                 // 旧码 iframes=2 近似已退役
  });

  it('无敌相位 pierce===1 单发弹直伤被全通道闸堵死（旧 iframes 近似被豁免支绕过=病灶面）', () => {
    const { hooks } = makeHooks();
    const e = Enemy.fromVanilla(636, 100 * TILE, 80 * TILE)!;
    empressOfLightAI(e, hooks, hooks.player as never);   // case0 → 无敌
    expect(e.dontTakeDamage).toBe(true);
    expect(e.hurt(50, 0, 0, hooks, 0, false, 1, true)).toBe(false);  // 单发弹也拒收
  });

  it('case1 起可伤（flag6 缺省 true → 每拍重算 false）;case8 6..40t 窗内无敌窗外出可伤', () => {
    const { hooks } = makeHooks();
    const e = Enemy.fromVanilla(636, 100 * TILE, 80 * TILE)!;
    e.bInit = true; e.spawnAlpha = 0;
    e.ai0 = 1; e.ai1 = 0; e.ai2 = 0; e.ai3 = 0;
    e.dontTakeDamage = true;                   // 强置真:证明每拍重算清除
    empressOfLightAI(e, hooks, hooks.player as never);
    expect(e.dontTakeDamage).toBe(false);
    e.ai0 = 8; e.ai1 = 10;                     // 6..40t 无敌窗内
    empressOfLightAI(e, hooks, hooks.player as never);
    expect(e.dontTakeDamage).toBe(true);
    e.ai1 = 45;                                // 窗外（40t 后突进相）
    empressOfLightAI(e, hooks, hooks.player as never);
    expect(e.dontTakeDamage).toBe(false);
  });

  it('case10 半血变身 30..170t 窗同相', () => {
    const { hooks } = makeHooks();
    const e = Enemy.fromVanilla(636, 100 * TILE, 80 * TILE)!;
    e.bInit = true; e.spawnAlpha = 0;
    e.ai0 = 10; e.ai1 = 100; e.ai2 = 0; e.ai3 = 0;
    e.dontTakeDamage = false;
    empressOfLightAI(e, hooks, hooks.player as never);
    expect(e.dontTakeDamage).toBe(true);
    e.ai1 = 10;                                // 窗外
    empressOfLightAI(e, hooks, hooks.player as never);
    expect(e.dontTakeDamage).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 件 4b 657 史莱姆皇后:case2 消散期一拍无敌窗（无 SetDefaults 手补项）
// ---------------------------------------------------------------------------
describe('BJ385-④ 657 史莱姆皇后 dontTakeDamage 真持续态（AI_121 :45701/:45916/:46240）', () => {
  it('SetDefaults 无 dontTakeDamage 行:fromVanilla 出生可伤（:17342-17358,无手补项）', () => {
    const q = Enemy.fromVanilla(657, 100 * TILE, 90 * TILE)!;
    expect(q.dontTakeDamage).toBe(false);
  });

  it('case2 传送拍 ai1>=60 → 消散无敌;次拍 case1 头置复位（原版一拍窗同相）', () => {
    const { hooks } = makeHooks();
    const q = Enemy.fromVanilla(657, 100 * TILE, 92 * TILE)!;
    q.bInit = true; q.ai0 = 0; q.ai1 = -100; q.ai2 = 0; q.ai3 = 300;
    q.vy = 0;
    queenSlimeAI(q, hooks, hooks.player as never);   // 蓄能满 → 无条件进 2 态
    expect(q.ai0).toBe(2);
    q.ai1 = 59;
    q.dontTakeDamage = false;
    queenSlimeAI(q, hooks, hooks.player as never);   // ai1 → 60:flag=true + 传送
    expect(q.ai0).toBe(1);                           // 传送完成当拍转显形
    expect(q.dontTakeDamage).toBe(true);             // :45916 → :46240（旧码 iframes=2）
    q.dontTakeDamage = true;
    queenSlimeAI(q, hooks, hooks.player as never);   // 次拍 case1:头置复位
    expect(q.ai0).toBe(1);
    expect(q.dontTakeDamage).toBe(false);            // 一拍窗同相
  });
});

// ---------------------------------------------------------------------------
// 件 2 535 挂首本体零接触面定谳（零修刀判别面）
// ---------------------------------------------------------------------------
describe('BJ385-② 535 本体零接触面（Damage_CanDealDamage :12463 排除 type==535）', () => {
  it('挂首与敌持续重叠 20 拍仅两轮 volley 结算（若有本体逐子步接触面应 20 命中=变异红）', () => {
    const w = new World(60, 60, 7, 'bj385-medusa');
    const p = {
      dead: false, cx: 30 * TILE, cy: 25 * TILE, x: 30 * TILE - 5, y: 25 * TILE - 20,
      w: 10, h: 40, facing: 1, gravDir: 1, aimWX: 30 * TILE + 60, aimWY: 25 * TILE,
      inputUseItem: true, mana: 100, inv: { heldItem: () => null }, equipStats: {},
      slowMagicUse: false, checkMana: () => true,
      getSlowMagicScalar() { return this.slowMagicUse ? 2.5 : 1; },
      onChannelManaHold() {},
    };
    const log: number[] = [];
    const e = {
      id: 3, x: 30 * TILE + 20, y: 25 * TILE - 20, w: 30, h: 40, dead: false,
      hurt(d: number) { log.push(d); return true; },
    };
    const g = {
      world: w, player: p, enemies: () => [e], critters: () => [],
      entities: { nextId: 1, add: () => {}, projectiles: [] as unknown[] },
      spawnParticles: () => {}, spawnDust: () => ({ vx: 0, vy: 0, scale: 1 }),
    } as unknown as GameHooks;
    const m = new MedusaHeadProj(p as never, 40, 2, 0, 0);
    // scalar=1 → num=15:volley 在 ai0=0（拍 1）与 ai0%15==0（拍 16）各一轮
    for (let i = 0; i < 20; i++) m.fixedUpdate(1 / 60, g);
    expect(log.length).toBe(2);                // 纯 volley 结算面
    (m as unknown as { retire: () => void }).retire();   // 清在场单例（模块级 activeMedusa）
  });
});
