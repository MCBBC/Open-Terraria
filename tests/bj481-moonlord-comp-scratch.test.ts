// ★BJ481 MoonLord 补差刮擦布定谳闸（Z4 登记债销案 + 真病落刀锁）。
//
// 定谳（2026-10-03,探针实证链 scripts/_bj481-ml-compscratch-probe.mjs +
// _bj481-scratch-forensics.mjs + _bj481-manual-bake-ab.mjs,证据 docs/evidence/bj481/）:
//   ① Z4 同病嫌疑【销案】——本面非 VoidLens 刮擦布桥接蒸发:applyMoonLordLightFloor
//     的补差 blit 在 render 7b'（compositeLight→finishAccFrame 收口之后）恒落 raw
//     主画布 2D,shim 窗（beginWorldLayer attachAcc..finishAccFrame）内零消费点;
//     实机 Arm C:已 uploadScratchBake→markDynamic 登记的画布在 raw-ctx 'lighter'
//     直绘逐通道精确落画布 (200,100,50)——「HUD 相位登记画布被桥接成 world-GL quad」
//     不适用于 raw 主画布相位。
//   ② 真病=旧三步烘焙第 3 步在 destination-in 下【重放 drawPart】:destination-in
//     是整画布算子,部件本体=多精灵合成（398=双臂×2+躯干半×2+胸甲+心帧 6+ drawImage,
//     396/397 同族多 draw）→ 逐 draw ∩ 各自 α 域,不相交精灵域互相擦除=补差自 G12
//     起整绘蒸发（GL/2D 两态同病,与 shim 登记无关）。实机:8/8 blit scratch 全透明;
//     手工对拍:仅 step1=247,135 不透明 px,全三步=0。修=掩膜快照布（mlFloorMaskScratch,
//     永不落主画布/不入 shim 登记域）单 drawImage 恢复合成 α。
//   ③ uploadScratchBake('mlfloor') 拆除:窗内零消费点=登记零收益,bgl 会话白付
//     4 部件×bbox 纹理上传/帧;旧变体①注释「flush 期读末部件字节」前提（blit 被
//     桥接）不成立。
//
// 变异证红映射:
//   M1  第 3 步回退 destination-in 下重放 drawPart   → T1 红（drawPart 复调+mask 零消费）
//   M2  回加 uploadScratchBake/markWorldDynamicScratch → T3 红（登记负向锁）
//   M3  补差 blit gCO 'lighter' 破坏/摘除            → T2 红（落画布锁）
//   M4  掩膜快照摘除（destination-in 直用 scratch 前 ISO）→ T1 红（mask 零快照）
//   M5  差值色 0.3 系数/区域外黑语义破坏              → T4 红（钉值）
import { describe, it, expect, vi } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { Renderer } from '../src/render/Renderer';

// ===================== 录制桩（moonlord-ellipse-parity 同构,gCO 读属性现值） =====================
interface Op { op: string; gco?: string; src?: unknown; args?: unknown[] }
function makeScratchRig(tag: string) {
  const ops: Op[] = [];
  const ctx = {
    _tag: tag,
    width: 0, height: 0,
    fillStyle: '',
    globalCompositeOperation: 'source-over',
    setTransform(...a: unknown[]) { ops.push({ op: 'xf', args: a }); },
    clearRect(...a: unknown[]) { ops.push({ op: 'clear', args: a }); },
    fillRect(this: { fillStyle: string }, ...a: unknown[]) {
      ops.push({ op: 'fill', args: a, gco: String(this.fillStyle) });
    },
    drawImage(this: { globalCompositeOperation: string }, src: unknown, ...a: unknown[]) {
      ops.push({ op: 'draw', src, args: a, gco: String(this.globalCompositeOperation) });
    },
    save() { ops.push({ op: 'save' }); },
    restore() { ops.push({ op: 'restore' }); },
    translate() { ops.push({ op: 'translate' }); },
    rotate() { ops.push({ op: 'rotate' }); },
    scale() { ops.push({ op: 'scale' }); },
  };
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  return { ops, ctx, canvas };
}

describe('★BJ481 applyMoonLordLightFloor 补差烘焙（destination-in 自擦除定谳+修后形态锁）', () => {
  function makeFixture(opts: { light?: [number, number, number]; screen?: [number, number] } = {}) {
    const main = makeScratchRig('main');
    const scratchRig = makeScratchRig('mlfloor');
    const maskRig = makeScratchRig('mlmask');
    const partDraws: number[] = [];
    const uploadCalls: unknown[][] = [];
    const markCalls: unknown[][] = [];
    const fake = {
      ctx: main.ctx,
      mlFloorScratch: scratchRig.canvas,
      mlFloorMaskScratch: maskRig.canvas,
      uploadScratchBake: (...a: unknown[]) => { uploadCalls.push(a); },
      markWorldDynamicScratch: (...a: unknown[]) => { markCalls.push(a); },
      fullbright: false,
      drawMoonLordCore: () => partDraws.push(398),
      drawMoonLordHand: () => partDraws.push(397),
      drawMoonLordHead: () => partDraws.push(396),
      drawMoonLordFreeEye: () => partDraws.push(400),
    };
    const [lr, lg, lb] = opts.light ?? [0, 0, 0];
    const light = {
      r: new Uint8Array([lr]), g: new Uint8Array([lg]), b: new Uint8Array([lb]),
    };
    const cam = {
      zoom: 1,
      x: 0, y: 0,
      worldToScreen: () => (opts.screen ?? [600, 500]),
    };
    const run = (parts: Enemy[], lrx = 500, lry = 500) => {
      (Renderer.prototype as unknown as {
        applyMoonLordLightFloor: (
          e: unknown[], c: unknown, vw: number, vh: number,
          lr: Uint8Array, lg: Uint8Array, lb: Uint8Array,
          x: number, y: number, w: number, h: number,
        ) => void;
      }).applyMoonLordLightFloor.call(
        fake as unknown as Renderer, parts, cam, 1512, 862,
        light.r, light.g, light.b, lrx, lry, 1, 1,
      );
    };
    return { fake, main, scratchRig, maskRig, partDraws, uploadCalls, markCalls, run, cam };
  };

  it('T1 三步烘焙修后形态:drawPart 单次 + 掩膜快照单 op + destination-in 单 drawImage(mask)',
    () => {
      const f = makeFixture();
      const head = Enemy.fromVanilla(396, 500.5 * TILE, 500.5 * TILE)!;
      f.run([head]);
      // 部件绘制恰一次（M1:destination-in 下重放 drawPart → 2 → 红;旧法 6+ draw 互 ∩ 自擦除）
      expect(f.partDraws).toEqual([396]);
      // scratch 序:xf(世界变换) → draw?(部件桩不落) → xf → fill(multiply) → draw@destination-in
      const s = f.scratchRig.ops;
      expect(s.filter((o) => o.op === 'fill')).toHaveLength(1);
      expect(s.filter((o) => o.op === 'draw')).toHaveLength(1);
      const dstIn = s.find((o) => o.op === 'draw' && o.gco === 'destination-in');
      expect(dstIn, 'destination-in 恰一次').toBeTruthy();
      // ★负向锁:destination-in 的源=掩膜布（整幅合成 α 快照）,非部件精灵/非重放 drawPart
      expect(dstIn!.src).toBe(f.maskRig.canvas);
      // 掩膜布:恰一次快照（source-over,源=补差 scratch）+首帧 resize 路径无 clear
      const m = f.maskRig.ops;
      expect(m.filter((o) => o.op === 'draw')).toHaveLength(1);
      const mDraw = m.find((o) => o.op === 'draw')!;
      expect(mDraw.gco).toBe('source-over');
      expect(mDraw.src).toBe(f.scratchRig.canvas);
      // 2 参整幅快照（identity 变换域）
      expect(mDraw.args).toEqual([0, 0]);
    });

  it('T2 补差落画布锁:每部件恰一次 lighter blit @identity @scratch@bbox 原点（M3 变异红）',
    () => {
      const f = makeFixture({ screen: [600, 500] });
      const eye = Enemy.fromVanilla(400, 500.5 * TILE, 500.5 * TILE)!;   // RAD=90 → 精确 bbox
      f.run([eye]);
      const blits = f.main.ops.filter((o) => o.op === 'draw');
      expect(blits).toHaveLength(1);
      expect(blits[0]!.gco).toBe('lighter');
      expect(blits[0]!.src).toBe(f.scratchRig.canvas);
      // bx0=max(0,floor(600−90))=510 / by0=max(0,floor(500−90))=410;2 参形式
      expect(blits[0]!.args).toEqual([510, 410]);
      // scratch 尺寸 = bbox∩viewport = 180×180（396 族 RAD=470 同式放大）
      expect(f.scratchRig.canvas.width).toBe(180);
      expect(f.scratchRig.canvas.height).toBe(180);
    });

  it('T3 登记负向锁:补差面不走 uploadScratchBake/markWorldDynamicScratch（Z4 刮擦布纪律;M2 变异红）',
    () => {
      const f = makeFixture();
      const core = Enemy.fromVanilla(398, 500.5 * TILE, 500.5 * TILE)!;
      f.run([core]);
      expect(f.uploadCalls, '窗内零消费点=登记零收益（BJ481 定谳③）').toEqual([]);
      expect(f.markCalls).toEqual([]);
    });

  it('T4 差值色钉值:暗场 rgb(77,77,77)（0.3×255 区域外=黑语义）/部分光 rgb(47,17,62)',
    () => {
      const f = makeFixture({ light: [0, 0, 0] });
      const head = Enemy.fromVanilla(396, 500.5 * TILE, 500.5 * TILE)!;
      f.run([head]);
      const fill = f.scratchRig.ops.find((o) => o.op === 'fill')!;
      expect(fill.gco).toBe('rgb(77,77,77)');   // fillStyle 借 gco 槽记录（rig 约定）
      // 部分光照 (100,200,50) → 0.3×(255−L) 四舍五入 = (47,17,62)
      const f2 = makeFixture({ light: [100, 200, 50] });
      f2.run([head]);
      const fill2 = f2.scratchRig.ops.find((o) => o.op === 'fill')!;
      expect(fill2.gco).toBe('rgb(47,17,62)');
    });

  it('T4b 多部件逐件烘焙:掩膜/scratch 逐件重烤（第二件 resize-or-clear 面）+ blit 逐件落位',
    () => {
      const f = makeFixture({ screen: [600, 500] });
      const eye = Enemy.fromVanilla(400, 500.5 * TILE, 500.5 * TILE)!;
      const core = Enemy.fromVanilla(398, 500.5 * TILE, 500.5 * TILE)!;
      f.run([eye, core]);
      expect(f.partDraws).toEqual([400, 398]);
      // 每部件一次掩膜快照 + 一次 destination-in 恢复 + 一次 blit
      expect(f.maskRig.ops.filter((o) => o.op === 'draw')).toHaveLength(2);
      expect(f.scratchRig.ops.filter((o) => o.op === 'draw' && o.gco === 'destination-in'))
        .toHaveLength(2);
      const blits = f.main.ops.filter((o) => o.op === 'draw');
      expect(blits).toHaveLength(2);
      // 398 RAD=380:bx0=max(0,600−380)=220 / by0=max(0,500−380)=120
      expect(blits[0]!.args).toEqual([510, 410]);
      expect(blits[1]!.args).toEqual([220, 120]);
    });

  it('T5 全亮门:差值 0 → 整件跳过（零烘焙零 blit=零开销;探针 Arm A 同口径）', () => {
    const f = makeFixture({ light: [255, 255, 255] });
    const head = Enemy.fromVanilla(396, 500.5 * TILE, 500.5 * TILE)!;
    f.run([head]);
    expect(f.partDraws).toEqual([]);
    expect(f.scratchRig.ops).toEqual([]);
    expect(f.maskRig.ops).toEqual([]);
    expect(f.main.ops.filter((o) => o.op === 'draw')).toEqual([]);
  });
});
