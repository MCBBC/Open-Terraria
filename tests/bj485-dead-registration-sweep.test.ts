// ★BJ485 post-window 无效登记清扫（BJ481 同族观察全仓普查收官闸）。
//
// 判据模型（源码锚,GLShimExecutor.ts）:
//   · shim 登记面（markDynamic/uploadScratchBake→uploadScratchNow）的唯一消费点 =
//     shim drawImage 队列化时刻（drawImage→push :1143-1151 读 bakedTexPending/
//     bakedTexMulti/dynamicSrc）;uploadScratchNow 头部守卫 `!this.active` 早退
//     =窗关相位【保证零上传】。
//   · 窗语义:acc 缺省路径（bgl/bglshim/b2b/cloudpipe 缺省全开）=beginWorldLayer
//     （attachAcc）→ compositeLight 头 finishAccFrame（flush+detach）整层单窗;
//     bridge 态（?b2b=0）=ent/behind 分窗（bglEntWindowBegin/End）;endWorldLayer
//     后（render 7x 系列）恒 raw 主画布 2D,任何模式下 shim 均 inactive。
//   · 窗外 raw 2D drawImage 即时读当前字节——「变体① flush 期读末次烘焙字节」
//     前提（blit 被桥接进 shim 队列）不成立;登记态不影响 raw 直绘（BJ481 Arm C
//     判例）。窗外登记的实际浪费=markDynamic/dynKeys 死账+scratchBakeSeqs 环形
//     账簿+假前提注释误导后续审计。
//
// 普查清单（全仓 uploadScratchBake/markDynamic 调用位逐点定谳,2026-10-03）:
//   【摘除】N1 bv:<id>（drawBrightVines,原 :13829）——唯一调用方 render 7c
//           （endWorldLayer+compositeLight finishAccFrame 之后）恒窗外;全相位死。
//   【摘除】N2 wingTint ×4（drawWingOverlay 内 dyeScratch/addScratch/nebula 支/
//           arkhalis 支,原 :16044/:16064/:16187/:16253）——drawWingOverlay 唯一
//           调用方=flushWingGlow（render 7e,窗外）,:15052 翼案约束注自证「本槽
//           仅限窗外消费者」=全相位死。BJ481 债面漏列,本刀普查补杀。
//   【销案保留】V1 faelingSil/faelingTint（faelingPremultLayer）——缺省 acc 整层窗
//           内拴绳微光之灵 drawLeashedFaeling（render 3.8 段 drawLeashedEntities,
//           窗内）逐层消费 pending 纹理,摘除即 17 段拖尾错字节回归（变体①真病
//           在此面成立）;敌怪 7d' drawFaeling/仙灵 7d'' drawFairyBright 窗外调用
//           经 !active 自判 no-op 零白付。BJ481 债面「faeling 无效」摘要被推翻。
//   【销案保留】V2 dust s1/s2 markDynamic + dustTint/dustColor/dustDye bake——
//           lit pass（4.48,ent 窗内/acc 整层窗内）消费;fullbright 7d 共享位点
//           窗外自判 no-op。
//   【销案保留】V3 mountTintCanvas markDynamic + mountTint bake ×3——drawMountLayer
//           ← drawPlayer（ent 窗内 5903-6074）。
//   【销案保留】V4 boltBake（proj1457 bakeBolt）——弹幕自带 draw（ent 窗内）,
//           I 类修复本体（p0b-bolt-bake/bolt-bake-multibolt-key 既有锁）。
//   【销案保留】V5 液 gate markDynamic（前景水 warp 回退支）——acc 整层窗内消费。
//   【销案保留】V6 markWorldDynamicScratch API（shineCell 钩 tile 段窗内/empressTint
//           弹幕窗内;shineslice/uploadScratchNow 窗关返回 no-op/false=设计内回退）。
//   【销案保留】V7 registerDustPair（纯 Map 账零上传;lit pass 窗内消费）。
//   【界外】GLShimExecutor 内部 this.markDynamic(sc) ×4（栅格化 scratch,仅 active
//           时可达=定义性窗内）。
//
// 变异证红映射（逐字节还原+sha256 对拍,证据见报告）:
//   M1  drawBrightVines 回加 uploadScratchBake('bv:…')     → T4 红（行为负向锁）
//                                                          + C1 红（家族复活）
//   M2  drawWingOverlay 回加 uploadScratchBake('wingTint') → C1/C2/C5 红（结构负向锁）
//   M3  faelingSil 登记摘除                                → C3 红（有效位销案锚）
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { Enemy } from '../src/entities/Enemy';
import { TILE } from '../src/core/constants';
import { Renderer } from '../src/render/Renderer';

const RDR = readFileSync(join(__dirname, '../src/render/Renderer.ts'), 'utf8');
const PROJ = readFileSync(join(__dirname, '../src/entities/proj1457.ts'), 'utf8');
const SHIM = readFileSync(join(__dirname, '../src/render/glshim/GLShimExecutor.ts'), 'utf8');

/** 提取含 marker 的函数体（brace 配对;受检函数体无字面 '{'/'}' 字符串） */
function fnBody(src: string, marker: string): string {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  const j = src.indexOf('{', i);
  if (j < 0) return '';
  let depth = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return src.slice(i);
}

// ===================== 相位判据（源序锁:窗界标记唯一串 indexOf 链） =====================
describe('★BJ485 相位判据:窗界源序+机制锚（普查表的判定基础）', () => {
  it('P1 acc 整层窗覆盖拴绳段;render 7x 系列恒在 compositeLight 收口之后（窗外）', () => {
    const anchors = [
      'const worldLayer = this.beginWorldLayer(viewW, viewH, wK);',
      'this.drawLeashedEntities(leashed, world,',
      "this.bglEntWindowBegin('ent');",
      'this.drawVanillaDustPass(false, cam, player);',
      'this.endWorldLayer(mainCtx);',
      'this.compositeLight(cam, viewW, viewH, lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);',
      'this.applyMoonLordLightFloor(entities, cam, viewW, viewH,',
      'this.drawBrightVines(entities, cam, z, lightR, lightG, lightB, lightRX, lightRY, lightRW, lightRH);',
      'this.drawVanillaDustPass(true, cam, player);',
      'this.drawFaeling(ent, world)',
      'this.flushWingGlow(cam, z);',
    ];
    const idx = anchors.map((s) => {
      const i = RDR.indexOf(s);
      expect(i, `相位锚缺失: ${s}`).toBeGreaterThan(0);
      return i;
    });
    const [begin, leashed, entWin, dustLit, endWorld, composite, moonlord, vines, dustFull, faeling, wingFlush] = idx;
    // 窗内:beginWorldLayer < 拴绳段(3.8) < ent 窗 < 尘 lit(4.48) < endWorldLayer
    expect(begin).toBeLessThan(leashed);
    expect(leashed).toBeLessThan(entWin);
    expect(entWin).toBeLessThan(dustLit);
    expect(dustLit).toBeLessThan(endWorld);
    // 窗外:compositeLight（finishAccFrame 收口点）< 7b' 月总 < 7c 茎蔓 < 7d 尘全亮
    //      < 7d' 飞灵 < 7e 翼 flush——本刀两摘除面（N1/N2）皆在此域
    expect(endWorld).toBeLessThan(composite);
    expect(composite).toBeLessThan(moonlord);
    expect(moonlord).toBeLessThan(vines);
    expect(vines).toBeLessThan(dustFull);
    expect(dustFull).toBeLessThan(faeling);
    expect(faeling).toBeLessThan(wingFlush);
  });

  it('P2 摘除面调用图:drawBrightVines/drawWingOverlay 唯一调用方均在窗外域', () => {
    // drawBrightVines 全仓唯一调用点（render 7c,P1 已锚其在 compositeLight 后）
    expect(RDR.split('this.drawBrightVines(entities, cam, z,').length - 1).toBe(1);
    // drawWingOverlay 全仓唯一调用点=flushWingGlow 体内（:15052 翼案约束自证窗外）
    expect(RDR.split('this.drawWingOverlay(').length - 1).toBe(1);
    expect(fnBody(RDR, 'private flushWingGlow(')).toContain('this.drawWingOverlay(');
    // flushWingGlow 全仓唯一调用点在 compositeLight 之后（7e）
    expect(RDR.split('this.flushWingGlow(cam, z);').length - 1).toBe(1);
    const iComp = RDR.indexOf('this.compositeLight(cam, viewW, viewH');
    const iFlush = RDR.indexOf('this.flushWingGlow(cam, z);');
    expect(iFlush).toBeGreaterThan(iComp);
  });

  it('P3 机制锚:uploadScratchNow !active 早退（窗外登记零上传）+drawImage 队列化消费点', () => {
    // 守卫本体（本刀判定模型的根;摘除=窗外登记开始真上传,须重评全部判决）
    expect(SHIM).toContain('uploadScratchNow(img: HTMLCanvasElement, key: string, rw?: number, rh?: number,');
    expect(SHIM).toContain('if (!this.active || !this.glw || this.glw.unavailable) return;');
    // 消费点=shim drawImage 队列化时刻（窗内才有）
    expect(SHIM).toContain('const pre = this.bakedTexPending && this.bakedTexPending.img === img');
    expect(SHIM).toContain('this.bakedTexMulti.get(img as object) ?? null');
    expect(SHIM).toContain('this.dynamicSrc.has(img), null, pre?.tex ?? null, pre?.snap ?? null, pre?.tint);');
  });
});

// ===================== 普查闭环锁（登记位白名单;新位/复活位=爆红） =====================
describe('★BJ485 普查闭环:全仓 uploadScratchBake/markDynamic 位点白名单', () => {
  it('C1 uploadScratchBake 家族=7 有效族钉数;bv/wingTint 死族不得复活', () => {
    const fams = new Map<string, number>();
    for (const src of [RDR, PROJ]) {
      for (const m of src.matchAll(/uploadScratchBake\((?:[^(),]*,\s*)*'([^']+)'/g)) {
        fams.set(m[1]!, (fams.get(m[1]!) ?? 0) + 1);
      }
    }
    // 有效位销案锚（判定见头注普查表;V4 bolt 的 I 类判据在 p0b-bolt-bake 锁）
    expect(fams.get('dustTint')).toBe(1);
    expect(fams.get('dustColor')).toBe(1);
    expect(fams.get('dustDye')).toBe(1);
    expect(fams.get('faelingSil')).toBe(1);
    expect(fams.get('faelingTint')).toBe(1);
    expect(fams.get('mountTint')).toBe(3);
    expect(fams.get('boltBake')).toBe(1);
    // 死族负向锁（M1/M2 复活→红）
    expect(fams.has('bv'), 'bv:登记已摘（BJ485 N1）不得复活').toBe(false);
    expect(fams.has('wingTint'), 'wingTint:登记已摘（BJ485 N2）不得复活').toBe(false);
    // 未知新家族=未过普查（须先定谳窗内消费点再入表）
    // ★BJ-C9（2026-10-08）机械登记：empGhostTint=E51b（2026-10-07）逐调 scratch
    //  现烘现画族（Renderer empGhostTinted,?empscratch=0 逃生门;定谳注见 E51b 段）,
    //  上批落刀漏登记白名单（域外补登记,非 C9 域内改动）。
    const known = ['dustTint', 'dustColor', 'dustDye', 'faelingSil', 'faelingTint', 'mountTint', 'boltBake', 'empGhostTint'];
    const unknown = [...fams.keys()].filter((k) => !known.includes(k));
    expect(unknown, `未定谳登记家族: ${unknown.join(',')}`).toEqual([]);
  });

  it('C2 Renderer markDynamic 位点=6 钉形（gate/API/uploadScratchBake 内部/尘×2/坐骑染面）', () => {
    const sites = RDR.split('\n').filter((l) => l.includes('.markDynamic('));
    expect(sites).toHaveLength(6);
    const shape = (s: string): string =>
      s.includes('markDynamic(gate)') ? 'gate'
        : s.includes('markDynamic(img)') ? 'img'
          : s.includes('markDynamic(s1)') ? 's1'
            : s.includes('markDynamic(s2)') ? 's2'
              : s.includes('markDynamic(this.mountTintCanvas!)') ? 'mount'
                : 'UNKNOWN';
    const kinds = sites.map((l) => shape(l)).sort();
    expect(kinds).toEqual(['gate', 'img', 'img', 'mount', 's1', 's2']);
  });

  it('C3 有效位本体锚（V1/V2/V3/V4/V5/V6 各面登记语句仍在位;M3 变异红点）', () => {
    // V1 faeling（faelingPremultLayer 体;销案锚注释在位——摘除任一行即红）
    const faelingBody = fnBody(RDR, 'private faelingPremultLayer(');
    expect(faelingBody).toContain("this.uploadScratchBake(silC, 'faelingSil', 256);");
    expect(faelingBody).toContain("this.uploadScratchBake(tintC, 'faelingTint', 256);");
    expect(RDR).toContain('★BJ485 销案锚（2026-10-03）:登记有效【保留】');
    // 消费方在位:拴绳微光之灵 → faelingPremultLayer（acc 窗内逐层消费的真载体）
    const leashedBody = fnBody(RDR, 'private drawLeashedFaeling(');
    expect(leashedBody).toContain('this.faelingPremultLayer(');
    // V2 dust（drawVanillaDustPass 体）
    const dustBody = fnBody(RDR, 'private drawVanillaDustPass(');
    expect(dustBody).toContain('sh.markDynamic(s1);');
    expect(dustBody).toContain('sh.markDynamic(s2);');
    expect(dustBody).toContain("this.uploadScratchBake(s1, 'dustTint', Renderer.DUST_BAKE_RING");
    expect(dustBody).toContain("this.uploadScratchBake(s2, 'dustColor', Renderer.DUST_BAKE_RING");
    expect(dustBody).toContain("this.uploadScratchBake(s2, 'dustDye', Renderer.DUST_BAKE_RING");
    // V3 mount（drawMountLayer 体 + mountTintScratch 登记点）
    expect(fnBody(RDR, 'private drawMountLayer(')).toContain("this.uploadScratchBake(c, 'mountTint', 64);");
    expect(RDR).toContain('this.bglShimReg().markDynamic(this.mountTintCanvas!);');
    // V5 液 gate
    expect(RDR).toContain('this.bglShimReg().markDynamic(gate);');
    // V6 API 面 + 消费方
    expect(RDR).toContain('markWorldDynamicScratch(img: HTMLCanvasElement, key?: string,');
    expect(RDR).toContain('setShineScratchBakeHook((c, key) => this.markWorldDynamicScratch(c, key));');
    // V4 boltBake
    expect(PROJ).toContain("r9.uploadScratchBake(sc, 'boltBake', 1024, sx, sy);");
  });
});

// ===================== N1 行为锁:drawBrightVines 摘除后绘制形态逐段同构 =====================
interface Op { op: string; src?: unknown; args?: unknown[]; gco?: string; fill?: string }

function makeVineRig() {
  const mainOps: Op[] = [];
  const scratchOps: Op[] = [];
  const uploadCalls: unknown[][] = [];
  const markCalls: unknown[][] = [];
  const mainCtx = {
    save: () => mainOps.push({ op: 'save' }),
    restore: () => mainOps.push({ op: 'restore' }),
    translate: (...a: unknown[]) => mainOps.push({ op: 'translate', args: a }),
    rotate: (...a: unknown[]) => mainOps.push({ op: 'rotate', args: a }),
    drawImage(src: unknown, ...args: unknown[]) { mainOps.push({ op: 'draw', src, args }); },
  };
  const scratchState = { gco: 'source-over', fill: '' };
  const scratchCtx = {
    setTransform: (...a: unknown[]) => scratchOps.push({ op: 'xf', args: a }),
    clearRect: (...a: unknown[]) => scratchOps.push({ op: 'clear', args: a }),
    drawImage(src: unknown, ...args: unknown[]) {
      scratchOps.push({ op: 'draw', src, args, gco: scratchState.gco });
    },
    fillRect(...args: unknown[]) {
      scratchOps.push({ op: 'fill', args, gco: scratchState.gco, fill: scratchState.fill });
    },
    get globalCompositeOperation() { return scratchState.gco; },
    set globalCompositeOperation(v: string) { scratchState.gco = v; },
    set fillStyle(v: string) { scratchState.fill = String(v); },
  };
  const scratchCanvas = { width: 0, height: 0, getContext: () => scratchCtx };
  const chainImg = { tag: 'chain24' };
  const atlas = {
    vmisc: (f: string) => (f === 'vanilla/Chain24.png'
      ? { img: chainImg, sx: 0, sy: 0, sw: 16, sh: 16 }
      : null),
  };
  const fake = {
    ctx: mainCtx,
    atlas,
    brightVineScratch: scratchCanvas,
    uploadScratchBake: (...a: unknown[]) => { uploadCalls.push(a); },
    markWorldDynamicScratch: (...a: unknown[]) => { markCalls.push(a); },
  };
  const cam = { zoom: 1, worldToScreen: () => [100, 100] as [number, number] };
  const run = (enemies: Enemy[], lr?: Uint8Array, lg?: Uint8Array, lb?: Uint8Array): void => {
    (Renderer.prototype as unknown as {
      drawBrightVines: (
        e: unknown[], c: unknown, z: number,
        l0: Uint8Array, l1: Uint8Array, l2: Uint8Array,
        x: number, y: number, w: number, h: number,
      ) => void;
    }).drawBrightVines.call(fake as unknown as Renderer, enemies, cam, 1,
      lr ?? new Uint8Array(64).fill(255),
      lg ?? new Uint8Array(64).fill(255),
      lb ?? new Uint8Array(64).fill(255),
      130, 130, 8, 8);
  };
  /** 锚格 floor(ai)=132 ∈ [130,138) → li=(132-130)*8+(132-130)=18（光读点确定性） */
  const makeVine = (): Enemy => {
    const e = Enemy.fromVanilla(259, 2000 * TILE, 2000 * TILE)!;
    e.ai0 = 132.4;
    e.ai1 = 132.4;
    return e;
  };
  return { mainOps, scratchOps, uploadCalls, markCalls, chainImg, scratchCanvas, run, makeVine };
}

describe('★BJ485 N1 drawBrightVines:登记摘除（零调用负向锁）+逐段烘焙/贴回形态不回归', () => {
  it('T4 负向锁:茎蔓面零登记调用（M1 变异红:回加 uploadScratchBake/markWorldDynamicScratch）', () => {
    const f = makeVineRig();
    f.run([f.makeVine()]);
    expect(f.uploadCalls, '窗外零消费点=登记零收益（BJ485 N1 定谳;回加=M1）').toEqual([]);
    expect(f.markCalls).toEqual([]);
    // 双保险:面体内无登记语句（结构性）
    const body = fnBody(RDR, 'private drawBrightVines(');
    expect(body).not.toContain('uploadScratchBake');
    expect(body).not.toContain('markWorldDynamicScratch');
    expect(body).not.toContain('.markDynamic(');
  });

  it('T5 绘制形态:逐段 drawImage→source-atop 乘色 fill→旋转贴回;锚格光 (40,60,70) 钳 rgb(100,150,255)', () => {
    const f = makeVineRig();
    const li = (132 - 130) * 8 + (132 - 130);
    const lr = new Uint8Array(64).fill(255); lr[li] = 40;
    const lg = new Uint8Array(64).fill(255); lg[li] = 60;
    const lb = new Uint8Array(64).fill(255); lb[li] = 70;
    f.run([f.makeVine()], lr, lg, lb);
    const draws = f.scratchOps.filter((o) => o.op === 'draw');
    const fills = f.scratchOps.filter((o) => o.op === 'fill');
    const blits = f.mainOps.filter((o) => o.op === 'draw');
    // 逐段:烘焙 draw 与乘色 fill 恰 1:1;贴回 blit 与段数 1:1（≥2 段=链式步进成立）
    expect(draws.length).toBe(fills.length);
    expect(draws.length).toBe(blits.length);
    expect(draws.length).toBeGreaterThanOrEqual(2);
    // 烘焙源=Chain24 切片（img+8 参形式,src 高=sh=min(seg,16) ∈ (0,16],dst 高同值）
    for (const d of draws) {
      expect(d.src).toBe(f.chainImg);
      expect(d.args).toHaveLength(8);
      const sh = d.args![3] as number;
      expect(sh).toBeGreaterThan(0);
      expect(sh).toBeLessThanOrEqual(16);
      expect(d.args![7]).toBe(sh);
    }
    // 乘色 fill=source-atop 全幅;下限钳 (:22467-22477):max(40,100)=100/max(60,150)=150/B 恒 255
    expect(fills[0]!.gco).toBe('source-atop');
    expect(fills[0]!.fill).toBe('rgb(100,150,255)');
    // 贴回=主画布 raw drawImage(scratch)（save/translate/rotate/restore 包裹）
    for (const b of blits) expect(b.src).toBe(f.scratchCanvas);
    expect(f.mainOps.filter((o) => o.op === 'rotate')).toHaveLength(blits.length);
    expect(f.mainOps.filter((o) => o.op === 'save')).toHaveLength(blits.length);
    expect(f.mainOps.filter((o) => o.op === 'restore')).toHaveLength(blits.length);
    // scratch 段前重置（身份 setTransform+clearRect）
    expect(f.scratchOps[0]!.op).toBe('xf');
    expect(f.scratchOps[1]!.op).toBe('clear');
  });

  it('T6 钳位地板:全 0 光 → rgb(100,150,255);全亮光 → rgb(255,255,255)（地板非乘光）', () => {
    const f = makeVineRig();
    f.run([f.makeVine()], new Uint8Array(64), new Uint8Array(64), new Uint8Array(64));
    expect(f.scratchOps.find((o) => o.op === 'fill')!.fill).toBe('rgb(100,150,255)');
    const g = makeVineRig();
    g.run([g.makeVine()]);   // 缺省全 255
    expect(g.scratchOps.find((o) => o.op === 'fill')!.fill).toBe('rgb(255,255,255)');
  });

  it('T7 死登记复活哨:rig 的登记 spy 换 throw 版重跑（回加即炸,M1 变异等价面）', () => {
    const f = makeVineRig();
    const hostile = {
      ctx: {
        save() { }, restore() { }, translate() { }, rotate() { }, drawImage() { },
      },
      atlas: { vmisc: () => ({ img: { tag: 'c' }, sx: 0, sy: 0, sw: 16, sh: 16 }) },
      brightVineScratch: f.scratchCanvas,
      uploadScratchBake: () => { throw new Error('M1: bv 死登记复活'); },
      markWorldDynamicScratch: () => { throw new Error('M1: bv 死登记复活'); },
    };
    (Renderer.prototype as unknown as {
      drawBrightVines: (e: unknown[], c: unknown, z: number,
        l0: Uint8Array, l1: Uint8Array, l2: Uint8Array,
        x: number, y: number, w: number, h: number) => void;
    }).drawBrightVines.call(hostile as unknown as Renderer,
      [f.makeVine()], { zoom: 1, worldToScreen: () => [100, 100] as [number, number] }, 1,
      new Uint8Array(64), new Uint8Array(64), new Uint8Array(64), 130, 130, 8, 8);
    // 走到此处=零登记调用（throw 未触发）
    expect(f.scratchOps.filter((o) => o.op === 'fill').length).toBeGreaterThanOrEqual(2);
  });
});
