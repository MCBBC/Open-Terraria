// SW-AR1 2026-09-05 回归：SwitchTiles 板触发盒 = Projectile.GetCollisionParams 特例盒逐 id
//（1457 Projectile.cs:19982-20137,1458 同文 diff=0;盒左上 = position + Size/2 − (colW,colH)×resizeAnchor :19977-19978）
import { describe, it, expect } from 'vitest';
import { switchTilesBoxParams as P, projectileSwitchBox } from '../src/core/Game';

const full = (w: number, h: number) => ({ ax: 0.5, ay: 0.5, cw: w, ch: h });
describe('SW-AR1: GetCollisionParams 特例盒逐 id', () => {
  it('独立 if（aiStyle60/1097）+ else-if 链定值档', () => {
    expect(P(358, 60, 18, 18, 0, 1)).toEqual(full(1, 1));                          // aiStyle 60 :19987
    expect(P(1097, 1, 10, 10, 0, 1)).toEqual(full(2, 2));                          // :19991
    expect(P(1023, 1, 26, 26, 0, 1)).toEqual(full(14, 14));
    expect(P(969, 177, 56, 64, 0, 1)).toEqual(full(18, 32));
    expect(P(3, 2, 22, 22, 0, 1)).toEqual(full(6, 6));                             // {250,267,297,323,3,711}
    expect(P(902, 3, 20, 20, 0, 1)).toEqual(full(8, 8));                           // {582,634,635,902}
    expect(P(106, 3, 32, 32, 0, 1)).toEqual(full(10, 10));                         // 10×10 族
    expect(P(1059, 3, 38, 38, 0, 1)).toEqual(full(10, 10));                        // IsAPhaseblade（ProjectileID.cs:33）
    expect(P(261, 14, 32, 34, 0, 1)).toEqual(full(26, 26));
    expect(P(514, 93, 10, 10, 0, 1)).toEqual(full(4, 4));                          // ≡{1024}/{304}/aiStyle9/{931,1039}
    expect(P(617, 118, 32, 32, 0, 1.3)).toEqual(full(26, 26));                     // (int)(20f*scale) 向零截断
  });
  it('整盒缩窄档/定值宽高/ai[0] 门/左上偏移（anchor .75 与 (0.5,1)）', () => {
    expect(P(28, 16, 22, 22, 0, 1)).toEqual(full(14, 14));                         // 炸弹 w−8/h−8（aiStyle29/49 同支）
    expect(P(247, 15, 34, 34, 0, 1)).toEqual(full(22, 22));                        // w−12（aiStyle27 同支）
    expect(P(33, 3, 38, 38, 0, 1)).toEqual(full(18, 18));                          // w−20
    expect(P(254, 47, 38, 38, 0, 1)).toEqual(full(2, 2));                          // aiStyle18∥254 → w−36
    expect(P(771, 160, 4, 4, 0, 1)).toEqual({ ax: 0.75, ay: 0.75, cw: 4, ch: 34 });   // 定高34（822/823/843/845/846/852）
    expect(P(850, 0, 40, 40, 0, 1)).toEqual({ ax: 0.75, ay: 0.75, cw: 40, ch: 58 });  // 定高58（824/839/840/853）
    expect(P(838, 0, 40, 40, 0, 1)).toEqual({ ax: 0.75, ay: 0.75, cw: 40, ch: 38 });  // 定高38（826/830）
    expect(P(844, 0, 40, 40, 0, 1)).toEqual({ ax: 0.75, ay: 0.75, cw: 40, ch: 22 });  // 定高22（827/828/829）
    expect(P(308, 53, 80, 74, 0, 1)).toEqual(full(26, 74));                        // 定宽26×h;{663,665,667,677,678,679,691,692,693}=16×h
    expect(P(663, 130, 30, 54, 0, 1)).toEqual(full(16, 54));
    expect(P(688, 137, 16, 16, 0, 1)).toEqual({ ax: 0.5, ay: 1, cw: 16, ch: 16 }); // 锚(0.5,1) 盒底=垂直中心
    expect(P(533, 66, 20, 20, 6, 1)).toEqual(full(26, 26));                        // ai[0]≥6 外扩
    expect(P(533, 66, 20, 20, 5, 1)).toEqual(full(20, 20));                        // 未达门=缺省
    expect(P(755, 156, 10, 10, 0, 1)).toEqual(full(16, 16));                       // ai[0]≥0 恒真
    expect(P(7, 1, 8, 8, 0, 1)).toEqual(full(8, 8));                               // 未列弹=整盒
    expect(projectileSwitchBox({ x: 132, y: 328, w: 8, h: 8, id: 7 }, 3))          // 板触发盒左上=中心锚缩 6×6
      .toEqual({ x: 133, y: 329, w: 6, h: 6, id: 7 });
  });
});
