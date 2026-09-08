// ★Arrow 通用湿段平行副本收口回归（2026-09-08）——自移植 wetSectionStep 段体退役,
// 整体切 projWetSection.projectileWetSection 共享体（全体弹同源,WeaponProj 同配方）。
// 本文件锁收口后行为 = 收口前金标（反编译 Projectile.cs:10886-10893 预置 / :16891-17117
// 段体逐值）：
//   · 预置位次保持 fixedUpdate 头（首子步 AI 头湿缓存消费者 469 读预置值——共享体
//     presetDone 门对 Arrow 恒短路,预置不随共享体首调晚一拍）
//   · 入/出水溅花 10 粒四液档 / wetCount 冷却窗 / 四旗置位与 !wet 三清 / lavaWet 粘滞
//   · 杀拍闩双面：wetSectionRan（同子步防双跑）+ wetSectionKilled（段内杀闩=死亡拍
//     位移/撞块跳过既案,兼防本仓 active 门外的 cutTile 死拍多跑）
//   · 段内水death（hooks.kill）续跑段尾 = 原版 :16921 Kill() 不中断湿段——★收口唯一
//     语义修正：退役副本「杀即 return 跳段尾」系偏离（排水拍杀拍出水溅花缺失）,收口
//     改归原版（逐行对拍对照表见批报告;差异化钉=★标记案）
//   · 豁免弹（270 id 数据面）：湿段整跳 + 旗终身不清 + 出生预置 shimmerWet 驱动
//     Shimmer（:17114 位在整段门【外】）
//   · 结构锁：Arrow 湿段=共享体调用,自移植段体/本地消亡表不复活
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { TileStore, LIQUID_TYPE } from '../src/world/TileStore';
import { World } from '../src/world/World';
import { Player } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { Arrow } from '../src/entities/Arrow';
import type { GameHooks } from '../src/entities/types';

const LIQ = 255;

function hooks(store: TileStore): GameHooks {
  const player = new Player(50 * 16, 90 * 16, new Inventory());
  return {
    world: { store } as never,
    player: player as never,
    enemies: () => [], critters: () => [],
    spawnDrop: () => null,
    damagePlayer: (): number => 0,
    addDamageNumber: () => {}, cutTile: () => {},
    onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    mapFullscreen: () => false,
    spawnDust: () => null,
  } as unknown as GameHooks;
}

/** 尘/音捕获宿主（同 proj-wet-cache mkSplash 形制）：溅花尘=专用盒 (w+12,24) 池内
 *  与 AI 尘（盒 w×h）分流断言 */
function mkWet(store: TileStore, projId: number, x: number, y: number, vx = 0) {
  const dusts: Array<{ type: number; x: number; y: number; sw: number; sh: number;
    d: { vx: number; vy: number; scale: number; alpha: number; noGravity: boolean; color: unknown } }> = [];
  const sounds: Array<{ file: string; vol: number; pitch: number }> = [];
  const a = new Arrow(x, y, vx, 0, 12, 1, projId, null, { grav: 0, life: 300 });
  a.w = 10; a.h = 10;
  const g = {
    ...hooks(store),
    spawnDust: (sx: number, sy: number, sw: number, sh: number, type: number) => {
      const d = { vx: 1, vy: 1, scale: 1, alpha: 0, noGravity: false, color: null as unknown };
      dusts.push({ type, x: sx, y: sy, sw, sh, d });
      return d;
    },
    playSfxWav: (file: string, vol: number, _x?: number, _y?: number, pitch?: number) => {
      sounds.push({ file, vol, pitch: pitch ?? 0 });
      return true;
    },
  } as unknown as GameHooks;
  const tick = (n: number) => { for (let i = 0; i < n && !a.dead; i++) a.fixedUpdate(1 / 60, g); };
  const splash = () => dusts.filter((e) => e.sw === 22 && e.sh === 24);   // w=10 → (10+12,24)
  return { a, dusts, splash, sounds, tick, g };
}

/** 液柱：列 20 [320,336] 行 40 起满格带;1=水 2=岩浆 3=蜂蜜 4=微光（LIQUID_TYPE 值域） */
function liquidCol(liquidType: number) {
  const st = new TileStore(60, 160);
  st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = liquidType;
  return st;
}

// =====================================================================
// ★预置位次（NewProjectile :10886-10893 1:1,fixedUpdate 头——先于首子步 AI）
//   共享体首调预置在首子步 AI【后】,晚一拍 → Arrow 保留自有预置块,presetDone
//   同名旗短路共享体支。本组钉:首子步 AI 头湿缓存消费者读到的必须是预置值。
// =====================================================================
describe('★预置位次（fixedUpdate 头,先于首子步 AI）', () => {
  it('469 出生即在水中:首子步 AI 头读预置 wet=true 即杀（预置若随共享体首调晚一拍则本拍存活=爆红）', () => {
    const W = mkWet(liquidCol(1), 469, 322, 637);   // 探针 [322,332] ⊂ 列20 [320,336]
    W.tick(1);
    expect(W.a.dead).toBe(true);                    // AI_001 头 :54969 wet&&!honey&&!shimmer → Kill
    expect(W.splash().length).toBe(0);              // 杀拍段补跑:坐水 killing tick 无溅花（:16948 !wet 门）
  });

  it('2 燃烧箭出生即在水中:首子步湿段 2→1 变型（:16929 TransformType(1) 经 hooks 内联）', () => {
    const W = mkWet(liquidCol(1), 2, 322, 637);
    W.tick(1);
    expect(W.a.projId).toBe(1);                     // 变型落账（light=0 由 projId=1 数据缺 light 行承载）
    expect(W.a.dead).toBe(false);                   // 2 ∉ IsDestroyedByWater
    expect(W.splash().length).toBe(0);              // 出生即湿 → 入水溅花门 !wet 恒假
    expect(W.a.wet).toBe(true);
  });

  it('presetDone 同名旗:首拍置位后共享体首调预置支恒短路（字段公有=ProjWetFlags 结构面）', () => {
    const W = mkWet(new TileStore(60, 160), 1, 309, 637);
    W.tick(1);
    expect(W.a.presetDone).toBe(true);
  });
});

// =====================================================================
// ★溅花/四旗/wetCount 窗（共享体 :16935-17112 段,经 hooks 穿参）
// =====================================================================
describe('★溅花段四液档 + 四旗 + wetCount 窗', () => {
  it('入水溅花 ×10（水档 d33）:盒 (x−6,y+h/2−8,w+12,24)、vy−4/vx×2.5/scale1.3/α100/noGravity、Splash_1×1', () => {
    const W = mkWet(liquidCol(1), 1, 309, 637);     // 出生干区
    W.tick(1);
    expect(W.splash().length).toBe(0);
    W.a.x = 322;                                    // 渡入水列
    W.tick(1);
    expect(W.splash().length).toBe(10);
    expect(W.splash().every((e) => e.type === 33)).toBe(true);
    expect(W.splash()[0].x).toBe(316);              // 322−6
    expect(W.splash()[0].y).toBe(634);              // 637+5−8（入水各支含 −8）
    expect(W.splash().every((e) => e.d.vy === -3 && e.d.vx === 2.5)).toBe(true);
    expect(W.splash().every((e) => e.d.scale === 1.3 && e.d.alpha === 100 && e.d.noGravity)).toBe(true);
    expect(W.sounds.map((s) => ({ file: s.file, vol: s.vol }))).toEqual([{ file: 'Splash_1', vol: 1 }]);
    expect(W.a.wet).toBe(true);
  });

  it('蜂蜜出生→离液:出水 d152 ×10（补链 v×0.1/vy=−0.5 → vy−1/vx×2.5）+ !wet 三清 + wetCount 10→9', () => {
    const W = mkWet(liquidCol(3), 1, 322, 637);     // 出生即在蜂蜜（预置 wet=true 无入水溅花）
    W.tick(1);
    expect(W.splash().length).toBe(0);
    expect(W.a.honeyWet).toBe(true);
    W.a.x = 500; W.a.y = 300;                       // 离液
    W.tick(1);
    expect(W.splash().length).toBe(10);
    expect(W.splash().every((e) => e.type === 152)).toBe(true);
    expect(W.splash()[0].y).toBe(297);              // 300+5−8（蜂蜜支含 −8）
    expect(W.splash().every((e) => e.d.vy === -1.5 && e.d.vx === 0.25)).toBe(true);
    expect(W.a.honeyWet).toBe(false);               // :17103-17108 !wet 三清
    expect(W.a.wetCount).toBe(9);                   // :16984 置 10 + 段尾 −1
  });

  it('岩浆粘滞（lavaWet 只置不清）:出生在浆不杀 → 浆→水直渡仍不杀（粘滞面保护）→ 离液溅岩浆花 d35 + 三清', () => {
    const st = new TileStore(60, 160);
    st.liquid[st.idx(20, 40)] = LIQ; st.liquidType[st.idx(20, 40)] = 2;   // 列20 岩浆
    st.liquid[st.idx(21, 40)] = LIQ; st.liquidType[st.idx(21, 40)] = 1;   // 列21 水
    const W = mkWet(st, 15, 322, 637);              // 15 火之花 ∈ IsDestroyedByWater
    W.tick(1);
    expect(W.a.dead).toBe(false);                   // :16921 消亡判定被 lavaWet 粘滞面拦（:16906-16911 先并入）
    expect(W.a.lavaWet).toBe(true);
    expect(W.splash().length).toBe(0);              // 坐浆 wet=true → 溅花门 !wet 假
    W.a.x = 338;                                    // 直渡水列 [336,352]（探针 [338,348]）
    W.tick(1);
    expect(W.a.dead).toBe(false);                   // lavaWet 粘滞:渡水不杀（!lavaWet 门恒假）
    expect(W.a.lavaWet).toBe(true);                 // 只置不清:wet 仍真 → 三清不跑
    expect(W.splash().length).toBe(0);              // wet=true → 入水溅花门 !wet 假
    W.a.x = 500; W.a.y = 300;                       // 离液
    W.tick(1);
    expect(W.splash().length).toBe(10);
    expect(W.splash().every((e) => e.type === 35)).toBe(true);   // 出水档看 lavaWet（:16988）→ 岩浆花
    expect(W.splash().every((e) => e.d.vy === -2 && e.d.vx === 0.25)).toBe(true);
    expect(W.a.lavaWet).toBe(false);                // 离液拍 !wet 三清归零
  });

  it('wetCount 冷却窗:窗内再入水/出水均不重溅,逐子步 −1,窗尽后再溅', () => {
    const W = mkWet(liquidCol(1), 1, 309, 637);
    W.tick(1);                                      // 干拍
    W.a.x = 322; W.tick(1);                         // 入水溅 ×10
    W.a.x = 500; W.a.y = 300; W.tick(1);            // 出水溅 ×10,wetCount 10→9
    expect(W.splash().length).toBe(20);
    W.a.x = 322; W.a.y = 637; W.tick(1);            // 窗内再入水:溅花门 wetCount≠0 → 不溅
    expect(W.splash().length).toBe(20);
    expect(W.a.wetCount).toBe(8);                   // 9 → 段尾 −1
    W.a.x = 500; W.a.y = 300; W.tick(1);            // 窗内再出水:wetCount≠0 → 不溅
    expect(W.splash().length).toBe(20);
    expect(W.a.wetCount).toBe(7);
    W.tick(7);                                      // 干区逐子步耗窗 → 0
    expect(W.a.wetCount).toBe(0);
    W.a.x = 322; W.a.y = 637; W.tick(1);            // 窗尽:第三次入水再溅
    expect(W.splash().length).toBe(30);
  });

  it('豁免弹（ignoreWater 数据面）:湿段整跳、wet 恒 false、出生预置 shimmerWet 终身不清且驱动 Shimmer（段门外）', () => {
    const W = mkWet(liquidCol(4), 466, 322, 637);   // 466 ignoreWater=true,aiStyle 88（Shimmer 缺省支无动作）
    W.tick(1);
    expect(W.a.wet).toBe(false);                    // :10888-10891 豁免只反清 wet
    expect(W.a.shimmerWet).toBe(true);              // :10893 无条件赋值;三清在整跳段内 → 终身不清
    expect(W.splash().length).toBe(0);
    expect(W.dusts.length).toBe(0);
    expect(W.a.dead).toBe(false);
    W.tick(2);
    expect(W.a.shimmerWet).toBe(true);              // 旗终身不清（原版豁免弹同态）
    expect(W.a.wet).toBe(false);
  });

  it('242/302/638（共享体前置清位三型,数据面均 ignoreWater）:出生在水中 wet 恒 false 零溅花', () => {
    for (const id of [242, 302, 638]) {
      const W = mkWet(liquidCol(1), id, 322, 637);
      W.tick(1);
      expect(W.a.wet, `id ${id}`).toBe(false);
      expect(W.splash().length, `id ${id}`).toBe(0);
      expect(W.a.dead, `id ${id}`).toBe(false);
    }
  });
});

// =====================================================================
// ★杀拍闩双面（wetSectionRan 防同子步双跑 + wetSectionKilled 段内杀闩）
// =====================================================================
describe('★杀拍闩（防双跑 + 死亡拍位移跳过）', () => {
  it('469 出水杀拍:AI 头 Kill 当拍湿段补跑 → 出水溅花 ×10 + wetCount 窗 10→9（闩防双跑:双折减则 8=爆红）', () => {
    const W = mkWet(liquidCol(1), 469, 309, 637);   // 出生干区
    W.tick(1);
    expect(W.a.dead).toBe(false);
    W.a.x = 322; W.tick(1);                         // 入水:AI 头读上拍干值不杀;湿段置 wet+溅 ×10
    expect(W.a.dead).toBe(false);
    expect(W.splash().length).toBe(10);
    W.a.x = 500; W.a.y = 300; W.tick(1);            // AI 头读 wet=true → Kill;dead 支补跑湿段 → 出水溅 ×10
    expect(W.a.dead).toBe(true);
    expect(W.splash().length).toBe(20);
    expect(W.a.wetCount).toBe(9);
  });

  it('段内水death（hooks.kill）:坐水 killing tick 无溅花 + 死亡拍位移跳过（wetSectionKilled 闩）+ 幂等无双爆', () => {
    const W = mkWet(liquidCol(1), 15, 322, 637, 6); // 15 火之花 ∈ IsDestroyedByWater,vx=6 位移探针
    const dustBefore = W.dusts.length;
    W.tick(1);
    expect(W.a.dead).toBe(true);                    // 预置 wet=true → 首子步段内 :16923-16925 Kill
    expect(W.splash().length).toBe(0);              // 坐水:flag2 支 !wet 门假 → 无溅花（原版同拍）
    expect(W.a.x).toBe(322);                        // ★死亡拍位移跳过（无闩则 x+=6×dragF）
    expect(W.a.wet).toBe(true);                     // 段尾 wet=true（flag2 支,原版同拍）
    W.tick(1);                                      // dead 不再更新;杀 FX 幂等（二次入闩零新增）
    expect(W.dusts.length).toBeGreaterThan(dustBefore);
  });

  it('★段内水death + 当拍液体排空:杀拍续跑段尾 → 出水溅花 ×10（原版 :16921 Kill() 不中断湿段;退役副本「杀即 return」此拍无溅花=收口语义修正钉）', () => {
    const st = liquidCol(1);
    const W = mkWet(st, 15, 309, 637, 6);           // 出生干区
    W.tick(1);                                      // 干拍存活（wet=false → 消亡门假）
    expect(W.a.dead).toBe(false);
    W.a.x = 322; W.tick(1);                         // 入水:溅 ×10、wet=true（活拍,位移后 x=325）
    expect(W.splash().length).toBe(10);
    expect(W.a.x).toBe(325);                        // 湿阻尼 ×0.5（6×0.5）
    st.liquid[st.idx(20, 40)] = 0;                  // 排空（=两子步间液体流失驱动）
    W.tick(1);                                      // 段:上拍 wet=true → 水death Kill;flag2=false → 出水支溅 ×10
    expect(W.a.dead).toBe(true);
    expect(W.splash().length).toBe(20);
    const exit = W.splash().slice(10);
    expect(exit.every((e) => e.type === 33)).toBe(true);
    expect(exit[0].x).toBe(319);                    // 段测位=排空拍弹位 325−6（位移后）
    expect(exit[0].y).toBe(642);                    // 出水【水】支盒无 −8:637+5（:17059）
    expect(W.a.wet).toBe(false);                    // 出水支 wet=false + 三清（退役副本此拍旗冻结 true）
    expect(W.a.wetCount).toBe(9);                   // 置 10 + 段尾 −1
    expect(W.a.x).toBe(325);                        // 死亡拍位移跳过（湿已 false,无闩则 x+=6 全速）
  });
});

// =====================================================================
// ★936 解锁支窗口（收口续刀 2026-09-08:shimmerUnlock 自谓词 vy 臂退役）
//   定谳：Shimmer() aiStyle2 支 :22676-22679 = velocity.Y−=0.7【后】<0 才走解锁;
//   回调在 projShimmerStep 返回前触发,宿主 this.vy 尚是【减速前】face 回写前值
//   → 旧谓词 `this.vy >= 0` 对 0≤vy<0.7 窗口（含静止出生）恒误拒=彩虹史莱姆
//   解锁漏。原文 :22683-22692 无二次 vy 判 → 摘臂（arrow-ledger-aug31 同案转绿）。
// =====================================================================
/** 936 浸微光液宿主（中心格=液格 25,18;flags 承载世界旗;grav:0 → face.vy=vy0−0.7 纯净窗口） */
function mk936(vy0: number) {
  const w = new World(160, 200, 30, 'open');
  for (let x = 0; x < 160; x++) w.store.setTileSilent(x, 190, 1, 0, 0);
  w.store.setLiquid(25, 18, 255, LIQUID_TYPE.SHIMMER);
  w.flags['unlockedSlimeRainbowSpawn'] = false;
  const g = {
    ...hooks(w.store),
    world: w as never,
    entities: { nextId: 1, add: () => {} },
    addLightAt: () => {},
  } as unknown as GameHooks;
  const a = new Arrow(25 * 16, 18 * 16, 0, vy0, 50, 0, 936, null, { grav: 0 });
  a.x = 25 * 16 + 1 - a.w / 2;               // 心落液格内（shimmerImmersed 中心格重查过）
  a.y = 18 * 16 + 6 - a.h / 2;
  return { a, w, g };
}

describe('★936 解锁支 0≤vy<0.7 窗口（shimmerUnlock 谓词 vy 臂退役）', () => {
  it('窗口下沿 vy0=0（静止出生）:分支 face.vy=−0.7<0 触发 → 置世界旗 + life 钳 5（wrapper 递减 4）+ 浮升 −0.7 写回', () => {
    const P = mk936(0);
    P.a.fixedUpdate(1 / 60, P.g);
    expect(P.a.shimmerWet).toBe(true);           // 预置（:10893 无条件赋值）
    expect(P.w.flags['unlockedSlimeRainbowSpawn']).toBe(true);   // :22685（旧 vy 臂此处 0>=0 误拒）
    expect(P.a.life).toBe(4);                    // 钳 5(:22680-22682)+wrapper −1,当拍不吃 −20
    expect(P.a.vy).toBe(-0.7);                   // :22676 浮升写回
    expect(P.a.dead).toBe(false);
  });

  it('窗口上界 vy0=0.7:face.vy=0 不<0 → else 衰变支（−20）不解锁（分支自身门=唯一 vy 判）', () => {
    const P = mk936(0.7);
    P.a.fixedUpdate(1 / 60, P.g);
    expect(P.w.flags['unlockedSlimeRainbowSpawn']).toBe(false);
    expect(P.a.life).toBe(3600 - 20 - 1);        // else −20 + wrapper −1
  });
});

// =====================================================================
// 结构锁（源文本锚——防平行副本复活/共享体调用静默摘除）
// =====================================================================
describe('★结构锁（源文本锚）', () => {
  const src = readFileSync(new URL('../src/entities/Arrow.ts', import.meta.url), 'utf8');

  it('Arrow 湿段=projWetSection 共享体调用 + 实体面 hooks 组装在位', () => {
    expect(src).toContain('projectileWetSection(this, game, game.world.store');
    expect(src).toContain('transformFlamingArrow: () => { this.projId = 1; }');
    expect(src).toContain('iceBlockAi0: this.hostileAi0');
    expect(src).toContain('onBeachBallExit: () => { this.vy *= 0.5; }');
    expect(src).toContain('projShimmerStep(sf, st, x, y, this.cx)');
  });

  it('自移植副本退役面:本地消亡表/穿参壳/内联段体不复活', () => {
    expect(src).not.toContain('ARROW_DESTROYED_BY_WATER.has');
    expect(src).not.toMatch(/private wetSplashStep\(/);
    expect(src).not.toContain('let flag2 = rWet.wet');   // 段体内联旗（副本签名行）
    expect(src).toContain('if (this.wetSectionKilled) return;');   // 段内杀闩调用位
    expect(src).toContain('presetDone = false;');        // ProjWetFlags 同名旗（fixedUpdate 头预置短路共享体支）
  });

  it('936 解锁回调谓词:vy 臂不复活（原版 :22683-22692 无二次 vy 判,误拒 0≤vy<0.7 窗口）', () => {
    expect(src).toContain("if (game.world.flags['unlockedSlimeRainbowSpawn'] === true) return;");
    expect(src).not.toContain('this.vy >= 0 || game.world.flags');
  });
});
