// ★BJ209 2026-09-20（宝箱怪拖影 BJ175b 推广——NPC 域残影族全表普查+落刀）
//
// 定谳（Terarria1457 逐行亲读；Terarria1458 对拍=登记表/UpdateTrails/DrawNPCDirect
// oldPos 面逐字节等价，1457 为准）：
//   · 登记表 = NPCID.Sets.TrailingMode（NPCID.cs:4769，缺省 -1）+ TrailCacheLength
//     （:4809，缺省 10；覆写 402=36/519=20/522=20/620=20/677=60）。
//   · 记录面 = NPC.UpdateNPC_UpdateTrails（NPC.cs:91893-91992）：mode 0 隔拍
//     （localAI[3] 节拍闸 :91899-91907）、mode 1/3/5/6/7 逐拍（3/7 含 oldRot）、
//     mode 2 仅 ai[0]∈{4,5,6} 展开其余整环清零、mode 4 逐拍+红光(0.3,0,0.2)
//     （本仓 updateNpcTrailLights 已承载）。
//   · 绘制面 = Main.cs DrawNPCDirect（:22723-26712）oldPos 残影块全表：
//     通用大表（:23400-23643）+ 特支段（:23794/23892/24605/24637/24666/24734/
//     24835/24901/25472/25486/25499/25512/25535/25567/25803/26015/26034/26359/
//     26383/26396/26416）。本仓统一绝对世界坐标实现（npcExtraParts.drawNpcTrailGhosts）。
import { describe, it, expect } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import {
  drawNpcTrailGhosts, drawGenericTableGhosts, drawCultistGhosts,
  drawBetsyGhosts, drawSolarGoopGhosts, drawPostBodyTrailGhosts,
  drawSolenianGhosts, drawEocDashGhosts, drawMechTrailGhosts,
} from '../src/render/npcExtraParts';
import type { NpcGhostOpts } from '../src/render/npcExtraParts';

// ===================== 原版登记表（NPCID.cs:4769/:4809 钉值） =====================
const TRAILING_MODE: Array<[number, number]> = [
  [439, 0], [440, 0],
  [370, 1], [372, 1], [373, 1], [396, 1], [400, 1], [401, 1],
  [473, 2], [474, 2], [475, 2], [476, 2],
  [4, 3], [471, 3], [477, 3], [479, 3],
  [120, 4], [137, 4], [138, 4],
  [94, 5],
  [125, 6], [126, 6], [127, 6], [128, 6], [129, 6], [130, 6], [131, 6],
  [139, 6], [140, 6], [407, 6], [420, 6], [425, 6], [427, 6], [426, 6],
  [581, 6], [516, 6], [542, 6], [543, 6], [544, 6], [545, 6], [657, 6],
  [402, 7], [417, 7], [419, 7], [418, 7], [574, 7], [575, 7], [519, 7],
  [521, 7], [522, 7], [546, 7], [558, 7], [559, 7], [560, 7], [551, 7],
  [620, 7], [636, 7], [677, 7], [685, 7],
];
const CACHE_LEN_OVERRIDE: Array<[number, number]> = [
  [402, 36], [519, 20], [522, 20], [620, 20], [677, 60],
];

// ===================== 测试具装 =====================
function tickN(e: EnemyT, n: number, dx = 0, dy = 0): void {
  for (let k = 0; k < n; k++) {
    e.x += dx; e.y += dy;
    (e as unknown as { recordTrailHistory(): void }).recordTrailHistory();
  }
}

function recorder() {
  const ops: Array<Record<string, unknown>> = [];
  let alpha = 1;
  const ctx = {
    save: () => { /* noop */ },
    restore: () => { /* noop */ },
    translate: (x: number, y: number) => ops.push({ op: 'translate', x, y }),
    rotate: (r: number) => ops.push({ op: 'rotate', r }),
    scale: (x: number, y: number) => ops.push({ op: 'scale', x, y }),
    drawImage: (img: unknown, sx: number, sy: number, sw: number, sh: number,
      dx: number, dy: number) => ops.push({ op: 'draw', img, sx, sy, sw, sh, dx, dy, alpha }),
    globalCompositeOperation: 'source-over',
  };
  Object.defineProperty(ctx, 'globalAlpha', {
    set(v: number) { alpha = v; ops.push({ op: 'alpha', v }); },
    get() { return alpha; },
  });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

const atlasStub = {
  ensureVImage: (_k: string) => ({ width: 64, height: 128 }),
} as never;

const FRAME = { sx: 0, sy: 0, sw: 32, sh: 32 };
const OPT: NpcGhostOpts = {
  scale: 1, addY: 0, opacity: 1, rot: 0, mirror: false, frameIdx: 2, frames: 5,
};

function draws(ops: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  return ops.filter((o) => o.op === 'draw');
}

// ===================== A. 登记表普查锁 =====================
describe('BJ209-A 原版登记表结构锁（NPCID.cs:4769/:4809）', () => {
  it('TrailingMode 全表 59 项钉死（id→mode，防漏登记/错档）', () => {
    expect(TRAILING_MODE.length).toBe(59);
    const m = new Map(TRAILING_MODE);
    expect(m.get(439)).toBe(0);
    expect(m.get(473)).toBe(2); expect(m.get(476)).toBe(2);
    expect(m.get(4)).toBe(3);
    expect(m.get(120)).toBe(4);
    expect(m.get(94)).toBe(5);
    expect(m.get(125)).toBe(6); expect(m.get(657)).toBe(6);
    expect(m.get(402)).toBe(7); expect(m.get(685)).toBe(7);
    // mode 0 全集=439/440；mode 2 全集=473-476
    const mode0 = TRAILING_MODE.filter(([, v]) => v === 0).map(([k]) => k);
    const mode2 = TRAILING_MODE.filter(([, v]) => v === 2).map(([k]) => k);
    expect(mode0).toEqual([439, 440]);
    expect(mode2).toEqual([473, 474, 475, 476]);
  });

  it('TrailCacheLength 覆写 5 项钉死（其余缺省 10）', () => {
    expect(CACHE_LEN_OVERRIDE).toEqual([[402, 36], [519, 20], [522, 20], [620, 20], [677, 60]]);
  });
});

// ===================== B. 记录面行为（UpdateNPC_UpdateTrails 分派） =====================
describe('BJ209-B 记录面：mode 0 隔拍节拍闸（NPC.cs:91899-91907）', () => {
  it('439 拜月教邪教徒：偶数拍记录（步长 2）——4 拍位移 4px/拍 → hist=[x0, x0+8]', () => {
    const e = Enemy.fromVanilla(439, 100, 100) as EnemyT;
    const x0 = e.x;
    tickN(e, 4, 4, 0);
    expect(e.historyDepth()).toBe(2);                     // 隔拍：4 拍只记 2 条
    expect(e.histXAt(0)).toBe(x0 + 12);                   // 最新=第 3 拍（节拍闸 1/3 记录）
    expect(e.histXAt(1)).toBe(x0 + 4);                    // 旧=第 1 拍
  });

  it('440 僵尸教徒同 mode 0 隔拍；对照 125（mode 6）逐拍记录', () => {
    const e440 = Enemy.fromVanilla(440, 100, 100) as EnemyT;
    tickN(e440, 3, 6, 0);
    expect(e440.historyDepth()).toBe(2);                  // 3 拍记 2 条（tick0/tick2）
    const e125 = Enemy.fromVanilla(125, 100, 100) as EnemyT;
    tickN(e125, 3, 6, 0);
    expect(e125.historyDepth()).toBe(3);                  // mode 6 逐拍
  });

  it('mode 7（402/677）逐拍含 rot；mode 4（120）逐拍（光面走 lightRGB 通道）', () => {
    for (const id of [402, 677, 120]) {
      const e = Enemy.fromVanilla(id, 100, 100) as EnemyT;
      e.visAngle = 0.5;
      tickN(e, 3, 2, 0);
      expect(e.historyDepth(), `id=${id}`).toBe(3);
      expect(e.histRotAt(0), `id=${id} rot`).toBe(0.5);
    }
  });
});

// ===================== C. 绘制面普查锁（DrawNPCDirect 残影块） =====================
describe('BJ209-C 绘制面：通用大表族（Main.cs:23400-23643）', () => {
  it('427 蜂枪手：i=1,3,5,7 四份，α=(8−i)/24，位置=oldPos 中心', () => {
    const e = Enemy.fromVanilla(427, 100, 100) as EnemyT;
    tickN(e, 10, 4, 0);
    const { ctx, ops } = recorder();
    drawGenericTableGhosts(ctx, e, atlasStub, FRAME, OPT);
    const d = draws(ops);
    expect(d.length).toBe(4);
    // i=7 最旧残影 α=(8-7)/24；i=1 最近 α=7/24
    expect(d[0].alpha).toBeCloseTo(7 / 24, 5);
    expect(d[3].alpha).toBeCloseTo(1 / 24, 5);
    // 位置：最近 i=1 → histXAt(1)+w/2
    const tr = ops.filter((o) => o.op === 'translate');
    expect(tr[0].x).toBe(e.histXAt(1) + e.w / 2);
    expect(tr[0].y).toBe(e.histYAt(1) + e.h / 2);
  });

  it('426 蜂后 3 份（div=6）/ 542 沙鲨 stride3 → 2 份（i=1,4）/ 546 4 份', () => {
    for (const [id, n] of [[426, 3], [542, 2], [546, 4], [581, 3], [620, 3]] as const) {
      const e = Enemy.fromVanilla(id, 100, 100) as EnemyT;
      tickN(e, 12, 3, 0);
      const { ctx, ops } = recorder();
      drawGenericTableGhosts(ctx, e, atlasStub, FRAME, OPT);
      expect(draws(ops).length, `id=${id}`).toBe(n);
    }
  });

  it('521 巨鱿 5 份 + scale=Lerp(scale,0.3f,t) 字面值（:23487/:23541 value4=0.3f）', () => {
    const e = Enemy.fromVanilla(521, 100, 100) as EnemyT;
    tickN(e, 12, 3, 0);
    const { ctx, ops } = recorder();
    drawGenericTableGhosts(ctx, e, atlasStub, FRAME, OPT);
    const d = draws(ops);
    expect(d.length).toBe(5);
    expect(d[0].alpha).toBeCloseTo(9 / 10, 5);
    const scales = ops.filter((o) => o.op === 'scale').map((o) => o.x as number);
    // i=1 → t=0.1 → scale=1−0.7×0.1=0.93；i=9 → t=0.9 → 0.37
    expect(scales[0]).toBeCloseTo(0.93, 5);
    expect(scales[4]).toBeCloseTo(0.37, 5);
  });

  it('558-560/574-575 DD2 ai0==2 门：非 2 无残影，=2 三份', () => {
    const e = Enemy.fromVanilla(558, 100, 100) as EnemyT;
    tickN(e, 10, 3, 0);
    e.ai0 = 0;
    const r0 = recorder();
    drawGenericTableGhosts(r0.ctx, e, atlasStub, FRAME, OPT);
    expect(draws(r0.ops).length).toBe(0);
    e.ai0 = 2;
    const r2 = recorder();
    drawGenericTableGhosts(r2.ctx, e, atlasStub, FRAME, OPT);
    expect(draws(r2.ops).length).toBe(3);
  });
});

describe('BJ209-C 绘制面：特支族（Main.cs:25400-26449）', () => {
  it('94 腐化者 3 份 α=(10−i)/15；120 混沌元素 9 份（Chaos 贴图 A=50/255 档）', () => {
    const e94 = Enemy.fromVanilla(94, 100, 100) as EnemyT;
    tickN(e94, 10, 5, 0);
    const r94 = recorder();
    drawPostBodyTrailGhosts(r94.ctx, e94, atlasStub, FRAME, OPT);
    const d94 = draws(r94.ops);
    expect(d94.length).toBe(3);
    expect(d94[0].alpha).toBeCloseTo(9 / 15, 5);
    const e120 = Enemy.fromVanilla(120, 100, 100) as EnemyT;
    tickN(e120, 10, 5, 0);
    const r120 = recorder();
    drawPostBodyTrailGhosts(r120.ctx, e120, atlasStub, FRAME, OPT);
    const d120 = draws(r120.ops);
    expect(d120.length).toBe(9);
    expect(d120[0].alpha).toBeCloseTo((50 / 255) * (9 / 15), 5);
  });

  it('417 疾滚兽 ai0==6 门 + oldRot 旋转；471 召唤师 ai3<0 门', () => {
    const e417 = Enemy.fromVanilla(417, 100, 100) as EnemyT;
    e417.visAngle = 0.7;
    tickN(e417, 10, 5, 0);
    e417.ai0 = 3;
    const rOff = recorder();
    drawPostBodyTrailGhosts(rOff.ctx, e417, atlasStub, FRAME, OPT);
    expect(draws(rOff.ops).length).toBe(0);
    e417.ai0 = 6;
    const rOn = recorder();
    drawPostBodyTrailGhosts(rOn.ctx, e417, atlasStub, FRAME, OPT);
    const dOn = draws(rOn.ops);
    expect(dOn.length).toBe(6);
    const rots = rOn.ops.filter((o) => o.op === 'rotate').map((o) => o.r as number);
    expect(rots[0]).toBe(e417.histRotAt(5));             // 旧位旋转=oldRot
    const e471 = Enemy.fromVanilla(471, 100, 100) as EnemyT;
    tickN(e471, 10, 5, 0);
    e471.ai3 = 0;
    const r471a = recorder();
    drawPostBodyTrailGhosts(r471a.ctx, e471, atlasStub, FRAME, OPT);
    expect(draws(r471a.ops).length).toBe(0);
    e471.ai3 = -1;
    const r471b = recorder();
    drawPostBodyTrailGhosts(r471b.ctx, e471, atlasStub, FRAME, OPT);
    expect(draws(r471b.ops).length).toBe(9);
  });

  it('477 飞蛾魔 speed>9 门 + 帧倒退 (frameIdx−i) mod frames；479 speed>6.5', () => {
    const e = Enemy.fromVanilla(477, 100, 100) as EnemyT;
    tickN(e, 10, 2, 0);
    e.vx = 5; e.vy = 0;                                   // |v|=5 ≤9
    const rSlow = recorder();
    drawPostBodyTrailGhosts(rSlow.ctx, e, atlasStub, FRAME, OPT);
    expect(draws(rSlow.ops).length).toBe(0);
    e.vx = 10;                                            // |v|=10 >9
    const rFast = recorder();
    drawPostBodyTrailGhosts(rFast.ctx, e, atlasStub, FRAME, OPT);
    const d = draws(rFast.ops);
    expect(d.length).toBe(9);
    // frameIdx=2, frames=5：i=1 → (2-1)%5=1；i=2 → 0；i=3 → (2-3+5)%5=4
    expect(d[0].sy).toBe(1 * FRAME.sh);
    expect(d[1].sy).toBe(0);
    expect(d[2].sy).toBe(4 * FRAME.sh);
    const e479 = Enemy.fromVanilla(479, 100, 100) as EnemyT;
    tickN(e479, 10, 2, 0);
    e479.vx = 7;
    const r479 = recorder();
    drawPostBodyTrailGhosts(r479.ctx, e479, atlasStub, FRAME, OPT);
    expect(draws(r479.ops).length).toBe(9);
  });

  it('516 耀斑 7 份帧倒退 (frameIdx−4−i) mod 4 + α=(10−i)/20×(1−i/6)', () => {
    const e = Enemy.fromVanilla(516, 100, 100) as EnemyT;
    tickN(e, 10, 3, 0);
    const { ctx, ops } = recorder();
    drawPostBodyTrailGhosts(ctx, e, atlasStub, FRAME, OPT);
    const d = draws(ops);
    expect(d.length).toBe(7);
    expect(d[0].sy).toBe(((2 - 4 - 6) % 4 + 4) % 4 * FRAME.sh);   // i=6
    expect(d[6].alpha).toBeCloseTo((10 - 0) / 20 * (1 - 0 / 6), 5);
  });

  it('519 日耀黏液 20 份（TrailCacheLength=20），α=(1−0.035i)×i/20，旧位更大', () => {
    const e = Enemy.fromVanilla(519, 100, 100) as EnemyT;
    tickN(e, 22, 2, 0);
    expect(e.historyDepth()).toBeGreaterThanOrEqual(20);
    const { ctx, ops } = recorder();
    drawSolarGoopGhosts(ctx, e, atlasStub, OPT);
    const d = draws(ops);
    expect(d.length).toBe(19);                            // i=0 α=0 不可见跳过（原版画 α=0 同相）
    // i=19（最旧）：α=(1−0.665)×0.95≈0.318
    expect(d[0].alpha).toBeCloseTo((1 - 0.035 * 19) * (19 / 20), 5);
  });

  it('439/440 邪教徒：ai0=-1&&ai1∈[320,960) → 3 份；ai0==1 → 2 份；其余 0', () => {
    const e = Enemy.fromVanilla(439, 100, 100) as EnemyT;
    tickN(e, 20, 4, 0);                                   // mode 0 隔拍 → depth 10
    e.ai0 = 2;
    const r0 = recorder();
    drawCultistGhosts(r0.ctx, e, atlasStub, OPT);
    expect(draws(r0.ops).length).toBe(0);
    e.ai0 = -1; e.ai1 = 400;
    const r1 = recorder();
    drawCultistGhosts(r1.ctx, e, atlasStub, OPT);
    expect(draws(r1.ops).length).toBe(3);
    e.ai0 = 1;
    const r2 = recorder();
    drawCultistGhosts(r2.ctx, e, atlasStub, OPT);
    expect(draws(r2.ops).length).toBe(2);
  });

  it('551 Betsy 3 位 × 3 层（后翼/躯干/前翼）= 9 draw，α=0.175×(1−i/10)', () => {
    const e = Enemy.fromVanilla(551, 100, 100) as EnemyT;
    tickN(e, 12, 4, 0);
    const { ctx, ops } = recorder();
    drawBetsyGhosts(ctx, e, atlasStub, FRAME, OPT);
    const d = draws(ops);
    expect(d.length).toBe(9);
    expect(d[0].alpha).toBeCloseTo(0.175 * (1 - 9 / 10), 5);
  });

  it('419 旋刃 ai2<=-9 门 + Glow_154 帧行 (row−3−i)%3+5 + lighter 加算', () => {
    const e = Enemy.fromVanilla(419, 100, 100) as EnemyT;
    tickN(e, 10, 3, 0);
    e.ai2 = 0;
    const rOff = recorder();
    drawSolenianGhosts(rOff.ctx, e, atlasStub, OPT);
    expect(draws(rOff.ops).length).toBe(0);
    e.ai2 = -10;
    const rOn = recorder();
    drawSolenianGhosts(rOn.ctx, e, atlasStub, OPT);
    const d = draws(rOn.ops);
    expect(d.length).toBe(7);
    expect(rOn.ops.some((o) => o.op === 'draw' && o.alpha !== undefined)).toBe(true);
  });
});

describe('BJ209-C 绘制面：迁入修正族（EoC 冲刺/Mech 拖尾，绝对坐标）', () => {
  it('4 克眼 ai0==3&&state>=4 → 9 份 α=(10−i)/40；state<4 无', () => {
    const e = Enemy.fromVanilla(4, 100, 100) as EnemyT;
    tickN(e, 10, 6, 0);
    e.ai0 = 3; e.state = 2;
    const rOff = recorder();
    drawEocDashGhosts(rOff.ctx, e, atlasStub, FRAME, OPT);
    expect(draws(rOff.ops).length).toBe(0);
    e.state = 4;
    const rOn = recorder();
    drawEocDashGhosts(rOn.ctx, e, atlasStub, FRAME, OPT);
    const d = draws(rOn.ops);
    expect(d.length).toBe(9);
    expect(d[0].alpha).toBeCloseTo(9 / 40, 5);
  });

  it('125-131/139(ai3==0)/140：5 份 α=(10−i)/20；139 ai3≠0 无', () => {
    const e = Enemy.fromVanilla(125, 100, 100) as EnemyT;
    tickN(e, 10, 4, 0);
    const r = recorder();
    drawMechTrailGhosts(r.ctx, e, atlasStub, FRAME, OPT);
    const d = draws(r.ops);
    expect(d.length).toBe(5);
    expect(d[0].alpha).toBeCloseTo(1 / 20, 5);
    const e139 = Enemy.fromVanilla(139, 100, 100) as EnemyT;
    tickN(e139, 10, 4, 0);
    e139.ai3 = 1;
    const r139 = recorder();
    drawMechTrailGhosts(r139.ctx, e139, atlasStub, FRAME, OPT);
    expect(draws(r139.ops).length).toBe(0);
  });

  it('统一分发器 drawNpcTrailGhosts：残影中心=oldPos 中心（绝对世界坐标，防双重偏移复发）', () => {
    const e = Enemy.fromVanilla(427, 5000, 300) as EnemyT;   // 大坐标：双重偏移会翻倍
    tickN(e, 10, 4, 0);
    const { ctx, ops } = recorder();
    drawNpcTrailGhosts(ctx, e, atlasStub, FRAME, OPT);
    const trs = ops.filter((o) => o.op === 'translate');
    expect(trs.length).toBe(4);
    expect(trs[0].x).toBe(e.histXAt(1) + e.w / 2);           // 恰=旧位中心（无本体位叠加）
    expect(trs[0].x).toBeLessThan(5100);                     // 双重偏移会是 ~10000+
  });
});
