// ★BJ481 MoonLord 补差刮擦布定谳探针（Z4 登记债:VoidLens 判例同病嫌疑复验）。
//   债面:applyMoonLordLightFloor（render 7b',compositeLight 后 HUD 相位）在烘焙点
//   调 uploadScratchBake(scratch,'mlfloor',16)（Renderer.ts:13575）→ markDynamic
//   登记 mlFloorScratch 为 world 动态源,随后 'lighter' drawImage 落主画布。
//   Z4 VoidLens 判例（flushVoidLensComplements 注）声称「HUD 相位 drawImage 已登记
//   画布=被桥接成 world-GL quad 落世界 FBO=整绘蒸发」——本探针逐通道像素对拍
//   判别 MoonLord 补差是否同病:
//     · 逐 blit 同帧 before/after getImageData 差分（blit 级隔离,多部件重叠不串）
//     · 差分 ≡ scratch 字节（α=255 像素逐通道严格相等;'lighter' 加法语义）
//       → 落画布=精确;全零=蒸发（同病）;部分错=别的病
//   附带机制实验（Arm C）:已登记画布 vs 从未登记画布,在补差同相位（帧外同 ctx
//   同 gco='lighter' 直绘）——判别「登记」本身是否足以蒸发 raw-ctx 绘制。
//   控制:亮场景（光≈255 → 补差=0 → 零 blit）。
// 用法: SW_ORIGIN=http://localhost:5204 node tools/run-diag.mjs scripts/_bj481-ml-compscratch-probe.mjs
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = join(ROOT, 'game', 'docs', 'evidence', 'bj481');
mkdirSync(OUT, { recursive: true });

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 900 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e?.message ?? e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5204') + '/?play=small',
  { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 1500));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) {
    if (/我已知晓|我知道了/.test(b.textContent || '')) { b.click(); break; }
  }
});
await new Promise((r) => setTimeout(r, 1000));
// 玩家免死（★BJ481 补:首跑被月总击杀污染测量）——百万血池 + 周期回满
await page.evaluate(() => {
  const g = window.__swGame, p = g.player;
  p.statLifeMax2 = 1000000; p.statLife = 1000000;
  window.__bj481heal = setInterval(() => { p.statLife = p.statLifeMax2; }, 100);
});
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ============ 会话路径/旗面快照（探针有效性前提:GL 会话在场） ============
const info0 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const R = r.constructor;
  return {
    bgl: R.bgl, bglShim: R.bglShim, b2b: R.b2b, cloudPipe: R.cloudPipe,
    cpu: typeof r.isCpuRender === 'function' ? !!r.isCpuRender() : null,
    pathUsed: r.bglPathUsed ?? null,
    pathStats: r.bglPathStats ?? null,
    fullbright: !!r.fullbright,
    hasScratch: !!r.mlFloorScratch,
    hasMethod: typeof r.applyMoonLordLightFloor === 'function',
  };
});
console.log('session:', JSON.stringify(info0));
check('P0 GL 会话在场（bgl+bglShim 开,非 CPU 渲染,补差面方法在）',
  info0.bgl && info0.bglShim && !info0.cpu && info0.hasMethod && !info0.fullbright, JSON.stringify(info0));

// ============ 仪器:applyMoonLordLightFloor 逐 blit 同帧差分 ============
// blit 形状 = ctx.drawImage(mlFloorScratch, bx0, by0) @gco='lighter' @identity CTM
// （Renderer.ts:13576-13580）。验证:scratch α=255 非零像素 → 画布差分逐通道严格相等。
await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const st = r.__bj481 = { blits: [], passthrough: 0, frames: 0, recording: false, VALID_MAX: 16 };
  const orig = r.applyMoonLordLightFloor.bind(r);
  r.applyMoonLordLightFloor = function (...args) {
    if (!st.recording) return orig(...args);
    const ctx = this.ctx;
    const origDraw = ctx.drawImage;
    const origGet = ctx.getImageData;
    const frame = [];
    const self = this;
    ctx.drawImage = function (img, a, b) {
      const isComp = img === self.mlFloorScratch
        && ctx.globalCompositeOperation === 'lighter'
        && arguments.length === 3;
      if (!isComp) { st.passthrough++; return origDraw.apply(ctx, arguments); }
      if (st.blits.length + frame.length >= st.VALID_MAX) { st.passthrough++; return origDraw.call(ctx, img, a, b); }
      const w = img.width, h = img.height;
      const x0 = Math.max(0, a), y0 = Math.max(0, b);
      const x1 = Math.min(ctx.canvas.width, a + w), y1 = Math.min(ctx.canvas.height, b + h);
      const rw = x1 - x0, rh = y1 - y0;
      if (rw <= 0 || rh <= 0) { st.passthrough++; return origDraw.call(ctx, img, a, b); }
      const before = origGet.call(ctx, x0, y0, rw, rh);
      origDraw.call(ctx, img, a, b);
      const after = origGet.call(ctx, x0, y0, rw, rh);
      let sb = null;
      try { sb = img.getContext('2d').getImageData(0, 0, w, h).data; } catch { sb = null; }
      const rec = { a, b, w, h, rw, rh, checked: 0, mismatch: 0, changedPx: 0, empty: !sb, sample: null, maxAbs: 0 };
      if (sb) {
        const bd = before.data, ad = after.data;
        for (let py = 0; py < rh; py++) {
          const sj = ((py + (y0 - b)) * w + (x0 - a)) * 4;
          for (let px = 0; px < rw; px++) {
            const di = (py * rw + px) * 4, si = sj + px * 4;
            const dr = ad[di] - bd[di], dg = ad[di + 1] - bd[di + 1], db = ad[di + 2] - bd[di + 2];
            if (dr || dg || db) rec.changedPx++;
            const sa = sb[si + 3];
            if (sa === 255 && (sb[si] || sb[si + 1] || sb[si + 2])) {
              rec.checked++;
              const mAbsC = Math.max(Math.abs(dr), Math.abs(dg), Math.abs(db));
              if (mAbsC > rec.maxAbs) rec.maxAbs = mAbsC;
              // ★BJ481:期望差分 = 饱和加法 min(255,dst+src)−dst——补差叠在明亮弹幕/
              //  激光像素上钳顶=原版 XNA 加性混合同语义（非错位）;容 ±1 舍入。
              const eR = Math.min(255, bd[di] + sb[si]) - bd[di];
              const eG = Math.min(255, bd[di + 1] + sb[si + 1]) - bd[di + 1];
              const eB = Math.min(255, bd[di + 2] + sb[si + 2]) - bd[di + 2];
              if (Math.abs(dr - eR) > 1 || Math.abs(dg - eG) > 1 || Math.abs(db - eB) > 1) {
                rec.mismatch++;
                if (!rec.sample) rec.sample = [px, py, sb[si], sb[si + 1], sb[si + 2], dr, dg, db];
              }
            }
          }
        }
      }
      frame.push(rec);
      return undefined;
    };
    try {
      const res = orig(...args);
      st.frames++;
      st.blits.push(...frame);
      return res;
    } finally {
      ctx.drawImage = origDraw;
    }
  };
});

const resetRec = () => page.evaluate(() => {
  const st = window.__swGame.renderer.__bj481;
  st.blits.length = 0; st.passthrough = 0; st.frames = 0; st.recording = true;
});
const stopRec = () => page.evaluate(() => {
  const st = window.__swGame.renderer.__bj481;
  st.recording = false;
  let maxAbs = 0;
  for (const b of st.blits) {
    if (b.maxAbs != null && b.maxAbs > maxAbs) maxAbs = b.maxAbs;
  }
  return {
    frames: st.frames, passthrough: st.passthrough,
    blits: st.blits,
    nBlits: st.blits.length,
    nChecked: st.blits.reduce((s, b) => s + b.checked, 0),
    nMismatch: st.blits.reduce((s, b) => s + b.mismatch, 0),
    nChanged: st.blits.reduce((s, b) => s + b.changedPx, 0),
    nEmpty: st.blits.filter((b) => b.empty).length,
    zeroChangedBlits: st.blits.filter((b) => !b.empty && b.changedPx === 0).length,
    maxAbsDelta: maxAbs,
  };
});

/** 布置暗穴 + 召月总核心（398;出生演出自召 2×397 手 + 1×396 头） */
async function darkScene() {
  return page.evaluate(async () => {
    const g = window.__swGame, st = g.world.store, p = g.player;
    const deepY = Math.min(st.h - 40, 330);
    const cx0 = Math.floor(p.cx / 16);
    for (let yy = deepY - 26; yy <= deepY; yy++) {
      for (let xx = cx0 - 22; xx <= cx0 + 22; xx++) st.setTileSilent(xx, yy, 0);
    }
    for (let xx = cx0 - 24; xx <= cx0 + 24; xx++) if (!st.isSolid(xx, deepY + 1)) st.setTile(xx, deepY + 1, 1, 0, 0);
    p.x = cx0 * 16; p.y = (deepY - 8) * 16; p.vx = 0; p.vy = 0;
    await new Promise((r) => setTimeout(r, 1200));   // 相机 settle
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    const e = spawnVanillaEnemy(g, 398, p.cx, p.cy - 220);
    if (e) { e.x = p.cx - e.w / 2; e.y = p.cy - 220 - e.h / 2; e.vx = 0; e.vy = 0; }
    return { deepY, cx0, spawned: !!e, w: e?.w, h: e?.h };
  });
}

// ============ Arm B:暗穴补差逐通道对拍（主判别面） ============
console.log('--- Arm B: 暗穴月总补差 ---');
const scene = await darkScene();
console.log('scene:', JSON.stringify(scene));
await wait(4000);   // 出生演出 60t + 部件召出 + 悬停 settle + 贴图暖机
const parts = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const list = (g.entities.enemies || []).filter((e) => e && !e.dead
    && [396, 397, 398, 400].includes(e.vanillaId))
    .map((e) => ({ id: e.vanillaId, cx: Math.round(e.cx), cy: Math.round(e.cy) }));
  const lightOf = (e) => {
    const tx = Math.floor(e.cx / 16), ty = Math.floor(e.cy / 16);
    return r.lighting?.lightAt(tx, ty) ?? null;
  };
  return { parts: list, lights: list.map((e) => lightOf(g.entities.enemies.find((x) => x.vanillaId === e.id && !x.dead && Math.round(x.cx) === e.cx && Math.round(x.cy) === e.cy) ?? e)) };
});
console.log('parts:', JSON.stringify(parts));
check('B0 月总部件在场（≥2:核心+手/头）', parts.parts.length >= 2, JSON.stringify(parts.parts));
await resetRec();
await wait(2000);
const dark = await stopRec();
console.log('dark:', JSON.stringify({ frames: dark.frames, nBlits: dark.nBlits, passthrough: dark.passthrough, nChecked: dark.nChecked, nMismatch: dark.nMismatch, nChanged: dark.nChanged, nEmpty: dark.nEmpty, zeroChangedBlits: dark.zeroChangedBlits }));
check('B1 补差 blit 发出（暗场 ≥4 部件补差）', dark.nBlits + dark.passthrough >= 4, `validated=${dark.nBlits} passthrough=${dark.passthrough}`);
check('B2 补差落画布:逐 blit 画布差分非零（蒸发=全零差分）',
  dark.nBlits > 0 && dark.zeroChangedBlits === 0, `zeroChanged=${dark.zeroChangedBlits}/${dark.nBlits} changedPx=${dark.nChanged}`);
check('B3 逐通道像素精确:scratch α=255 像素 ≡ 画布差分（饱和加法语义 min(255,dst+src);±1 舍入容 × ≤0.01% 粒容）',
  dark.nChecked > 0 && dark.nMismatch <= Math.max(1, Math.floor(dark.nChecked * 1e-4)),
  `checked=${dark.nChecked} mismatch=${dark.nMismatch} maxAbs=${dark.maxAbsDelta} ${JSON.stringify(dark.blits.find((b) => b.sample)?.sample ?? '')}`);
check('B4 scratch 烘焙非空（贴图暖机;空烘=贴图未就绪判无效）', dark.nEmpty === 0 && dark.nBlits > 0, `empty=${dark.nEmpty}`);

// ============ Arm C:机制实验——登记画布 vs 未登记画布 @同相位直绘 ============
console.log('--- Arm C: 登记画布 raw-ctx 直绘机制实验 ---');
const armC = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  const ctx = r.ctx;
  const reg = r.mlFloorScratch;                        // BJ481 修后:不再登记（对照面保留）
  const fresh = document.createElement('canvas');      // 从未登记对照
  fresh.width = 64; fresh.height = 64;
  const paint = (c) => {
    const cc = c.getContext('2d');
    cc.setTransform(1, 0, 0, 1, 0, 0);
    cc.globalCompositeOperation = 'source-over';
    cc.clearRect(0, 0, c.width, c.height);
    cc.globalAlpha = 1;
    cc.fillStyle = 'rgb(200,100,50)';
    cc.fillRect(0, 0, 40, 40);
  };
  const probeAt = (c, x, y) => {
    const before = ctx.getImageData(x, y, 1, 1).data;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(c, x, y);
    ctx.restore();
    const after = ctx.getImageData(x, y, 1, 1).data;
    return [after[0] - before[0], after[1] - before[1], after[2] - before[2]];
  };
  // ★BJ481 修:两臂错位布点（旧 (300,300)/(320,300) 重叠+255 钳=R 通道伪差分）
  paint(fresh);
  const dFresh = probeAt(fresh, 500, 300);
  paint(reg);
  const dReg = probeAt(reg, 300, 300);
  return { dReg, dFresh };
});
console.log('armC:', JSON.stringify(armC));
check('C1 已登记画布 raw-ctx 直绘落画布（蒸发=差分全零）',
  armC.dReg[0] === 200 && armC.dReg[1] === 100 && armC.dReg[2] === 50, `dReg=${JSON.stringify(armC.dReg)}`);
check('C2 从未登记画布对照:同样落画布（两臂同相=登记非蒸发因子）',
  armC.dFresh[0] === 200 && armC.dFresh[1] === 100 && armC.dFresh[2] === 50, `dFresh=${JSON.stringify(armC.dFresh)}`);

// ============ Arm A:亮场景对照（光≈255 → 补差=0） ============
console.log('--- Arm A: 亮场景对照 ---');
await page.evaluate(() => {
  const g = window.__swGame, p = g.player, st = g.world.store;
  let gy = 4;
  const px0 = Math.floor(p.cx / 16);
  for (; gy < 600 && !st.isSolid(px0, gy); gy++) {}
  p.x = px0 * 16; p.y = (gy - 6) * 16; p.vx = 0; p.vy = 0;
});
await wait(4000);   // 核心跟随/传送 + 相机 settle
const brightLight = await page.evaluate(() => {
  const g = window.__swGame, r = g.renderer;
  const core = (g.entities.enemies || []).find((e) => e && !e.dead && e.vanillaId === 398);
  if (!core) return null;
  return r.lighting?.lightAt(Math.floor(core.cx / 16), Math.floor(core.cy / 16)) ?? null;
});
await resetRec();
await wait(2000);
const bright = await stopRec();
console.log('bright:', JSON.stringify({ light: brightLight, frames: bright.frames, nBlits: bright.nBlits, nChanged: bright.nChanged, nMismatch: bright.nMismatch }));
check('A1 亮场景补差≈零开销（blit 少且差分小;全亮→零 blit）',
  bright.nBlits + bright.passthrough <= dark.nBlits + dark.passthrough && bright.nMismatch === 0,
  `blits=${bright.nBlits}+${bright.passthrough} changedPx=${bright.nChanged} light=${JSON.stringify(brightLight)}`);

// ============ 登记面/路径留档 ============
const info1 = await page.evaluate(() => {
  const r = window.__swGame.renderer;
  return {
    pathUsed: r.bglPathUsed ?? null,
    pathStats: r.bglPathStats ?? null,
    mlfloorSeq: r.scratchBakeSeqs ? (r.scratchBakeSeqs.get('mlfloor') ?? null) : 'no-field',
    scratchSize: r.mlFloorScratch ? [r.mlFloorScratch.width, r.mlFloorScratch.height] : null,
  };
});
console.log('info1:', JSON.stringify(info1));
check('P1 登记面已拆除（BJ481 落刀:补差面不走 uploadScratchBake;修前此账存在 n=4/帧）',
  !info1.mlfloorSeq || info1.mlfloorSeq === 'no-field', JSON.stringify(info1.mlfloorSeq));

writeFileSync(join(OUT, 'bj481-probe-result.json'), JSON.stringify({
  info0, info1, scene, parts, dark: { ...dark, blits: undefined, blitHeads: dark.blits.slice(0, 3) }, armC, bright: { ...bright, blits: undefined }, pageErrs: errors,
}, null, 2));
await page.screenshot({ path: join(OUT, 'bj481-dark-ml.png'), encoding: 'binary' }).catch(() => {});
console.log(`RESULT pass=${pass} fail=${fail} pageErrs=${errors.length}`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
