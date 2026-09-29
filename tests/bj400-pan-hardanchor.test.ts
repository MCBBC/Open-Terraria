// ★BJ400 件 2（2026-09-29）：pan 幅度畸变 6.67× 清偿（BJ397 邻接发现）。
// 定谳锚（1457 反编译直读；1458 同域对拍）：
//   原版相机装配 = PlayerFocusedScreenPosition（Main.cs:63521-63523,调用 :63541）
//   = 玩家锚 + CurrentPan【硬锚叠加】,无任何缓动滤过 pan;pan 本体动力学 =
//   UpdateCameraPan（:63634-63669）MoveTowards(targetPan, 36px/tick)（玩家受控档
//   恒速 :63652;死亡死门 :63688-63691/:63711-63714 → targetPan 恒零滑回）。
//   ⇒ 稳态偏移 = targetPan 逐像素。
//   本仓旧病：camera.x += panX 叠加在 0.15 缓动 follow 之后,缓动吃 pan 污染位
//   ——稳态偏移 = targetPan/0.15 ≈ 6.67×（BJ397 探针实测望远镜右缘稳态 2841px）。
//   修法 = ①pan 改硬锚叠加（原版语义逐像素）：follow/advanceTeleportLerp 内先分解
//   出无 pan 锚（x−panX）再缓动,施加点重组合。
// 变异证红：M3 Camera.follow 摘 pan 分解（回旧 x 缓动）→ ①稳态组红。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Camera } from '../src/render/Camera';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string): string => readFileSync(join(ROOT, p), 'utf8');

/** Game.fixedUpdate 相机段同序模拟（Game.ts :11465-11470 分支序）：
 *  teleportLerp>0 → advanceTeleportLerp,否则 follow → advancePan → 施加（无 clamp） */
function tick(cam: Camera, tx: number, ty: number, panX: number, panY: number): void {
  if (cam.teleportLerp > 0) cam.advanceTeleportLerp(tx, ty, 0);
  else cam.follow(tx, ty);
  cam.advancePan(panX, panY);
  cam.x += cam.panX;
  cam.y += cam.panY;
}

const mk = (): Camera => {
  const cam = new Camera(4200, 1200);
  cam.viewW = 1920; cam.viewH = 1080; cam.zoom = 1;
  cam.panX = 0; cam.panY = 0;
  return cam;
};

// ============================================================
// ① 稳态值域（存活 pan 值域 = targetPan 逐像素,非 6.67×）
// ============================================================
describe('BJ400-① 稳态偏移 = targetPan（硬锚叠加,Main.cs:63541 组合语义）', () => {
  it.each([
    [0.5, 1920],           // 镜配饰 0.5 档右缘
    [2 / 3, 1920],         // 1299 望远镜 2/3 档
    [0.8, 1920],           // 1254 狙击步枪带镜 0.8 档
    [2 / 3, 1366],         // 窄窗
  ])('panNum=%s viewW=%s：收敛 300 拍稳态 = targetPan（旧模型 = targetPan/0.15）', (panNum, viewW) => {
    const cam = mk();
    cam.viewW = viewW;
    const T = 100000, Ty = 100000;
    cam.x = T; cam.y = Ty;
    const targetPanX = 1 * (viewW / 1) / 2 * panNum;   // vx=1（Main.cs:63778 vector×ScaledSize/2×panFactor）
    const targetPanY = 0;
    for (let i = 0; i < 300; i++) tick(cam, T, Ty, targetPanX, targetPanY);
    const offset = cam.x - T;
    expect(offset).toBeCloseTo(targetPanX, 1);         // 新模型：稳态=targetPan 逐像素
    expect(offset).toBeLessThan(targetPanX * 1.5);     // 距 6.67× 域尚远（判别带宽）
  });

  it('望远镜右缘判别件（BJ397 实测 2841px 稳态病灶）：修复后 = targetPan ≈ 426px', () => {
    const cam = mk();
    cam.viewW = 1278; cam.viewH = 720;   // BJ397 探针视口
    const T = 50000;
    cam.x = T; cam.y = 50000;
    const targetPan = 1 * (1278 / 2) * 2 / 3;          // ≈ 426px
    for (let i = 0; i < 300; i++) tick(cam, T, 50000, targetPan, 0);
    expect(cam.x - T).toBeCloseTo(targetPan, 1);
    expect(cam.x - T).not.toBeCloseTo(2841, 0);        // 旧稳态（targetPan/0.15≈2841）已废
  });

  it('pan=0 常态（99% 帧）：follow 行为逐位不变（0.15 缓动锚回归）', () => {
    const cam = mk();
    cam.x = 0; cam.y = 0;
    cam.follow(1000, 2000);
    expect(cam.x).toBeCloseTo(150, 10);                // 1000×0.15
    expect(cam.y).toBeCloseTo(300, 10);
    tick(cam, 1000, 2000, 0, 0);
    expect(cam.x).toBeCloseTo(150 + 850 * 0.15, 10);   // 下一拍同式（与旧模型逐位同）
  });
});

// ============================================================
// ② 暂态值域（pan 动力学 = 36px/t 线性,MoveTowards 原版承载）
// ============================================================
describe('BJ400-② 暂态：pan 线性推进 36px/t（UpdateCameraPan :63652）,缓动不滤 pan', () => {
  it('开镜第 1..11 拍偏移恰 = 36×k（线性;旧模型被缓动吸走非此序列）', () => {
    const cam = mk();
    const T = 100000;
    cam.x = T; cam.y = T;
    const P = 400;                                     // 36×11=396 < 400
    for (let k = 1; k <= 11; k++) {
      tick(cam, T, T, P, 0);
      expect(cam.x - T).toBeCloseTo(36 * k, 6);        // 锚静止 ⇒ 偏移=pan 本体
    }
    tick(cam, T, T, P, 0);                             // 第 12 拍：距 4 < 36 直落
    expect(cam.x - T).toBeCloseTo(400, 6);
  });

  it('死亡锁（targetPan 恒零）：残余 424.67 以 ≤36px/t 滑回尸位,终态零残差', () => {
    const cam = mk();
    const T = 100000;
    cam.x = T + 424.67; cam.y = T;
    cam.panX = 424.67; cam.panY = 0;
    let maxStep = 0;
    for (let i = 0; i < 60; i++) {
      const prev = cam.x;
      tick(cam, T, T, 0, 0);                           // dead 门 ⇒ targetPan=0（:63711-63714）
      maxStep = Math.max(maxStep, Math.abs(cam.x - prev));
    }
    expect(cam.x).toBeCloseTo(T, 6);                   // 锁回尸位
    expect(maxStep).toBeLessThanOrEqual(36.0001);      // 不瞬移
  });
});

// ============================================================
// ③ 传送滑行窗 pan 不变性（advanceTeleportLerp 同款分解）
// ============================================================
describe('BJ400-③ 滑行窗带 pan：x−pan 收敛硬位,pan 不被 lerp 累积（旧模型 x=T+50/lerp）', () => {
  it('startTeleportLerp(0.1) 滑行 + 恒 pan 50：滑行窗与闭合后稳态恒 x−T=50（旧模型 ≈ T+500@lerp0.1）', () => {
    const cam = mk();
    const T = 100000;
    cam.x = T; cam.y = T;
    cam.startTeleportLerp(0.1, 0);
    for (let i = 0; i < 60; i++) tick(cam, T, T, 50, 0);   // 滑行窗（lerp ramp→1→吸合）
    expect(cam.x - T).toBeCloseTo(50, 1);              // 锚吸合硬位 + pan 重组合
    expect(cam.panX).toBeCloseTo(50, 6);               // pan 本体不被吸收
    for (let i = 0; i < 120; i++) tick(cam, T, T, 50, 0);  // 窗闭合回 follow 分支
    expect(cam.x - T).toBeCloseTo(50, 1);              // 分支切换零累积（旧模型此拍起 +50/拍）
  });
});

// ============================================================
// ④ 源码锚（结构锁防回潮）
// ============================================================
describe('BJ400-④ 源码锚', () => {
  it('Camera.follow/advanceTeleportLerp 内 pan 分解在位', () => {
    const camSrc = read('src/render/Camera.ts');
    const n = camSrc.split('const bx = this.x - this.panX;').length - 1;
    expect(n).toBe(2);                                 // follow + advanceTeleportLerp 双点
    expect(camSrc).toContain('★BJ400（2026-09-29）pan 硬锚分解');
  });

  it('Game 施加点 BJ400 注在位（硬锚重组合语义）', () => {
    const gameSrc = read('src/core/Game.ts');
    expect(gameSrc).toContain('this.camera.x += this.camera.panX;');   // bj103 施加序锚保持
    expect(gameSrc).toContain('★BJ400（2026-09-29）：本点=x=纯锚+CurrentPan');
  });
});
