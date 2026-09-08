// dust 43（TintableDustLighted/矿物闪光体）机制锁 —— TileParticles.ts 债① 注销账
// （2026-09-08）的机制级证据。权威 = Terarria1457/Terraria/Dust.cs case 43 :1472-1518：
//   照度门自灭 :1505-1508（num79/80/81 三通道 <0.05 → active=false）/
//   AddLight :1509-1512（noLightEmittance 门）/ 链 A 独占（:1472 else-if 成员——
//   通用重力 :1889-1899 被整链跳过,43 号在链内零速度操作,spawn 速 0 +
//   TileDrawing.cs:7652-7653 velocity×0 ⇒ 不传 noGravity 也静止）/
//   链 B 兜底 :2407-2413（type!=304 && noGravity → velocity×0.92 + fadeIn==0
//   scale−0.04）——旧注"Game.ts 侧一字修 noGravity=true"的反向证据：真传会让
//   闪尘逐拍缩没,发射器现状（不传）即正解。登记不动路线,本锁防两向回漂。
import { describe, it, expect } from 'vitest';
import { VanillaDust } from '../src/fx/VanillaDust';

const WHITE = { r: 255, g: 255, b: 255, a: 255 };
const BRIGHT: [number, number, number] = [270, 270, 270];
const DARK: [number, number, number] = [0, 0, 0];

/** 产一粒 43 号尘并归一 spawn 侧随机抖动（NewDust 位/速/scale 四掷）——只锁机制不锁掷流 */
function spawnDust43(engine: VanillaDust): NonNullable<ReturnType<VanillaDust['spawn']>> {
  const d = engine.spawn(100, 100, 16, 16, 43, 0, 0, 255, WHITE, 0.5)!;
  d.x = 100; d.y = 100; d.vx = 0; d.vy = 0; d.scale = 0.5;
  return d;
}

describe('dust 43 链 A 机制锁（Dust.cs:1472-1518）——债① 注销证据', () => {
  it('照度门自灭：环境光三通道全 <0.05 → active=false（:1505-1508 ⇒ VanillaDust.ts:598-599）', () => {
    const e = new VanillaDust();
    const d = spawnDust43(e);
    expect(d.active).toBe(true);
    e.update(0, 0, 4000, 4000, 0, 0, () => DARK);
    expect(d.active).toBe(false);   // "环境光过低自灭未建模"论断不成立
  });

  it('AddLight：亮光下 lights.push,量级 = (light/270)×scale×1.07×color/255（:1509-1512）', () => {
    const e = new VanillaDust();
    const d = spawnDust43(e);
    d.scale = 1;
    e.update(0, 0, 4000, 4000, 0, 0, () => BRIGHT);
    expect(d.active).toBe(true);
    expect(e.lights).toHaveLength(1);
    const k = (270 / 270) * 1 * 1.07 * (255 / 255);
    expect(e.lights[0].r).toBeCloseTo(k, 10);
    expect(e.lights[0].g).toBeCloseTo(k, 10);
    expect(e.lights[0].b).toBeCloseTo(k, 10);
    expect(e.lights[0].x).toBe(100);
    expect(e.lights[0].y).toBe(100);
  });

  it('静止性：不传 noGravity 也零速度——链 A chainLink=true 跳过通用重力 :1889-1899', () => {
    const e = new VanillaDust();
    const d = spawnDust43(e);
    expect(d.noGravity).toBe(false);        // 发射器现状：不传（正解）
    for (let t = 0; t < 10; t++) e.update(0, 0, 4000, 4000, 0, 0, () => BRIGHT);
    expect(d.active).toBe(true);
    expect(d.vx).toBe(0);
    expect(d.vy).toBe(0);                   // 无 +0.1/t 下沉——"未传 noGravity 会下沉"论断不成立
  });

  it('反例锁：noGravity=true 落链 B 兜底 ×0.92 + scale−0.04（:2407-2413）——闪尘逐拍缩没,禁改', () => {
    // 同初值双尘,唯一差异 noGravity——差值即链 B 兜底臂（其余老化两尘恒同）
    const ea = new VanillaDust();
    const eb = new VanillaDust();
    const a = spawnDust43(ea); a.vx = 2; a.vy = 1;
    const b = spawnDust43(eb); b.vx = 2; b.vy = 1; b.noGravity = true;
    const scale0 = a.scale;                 // 0.5（归一后同起点）
    ea.update(0, 0, 4000, 4000, 0, 0, () => BRIGHT);
    eb.update(0, 0, 4000, 4000, 0, 0, () => BRIGHT);
    expect(a.vx).toBe(2);                   // 对照：链 A 链接无阻尼
    expect(b.vx).toBeCloseTo(a.vx * 0.92, 10);
    expect(b.vy).toBeCloseTo(a.vy * 0.92, 10);
    expect(b.scale).toBeCloseTo(a.scale - 0.04, 10);  // spawn 缺省 fadeIn=0 → −0.04
    expect(scale0).toBe(0.5);
  });
});
