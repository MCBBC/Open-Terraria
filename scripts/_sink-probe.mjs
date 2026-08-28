// 实体落地沉降定量探针（用户报：NPC/小动物沉降数像素,主角与怪物正常）：
// 同一平地并排放置 玩家/向导(TownNPC 22)/兔(Enemy critter 48)/僵尸(Enemy 3)，
// 全确定性驱动若干 tick 让重力落稳，然后对画布逐列 alpha 扫描测每实体
// 「渲染精灵最低不透明行」与「地表 tile 顶行」差值；同时打印物理盒底。
// 差值互差 = 绘制锚点差；盒底 vs 地表 = 物理沉降。100% 隔离活循环(paused)。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const out = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const W = 200, H = 120;
  const world = new World(W, H, 777, 'sink-probe');
  world.spawnX = 60; world.spawnY = 55;
  // 平地：y=70 起实心，70-1=69 草；表面顶行 = 70*16
  const SURF = 70 * 16;
  for (let x = 0; x < W; x++) {
    for (let y = 71; y < H; y++) world.store.setTile(x, y, 1);
    world.store.setTile(x, 70, 3);
  }
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  document.getElementById('sw-boot-prime')?.remove();
  const g = window.__swGame;
  g.paused = true;
  if (g.player.dead) g.respawnPlayer?.();
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  // 并排：guide 兔 僵尸 各隔 4 格，玩家居中
  const gy = 68 * 16;
  const guide = new TownNPC('guide', 56 * 16, gy); g.entities.add(guide, 'npcs');
  const bunny = new Enemy('bunny', 64 * 16, gy); g.entities.add(bunny, 'critters');
  const zomb = new Enemy('zombie', 72 * 16, gy); g.entities.add(zomb, 'enemies');
  const ids = {
    guide: guide.id, bunny: bunny.id, zomb: zomb.id,
    playerX: g.player.cx, note: 'surf=' + SURF,
  };
  // 确定性 tick 落稳（物理+动画）
  for (let i = 0; i < 90; i++) g.fixedUpdate(1 / 60);
  // 渲染两帧确保画布有内容
  await new Promise((r2) => requestAnimationFrame(() => requestAnimationFrame(r2)));
  // 找各实体屏幕 x 与渲染底行
  const cv = g.renderer.canvas;
  const ctx = cv.getContext('2d');
  const zoom = g.camera.zoom;
  const scanEntity = (wx) => {
    const [sx] = g.camera.worldToScreen(wx, 0);
    const col0 = Math.max(0, Math.floor(sx - 12));
    const col1 = Math.min(cv.width - 1, Math.ceil(sx + 12));
    // 自下而上找第一个非透明像素行（canvas 系）
    let bottomRow = -1;
    for (let row = Math.min(cv.height - 1, Math.floor(SURF * zoom) + 220); row > 0 && bottomRow < 0; row--) {
      for (let cx = col0; cx <= col1; cx++) {
        const px = ctx.getImageData(cx, row, 1, 1).data;
        if (px[3] > 24) { bottomRow = row; break; }
      }
      void col0;
    }
    return bottomRow;
  };
  // 逐实体收集
  const list = [];
  const pushEnt = (name, ent, isPlayer) => {
    if (!ent || ent.dead) { list.push({ name, missing: true }); return; }
    const wx = isPlayer ? g.player.cx : ent.cx;
    const wy = isPlayer ? g.player.cy : ent.cy;
    const hPx = isPlayer ? g.player.h : ent.h;
    const boxBottomWorld = (isPlayer ? g.player.y : ent.y) + hPx;
    const [sxTop] = g.camera.worldToScreen(wx, 0);
    void sxTop;
    list.push({
      name,
      boxBottomWorld: Math.round(boxBottomWorld * 10) / 10,
      boxBottomPx: Math.round(g.camera.worldToScreen(wx, boxBottomWorld)[1]),
      renderBottom: scanEntity(wx),
      tileTopPx: Math.round(g.camera.worldToScreen(wx, SURF)[1]),
      yRaw: Math.round((isPlayer ? g.player.y : ent.y) * 10) / 10,
    });
  };
  pushEnt('player', null, true);
  for (const e of g.entities.npcs) if (e === guide) pushEnt('guide', e, false);
  for (const e of g.entities.critters) if (e === bunny) pushEnt('bunny', e, false);
  for (const e of g.entities.enemies) if (e === zomb) pushEnt('zombie', e, false);
  return { list, ids };
});
console.log(JSON.stringify(out, null, 1));
// 计算相对差值
if (out.list?.length) {
  const byName = Object.fromEntries(out.list.map((x) => [x.name, x]));
  const base = byName.zombie ?? byName.player;
  for (const [k, v] of Object.entries(byName)) {
    if (!v || v.missing || !base) continue;
    console.log(`${k}: 渲染底行-v 表面=${v.renderBottom - v.tileTopPx}px | 盒底-v 表面=${Math.round(v.boxBottomPx - v.tileTopPx)}px | 相对僵尸渲染偏移=${v.renderBottom - base.renderBottom}px`);
  }
}
await browser.close();
