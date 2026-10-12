// 闪电光环运行时复核②：A 相细查（塔可见性放大+尘分类+flush 计数+持续敌夹具）
// 运行: SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs --timeout=600000 scripts/_aura-runtime-recheck2.mjs
import { launchBrowser, openPage, bootstrap, createGame } from '../tools/probe/lib/index.mjs';
import { pump } from '../tools/probe/lib/pump.mjs';
import { readFileSync } from 'node:fs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
const errs = [];
page.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));

await bootstrap(page, ORIGIN + '/?cloudcache=0');
const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
console.log('createGame:', !!gen?.ok);

const spot = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gx = px, groundY = -1;
  for (let dx = 0; dx < 60 && groundY < 0; dx++) {
    for (const x of [px + dx, px - dx]) {
      for (let y = Math.floor(g.player.cy / 16); y < Math.floor(g.player.cy / 16) + 80; y++) {
        if (st.inBounds(x, y) && st.isSolid(x, y) && !st.isSolid(x, y - 1) && !st.isSolid(x, y - 2) && !st.isSolid(x, y - 3)) {
          gx = x; groundY = y; break;
        }
      }
      if (groundY >= 0) break;
    }
  }
  if (groundY < 0) return { why: 'no-ground' };
  const cxw = gx * 16 + 8, cyw = groundY * 16;
  g.player.x = cxw - 90; g.player.y = cyw - 60;
  return { gx, groundY, cxw, cyw };
});
console.log('spot:', JSON.stringify(spot));

// 放塔（真物品路径）
await page.evaluate(({ cxw, cyw }) => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(3831);
  g.player.inv.slots[0] = { id: iid, stack: 1 };
  g.player.inv.selected = 0;
  const scr = g.camera.worldToScreen(cxw, cyw - 8);
  g.input.mouseX = Array.isArray(scr) ? scr[0] : scr.x;
  g.input.mouseY = Array.isArray(scr) ? scr[1] : scr.y;
  g.input.mouseDown = true; g.input.mouseHeld = true;
}, spot);
await pump(page, 6, { step: 2 });
await page.evaluate(() => { const g = window.__swGame; g.input.mouseDown = false; g.input.mouseHeld = false; });

// 鼠标挪开（防光标挡塔）+ 相机锁塔 + flush/draw 计数装针
await page.evaluate(() => {
  const g = window.__swGame;
  g.input.mouseX = 5; g.input.mouseY = 5;
  const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  if (t) { g.camera.x = t.cx - 400; g.camera.y = t.cy - 300; }
  window.__probe = { dust8: 0, flushN: 0, flushOps: 0 };
  const proto = CanvasRenderingContext2D.prototype;
  if (!window.__origDrawImage) {
    window.__origDrawImage = proto.drawImage;
    proto.drawImage = function (...a) {
      // 尘两类签名：9 参 8×8 源 或 3 参 (-4,-4) dest（lit pass drawImage(s1,-4,-4)）
      if ((a.length >= 5 && a[3] === 8 && a[4] === 8) ||
          (a.length === 3 && a[1] === -4 && a[2] === -4)) window.__probe.dust8++;
      return window.__origDrawImage.apply(this, a);
    };
  }
  const r = g.renderer;
  if (r && !window.__origFlush) {
    const protoR = Object.getPrototypeOf(r);
    if (protoR.flushItemGlow) {
      window.__origFlush = protoR.flushItemGlow;
      protoR.flushItemGlow = function (...a) {
        window.__probe.flushN++;
        window.__probe.flushOps += this.itemGlowQueue?.length ?? 0;
        return window.__origFlush.apply(this, a);
      };
    }
  }
  return { hasFlush: !!window.__origFlush, camLocked: !!t };
});

// 持续敌夹具：每 45t 补一只僵尸（保持攻击态）
for (let i = 0; i < 6; i++) {
  await page.evaluate(({ cxw, cyw, i }) => {
    const g = window.__swGame;
    g.spawnEnemy('zombie', cxw + (i % 2 ? 60 : -60), cyw - 60);
  }, { ...spot, i });
  await pump(page, 45, { step: 15 });
  const c = await page.evaluate(() => {
    const g = window.__swGame;
    const p = window.__probe;
    const t = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
    const pool = g.vanillaDust?.pool ?? [];
    let arc = 0, col = 0, other = 0;
    const arcSamples = [];
    if (t) {
      const cx = t.cx, cy = t.cy, arcR = (t.auraSide - 40) / 2, topY = t.y;
      for (const d of pool) {
        if (!d.active || d.type !== 226) continue;
        const dist = Math.hypot(d.x - cx, d.y - cy);
        if (Math.abs(dist - arcR) < 30) { arc++; if (arcSamples.length < 4) arcSamples.push([Math.round(d.x - cx), Math.round(d.y - cy)]); }
        else if (d.y > topY + 30 && d.y < cy && Math.abs(d.x - cx) < 16) col++;
        else other++;
      }
    }
    const foes = (g.enemies?.() ?? []).filter((e) => !e.dead && e.maxHp > 5);
    const ltx = t ? Math.floor(t.cx / 16) : -1, lty = t ? Math.floor(t.cy / 16) : -1;
    return {
      towerAlive: !!t, side: t?.auraSide, arc, col, other, arcSamples,
      dust8: p.dust8, flushN: p.flushN, flushOps: p.flushOps,
      foesAlive: foes.length, foeHp: foes[0] ? Math.round(foes[0].hp) : null,
      light: (t && g.lighting?.lightAt) ? g.lighting.lightAt(ltx, lty - 3) : null,
    };
  });
  console.log(`census${i}:`, JSON.stringify(c));
}

// 塔区域特写截图（clip 到塔+场盒;deviceScaleFactor 默认,clip=CSS px）
const t = await page.evaluate(() => {
  const g = window.__swGame;
  const t2 = g.entities.projectiles.find((e) => e.projId >= 688 && e.projId <= 690 && !e.dead);
  if (!t2) return null;
  const side = Math.max(t2.auraSide, 140);
  const p1 = g.camera.worldToScreen(t2.cx - side / 2 - 10, t2.cy - side / 2 - 10);
  const p2 = g.camera.worldToScreen(t2.cx + side / 2 + 10, t2.cy + side / 2 + 10);
  return { x1: Array.isArray(p1) ? p1[0] : p1.x, y1: Array.isArray(p1) ? p1[1] : p1.y,
    x2: Array.isArray(p2) ? p2[0] : p2.x, y2: Array.isArray(p2) ? p2[1] : p2.y };
});
if (t) {
  const clip = { x: Math.max(0, t.x1), y: Math.max(0, t.y1),
    width: Math.min(1280, t.x2 - t.x1), height: Math.min(800, t.y2 - t.y1) };
  console.log('clip:', JSON.stringify(clip));
  await page.screenshot({ path: '/tmp/aura-zoom.png', clip });
  await page.screenshot({ path: '/tmp/aura-full2.png' });
}
console.log('errs:', JSON.stringify(errs.slice(0, 6)));
await browser.close();
