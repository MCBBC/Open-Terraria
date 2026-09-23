// ★BJ318 WaveWorker 叉炸弹终验探针（快路径，无世界生成）。
// 方法：页面内直 spawn 一个 dev 服务的 WaveWorker 模块 worker，连发 N 帧
// {op:'frame'}，数 WaveWorker target 个数：
//   修复态（C8 fork bomb 修复：worker 上下文禁 _wwEnsure）→ 恒 1 个；
//   变异态（摘守卫）→ 链式 spawn，count ≥ 帧数-1（每帧消息沿链推进一级）。
// 判据：count===1 PASS；count>1 FAIL。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5203';
const FRAMES = Number(process.env.SW_FRAMES ?? 8);
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new',
  protocolTimeout: 120000,
  userDataDir: '/tmp/bj318-fork-' + (Date.now() % 100000),
  args: ['--no-sandbox', '--no-proxy-server'],
  defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR', String(e.message).slice(0, 120)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));

const count = () => browser.targets().filter((t) => (t.url() || '').includes('WaveWorker')).length;
console.log('T0 targets before =', count());

await page.evaluate((frames) => {
  const w = new Worker('/src/workers/WaveWorker.ts?worker_file&type=module', { type: 'module' });
  (window).__wwFields = 0;
  w.onmessage = (e) => { if (e.data?.op === 'field') (window).__wwFields++; };
  const inp = { camX: 0, camY: 0, zoom: 1, viewW: 800, viewH: 600, dt: 1 / 60,
    tileX: 0, tileY: 0, maxTilesX: 4200, maxTilesY: 1200, worldSurface: 300, rockLayer: 800,
    windAbs: 0, rain: 0 };
  (window).__wwT = w;
  w.postMessage({ op: 'quality', q: 3 });
  let i = 0;
  const iv = setInterval(() => {
    w.postMessage({ op: 'frame', inp, inj: [] });
    if (++i >= frames) clearInterval(iv);
  }, 120);
}, FRAMES);

await new Promise((r) => setTimeout(r, 1500 + FRAMES * 120 + 2500));
const n = count();
const fields = await page.evaluate(() => window.__wwFields).catch(() => -1);
console.log(`RESULT waveWorkerTargets=${n} frames=${FRAMES} fieldSnapshots=${fields}`);
console.log(n === 1 ? 'PASS（无 fork——worker 上下文禁建守卫生效）' : `FAIL（fork 仍在：${n} 个 WaveWorker）`);
await browser.close();
process.exit(n === 1 ? 0 : 1);
