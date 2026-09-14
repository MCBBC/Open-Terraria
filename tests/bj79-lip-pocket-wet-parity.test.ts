// BJ79（2026-09-14）入水声/波纹「左入静默」定谳守卫——判语 = 非缺陷（原版 1:1 行为冻结）。
//
// 用户实报：1 格宽水袋「从左入水无水声无波纹、从右入才有（概率）」；且只在这类特殊
// 地形发生（普通水池每次都响）。证据件：behavior-log-Starter_World-2026-09-14T06-45-36Z
// （wentry=Player.inWater 翻转拍 instrumentation）+ map-Starter_World (31).json（RLE 解码）
// + marks-Starter_World (46).json（用户标记 4310/4312 两水格）。
//
// 日志实证：向右走（左入）0/9 翻转、向左走（右入）9/9 翻转 + Splash_0（非概率，100% 不对称）。
//
// 根因 = 地形 × 探针几何，触发链零缺陷（全部源码锚 1457）：
//  1. 触发链单源：Collision.WetCollision 中心小盒（Collision.cs:1575-1656）→
//     Player.ts:3866 wet 翻转 → Player.ts:3897-3941 溅花尘 + Splash_N（:28042 原版
//     PlaySound(19)）→ Renderer injectEntity（wet: p.inWater / wetCount, Renderer.ts:4808）
//     → WaterWaves.ts:779-796 波纹/wash 注入（原版 DrawWaves :242-263 同键）。
//     声/尘/纹同源同拍——翻转不发生则三者全静默 ≙ 原版同构，无单侧断链可修。
//  2. 探针几何（Collision.cs:1577-1592）：盒 = min(10,W)×min(H/2,H)=10×21、
//     锚 (px+W/2−5, py+H/2−10) → 盒底 = 脚底 −10px；液面 = 行顶 + (256−liquid)/32×2
//     （float 收缩 :1607-1610，255 满水 = +0.0625px）。
//  3. 地形（map 解码）：4310/4312 两格 255 满水嵌在半砖唇缘之间（4308/4309/4311 半砖、
//     4313 坡2）——半砖唇缘 = 原版 Waterfalls pass「水边唇缘砸半砖」生成产物
//     （HalfBrickPass.ts 头注；WorldGen.cs TileCleanup :21717-21726 坡↔半砖转换）。
//     满水液面（6880.06）高出唇顶（6888）8px。
//  4. 半砖唇支撑（不沉机制锚）：Collision.cs:2071-2075 Down 碰撞半砖有效顶 = j*16+8、
//     x 全盒重叠即支撑 → 20px 盒过 16px 水袋恒被唇柱托住（脚不沉）；右缘坡 2 下行
//     （或跳落）脚沉至 ≥6891 → 探针盒底 ≥6881 ≥ 液面 → 翻转有声。
//  ⇒ 左入踩唇行走：脚=6888、盒底=6878 < 液面 6880.0625（差 2.06px）→ 恒干恒静默。
//    这正是原版玩家在同一地形下的行为；改「唇侧行走入水必响」属用户分歧特性
//    （非 1:1 修复），若要做须有意推翻本文件并登记偏差决策
//    （判例：smart-cursor-dark-visibility-user-divergence）。
import { describe, it, expect } from 'vitest';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import { wetCollision } from '../src/entities/npcLiquid';
import { moveAndCollide } from '../src/physics/TileCollision';

// H ≥ ROW+41：wetCollision 扫描窗 j1 = min(maxTilesY−40, …)（Collision.cs:1614
// Utils.Clamp(…, 0, maxTilesY−40)）——H=80 时行 40 被窗尾裁掉（本测试首跑实证）
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

const PW = 20, PH = 42;   // 玩家碰撞盒（日志 h=42）

describe('BJ79 定谳守卫：WetCollision 探针几何（Collision.cs:1575-1656 1:1 冻结）', () => {
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
    const px = 511;                             // 证据翻转位：探针左 = 水格左+4（日志 px≈68991 对 4312）
    expect(wetCollision(w.store, px, 650 - PH, PW, PH).wet).toBe(false); // 盒底 640 ≤ 640.0625
    expect(wetCollision(w.store, px, 651 - PH, PW, PH).wet).toBe(true);  // 盒底 641 > 640.0625
    // 亚像素判别（脚 ∈ (650, 650.0625] 才区分 float/int 液面）：盒底 640.03 ≤ 640.0625 干、
    // 640.1 > 640.0625 湿——冻结 :1607-1610 的 float 收缩（num5/=32f 不取整）
    expect(wetCollision(w.store, px, 650.03 - PH, PW, PH).wet).toBe(false);
    expect(wetCollision(w.store, px, 650.1 - PH, PW, PH).wet).toBe(true);
  });
});

describe('BJ79 定谳守卫：唇袋地形「左入静默/右入有声」= 原版行为（非缺陷冻结）', () => {
  it('左入判语：踩半砖唇行走（脚=唇顶 648）全 x 扫描恒干 → 无声无纹', () => {
    const w = lipPocketWorld();
    const py = LIP_TOP - PH;                    // 606：探针盒 [py+11, py+32] = [617, 638]
    expect(py + 32).toBeLessThan(SURF);         // 盒底 638 < 液面 640.0625（差 2.06px,几何前提自证）
    for (let px = 26 * TILE - 8; px <= 35 * TILE; px++) {
      expect(wetCollision(w.store, px, py, PW, PH).wet).toBe(false);
    }
  });

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
