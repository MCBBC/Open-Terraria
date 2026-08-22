// 月总瞳孔/束锚椭圆 1:1 回归(2026-08-19)。
// 根因:Utils.Vector2FromElipse(Utils.cs:948-965)不是 naive (cosθ·sx, sinθ·sy)——
// 角度向量先乘 One/Normalize(sizes) 再归一化(重参数化),末乘 sizes/2(幅度减半)。
// 曾按 naive 实现:头瞳孔行程 ×2(俯视时中心在 cy+58)整个甩进脸后(眼洞底 cy+32)
// = "脑袋眼球空的";手瞳孔甩出掌洞 = 双手无瞳;455 束锚/452/462 出生点同步偏 2 倍。
import { describe, it, expect } from 'vitest';
import { mlElipseVec, moonLordHeadAI } from '../src/entities/bossAI_duke_moonlord';
import { Enemy } from '../src/entities/Enemy';
import { Arrow } from '../src/entities/Arrow';
import { World } from '../src/world/World';
import { TILE } from '../src/core/constants';
import type { GameHooks } from '../src/entities/types';

// 原版算法独立复算(与实现解耦的验证侧)
function vanillaRef(angle: number, sx: number, sy: number): [number, number] {
  if (sx === 0 && sy === 0) return [0, 0];
  const c = Math.cos(angle), s = Math.sin(angle);
  const len = Math.hypot(sx, sy);
  const nx = sx / len, ny = sy / len;            // Normalize(sizes)
  let ax = c / nx, ay = s / ny;                  // *(One/normalized)
  const l2 = Math.hypot(ax, ay);
  ax /= l2; ay /= l2;
  return [ax * sx / 2, ay * sy / 2];
}

describe('mlElipseVec(Utils.Vector2FromElipse :948-965)', () => {
  it('头椭圆 (27,59):正下 π/2 → (0,29.5) 非 naive 的 (0,59)', () => {
    const [x, y] = mlElipseVec(Math.PI / 2, 27, 59);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(29.5, 10);
  });

  it('手椭圆 (30,66):正右 0 → (15,0);正下 π/2 → (0,33)', () => {
    expect(mlElipseVec(0, 30, 66)).toEqual([15, 0]);
    const [x, y] = mlElipseVec(Math.PI / 2, 30, 66);
    expect(x).toBeCloseTo(0, 10);
    expect(y).toBeCloseTo(33, 10);
  });

  it('圆 (30,30) 退化为半径/2 圆(真眼 400/核心束锚)', () => {
    const modTau = (v: number) => ((v % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    for (const a of [0, 0.7, 1.4276, 2.9, 4.4]) {
      const [x, y] = mlElipseVec(a, 30, 30);
      expect(Math.hypot(x, y)).toBeCloseTo(15, 10);
      expect(modTau(Math.atan2(y, x))).toBeCloseTo(modTau(a), 10);
    }
  });

  it('开度 k=0(sizes=0)走首卫兵 → (0,0)', () => {
    expect(mlElipseVec(1.2, 0, 0)).toEqual([0, 0]);
  });

  it('斜角重参数化:方向被 (|s|/sx,|s|/sy) 拉偏,非原角度方向', () => {
    // θ=1.4276(俯视偏右):naive 会得 (3.9,58.4);真值 (≈4.1,≈28.1)
    const [x, y] = mlElipseVec(1.4276, 27, 59);
    expect(x).toBeCloseTo(4.08, 1);
    expect(y).toBeCloseTo(28.12, 1);
    // 与独立复算逐位一致 + 轴向界 |x|≤sx/2、|y|≤sy/2
    for (const [a, sx, sy] of [[0.3, 27, 59], [2.2, 30, 66], [5.0, 27, 59]] as const) {
      const r = mlElipseVec(a, sx, sy), v = vanillaRef(a, sx, sy);
      expect(r[0]).toBeCloseTo(v[0], 9);
      expect(r[1]).toBeCloseTo(v[1], 9);
      expect(Math.abs(r[0])).toBeLessThanOrEqual(sx / 2 + 1e-9);
      expect(Math.abs(r[1])).toBeLessThanOrEqual(sy / 2 + 1e-9);
    }
  });

  it('几何验收:俯视(θ→π/2)时瞳孔中心 cy+29.5,32px 瞳孔上缘 cy+13.5 < 眼洞底 cy+32 = 半露(旧 naive 全遮)', () => {
    const [, y] = mlElipseVec(Math.PI / 2, 27, 59);
    expect(y - 16).toBeLessThan(32);          // 瞳孔上缘露出洞内
    expect(y + 16).toBeGreaterThan(32);       // 下缘被脸裁掉(俯视观感)
  });
});

// ============ 头 462 出生点 e2e(NPC.cs:37995-38001 椭圆消费端) ============

const W = 200, H = 140, FLOOR = 110;
function makeHooks(playerAt: { x: number; y: number }) {
  const w = new World(W, H, 7, 'ml-ellipse');
  w.clock.timeOfDay = 0;                       // 深夜(无日晒干扰)
  const st = w.store;
  for (let x = 0; x < W; x++) { st.setTile(x, FLOOR, 1); st.setTile(x, FLOOR + 1, 1); }
  const enemies: Enemy[] = [];
  const projectiles: Arrow[] = [];
  const em = {
    nextId: 1,
    add: (e: unknown, b: 'enemies' | 'projectiles') => {
      (e as { id: number }).id = em.nextId++;
      (b === 'enemies' ? enemies : projectiles).push(e as Enemy & Arrow);
    },
  };
  const player = {
    x: playerAt.x * TILE, y: playerAt.y * TILE, w: 20, h: 42,
    cx: playerAt.x * TILE + 10, cy: playerAt.y * TILE + 21,
    vx: 0, vy: 0, hp: 400, maxHp: 400, dead: false,
  };
  const hooks = {
    world: w, player, enemies: () => enemies, critters: () => [],
    spawnDrop: () => null, damagePlayer: () => {}, addDamageNumber: () => {},
    cutTile: () => {}, onEnemyKilled: () => {}, spawnEnemy: () => {},
    spawnParticles: () => {}, notifyInventoryChanged: () => {}, playSfx: () => {},
    playSfxFiles: () => {}, showPickupLabel: () => {}, entities: em,
  } as unknown as GameHooks;
  return { hooks, enemies, projectiles };
}

let nid = 5000;
describe('头 462 幻影矢出生点 = 椭圆位置(NPC.cs:37995-38001)', () => {
  it('侧视(θ=0,l1→1):出生 = (cx+13.5, cy+0)——旧 naive 在 (cx+27, cy+0)', () => {
    // fromVanilla 以中心锚:core(1600,1600) → 头 AI 锁 head.cy=1200;玩家同高(cx=2100,cy=1200)
    const h = makeHooks({ x: (2100 - 10) / 16, y: (1200 - 21) / 16 });
    const core = Enemy.fromVanilla(398, 100 * TILE, 100 * TILE)!;
    core.id = nid++; core.bInit = true;
    const head = Enemy.fromVanilla(396, 100 * TILE, 96 * TILE)!;
    head.id = nid++; head.bInit = true;
    head.ai0 = 3; head.ai1 = 146; head.ai3 = core.id;   // 槽0 [3,180]:20t 后 inSlot=166=dur-14
    h.enemies.push(core, head);
    for (let t = 0; t < 20; t++) moonLordHeadAI(head, h.hooks, h.hooks.player as never);
    expect(h.projectiles.length).toBeGreaterThanOrEqual(1);
    const p = h.projectiles[h.projectiles.length - 1];
    expect(p.x).toBeCloseTo(head.cx + 13.5, 4);   // mlElipseVec(0,27,59) = (13.5,0)
    expect(p.y).toBeCloseTo(head.cy, 4);
  });

  it('俯视(玩家在头正下):出生 y ≈ cy+29.5(旧 naive cy+59 藏脸后,视觉=凭空弹幕)', () => {
    // 玩家与头同 X(cx=1600)、低 600px → 目标角恰 π/2;20t l0 收敛、l1→1,
    // 椭圆 (0,29.5)——重参数化后 y 行程只有 59/2
    const h = makeHooks({ x: (1600 - 10) / 16, y: (1800 - 21) / 16 });
    const core = Enemy.fromVanilla(398, 100 * TILE, 100 * TILE)!;
    core.id = nid++; core.bInit = true;
    const head = Enemy.fromVanilla(396, 100 * TILE, 96 * TILE)!;
    head.id = nid++; head.bInit = true;
    head.ai0 = 3; head.ai1 = 146; head.ai3 = core.id;
    h.enemies.push(core, head);
    for (let t = 0; t < 20; t++) moonLordHeadAI(head, h.hooks, h.hooks.player as never);
    const p = h.projectiles[h.projectiles.length - 1];
    expect(p.y - head.cy).toBeCloseTo(29.5, 2);
    expect(p.x - head.cx).toBeCloseTo(0, 2);
  });
});

// ============ 渲染路径原型直调:瞳孔/覆层/帧切片锚点(记录型 ctx) ============
import { Renderer } from '../src/render/Renderer';

interface Op { op: string; a: number[]; img?: string }
function recCtx() {
  const ops: Op[] = [];
  const ctx = {
    save() { ops.push({ op: 'save', a: [] }); },
    restore() { ops.push({ op: 'restore', a: [] }); },
    translate(x: number, y: number) { ops.push({ op: 'translate', a: [x, y] }); },
    rotate(r: number) { ops.push({ op: 'rotate', a: [r] }); },
    scale(x: number, y: number) { ops.push({ op: 'scale', a: [x, y] }); },
    drawImage(img: { w: number; h: number; tag: string }, ...r: number[]) {
      ops.push({ op: 'drawImage', a: r, img: img.tag });
    },
    globalAlpha: 1,
  };
  return { ctx, ops };
}
// 假图(真实尺寸):tag 即消费方判定键
const SIZES: Record<string, [number, number]> = {
  Extra_13: [290, 638], Extra_14: [172, 400], Extra_15: [128, 426], Extra_16: [230, 178],
  Extra_17: [54, 92], Extra_18: [38, 68], Extra_19: [32, 32], Extra_25: [56, 168],
  Extra_26: [46, 328], Extra_29: [90, 400], NPC_396: [573, 804], NPC_397: [246, 1088],
  NPC_398: [60, 410],
};
const fakeImg = (tag: string) => {
  const [w, h] = SIZES[tag];
  return { width: w, height: h, w, h, tag };
};
function fakeAtlas() {
  return {
    vmisc: (p: string) => {
      const tag = p.replace('vanilla/', '').replace('.png', '');
      const img = fakeImg(tag);
      return { img, sx: 0, sy: 0, sw: img.width, sh: img.height };
    },
    ensureVImage: (p: string) => fakeImg(p.replace('vanilla/', '').replace('.png', '')),
    vnpc: (id: number) => {
      const img = fakeImg('NPC_' + id);
      return { img, sx: 0, sy: 0, sw: id === 397 ? 246 : 60, sh: id === 397 ? 272 : 82 };
    },
  };
}
function lastTranslateBefore(ops: Op[], i: number): [number, number] {
  for (let k = i - 1; k >= 0; k--) if (ops[k].op === 'translate') return [ops[k].a[0], ops[k].a[1]];
  return [NaN, NaN];
}

describe('drawMoonLordHead 锚点(Main.cs:24449-24504)', () => {
  it('瞳孔 translate = 中心 + mlElipseVec(lai0,(27,59)×lai1);覆层 +(0,214)/(0,4);帧切片 191×268', () => {
    const head = Enemy.fromVanilla(396, 1000, 2000)!;
    head.ai0 = 3;
    head.lai0 = 1.4276; head.lai1 = 1; head.lai2 = 0; head.lai3 = 0;
    head.customFrameIdx = 4;                       // 钉帧 idx4 → col1,row1
    const { ctx, ops } = recCtx();
    const fake = { atlas: fakeAtlas(), ctx } as unknown as Renderer;
    (Renderer.prototype as unknown as { drawMoonLordHead: (e: Enemy) => void }).drawMoonLordHead.call(fake, head);
    const [ex, ey] = mlElipseVec(1.4276, 27, 59);
    // 瞳孔(32×32 源)
    const pupilIdx = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_19');
    expect(pupilIdx).toBeGreaterThanOrEqual(0);
    expect(lastTranslateBefore(ops, pupilIdx)).toEqual([head.cx + ex, head.cy + ey]);
    // 眼窝(38×68 源,origin (19,34))
    const socketIdx = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_18');
    expect(ops[socketIdx].a).toEqual([0, 0, 38, 68, -19, -34, 38, 68]);
    // 头帧:源 (col*191,row*268,191,268) dest (-191,-130,382,536)——XNA origin
    // (95.5,65) 施加 scale 2 = 有效偏移 (191,130)(曾少乘 scale = 脸右/上偏 95.5/65px,
    // 用户报"左偏+下偏"错位,2026-08-22 修)
    const bodyIdx = ops.findIndex(o => o.op === 'drawImage' && o.img === 'NPC_396');
    expect(ops[bodyIdx].a).toEqual([1 * 191, 1 * 268, 191, 268, -191, -130, 382, 536]);
    // 破体覆层:Extra_29 锚 (floor(cx),floor(cy+4)) 源行 lai3/5、dest (-45,-50,90,100);
    // Extra_25 锚 (floor(cx),floor(cy+214)) 源行 lai2/7、dest (-28,-28,56,56)
    const i29 = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_29');
    expect(lastTranslateBefore(ops, i29)).toEqual([Math.floor(head.cx), Math.floor(head.cy + 4)]);
    expect(ops[i29].a).toEqual([0, 0 * 100, 90, 100, -45, -50, 90, 100]);
    const i25 = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_25');
    expect(lastTranslateBefore(ops, i25)).toEqual([Math.floor(head.cx), Math.floor(head.cy + 214)]);
    expect(ops[i25].a).toEqual([0, 0 * 56, 56, 56, -28, -28, 56, 56]);
  });

  it('覆层行随攻击态:头 lai2=14(残肢) → Extra_25 源行 2;lai3=15 → Extra_29 源行 3', () => {
    const head = Enemy.fromVanilla(396, 0, 0)!;
    head.ai0 = -2; head.lai0 = 0; head.lai1 = 0; head.lai2 = 14; head.lai3 = 15;
    head.customFrameIdx = 0;
    const { ctx, ops } = recCtx();
    const fake = { atlas: fakeAtlas(), ctx } as unknown as Renderer;
    (Renderer.prototype as unknown as { drawMoonLordHead: (e: Enemy) => void }).drawMoonLordHead.call(fake, head);
    // ai0<0 → 闲置眼窝 Extra_26(源行 ai1/8=0,origin (19+4,34+4))
    const i26 = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_26');
    expect(ops[i26].a).toEqual([0, 0, 46, 82, -23, -38, 46, 82]);
    expect(ops.find(o => o.op === 'drawImage' && o.img === 'Extra_18')).toBeUndefined();
    const i29 = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_29');
    expect(ops[i29].a[1]).toBe(3 * 100);
    const i25 = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_25');
    expect(ops[i25].a[1]).toBe(2 * 56);
  });
});

describe('drawMoonLordHand 锚点(Main.cs:24391-24447)', () => {
  it('瞳孔 = 中心 +(−sx,3)+mlElipseVec(lai0,(30,66)×lai1);本体 origin (120,180);前臂锚 +(0,76)', () => {
    const core = Enemy.fromVanilla(398, 1000, 2000)!;
    core.id = 77;
    const hand = Enemy.fromVanilla(397, 700, 1900)!;
    hand.id = 78; hand.ai0 = 1; hand.ai2 = 0; hand.ai3 = core.id;   // side 0 → sx=-1
    hand.lai0 = -2.676; hand.lai1 = 0.75;
    hand.customFrameIdx = 0;
    const { ctx, ops } = recCtx();
    const fake = {
      atlas: fakeAtlas(), ctx,
      moonLordSideSign: (s: number): [number, number] => (s === 0 ? [-1, 1] : [1, 1]),
      moonLordArmAngle: (len: number, sx: number): number => Math.acos(Math.max(-1, Math.min(1, len / 340))) * -sx,
    } as unknown as Renderer;
    (Renderer.prototype as unknown as { drawMoonLordHand: (e: Enemy, ents: unknown[]) => void })
      .drawMoonLordHand.call(fake, hand, [core, hand]);
    const [ex, ey] = mlElipseVec(-2.676, 30 * 0.75, 66 * 0.75);
    const pupilIdx = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_19');
    expect(lastTranslateBefore(ops, pupilIdx)).toEqual([hand.cx + 1 + ex, hand.cy + 3 + ey]);
    // 手本体:origin (120,180)
    const bodyIdx = ops.findIndex(o => o.op === 'drawImage' && o.img === 'NPC_397');
    expect(ops[bodyIdx].a.slice(4)).toEqual([-120, -180, 246, 272]);
    // side 1:本体镜像 origin X=246−120,瞳孔 X 偏移取 −1
    hand.ai2 = 1;
    const r2 = recCtx();
    (Renderer.prototype as unknown as { drawMoonLordHand: (e: Enemy, ents: unknown[]) => void })
      .drawMoonLordHand.call({ atlas: fakeAtlas(), ctx: r2.ctx,
        moonLordSideSign: (s: number): [number, number] => (s === 0 ? [-1, 1] : [1, 1]),
        moonLordArmAngle: (len: number, sx: number): number => Math.acos(Math.max(-1, Math.min(1, len / 340))) * -sx,
      } as unknown as Renderer, hand, [core, hand]);
    const b2 = r2.ops.findIndex(o => o.op === 'drawImage' && o.img === 'NPC_397');
    expect(r2.ops[b2].a.slice(4)).toEqual([-(246 - 120), -180, 246, 272]);
    const p2 = r2.ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_19');
    expect(lastTranslateBefore(r2.ops, p2)[0]).toBeCloseTo(hand.cx - 1 + ex, 6);
  });

  it('残肢眼窝镜像基 = Extra_17 宽(54)−26=28(:24420-24422),非 Extra_26 宽', () => {
    const core = Enemy.fromVanilla(398, 1000, 2000)!;
    core.id = 77;
    const hand = Enemy.fromVanilla(397, 700, 1900)!;
    hand.id = 78; hand.ai0 = -2; hand.ai1 = 16; hand.ai2 = 1; hand.ai3 = core.id;
    hand.customFrameIdx = 0;
    const { ctx, ops } = recCtx();
    (Renderer.prototype as unknown as { drawMoonLordHand: (e: Enemy, ents: unknown[]) => void })
      .drawMoonLordHand.call({ atlas: fakeAtlas(), ctx,
        moonLordSideSign: (s: number): [number, number] => (s === 0 ? [-1, 1] : [1, 1]),
        moonLordArmAngle: (len: number, sx: number): number => Math.acos(Math.max(-1, Math.min(1, len / 340))) * -sx,
      } as unknown as Renderer, hand, [core, hand]);
    const i26 = ops.findIndex(o => o.op === 'drawImage' && o.img === 'Extra_26');
    expect(ops[i26].a).toEqual([0, 2 * 82, 46, 82, -(54 - 26) + 4, -42 + 4, 46, 82]);
  });
});

// ============ 30% 白斜坡补差(Renderer.applyMoonLordLightFloor,Main.cs:24345 族) ============
// final_vanilla = sprite×(0.7L+0.3) = 已绘(sprite×L) + sprite×0.3×(1−L):
// 差值色 rgb(0.3×(255−light)) 以 'lighter' 加性叠回。验证:色值数学/三步乘色序/
// 剔除门(全亮零差跳过/出屏跳过/fullbright 跳过/behindTiles 跳过)。
import { TILE } from '../src/core/constants';

describe('applyMoonLordLightFloor(Main.cs:24345/24417/24479/24486)', () => {
  function makeFixture(opts: {
    light: [number, number, number]; fullbright?: boolean; behind?: boolean;
    screen?: [number, number];
  }) {
    const mainOps: string[] = [];
    const scratchOps: string[] = [];
    let scratchGco = 'source-over';
    const sctx = {
      setTransform: () => scratchOps.push('xf'),
      clearRect: () => scratchOps.push('clear'),
      fillStyle: '',
      fillRect: () => scratchOps.push('fill:' + String(sctx.fillStyle)),
      globalCompositeOperation: scratchGco,
      drawImage: () => scratchOps.push('draw@gco=' + scratchGco),
    };
    const scratch = {
      width: 0, height: 0,
      getContext: () => sctx,
    };
    const mainCtx = {
      save: () => mainOps.push('save'),
      restore: () => mainOps.push('restore'),
      setTransform: () => mainOps.push('main-xf'),
      globalCompositeOperation: 'source-over',
      drawImage: () => mainOps.push('main:' + mainCtx.globalCompositeOperation),
    };
    const draws: string[] = [];
    const fake = {
      ctx: mainCtx,
      mlFloorScratch: scratch,
      fullbright: !!opts.fullbright,
      isBehindTilesEnemy: () => !!opts.behind,
      drawMoonLordCore: () => draws.push('398'),
      drawMoonLordHand: () => draws.push('397'),
      drawMoonLordHead: () => draws.push('396'),
      drawMoonLordFreeEye: () => draws.push('400'),
    };
    const [lrx, lry] = [500, 500];
    const light = { r: new Uint8Array([opts.light[0]]), g: new Uint8Array([opts.light[1]]), b: new Uint8Array([opts.light[2]]) };
    const cam = {
      zoom: 1.25,
      worldToScreen: () => (opts.screen ?? [400, 300]),
    };
    const part = Enemy.fromVanilla(396, (lrx + 0.5) * TILE, (lry + 0.5) * TILE)!;
    return { fake: fake as unknown as Renderer, mainOps, scratchOps, draws, sctx, light, lrx, lry, cam, part };
  }

  it('零光照:差值色 = rgb(77,77,77)(0.3×255),三步乘色 + lighter 叠回', () => {
    const f = makeFixture({ light: [0, 0, 0] });
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      f.fake, [f.part], f.cam, 1512, 862,
      f.light.r, f.light.g, f.light.b, f.lrx, f.lry, 1, 1,
    );
    // scratch 序:resize 隐式清(首帧) → 绘(1st,桩不落 drawImage) → xf →
    // multiply 填色 → xf → destination-in 绘(2nd);部件绘两次(乘色+α恢复)
    expect(f.scratchOps.filter(o => o.startsWith('fill:')).length).toBe(1);
    expect(f.scratchOps).toContain('fill:rgb(77,77,77)');
    // 主画布:lighter 叠回
    expect(f.mainOps).toContain('main:lighter');
    expect(f.draws.filter(d => d === '396').length).toBe(2);
  });

  it('部分光照 (100,200,50):差值色 = rgb(47,17,62)(0.3×(255−L) 四舍五入)', () => {
    const f = makeFixture({ light: [100, 200, 50] });
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      f.fake, [f.part], f.cam, 1512, 862,
      f.light.r, f.light.g, f.light.b, f.lrx, f.lry, 1, 1,
    );
    expect(f.scratchOps).toContain('fill:rgb(47,17,62)');
  });

  it('全亮 (255,255,255):差值 0 → 整体跳过(零开销)', () => {
    const f = makeFixture({ light: [255, 255, 255] });
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      f.fake, [f.part], f.cam, 1512, 862,
      f.light.r, f.light.g, f.light.b, f.lrx, f.lry, 1, 1,
    );
    expect(f.scratchOps).toEqual([]);
    expect(f.mainOps).toEqual([]);
    expect(f.draws).toEqual([]);
  });

  it('光照矩形外 = 区域外黑(LightingEngine.lightAt 同口径)→ 满补差 rgb(77,77,77)', () => {
    // 部件 tile 在光图外:lr 保持 0(非 255)→ 差值 = 0.3×255 = 76.5 → 77
    const f = makeFixture({ light: [0, 0, 0] });
    // 光图挪到别处(lrx=900):部件 tile (505,505) 落区外
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      f.fake, [f.part], f.cam, 1512, 862,
      f.light.r, f.light.g, f.light.b, 900, 900, 1, 1,
    );
    expect(f.scratchOps).toContain('fill:rgb(77,77,77)');
  });

  it('behindTiles 核心 398 同样补差(SetDefaults behindTiles=true,加性不破 z 序)', () => {
    const f = makeFixture({ light: [0, 0, 0], behind: true });
    const core = Enemy.fromVanilla(398, (f.lrx + 0.5) * TILE, (f.lry + 0.5) * TILE)!;
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      f.fake, [core], f.cam, 1512, 862,
      f.light.r, f.light.g, f.light.b, f.lrx, f.lry, 1, 1,
    );
    expect(f.draws.filter(d => d === '398').length).toBe(2);
    expect(f.mainOps).toContain('main:lighter');
  });

  it('剔除门:出屏/fullbright 均不补', () => {
    const off = makeFixture({ light: [0, 0, 0], screen: [-2000, 300] });
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      off.fake, [off.part], off.cam, 1512, 862,
      off.light.r, off.light.g, off.light.b, off.lrx, off.lry, 1, 1,
    );
    expect(off.draws).toEqual([]);
    const fb = makeFixture({ light: [0, 0, 0], fullbright: true });
    (Renderer.prototype as unknown as {
      applyMoonLordLightFloor: (
        e: unknown[], c: unknown, vw: number, vh: number,
        lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).applyMoonLordLightFloor.call(
      fb.fake, [fb.part], fb.cam, 1512, 862,
      fb.light.r, fb.light.g, fb.light.b, fb.lrx, fb.lry, 1, 1,
    );
    expect(fb.draws).toEqual([]);
  });
});
