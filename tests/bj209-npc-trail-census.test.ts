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
//     26383/26396/26416）。本仓统一绝对世界坐标实现（npcExtraParts）。
//   ★BJ237（2026-09-21）z 序归位：原版残影分两层——前绘组（通用大表/551/439-440/
//     519/94/125-131,139,140/417/419/516）画在【本体之下】、后绘组（120,137,138/
//     4/471/477,479）画在【本体之上】；BJ209「特支族=本体之上」为一刀切误判（把
//     默认路径前绘组 :25472-25586 归入后绘）。双挂点拆分+绘制序锁见文件尾 BJ237 块。
import { describe, it, expect, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import type { Enemy as EnemyT } from '../src/entities/Enemy';
import { Renderer } from '../src/render/Renderer';
import { pinGameTimeTicks } from '../src/core/GameTime';   // ★BJ330：GTW 钟源单源化后相位钉钟走 GameTime（performance spy 退役保留兼容）
import {
  drawNpcTrailGhosts, drawNpcTrailGhostsOverBody, drawGenericTableGhosts,
  drawCultistGhosts, drawBetsyGhosts, drawSolarGoopGhosts,
  drawPostBodyTrailGhosts, drawPreBodySpecialGhosts,
  drawSolenianGhosts, drawEocDashGhosts, drawMechTrailGhosts,
  NPC_TRAIL_GHOST_IDS,
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

describe('BJ209-C 绘制面：特支族（前绘组 Main.cs:25472-25586 / 后绘组 :26015-26441）', () => {
  it('94 腐化者 3 份 α=(10−i)/15；120 混沌元素 9 份（Chaos 贴图 A=50/255 档）', () => {
    const e94 = Enemy.fromVanilla(94, 100, 100) as EnemyT;
    tickN(e94, 10, 5, 0);
    const r94 = recorder();
    drawPreBodySpecialGhosts(r94.ctx, e94, atlasStub, FRAME, OPT);
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
    drawPreBodySpecialGhosts(rOff.ctx, e417, atlasStub, FRAME, OPT);
    expect(draws(rOff.ops).length).toBe(0);
    e417.ai0 = 6;
    const rOn = recorder();
    drawPreBodySpecialGhosts(rOn.ctx, e417, atlasStub, FRAME, OPT);
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
    drawPreBodySpecialGhosts(ctx, e, atlasStub, FRAME, OPT);
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

// ===================== ★BJ237 z 序归位锁（2026-09-21，BJ209 登记债清偿） =====================
// 定谳（Terarria1457 DrawNPCDirect 逐块亲读；1458 对拍逐锚同号=零变更）——原版残影
// 分两层，BJ209「特支族=本体之上」为一刀切误判：
//   【本体之下】通用大表 :23627 残影→:23645 环→:23660 本体；551 :23845→本体 :23859；
//   439/440 case :24901→本体 :24933；默认路径前绘组 94 :25472 / 125-131,139,140
//   :25486 / 417 :25499 / 419 :25517 / 516 :25573 全在本体链 :25645+ 之前。
//   【本体之上】后绘 extras 区（本体链之后）：120,137,138 :26015/:26030、克眼冲刺
//   4 :26361、471 :26383、477,479 :26396。
// 落刀=双挂点：前绘族走本体变换内本体 drawImage 之前的槽（BJ211 环同位形态，槽内
// setTransform 回父空间=绝对坐标零漂移，残影先于环）；后绘族保持 restore 后挂点。

describe('BJ237-A 分发器结构锁（前绘=本体之下族 / 后绘=本体之上族）', () => {
  it('前绘分发器收前绘组：94/417/516 画；后绘组 120/4 不画', () => {
    for (const id of [94, 417, 516]) {
      const e = Enemy.fromVanilla(id, 100, 100) as EnemyT;
      tickN(e, 10, 4, 0);
      if (id === 417) e.ai0 = 6;
      const { ctx, ops } = recorder();
      drawNpcTrailGhosts(ctx, e, atlasStub, FRAME, OPT);
      expect(draws(ops).length, `id=${id} 应走前绘分发器`).toBeGreaterThan(0);
    }
    for (const id of [120, 4]) {
      const e = Enemy.fromVanilla(id, 100, 100) as EnemyT;
      tickN(e, 10, 4, 0);
      if (id === 4) { e.ai0 = 3; e.state = 4; }
      const { ctx, ops } = recorder();
      drawNpcTrailGhosts(ctx, e, atlasStub, FRAME, OPT);
      expect(draws(ops).length, `id=${id} 不得走前绘分发器（原版本体之上）`).toBe(0);
    }
  });

  it('后绘分发器收后绘组：120/4 画；前绘组 94/125 不画', () => {
    for (const id of [120, 4]) {
      const e = Enemy.fromVanilla(id, 100, 100) as EnemyT;
      tickN(e, 10, 4, 0);
      if (id === 4) { e.ai0 = 3; e.state = 4; }
      const { ctx, ops } = recorder();
      drawNpcTrailGhostsOverBody(ctx, e, atlasStub, FRAME, OPT);
      expect(draws(ops).length, `id=${id} 应走后绘分发器`).toBeGreaterThan(0);
    }
    for (const id of [94, 125]) {
      const e = Enemy.fromVanilla(id, 100, 100) as EnemyT;
      tickN(e, 10, 4, 0);
      const { ctx, ops } = recorder();
      drawNpcTrailGhostsOverBody(ctx, e, atlasStub, FRAME, OPT);
      expect(draws(ops).length, `id=${id} 不得走后绘分发器（原版本体之下）`).toBe(0);
    }
  });

  it('残影族 id 门 = 分发器并集（独立通道 id 418/473/402/657 不在门表）', () => {
    for (const id of [426, 427, 521, 546, 620, 439, 551, 519, 94, 125, 419, 4,
      120, 471, 477, 516]) {
      expect(NPC_TRAIL_GHOST_IDS.has(id), `id=${id}`).toBe(true);
    }
    for (const id of [418, 473, 402, 657, 685]) {
      expect(NPC_TRAIL_GHOST_IDS.has(id), `id=${id}`).toBe(false);
    }
  });
});

describe('BJ237-B drawEnemy 绘制序锁（记录型 ctx 直调——antlion-tilt 同款假体）', () => {
  const BODY = { width: 8, height: 8 };    // vnpc（本体）身份
  const GHOST = { width: 64, height: 128 }; // ensureVImage（残影/环）身份
  function driveDrawEnemy(e: EnemyT): Array<{ m: string; a: unknown[] }> {
    const calls: Array<{ m: string; a: unknown[] }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'canvas' ? undefined
        : k === 'getTransform'
          ? (...a: unknown[]) => { calls.push({ m: 'getTransform', a }); return { __parentT: true }; }
          : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
    });
    const fake = {
      ctx,
      assets: { enemySprites: new Map() },
      atlas: {
        vnpc: () => ({ img: BODY, sx: 0, sy: 0, sw: 8, sh: 8 }),
        ensureVImage: () => GHOST,
        vmisc: () => null,
      },
      drawNpcGlow: () => {},
      drawTwinsChain: () => {},   // 125 直调路径（mechQueenUp()=false 分支）
    };
    (Renderer.prototype as unknown as {
      drawEnemy: (this: unknown, e: EnemyT, w: unknown, ents?: unknown[]) => void;
    }).drawEnemy.call(fake, e,
      { store: { idx: () => 0, liquid: [0] } }, []);   // 水下滤镜查液面(:7464)——空世界
    return calls;
  }

  /** 残影槽区间=[setTransform, 同层 restore)；drawGhostSprite 内部 save/restore 按深度折叠 */
  function ghostSlot(calls: Array<{ m: string; a: unknown[] }>): [number, number] {
    const st = calls.findIndex((c) => c.m === 'setTransform');
    expect(st, '本体前槽 setTransform 缺失（BJ237 槽未生效）').toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = st + 1; i < calls.length; i++) {
      if (calls[i].m === 'save') depth++;
      else if (calls[i].m === 'restore') {
        if (depth === 0) return [st, i];
        depth--;
      }
    }
    return [st, calls.length];
  }

  it('620（残影+环双成员）：残影槽 < 环拷贝 < 本体，本体=最后一次 draw', () => {
    const nowSpy = vi.spyOn(performance, 'now').mockReturnValue(1200);
    pinGameTimeTicks(72);   // ★BJ330：72 tick=1.2s——GTW 单源收编后钟不再读 performance.now,相位钉钟改走 GameTime（同 tSec=1.2 谷底语义）
    try {
      // tSec=1.2 → 620 环包络谷底（num58=0、fade=1）→ 环拷贝必画
      const e = Enemy.fromVanilla(620, 100, 100) as EnemyT;
      e.spawnAlpha = 0;                       // 出生渐显关（Opacity=1）——否则残影/环全被 α 门吞
      tickN(e, 2, 4, 0);                      // depth=2 → 1 份残影（i=1）
      const calls = driveDrawEnemy(e);
      const drawsAll = calls.map((c, i) => ({ c, i })).filter(({ c }) => c.m === 'drawImage');
      const bodyIdx = drawsAll.filter(({ c }) => c.a[0] === BODY).map(({ i }) => i);
      expect(bodyIdx.length).toBe(1);
      const [gs, ge] = ghostSlot(calls);
      const ghostIdx = drawsAll.filter(({ i }) => i > gs && i < ge).map(({ i }) => i);
      expect(ghostIdx.length, '残影份数').toBe(1);
      const ringIdx = drawsAll.filter(({ c, i }) => c.a[0] === GHOST && i > ge).map(({ i }) => i);
      expect(ringIdx.length, 'num57=4 环拷贝').toBe(4);
      expect(Math.max(...ghostIdx)).toBeLessThan(Math.min(...ringIdx));   // 残影先于环（:23627→:23645）
      expect(Math.max(...ringIdx)).toBeLessThan(bodyIdx[0]);              // 环先于本体（:23645→:23660）
      expect(bodyIdx[0]).toBe(drawsAll[drawsAll.length - 1].i);           // 本体压轴=残影被遮
    } finally {
      nowSpy.mockRestore();
    }
  });

  it('125（机械族前绘组）：残影在槽内且先于本体；本体=最后一次 draw', () => {
    const e = Enemy.fromVanilla(125, 100, 100) as EnemyT;
    e.spawnAlpha = 0;                       // 出生渐显关（Opacity=1）
    tickN(e, 10, 4, 0);
    const calls = driveDrawEnemy(e);
    const drawsAll = calls.map((c, i) => ({ c, i })).filter(({ c }) => c.m === 'drawImage');
    const bodyIdx = drawsAll.filter(({ c }) => c.a[0] === BODY).map(({ i }) => i);
    expect(bodyIdx.length).toBe(1);
    const [gs, ge] = ghostSlot(calls);
    const ghostIdx = drawsAll.filter(({ i }) => i > gs && i < ge).map(({ i }) => i);
    expect(ghostIdx.length, 'i=9,7,5,3,1 五份').toBe(5);
    expect(Math.max(...ghostIdx)).toBeLessThan(bodyIdx[0]);
    expect(bodyIdx[0]).toBe(drawsAll[drawsAll.length - 1].i);
  });

  it('120（后绘组）：残影在本体【之后】（原版 :26015 后绘 extras 区同相）', () => {
    const e = Enemy.fromVanilla(120, 100, 100) as EnemyT;
    e.spawnAlpha = 0;                       // 出生渐显关（Opacity=1）
    tickN(e, 10, 4, 0);
    const calls = driveDrawEnemy(e);
    const drawsAll = calls.map((c, i) => ({ c, i })).filter(({ c }) => c.m === 'drawImage');
    const bodyIdx = drawsAll.filter(({ c }) => c.a[0] === BODY).map(({ i }) => i);
    expect(bodyIdx.length).toBe(1);
    const ghosts = drawsAll.filter(({ c }) => c.a[0] === GHOST);
    expect(ghosts.length).toBe(9);
    expect(Math.min(...ghosts.map(({ i }) => i))).toBeGreaterThan(bodyIdx[0]);
  });
});

// ===================== ★BJ412 残影 rotation ≡ 本体当前 rotation（2026-09-30 用户实报） =====================
// 原版锚：94 残影块 Main.cs:25472-25485 / 机械族块 :25486-25498——oldPos 拖影全部以
// rCurrentNPC.rotation（=【本体当前 rotation】）绘制。94 本体 rotation=atan2(num5,num4)−1.57
// （AI_005 cs:51182-51185,瞄准向,每 tick）；139 探针=atan2(num5,num4)+[π]（cs:50962-51026）
// ——本仓两者皆承载于 e.visAngle（Enemy.ts aiStyle5 分流,本体 ctx.rotate(e.visAngle)）。
// 病灶（已修）：残影 rot=atan2(vy,vx)+[vx<0 加 π]（恶魔眼族 FindFrame 公式 cs:74815-74827
// 张冠李戴）且 vx==0 恒 0——残影与本体差 ~90°/悬停相位完全无角度（用户截图形态）；
// 139 落空派发表 gRot=0 同病。140 附魔甲本体 aiStyle3 恒不转=残影 rot 0 正确（负例）。
describe('BJ412 残影 rotation=本体当前 rotation（drawEnemy 直调,ghost 槽 rotate 钉值）', () => {
  function drive412(e: EnemyT): Array<{ m: string; a: unknown[] }> {
    const calls: Array<{ m: string; a: unknown[] }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'canvas' ? undefined
        : k === 'getTransform'
          ? (...a: unknown[]) => { calls.push({ m: 'getTransform', a }); return { __parentT: true }; }
          : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
    });
    const fake = {
      ctx,
      assets: { enemySprites: new Map() },
      atlas: {
        vnpc: () => ({ img: { width: 8, height: 8 }, sx: 0, sy: 0, sw: 8, sh: 8 }),
        ensureVImage: () => ({ width: 64, height: 128 }),
        vmisc: () => null,
      },
      drawNpcGlow: () => {},
      drawTwinsChain: () => {},
    };
    (Renderer.prototype as unknown as {
      drawEnemy: (this: unknown, e: EnemyT, w: unknown, ents?: unknown[]) => void;
    }).drawEnemy.call(fake, e, { store: { idx: () => 0, liquid: [0] } }, []);
    return calls;
  }
  /** ghost 槽=[setTransform, 配对 restore)；槽内 rotate ops（drawGhostSprite rot=0 不出 rotate） */
  function ghostSlotRots(calls: Array<{ m: string; a: unknown[] }>): number[] {
    const st = calls.findIndex((c) => c.m === 'setTransform');
    expect(st, 'ghost 槽 setTransform 缺失（BJ237 槽未生效）').toBeGreaterThanOrEqual(0);
    const rots: number[] = [];
    let depth = 0;
    for (let i = st + 1; i < calls.length; i++) {
      if (calls[i].m === 'save') depth++;
      else if (calls[i].m === 'restore') {
        if (depth === 0) return rots;
        depth--;
      } else if (calls[i].m === 'rotate') rots.push(calls[i].a[0] as number);
    }
    return rots;
  }

  it('94 腐化者：vx=0（旧式恒 0 的病灶相位）残影 rot=e.visAngle 三份全同', () => {
    const e = Enemy.fromVanilla(94, 100, 100) as EnemyT;
    e.visAngle = 0.7;              // 本体瞄准角（AI_005 每 tick 写,此处钉值）
    e.vx = 0; e.vy = 0;
    e.spawnAlpha = 0;              // 出生渐显关（Opacity=1）
    tickN(e, 6, 2, 1);
    const rots = ghostSlotRots(drive412(e));
    expect(rots.length, 'i=1,3,5 三份残影各一 rotate（旧式 rot=0 连 rotate op 都不出）').toBe(3);
    for (const r of rots) expect(r, '残影 rot ≡ 本体 visAngle（Main.cs:25472 rCurrentNPC.rotation）').toBeCloseTo(0.7, 6);
  });

  it('94 腐化者：速度向≠瞄准向时残影仍随本体角（旧式 atan2(vy,vx)+[π] 张冠李戴）', () => {
    const e = Enemy.fromVanilla(94, 100, 100) as EnemyT;
    e.visAngle = -1.1;
    e.vx = -3; e.vy = 0;           // 旧式给 atan2(0,−3)+π=π ≠ −1.1
    e.spawnAlpha = 0;
    tickN(e, 6, 0, 2);
    const rots = ghostSlotRots(drive412(e));
    expect(rots.length).toBe(3);
    for (const r of rots) expect(r).toBeCloseTo(-1.1, 6);
  });

  it('139 探针（ai3=0 机械族块 :25486）：残影 rot=e.visAngle（旧式落空派发表恒 0）', () => {
    const e = Enemy.fromVanilla(139, 100, 100) as EnemyT;
    e.visAngle = 0.35;
    e.spawnAlpha = 0;
    tickN(e, 10, 3, 0);
    const rots = ghostSlotRots(drive412(e));
    expect(rots.length, 'i=9,7,5,3,1 五份').toBe(5);
    for (const r of rots) expect(r).toBeCloseTo(0.35, 6);
  });

  it('140 附魔甲（同块负例）：本体 aiStyle3 恒不转 → ghost 槽零 rotate', () => {
    const e = Enemy.fromVanilla(140, 100, 100) as EnemyT;
    e.spawnAlpha = 0;
    tickN(e, 10, 3, 0);
    const rots = ghostSlotRots(drive412(e));
    expect(rots.length, '140 残影 rot≡本体 0（rot=0 不出 rotate op）').toBe(0);
  });
});

// ===================== ★BJ245 邪教徒仪式召唤环（2026-09-21，BJ237 立案清偿） =====================
// 原版锚（case 439/440 环段 Main.cs:24907-24931 亲读；1458 :24858-24940 对拍逐字节
// 等价=零变更；BJ211 NPC_AURA_RINGS 只收通用大表 num57,本 case 在表外）：
//   门 ai0==5 && ai1∈[0,30) → 4 份 Extra_30 拷贝;num328=(1−cos(ai1/30·π))/2、
//   半径=70×num328 世界 px（裸值不乘 scale）、角=(i/4)·2π+rotation、α=(1−num328)
//   ×GetAlpha（环窗 amount10=0 不染白）;源矩形=残影同款半高帧 row=frameIdx>=4。
//   z 序=残影(:24879)→环(:24922)→本体(:24933)——环窗 ai0==5 残影份数恒 0
//   （else 支 num323=0）,两窗口互斥=原版本相,序锁由「环在前绘槽内+先于本体」承载。
import { drawCultistRitualRing } from '../src/render/npcExtraParts';

describe('BJ245-A 仪式环几何钉值（Main.cs:24907-24931）', () => {
  it('ai0==5 && ai1=15：4 份,α=(1−0.5)=0.5,半径=35,角度 0/π/2/π/3π/2（rot=0）', () => {
    const e = Enemy.fromVanilla(439, 100, 100) as EnemyT;
    e.ai0 = 5; e.ai1 = 15;
    const { ctx, ops } = recorder();
    drawCultistRitualRing(ctx, e, atlasStub, OPT);
    const d = draws(ops);
    expect(d.length, 'num327=4 环拷贝').toBe(4);
    for (const op of d) {
      expect(op.alpha).toBeCloseTo(0.5, 6);              // ×(1−num328)
      expect(op.sw).toBe(64); expect(op.sh).toBe(64);    // Extra_30 半高帧（stub 64×128,row0）
    }
    const cx = e.cx, cy = e.cy;                           // fromVanilla 以盒心落位
    const tr = ops.filter((o) => o.op === 'translate');
    expect(tr.length).toBe(4);
    const expectR = 35;                                   // 70×(1−cos(π/2))/2
    const got = tr.map((o) => ({ x: o.x as number, y: o.y as number }));
    expect(got[0].x).toBeCloseTo(cx + expectR, 4); expect(got[0].y).toBeCloseTo(cy, 4);
    expect(got[1].x).toBeCloseTo(cx, 4); expect(got[1].y).toBeCloseTo(cy + expectR, 4);
    expect(got[2].x).toBeCloseTo(cx - expectR, 4); expect(got[2].y).toBeCloseTo(cy, 4);
    expect(got[3].x).toBeCloseTo(cx, 4); expect(got[3].y).toBeCloseTo(cy - expectR, 4);
  });
  it('ai1=0：包络零点（半径 0 全在盒心,α=1 满档）', () => {
    const e = Enemy.fromVanilla(440, 100, 100) as EnemyT;
    e.ai0 = 5; e.ai1 = 0;
    const { ctx, ops } = recorder();
    drawCultistRitualRing(ctx, e, atlasStub, OPT);
    const d = draws(ops);
    expect(d.length).toBe(4);
    expect(d[0].alpha).toBeCloseTo(1.0, 6);
    const cx = e.cx, cy = e.cy;                           // fromVanilla 以盒心落位
    for (const t of ops.filter((o) => o.op === 'translate')) {
      expect(t.x).toBeCloseTo(cx, 4); expect(t.y).toBeCloseTo(cy, 4);
    }
  });
  it('ai1=28：包络近满（num328=(1+cos(2π/30))/2≈0.989）α≈0.011 仍画', () => {
    const e = Enemy.fromVanilla(439, 100, 100) as EnemyT;
    e.ai0 = 5; e.ai1 = 28;
    const { ctx, ops } = recorder();
    drawCultistRitualRing(ctx, e, atlasStub, OPT);
    const d = draws(ops);
    const num328 = (1 + Math.cos((2 * Math.PI) / 30)) / 2;
    expect(d.length).toBe(4);
    expect(d[0].alpha).toBeCloseTo(1 - num328, 6);
  });
  it('门面：ai1=30 出窗 / ai0≠5 / opacity=0 全不画', () => {
    const mk = () => Enemy.fromVanilla(439, 100, 100) as EnemyT;
    const e1 = mk(); e1.ai0 = 5; e1.ai1 = 30;
    const r1 = recorder(); drawCultistRitualRing(r1.ctx, e1, atlasStub, OPT);
    expect(draws(r1.ops).length).toBe(0);
    const e2 = mk(); e2.ai0 = 4; e2.ai1 = 15;
    const r2 = recorder(); drawCultistRitualRing(r2.ctx, e2, atlasStub, OPT);
    expect(draws(r2.ops).length).toBe(0);
    const e3 = mk(); e3.ai0 = 5; e3.ai1 = 15;
    const r3 = recorder();
    drawCultistRitualRing(r3.ctx, e3, atlasStub, { ...OPT, opacity: 0 });
    expect(draws(r3.ops).length).toBe(0);
  });
  it('源矩形随帧行：frameIdx>=4 → Extra_30 底半（sy=half）;镜像/旋转透传', () => {
    const e = Enemy.fromVanilla(439, 100, 100) as EnemyT;
    e.ai0 = 5; e.ai1 = 10;
    const r = recorder();
    drawCultistRitualRing(r.ctx, e, atlasStub, { ...OPT, frameIdx: 4 });
    const d = draws(r.ops);
    expect(d.length).toBe(4);
    expect(d[0].sy).toBe(64);                              // 底半行
  });
});

describe('BJ245-B 仪式环接线结构锁（残影:24879→环:24922→本体:24933）', () => {
  const BODY = { width: 8, height: 8 };
  const GHOST = { width: 64, height: 128 };
  function driveDrawEnemy(e: EnemyT): Array<{ m: string; a: unknown[] }> {
    const calls: Array<{ m: string; a: unknown[] }> = [];
    const ctx = new Proxy({} as Record<string, unknown>, {
      get: (_t, k) => (k === 'canvas' ? undefined
        : k === 'getTransform'
          ? (...a: unknown[]) => { calls.push({ m: 'getTransform', a }); return { __parentT: true }; }
          : (...a: unknown[]) => { calls.push({ m: String(k), a }); }),
    });
    const fake = {
      ctx,
      assets: { enemySprites: new Map() },
      atlas: {
        vnpc: () => ({ img: BODY, sx: 0, sy: 0, sw: 8, sh: 8 }),
        ensureVImage: () => GHOST,
        vmisc: () => null,
      },
      npcWhiteLiftQueue: [],   // ★BJ-C9 F3：440 入恒色族捕获支（queue.push 消费面）
      drawNpcGlow: () => {},
      drawTwinsChain: () => {},
    };
    (Renderer.prototype as unknown as {
      drawEnemy: (this: unknown, e: EnemyT, w: unknown, ents?: unknown[]) => void;
    }).drawEnemy.call(fake, e,
      { store: { idx: () => 0, liquid: [0] } }, []);
    return calls;
  }
  /** 残影槽区间=[setTransform, 同层 restore)（BJ237-B 同款折叠） */
  function ghostSlot(calls: Array<{ m: string; a: unknown[] }>): [number, number] {
    const st = calls.findIndex((c) => c.m === 'setTransform');
    expect(st, '本体前槽 setTransform 缺失（BJ237 槽未生效）').toBeGreaterThanOrEqual(0);
    let depth = 0;
    for (let i = st + 1; i < calls.length; i++) {
      if (calls[i].m === 'save') depth++;
      else if (calls[i].m === 'restore') {
        if (depth === 0) return [st, i];
        depth--;
      }
    }
    return [st, calls.length];
  }
  it('439 仪式窗（ai0=5,ai1=15）：环 4 份全在前绘槽内且先于本体;本体=最后 draw', () => {
    const e = Enemy.fromVanilla(439, 100, 100) as EnemyT;
    e.spawnAlpha = 0;                       // 仪式窗 spawnAlpha 由 AI 驱动,直绘路径置 0=Opacity 1
    e.ai0 = 5; e.ai1 = 15;
    const calls = driveDrawEnemy(e);
    const drawsAll = calls.map((c, i) => ({ c, i })).filter(({ c }) => c.m === 'drawImage');
    const bodyIdx = drawsAll.filter(({ c }) => c.a[0] === BODY).map(({ i }) => i);
    expect(bodyIdx.length).toBe(1);
    const [gs, ge] = ghostSlot(calls);
    const ringIdx = drawsAll.filter(({ c, i }) => c.a[0] === GHOST && i > gs && i < ge).map(({ i }) => i);
    expect(ringIdx.length, '环 4 份在槽内（残影→环→本体 case 段）').toBe(4);
    expect(Math.max(...ringIdx)).toBeLessThan(bodyIdx[0]);
    expect(bodyIdx[0]).toBe(drawsAll[drawsAll.length - 1].i);
  });
  it('440 同门：仪式窗环 4 份（case 439/440 共块）', () => {
    const e = Enemy.fromVanilla(440, 100, 100) as EnemyT;
    e.spawnAlpha = 0;
    e.ai0 = 5; e.ai1 = 8;
    const calls = driveDrawEnemy(e);
    const [gs, ge] = ghostSlot(calls);
    const ringIdx = calls.map((c, i) => ({ c, i })).filter(({ c, i }) =>
      c.m === 'drawImage' && c.a[0] === GHOST && i > gs && i < ge);
    expect(ringIdx.length).toBe(4);
  });
});
