// BJ79（2026-09-14）入水声/波纹「左入静默」定谳守卫 → **BJ80 改写（2026-09-14）**。
//
// 【BJ79 判语史】用户实报：1 格宽水袋「从左入水无水声无波纹、从右入才有（概率）」。
// 定谳 = 非缺陷（原版 1:1 几何静默）：湿探针盒（Collision.WetCollision 居中盒
// Collision.cs:1575-1656）盒底 = 脚底 −10px；1 格宽满水袋嵌半砖唇缘间（半砖唇 =
// 原版 Waterfalls pass 产物 WorldGen.cs:21717-21726），满水液面高出唇顶 8px；
// 20px 玩家盒过 16px 袋被唇柱托住（Collision.cs:2071-2075 Down x 重叠即托）→
// 左入踩唇脚恒 = 唇顶、盒底差 2.06px 够不到液面 → wet 翻转不发生 → 声/尘/纹
// 单源同拍全静默（日志 9 次 wentry：左入 0/9、右入 9/9 = 100% 不对称非概率）。
//
// 【★用户明令分歧 2026-09-14「唇入必响」（超越原版）】用户裁决该静默为 bug，要求
// 「任何入水姿态都应有入水声+波纹」→ BJ80 落刀（判例 smart-cursor-dark-visibility-
// user-divergence：动刀+分歧标注+回滚口单点）。分歧本体 = Player.SURFACE_SKIM_SPLASH
// （运行时回滚闸）+ Player.surfaceSkimSplashFeedback（单方法）+ skimSurfaceProbe
// （脚位带几何探针）+ 液体解析段唯一调用行——**湿/游泳状态面（wetCollision 探针）
// 原版 1:1 一字不动**，本文件据此改写为双层守卫：
//   · 湿态面断言（探针几何/亚像素冻结/右入湿/唇托不沉/宽水池对照）**原样保留**；
//   · 原「左入恒干恒静默」判语改写为「干（湿态 1:1）+ 有声有纹（反馈分歧面）」；
//   · 边缘 case 定谳逐条冻结（skimSurfaceProbe 单元组 + fixedUpdate 行为组）；
//   · 变异证红：SURFACE_SKIM_SPLASH=false → 唇袋静默复现（BJ79 旧守卫语义回红）。
//
// 证据件（BJ79）：behavior-log-Starter_World-2026-09-14T06-45-36Z（wentry 插桩）+
// map-Starter_World (31).json（RLE 解码）+ marks-Starter_World (46).json（4310/4312）。
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { wetCollision } from '../src/entities/npcLiquid';
import { moveAndCollide } from '../src/physics/TileCollision';
import { Player, skimSurfaceProbe } from '../src/entities/Player';
import { Inventory } from '../src/items/Inventory';
import { BuffType } from '../src/stats/Buffs';
import type { GameHooks } from '../src/entities/types';

// ---- 涟漪注入间谍（分歧支走 WaterWaves 既有公共口 queueRippleSized；
//      包装转发保真实队列语义，测试只数调用）----
const rippleSpy = vi.hoisted(() => ({ calls: [] as number[][] }));
vi.mock('../src/render/WaterWaves', async (importOriginal) => {
  const mod = await importOriginal<typeof import('../src/render/WaterWaves')>();
  return {
    ...mod,
    queueRippleSized: (x: number, y: number, s: number, sx: number, sy: number,
      shape?: number, rot?: number) => {
      rippleSpy.calls.push([x, y, s, sx, sy, shape ?? 0, rot ?? 0]);
      return mod.queueRippleSized(x, y, s, sx, sy, shape as never, rot as never);
    },
  };
});

// H ≥ ROW+41：wetCollision 扫描窗 j1 = min(maxTilesY−40, …)（Collision.cs:1614
// Utils.Clamp(…, 0, maxTilesY−40)）——H=80 时行 40 被窗尾裁掉（BJ79 首跑实证）
const W = 64, H = 160;
const ROW = 40;                       // 水袋所在行（证据 430 行平移）
const LIP_TOP = ROW * TILE + 8;       // 半砖有效顶（Collision.cs:2073 j*16+8）
const SURF = ROW * TILE + 0.0625;     // 255 满水液面（:1607-1610 float 收缩）

/** 证据剖面镜像（tile x = 证据 x − 4280）：
 *  26,27 整砖 | 28,29 半砖 | 30 水255 | 31 半砖 | 32 水255 | 33 坡2 | 34,35 整砖；
 *  行 41 = 池底/地面。 */
function lipPocketWorld(): World {
  const w = new World(W, H, 11, 'bj79-lip-pocket');
  const st = w.store;
  for (let x = 26; x <= 35; x++) st.setTile(x, ROW + 1, 1);   // 池底/地面
  for (const x of [26, 27, 34, 35]) st.setTile(x, ROW, 1);    // 整砖地面
  for (const x of [28, 29, 31]) { st.setTile(x, ROW, 1); st.setHalfBrick(x, ROW, true); }
  st.setTile(33, ROW, 1); st.setSlope(33, ROW, 2);            // 右缘坡 2（升右）
  st.setLiquid(30, ROW, 255, 1);
  st.setLiquid(32, ROW, 255, 1);
  return w;
}

/** 宽水池对照（3 格宽水、无唇柱承托——「正常水池」） */
function widePoolWorld(): World {
  const w = new World(W, H, 11, 'bj79-wide-pool');
  const st = w.store;
  for (let x = 26; x <= 36; x++) st.setTile(x, ROW + 1, 1);
  for (const x of [26, 27, 36]) st.setTile(x, ROW, 1);
  for (let x = 30; x <= 32; x++) st.setLiquid(x, ROW, 255, 1);
  return w;
}

/** 唇袋同几何 · 液型替换（岩浆=保守 Skip 定谳 / 蜜=蜜档定谳） */
function lipPocketLiquidWorld(type: 2 | 3, name: string): World {
  const w = new World(W, H, 11, name);
  const st = w.store;
  for (let x = 26; x <= 35; x++) st.setTile(x, ROW + 1, 1);
  for (const x of [26, 27, 34, 35]) st.setTile(x, ROW, 1);
  for (const x of [28, 29, 31]) { st.setTile(x, ROW, 1); st.setHalfBrick(x, ROW, true); }
  st.setTile(33, ROW, 1); st.setSlope(33, ROW, 2);
  st.setLiquid(30, ROW, 255, type);
  st.setLiquid(32, ROW, 255, type);
  return w;
}

/** 深水池（水行悬停态用：row 60-119 灌水，row 120 池底） */
function deepPoolWorld(): World {
  const w = new World(80, 200, 11, 'bj80-deep-pool');
  const st = w.store;
  for (let x = 20; x < 60; x++) {
    st.setTile(x, 120, 1);
    for (let y = 60; y < 120; y++) st.setLiquid(x, y, 255, 1);
  }
  return w;
}

/** 浅水涉行对照（100 液 = 液面 rowTop+9.75；脚踩 row41 顶 656 —— vanilla 湿探针盒底
 *  646 < 液面 649.75 = 涉行干的真实几何;16px 满水深池涉行探针盒底已入液 6px 是「湿」,
 *  不构成本判据的反例） */
function shallowWadeWorld(): World {
  const w = new World(W, H, 11, 'bj80-shallow-wade');
  const st = w.store;
  for (let x = 26; x <= 36; x++) st.setTile(x, ROW + 1, 1);
  for (let x = 30; x <= 32; x++) st.setLiquid(x, ROW, 100, 1);
  return w;
}

const PW = 20, PH = 42;   // 玩家碰撞盒（日志 h=42）

// ---- fixedUpdate 行为夹具：mock hooks + 计数面（sfx/dust）----
function makeDriver(world: World, px: number, py: number) {
  const p = new Player(px, py, new Inventory());
  p.hp = 100;
  const sfx: { name: string; vol: number }[] = [];
  const dust: number[] = [];
  const hooks = {
    world, player: p, enemies: () => [], critters: () => [],
    spawnDrop: () => null, damagePlayer: (): number => 0, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {},
    playSfx: () => {}, playSfxFiles: () => {}, showPickupLabel: () => {},
    playSfxWav: (name: string, vol?: number) => { sfx.push({ name, vol: vol ?? 1 }); },
    spawnDust: () => { dust.push(1); return { vx: 0, vy: 0, scale: 1 }; },
  } as unknown as GameHooks;
  return { p, hooks, sfx, dust };
}

/** 脚本化跨袋行走：每 tick 先平移 x 再跑 fixedUpdate（液块读当拍位姿；
 *  vx=0 + 唇柱承托 → moveAndCollide 每拍落回唇面, onGround/vy 门稳定） */
function step(p: Player, hooks: GameHooks, dx: number): void {
  p.x += dx;
  p.fixedUpdate(1 / 60, hooks);
}
const splashCount = (sfx: { name: string }[]) => sfx.filter(e => e.name.startsWith('Splash')).length;
const bandContact = (p: Player, w: World) =>
  skimSurfaceProbe(w.store, p.x, p.y + p.h, p.w, 8) !== null;

beforeEach(() => { rippleSpy.calls.length = 0; });

describe('BJ79 定谳守卫（原版语义面，保留）：WetCollision 探针几何（Collision.cs:1575-1656 1:1 冻结）', () => {
  it('探针盒 = 10×21 @ (px+5, py+11)：x 窗双边界（盒缘即界）', () => {
    const w = lipPocketWorld();
    const sunk = ROW * TILE + 14 - PH;          // 脚 = 行顶+14（袋底 656−4? 取袋内深度）
    // 水格 30 = [480,496)：探针 [px+5, px+15] → 命中窗 (465, 491)
    expect(wetCollision(w.store, 465, sunk, PW, PH).wet).toBe(false);  // 480 > 480 假
    expect(wetCollision(w.store, 466, sunk, PW, PH).wet).toBe(true);
    expect(wetCollision(w.store, 490, sunk, PW, PH).wet).toBe(true);
    expect(wetCollision(w.store, 491, sunk, PW, PH).wet).toBe(false);  // 496 > 496 假
  });

  it('255 满水液面 +0.0625px 亚像素冻结：脚 650 干 / 651 湿 / 650.03 干·650.1 湿', () => {
    const w = lipPocketWorld();
    const px = 511;                             // 证据翻转位：探针左 = 水格左+4
    expect(wetCollision(w.store, px, 650 - PH, PW, PH).wet).toBe(false); // 盒底 640 ≤ 640.0625
    expect(wetCollision(w.store, px, 651 - PH, PW, PH).wet).toBe(true);  // 盒底 641 > 640.0625
    // 亚像素判别（脚 ∈ (650, 650.0625] 才区分 float/int 液面）：盒底 640.03 ≤ 640.0625 干、
    // 640.1 > 640.0625 湿——冻结 :1607-1610 的 float 收缩（num5/=32f 不取整）
    expect(wetCollision(w.store, px, 650.03 - PH, PW, PH).wet).toBe(false);
    expect(wetCollision(w.store, px, 650.1 - PH, PW, PH).wet).toBe(true);
  });
});

describe('BJ79 定谳守卫（原版语义面，保留）：右入有声 / 唇托机制 / 宽水池对照', () => {
  it('右入判语：坡 2 下行/跳落沉脚（脚 ≥ 唇顶+3）→ 翻转湿 → Splash_0+波纹同拍', () => {
    const w = lipPocketWorld();
    // 日志翻转深度：wentry y=6850 → 脚 6892 = 唇顶+4；探针盒底 642 > 640.0625
    expect(wetCollision(w.store, 511, LIP_TOP + 4 - PH, PW, PH).wet).toBe(true);
    expect(wetCollision(w.store, 484, LIP_TOP + 4 - PH, PW, PH).wet).toBe(true);  // 左袋同判
    // 袋底（脚=656）：盒底 646，深湿
    expect(wetCollision(w.store, 511, ROW * TILE + 16 - PH, PW, PH).wet).toBe(true);
  });

  it('机制锚：20px 盒过 16px 水袋被唇柱托住不沉（Collision.cs:2071-2075 Down 半砖顶）', () => {
    const w = lipPocketWorld();
    const b = {
      x: 473, y: LIP_TOP - PH, w: PW, h: PH, vx: 0, vy: 0.4,
      onGround: false, hitWall: false, hitHead: false, stepUp: true,
    };
    moveAndCollide(b, w, 0, 0.4);               // 重力一步：盒 [473,493] 与唇 29 [464,480] 重叠 7px
    expect(b.y).toBe(LIP_TOP - PH);             // 不沉（唇顶 648 支撑）
    expect(b.onGround).toBe(true);
  });

  it('对照（用户口径「正常水池每次都响」）：宽水池入水下沉即湿', () => {
    const w = widePoolWorld();
    const b = {
      x: 30 * TILE + 3, y: ROW * TILE - PH, w: PW, h: PH, vx: 0, vy: 0.4,
      onGround: false, hitWall: false, hitHead: false, stepUp: true,
    };
    for (let k = 0; k < 60 && !b.onGround; k++) {   // 无唇承托 → 逐步沉到池底
      b.vy = Math.min(10, b.vy + 0.4);
      moveAndCollide(b, w, 0, b.vy);
    }
    expect(b.y).toBe(ROW * TILE + 16 - PH);     // 脚落池底 656
    expect(wetCollision(w.store, b.x, b.y, PW, PH).wet).toBe(true);   // → 有声有纹
  });
});

// ---- ★BJ80 双层改写（原「左入判语：全 x 扫描恒干 → 无声无纹」判语在此被用户分歧推翻）----
describe('★用户明令分歧 2026-09-14「唇入必响」（超越原版）：左入双层守卫', () => {
  it('湿态面（原版 1:1 保留）：踩半砖唇行走（脚=唇顶 648）全 x 扫描 wetCollision 恒干', () => {
    const w = lipPocketWorld();
    const py = LIP_TOP - PH;                    // 606：探针盒 [py+11, py+32] = [617, 638]
    expect(py + 32).toBeLessThan(SURF);         // 盒底 638 < 液面 640.0625（差 2.06px,几何前提自证）
    for (let px = 26 * TILE - 8; px <= 35 * TILE; px++) {
      expect(wetCollision(w.store, px, py, PW, PH).wet).toBe(false);
    }
  });

  it('反馈面（分歧支输入几何）：同姿态脚位带 [648,656) 跨袋扫描——湿探针够不到的袋缘确有液面接触', () => {
    const w = lipPocketWorld();
    const py = LIP_TOP - PH;
    const foot = py + PH;                       // 648 = 唇顶
    let contacts = 0;
    for (let px = 26 * TILE - 8; px <= 35 * TILE; px++) {
      expect(wetCollision(w.store, px, py, PW, PH).wet).toBe(false);   // 湿态面恒干（同上）
      if (skimSurfaceProbe(w.store, px, foot, PW, 8) !== null) contacts++;
    }
    expect(contacts).toBeGreaterThan(0);        // 两袋缘各有接触带（反馈面输入存在）
    // 探针盲区实证：px=461（盒右缘探入袋 30 1px）湿探针干 ∧ 脚位带接触——BJ79 静默窗口
    expect(wetCollision(w.store, 461, py, PW, PH).wet).toBe(false);
    expect(skimSurfaceProbe(w.store, 461, foot, PW, 8)).not.toBeNull();
  });

  it('行为面（脚本化跨袋）：左入踩唇跨袋 = 声+尘+纹各 ≥1（与正常入水同路同档 Splash_0/音量 1），湿态恒干不翻', () => {
    const w = lipPocketWorld();
    const { p, hooks, sfx, dust } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    for (let t = 0; t < 44; t++) step(p, hooks, 2.5);   // 448 → 558：跨两袋上坡收尾
    const splashes = sfx.filter(e => e.name === 'Splash_0');
    // 袋30[480,496)+半砖31+袋32[512,528)：20px 盒跨骑其上脚位带连续触液
    // （px∈(460,528) 恒有袋列重叠,无落空段）→ 单一连续接触 = 单响——「连走多格水袋
    // 防逐格连响」的几何天然形态（边缘 case③）；「跨袋间隔应可再响」由离带>10t 再入证。
    expect(splashes.length).toBe(1);
    expect(splashes.every(e => e.vol === 1)).toBe(true);              // 同音量（vanilla 入水音量 1）
    expect(rippleSpy.calls.length).toBe(1);     // 波纹注入同拍
    expect(rippleSpy.calls.every(c => Math.abs(c[1] - SURF) < 0.01)).toBe(true);   // 钉液面线
    expect(dust.length).toBeGreaterThanOrEqual(50);   // 尘发射器同路（50 颗/次）
    expect(p.inWater).toBe(false);              // 湿态面：全程未翻（BJ79 状态 1:1 不动）
    expect(p.wetCount).toBe(0);
  });

  it('行为面（实机步行 inputX 驱动）：真实步行速度下涟漪强度>0、规模 (w,h)·k 同 vanilla 入水公式', () => {
    const w = lipPocketWorld();
    const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    p.inputX = 1;                               // 步行加速至 PLAYER_WALK_MAX=3（constants.ts:28）
    for (let t = 0; t < 38; t++) p.fixedUpdate(1 / 60, hooks);   // ≈99px → 唇区跨袋收步于 34/35 整砖
    p.inputX = 0;
    for (let t = 0; t < 10; t++) p.fixedUpdate(1 / 60, hooks);
    expect(sfx.filter(e => e.name === 'Splash_0').length).toBeGreaterThanOrEqual(1);
    expect(sfx.every(e => e.vol === 1)).toBe(true);
    expect(rippleSpy.calls.length).toBeGreaterThanOrEqual(1);
    expect(rippleSpy.calls.every(c => Math.abs(c[1] - SURF) < 0.01)).toBe(true);
    // 同 vanilla 入水拍公式（Renderer pushPlayer :792）：strength=0.15√|vel|、k=clamp(s3·10)、
    // 尺寸 (w·k, h·k)——从间谍值自洽反算（步行速度非定值,不钉具体强度）
    expect(rippleSpy.calls.every(c => c[2] > 0)).toBe(true);
    expect(rippleSpy.calls.every(c => {
      const k = Math.min(1, Math.max(0, c[2] * 10));
      return Math.abs(c[3] - PW * k) < 1e-9 && Math.abs(c[4] - PH * k) < 1e-9;
    })).toBe(true);
    expect(p.inWater).toBe(false);
  });

  it('anti-spam：离带 3t 内再入（<10t 窗）→ 边沿已消费,仍 1 响（窗内新接触静默）', () => {
    const w = lipPocketWorld();
    const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    for (let t = 0; t < 5; t++) step(p, hooks, 2.5);    // 入带 → 首响（px 460.5, t=5）
    expect(splashCount(sfx)).toBe(1);
    for (let t = 0; t < 3; t++) step(p, hooks, -2.5);   // 退出接触（px 453 ≤ 460）
    expect(bandContact(p, w)).toBe(false);
    for (let t = 0; t < 12; t++) step(p, hooks, 2.5);   // 再入（t+6 触带 < 10t 窗）→ 被拦
    expect(splashCount(sfx)).toBe(1);           // 边沿消费（不复响）；连续触液亦无新边沿
    expect(rippleSpy.calls.length).toBe(1);
  });

  it('跨袋间隔应可再响：响后离带 >10t 再入 → 第二响（2 响）', () => {
    const w = lipPocketWorld();
    const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    for (let t = 0; t < 8; t++) step(p, hooks, 2.5);        // 入带 → 首响（px 462.5, t=6）
    expect(splashCount(sfx)).toBe(1);
    for (let t = 0; t < 14 && bandContact(p, w); t++) step(p, hooks, -1);   // 1px/t 退回唇区（无接触 ≥10t）
    expect(bandContact(p, w)).toBe(false);
    for (let t = 0; t < 10 && !bandContact(p, w); t++) step(p, hooks, 2.5); // 再入
    for (let t = 0; t < 4; t++) step(p, hooks, 2.5);
    expect(splashCount(sfx)).toBe(2);           // 冷却已尽（置位后第 10 拍,同 wetCount 拍距）
    expect(rippleSpy.calls.length).toBe(2);
  });

  it('边缘 case① 水行悬停态=0 掠水（main-dry 门）：水行药水落深池 → vanilla 入水恰 1 次、悬停湿态不再响', () => {
    const w = deepPoolWorld();
    const { p, hooks, sfx } = makeDriver(w, 40 * TILE, 55 * TILE);
    p.buffs.apply(BuffType.WaterWalking, 60);
    for (let t = 0; t < 240; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.inWater).toBe(true);               // 悬停湿态（湿探针盒底 = 脚−10 在液面下）
    expect(splashCount(sfx)).toBe(1);           // 仅 vanilla 入水 1 次（descent 期 onGround 门拦掠水）
    expect(rippleSpy.calls.length).toBe(0);     // 掠水支 0
    const n = sfx.length;
    for (let t = 0; t < 120; t++) p.fixedUpdate(1 / 60, hooks);
    expect(sfx.length).toBe(n);                 // 悬停/水面行走不步步溅水（原版同）
  });

  it('边缘 case② 宽水域无双发：落水 descent（onGround=false）+ 入水后主探针湿（main-dry）双门 → 恰 1 响 0 掠水', () => {
    const w = widePoolWorld();
    const { p, hooks, sfx } = makeDriver(w, 31 * TILE, ROW * TILE - 60);
    for (let t = 0; t < 120; t++) p.fixedUpdate(1 / 60, hooks);
    expect(p.inWater).toBe(true);
    expect(splashCount(sfx)).toBe(1);           // 仅 vanilla 入水
    expect(rippleSpy.calls.length).toBe(0);
  });

  it('边缘 case⑤ 岩浆袋=保守 Skip：A/B 开闸 vs 关闸 sfx 序列逐项全等（掠水支零参与）+ 0 波纹注入', () => {
    const runLavaWalk = () => {
      const w = lipPocketLiquidWorld(2, 'bj80-lava-lip');
      const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
      let sawInLava = false;
      for (let t = 0; t < 44; t++) { step(p, hooks, 2.5); sawInLava = sawInLava || p.inLava; }
      return { sfx: sfx.map(e => e.name), sawInLava };
    };
    const off = (() => {
      const o = Player.SURFACE_SKIM_SPLASH;
      Player.SURFACE_SKIM_SPLASH = false;
      try { return runLavaWalk(); } finally { Player.SURFACE_SKIM_SPLASH = o; }
    })();
    const on = runLavaWalk();
    expect(on.sawInLava).toBe(true);    // 岩浆侧不静默：全盒 LavaCollision 照常命中（:3976 1:1 → 重伤+烈焰）
    expect(on.sfx).toEqual(off.sfx);    // 序列全等 = 掠水支对岩浆零参与（type=2 早退）
    expect(rippleSpy.calls.length).toBe(0);
    // ★备案（域外观察,非本刀面）：序列含一条 Splash_0 = 状态侧 wasWetAll 四桶并集纳入
    // 全盒 inLava（:3968）在「探针干+全盒岩浆擦过」姿态下的出浆分支发射——vanilla 湿粘滞
    // 位只由 num86（居中探针,:28060）驱动,此姿态原版静默。属状态面既存语义,本刀不触。
  });

  it('蜜袋=蜜档掠水（Splash_1 同款）；微光态整体静默门（:27987 镜像）由实现门序承载', () => {
    const w = lipPocketLiquidWorld(3, 'bj80-honey-lip');
    const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    for (let t = 0; t < 44; t++) step(p, hooks, 2.5);
    // 同水袋几何：20px 盒跨骑双袋连续触液 → 单响单纹（见行为面注）
    expect(sfx.filter(e => e.name === 'Splash_1').length).toBe(1);
    expect(rippleSpy.calls.length).toBe(1);
  });
});

describe('BJ80 分歧支探针 skimSurfaceProbe（边缘 case 定谳冻结）', () => {
  it('唇袋：脚=唇顶 648 带 [648,656) 与满水袋液面带相交 → contact + surfY=640.0625 + 液型水', () => {
    const w = lipPocketWorld();
    const hit = skimSurfaceProbe(w.store, 470, LIP_TOP, PW, 8);
    expect(hit).not.toBeNull();
    expect(hit!.surfY).toBeCloseTo(SURF, 6);
    expect(hit!.type === 0 || hit!.type === 1).toBe(true);
  });

  it('岸侧贴走（脚=相邻满水格底 656）→ 零接触（★任务草案 foot−2 上沿会 2px 掠边误触,否决依据）', () => {
    const w = widePoolWorld();
    const foot = (ROW + 1) * TILE;              // 656 = 岸面 = 水格 30 底
    expect(skimSurfaceProbe(w.store, 470, foot, PW, 8)).toBeNull();   // 盒 [470,490] 与袋 30 [480,496) 重叠 10px 仍零接触
  });

  it('浅水涉行（液面 649.75 在脚 656 上方 6px、脚踩池底）→ vanilla 涉行干 ∧ 掠水带零接触（静默 1:1 不扩）', () => {
    const w = shallowWadeWorld();
    const foot = (ROW + 1) * TILE;              // 656 池底
    expect(wetCollision(w.store, 500, foot - PH, PW, PH).wet).toBe(false);  // 探针盒底 646 < 液面 649.75
    expect(skimSurfaceProbe(w.store, 500, foot, PW, 8)).toBeNull();         // 带 [656,664) 与液带 [649.75,656) 严格格底不相交
  });

  it('带在液面上方 8px 之外（桥/高台越水）→ 零接触', () => {
    const w = widePoolWorld();
    const footAbove = ROW * TILE - 8;           // 脚 632：带 [632,640) 底 640 ≤ 液面 640.0625
    expect(skimSurfaceProbe(w.store, 500, footAbove, PW, 8)).toBeNull();
  });

  it('岩浆在带内 → type=2 上报（调用侧保守 Skip 的输入）', () => {
    const w = lipPocketLiquidWorld(2, 'bj80-lava-probe');
    const hit = skimSurfaceProbe(w.store, 470, LIP_TOP, PW, 8);
    expect(hit).not.toBeNull();
    expect(hit!.type).toBe(2);
  });
});

describe('变异证红（回滚口）：SURFACE_SKIM_SPLASH=false → 唇袋静默复现（BJ79 旧守卫语义回红）', () => {
  it('关闸后同一跨袋行走 0 声 0 纹、湿态恒干——摘反馈支即回到 BJ79 定谳原版静默', () => {
    const w = lipPocketWorld();
    const { p, hooks, sfx } = makeDriver(w, 28 * TILE, LIP_TOP - PH);
    const orig = Player.SURFACE_SKIM_SPLASH;
    Player.SURFACE_SKIM_SPLASH = false;
    try {
      for (let t = 0; t < 44; t++) step(p, hooks, 2.5);
      expect(splashCount(sfx)).toBe(0);
      expect(rippleSpy.calls.length).toBe(0);
      expect(p.inWater).toBe(false);            // 湿态面与开闸一致（状态零参与）
      expect(wetCollision(w.store, 511, LIP_TOP - PH, PW, PH).wet).toBe(false);
    } finally {
      Player.SURFACE_SKIM_SPLASH = orig;
    }
    expect(Player.SURFACE_SKIM_SPLASH).toBe(true);
  });
});
