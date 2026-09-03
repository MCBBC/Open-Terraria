// 一次性探针：手持工具悬停光标物品图标（Game.tickHeldCursorIcon + ToolCursorIcon）自验。
// ① 镐指射程内石格 → cursorItemIconEnabled=true + 缓存/ctx 图标 vid=铜镐 3509；
// ② 镐指射程外 → false；③ 木剑 → false；④ 火把（createTile）→ true；
// ⑤ 绘制管线直调 drawCursorItemIcon：图标亮/灭两态在 mouse+(10,10) 处像素证伪/证实。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;
  for (let dy = -14; dy <= 2; dy++) for (let dx = -26; dx <= 44; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
  }
  for (let dx = -26; dx <= 44; dx++) st.setTile(px + dx, py + 1, 2);   // 石地
  g.player.x = px * 16; g.player.y = (py - 4) * 16; g.player.vx = 0; g.player.vy = 0;
  g.entities.enemies.length = 0; g.entities.projectiles.length = 0;
  if (!g.player.dead) g.player.hp = g.player.maxHp;

  const put = (vid) => {
    const key = items.VANILLA_ITEM_KEY_BY_ID[vid];
    const id = items.ITEM_BY_KEY[key];
    g.player.inv.selected = 0;
    g.player.inv.slots[0] = { id, stack: 1 };
    return { vid, key, id };
  };
  const aim = (tx, ty) => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
  };
  // 逐 tick 重瞄:相机平滑跟随传送后的玩家,同一屏点会漂出射程(实机鼠标即世界点)
  const idle = (n, tx, ty) => {
    for (let i = 0; i < n; i++) {
      if (tx != null) aim(tx, ty);
      g.fixedUpdate(1 / 60);
    }
  };

  put(3509);                                   // 铜镐
  const near = { x: px + 4, y: py + 1 };       // 射程内石格
  const far = { x: px + 16, y: py + 1 };       // 射程外
  idle(6, near.x, near.y);                     // 先稳住相机(落地+跟随收敛)
  const inRange = {
    enabled: g.player.cursorItemIconEnabled,
    heldVid: g.renderer.cursorIconCtx.heldVid,
    cacheVid: g.renderer.cursorIconCtx.cacheVid,
    cacheTime: g.itemIconCache.time,
  };
  idle(3, far.x, far.y);
  const outRange = { enabled: g.player.cursorItemIconEnabled, cacheTime: g.itemIconCache.time };

  idle(2, near.x, near.y);
  put(24);                                     // 木剑（非工具）
  idle(3, near.x, near.y);
  const sword = { enabled: g.player.cursorItemIconEnabled };

  put(8);                                      // 火把（createTile）
  idle(3, near.x, near.y);
  const torch = { enabled: g.player.cursorItemIconEnabled, heldVid: g.renderer.cursorIconCtx.heldVid };
  put(3509);
  idle(3, near.x, near.y);

  // ---- 绘制管线直调（DrawInterface_40 尾段）----
  const mk = () => { const c = document.createElement('canvas'); c.width = 96; c.height = 96; return c; };
  const r = g.renderer;
  const p = g.player;
  r._mouseX = 20; r._mouseY = 20;
  const count = (cv) => {
    const d = cv.getContext('2d').getImageData(24, 24, 48, 48).data;   // mouse+4 起 48×48 观察窗
    let n = 0;
    for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
    return n;
  };
  const prev = { enabled: p.cursorItemIconEnabled, cacheTime: r.cursorIconCtx.cacheTime };
  p.cursorItemIconEnabled = true; r.cursorIconCtx.cacheTime = 10;
  const cOn = mk();
  r.drawCursorItemIcon(cOn.getContext('2d'), p);
  const iconOn = count(cOn);
  p.cursorItemIconEnabled = false; r.cursorIconCtx.cacheTime = 0;
  const cOff = mk();
  r.drawCursorItemIcon(cOff.getContext('2d'), p);
  const iconOff = count(cOff);
  p.cursorItemIconEnabled = prev.enabled; r.cursorIconCtx.cacheTime = prev.cacheTime;
  return { inRange, outRange, sword, torch, iconOn, iconOff };
});

console.log('[probe] 镐指射程内 =', JSON.stringify(out.inRange));
console.log('[probe] 镐指射程外 =', JSON.stringify(out.outRange));
console.log('[probe] 木剑(非工具) =', JSON.stringify(out.sword));
console.log('[probe] 火把(createTile) =', JSON.stringify(out.torch));
console.log('[probe] 绘制像素: 亮态 alpha>0 像素 =', out.iconOn, '/ 灭态 =', out.iconOff);
const ok = out.inRange.enabled && out.inRange.heldVid === 3509 && out.inRange.cacheVid === 3509
  && !out.outRange.enabled && !out.sword.enabled && out.torch.enabled
  && out.iconOn > 30 && out.iconOff === 0;
console.log(ok ? '[probe] PASS' : '[probe] FAIL');
await browser.close();
process.exit(ok ? 0 : 1);
