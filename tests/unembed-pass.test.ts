// 嵌入自救 pass 回归(2026-08-24 僵尸卡地形修复;2026-08-25 弹射/贴顶双症状加固):
// 盒中心格实心(非坡/半砖) = 真嵌入 → 上移/平移脱出;正常站立/贴墙不触发。
// 2026-08-25:①延迟门(连续嵌入 ≥15 tick 才动手——瞬态嵌片靠原版物理自愈,
// 曾即时救援 = 观感"僵尸从屏幕外弹射抛入"+落到地表顶"贴顶行走像飞")
// ②限速(每 tick 至多 1 格——曾一次抬 clear×16 ≤48px + 棘轮 = 2880px/s 弹射)
// ③验证改增量条带(限速后盒下半仍嵌,整盒验证恒假自否)。
import { describe, it, expect } from 'vitest';
import { moveAndCollide, type Body } from '../src/physics/TileCollision';
import { World } from '../src/world/World';

function mkBody(x: number, y: number, w = 18, h = 42): Body {
  return { x, y, w, h, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false, collideY: false };
}

describe('unembedPass(嵌入自救)', () => {
  it('嵌在实心格中心:moveAndCollide 后被上移脱出', () => {
    const w = new World(120, 120, 42, 'unembed');
    const st = w.store;
    // 实心块 2 行(y51..52)——盒(42 高)嵌 y51..53.6,中心 y52 实心,头顶 y50 净空
    // (报告形态:下半埋上半露)
    for (let x = 50; x < 54; x++) for (let y = 51; y < 53; y++) st.setTileSilent(x, y, 1);
    const b = mkBody(51 * 16, 51 * 16, 18, 42);   // 中心 (51.6, 52.3) = 实心
    for (let t = 0; t < 30; t++) {
      b.vy = 0;
      moveAndCollide(b, w, 0, 0);
    }
    const cx = Math.floor((b.x + b.w / 2) / 16);
    const cy = Math.floor((b.y + b.h / 2) / 16);
    const i = st.idx(cx, cy);
    const stillEmbed = st.isSolid(cx, cy) && st.slope[i] === 0 && !st.half[i];
    expect(stillEmbed).toBe(false);   // 30 tick 内必脱出
  });

  it('延迟门:瞬态嵌入(<15 tick)不位移——原版物理自愈窗口', () => {
    const w = new World(120, 120, 42, 'delay');
    const st = w.store;
    for (let x = 50; x < 54; x++) for (let y = 51; y < 53; y++) st.setTileSilent(x, y, 1);
    const b = mkBody(51 * 16, 51 * 16, 18, 42);
    const y0 = b.y;
    for (let t = 0; t < 14; t++) { b.vy = 0; moveAndCollide(b, w, 0, 0); }
    expect(b.y).toBe(y0);   // 14 tick 内零位移（15 起才救援）
  });

  it('限速:深埋(盒顶上 3 格净空)逐 tick 爬出,单步 ≤16px、无 ≥32px 瞬移', () => {
    const w = new World(120, 120, 42, 'deep');
    const st = w.store;
    for (let x = 50; x < 54; x++) for (let y = 52; y < 54; y++) st.setTileSilent(x, y, 1);
    const b = mkBody(51 * 16, 52 * 16, 18, 42);   // 中心 (51.6,53.3) 实心;上方 y49..51 净空
    let maxStep = 0;
    for (let t = 0; t < 60; t++) {
      const py = b.y;
      b.vy = 0;
      moveAndCollide(b, w, 0, 0);
      maxStep = Math.max(maxStep, py - b.y);
    }
    const cx = Math.floor((b.x + b.w / 2) / 16);
    const cy = Math.floor((b.y + b.h / 2) / 16);
    expect(st.isSolid(cx, cy)).toBe(false);   // 已脱出
    expect(maxStep).toBeLessThanOrEqual(16);  // 单步 ≤1 格（曾 48px 弹射）
  });

  it('正常站立(中心在空中):不被误判不位移', () => {
    const w = new World(120, 120, 42, 'stand');
    const st = w.store;
    for (let x = 40; x < 60; x++) st.setTileSilent(x, 60, 1);   // 地板
    const b = mkBody(50 * 16, 60 * 16 - 42);
    const x0 = b.x, y0 = b.y;
    for (let t = 0; t < 20; t++) { b.vy = 0.3; moveAndCollide(b, w, 0, 0.3); }
    expect(b.x).toBe(x0);
    expect(b.y).toBe(y0);          // 站在地板上不动
    expect(b.onGround).toBe(true);
  });

  it('贴墙站立(中心在空中,盒缘触墙):不被误推', () => {
    const w = new World(120, 120, 42, 'wall');
    const st = w.store;
    for (let y = 50; y < 60; y++) { st.setTileSilent(52, y, 1); st.setTileSilent(40, y, 1); }
    for (let x = 40; x < 52; x++) st.setTileSilent(x, 60, 1);
    const b = mkBody(50 * 16 + 14, 60 * 16 - 42, 18, 42);   // 右缘贴 (52) 墙
    const x0 = b.x;
    for (let t = 0; t < 20; t++) { b.vx = 1; b.vy = 0; moveAndCollide(b, w, 1, 0); b.vx = 1; }
    expect(b.x).toBe(x0);          // 贴墙顶住不穿不弹
    const cx = Math.floor((b.x + b.w / 2) / 16);
    expect(st.isSolid(cx, Math.floor((b.y + b.h / 2) / 16))).toBe(false);
  });

  it('StepDown 门:跳起首 tick(vy<0)不吸附——曾 wasGround 宽门把起跳拽下 16px', () => {
    const w = new World(120, 120, 42, 'jumpdn');
    const st = w.store;
    for (let x = 40; x < 60; x++) { st.setTileSilent(x, 60, 1); st.setTileSilent(x, 58, 1); }
    // 盒站 60 顶,头顶上方 y58 有盖(制造 StepDown 候选落面:58 顶=928,脚 960-42=918,gap=10∈(7,17))
    const b = mkBody(50 * 16, 60 * 16 - 42, 18, 42);
    b.stepUp = true; b.onGround = true;
    const y0 = b.y;
    b.vy = -8;                                   // AI 起跳首 tick
    moveAndCollide(b, w, 0, -8);
    expect(b.y).toBeLessThanOrEqual(y0);         // 只许上不许先下拽
    expect(b.y).toBeGreaterThan(y0 - 17);        // 且未被 StepDown 拽下(若误吸附 y0+10)
  });

  // ★2026-09-02 向导电梯定谳（用户实报 Starter World：向导 cy 6055↔6070 永久
  //   震荡,behavior-log 326 事件+探针 _guidewedge4/5 复现）：悬空下落中仅顶行
  //   刷实心墙角(左缘 1px 嵌墙、中心格干净) = 瞬态假嵌入——不得抬升,交还原版
  //   物理继续下沉。旧逻辑抬升 +16px ↔ 重力拉回 = 10t 极限环电梯。
  it('悬空刷角假嵌入:顶行擦墙角下落不被抬升,自由坠落穿过', () => {
    const w = new World(120, 120, 42, 'airbrush');
    const st = w.store;
    st.setTileSilent(51, 60, 1);                 // 单块实心墙角(仿 (3180,378) 花岗岩)
    const b = mkBody(51 * 16 + 15, 60 * 16, 18, 40);  // 向导 18×40:左缘 1px 入 51 列,顶行=60
    b.vy = 0.3;
    for (let t = 0; t < 15; t++) {
      b.vy = Math.min(b.vy + 0.3, 10);
      moveAndCollide(b, w, 0, b.vy);
    }
    expect(b.y).toBeGreaterThanOrEqual(60 * 16 + 32);  // 已坠过墙角 ≥2 格(旧电梯环困在 960..977)
    expect(b.onGround).toBe(false);                    // 悬空态不被 16px 抬升支接住
  });
});
