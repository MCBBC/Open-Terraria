// 一次性:雪原夜景极光 v2——强制激活后读门链全状态 + 高密度雪原传送 + 截图。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + String(e).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 200 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log('GAME NOT READY'); await browser.close(); process.exit(1); }

const spot = await page.evaluate(async () => {
  const td = await import('/src/data/tiles.ts');
  const defs = td.TILE_DEFS;
  const snowIds = new Set();
  for (let id = 0; id < defs.length; id++) {
    const v = defs[id]?.vanilla?.sheet;
    if (v === 147 || v === 161) snowIds.add(id);
  }
  const g = window.__swGame;
  const w = g.world, st = w.store, p = g.player;
  // 扫地表带雪块列,按 32 列窗计雪密度,取最密窗中心
  const gy = w.groundLevel;
  const colSnow = [];
  for (let x = 10; x < st.w - 10; x++) {
    let n = 0;
    for (let y = Math.max(5, gy - 80); y < Math.min(st.h - 5, gy + 40); y++) {
      if (snowIds.has(st.type[st.idx(x, y)])) n++;
    }
    colSnow.push(n);
  }
  // 按密度窗排序取候选列,逐列找"自顶向下首个实心行"且上方 ≥6 格通天(躲开树冠)
  const cand = [];
  for (let x = 16; x < colSnow.length - 16; x++) {
    let s = 0;
    for (let k = -16; k <= 16; k++) s += colSnow[x + k];
    cand.push({ x, s });
  }
  cand.sort((a, b) => b.s - a.s);
  let ty = -1, bx = -1;
  for (const cd of cand.slice(0, 40)) {
    const cx = cd.x;
    let openAbove = true;
    for (let y = Math.max(4, gy - 100); y <= gy + 40; y++) {
      if (st.isSolid(cx, y)) {
        let open = true;
        for (let k = 1; k <= 6; k++) if (st.isSolid(cx, y - k)) { open = false; break; }
        if (open) { bx = cx; ty = y; }
        break;
      }
    }
    if (ty >= 0) break;
  }
  if (ty < 0) return { found: false };
  p.x = bx * 16 - p.w / 2;
  p.y = (ty - 3) * 16 - p.h;
  p.vx = 0; p.vy = 0;
  return { found: true, x: bx, y: ty };
});
console.log('SPOT:', JSON.stringify(spot));

await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  if (typeof c.timeOfDay === 'number') c.timeOfDay = 0.9;
  if ('moonPhase' in c) { try { c.moonPhase = 0; } catch { /* getter-only */ } }
  // 不强制 setActive——玩家真身雪原 + 夜 + 月相门,由游戏 ManageSpecialBiomeVisuals 自然激活
});
await new Promise((r) => setTimeout(r, 9000));   // 场景雪计数平滑 + 淡入 0.3/s≈3.3s + 噪声

const state = await page.evaluate(() => {
  const g = window.__swGame;
  const c = g.world.clock;
  const aur = g.renderer.sky.aurora;
  const gl = aur.glAurora;
  return {
    timeOfDay: c.timeOfDay, moonPhase: c.moonPhase, isDay: c.isDay,
    aurIsActive: aur.isActive, aurOpacity: aur.opacity,
    aurPhase: aur.phase,                       // draw 写入;−1=没进 mode 门之后
    lastSkyColor: [...aur.lastSkyColor],
    glW: gl.canvas ? gl.canvas.width : -1, glH: gl.canvas ? gl.canvas.height : -1,
    noiseReady: aur.auroraNoiseReady ? aur.auroraNoiseReady() : 'n/a',
  };
});
console.log('STATE:', JSON.stringify(state));
await page.screenshot({ path: '/tmp/aurora-snow2.png' });
console.log('saved /tmp/aurora-snow2.png');
if (errors.length) console.log('ERRORS:\n' + errors.slice(0, 6).join('\n'));
await browser.close();
