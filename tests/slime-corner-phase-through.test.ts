// SW-BJ6 2026-09-07 史莱姆坡角穿墙案守卫（流浪汉舌 (1825,317) s1 坡角,用户实报+行为日志）。
// 定谳：AI_001 嵌固回退漂移（NPC.cs:62139/:62331 position.X -= velocity.X + direction,
// 门 collideY+oldVelocity.Y≠0+SolidCollision）+ SolidCollision(:2713) 坡格整块盒语义
// + TileCollision 已重叠体忽略支(:2440) = 原版本体在"地坡高端邻实心柱"几何下匀速
// 相移穿越墙带（1px/t）。本仓曾有两处非原版放大器：
//   ① slopeCollide rawNum4<0 时钳 0 走抬升→受阻→±4px shortfall 滑移（vanilla 走
//      else 支直接站格顶,Collision.cs:1968-1977,无滑移）；
//   ② unembedPass 在漂移中段单帧 ≤64px 横推弹回（vanilla 无任何 unembed 机制）。
// 修：①补 else 支站顶（受阻判定按原版重跑语义只认新交）；②漂移活跃旗
//（unwedgeDrift）期 unembedPass 整段让位。本文件锁：穿越完成 + 无单帧大位移
//（旧实现 maxJump=63px 必红）+ K2 站顶单元 + 结构锁。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { World } from '../src/world/World';
import { Enemy } from '../src/entities/Enemy';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { TILE_BY_KEY } from '../src/data/tiles';
import type { GameHooks } from '../src/entities/types';

const DIRT = TILE_BY_KEY['dirt']!;
const GRASS = TILE_BY_KEY['grass']!;

/**
 * 合成复刻流浪汉舌坡角（tile 坐标,行号对应实景观测）：
 *   x=19 列: r28,r29 实心（=(1823,315)/(1823,316)）; r30 slope4; r31+ 空（凹龛侧）
 *   x=20 列: r28..r31 实心（=(1824,315..318) 台阶柱=穿墙体）
 *   x=21 列: r28,r29 空（=(1825,315)/(1825,316) 壁龛）; r30 slope1（=(1825,317)）;
 *            r31,r32 实心（=(1825,318)/(1825,319)）
 *   x=22 列: r31 slope1（=(1826,318)）; x=23..30: r32 实心（大洞穴地面）
 * slime 从右侧地面出发朝左（玩家在带左侧）→ 贴合爬坡 → 坡高端邻柱 → 相移穿越。
 */
// ★夹具行基线 140：applyGravity 高空衰减档（NPC.cs:91916-91934,num2=(y/16-60)/
//  (worldSurface/6) 钳 [0.25,1]）在浅行把重力压到 0.075 → 贴合走 snap-down 支
// （不置 collideY）→ 嵌固回退漂移门永不点火;真实地形（流浪汉舌 y≈317,全重力
// 0.3,逐拍抬升 collideY=1）必须以深行复刻,夹具才与实录同物理域。
const R = 140;
function buildCorner(w: World): void {
  const st = w.store;
  // 台阶柱 x=20 r(R-10)..(R+1)（高柱=跳跃不可越,复刻实体带柱顶无净空不可站形态）
  for (let r = R - 10; r <= R + 1; r++) st.setTile(20, r, GRASS);
  // 凹龛侧 x=19: (R-2),(R-1) 实心（=(1823,315)/(1823,316)）; R slope4; R+1+ 空
  st.setTile(19, R - 2, GRASS); st.setTile(19, R - 1, GRASS);
  // x=21: R+1,R+2 实心（=(1825,318)/(1825,319)）; R-2,R-1 空（壁龛=(1825,315/316)）
  st.setTile(21, R + 1, GRASS); st.setTile(21, R + 2, GRASS);
  // 右侧大洞穴地面
  for (let x = 22; x <= 30; x++) st.setTile(x, R + 2, x === 22 ? DIRT : GRASS);
  // ★setSlope 只写坡位,坡格本体须先 setTile（TileStore.setSlope :267）
  st.setTile(21, R, GRASS); st.setSlope(21, R, 1);     // =(1825,317) 坡角
  st.setTile(19, R, GRASS); st.setSlope(19, R, 4);     // =(1823,317) 天花板坡
}

function makeGame(world: World, player: unknown): GameHooks {
  return {
    world, player, enemies: () => [], critters: () => [], spawnDrop: () => null,
    damagePlayer: (): number => 0, addDamageNumber: () => {}, cutTile: () => {},
    spawnParticles: () => {}, playSfxFiles: () => {}, playSfxWav: () => {},
    spawnDust: () => null, onEnemyKilled: () => {}, entities: { add: () => {} },
  } as unknown as GameHooks;
}

const GEOM = { h: 18, w59: 26, w1: 24 };
// 盒高（vanilla SetDefaults :8600/:9544 24×18×scale;59 scale1.1 → 26.4×19.8 → 26×19）
function bodyOf(vid: number): { w: number; h: number } {
  return vid === 59 ? { w: GEOM.w59, h: 19 } : { w: GEOM.w1, h: GEOM.h };
}

describe('SW-BJ6 坡角相移穿越（原版同款通道）', () => {
  const cases: Array<{ vid: number; tag: string }> = [
    { vid: 59, tag: '熔岩史莱姆(59) 26×19' },
    { vid: 1, tag: '蓝史莱姆(1) 24×18' },
  ];
  // ★6× 重复 + 出生点扫描（memory 判例:AI 走 Math.random 的实体 A/B 必须多跑统计）
  for (const { vid, tag } of cases) {
    for (let rep = 0; rep < 6; rep++) {
      it(`${tag} rep${rep}:相移穿越完成且无单帧大位移(旧实现 63px 弹射必红)`, () => {
        const world = new World(48, 220, 1234 + rep, 'sw-bj6');
        world.groundLevel = 40;  // cy(≈140) > 40 → underground=true 本应 flag3,
        //                          但 flag3 只影响索敌/跳频,朝向由下方逐拍钉死
        //                          无逐跳重索敌,朝向稳定 +1（复刻实录面向右姿态;
        //                          索敌驱动的朝向翻转会让漂移反向,属另一姿态域）
        buildCorner(world);
        const size = bodyOf(vid);
        // 出生:站在 (21,30) s1 坡面上（=实录 t=172 贴合姿态）,面向右。
        // 进深 d∈{4,8,12} 按 rep 扫描,脚沉坡线 1px 确保贴合当拍接手。
        // 出生:柱嘴内（x=柱左缘+8,脚=格顶线）——ov=1 当拍成立,漂移通道确定性点火。
        // ★边界备案:整数身高体（h=18）在坡角深度 0 的贴合平衡可恰好落在
        //   feet==格顶（ov=0）→ 原版同款自限冻结（vanilla SolidCollision 同判）,
        //   穿越与否取决于子像素姿态,故夹具钉柱嘴内位姿锁定通道本体。
        const e = Enemy.fromVanilla(vid, 20 * 16 + 8, R * 16 - size.h)!;
        e.facing = 1;
        // 钉跳机器（ai0=-3000 在全部 stage 窗之外,1200t 内不点火）——纯化漂移
        // 物理通道;fromVanilla 的 ai0 初值随全局 RNG 抖动会让首跳先于漂移点火
        e.ai0 = -3000;
        e.ai2 = 1;
        const player = {
          x: 44 * 16, y: 20 * 16, w: 20, h: 42,
          get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; },
          dead: false,
        };
        const game = makeGame(world, player);
        const drive = (e as unknown as Record<string, (g: GameHooks, p: unknown) => void>).slimeAI;
        let prevX = e.x, prevY = e.y;
        let maxJump = 0;
        let crossed = false;
        for (let t = 0; t < 1200 && !crossed; t++) {
          drive.call(e, game, player);
          e.facing = 1;   // 钉面向（记录姿态;索敌已由 flag3=false 关闭,此处防 ai3 翻向噪声）
          maxJump = Math.max(maxJump, Math.abs(e.x - prevX), Math.abs(e.y - prevY));
          prevX = e.x; prevY = e.y;
          if (e.cx < 20 * 16 && e.cy > (R - 11) * 16) crossed = true;  // 中心已越柱左缘
        }
        // 相移通道必须把身体带到台阶柱左侧（旧实现:漂移 15t 后被 unembed +64px
        // 弹回坡面,反复循环,1200t 内过不去;且弹射帧 maxJump>16 必红）
        expect(crossed, `vid=${vid} rep=${rep} 未穿越 (cx=${e.cx.toFixed(1)})`).toBe(true);
        expect(maxJump, `vid=${vid} rep=${rep} 出现单帧大位移=${maxJump}px（unembed 弹射签名）`).toBeLessThanOrEqual(16.1);
      });
    }
  }

  it('K2 单元:rawNum4<0 实心地坡走原版 else 支站格顶,无 shortfall 滑移（旧实现 -4px 必红）', () => {
    const world = new World(24, 24, 42, 'sw-bj6-k2');
    const st = world.store;
    // slope1 (10,10),高端邻柱 (9,7..10) 实心;壁龛 (10,8)/(10,9) 开放
    for (const [x, y] of [[9, 7], [9, 8], [9, 9], [9, 10], [10, 11]] as [number, number][]) {
      st.setTile(x, y, DIRT);
    }
    st.setTile(10, 10, DIRT);
    st.setSlope(10, 10, 1);
    const b: Body = {
      x: 10 * 16 - 0.1, y: 10 * 16 - 18 + 0.5, w: 24, h: 18,     // 左缘越柱 0.1px,脚沉坡线 0.5px
      vx: 0, vy: 0.3, onGround: false, hitWall: false, hitHead: false, collideY: false,
      stepUp: true,
    };
    moveAndCollide(b, world, 0, b.vy);
    expect(b.x).toBe(10 * 16 - 0.1);            // 无 ±4px shortfall 滑移（旧实现 x-=4）
    expect(b.y).toBe(10 * 16 - 18);             // 站顶支:脚 = 格顶（:1968-1977 num8）
    expect(b.onGround).toBe(true);
    expect(b.vy).toBe(0);
  });

  it('K2 回归:rawNum4>=0 正常坡面贴合不受影响（脚沉坡线仍被抬回坡面对角线）', () => {
    const world = new World(24, 24, 42, 'sw-bj6-k2b');
    const st = world.store;
    for (let x = 8; x <= 14; x++) st.setTile(x, 12, DIRT);   // 平地
    st.setTile(10, 11, DIRT);
    st.setSlope(10, 11, 1);                                   // 平地上的独立坡
    const b: Body = {
      x: 10 * 16 + 8, y: 11 * 16 - 18 + 12, w: 24, h: 18,     // 左缘进深 8px,脚沉对角线 4px
      vx: 0, vy: 0.3, onGround: false, hitWall: false, hitHead: false, collideY: false,
    };
    moveAndCollide(b, world, 0, b.vy);
    // 坡面对角线在左缘进深 8px 处 = 11*16+8;站顶支不触发（rawNum4=8≥0）,走贴合抬升
    expect(b.y + b.h).toBe(11 * 16 + 8);
    expect(b.onGround).toBe(true);
  });

  it('结构锁:unembedPass 让位门 + AI 两处漂移旗写点在位', () => {
    const tc = readFileSync(new URL('../src/physics/TileCollision.ts', import.meta.url), 'utf8');
    expect(tc).toContain('if (b.unwedgeDrift)');
    expect(tc).toContain('b.unwedgeDrift = false');
    expect(tc).toContain('bestStandTop');
    expect(tc).toContain('rawNum4 < 0');
    const en = readFileSync(new URL('../src/entities/Enemy.ts', import.meta.url), 'utf8');
    // AI_001 两处 revert（贴地 :61932 / 滞空 :62124）均置旗
    expect(en.match(/this\.unwedgeDrift = true;/g)?.length).toBe(2);
  });
});
