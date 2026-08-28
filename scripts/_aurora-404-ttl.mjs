// 一次性回归:极光噪声贴图(Extra_286/287)加载失败时的三条命——
//   ①帧循环不许死(曾:ensureNoise 的 failed 标志丢失→失败照样置就绪→
//     uploadNoise(null).length TypeError→熔断停机,用户实报"停 4173 就炸");
//   ②失败窗内极光安静跳过(noiseState 回 0+10s TTL);
//   ③解禁(服务恢复)后 ≤TTL+载入 时间自愈上屏,免刷新。
// 复现手法:request interception 把两张 png abort('failed')≡服务器不在。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();

let passNoise = false;
await page.setRequestInterception(true);
page.on('request', (req) => {
  if (!passNoise && /Extra_28[67]\.png(\?|$)/.test(req.url())) { req.abort('failed'); return; }
  req.continue();
});

const logs = [];
page.on('console', (m) => logs.push(m.type() + ': ' + m.text()));
page.on('pageerror', (e) => logs.push('pageerror: ' + String(e)));

await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('FAIL GAME NOT READY'); await browser.close(); process.exit(1); }

// 雪原落点 + 深夜 + 满月(照抄 _aurora-dump 的激活路径)
await page.evaluate(async () => {
  const td = await import('/src/data/tiles.ts');
  const defs = td.TILE_DEFS;
  const snowIds = new Set();
  for (let id = 0; id < defs.length; id++) {
    const v = defs[id]?.vanilla?.sheet;
    if (v === 147 || v === 161) snowIds.add(id);
  }
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  const gy = w.groundLevel;
  const colSnow = [];
  for (let x = 10; x < st.w - 10; x++) {
    let n = 0;
    for (let y = Math.max(5, gy - 80); y < Math.min(st.h - 5, gy + 40); y++) {
      if (snowIds.has(st.type[st.idx(x, y)])) n++;
    }
    colSnow.push(n);
  }
  const cand = [];
  for (let x = 16; x < colSnow.length - 16; x++) {
    let s = 0;
    for (let k = -16; k <= 16; k++) s += colSnow[x + k];
    cand.push({ x, s });
  }
  cand.sort((a, b) => b.s - a.s);
  let ty = -1, bx = -1;
  for (const cd of cand.slice(0, 40)) {
    for (let y = Math.max(4, gy - 100); y <= gy + 40; y++) {
      if (st.isSolid(cd.x, y)) {
        let open = true;
        for (let k = 1; k <= 6; k++) if (st.isSolid(cd.x, y - k)) { open = false; break; }
        if (open) { bx = cd.x; ty = y; }
        break;
      }
    }
    if (ty >= 0) break;
  }
  if (ty >= 0) {
    p.x = bx * 16 - p.w / 2;
    p.y = (ty - 3) * 16 - p.h;
    p.vx = 0; p.vy = 0;
  }
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.9;
  if ('moonPhase' in c) { try { c.moonPhase = 0; } catch { /* noop */ } }
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const snap = () => page.evaluate(() => {
  const g = window.__swGame;
  const aur = g.renderer.sky.aurora;
  return {
    running: !!g.running,
    fatal: false,
    isActive: aur.isActive,
    opacity: aur.opacity,
    uploaded: !!aur.glAurora && !!aur.glAurora._noiseUploaded,
    glCanvasW: aur.glAurora?.canvas ? aur.glAurora.canvas.width : -1,
  };
});
const fatalLines = () => logs.filter((l) =>
  l.includes('帧循环异常') || l.includes('uploadNoise') || l.includes('Cannot read properties of null'));

// ---- 阶段A:贴图持续 404 泡 14s——不许停机 ----
await sleep(14000);
const a = await snap();
const f1 = fatalLines();
console.log('[A] 贴图全 404 窗:', JSON.stringify(a));
if (f1.length) { console.log('FAIL fatal logs:\n' + f1.join('\n')); await browser.close(); process.exit(1); }
if (!a.running) { console.log('FAIL 帧循环已停机'); await browser.close(); process.exit(1); }

// ---- 阶段B:解禁(模拟服务拉起),≤TTL(10s)+载入 内应自愈 ----
passNoise = true;
let b = null;
for (let i = 0; i < 25; i++) {
  await sleep(2000);
  b = await snap();
  if (b.uploaded) break;
}
const f2 = fatalLines();
console.log('[B] 解禁后:', JSON.stringify(b));
if (f2.length) { console.log('FAIL fatal logs:\n' + f2.join('\n')); await browser.close(); process.exit(1); }
if (!a.uploaded && b.uploaded && b.isActive && b.glCanvasW > 0 && b.running) {
  console.log('PASS:404 不停机,TTL 后自愈重传并恢复绘制');
} else {
  console.log('FAIL: ' + JSON.stringify({ phaseA_uploaded: a.uploaded, recovered: b?.uploaded, active: b?.isActive, glW: b?.glCanvasW }));
  await browser.close(); process.exit(1);
}
await browser.close();
