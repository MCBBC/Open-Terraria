// ★普查判别器（B2b 旗错色同病普查）：三面独立取证——
//  ①dollLightTint 自贴图 destination-in 语义：自引裁剪=βno-op（预期角α=0,实爆 255）
//  ②Canvas2D multiply 半透明 dst 参考字节（straight 域公式 Co=Cs(1−αb+αbCb),αo=1）
//  ③GL tier-3 MULT 实测字节（现 (ZERO,SRC_COLOR) vs 期望 (ONE_MINUS_DST_ALPHA,SRC_COLOR)）
// 运行: SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs --timeout=180000 scripts/_census-flagcolor-dolltint.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const URL0 = ORIGIN + '/?cloudcache=0';
const out = [];
const chk = (name, ok, detail = '') => {
  out.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  [' + detail + ']' : ''}`);
};

const browser = await launchBrowser({});
const page = await openPage(browser, {});
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push('PAGEERROR: ' + e.message));
await bootstrap(page, URL0);
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260925 });
chk('createGame', !!gen?.ok, gen?.why ?? '');

const res = await page.evaluate(async () => {
  const r = {};
  // ---- ① dollLightTint：64×64 源,中央 32×32 不透明白块,四角透明 → 暗色 tint ----
  try {
    const dd = await import('/src/render/DisplayDoll.ts');
    const src = document.createElement('canvas');
    src.width = 64; src.height = 64;
    const sctx = src.getContext('2d');
    sctx.fillStyle = '#ffffff';
    sctx.fillRect(16, 16, 32, 32);
    const tinted = dd.dollLightTint(src, 0, 0, 64, 64, [80, 70, 60]);
    const octx = tinted.getContext('2d');
    const px = octx.getImageData(0, 0, 64, 64).data;
    const at = (x, y) => { const i = (y * 64 + x) * 4; return [px[i], px[i + 1], px[i + 2], px[i + 3]]; };
    r.dollTint = {
      corner: at(2, 2), center: at(32, 32), isSameObj: tinted === src,
      // 中心=白×(80,70,60)→(80,70,60);角=透明(0,0,0,0)=正确 vs 实色(80,70,60,255)=病
    };
  } catch (e) { r.dollTintErr = String(e); }
  // ---- ② Canvas2D multiply 半透明 dst 参考字节 ----
  try {
    const c = document.createElement('canvas');
    c.width = 4; c.height = 4;
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = 'rgba(0,0,255,0.5)';
    x.fillRect(0, 0, 4, 4);
    x.globalCompositeOperation = 'multiply';
    x.fillStyle = 'rgb(255,128,0)';
    x.fillRect(0, 0, 4, 4);
    const d = x.getImageData(0, 0, 4, 4).data;
    r.mul2D = { r: d[0], g: d[1], b: d[2], a: d[3] };
    // 期望 (128,64,0,255):rgb=Cs(1−αb+αbCb),αo=1——透明 dst 处=源色实画(泄漏即语义)
  } catch (e) { r.mul2DErr = String(e); }
  // ---- ③ GL tier-3 MULT 实测（白 0.5α 底 × tint(1,0.5,0) MULT quad）----
  try {
    const g = window.__swGame;
    const rend = g.renderer;
    const glw = rend.acquireWorldGl();
    if (!glw || glw.unavailable) { r.glErr = 'no gl layer'; }
    else {
      glw.resize(16, 16);
      glw.begin('world', true);
      const wc = document.createElement('canvas');
      wc.width = 1; wc.height = 1;
      wc.getContext('2d').fillStyle = '#fff';
      wc.getContext('2d').fillRect(0, 0, 1, 1);
      const tex = glw.texFromImage('__censusWhite', wc, false, true);
      glw.quadSprite(tex, 0, 0, 1, 1, 0, 0, 8, 8, { alpha: 0.5 });            // 底:premul 0.5
      glw.blendMult(true);
      glw.quadSprite(tex, 0, 0, 1, 1, 0, 0, 8, 8, { alpha: 1, tint: [1, 0.5, 0] }); // MULT
      glw.blendMult(false);
      const f = glw.endAccumulate();
      const gl = glw.gl;
      const buf = new Uint8Array(4);
      const readAt = (x, y) => {
        const b = new Uint8Array(4);
        gl.bindFramebuffer(gl.FRAMEBUFFER, f.fbo);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, b);
        return [b[0], b[1], b[2], b[3]];
      };
      r.glFbo = { w: f.w, h: f.h };
      // 四角采样（quad 画在 (0,0,8,8)——GL y 向上或向下不定,四角兜住）
      r.glCorners = { bl: readAt(2, 2), tl: readAt(2, f.h - 2), br: readAt(8, 2), tr: readAt(8, f.h - 2) };
      const hit = Object.values(r.glCorners).find((c) => c[3] > 0) ?? [0, 0, 0, 0];
      r.glMult = { r: hit[0], g: hit[1], b: hit[2], a: hit[3] };
      // 现行(ZERO,SRC_COLOR) 期望≈(128,64,0,128);精确(ONE_MINUS_DST_ALPHA,SRC_COLOR)≈(255,128,0,255)
    }
  } catch (e) { r.glErr = String(e); }
  return r;
});
console.log(JSON.stringify(res, null, 1));

if (res.dollTint) {
  const cornerA = res.dollTint.corner[3];
  chk('①dollLightTint 角α=0(裁剪生效)', cornerA === 0, `corner=${JSON.stringify(res.dollTint.corner)} center=${JSON.stringify(res.dollTint.center)}`);
  chk('①dollLightTint 中心=染后 doll 色', res.dollTint.center[0] === 80 && res.dollTint.center[3] === 255, JSON.stringify(res.dollTint.center));
}
if (res.mul2D) {
  chk('②2D multiply 半透明dst=(127,64,0,255) αo=1', Math.abs(res.mul2D.r - 127) <= 1 && res.mul2D.g === 64 && res.mul2D.b === 0 && res.mul2D.a === 255, JSON.stringify(res.mul2D));
}
if (res.glMult) {
  const exact = res.glMult.a >= 250 && res.glMult.r >= 250 && res.glMult.g >= 120 && res.glMult.b <= 8;
  const cur = res.glMult.a > 0 && res.glMult.a <= 135 && res.glMult.b <= 8;
  chk('③GL MULT=精确 multiply(255,128,0,255)', exact, JSON.stringify(res.glMult) + (exact ? '' : (cur ? ' [现行(ZERO,SRC_COLOR)≈(128,64,0,128)]=已证病' : ' [非预期]')));
}
if (pageErrors.length) console.log('PAGE ERRORS:', pageErrors.slice(0, 5));
await browser.close();
const fails = out.filter((o) => !o.ok);
console.log(fails.length ? `\n${fails.length} FAIL` : '\nALL PASS');
process.exit(fails.length ? 1 : 0);
