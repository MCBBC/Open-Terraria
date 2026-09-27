// BJ365 终版取证: 逐蛋截图两版
//  A 版 = 纯实机画面(/tmp/bj365-egg-N.png,v2 已产;蛋因 SW 渲染缺口不可见)
//  B 版 = 实机画面 + 蛋贴图叠加(/tmp/bj365-egg-N-marked.png,叠加位置=蛋锚+原版绘制偏移,
//         同步 evaluate 内画完即 toDataURL,无 rAF 竞态;已标注非引擎渲染)
// 渲染缺口机制(另报,不在本刀修复):
//  Tiles_752.png 全仓 38×36,SW drawAdjust case752 依原版 TileDrawing.cs:4577-4581
//  请求 36×38 源矩形 → fit(sy+sh=38>imgH=36) 恒败 → 回退 18×18 格元(隔离重画 32px 粉),
//  实机烘焙连格元也未上屏(活体画布精确调色板 0 命中)。
import { readFileSync, writeFileSync } from 'node:fs';
import { startPrivateVite, killTree } from '../tools/probe/lib/vite.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { waitForGame } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const WLD = '/Users/vinlic/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-09/天真的钴最高点(3).wld';
const PORT = Number(process.env.BJ365_PORT ?? 5203);
const EGGS = [[6280, 673], [783, 819], [2213, 909], [5422, 1102], [4900, 1431], [5139, 1508]];

const vite = await startPrivateVite({ port: PORT });
console.log(`VITE ${vite.origin}`);
const errors = [];
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
try {
  const page = await openPage(browser, { errors });
  await bootstrap(page, vite.origin);
  const b64 = readFileSync(WLD).toString('base64');
  const t0 = Date.now();
  const ok = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    try { await window.__swFlow.importWld(arr); return { ok: true }; }
    catch (e) { return { ok: false, why: String(e?.message ?? e).slice(0, 200) }; }
  }, b64);
  console.log('IMPORT:', JSON.stringify(ok), `${((Date.now() - t0) / 1000).toFixed(1)}s`);
  if (!ok.ok) throw new Error('import 失败');
  if (!(await waitForGame(page, { timeout: 300000 }))) throw new Error('进世界超时');

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
  await new Promise((r) => setTimeout(r, 10_000));

  const lum = () => page.evaluate(() => {
    const cs = document.querySelectorAll('canvas');
    let best = null, area = 0;
    cs.forEach((c) => { const a = c.width * c.height; if (a > area) { area = a; best = c; } });
    if (!best) return -1;
    const x = Math.max(0, (best.width >> 1) - 96), y = Math.max(0, (best.height >> 1) - 96);
    const d = best.getContext('2d').getImageData(x, y, 192, 192).data;
    let s = 0;
    for (let i = 0; i < d.length; i += 16) s += (d[i] + d[i + 1] + d[i + 2]) / 3;
    return s / (d.length / 16);
  });

  for (let n = 0; n < EGGS.length; n++) {
    const [ax, ay] = EGGS[n];
    const info = await page.evaluate(({ ax, ay }) => {
      const g = window.__swGame;
      const st = g.world.store;
      const blocked = (tx, ty) => { const i = st.idx(tx, ty); return st.isSolid(tx, ty) || st.liquid[i] > 0; };
      const pocket = (tx, fy, allowLiquid) => {
        const clear = allowLiquid ? (x, y) => !st.isSolid(x, y) : (x, y) => !blocked(x, y);
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
      if (!spot) return { ok: false, why: 'no-pocket' };
      const px = spot.tx * 16 + 8;
      const py = (spot.fy + 1) * 16 - 42;
      g.player.x = px; g.player.y = py; g.player.vx = 0; g.player.vy = 0;
      if (g.camera) { g.camera.x = px + 10; g.camera.y = py + 21; g.camera.zoom = 1; g.camera.zoomTarget = 1; }
      return { ok: true, spot, wet };
    }, { ax, ay });
    if (!info.ok) { console.log(`EGG${n + 1} FAIL no-pocket`); continue; }
    for (let k = 0; k < 12; k++) {
      const L = await lum();
      if (L > 8) break;
      await new Promise((r) => setTimeout(r, 1000));
    }
    await new Promise((r) => setTimeout(r, 400));
    // A 版:纯实机
    await page.screenshot({ path: `/tmp/bj365-egg-${n + 1}.png` });
    // B 版:同步叠加蛋贴图即拍(无 rAF 竞态)
    const b64shot = await page.evaluate(({ ax, ay }) => {
      const g = window.__swGame;
      const atlas = g.renderer.atlas ?? g.renderer.spriteAtlas ?? g.renderer._atlas;
      const img = atlas.ensureVImage('vanilla/Tiles_752.png');
      const cs = document.querySelectorAll('canvas');
      let best = null, area = 0;
      cs.forEach((c) => { const a = c.width * c.height; if (a > area) { area = a; best = c; } });
      if (!best || !img) return null;
      // 游戏主画布可能 desynchronized 2D(直读 toDataURL 出垃圾字节判例)——
      // 先整幅拷贝到新画布再叠加/编码
      const cv = document.createElement('canvas');
      cv.width = best.width; cv.height = best.height;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(best, 0, 0);
      const z = g.camera?.zoom ?? 1;
      const vw = best.width, vh = best.height;
      // 原版绘制位:锚格 + (8,-2)(TileDrawing.cs:1039-1045 vector.X+=8; tileTop=2 上移)
      const wx = ax * 16 + 8 - 1, wy = ay * 16 - 2;
      const sx = (wx - g.camera.x) * z + vw / 2;
      const sy = (wy - g.camera.y) * z + vh / 2;
      ctx.drawImage(img, sx, sy, img.width * z, img.height * z);
      // 位置标记框(半透明洋红描边,明示叠加证据)
      ctx.strokeStyle = 'rgba(255,0,255,0.9)';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 2.5, sy - 2.5, img.width * z + 5, img.height * z + 5);
      return cv.toDataURL('image/png');
    }, { ax, ay });
    if (b64shot) {
      const b64pure = b64shot.startsWith('data:') ? b64shot.slice(b64shot.indexOf(',') + 1) : b64shot;
      writeFileSync(`/tmp/bj365-egg-${n + 1}-marked.png`, Buffer.from(b64pure, 'base64'));
      console.log(`EGG${n + 1} (${ax},${ay}) spot=${JSON.stringify(info.spot)} wet=${info.wet} SCREENSHOT /tmp/bj365-egg-${n + 1}.png + /tmp/bj365-egg-${n + 1}-marked.png`);
    } else {
      console.log(`EGG${n + 1} A版已存,B版失败(无画布/无图)`);
    }
  }
  if (errors.length) console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 10)));
  console.log('BJ365 FINAL DONE');
} finally {
  await browser.close().catch(() => {});
  const r = await killTree(vite.port, vite.child).catch((e) => ({ err: String(e) }));
  console.log('VITE KILL:', JSON.stringify(r));
}
