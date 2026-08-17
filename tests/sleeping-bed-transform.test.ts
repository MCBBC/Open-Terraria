// 躺床变换回归(2026-08-17 "躺床上的效果并不对"修复):
// 断言 drawPlayer 的睡床变换(镜像 scale(facing,1) 在先 + sleepingTransformOps)
// 与原版逐点等价:fullRotation = π/2·(−direction) 绕 Size/2、Position += 床型偏移
// (PlayerSleepingHelper.cs:66-83 + PlayerDrawSet BoringSetup:336-356 +
//  TransformDrawData:4199-4230)。
// 床贴图(Tiles_79):变体A(frameX<72)枕在右 → 原版 dir=−1 头朝右;
// 变体B(frameX≥72)枕在左 → dir=+1 头朝左。旧实现镜像内 rotate(π/2·(−facing))
// 视觉恒 −π/2 → 变体A头落在脚尾。
import { describe, it, expect } from 'vitest';
import { sleepingTransformOps } from '../src/render/Renderer';

/** 2D 仿射矩阵 [a,b,c,d,e,f]: x'=a·x+c·y+e; y'=b·x+d·y+f */
type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: M, x: number, y: number): [number, number] =>
  [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
const T = (x: number, y: number): M => [1, 0, 0, 1, x, y];
const S = (x: number, y: number): M => [x, 0, 0, y, 0, 0];
const R = (t: number): M => [Math.cos(t), Math.sin(t), -Math.sin(t), Math.cos(t), 0, 0];

const W = 20, H = 42;   // 玩家盒(Player.cs:55083-55084)

/** drawPlayer 变换栈:translate(脚底中心) · scale(facing,1) · sleepingTransformOps */
function ours(facing: number, bo: readonly [number, number]): M {
  const feet = T(1000, 2000);   // 脚底中心世界位(任意)
  let m = mul(feet, S(facing, 1));
  const p = { facing, gravDir: 1, h: H };
  for (const op of sleepingTransformOps(p, bo)) {
    m = op[0] === 't' ? mul(m, T(op[1], op[2])) : mul(m, R(op[1]));
  }
  return m;
}

/** 原版参照:posOffset 平移后绕 Size/2 旋转 α=π/2·(−direction)。
 *  q = 世界侧盒内坐标(顶左原点)——层的镜像已由本仓 l=facing·(q.x−w/2) 的换算承载,
 *  此处不再二次镜像(曾在此多镜像一次 → 肩部采样点假阳性) */
function vanilla(direction: number, bo: readonly [number, number], q: [number, number]): [number, number] {
  const origin = [1000 - W / 2, 2000 - H];   // 玩家盒左上(脚底中心反推)
  const off = [bo[0] * direction, bo[1]];    // posOffset × Directions(gravDir=1)
  const center = [origin[0] + off[0] + W / 2, origin[1] + off[1] + H / 2];
  const a = Math.PI / 2 * -direction;
  const dx = q[0] - W / 2, dy = q[1] - H / 2;
  return [center[0] + dx * Math.cos(a) - dy * Math.sin(a), center[1] + dx * Math.sin(a) + dy * Math.cos(a)];
}

describe('睡床躺平变换(PlayerSleepingHelper 1:1)', () => {
  // 采样点(盒内坐标,顶左原点):头/脚/心/四肢
  const SAMPLES: Array<[string, [number, number]]> = [
    ['头', [W / 2, 3]],
    ['脚', [W / 2, H - 3]],
    ['盒心', [W / 2, H / 2]],
    ['肩左', [2, 8]],
    ['肩右', [W - 2, 8]],
  ];

  for (const facing of [-1, 1] as const) {
    it(`facing=${facing}: 全身采样点与原版 R(${facing === -1 ? '+π/2' : '−π/2'}) 逐点等价(±0.01px)`, () => {
      for (const bo of [[-9, 1], [-11, -3], [-7, 5]] as const) {
        const m = ours(facing, bo);
        for (const [name, q] of SAMPLES) {
          // 本仓局部坐标(脚底心原点,镜像) = S·(q − (w/2,h))
          const lx = facing * (q[0] - W / 2), ly = q[1] - H;
          const got = apply(m, lx, ly);
          const want = vanilla(facing, bo, q);
          expect(Math.abs(got[0] - want[0]), `${name}@bo=${bo} x`).toBeLessThan(0.01);
          expect(Math.abs(got[1] - want[1]), `${name}@bo=${bo} y`).toBeLessThan(0.01);
        }
      }
    });
  }

  it('头端朝枕头:变体A(facing=−1)头在脚右侧(枕右)、变体B(facing=+1)头在脚左侧(枕左)', () => {
    const bo: readonly [number, number] = [-9, 1];
    for (const facing of [-1, 1] as const) {
      const m = ours(facing, bo);
      const head = apply(m, 0, -H + 3);      // 头(局部)
      const feet = apply(m, 0, -3);          // 脚(局部)
      const side = Math.sign(head[0] - feet[0]);
      expect(side).toBe(facing === -1 ? 1 : -1);
    }
  });

  it('旋转角恒 −π/2(镜像合成 S·R(θ)=R(α)·S 的化简;旧 π/2·(−facing) 必挂)', () => {
    for (const facing of [-1, 1] as const) {
      const ops = sleepingTransformOps({ facing, gravDir: 1, h: H }, [-9, 1]);
      expect(ops.find((o) => o[0] === 'r')?.[1]).toBe(-Math.PI / 2);
    }
  });
});
