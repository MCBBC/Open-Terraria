// SW-BJ114 探针：光标灰描边 vs 门/椅交互图标遮盖（修前 ?sw-iconoverlay=0 vs 修后）。
// 固定种子世界 'bj114door'（两 pass 同世界同地形）→ 出生点旁人工整平一块地,
// 程序化放门(tile 10,帧 doorClosedFrame(0)=[0,0],3 行 fy=0/18/36)与椅(tile 15,
// style0 帧顶 0/底 20)→ 玩家贴邻站定 → 鼠标悬停目标格。
// 断言：①悬停扫描接线(player.cursorItemIconID: 门=10/椅=34,enabled) ②上浮层 DOM
// (存在/z 301/transform=mouse+8) ③上浮层内容非空(图标面真在顶层) ④截图 clip 光标
// 邻域(修前/修后 × 门/椅 = 4 张,同种子地形可直接对拍)。
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = (n) => `/tmp/bj114-${n}.png`;

async function pass(label, url, expectOverlay) {
  const browser = await puppeteer.launch({
    protocolTimeout: 600000,
    executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    headless: 'new',
    args: ['--no-sandbox', '--force-device-scale-factor=1'],
    defaultViewport: { width: 1512, height: 862 },
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log(`[${label}] PAGEERR:`, String(e.message).slice(0, 200)));
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });
  // 预置首用欢迎弹窗永久旗(其出现时机晚于世界就绪,后置点击会输给重弹时序)
  await page.evaluate(() => { try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* 隐私模式 */ } });
  for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__swGame?.world)); i++) {
    await new Promise((r2) => setTimeout(r2, 200));
  }
  // 固定种子重生成 → 两 pass 同一世界
  await page.evaluate(async () => { await window.__swGame.newWorld('bj114door', 4200, 1200, () => {}); });
  for (let i = 0; i < 900 && !(await page.evaluate(() => !!window.__swGame?.world?.store)); i++) {
    await new Promise((r2) => setTimeout(r2, 200));
  }
  await new Promise((r2) => setTimeout(r2, 1500));

  // 关首用欢迎弹窗(若有)——DOM 覆盖层会污染截图区。先写永久旗（重生成世界会
  // 再次触发 afterWorldLoad 重弹,点击只够当次;旗=WelcomAnnounce ACK_KEY）
  await page.evaluate(() => {
    try { localStorage.setItem('sw.welcome.announce.acked', '1'); } catch { /* 隐私模式 */ }
    const w = document.getElementById('sw-welcome-announce');
    if (w) { const btns = w.querySelectorAll('button'); btns[btns.length - 1]?.click(); }
  });
  await new Promise((r2) => setTimeout(r2, 400));

  // ---- 整平+放门/椅+站定+悬停 ----
  const setup = await page.evaluate(async () => {
    const g = window.__swGame;
    const st = g.world.store;
    const tiles = await import('/src/data/tiles.ts');   // dev server 直取内部 id 表
    const DOOR = tiles.T.DOOR_CLOSED;                   // 内部 17(vanilla sheet 10)
    const CHAIR = tiles.TILE_DEFS.findIndex((d) => d.key === 'chair');   // vanilla sheet 15
    const sx = g.world.spawnX, sy = g.world.spawnY;
    // 从出生点向下找地表(第一个实心)
    let ground = sy;
    for (let d = 0; d < 60; d++) {
      const i = st.idx(sx, sy + d);
      if (st.type[i] !== 0) { ground = sy + d; break; }
    }
    // 整平:门位 dx=+3(行 ground-4..ground-1 空),椅位 dx=-3(行 ground-3..ground-1 空)
    const air = (x, y) => { if (st.inBounds(x, y)) st.setTileSilent(x, y, 0, 0, 0); };
    for (let dx = -5; dx <= 5; dx++) {
      for (let dy = 1; dy <= 4; dy++) air(sx + dx, ground - dy);
      // 地板补实(门/椅支撑)
      const fi = st.inBounds(sx + dx, ground) ? st.idx(sx + dx, ground) : -1;
      if (fi >= 0 && st.type[fi] === 0) st.setTileSilent(sx + dx, ground, 1, 0, 0);
    }
    // 门(1×3,锚顶格):doorClosedFrame(0,0)=[0,0] → frameX=0,frameY=dy*18
    const doorX = sx + 3, doorTop = ground - 3;
    for (let dy = 0; dy < 3; dy++) st.setTileSilent(doorX, doorTop + dy, DOOR, 0, dy * 18);
    // 椅(1×2):style0:顶 fy=0,底 fy=20,fx=0
    const chairX = sx - 3, chairTop = ground - 2;
    st.setTileSilent(chairX, chairTop, CHAIR, 0, 0);
    st.setTileSilent(chairX, chairTop + 1, CHAIR, 0, 20);
    return { sx, sy, ground, doorTop, chairTop, DOOR, CHAIR };
  });
  console.log(`[${label}] setup:`, JSON.stringify(setup));

  // 玩家放门口左侧;固定;等相机追上
  await page.evaluate((s) => {
    const g = window.__swGame;
    const p = g.player;
    p.x = (s.sx) * 16 + 8 - p.w / 2;
    p.y = s.ground * 16 - p.h;
    p.vx = 0; p.vy = 0;
  }, setup);
  await new Promise((r2) => setTimeout(r2, 1200));

  async function hoverShot(target, tag) {
    // 悬停目标格中心:先算屏位→移鼠标→回读鼠标格校验(相机漂移补偿,3 轮)
    let pos = null;
    for (let attempt = 0; attempt < 4; attempt++) {
      pos = await page.evaluate(({ target }) => {
        const g = window.__swGame;
        const [sx2, sy2] = g.camera.worldToScreen(target.x * 16 + 8, target.y * 16 + 8);
        return { sx: sx2, sy: sy2 };
      }, { target });
      await page.mouse.move(pos.sx, pos.sy, { steps: 3 });
      await new Promise((r2) => setTimeout(r2, 350));
      const chk = await page.evaluate(({ target }) => {
        const g = window.__swGame;
        const [wx, wy] = g.camera.screenToWorld(g.renderer._mouseX, g.renderer._mouseY);
        return { tx: Math.floor(wx / 16), ty: Math.floor(wy / 16) };
      }, { target });
      if (chk.tx === target.x && chk.ty === target.y) break;
      console.log(`[${label}/${tag}] attempt ${attempt}: mouse tile (${chk.tx},${chk.ty}) != target (${target.x},${target.y}) — recomputing`);
    }

    const state = await page.evaluate(() => {
      const g = window.__swGame;
      const p = g.player;
      const ov = document.getElementById('sw-cursor-icon-overlay');
      let ovInfo = null;
      if (ov) {
        let px = 0;
        try {
          const octx = ov.getContext('2d', { willReadFrequently: true });
          const d = octx.getImageData(0, 0, 84, 84).data;
          for (let i = 3; i < d.length; i += 4) if (d[i] > 0) px++;
        } catch { px = -1; }
        ovInfo = {
          display: ov.style.display,
          zIndex: (ov.style.cssText.match(/z-index:\s*(\d+)/) ?? [])[1] ?? null,
          transform: ov.style.transform, opaquePx: px,
        };
      }
      return {
        iconId: p.cursorItemIconID, iconEnabled: p.cursorItemIconEnabled,
        mouseX: g.renderer._mouseX, mouseY: g.renderer._mouseY,
        overlay: ovInfo, hasOverlay: !!ov,
      };
    });
    console.log(`[${label}/${tag}] state:`, JSON.stringify(state));
    if (!expectOverlay) {
      console.log(`[${label}/${tag}] ${state.hasOverlay ? 'UNEXPECTED overlay exists' : 'OK: no overlay (legacy path)'}`);
    } else {
      if (!state.hasOverlay) console.log(`[${label}/${tag}] FAIL overlay missing`);
      else if (state.overlay.opaquePx <= 0) console.log(`[${label}/${tag}] FAIL overlay empty`);
      else if (state.overlay.zIndex !== '301') console.log(`[${label}/${tag}] FAIL zIndex ${state.overlay.zIndex}`);
      else console.log(`[${label}/${tag}] OK: overlay carries icon face, z=301 > cursor z=300, transform=${state.overlay.transform}`);
    }
    // 兜底:截图前强制摘除欢迎弹窗(时序竞争下仍可能重弹)
    await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
    await page.screenshot({ path: OUT(`${label}-${tag}`), clip: {
      x: Math.max(0, pos.sx - 36), y: Math.max(0, pos.sy - 36), width: 120, height: 120,
    } });
    console.log(`[${label}/${tag}] screenshot → ${OUT(`${label}-${tag}`)}`);
    return state;
  }

  const door = await hoverShot({ x: setup.sx + 3, y: setup.doorTop + 1 }, 'door');    // 门中格
  const chair = await hoverShot({ x: setup.sx - 3, y: setup.chairTop }, 'chair');     // 椅顶格
  console.log(`[${label}] icons: door=${door.iconId} (期望25) chair=${chair.iconId} (期望34) enabled=${door.iconEnabled}`);
  await browser.close();
  return { door, chair };
}

await pass('before', `${ORIGIN}/?play=small&sw-iconoverlay=0`, false);
await pass('after', `${ORIGIN}/?play=small`, true);
process.exit(0);
