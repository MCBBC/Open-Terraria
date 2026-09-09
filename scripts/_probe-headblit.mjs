import puppeteer from 'puppeteer-core';
// 微基准:复现 drawHead 描边路径的三种实现形态,在「GPU 加速 2D 主画布」上量
// 每次 blit 的真实成本。场景对应:
//   A = 现状:12×(改 scratch[clear+draw+source-in fill] → drawImage(scratch→主))
//   B = 预烘焙 12 张静态描边画布,每帧只 blit
//   C = 预合成 1 张(描边+底色+本体合一),每帧 1 次 blit
//   D = NPC 头基线:ImageBitmap 直 blit ×20
// 每个 scenario 再跑「带 240×240 clip」与「不带 clip」两版,隔离 clip 的影响。
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
let ok = null;
for (let att = 0; att < 8 && !ok; att++) {
  try { await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 }); ok = 'yes'; }
  catch { await new Promise(r => setTimeout(r, 2500)); }
}
if (!ok) { console.log('GAVE UP'); await browser.close(); process.exit(1); }

const result = await page.evaluate(async () => {
  // 主画布模拟:与游戏同尺寸量级(Retina 主屏 2x,取 1512×982×2 ≈ 3024×1964)
  const dpr = window.devicePixelRatio || 2;
  const W = Math.round(1512 * dpr), H = Math.round(982 * dpr);
  const main = document.createElement('canvas'); main.width = W; main.height = H;
  const mctx = main.getContext('2d');

  // 头像源:40×32 静态画布(模拟 compositePaperDoll 产物,静态不再改)
  const head = document.createElement('canvas'); head.width = 40; head.height = 32;
  { const c = head.getContext('2d'); c.fillStyle = '#c88'; c.fillRect(4, 4, 32, 24); c.fillStyle = '#535'; c.fillRect(8, 0, 24, 12); }
  const headBmp = await createImageBitmap(head);

  // 现状 scratch(mapHeadSilScratch 同构)
  const scratch = document.createElement('canvas'); scratch.width = 40; scratch.height = 32;
  const sctx = scratch.getContext('2d');

  // B:预烘焙 12 张静态描边(8 黑 + 4 队伍色),内容一次性画死
  const baked = [];
  for (let i = 0; i < 12; i++) {
    const cv = document.createElement('canvas'); cv.width = 40; cv.height = 32;
    const c = cv.getContext('2d');
    c.drawImage(head, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = i < 8 ? '#000000' : 'rgb(255,50,50)';
    c.fillRect(0, 0, 40, 32);
    baked.push(cv);
  }
  // C:预合成单张(外圈8向偏移黑描边+4向队色+本体盖顶,48×40)
  const comp = document.createElement('canvas'); comp.width = 48; comp.height = 40;
  { const c = comp.getContext('2d');
    const drawAt = (img, dx, dy) => c.drawImage(img, 4 + dx, 4 + dy, 40, 32);
    for (const [dx, dy] of [[-4,0],[-2,-2],[0,-4],[2,-2],[4,0],[2,2],[0,4],[-2,2]]) drawAt(baked[0], dx, dy);
    for (const [dx, dy] of [[-2,0],[0,-2],[2,0],[0,2]]) drawAt(baked[8], dx, dy);
    drawAt(head, 0, 0);
  }

  const OFFS8 = [[-4,0],[-2,-2],[0,-4],[2,-2],[4,0],[2,2],[0,4],[-2,2]];
  const OFFS4 = [[-2,0],[0,-2],[2,0],[0,2]];

  // 复现 drawHead 内部几何:save/translate/scale/smoothing/描边循环/restore
  function frameA(withClip) {
    mctx.save();
    if (withClip) { mctx.beginPath(); mctx.rect(1000, 90, 240, 240); mctx.clip(); }
    mctx.imageSmoothingEnabled = false;
    mctx.globalAlpha = 0.82;
    // 玩家头 ×1:12 次「改 scratch→blit」+ 1 次本体 blit(1.1 倍)
    for (let i = 0; i < 8; i++) {
      sctx.clearRect(0, 0, 40, 32); sctx.drawImage(head, 0, 0, 40, 32, 0, 0, 40, 32);
      sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = '#000000'; sctx.fillRect(0, 0, 40, 32);
      sctx.globalCompositeOperation = 'source-over';
      mctx.save(); mctx.translate(1120 + OFFS8[i][0], 210 + OFFS8[i][1]); mctx.scale(1.1, 1.1);
      mctx.drawImage(scratch, -20, -16, 40, 32); mctx.restore();
    }
    for (let i = 0; i < 4; i++) {
      sctx.clearRect(0, 0, 40, 32); sctx.drawImage(head, 0, 0, 40, 32, 0, 0, 40, 32);
      sctx.globalCompositeOperation = 'source-in'; sctx.fillStyle = 'rgb(255,50,50)'; sctx.fillRect(0, 0, 40, 32);
      sctx.globalCompositeOperation = 'source-over';
      mctx.save(); mctx.translate(1120 + OFFS4[i][0], 210 + OFFS4[i][1]); mctx.scale(1.1, 1.1);
      mctx.drawImage(scratch, -20, -16, 40, 32); mctx.restore();
    }
    mctx.save(); mctx.translate(1120, 210); mctx.scale(1.1, 1.1);
    mctx.drawImage(headBmp, 0, 0, 40, 32, -20, -16, 40, 32); mctx.restore();
    mctx.restore();
  }
  function frameB(withClip) { // 预烘焙 12 静态源
    mctx.save();
    if (withClip) { mctx.beginPath(); mctx.rect(1000, 90, 240, 240); mctx.clip(); }
    mctx.imageSmoothingEnabled = false; mctx.globalAlpha = 0.82;
    for (let i = 0; i < 8; i++) { mctx.save(); mctx.translate(1120 + OFFS8[i][0], 210 + OFFS8[i][1]); mctx.scale(1.1, 1.1); mctx.drawImage(baked[i], -20, -16, 40, 32); mctx.restore(); }
    for (let i = 0; i < 4; i++) { mctx.save(); mctx.translate(1120 + OFFS4[i][0], 210 + OFFS4[i][1]); mctx.scale(1.1, 1.1); mctx.drawImage(baked[8 + i], -20, -16, 40, 32); mctx.restore(); }
    mctx.save(); mctx.translate(1120, 210); mctx.scale(1.1, 1.1); mctx.drawImage(headBmp, 0, 0, 40, 32, -20, -16, 40, 32); mctx.restore();
    mctx.restore();
  }
  function frameC(withClip) { // 预合成单张
    mctx.save();
    if (withClip) { mctx.beginPath(); mctx.rect(1000, 90, 240, 240); mctx.clip(); }
    mctx.imageSmoothingEnabled = false; mctx.globalAlpha = 0.82;
    mctx.save(); mctx.translate(1120, 210); mctx.scale(1.1, 1.1); mctx.drawImage(comp, -24, -20, 48, 40); mctx.restore();
    mctx.restore();
  }
  function frameD(withClip) { // NPC 头 ×20(ImageBitmap 直 blit,无描边)
    mctx.save();
    if (withClip) { mctx.beginPath(); mctx.rect(1000, 90, 240, 240); mctx.clip(); }
    mctx.imageSmoothingEnabled = false; mctx.globalAlpha = 1;
    for (let i = 0; i < 20; i++) { mctx.save(); mctx.translate(1000 + (i % 10) * 24, 100 + Math.floor(i / 10) * 24); mctx.drawImage(headBmp, -12, -11, 24, 22); mctx.restore(); }
    mctx.restore();
  }

  const measure = (fn, label, withClip) => {
    // 预热
    for (let i = 0; i < 30; i++) fn(withClip);
    const N = 180;
    const t0 = performance.now();
    for (let i = 0; i < N; i++) fn(withClip);
    const t1 = performance.now();
    return { label, clip: withClip, msPerFrame: +((t1 - t0) / N).toFixed(3) };
  };

  const out = [];
  for (const [fn, name] of [[frameA, 'A现状:12改+13blit'], [frameB, 'B预烘12静态'], [frameC, 'C预合成1blit'], [frameD, 'D基线20ImageBitmap']]) {
    for (const wc of [false, true]) out.push(measure(fn, name, wc));
  }
  return { dpr, W, H, results: out };
});
console.log(JSON.stringify(result, null, 1));
await browser.close();
