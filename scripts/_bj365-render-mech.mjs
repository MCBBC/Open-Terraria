// BJ365 机制取证 v3: 页内直调 drawVanillaCell(752 锚格) 隔离重画 → 判定绘制链哪一环丢失
import { readFileSync } from 'node:fs';
import { startPrivateVite, killTree } from '../tools/probe/lib/vite.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { waitForGame } from '../tools/probe/lib/game.mjs';

const WLD = '/Users/vinlic/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-09/天真的钴最高点(3).wld';
const PORT = Number(process.env.BJ365_PORT ?? 5203);
const AX = 6280, AY = 673;

const vite = await startPrivateVite({ port: PORT });
console.log(`VITE ${vite.origin}`);
const errors = [];
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
try {
  const page = await openPage(browser, { errors });
  await bootstrap(page, vite.origin);
  const b64 = readFileSync(WLD).toString('base64');
  const ok = await page.evaluate(async (b64) => {
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    try { await window.__swFlow.importWld(arr); return { ok: true }; }
    catch (e) { return { ok: false, why: String(e?.message ?? e).slice(0, 200) }; }
  }, b64);
  if (!ok.ok) throw new Error('import 失败: ' + ok.why);
  if (!(await waitForGame(page, { timeout: 300000 }))) throw new Error('进世界超时');
  await page.evaluate(({ AX, AY }) => {
    const g = window.__swGame;
    g.player.debugGod = true;
    g.player.x = (AX + 6) * 16 + 8; g.player.y = (AY + 2) * 16 - 42;
    g.player.vx = 0; g.player.vy = 0;
    if (g.camera) { g.camera.x = g.player.x + 10; g.camera.y = g.player.y + 21; }
  }, { AX, AY });
  await new Promise((r) => setTimeout(r, 3000));

  const res = await page.evaluate(async ({ AX, AY }) => {
    const out = {};
    const g = window.__swGame;
    const rd = g.renderer;
    const atlas = rd?.atlas ?? rd?.spriteAtlas ?? rd?._atlas;
    // ① 底图直画对照:蛋图本身有无调色板像素
    const img = atlas.ensureVImage('vanilla/Tiles_752.png');
    const c1 = document.createElement('canvas'); c1.width = img.width; c1.height = img.height;
    c1.getContext('2d').drawImage(img, 0, 0);
    const d1 = c1.getContext('2d').getImageData(0, 0, img.width, img.height).data;
    const countPink = (d) => {
      const t = [[236, 99, 194], [193, 69, 184], [202, 151, 100]];
      let n = 0;
      for (let i = 0; i < d.length; i += 4)
        for (const [tr, tg, tb] of t)
          if (Math.abs(d[i] - tr) <= 6 && Math.abs(d[i + 1] - tg) <= 6 && Math.abs(d[i + 2] - tb) <= 6) { n++; break; }
      return n;
    };
    out.rawImgPink = countPink(d1);
    // ② 直调 drawVanillaCell(锚格 fx=0,fy=0) 到隔离画布
    const vt = await import('/src/render/VanillaTiler.ts');
    out.vtKeys = Object.keys(vt).filter((k) => /drawVanillaCell|drawAdjust/.test(k));
    const st = g.world.store;
    const c2 = document.createElement('canvas'); c2.width = 96; c2.height = 96;
    const ctx2 = c2.getContext('2d');
    ctx2.imageSmoothingEnabled = false;
    try {
      vt.drawVanillaCell(ctx2, atlas, 752, 'style', 2, 2, st, AX, AY, st.type[st.idx(AX, AY)],
        () => true, 16, 16, st.frameX[st.idx(AX, AY)], st.frameY[st.idx(AX, AY)]);
      out.callOk = true;
    } catch (e) { out.callErr = String(e?.message ?? e).slice(0, 200); }
    const d2 = ctx2.getImageData(0, 0, 96, 96).data;
    out.cellPink = countPink(d2);
    out.cellNonZero = (() => { let n = 0; for (let i = 3; i < d2.length; i += 4) if (d2[i] > 0) n++; return n; })();
    // ③ drawAdjust(752,0,0) 返回什么
    out.adjust752 = vt.drawAdjust ? vt.drawAdjust(752, 0, 0, AX, AY, img.width, img.height, st, st.w) : 'no-fn';
    // ④ vmeta/vframeAt 复查
    out.vframe = atlas.vframeAt(752, 0, 0);
    out.vmeta = atlas.vmeta(752);
    return out;
  }, { AX, AY });
  console.log('ISOLATED:', JSON.stringify(res, null, 1));
  if (errors.length) console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 8)));
} finally {
  await browser.close().catch(() => {});
  const r = await killTree(vite.port, vite.child).catch((e) => ({ err: String(e) }));
  console.log('VITE KILL:', JSON.stringify(r));
}
