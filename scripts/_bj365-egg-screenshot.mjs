// BJ365: 巨型龙蛋(tile 752)实机截图探针——私域 vite + importWld 进世界 + 逐蛋传送截图
// 坐标源: scripts/_bj365-scan-752.mjs 对 wld 直扫锚格(frameX=0,frameY=0,2×2 左上)
// 纪律: SW_NO_HMR=1 + 独立 SW_CACHE + 收尾 killTree 精确杀树(tools/probe/lib/vite.mjs)
import { readFileSync } from 'node:fs';
import { startPrivateVite, killTree } from '../tools/probe/lib/vite.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { waitForGame } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const WLD = '/Users/vinlic/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-09/天真的钴最高点(3).wld';
const PORT = Number(process.env.BJ365_PORT ?? 5201);

// 扫描所得 6 锚格(tile 坐标,2×2 左上)
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
  console.log(`IMPORT wld ${(buf.length / 1e6).toFixed(1)}MB ...`);
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
  const inGame = await waitForGame(page, { timeout: 300000, log: (m) => console.log('  ', m) });
  if (!inGame) throw new Error('进世界超时');

  // 探针环境定妆:欢迎弹窗关闸/上帝/开灯/时钟冻结正午/zoom 归一
  await page.evaluate(() => {
    const ack = [...document.querySelectorAll('button')].find((b) => (b.textContent ?? '').includes('我已知晓'));
    if (ack) ack.click();
    const g = window.__swGame;
    g.player.debugGod = true;
    g.renderer.fullbright = true;
    if (g.camera) { g.camera.zoom = 1; g.camera.zoomTarget = 1; }
  });
  await freezeClock(page, { tod: 0.5 });
  await new Promise((r) => setTimeout(r, 1500));

  const fails = 0;
  for (let n = 0; n < EGGS.length; n++) {
    const [ax, ay] = EGGS[n];
    const shot = `/tmp/bj365-egg-${n + 1}.png`;
    const info = await page.evaluate(({ ax, ay }) => {
      const g = window.__swGame;
      const st = g.world.store;
      // ①回验:游戏内 4 格帧域须与文件扫描全等
      const cells = [];
      for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
        const i = st.idx(ax + dx, ay + dy);
        cells.push(st.flags[i] ? st.type[i] : -1, st.frameX[i], st.frameY[i]);
      }
      // ②找站位:3 行净空+脚下实心,优先 egg 旁 3-6 格(蛋不被玩家挡)
      const free = (tx, ty) => {
        const i = st.idx(tx, ty);
        return !st.isSolid(tx, ty) && st.liquid[i] === 0;
      };
      const pocket = (tx, fy) =>
        free(tx, fy) && free(tx, fy - 1) && free(tx, fy - 2) &&
        free(tx + 1, fy) && free(tx + 1, fy - 1) && free(tx + 1, fy - 2) &&
        st.isSolid(tx, fy + 1) && st.isSolid(tx + 1, fy + 1);
      let spot = null;
      for (const dx of [4, -4, 5, -5, 3, -3, 6, -6, 8, -8, 2, -2, 10, -10, 0]) {
        const tx = ax + 1 + dx;
        for (const dy of [0, -1, 1, -2, 2, -3, 3, 4, -4, 6, -6, 8, -8]) {
          const fy = ay + 1 + dy;
          if (tx > 5 && tx < st.w - 6 && fy > 5 && fy < st.h - 6 && pocket(tx, fy)) { spot = { tx, fy }; break; }
        }
        if (spot) break;
      }
      if (!spot) return { ok: false, why: 'no-pocket', cells };
      // ③置位:脚底 = spot.fy+1 行顶;蛋心在锚右下一格
      const px = spot.tx * 16 + 8;
      const py = (spot.fy + 1) * 16 - 42;
      g.player.x = px; g.player.y = py; g.player.vx = 0; g.player.vy = 0;
      if (g.camera) { g.camera.x = px + 10; g.camera.y = py + 21; g.camera.zoom = 1; g.camera.zoomTarget = 1; }
      // ④蛋锚屏坐标(校在画幅内)
      const eggPx = (ax + 1) * 16, eggPy = (ay + 1) * 16;
      const vw = g.renderer?.viewW ?? 1280, vh = g.renderer?.viewH ?? 800;
      const z = g.camera?.zoom ?? 1;
      return {
        ok: true, cells, spot, player: [g.player.x, g.player.y],
        eggScreen: [Math.round((eggPx - g.camera.x) * z + vw / 2), Math.round((eggPy - g.camera.y) * z + vh / 2)],
      };
    }, { ax, ay });
    console.log(`EGG${n + 1} (${ax},${ay}):`, JSON.stringify(info));
    if (!info.ok) { console.log(`EGG${n + 1} FAIL no-pocket`); continue; }
    if (info.cells.some((v, i) => i % 3 === 0 ? v !== 752 : true)) {
      console.log(`EGG${n + 1} WARN 游戏内帧域与扫描不符: ${JSON.stringify(info.cells)}`);
    }
    // 站稳收敛(掉落微降/相机已 snap;开灯免光照传播等待)
    await new Promise((r) => setTimeout(r, 1200));
    await page.screenshot({ path: shot });
    console.log('SCREENSHOT ' + shot);
  }
  if (errors.length) console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 10)));
  console.log('BJ365 PROBE DONE');
} finally {
  await browser.close().catch(() => {});
  const r = await killTree(vite.port, vite.child).catch((e) => ({ err: String(e) }));
  console.log('VITE KILL:', JSON.stringify(r));
}
