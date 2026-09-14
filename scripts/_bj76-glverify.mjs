// BJ76 修刀后 GL 级验证（确定性,脱离游戏管线）：
// 同一"世界图案"画两份——sceneB 相对 sceneA 左移 DX（=相机右移 DX）；
// composite 分别带 uWorldPx=(0,0) 与 (DX,0)。世界锚定 ⇒ outA(x) ≡ outB(x−DX)。
// 屏幕锚定（摘除 uWorldPx）⇒ 位移场不随 DX 平移 ⇒ 对齐残差显著>0。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--enable-gpu'],
  defaultViewport: { width: 800, height: 520 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message.slice(0, 160)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5210', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => !!window.__swFlow, { timeout: 180000, polling: 500 });
await page.evaluate(() => { window.__swFlow.newWorld('12345', 4200, 1200); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 2000));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const { GLWaterDistortion } = await import('/src/render/GLWaterDistortion.ts');
  const noise = g.renderer.atlas.ensureVImage('vanilla/Misc_noise.png');
  const W = 1024, H = 256, DX = 505, PROG = 3.7, INTEN = 1.5;
  // 世界图案（固定种子伪随机块,1:1 世界坐标;sceneB 相对 sceneA 左移 DX）
  const drawWorld = (ctx, dx) => {
    ctx.fillStyle = '#202020'; ctx.fillRect(0, 0, W, H);
    let seed = 424242;
    for (let i = 0; i < 600; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      const wx = seed % 1800, wy = (seed >> 8) % H;
      const v = (seed >> 16) & 0xff;
      ctx.fillStyle = `rgb(${v},${255 - v},${(v * 3) & 0xff})`;
      ctx.fillRect(wx - dx, wy, 14, 10);
    }
  };
  const sceneA = document.createElement('canvas'); sceneA.width = W; sceneA.height = H;
  drawWorld(sceneA.getContext('2d'), 0);
  const sceneB = document.createElement('canvas'); sceneB.width = W; sceneB.height = H;
  drawWorld(sceneB.getContext('2d'), DX);
  const water = document.createElement('canvas'); water.width = W; water.height = H;
  const wctx = water.getContext('2d'); wctx.fillStyle = 'rgba(0,0,255,1)'; wctx.fillRect(0, 0, W, H);
  const gw = W / 4, gh = H / 4;
  const neutral = new Float32Array(gw * gh).fill(0.5);
  const glw = new GLWaterDistortion();
  if (glw.unavailable) return { fail: 'unavailable' };
  const grab = () => { const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(glw.canvas, 0, 0);
    return x.getImageData(0, 0, W, H).data; };
  // A: uWorldPx=(0,0); B: uWorldPx=(DX,0)（新签名 worldX/worldY）
  const okA = glw.composite(sceneA, water, noise, W, H, PROG, INTEN, neutral, gw, gh, 0, 0);
  const A = grab();
  const okB = glw.composite(sceneB, water, noise, W, H, PROG, INTEN, neutral, gw, gh, DX, 0);
  const B = grab();
  // 负例:world 锚定摘除模拟——B 场景用 uWorldPx=(0,0)（=旧屏幕锚定行为）
  const okB0 = glw.composite(sceneB, water, noise, W, H, PROG, INTEN, neutral, gw, gh, 0, 0);
  const B0 = grab();
  const cmp = (Sa, Sb, dx) => {   // mean|Sa(x) − Sb(x−dx)|，重叠区
    let sum = 0, n = 0, mx = 0;
    for (let y = 4; y < H - 4; y++) for (let x = dx + 4; x < W - 4; x++) {
      const o1 = (y * W + x) * 4, o2 = (y * W + x - dx) * 4;
      const d = Math.abs(Sa[o1] - Sb[o2]) + Math.abs(Sa[o1 + 1] - Sb[o2 + 1]);
      sum += d; n++; if (d > mx) mx = d;
    }
    return { mean: +(sum / n).toFixed(2), max: mx };
  };
  return { ok: [okA, okB, okB0],
    worldAnchored: cmp(A, B, DX),      // 修刀后应 ≈0
    screenAnchoredSim: cmp(A, B0, DX), // 模拟旧行为（uWorldPx 恒 0）应 >0
  };
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
