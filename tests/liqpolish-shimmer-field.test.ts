// ★liqpolish 微光场单源位等锁（2026-09-29 微抛光刀）:
//  新核（shimmerWaves4 共享波值 → shimmerCornersFromWaves/glitter4FromWaves）与
//  旧路径（shimmerCornerColors/shimmerGlitterOpacity 各自求波值）【逐位】对照——
//  波值纯函数同参同值+lerp 端点同构 f64 常量+双线性乘加序逐项保持。
//  覆盖域:x,y∈[-8,4096] 步进含负相位/tVis 全周期 32 档/裁剪角 uL,uR,vT,vB ∈
//  {0,1/16,..,1} 网格（含未裁剪全格与表层裁剪档）。
import { describe, expect, it } from 'vitest';
import {
  shimmerCornerColorsForTest,
  shimmerFieldPolishForTest,
  shimmerGlitterOpacity,
} from '../src/render/VanillaLiquidRenderer';

const EPS = 0;   // 位等:零容差

describe('★liqpolish 微光场单源位等（新核 vs 旧路径）', () => {
  it('基色四角+glitter 四节点逐位同（波值共享不灭 sin）', () => {
    let checked = 0;
    for (let x = -8; x <= 4096; x += 97) {
      for (let y = -4; y <= 2048; y += 53) {
        for (let tVis = 0; tVis < 3600; tVis += 113) {   // 覆盖 wave/glitter/hue 全相位
          // 裁剪角网格:未裁剪全格 + 表层裁剪档 + 侧壁裁剪档
          const corners: [number, number, number, number][] = [
            [0, 1, 0, 1],          // 未裁剪
            [0, 1, 0.25, 1],       // 表层裁剪（vT=0.25）
            [0.5, 1, 0, 1],        // 左壁裁剪
            [0, 0.75, 0.125, 0.875], // 双向裁剪
          ];
          for (const [uL, uR, vT, vB] of corners) {
            const old = shimmerCornerColorsForTest(x, y, tVis, uL, uR, vT, vB);
            const nw = shimmerFieldPolishForTest(x, y, tVis, uL, uR, vT, vB);
            for (let ci = 0; ci < 4; ci++) {
              for (let ch = 0; ch < 3; ch++) {
                const a = old[ci][ch], b = nw.cols[ci][ch];
                if (a !== b) {
                  throw new Error(`cols 位差 @x=${x} y=${y} tVis=${tVis} corner=${ci} ch=${ch}: ${a} vs ${b}`);
                }
              }
            }
            for (let ni = 0; ni < 4; ni++) {
              const a = shimmerGlitterOpacity(false, x + (ni & 1), y + (ni >> 1), tVis);
              if (Math.abs(a - nw.gl[ni]) > EPS) {
                throw new Error(`gl 位差 @x=${x} y=${y} tVis=${tVis} node=${ni}: ${a} vs ${nw.gl[ni]}`);
              }
            }
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000);
  });

  it('top 门:四节点恒 0.5（调用方语义,旧函数首门同式）', () => {
    for (let x = -8; x <= 4096; x += 97) {
      for (let y = -4; y <= 2048; y += 53) {
        for (let tVis = 0; tVis < 3600; tVis += 113) {
          expect(shimmerGlitterOpacity(true, x, y, tVis)).toBe(0.5);
        }
      }
    }
  });
});
