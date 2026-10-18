// 自包含:起独立 vite(5209)→ 载入 FTW → 传送到标注区 → 倾倒运行时 store 类型/half/slope
// + 运行时 vanillaFrameFor 帧 + 实际烘焙 chunk 像素(逐格 PNG)→ 退出。
// 输出 /tmp/vf-live.json(数据)+ /tmp/vf-live-cells.png(实际渲染放大图)。
import { DOWNLOADS, REPO_ROOT, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, 'FTW V2.wld'));
const PORT = 5209;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: REPO_ROOT,
  env: { ...process.env, SW_NO_HMR: '1', SW_CACHE: '/tmp/sw-vite-5209' },
  stdio: 'ignore', detached: true,
});
process.on('exit', () => { try { process.kill(-vite.pid); } catch {} });
try {
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    await sleep(2000);
    up = await fetch(`http://localhost:${PORT}/?nosw`).then((r) => r.ok).catch(() => false);
    if (!up && i === 25) await fetch(`http://localhost:${PORT}/src/main.ts`).then(() => {}).catch(() => {});
  }
  if (!up) throw new Error('vite down');
  console.log('vite up');
  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1512, height: 862 } });
  const p = await b.newPage();
  await p.goto(`http://localhost:${PORT}/?nosw&vf=1`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 300000 });
  const wldB64 = fs.readFileSync(WLD).toString('base64');
  const conv = await p.evaluate(async (b64) => {
    const m = await import('/src/wld/WldImport.ts');
    const bin = atob(b64); const buf = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
    return JSON.stringify(m.parseWldToSave(buf).save);
  }, wldB64);
  await p.evaluate((t) => window.__swLoadJson(t), conv);
  let ok = false;
  for (let i = 0; i < 150 && !ok; i++) { await sleep(1000); ok = await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player)); }
  if (!ok) throw new Error('未进游戏');
  await sleep(3000);
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('button, .btn, [class*=button]')].find((el) => (el.textContent ?? '').includes('我已知晓'));
    if (btn) btn.click();
  });
  await p.evaluate(() => { const g = window.__swGame; g.player.x = 3997 * 16; g.player.y = 448 * 16; g.player.vx = 0; g.player.vy = 0; });
  await sleep(7000);

  const out = await p.evaluate(async () => {
    const vf = await import('/src/render/VanillaFraming.ts');
    const fam = await import('/src/render/TileMergeFamily');
    const g = window.__swGame;
    const st = g.world.store;
    const rock = g.world.rockLevel ?? 0;
    const X0 = 3990, X1 = 4009, Y0 = 450, Y1 = 464;
    const cells = [];
    for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
      const i = st.idx(x, y);
      const t = st.type[i];
      cells.push({
        x, y, act: st.flags[i] ? 1 : 0, t,
        vid: fam.vanillaIdOf(t),
        half: st.half[i] ? 1 : 0, slope: st.slope[i] ?? 0,
        fx: st.frameX[i], fy: st.frameY[i],
        chain: st.flags[i] ? (() => { const r = vf.vanillaFrameFor(st, x, y, st, ((x * 7) + (y * 11)) % 3, rock); return [r.fx, r.fy]; })() : null,
      });
    }
    // 实际烘焙 chunk 像素:chunk 249,28 覆盖 3984..3999+ / 448..;需要 chunk 249-250
    const cropW = (X1 - X0 + 1) * 16, cropH = (Y1 - Y0 + 1) * 16;
    const cv = document.createElement('canvas'); cv.width = cropW; cv.height = cropH;
    const cc = cv.getContext('2d'); cc.imageSmoothingEnabled = false;
    for (let cy = 28; cy <= 29; cy++) for (let cx = 249; cx <= 250; cx++) {
      const ch = g.chunks.get(cx, cy);
      if (!ch || !ch.tile) continue;
      // chunk 世界原点 = (cx*16, cy*16);canvas 内部裁剪偏移 ch.sx/ch.sy
      cc.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, cx * 16 - X0 * 16, cy * 16 - Y0 * 16, 256, 256);
    }
    return { cells, png: cv.toDataURL('image/png'), rock, w: st.w, h: st.h };
  });
  fs.writeFileSync('/tmp/vf-live.json', JSON.stringify(out.cells));
  fs.writeFileSync('/tmp/vf-live-cells.png', Buffer.from(out.png.split(',')[1], 'base64'));
  console.log('cells dumped:', out.cells.length, 'rock=', out.rock, 'store=', out.w, 'x', out.h);
  console.log('png -> /tmp/vf-live-cells.png');
  await b.close();
} finally {
  try { process.kill(-vite.pid); } catch {}
  execSync('pkill -f "sw-vite-5209" 2>/dev/null || true').toString();
}
console.log('done');
