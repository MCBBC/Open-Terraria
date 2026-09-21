// BJ255 实机性能探针：彩虹魔杖 79 长按连发等价场景（12 条环绕满长拖尾同屏）。
// 对照两 face：GL 直绘（新,obj55 MM program）vs ?trailgl=0 CPU 兜底（P1 逐格段表+P2 快采样）。
// ★GPU 页禁 trace 判例——不挂 profiler,只外测 rAF 间隔（浏览器侧 performance.now 差分）。
// 场景：12 弹 channel 环绕（各自的相位 aim 圈）=拖尾满 60 槽+Catmull-Rom 满补间+持续转向
// =用户"长按连续发射"的稳态最坏面（strip 拉满+折叠段多）。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5241';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal', '--enable-unsafe-webgpu'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', String(e.message).slice(0, 200)));
page.on('console', async (m) => {
  const texts = await Promise.all(m.args().map((a) => a.jsonValue().then((v) => String(v)).catch(() => '<unser>')));
  const line = `${m.type()}: ${texts.join(' ')}`;
  if (/error|fail/i.test(line)) console.log('[console]', line.slice(0, 300));
});

await page.goto(ORIGIN + '/?traildbg', { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* */ } });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('BJ255探针');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('bj255probe');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

// 场地：开阔平地+玩家居中
await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 44;
  for (let dx = -420; dx <= 420; dx++) {
    for (let dy = -36; dy <= 2; dy++) st.setTile(px0 + dx, gy + dy, 0);
    st.setTile(px0 + dx, gy + 3, 2);
  }
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.player.vx = 0; g.player.vy = 0;
  g.paused = false;
  for (let k = 0; k < 30; k++) g.fixedUpdate(1 / 60);
  g.paused = true;
});
console.log('[prep] arena ok');

// GL 可用性
const glInfo = await page.evaluate(() => {
  const g = window.__swGame;
  const glfx = g.renderer?.glfx;
  const cv = document.createElement('canvas');
  const gl = cv.getContext('webgl2');
  let renderer = 'n/a';
  if (gl) {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    renderer = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'masked';
  }
  return { glfxPresent: !!glfx, unavailable: !!(glfx && glfx.unavailable), webgl2: !!gl, renderer };
});
console.log('[gl]', JSON.stringify(glInfo));

// 弹群安装（每相位一条环绕 aim 圈）
const spawnInfo = await page.evaluate(async () => {
  const g = window.__swGame;
  const { MagicMissileProj } = await import('/src/entities/MissileProj.ts');
  const cx0 = g.player.cx, cy0 = g.player.cy - 120;
  const projs = [];
  for (let i = 0; i < 12; i++) {
    const phase = (i / 12) * Math.PI * 2;
    const m = new MagicMissileProj(cx0 + Math.cos(phase) * 130, cy0 + Math.sin(phase) * 90, 0.01, 0, {
      projId: 79, damage: 50, knockback: 5, useTime: 20,
      channelCb: () => true,
      aimCb: () => ({ x: cx0 + Math.cos(phase + window.__bj255t * 0.09) * 130, y: cy0 + Math.sin(phase + window.__bj255t * 0.09) * 90 }),
      payMana: () => true,
    });
    m.x = m.x - m.w / 2; m.y = m.y - m.h / 2;
    g.entities.add(m, 'projectiles');
    projs.push(m);
  }
  window.__bj255projs = projs;
  window.__bj255t = 0;
  return { n: projs.length };
});
console.log('[spawn]', JSON.stringify(spawnInfo));

// 预热：拖尾长满+贴图落地（120 拍）
await page.evaluate(() => {
  const g = window.__swGame;
  g.paused = false;
  for (let k = 0; k < 120; k++) { window.__bj255t++; g.fixedUpdate(1 / 60); }
  g.paused = true;
});
await new Promise((r) => setTimeout(r, 900));

// rAF 间隔采样（外测,不挂 profiler）
async function sampleFrames(label, frames) {
  await page.evaluate((n) => {
    window.__bj255s = { times: [], n, last: 0, done: false };
    const loop = () => {
      const now = performance.now();
      const s = window.__bj255s;
      if (s.last) s.times.push(now - s.last);
      s.last = now;
      if (s.times.length >= s.n) { s.done = true; return; }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }, frames);
  const t0 = Date.now();
  await page.waitForFunction(() => window.__bj255s?.done, { timeout: 120000, polling: 200 });
  const stats = await page.evaluate((lb) => {
    const g = window.__swGame;
    const ts = window.__bj255s.times.slice(2).sort((a, b) => a - b);
    const q = (p) => ts[Math.min(ts.length - 1, Math.floor(ts.length * p))];
    const alive = (g.entities.projectiles ?? []).filter((p) => p.projId === 79 && !p.dead).length;
    const dbg = g.renderer?.__trailDbg ?? null;
    const mmProg = !!(g.renderer?.glfx?.trailMMProg);
    return { label: lb, n: ts.length, avg: ts.reduce((s, v) => s + v, 0) / ts.length,
      p50: q(0.5), p95: q(0.95), p99: q(0.99), max: ts[ts.length - 1],
      alive, dbg, mmProg };
  }, label);
  console.log('[frames]', JSON.stringify(stats));
  return stats;
}

// ---- face A：GL 直绘（默认）----
gloopOn();
function gloopOn() { /* 游戏主循环一直在跑（paused=false 由 face 开始时置） */ }
await page.evaluate(() => { window.__swGame.paused = false; });
const glStats = await sampleFrames('GL', 480);
await page.screenshot({ path: '/tmp/bj255-gl.png' });
await page.evaluate(() => { window.__swGame.paused = true; });
await new Promise((r) => setTimeout(r, 250));

// ---- face B：?trailgl=0（CPU 兜底 P1+P2）——pushState 免重载切 URL 参数 ----
await page.evaluate(() => {
  window.history.pushState({}, '', '/?traildbg&trailgl=0');
});
await page.evaluate(() => { window.__swGame.paused = false; });
const cpuStats = await sampleFrames('CPU-fallback(P1P2)', 480);
await page.screenshot({ path: '/tmp/bj255-cpu.png' });
await page.evaluate(() => { window.__swGame.paused = true; });

// ---- face C：切回 GL 复核（pushState 回默认）----
await page.evaluate(() => { window.history.pushState({}, '', '/?traildbg'); });
await page.evaluate(() => { window.__swGame.paused = false; });
const glStats2 = await sampleFrames('GL-again', 240);
await page.evaluate(() => { window.__swGame.paused = true; });

console.log('shots: /tmp/bj255-gl.png /tmp/bj255-cpu.png');
await browser.close();
process.exit(0);
