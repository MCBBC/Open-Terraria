// ★BJ480 NewDustPerfect 裁剪面复裁（2026-10-03）判别测试——BJ466 复核勘误成立,
// BJ460③「perfect 豁免」钉案被推翻,落刀=摘 VanillaDust.spawn 的 opts.perfect 裁剪豁免。
//
// 原版定谳锚（Terarria1457/Terraria/）：
//  · Dust.cs:54-63 NewDustPerfect——:56 = `Main.dust[NewDust(Position, 0, 0, Type,
//    0f, 0f, Alpha, newColor, Scale)]` 完整委托（BJ466 勘误面,逐行亲读）;:57
//    dust.position = Position;:58-61 Velocity.HasValue → dust.velocity 覆写。
//  · Dust.cs:97-103 NewDust 裁剪面——:97 margin=(int)(400f×(1f−dCount));:98 视口
//    四向外扩;:99 裁剪盒 = new Rectangle((int)Position.X, (int)Position.Y, 10, 10)
//    【恒定,Width/Height 形参不进裁剪式】→ perfect 传 0,0 宽高不构成豁免,且 :57
//    覆写位与裁剪盒同点（无错位）;:100-102 不相交→ return 6000（先于槽搜索 :105 与
//    密度梯 :116-151 = 被裁零 RNG 消费）。
//  · 拒收语义——Main.cs:1692 `dust = new Dust[6001]` + :6824-6828 Initialize_Entities
//    j<6001 初始化：dust[6000]=inactive 哨兵槽（UpdateDust Dust.cs:436 与绘制循环
//    只走 <6000/<maxDustToDraw≤6000,哨兵永不更新/绘制）→ NewDustPerfect :57-61
//    覆写落哨兵即蒸发=等价拒;调用侧链式后置写（d.noGravity 等）随写随没=原版同相。
//  · prettySparkle 豁免维持——PrettySparkle 走 _poolPrettySparkle（ParticleOrchestrator
//    .cs:38）,ParticlePool.RequestParticle（Terraria.Graphics.Renderers/ParticlePool.cs
//    :29-46）扫空位/扩 List,零门零掷,与 Dust 池全异。
//
// 调用方普查：原版 NewDustPerfect 调用点 158 处（Projectile 112/Player 16/NPC 16/
// Mount 7/WorldItem 2/PopupText 2/DelegateMethods 2/Main 1）全部同吃裁剪;本仓 perfect
// 载体（Game.spawnDust 第 12 参/opts.perfect）摘豁免后屏外 spawn 返 null = 池满同契约
// （Dart/VolcanoBlastProj/DroneProjs/SwingArc/bossAI_dd2/Arrow/proj1457 等守卫形与
// WeaponProj/FallingStar 等发射后不管形均安全——守卫形跳过后置写=原版哨兵写蒸发同相）。
import { describe, it, expect, afterEach } from 'vitest';
import { VanillaDust } from '../src/fx/VanillaDust';
import type { VDust } from '../src/fx/VanillaDust';

const realRandom = Math.random;
afterEach(() => { Math.random = realRandom; });

/** 测试视口：update(1000,1000,800,600)——右缘 1800/底缘 1600（世界像素）;0 活跃 →
 *  dCount=0 → margin=400（dustCullMarginOf 钉值面归 BJ466 ③,此处只消费） */
const VX = 1000, VY = 1000, VW = 800, VH = 600;

const poolOf = (vd: VanillaDust) => (vd as unknown as { pool: VDust[] }).pool;
const activeOf = (vd: VanillaDust) => poolOf(vd).filter((d) => d.active).length;

describe('BJ480 ① perfect 屏外照裁（BJ466 勘误成立面）', () => {
  it('屏外 perfect spawn 拒且零 RNG 消费（与普通 NewDust 同面）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    let rolls = 0;
    Math.random = (() => { rolls++; return 0.99; }) as never;
    // 右缘 1800+400=2200 外;perfect 0,0 宽高盒抖动窗/±2 速掷全不该发生
    expect(vd.spawn(7200, 1300, 16, 16, 1, 3, 4, 0, null, 1, { perfect: true })).toBeNull();
    expect(rolls).toBe(0);                    // 裁剪先于密度门与全部初始化掷=零掷早退
    expect(activeOf(vd)).toBe(0);             // 池零新增（原版哨兵槽写蒸发等价）
  });

  it('同位普通 spawn 同拒（perfect 与普通通道同一裁剪几何）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    expect(vd.spawn(7200, 1300, 16, 16, 1)).toBeNull();
  });
});

describe('BJ480 ② perfect 屏内照常（覆写面不回归）', () => {
  it('屏内 perfect spawn 入池,position/velocity 精确覆写', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    const p = vd.spawn(1200, 1300, 16, 16, 1, 3, 4, 0, null, 1, { perfect: true })!;
    expect(p.active).toBe(true);
    expect(p.x).toBe(1200);                   // :57 dust.position = Position
    expect(p.y).toBe(1300);
    expect(p.vx).toBe(3);                     // :58-61 Velocity.HasValue 覆写
    expect(p.vy).toBe(4);
  });

  it('右缘 2199 收 / 2200 拒（盒=(Position,10,10) 与普通通道同边）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    Math.random = (() => 0.99) as never;
    const p = vd.spawn(2199, 1300, 0, 0, 1, 1, 0, 0, null, 1, { perfect: true })!;
    expect(p.x).toBe(2199);                   // 覆写位=裁剪盒左上（:57 与 :99 同点）
    expect(vd.spawn(2200, 1300, 0, 0, 1, 1, 0, 0, null, 1, { perfect: true })).toBeNull();
  });
});

describe('BJ480 ③ prettySparkle 豁免保持（BJ460③ 该半面正确）', () => {
  it('屏外 prettySparkle spawn 不裁（ParticlePool 不入 Dust 池零门）', () => {
    const vd = new VanillaDust();
    vd.update(VX, VY, VW, VH);
    const q = vd.spawn(7200, 1300, 16, 16, 1, 3, 4, 0, null, 1, { prettySparkle: true })!;
    expect(q.active).toBe(true);
    expect(q.x).toBe(7200);
  });
});
