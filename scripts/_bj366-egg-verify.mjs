// BJ366 修复验证: 私有 vite 实机载入用户 wld → 传送蛋锚旁 → 截图 + 调色板判分
// 判据: 实机画面蛋+巢完整可见(修复前=18×18 残片甚至 0 命中);隔离重画粉像素大幅上升
import { readFileSync, writeFileSync } from 'node:fs';
import { startPrivateVite, killTree } from '../tools/probe/lib/vite.mjs';
import { launchBrowser, openPage } from '../tools/probe/lib/browser.mjs';
import { bootstrap } from '../tools/probe/lib/boot.mjs';
import { waitForGame } from '../tools/probe/lib/game.mjs';
import { freezeClock } from '../tools/probe/lib/clock.mjs';

const WLD = '/Users/vinlic/Library/Containers/com.tencent.xinWeChat/Data/Documents/xwechat_files/wxid_t8s8tt2g2zq522_3ba6/msg/file/2026-09/天真的钴最高点(3).wld';
const PORT = Number(process.env.BJ366_PORT ?? 5204);
const EGGS = [[6280, 673], [783, 819], [2213, 909]];

const vite = await startPrivateVite({ port: PORT });
console.log(`VITE ${vite.origin}`);
const errors = [];
const browser = await launchBrowser({ viewport: { width: 1280, height: 800 } });
const out = { eggs: [] };
try {
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

  // 机制判分: drawAdjust 返回面 + 隔离重画调色板（修复前 32 粉/残片）
  out.mech = await page.evaluate(async (AX) => {
    const g = window.__swGame;
    const st = g.world.store;
    const atlas = g.renderer.atlas ?? g.renderer.spriteAtlas ?? g.renderer._atlas;
    const vt = await import('/src/render/VanillaTiler.ts');
    let img = null;
    for (let k = 0; k < 30 && !img; k++) {
      img = atlas.ensureVImage('vanilla/Tiles_752.png');
      if (!img) await new Promise((r) => setTimeout(r, 1000));
    }
    if (!img) return { imgLoaded: false };
    const o = { imgLoaded: true, imgW: img.width, imgH: img.height };
    o.adjust = vt.drawAdjust(752, 0, 0, AX, 673, img.width, img.height, st, st.w);
    const c2 = document.createElement('canvas'); c2.width = 96; c2.height = 96;
    const ctx2 = c2.getContext('2d');
    ctx2.imageSmoothingEnabled = false;
    vt.drawVanillaCell(ctx2, atlas, 752, 'style', 2, 2, st, AX, 673, st.type[st.idx(AX, 673)],
      () => true, 16, 16, st.frameX[st.idx(AX, 673)], st.frameY[st.idx(AX, 673)]);
    const d2 = ctx2.getImageData(0, 0, 96, 96).data;
    const countPal = (d) => {
      const t = [[236, 99, 194], [193, 69, 184], [202, 151, 100]];
      let n = 0, nz = 0;
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] > 0) nz++;
        for (const [tr, tg, tb] of t)
          if (Math.abs(d[i] - tr) <= 6 && Math.abs(d[i + 1] - tg) <= 6 && Math.abs(d[i + 2] - tb) <= 6) { n++; break; }
      }
      return { pal: n, opaque: nz };
    };
    o.cell = countPal(d2);
    return o;
  }, EGGS[0][0]);
  console.log('MECH:', JSON.stringify(out.mech));

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
      let spot = null;
      for (const allowLiquid of [false, true]) {
        for (const dx of [4, -4, 5, -5, 3, -3, 6, -6, 8, -8, 2, -2, 10, -10, 0]) {
          const tx = ax + 1 + dx;
          for (const dy of [0, -1, 1, -2, 2, -3, 3, 4, -4, 6, -6, 8, -8]) {
            const fy = ay + 1 + dy;
            if (tx > 5 && tx < st.w - 6 && fy > 5 && fy < st.h - 6 && pocket(tx, fy, allowLiquid)) {
              spot = { tx, fy }; break;
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
      return { ok: true, spot };
    }, { ax, ay });
    if (!info.ok) { out.eggs.push({ n, fail: info.why }); continue; }
    await new Promise((r) => setTimeout(r, 2500));
    const shot = `/tmp/bj366-egg-${n + 1}.png`;
    await page.screenshot({ path: shot });
    // 活体画布调色板判分（先拷贝再读,防 desynchronized 垃圾字节判例）
    const live = await page.evaluate(({ ax, ay }) => {
      const g = window.__swGame;
      const cs = document.querySelectorAll('canvas');
      let best = null, area = 0;
      cs.forEach((c) => { const a = c.width * c.height; if (a > area) { area = a; best = c; } });
      if (!best) return null;
      const cv = document.createElement('canvas');
      cv.width = best.width; cv.height = best.height;
      const ctx = cv.getContext('2d');
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(best, 0, 0);
      const z = g.camera?.zoom ?? 1;
      const vw = best.width, vh = best.height;
      // 蛋锚屏位: 锚格世界 px = ax*16..+36, ay*16+2..+40
      const sx = (ax * 16 + 18 - g.camera.x) * z + vw / 2;
      const sy = (ay * 16 + 21 - g.camera.y) * z + vh / 2;
      const R = 96;
      const d = ctx.getImageData(Math.max(0, sx - R), Math.max(0, sy - R), R * 2, R * 2).data;
      const t = [[236, 99, 194], [193, 69, 184], [202, 151, 100]];
      let pal = 0;
      for (let i = 0; i < d.length; i += 4)
        for (const [tr, tg, tb] of t)
          if (Math.abs(d[i] - tr) <= 6 && Math.abs(d[i + 1] - tg) <= 6 && Math.abs(d[i + 2] - tb) <= 6) { pal++; break; }
      return { pal };
    }, { ax, ay });
    out.eggs.push({ n, spot: info.spot, shot, live });
    console.log(`EGG${n + 1}: spot=${JSON.stringify(info.spot)} livePal=${live?.pal}`);
  }
  writeFileSync('/tmp/bj366-egg-verify.json', JSON.stringify(out, null, 1));
  console.log('OUT /tmp/bj366-egg-verify.json');
  } catch (e) {
    console.log('BODY_ERROR:', String(e?.stack ?? e).slice(0, 800));
    if (errors.length) console.log('PAGE_ERRORS:', JSON.stringify(errors.slice(0, 8)));
  }
} finally {
  await browser.close().catch(() => {});
  const r = await killTree(vite.port, vite.child).catch((e) => ({ err: String(e) }));
  console.log('VITE KILL:', JSON.stringify(r));
  try {
    const left = (await import('node:child_process')).execFileSync('lsof', ['-ti', `tcp:${PORT}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).trim();
    console.log('PORT_LEFTOVER:', left || 'none');
  } catch { console.log('PORT_LEFTOVER: none'); }   // lsof 无监听者=exit 1=已清干净
}
