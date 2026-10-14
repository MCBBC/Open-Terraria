// ★BJ679（2026-10-14）BJ676 水罩 veil 同性质九队列登记债收编——逐队列
// 源码锚锁（escapeVeilStroke 镜像在位+原版层序锚）+行为锁（recording-ctx
// 断言镜像 Stroke 序）。体裁沿用 bj676-lunar-water-veil（结构锁）与
// bj-c1-render-batch F4（recording-ctx 直调重放）。
//
// ── 定谳（Terarria1457 反编译亲读;Main.cs 共 67728 行,锚行号均为 1457 实测）──
// 原版主渲染序 Main.cs:63183-63266:
//   DoDraw_WallsTilesNPCs(:63183,内含 DrawNPCs→DrawNPCDirect :22723 族) →
//   DrawProjectiles(:63199,鞭 flag3 :36744-36749/弹幕 Drawer 拖尾) →
//   DrawPlayers_AfterProjectiles(:63204,玩家层组全链 PlayerDrawLayers.cs:
//   655 09_Wings/:3130 26_SolarShield/:3148 27_HeldItem/:4157 38_EyebrellaCloud)
//   → ParticleSystem_World_OverPlayers(:63207-63208 FadingParticles) →
//   DrawItems(:63226,掉落 glowMask :39408-39437) → DrawGore(:63230) →
//   DrawDust(:63241) → 【前景水 DrawWaters(:63248)/waterTarget over(:63256)】
//   → DrawWires(:63251/:63259) → InfernoRings(:63264) → 接口层。
// =本刀十队列全部在水前 → 水应罩 ✓;7g/7h/接口层在水后=正确不罩 ✓。
// 逐队列原版锚（1457 行号实测,146 后缀=SW 旧注释 1456 行号勘误处）:
//   7c 茎蔓      Main.cs:22842-22868（FungiBulb 259/GiantFungiBulb 260 下限色
//                100/150/255;DrawNPCDirect :22723 aiStyle 13 链段）
//   7d' 飞灵     Main.cs:24462 case 677 → DrawNPCDirect_Faeling :26809
//                （旧注 :26306-26368=1456 行号）
//   7d' 仙灵     NPCID: FairyCritterPink/Green/Blue=583/584/585（NPC 链 GetAlpha
//                Lerp(light,White,0.5)）
//   7d' 鹿角怪   Main.cs:26714 DrawNPCDirect_Deerclops（value2=(80,0,0,255)×0.5
//                :26743/color3=(255,30,30,66) :26795）
//   7d'' 粒子    Main.cs:63207-63208 ParticleSystem_World_OverPlayers
//   7d''' 四塔   Main.cs:24483-24520（422/493/507/517 vel4 四向
//                Color(64,64,64,0)×Opacity;516 SolarFlare 白罩/残影同域）
//   7e 翼光      PlayerDrawLayers.cs:655 DrawPlayer_09_Wings → :63204
//   7e 手持光罩  PlayerDrawLayers.cs:3148 DrawPlayer_27_HeldItem → :63204
//   7e 掉落光罩  Main.cs:39408-39437（DrawItems → :63226）
//   7e 眼球伞    PlayerDrawLayers.cs:4157 DrawPlayer_38_EyebrellaCloud → :63204
//   7e' 鞭线体   Main.cs:36744-36749 flag3（color2=color 免逐段取光）→
//                DrawProjectiles :63199（1034 星辰鞭）
//   7f 拖尾      弹幕 Drawer 全程不取光 → DrawProjectiles :63199（CPU 光栅路
//                接入;GL 路 obj55/obj58 渲入 glfx.canvas=余债）
//   白提亮       NPC 绘制链（DrawNPCDirect 族）→ DrawNPCs :63183
//
// ── 余债登记（本刀不碰 GL 路;回滚即红=下方锁面）──
// liqgl 批化 gate 路（FBO 回读,BJ676 既有）/ gladd itemGlow GL 会话消费面 /
// 拖尾 GL 路（obj55 SM2/obj58 tech,drawStripTrail onBlit 不触发）/
// projFullbrightQueue 闭包族（BJ278,消费位 flushTrailShade 内）/
// 翼光 overlay betsy(40)/trail45(45) 子函数链（mirrorPass 跳过）/
// 7d drawVanillaDustPass 全亮尘（DrawDust :63241 亦水前=同性质新登记）。
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const RDR = readFileSync(join(HERE, '..', 'src/render/Renderer.ts'), 'utf8');
const TRAIL = readFileSync(join(HERE, '..', 'src/fx/TrailShader.ts'), 'utf8');

/** 区块抽取:函数体起点至下一 private 声明（防跨函数误匹配） */
function body(src: string, sig: string, span = 9000): string {
  const i = src.indexOf(sig);
  expect(i, `签名未命中: ${sig}`).toBeGreaterThan(-1);
  const j = src.indexOf('\n  private ', i + sig.length);
  return src.slice(i, j > i ? Math.min(j, i + span) : i + span);
}

describe('★BJ679 §1 逐队列镜像在位锁（源码锚+escapeVeilStroke 调用）', () => {
  it('7c drawBrightVines:茎蔓段镜像（Main.cs:22842-22868→DrawNPCs :63183 水前）', () => {
    const b = body(RDR, 'private drawBrightVines(');
    expect(b).toContain('Main.cs:22842-22868');
    expect(b).toContain('DrawNPCs :63183 水前');
    expect(b).toContain('if (vm) this.escapeVeilStroke(');
    expect(b).toContain('const vm = this._veilActive ? ctx.getTransform() : null;');
    // 同式重放:镜像 drawImage 与直绘同 dest 矩形
    expect(b.match(/mc\.drawImage\(scratch, 0, 0, chain\.sw, sh,/g)?.length).toBe(1);
  });

  it("7d' drawFaeling:tgt 整函数重放（Main.cs:24462→DrawNPCDirect_Faeling :26809）", () => {
    const b = body(RDR, 'private drawFaeling(e: Enemy, world: World, tgt?: CanvasRenderingContext2D)');
    expect(b).toContain('DrawNPCDirect_Faeling :26809');
    expect(b).toContain('if (!tgt && this._veilActive) {');
    expect(b).toContain('const camM = ctx.getTransform();');
    expect(b).toContain('this.drawFaeling(e, world, mc);');
    // box=历史轨迹包络（与拖尾同索引域 num4..5 步 3）
    expect(b).toContain('for (let i = num4; i >= 5; i -= 3) {');
    expect(b).toContain('const pad = 40 + 14 * scale;');
  });

  it("7d' drawFairyBright:仙灵 583-585 镜像（FairyCritter→NPC 链→:63183 水前）", () => {
    const b = body(RDR, 'private drawFairyBright(e: Enemy)');
    expect(b).toContain('FairyCritterPink/Green/Blue');
    expect(b).toContain('DrawNPCs :63183 水前');
    expect(b).toContain('if (vm) this.escapeVeilStroke(');
    expect(b).toContain('mc.drawImage(img, 0, sy, fw, fh, -fw / 2, -fh / 2 + footFlush, fw, fh)');
  });

  it("7d' drawDeerclopsGlow:鹿角怪红雾镜像（Main.cs:26714,:26743/:26795）", () => {
    const b = body(RDR, 'private drawDeerclopsGlow(e: Enemy)');
    expect(b).toContain('DrawNPCDirect_Deerclops');
    expect(b).toContain(':26743');
    expect(b).toContain(':26795');
    expect(b).toContain('if (vm) this.escapeVeilStroke(');
    expect(b).toContain('mc.drawImage(c.c, c.x, c.y, c.w, c.h, -originX + l.dx, -originY + l.dy, sw, sh)');
  });

  it("7d'' drawFadingParticles:粒子镜像（Main.cs:63207-63208 水前;erase 拍不镜像登记）", () => {
    const b = body(RDR, 'private drawFadingParticles(cam: Camera, player?: Player): void', 11000);
    expect(b).toContain('Main.cs:63207-63208');
    expect(b).toContain('lighter 主拍 α=env 镜像,destination-out 削底拍不镜像');
    expect(b).toContain('if (vm) this.escapeVeilStroke(');
    expect(b).toContain('mc.drawImage(tinted, -tinted.width / 2, -tinted.height / 2)');
  });

  it("7d''' flushTowerGlow:四塔/516 残影镜像（Main.cs:24483-24520→:63183 水前）", () => {
    const b = body(RDR, 'private flushTowerGlow(cam: Camera, z: number, viewW: number, viewH: number): void', 14000);
    expect(b).toContain('Main.cs:24483-24520');
    expect(b).toContain('DrawNPCs :63183 水前');
    // 六镜像位:single/overlay/main × rot/norot
    expect(b.match(/this\.escapeVeilStroke\(/g)?.length).toBe(6);
    expect(b).toContain('const camT = this._veilActive ? ctx.getTransform() : null;');
  });

  it('7e flushWingGlow:主纹理镜像+overlay tgt 重放（PlayerDrawLayers.cs:655→:63204）', () => {
    const b = body(RDR, 'private flushWingGlow(cam: Camera, z: number): void', 12000);
    expect(b).toContain('PlayerDrawLayers.cs:655');
    expect(b).toContain('DrawPlayers_AfterProjectiles :63204 水前');
    expect(b).toContain('const wm = this._veilActive ? ctx.getTransform() : null;');
    expect(b).toContain('if (wm) this.escapeVeilStroke(');                                   // 主纹理
    expect(b).toContain('this.drawWingOverlay(e.p, e.slot, d, e.fr, cam, e.settled, e.clamp, e.vortexTint, e.dye, mc, true)');   // overlay 重放
  });

  it('7e flushItemGlow:op 级镜像（手持 :3148/:63204+掉落 :39408-39437/:63226 水前）', () => {
    const b = body(RDR, 'private flushItemGlow(): void', 12000);
    expect(b).toContain('PlayerDrawLayers.cs:3148 DrawPlayer_27_HeldItem');
    expect(b).toContain('Main.cs:39408-39437 DrawItems→:63226');
    expect(b).toContain('if (this._veilActive && gClamped > 0) {');
    expect(b).toContain('mc.drawImage(img, op.sx, sy, op.sw, op.sh, op.dx, op.dy, dWidth, dHeight)');
  });

  it('7e flushEyebrellaCloud:三拷贝镜像（PlayerDrawLayers.cs:4157→:63204 水前）', () => {
    const b = body(RDR, 'private flushEyebrellaCloud(cam: Camera, z: number): void');
    expect(b).toContain('PlayerDrawLayers.cs:4157');
    expect(b).toContain('const veilBase = this._veilActive ? ctx.getTransform() : null;');
    expect(b).toContain('if (veilBase) this.escapeVeilStroke(');
    expect(b).toContain('mc.drawImage(e.src as CanvasImageSource,');
  });

  it("7e' flushWhipFullbright:段级镜像（flag3 :36747-36749→DrawProjectiles :63199 水前）", () => {
    const b = body(RDR, 'private flushWhipFullbright(cam: Camera, z: number): void');
    expect(b).toContain('DrawProjectiles :63199 水前');
    expect(b).toContain(':36747-36749');
    expect(b).toContain('const qm = this._veilActive ? ctx.getTransform() : null;');
    expect(b).toContain('mc.drawImage(tinted, 0, 0, tex.width, tex.height,');
  });

  it("7f flushTrailShade:onBlit 钩子镜像（DrawProjectiles :63199 水前;GL 路余债注）", () => {
    const b = body(RDR, 'private flushTrailShade(cam: Camera, z: number, viewW: number, viewH: number): void', 11000);
    expect(b).toContain('DrawProjectiles :63199');
    expect(b).toContain('const veilCamM = this._veilActive ? ctx.getTransform() : null;');
    expect(b).toContain('drawStripTrail(ctx, this, spec, veilCamM ? (bi) => {');
    expect(b).toContain('GL 路');
    // TrailShader 侧:CPU blit 位触发 onBlit（GL 路早退不触发）
    expect(TRAIL).toContain('onBlit?: (info: {');
    expect(TRAIL).toContain('if (onBlit) onBlit({ canvas: scratch, sw: rw, sh: rh, dx: bx, dy: by, dw: bw, dh: bh });');
  });

  it('flushNpcWhiteLift:白提亮镜像（NPC 链→DrawNPCs :63183 水前;tintA 支 lighter 主拍）', () => {
    const b = body(RDR, 'private flushNpcWhiteLift(cam: Camera, z: number, viewW: number, viewH: number): void', 11000);
    expect(b).toContain('DrawNPCs :63183 水前');
    expect(b).toContain('if (this._veilActive) {');
    expect(b).toContain("const gaM = q.tintA !== undefined ? 1 : (q.ga ?? npcWhiteLiftAlpha(q.vid) ?? 0.4);");
    expect(b).toContain('mc.drawImage(imgT, 0, q.sy, q.sw, q.sh, -q.sw / 2, q.by, q.sw, q.sh)');
  });
});

describe('★BJ679 §2 谓词扩区+会话域（drawLiquids/render）', () => {
  it('veil676 谓词含九路新队列+实体直绘族（veilEntities）+FadingParticles', () => {
    expect(RDR).toContain('|| this.itemGlowQueue.length > 0 || this.wingGlowQueue.length > 0');
    expect(RDR).toContain('|| this.eyebrellaQueue.length > 0 || this.whipFullbrightQueue.length > 0');
    expect(RDR).toContain('|| this.trailShadeQueue.length > 0 || this.towerGlowQueue.length > 0');
    expect(RDR).toContain('|| this.npcWhiteLiftQueue.length > 0 || veil679Ent || veil679Fade;');
    // 实体直绘族 ID 面:677/668/583-585/259-260
    expect(RDR).toContain("n.vanillaId === 677 || n.vanillaId === 668");
    expect(RDR).toContain('n.vanillaId === 583 || n.vanillaId === 584 || n.vanillaId === 585');
    // fg pass 传 entities,bg 缺省空表零扫
    expect(RDR).toContain('veilEntities: Entity[] = []) {');
    expect(RDR).toContain('this.drawLiquids(world, cam, viewW, viewH, z, false, entities);');
  });

  it('drawWingOverlay:tgt/mirrorPass 参数+betsy/trail45 子链跳过（余债登记）', () => {
    const b = body(RDR, 'private drawWingOverlay(p: Player, slot: number,', 26000);
    expect(b).toContain('tgt?: CanvasRenderingContext2D, mirrorPass = false): void');
    expect(b).toContain('const ctx = tgt ?? this.ctx;');
    expect(b.match(/if \(mirrorPass\) break;/g)?.length).toBe(2);
  });

  it('余债登记注在位（GL 面/子链面/新登记 7d 尘）——回滚收编即红', () => {
    expect(RDR).toContain('liqgl 批化帧 gate 路（FBO 回读,BJ676 既有）');
    expect(RDR).toContain('拖尾 GL 路（obj55 SM2/obj58 tech 渲入');
    expect(RDR).toContain('翼光 overlay 的 betsy(40)/trail45(45) 两个子函数链（mirrorPass 跳过）');
    expect(RDR).toContain('7d drawVanillaDustPass 全亮尘（原版 DrawDust :63241 亦水前=同性质新登记');
  });
});

// ===================== §3 行为锁（recording-ctx 直调,镜像 Stroke 序） =====================
/** 带仿射矩阵栈的 recording ctx（flush 消费位 translate/scale/rotate 后
 *  getTransform() 须返回合成矩阵——镜像 qm/camT 快照的判别面） */
function affineRecordingCtx() {
  const ops: Array<Record<string, unknown>> = [];
  type M = { a: number; b: number; c: number; d: number; e: number; f: number };
  let cur: M = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
  const stack: M[] = [];
  let alpha = 1;
  let comp = 'source-over';
  const mul = (x: M, y: M): M => ({
    a: x.a * y.a + x.c * y.b, b: x.b * y.a + x.d * y.b,
    c: x.a * y.c + x.c * y.d, d: x.b * y.c + x.d * y.d,
    e: x.a * y.e + x.c * y.f + x.e, f: x.b * y.e + x.d * y.f + x.f,
  });
  const ctx = {
    canvas: { width: 800, height: 600 },
    save: () => { stack.push({ ...cur }); ops.push({ op: 'save' }); },
    restore: () => { const s = stack.pop(); if (s) cur = s; ops.push({ op: 'restore' }); },
    translate: (x: number, y: number) => { cur = mul(cur, { a: 1, b: 0, c: 0, d: 1, e: x, f: y }); ops.push({ op: 'translate', a: [x, y] }); },
    scale: (x: number, y: number) => { cur = mul(cur, { a: x, b: 0, c: 0, d: y, e: 0, f: 0 }); ops.push({ op: 'scale', a: [x, y] }); },
    rotate: (r: number) => { const c0 = Math.cos(r), s0 = Math.sin(r);
      cur = mul(cur, { a: c0, b: s0, c: -s0, d: c0, e: 0, f: 0 }); ops.push({ op: 'rotate', r }); },
    setTransform: (m: M) => { cur = { a: m.a, b: m.b, c: m.c, d: m.d, e: m.e, f: m.f }; ops.push({ op: 'setTransform', a: [m.a, m.b, m.c, m.d, m.e, m.f] }); },
    getTransform: () => ({ ...cur }),
    drawImage: (...a: unknown[]) => ops.push({ op: 'draw', a, alpha, m: { ...cur } }),
    fillRect: (...a: unknown[]) => ops.push({ op: 'fillRect', a, alpha }),
    beginPath: () => {}, moveTo: () => {}, lineTo: () => {}, stroke: () => {}, closePath: () => {},
    clearRect: (...a: unknown[]) => ops.push({ op: 'clearRect', a }),
    imageSmoothingEnabled: false,
    set fillStyle(_v: string) {}, get fillStyle() { return ''; },
    set strokeStyle(_v: string) {}, set lineWidth(_v: number) {},
  };
  Object.defineProperty(ctx, 'globalAlpha', {
    set(v: number) { alpha = v; ops.push({ op: 'alpha', v }); }, get() { return alpha; },
  });
  Object.defineProperty(ctx, 'globalCompositeOperation', {
    set(v: string) { comp = v; ops.push({ op: 'composite', v }); }, get() { return comp; },
  });
  Object.defineProperty(ctx, 'filter', { set(_v: string) {}, get() { return 'none'; } });
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

/** flushNpcWhiteLift 行为锁:白提亮 519 缺省档镜像笔画（直绘+镜像同 α 同 dest） */
describe('★BJ679 §3 行为锁', () => {
  it('flushNpcWhiteLift（519 缺省 0.4 档）:一笔镜像,mask 重放=setTransform(qm)+α0.4+同 dest drawImage', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const rec = affineRecordingCtx();
    const strokes: Array<{ box: unknown; paint: (mc: CanvasRenderingContext2D) => void }> = [];
    const self = {
      atlas: { ensureVImage: (_k: string) => ({ width: 20, height: 80 }) } as never,
      ctx: rec.ctx,
      npcWhiteLiftQueue: [{
        vid: 519, tex: 'vanilla/NPC_519.png', sy: 0, sw: 20, sh: 20,
        cx: 50, cy: 60, rot: 0, mirror: true, scale: 1, by: -10,
      }],
      _veilActive: true,
      escapeVeilStroke: (box: unknown, paint: (mc: CanvasRenderingContext2D) => void) => { strokes.push({ box, paint }); },
    };
    (Renderer.prototype as unknown as {
      flushNpcWhiteLift: (c: unknown, z: number, vw: number, vh: number) => void;
    }).flushNpcWhiteLift.call(self, { x: 100, y: 200 } as never, 2, 800, 600);
    // 直绘主拍不变（bj-c1 F4 既有语义:缺省档 α=0.4 + mirror scale(-1,1)）
    expect(rec.ops.some((o) => o.op === 'alpha' && o.v === 0.4)).toBe(true);
    expect(rec.ops.some((o) => o.op === 'scale' && JSON.stringify(o.a) === '[-1,1]')).toBe(true);
    // 会话活性=恰好一笔镜像
    expect(strokes.length).toBe(1);
    // mask 重放:setTransform(qm)→α0.4→同 dest drawImage（qm=相机×本体同枢矩阵）
    const mrec = affineRecordingCtx();
    strokes[0]!.paint(mrec.ctx);
    const mset = mrec.ops.find((o) => o.op === 'setTransform') as { a: number[] };
    // 相机系:translate(400,300)·scale(2,2)·translate(-camRX,-camRY)×本体同枢
    // translate(50,60)·scale(-1,1)（mirror 面）→ a=-2/d=2（镜像翻转已入 mask 重放）
    expect(mset.a[0]).toBeCloseTo(-2, 9);
    expect(mset.a[3]).toBeCloseTo(2, 9);
    expect(mrec.ops.some((o) => o.op === 'alpha' && o.v === 0.4)).toBe(true);
    const mdraw = mrec.ops.find((o) => o.op === 'draw') as { a: unknown[] };
    // imgT drawImage:源 (0,0,20,20)→dest (-10,-10,20,20)（q.by=-10）
    expect(JSON.stringify(mdraw.a.slice(5))).toBe(JSON.stringify([-10, -10, 20, 20]));
    // box=veilAabb(qm, -sw/2, by, sw, sh) 页域 AABB（scale 2:宽 40+余量>40）
    const box = strokes[0]!.box as { x: number; y: number; w: number; h: number };
    expect(box.w).toBeGreaterThanOrEqual(40);
    expect(box.h).toBeGreaterThanOrEqual(40);
  }, 120000);

  it('flushTowerGlow（493 四向 norot 支）:一笔镜像含 4 拍 drawImage,box=四向并集,α=64/255', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const rec = affineRecordingCtx();
    const strokes: Array<{ box: unknown; paint: (mc: CanvasRenderingContext2D) => void }> = [];
    const q = {
      vid: 493, tex: 'vanilla/Glow_132.png', iw: 80, sy: 0, gh: 80,
      sw: 80, sh: 80, wx: 500, wy: 700, vx: 3, vy: 4, num: 4, xoff: 0, opacity: 1,
    };
    const self = {
      atlas: { ensureVImage: (_k: string) => ({ width: 80, height: 80 }) } as never,
      ctx: rec.ctx, towerGlowQueue: [q],
      _veilActive: true,
      escapeVeilStroke: (box: unknown, paint: (mc: CanvasRenderingContext2D) => void) => { strokes.push({ box, paint }); },
    };
    (Renderer.prototype as unknown as {
      flushTowerGlow: (c: unknown, z: number, vw: number, vh: number) => void;
    }).flushTowerGlow.call(self, { x: 100, y: 200 } as never, 2, 800, 600);
    expect(rec.ops.filter((o) => o.op === 'draw').length).toBe(4);   // 直绘四向不变
    expect(strokes.length).toBe(1);                                   // 恰一笔镜像
    const mrec = affineRecordingCtx();
    strokes[0]!.paint(mrec.ctx);
    const mdraws = mrec.ops.filter((o) => o.op === 'draw') as Array<{ a: unknown[] }>;
    expect(mdraws.length).toBe(4);                                    // 重放四拍
    const offs = Renderer.npcGlowVel4Offsets(3, 4, 4, 0);
    for (let k = 0; k < 4; k++) {
      expect(mdraws[k]!.a[5]).toBeCloseTo(500 + offs[k][0], 9);
      expect(mdraws[k]!.a[6]).toBeCloseTo(700 + offs[k][1], 9);
    }
    expect(mrec.ops.some((o) => o.op === 'alpha' && Math.abs((o.v as number) - 64 / 255) < 1e-9)).toBe(true);
    // box=四向 dest 并集（≥ 单帧 80×80,含 offsets 外扩）
    const box = strokes[0]!.box as { x: number; y: number; w: number; h: number };
    expect(box.w).toBeGreaterThanOrEqual(80);
    expect(box.h).toBeGreaterThanOrEqual(80);
  }, 120000);

  it('非会话帧零开销:_veilActive 缺席=零镜像笔（直绘原路径）', async () => {
    const { Renderer } = await import('../src/render/Renderer');
    const rec = affineRecordingCtx();
    const strokes: unknown[] = [];
    const self = {
      atlas: { ensureVImage: (_k: string) => ({ width: 80, height: 80 }) } as never,
      ctx: rec.ctx, towerGlowQueue: [{
        vid: 493, tex: 'vanilla/Glow_132.png', iw: 80, sy: 0, gh: 80,
        sw: 80, sh: 80, wx: 500, wy: 700, vx: 3, vy: 4, num: 4, xoff: 0, opacity: 1,
      }],
      escapeVeilStroke: (box: unknown, paint: unknown) => { strokes.push({ box, paint }); },
    };
    (Renderer.prototype as unknown as {
      flushTowerGlow: (c: unknown, z: number, vw: number, vh: number) => void;
    }).flushTowerGlow.call(self, { x: 100, y: 200 } as never, 2, 800, 600);
    expect(rec.ops.filter((o) => o.op === 'draw').length).toBe(4);   // 直绘四向照旧
    expect(strokes.length).toBe(0);                                   // 零镜像笔
    expect(rec.ops.some((o) => o.op === 'setTransform')).toBe(false); // 未触 getTransform 域
  }, 120000);
});
