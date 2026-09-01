// AI 侧登记遗留修复回归（第二波 Glow/天空批）——标杆 Terarria1456：
//   ① 661 帝皇蝶 ai2 = 离神圣渐隐计数（NPC.cs:45235-45291，lacewingFadeStep）——
//      本仓曾把 ai2 当漂移重选倒计时（60-180），与原版语义错位；渲染侧
//      Renderer.npcGlowOrbitParams 已按 Clamp(0,50)（cs:45253）消费 ai2。
//   ② 412-414 爬尾虫 lai2 红闪驱动链（NPC.cs:52026-52047，crawltipedeFlashStep）
//      + 412 头空泳追击环（cs:52176-52285）补齐——渲染侧
//      Renderer.npcGlowCrawltipedeFlash 消费 e.lai2。
//   ③ 425 风暴潜水员 ai3 瞄准蓄力（NPC.cs:58968-59006，stormDiverAimStep）——
//      渲染侧 Renderer.npcGlowSparkleEnvelope / Main.cs:25632 消费 ai[3]。
//   ④ 541 沙元素 noGravity 数据条目（vanilla-npcs.json 手补）。
import { describe, it, expect } from 'vitest';
import { Enemy, lacewingFadeStep } from '../src/entities/Enemy';
import { crawltipedeFlashStep, crawltipedeAI } from '../src/entities/bossAI_lunar_misc';
import { stormDiverAimStep } from '../src/entities/fighterFamilies';
import { vanillaNpc } from '../src/data/vanillaNpcs';
import { World } from '../src/world/World';
import { Inventory } from '../src/items/Inventory';
import { Player } from '../src/entities/Player';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

const W = 220, H = 160, FLOOR = 100;

function makeWorld(): World {
  const w = new World(W, H, 11, 'ai-side-fixes');
  const st = w.store;
  w.groundLevel = 40;
  for (let x = 0; x < W; x++) {
    st.setTile(x, FLOOR, 1);
    st.setTile(x, FLOOR + 1, 1);
  }
  w.clock.timeOfDay = 0.9;   // 夜间（ fighterAI 白天地表驱散门不干扰 425 蓄力）
  return w;
}

type Proj = { vx: number; vy: number; damage: number };

function makeHooks(w: World, playerAt: { x: number; y: number }, zoneHallow = true) {
  const enemies: Enemy[] = [];
  const projectiles: Proj[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, bucket: 'enemies' | 'projectiles') => {
      const ent = e as { id: number };
      ent.id = em.nextId++;
      if (bucket === 'enemies') enemies.push(e as Enemy);
      else projectiles.push(e as Proj);
    },
  };
  const px = playerAt.x * TILE, py = playerAt.y * TILE;
  const player: Player = new Player(px, py, new Inventory());
  const hooks = {
    world: w, player,
    enemies: () => enemies,
    critters: () => [],
    npcs: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {},
    onEnemyKilled: () => {},
    spawnEnemy: () => {},
    spawnParticles: () => {},
    notifyInventoryChanged: () => {},
    playSfx: () => {},
    playSfxFiles: () => {},
    showPickupLabel: () => {},
    cutTile: () => {},
    dropContext: () => ({
      zoneHallow: false, zoneCorrupt: false, zoneCrimson: false, zoneJungle: false,
      zoneSnow: false, zoneDesert: false, zoneDungeon: false, zoneBeach: false,
      bloodMoon: false, halloween: false, xmas: false, windy: false,
    }),
    scene: { zoneHallow, zoneGraveyard: false },
    entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles, player, em };
}

function spawn(h: ReturnType<typeof makeHooks>, id: number, tx: number, ty: number): Enemy {
  const e = Enemy.fromVanilla(id, tx * TILE, ty * TILE)!;
  e.id = h.em.nextId++;
  h.enemies.push(e);
  return e;
}

/** 逐 tick 驱动（默认全部敌人） */
function tick(h: ReturnType<typeof makeHooks>, n: number, only?: Enemy[]) {
  for (let i = 0; i < n; i++) {
    for (const e of only ?? h.enemies) {
      if (!e.dead) e.fixedUpdate(1 / 60, h.hooks);
    }
  }
}

// ===========================================================================
// ① 661 帝皇蝶 ai2 渐隐语义（NPC.cs:45235-45291）
// ===========================================================================
describe('661 帝皇蝶 ai2 离神圣渐隐（cs:45235-45291）', () => {
  it('纯函数：近距且目标在神圣 → fading=false 计数回落钳 0，opacity 恒 1', () => {
    let ai2 = 30;
    for (let i = 0; i < 50; i++) {
      const f = lacewingFadeStep(ai2, false, 50);
      expect(f.despawn).toBe(false);
      ai2 = f.ai2;
    }
    expect(ai2).toBe(0);                              // 钳 0（cs:45253 Clamp 下界）
    expect(lacewingFadeStep(0, false, 50).opacity).toBe(1);
  });

  it('纯函数：fading=true → +1 钳 50；opacity 自 25 起线性降到 10/35', () => {
    let ai2 = 0;
    for (let i = 0; i < 60; i++) ai2 = lacewingFadeStep(ai2, true, 50).ai2;
    expect(ai2).toBe(50);                             // 常态上限 num4=50（cs:45242）
    expect(lacewingFadeStep(ai2, true, 50).despawn).toBe(false);  // 到不了 60 → 不消散
    // GetLerpValue(60, 25, ai2)（cs:45263）——原版先 Clamp 后取 Opacity：opacity 读
    // 自增后的值，故入参 24（自增得 25）仍是全显，入参 25（自增得 26）已开始衰减。
    expect(lacewingFadeStep(24, true, 50)).toMatchObject({ ai2: 25, opacity: 1 });
    expect(lacewingFadeStep(25, true, 50)).toMatchObject({ ai2: 26, opacity: 34 / 35 });
    expect(lacewingFadeStep(49, true, 50)).toMatchObject({ ai2: 50, opacity: 10 / 35 });
    expect(lacewingFadeStep(50, true, 50).opacity).toBeCloseTo(10 / 35, 5);
    expect(lacewingFadeStep(60, true, 60).opacity).toBe(0);
  });

  it('纯函数：目标不在神圣（cap 60）→ 爬到 60 触发 despawn（cs:45248-45261）', () => {
    let ai2 = 0;
    let despawned = false;
    for (let i = 0; i < 80 && !despawned; i++) {
      const f = lacewingFadeStep(ai2, true, 60);
      despawned = f.despawn;
      ai2 = f.ai2;
    }
    expect(despawned).toBe(true);
    expect(ai2).toBe(60);
  });

  it('集成：贴身且在神圣不渐隐；目标离神圣 → ai2 逐 tick 上升、渐隐过半不可击、满 60 消散', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 110, y: FLOOR - 3 }, true);
    const lw = spawn(h, 661, 109, FLOOR - 5);
    tick(h, 60, [lw]);
    expect(lw.ai2).toBe(0);                           // 神圣内贴身：计数恒 0
    expect(lw.spawnAlpha).toBe(0);                    // Opacity=1 → alpha 0
    expect(lw.dontTakeDamage).toBe(false);
    // 目标玩家离开神圣（scene.zoneHallow=false → cap 60 + fading，cs:45248-45252）
    (h.hooks as unknown as { scene: { zoneHallow: boolean } }).scene.zoneHallow = false;
    tick(h, 35, [lw]);
    expect(lw.ai2).toBe(35);
    expect(lw.dontTakeDamage).toBe(true);             // ai2 ≥ cap/2=30（cs:45290）
    expect(lw.spawnAlpha).toBeGreaterThan(0);         // Opacity<1 → alpha>0
    tick(h, 40, [lw]);
    expect(lw.dead).toBe(true);                       // ai2≥60 → active=false（cs:45254-45261）
  });

  it('登记防线：661 的漂移重选计时已移 lai0（原版 localAI[0]，:45312-45315），ai2 专用渐隐', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 110, y: FLOOR - 3 }, true);
    const lw = spawn(h, 661, 109, FLOOR - 5);
    tick(h, 5, [lw]);
    expect(lw.lai0).toBeGreaterThan(0);               // 漂移倒计时活在 lai0
    expect(lw.ai2).toBe(0);                           // ai2 不再被漂移计时占用
  });
});

// ===========================================================================
// ② 412-414 爬尾虫（NPC.cs:51357-52671）
// ===========================================================================
describe('412-414 爬尾虫 lai2 红闪与追击环', () => {
  it('纯函数：受击 → lai3=3 且本 tick 即发 128；正段每 tick −16、过零翻 −128、负段 +16 回 0', () => {
    // cs:52028-52030 受击装填；cs:52042-52046 归零且有存货即重发
    expect(crawltipedeFlashStep(0, 0, true)).toEqual({ lai2: 128, lai3: 2 });
    let s = { ...crawltipedeFlashStep(0, 0, true) };
    const curve: number[] = [];
    for (let i = 0; i < 16; i++) {
      s = crawltipedeFlashStep(s.lai2, s.lai3, false);
      curve.push(s.lai2);
    }
    // 128 → 112 → … → 16 →（过零翻）−128 → −112 → … → −16 → 0
    expect(curve.slice(0, 8)).toEqual([112, 96, 80, 64, 48, 32, 16, -128]);
    expect(curve[15]).toBe(0);
    // 回零后 lai3 仍有 1 发 → 重发（cs:52042-52046）
    expect(crawltipedeFlashStep(0, 1, false)).toEqual({ lai2: 128, lai3: 0 });
    // 存货耗尽 → 静止（无闪，渲染侧返回 null）
    expect(crawltipedeFlashStep(0, 0, false)).toEqual({ lai2: 0, lai3: 0 });
    // 连击重装填（cs:52028 justHit → lai3=3）
    expect(crawltipedeFlashStep(64, 0, true).lai3).toBe(3);
  });

  it('集成：412 首帧自建 30 段链（29×413 + 1×414），全链 realLifeHost=头（cs:51764-51785）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 110, y: FLOOR - 3 });
    const head = spawn(h, 412, 110, FLOOR - 8);
    crawltipedeAI(head, h.hooks, h.player);
    const bodies = h.enemies.filter((e) => e.vanillaId === 413);
    const tails = h.enemies.filter((e) => e.vanillaId === 414);
    expect(bodies.length).toBe(29);
    expect(tails.length).toBe(1);
    expect(head.realLifeHost).toBe(head);
    expect(h.enemies.filter((e) => e !== head).every((s) => s.realLifeHost === head)).toBe(true);
  });

  it('集成：尾 414 受击 → lai2=128 起步，逐 tick 走衰减曲线（Glow 红闪驱动接通）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 110, y: FLOOR - 3 });
    const head = spawn(h, 412, 110, FLOOR - 8);
    crawltipedeAI(head, h.hooks, h.player);
    const tail = h.enemies.find((e) => e.vanillaId === 414)!;
    expect(tail.lai2).toBe(0);                        // 未受击无闪
    tail.hurt(10, 0, 0, h.hooks, 0, false, 1, true);  // pierce=1 免免疫帧干扰
    expect(tail.justHit).toBe(true);
    crawltipedeAI(head, h.hooks, h.player);
    expect(tail.lai2).toBe(128);                      // :52042-52046 起闪
    expect(tail.lai3).toBe(2);                        // 存货 3−1
    crawltipedeAI(head, h.hooks, h.player);
    expect(tail.lai2).toBe(112);                      // :52031-52033 每 tick −16
    for (let i = 0; i < 7; i++) crawltipedeAI(head, h.hooks, h.player);
    expect(tail.lai2).toBe(-128);                     // :52034-52036 过零翻转
    for (let i = 0; i < 8; i++) crawltipedeAI(head, h.hooks, h.player);
    expect(tail.lai2).toBe(0);                        // 负段 +16 回 0（:52039-52041）
  });

  it('集成：玩家下方有地 → 头悬停地面上方 800px 追击环，不贴脸（cs:52187-52196）', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 110, y: FLOOR - 3 });
    const head = spawn(h, 412, 110, FLOOR - 8);
    tick(h, 200);
    const hoverY = FLOOR * TILE - 800;                // num56 = num51×16 − 800（:52189）
    expect(head.dead).toBe(false);
    expect(Math.abs(head.cy - hoverY)).toBeLessThan(300);   // 收敛到悬停线附近
    expect(head.cy).toBeLessThan(h.player.cy - 300);        // 显著高于玩家（不直冲）
    // 玩家悬空（下方 15 格无地）→ 提速档 14/0.5 直追（:52197-52199）
    const w2 = makeWorld();
    const st2 = w2.store;
    for (let x = 0; x < W; x++) { st2.setTile(x, FLOOR, 0); st2.setTile(x, FLOOR + 1, 0); }
    const h2 = makeHooks(w2, { x: 110, y: 40 });      // 玩家悬在空中的高度
    const head2 = spawn(h2, 412, 110, 60);
    tick(h2, 60);
    expect(Math.hypot(head2.vx, head2.vy)).toBeGreaterThan(8);  // 速度带 [9.8,18.2]
  });
});

// ===========================================================================
// ③ 425 风暴潜水员 ai3 瞄准蓄力（NPC.cs:58865-59013）
// ===========================================================================
describe('425 风暴潜水员 ai3 瞄准蓄力（cs:58968-59006）', () => {
  it('纯函数：−120 冷却 → 蓄力带 aim±1 → 满蓄 30 发射进 31 → 31..40 渐灭 → 重置 −150', () => {
    let ai3 = -120;
    for (let i = 0; i < 120; i++) {                    // :58968-58972 出生 2s 冷却
      const s = stormDiverAimStep(ai3, true);
      expect(s.fired).toBe(false);
      ai3 = s.ai3;
    }
    expect(ai3).toBe(0);
    let fired = false;
    for (let i = 0; i < 30 && !fired; i++) {           // :58970-58975 蓄力 +1/t
      const s = stormDiverAimStep(ai3, true);
      fired = s.fired;
      ai3 = s.ai3;
    }
    expect(fired).toBe(true);
    expect(ai3).toBe(31);                              // :58981-58984 满蓄 → 31
    for (let i = 0; i < 8; i++) {                      // :58976-58980 放射后渐灭 31→39
      const s = stormDiverAimStep(ai3, true);
      expect(s.fired).toBe(false);
      ai3 = s.ai3;
    }
    expect(ai3).toBe(39);
    // 原文 `(ai[3] += 1) >= 40` 与重置同 tick：39 → ++ 得 40 ≥ 40 → 直接 −150（40 不可驻留）
    ai3 = stormDiverAimStep(ai3, true).ai3;
    expect(ai3).toBe(-150);                            // 30 − 180（num118−num120）
  });

  it('纯函数：aim=false 蓄力回落钳 0、不误发；负段冷却不受 aim 影响', () => {
    let ai3 = 20;
    for (let i = 0; i < 30; i++) ai3 = stormDiverAimStep(ai3, false).ai3;
    expect(ai3).toBe(0);                               // 失瞄回落钳 0
    expect(stormDiverAimStep(0, false).fired).toBe(false);
    expect(stormDiverAimStep(30, false).ai3).toBe(29); // 满蓄但失瞄 → 不发射
    expect(stormDiverAimStep(-50, false).ai3).toBe(-49);
    expect(stormDiverAimStep(-50, true).ai3).toBe(-49);
  });

  it('集成：同高视线内目标 → 蓄力到 30 发 4×577，ai3 专用于蓄力不再被通用计数占用', () => {
    const w = makeWorld();
    const h = makeHooks(w, { x: 116, y: FLOOR - 3 });
    const diver = spawn(h, 425, 103, FLOOR - 3);       // 同高、约 208px、无墙
    diver.y = FLOOR * TILE - diver.h;                  // 落到地板上
    tick(h, 400);
    expect(diver.ai3).not.toBe(0);                     // 已进入蓄力/放射/冷却循环
    expect(h.projectiles.length).toBeGreaterThanOrEqual(4);   // :58999-59012 四连发
    const fired = diver.ai3 > 30 || diver.ai3 < 0;     // 发射后必在渐灭段或冷却段
    expect(fired).toBe(true);
  });
});

// ===========================================================================
// ④ 541 沙元素 noGravity 数据条目（vanilla-npcs.json）
// ===========================================================================
describe('541 沙元素 noGravity 数据条目', () => {
  it('json 补录 noGravity=true（悬停锚修正的 AI 侧前提）', () => {
    // 原版考据：SetDefaults（NPC.cs:15829-15840）**无** noGravity 显式赋值；
    // 飞行语义由 UpdateNPC_UpdateGravity（NPC.cs:91917-91921）`else if (type == 541)
    // gravity = 0f` 承担——恒不落体 + AI_102（:42246-42252/重力段 :42477-42495）
    // 自管悬停。json 的 noGravity 即本仓"无重力/飞行型"统一判定位（def.flying 与
    // Renderer.glowFlying 轨道环锚点），按原版实效补录 true。
    const v = vanillaNpc(541);
    expect(v).not.toBeNull();
    expect(v!.aiStyle).toBe(102);                      // SetDefaults :15832
    expect(v!.noGravity).toBe(true);                   // UpdateNPC_UpdateGravity :91918-91921 的实效
  });

  it('同批涉及条目完整性（661/412-414/425 的 aiStyle 与关键字段不回归）', () => {
    expect(vanillaNpc(661)?.aiStyle).toBe(65);         // AI_065 蝴蝶族
    expect(vanillaNpc(661)?.critter).toBe(true);
    for (const id of [412, 413, 414]) {
      expect(vanillaNpc(id)?.aiStyle).toBe(6);         // AI_006 蠕虫族
      expect(vanillaNpc(id)?.noTileCollide).toBe(true);
    }
    expect(vanillaNpc(425)?.aiStyle).toBe(3);          // AI_003 战士族
  });
});
