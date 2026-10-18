// 烟囱闪烁取证 v2:载入 FTW_V2 存档 → 贴到烟囱旁 → 页内 getImageData 连续采样
//   烟囱包围盒(视口映射) → 帧间差分 + 变化簇颜色/位置分析
import { DOWNLOADS, needInput, join } from './_pathlib.mjs';
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const MAP = process.env.MAP || needInput(join(DOWNLOADS, 'map-FTW_V2 (10).json'));
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 988, height: 862 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 160)));
await page.goto(ORIGIN, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async (mapText) => { await window.__swFlow.loadJson(mapText); }, fs.readFileSync(MAP, 'utf8'));
await page.waitForFunction(() => !!window.__swGame?.world?.store?.w, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 600));
const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 烟囱包围盒(块):x 4130..4133, y 434..437
  const cx0 = 4130 * 16, cy0 = 433 * 16, cw = 4 * 16, chh = 5 * 16;
  // 相机:找 renderer.camera 或从 draw 参数——用玩家对中近似(摄像机跟随玩家中心)
  g.player.x = cx0 + cw / 2 - 8;
  g.player.y = cy0 + chh - 3 * 16;   // 站烟囱底脚
  g.player.vx = 0; g.player.vy = 0; g.player.fallStartY = null;
  await new Promise((r2) => setTimeout(r2, 700));   // 相机收敛
  // 找主画布与 2D 句柄
  const cvs = [...document.querySelectorAll('canvas')].sort((a, b) => b.width * b.height - a.width * a.height);
  const cv = cvs[0];
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { fail: 'no ctx' };
  const camX = g.player.cx - cv.width / 2, camY = g.player.cy - cv.height / 2;   // 近似相机左上
  const sx = Math.round(cx0 - camX), sy = Math.round(cy0 - camY);
  const frames = [];
  for (let k = 0; k < 60; k++) {
    frames.push(ctx.getImageData(sx, sy, cw, chh).data.slice());
    await new Promise((r2) => setTimeout(r2, 33));   // ~2 tick 一拍
  }
  // 帧间差分
  const diffs = [];
  for (let k = 1; k < frames.length; k++) {
    const a = frames[k - 1], b = frames[k];
    let cnt = 0; const cells = new Set();
    for (let o = 0; o < a.length; o += 4) {
      if (Math.abs(a[o] - b[o]) > 20 || Math.abs(a[o + 1] - b[o + 1]) > 20 || Math.abs(a[o + 2] - b[o + 2]) > 20) {
        cnt++;
        cells.add(((o / 4 / 16) | 0) + ',' + (((o / 4) % cw / 16) | 0));   // 块坐标
      }
    }
    diffs.push({ k, cnt, cells: [...cells] });
  }
  // 逐帧直方图(hash 内容签名)
  const sigs = frames.map((f) => {
    let h = '';
    for (let o = 0; o < f.length; o += 64) h += String.fromCharCode(65 + ((f[o] + f[o + 1]) % 26));
    return h;
  });
  const uniq = [...new Set(sigs)];
  return {
    region: { sx, sy, w: cw, h: chh },
    frameCount: frames.length,
    distinctSignatures: uniq.length,
    diffTrend: diffs.map((d) => d.cnt),
    hotCells: Object.entries(diffs.reduce((m, d) => { d.cells.forEach((c) => m[c] = (m[c] || 0) + 1); return m; }, {}))
      .sort((a, b) => b[1] - a[1]).slice(0, 8),
    done: true,
    abTest: await (async () => {
      const measure = async () => {
        const fs2 = [];
        for (let k = 0; k < 24; k++) {
          fs2.push(ctx.getImageData(sx, sy, cw, chh).data.slice());
          await new Promise((r2) => setTimeout(r2, 33));
        }
        let flips = 0;
        const flipMap = new Set();
        for (let k = 1; k < fs2.length; k++) {
          const a2 = fs2[k - 1], b2 = fs2[k];
          for (let o = 0; o < a2.length; o += 4) {
            if (Math.abs(a2[o] - b2[o]) > 20 || Math.abs(a2[o + 1] - b2[o + 1]) > 20 || Math.abs(a2[o + 2] - b2[o + 2]) > 20) {
              flips++;
              flipMap.add(((o / 4 / 16) | 0) + ',' + (((o / 4 / 16) === 0 ? o : o) % cw / 16 | 0));
            }
          }
        }
        return flips;
      };
      // 基线 A：含壁炉(动画中)
      const baseFlips = await measure();
      // 清空壁炉 3×2(4130..4132 × 442..443)
      const stb = g.world.store;
      for (let xx = 4130; xx <= 4132; xx++) for (let yy = 442; yy <= 443; yy++) stb.setTile(xx, yy, 0);
      await new Promise((r2) => setTimeout(r2, 700));   // 等 rebake 稳定
      const noFireFlips = await measure();
      return { baseFlips, noFireFlips };
    })(),
    dump: { w: cw, h: chh, frames: frames.slice(0, 16).map((f) => btoa(String.fromCharCode.apply(null, new Uint8Array(f)))) },
  };
});
console.log(JSON.stringify(result, null, 1));
fs.writeFileSync('/tmp/chimney-frames.json', JSON.stringify(result.dump));
fs.writeFileSync('/tmp/chimney-analysis.json', JSON.stringify(result));
await browser.close();
