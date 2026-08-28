// 修复后 A/B 复检:vf=1(链)与 vf=0(旧)各跑一趟,同点位裁剪 chunk 烘焙图 + 全屏截图。
// 产物:/tmp/vfab-after-vf{1,0}.png(12x 裁剪)与 /tmp/vfab-after-vf{1,0}-full.png。
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import { spawn } from 'node:child_process';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const WLD = '/Users/vinlic/Downloads/FTW V2.wld';
const PORT = 5209;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: '/Users/vinlic/Project/GLM/SandboxWorld/game',
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
  const wldB64 = fs.readFileSync(WLD).toString('base64');

  async function loadAndGo(vf) {
    await p.goto(`http://localhost:${PORT}/?nosw&vf=${vf}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await p.waitForFunction(() => typeof window.__swLoadJson === 'function', { timeout: 300000 });
    const conv = await p.evaluate(async (b64) => {
      const m = await import('/src/wld/WldImport.ts');
      const bin = atob(b64); const buf = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
      return JSON.stringify(m.parseWldToSave(buf).save);
    }, wldB64);
    await p.evaluate((t) => window.__swLoadJson(t), conv);
    let ok = false;
    for (let i = 0; i < 150 && !ok; i++) { await sleep(1000); ok = await p.evaluate(() => !!(window.__swGame?.renderer && window.__swGame?.player)); }
    if (!ok) throw new Error('未进游戏 vf=' + vf);
    await sleep(3000);
    await p.evaluate(() => {
      const btn = [...document.querySelectorAll('button, .btn, [class*=button]')].find((el) => (el.textContent ?? '').includes('我已知晓'));
      if (btn) btn.click();
    });
    await p.evaluate(() => { const g = window.__swGame; g.player.x = 3997 * 16; g.player.y = 448 * 16; g.player.vx = 0; g.player.vy = 0; });
    await sleep(7000);
  }
  async function cropShot(tag) {
    const r = await p.evaluate(() => {
      try {
        const g = window.__swGame;
        const ch = g.chunks.get(249, 28);
        if (!ch || !ch.tile) return { err: 'no-chunk' };
        const tcv = document.createElement('canvas'); tcv.width = 256; tcv.height = 256;
        const tctx = tcv.getContext('2d', { willReadFrequently: true });
        tctx.drawImage(ch.tile, ch.sx, ch.sy, 256, 256, 0, 0, 256, 256);
        const crop = document.createElement('canvas'); crop.width = 192; crop.height = 160;
        const cc = crop.getContext('2d'); cc.imageSmoothingEnabled = false;
        cc.drawImage(tcv.canvas, 10 * 16, 5 * 16, 192, 160, 0, 0, 192, 160);
        const z = document.createElement('canvas'); z.width = 768; z.height = 640;
        const zc = z.getContext('2d'); zc.imageSmoothingEnabled = false;
        zc.drawImage(crop, 0, 0, 768, 640);
        return { png: z.toDataURL('image/png') };
      } catch (e) { return { err2: String(e).slice(0, 300) }; }
    });
    if (r.err2) console.log(`[${tag}] 页内错误:`, r.err2);
    if (r.png) fs.writeFileSync(`/tmp/vfab-after-${tag}.png`, Buffer.from(r.png.split(',')[1], 'base64'));
    await p.screenshot({ path: `/tmp/vfab-after-${tag}-full.png` });
  }

  await loadAndGo(1);
  await cropShot('vf1');
  console.log('vf1 done');
  await loadAndGo(0);
  await cropShot('vf0');
  console.log('vf0 done');
  await b.close();
} finally {
  try { process.kill(-vite.pid); } catch {}
}
console.log('all-done');
