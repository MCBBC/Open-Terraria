// BJ365 v2: 巨型龙蛋(tile 752)实机截图探针——修复 v1 三坑:
//  ①导入兼容报告对话框挡蛋 → 进世界后点「关闭」
//  ②世界入场黑幕淡出未完即拍(EGG1-3 全黑) → 首拍前等 10s + 逐蛋画布亮度轮询
//  ③EGG4(5422,1102) 周边水洞无干站位 → 二次尝试允许液体(仍须脚下实心)
import { HOME, needInput, join } from './_pathlib.mjs';
import { readFileSync } from 'node:fs';
import { startPrivateVite, killTree } from '../tools/probe/lib/vite.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { waitForGame } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const WLD = needInput(join(HOME, 'Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-09/天真的钴最高点(3).wld'));
const PORT = Number(process.env.BJ365_PORT ?? 5202);
const EGGS = [[6280, 673], [783, 819], [2213, 909], [5422, 1102], [4900, 1431], [5139, 1508]];

const vite = await startPrivateVite({ port: PORT });
console.log(`VITE ${vite.origin} (log ${vite.logPath})`);
const errors = [];
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
try {
  const page = await openPage(browser, { errors });
  await bootstrap(page, vite.origin);
  const buf = readFileSync(WLD);
  const b64 = buf.toString('base64');
  const t0 = Date.now();
  const ok = await page.evaluate(async (b64) => {
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    const flow = window.__swFlow;
    if (!flow) return { ok: false, why: 'no __swFlow' };
    try { await flow.importWld(arr); return { ok: true }; }
    catch (e) { return { ok: false, why: String(e?.message ?? e).slice(0, 300) }; }
  }, b64);
  console.log('IMPORT:', JSON.stringify(ok), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok.ok) throw new Error('importWld 失败: ' + ok.why);
  if (!(await waitForGame(page, { timeout: 300000, log: (m) => console.log('  ', m) }))) throw new Error('进世界超时');

  // 探针环境定妆:关欢迎/兼容报告两道弹窗、上帝、开灯、时钟冻结、zoom 归一
  await page.evaluate(() => {
    const clickBtn = (label) => {
      const b = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').trim() === label);
      if (b) { b.click(); return true; }
      return false;
    };
    const ack = [...document.querySelectorAll('button')].find((x) => (x.textContent ?? '').includes('我已知晓'));
    if (ack) ack.click();
    clickBtn('关闭');
    const g = window.__swGame;
    g.player.debugGod = true;
    g.renderer.fullbright = true;
    if (g.camera) { g.camera.zoom = 1; g.camera.zoomTarget = 1; }
  });
  await freezeClock(page, { tod: 0.5 });
  await new Promise((r) => setTimeout(r, 10_000));   // 世界入场黑幕淡出(BJ275 同款 10s)

  // 画布中心区亮度(全黑=幕未退/chunk 未烘)
  const lum = () => page.evaluate(() => {
    const c = document.querySelector('canvas');
    if (!c) return -1;
    const x = Math.max(0, (c.width >> 1) - 96), y = Math.max(0, (c.height >> 1) - 96);
    const d = c.getContext('2d').getImageData(x, y, 192, 192).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 16) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return s / (d.length / 16);
  });

  for (let n = 0; n < EGGS.length; n++) {
    const [ax, ay] = EGGS[n];
    const shot = `/tmp/bj365-egg-${n + 1}.png`;
    const info = await page.evaluate(({ ax, ay }) => {
      const g = window.__swGame;
      const st = g.world.store;
      const cells = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = st.idx(ax + dx, ay + dy);
        cells.push(st.flags[i] ? st.type[i] : -1, st.frameX[i], st.frameY[i]);
      }
      const blocked = (tx, ty) => {
        const i = st.idx(tx, ty);
        return st.isSolid(tx, ty) || st.liquid[i] > 0;
      };
      const pocket = (tx, fy, allowLiquid) => {
        const clear = allowLiquid
          ? (x, y) => !st.isSolid(x, y)   // 水下支:只挡实心,允许液体
          : (x, y) => !blocked(x, y);
        return clear(tx, fy) && clear(tx, fy - 1) && clear(tx, fy - 2) &&
          clear(tx + 1, fy) && clear(tx + 1, fy - 1) && clear(tx + 1, fy - 2) &&
          st.isSolid(tx, fy + 1) && st.isSolid(tx + 1, fy + 1);
      };
      let spot = null, wet = false;
      for (const allowLiquid of [false, true]) {
        for (const dx of [4, -4, 5, -5, 3, -3, 6, -6, 8, -8, 2, -2, 10, -10, 0]) {
          const tx = ax + 1 + dx;
          for (const dy of [0, -1, 1, -2, 2, -3, 3, 4, -4, 6, -6, 8, -8]) {
            const fy = ay + 1 + dy;
            if (tx > 5 && tx < st.w - 6 && fy > 5 && fy < st.h - 6 && pocket(tx, fy, allowLiquid)) {
              spot = { tx, fy }; wet = allowLiquid; break;
            }
          }
          if (spot) break;
        }
        if (spot) break;
      }
      if (!spot) return { ok: false, why: 'no-pocket', cells };
      const px = spot.tx * 16 + 8;
      const py = (spot.fy + 1) * 16 - 42;
      g.player.x = px; g.player.y = py; g.player.vx = 0; g.player.vy = 0;
      if (g.camera) { g.camera.x = px + 10; g.camera.y = py + 21; g.camera.zoom = 1; g.camera.zoomTarget = 1; }
      const eggPx = (ax + 1) * 16, eggPy = (ay + 1) * 16;
      const vw = g.renderer?.viewW ?? 1280, vh = g.renderer?.viewH ?? 800;
      const z = g.camera?.zoom ?? 1;
      return {
        ok: true, cells, spot, wet, player: [g.player.x, g.player.y],
        eggScreen: [Math.round((eggPx - g.camera.x) * z + vw / 2), Math.round((eggPy - g.camera.y) * z + vh / 2)],
      };
    }, { ax, ay });
    console.log(`EGG${n + 1} (${ax},${ay}):`, JSON.stringify(info));
    if (!info.ok) { console.log(`EGG${n + 1} FAIL no-pocket`); continue; }
    // 亮度轮询:黑幕/chunk 烘焙最长再等 12s
    for (let k = 0; k < 12; k++) {
      const L = await lum();
      if (L > 8) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 400));
    await page.screenshot({ path: shot });
    console.log('SCREENSHOT ' + shot);
  }
  if (errors.length) console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 10)));
  console.log('BJ365 PROBE V2 DONE');
} finally {
  await browser.close().catch(() => {});
  const r = await killTree(vite.port, vite.child).catch((e) => ({ err: String(e) }));
  console.log('VITE KILL:', JSON.stringify(r));
}
