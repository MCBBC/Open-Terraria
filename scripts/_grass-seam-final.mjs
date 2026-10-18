// 自包含:起独立 vite(5209)→ 载入 FTW → 对比草/泥边界 6 格 链帧 vs 旧帧 → 截图 → 收服
import { DOWNLOADS, REPO_ROOT, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawn, execSync } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = needInput(join(DOWNLOADS, 'FTW V2.wld'));
const PORT = 5209;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 起独立实例(独立缓存目录;detached 防超时连坐)
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: REPO_ROOT,
  env: { ...process.env, SW_NO_HMR: '1', SW_CACHE: '/tmp/sw-vite-5209' },
  stdio: 'ignore', detached: true,
});
process.on('exit', () => { try { process.kill(-vite.pid); } catch {} });
try {
  let up = false;
  for (let i = 0; i < 60 && !up; i++) {
    await sleep(2000);
    up = await fetch(`http://localhost:${PORT}/?nosw`).then((r) => r.ok).catch(() => false);
    if (!up && i === 20) { // 预热主模块
      await fetch(`http://localhost:${PORT}/src/main.ts`).catch(() => {});
    }
  }
  if (!up) throw new Error('vite 未启动');
  console.log('vite up');

  const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=metal'], defaultViewport: { width: 1200, height: 800 } });
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
  let inGame = false;
  for (let i = 0; i < 150 && !inGame; i++) { await sleep(1000); inGame = await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player)); }
  if (!inGame) throw new Error('未进游戏');
  await sleep(4000);
  await p.evaluate(() => { const g = window.__swGame; g.player.x = 3996 * 16; g.player.y = 450 * 16; g.player.vx = 0; g.player.vy = 0; });
  await sleep(6000);

  const out = await p.evaluate(async () => {
    const vf = await import('/src/render/VanillaFraming.ts');
    const vt = await import('/src/render/VanillaTiler');
    const g = window.__swGame;
    const st = g.world.store;
    const rock = g.world.rockLevel ?? 0;
    const rows = [];
    for (const [x, y] of [[3996, 456], [3997, 456], [3998, 456], [3996, 457], [3997, 457], [3998, 457]]) {
      const i = st.idx(x, y);
      const t = st.type[i];
      const half = st.half[i], slope = st.slope[i], wall = st.wall[i];
      const chain = vf.vanillaFrameFor(st, x, y, st, 0, rock);
      const oldF = vt.autoFrameAt(st, x, y, t);
      rows.push(`(${x},${y}) t${t} w${wall} hs${half}${slope}: chain=(${chain.fx},${chain.fy}) old=(${oldF.col * 18},${oldF.row * 18})`);
    }
    // 同类对照:rig 区域内草上泥下 (3970,463/464)
    for (const [x, y] of [[3970, 463], [3970, 464]]) {
      const i = st.idx(x, y);
      const t = st.type[i];
      const chain = vf.vanillaFrameFor(st, x, y, st, 0, rock);
      rows.push(`对照 (${x},${y}) t${t}: chain=(${chain.fx},${chain.fy})`);
    }
    // 渲染截取
    const ch = g.chunks.get(249, 28);
    const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
    const tctx = tcv.getContext('2d', { willReadFrequently: true });
    tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
    const crop = document.createElement('canvas'); crop.width = 112; crop.height = 96;
    const cc = crop.getContext('2d'); cc.imageSmoothingEnabled = false;
    cc.drawImage(tcv.canvas, 11 * 16, 7 * 16, 112, 96, 0, 0, 112, 96);
    const z = document.createElement('canvas'); z.width = 672; z.height = 576;
    const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false;
    zc.drawImage(crop, 0, 0, 672, 576);
    return { rows, png: z.toDataURL('image/png') };
  });
  console.log(out.rows.join('\n'));
  fs.writeFileSync('/tmp/grass-seam-final.png', Buffer.from(out.png.split(',')[1], 'base64'));
  console.log('crop → /tmp/grass-seam-final.png');
  await b.close();
} finally {
  try { process.kill(-vite.pid); } catch {}
  execSync('pkill -f "sw-vite-5209" 2>/dev/null || true').toString();
}
console.log('done');
