// SW-BJ29 2026-09-08 真实管线复现探针 v2（一次性诊断）：
// 用户实报"不开智能光标放不了平台、物块"——两态放置矩阵 + BJ10 TileTargetDesired 门
// 锁生命周期取证（置锁→按住不松 toggle 关智能→锁是否滞留→放置成败）。
// 全程驱动真实输入路径（input.mouseDown / keys 桶 / 真实 rAF update 循环），
// 不直调 tryPlace——被测对象 = updateSmartCursor skip 臂 × tryPlace 头门的接线。
// v2 勘误：不钉相机（游戏每帧跟随回拉=瞄准漂移根因），一律以实时 camera 逆变换瞄准,
// 每步回报 camera.tileUnder 实际目标格。
// 运行：SW_ORIGIN=http://localhost:5216 node tools/run-diag.mjs scripts/_bj29-smartcursor-gate-probe.mjs
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const OUT = '/tmp/bj29-shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', protocolTimeout: 300000,
  defaultViewport: { width: 1400, height: 900 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto('' + (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/', { waitUntil: 'domcontentloaded', timeout: 180000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj29-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj29', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));
// 关欢迎弹窗（否则盖住 phase 截图）
await page.evaluate(() => {
  const btns = [...document.querySelectorAll('button, .btn, [role=button]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
  for (const id of ['sw-welcome-announce', 'sw-boot-prime', 'sw-splash']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await new Promise((r) => setTimeout(r, 400));

await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const itemsMod = await import('/src/data/items.ts');
  const platId = tilesMod.TILE_BY_KEY['platform'];
  const stoneId = tilesMod.TILE_BY_KEY['stone'];
  const platItem = itemsMod.ITEM_DEFS.find((d) => d.key === 'vi_94_wood_platform');
  const dirtItem = itemsMod.ITEM_DEFS.find((d) => d.tile === 'dirt' && d.key.startsWith('vi_2'));
  window.__bj29items = itemsMod;
  // ---- 场地：石地板行 130（列 40-100）,平台行 126（列 40-51）;周边清空防自然地形干扰 ----
  for (let x = 36; x <= 104; x++) for (let y = 112; y <= 132; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 40; x <= 100; x++) st.setTileSilent(x, 130, stoneId, 0, 0);
  for (let x = 40; x <= 51; x++) st.setTileSilent(x, 126, platId, 0, 0);
  g.chunks.markDirtyArea(36, 112, 104, 132);
  g.world.spawnX = 54; g.world.spawnY = 128; g.world.spawnX0 = 54; g.world.spawnY0 = 128;
  const pl = g.player;
  const inv = pl.inv;
  const selIdx = inv.selected;
  window.__bj29hold = (item) => {
    inv.slots[selIdx] = { id: itemsMod.ITEM_DEFS.indexOf(item), stack: 999, favorited: false, prefix: 0 };
    inv.selected = selIdx;
  };
  // 瞄准 = 实时 camera 逆变换（不碰相机——游戏每帧跟随,钉扎必被回拉）
  window.__bj29aim = (wx, wy) => {
    const c = g.camera;
    g.input.mouseX = Math.round((wx - c.x) * c.zoom + c.viewW / 2);
    g.input.mouseY = Math.round((wy - c.y) * c.zoom + c.viewH / 2);
  };
  window.__bj29aimTile = (tx, ty) => window.__bj29aim(tx * 16 + 8, ty * 16 + 8);
  // 实际目标格取证（点击瞬间鼠标真实落格）
  window.__bj29target = () => {
    const [tx, ty] = g.camera.tileUnder(g.input.mouseX, g.input.mouseY);
    return { tx, ty };
  };
  window.__bj29click = async (frames) => {
    g.input.mouseDown = true;
    await new Promise((r2) => setTimeout(r2, frames * 33));
    g.input.mouseDown = false;
    await new Promise((r2) => setTimeout(r2, 120));
  };
  window.__bj29smartToggle = async () => {
    g.input.keys.add('ControlLeft');
    await new Promise((r2) => setTimeout(r2, 150));
    g.input.keys.delete('ControlLeft');
    await new Promise((r2) => setTimeout(r2, 100));
  };
  window.__bj29sc = () => {
    const sc = g.smartCursor;
    return { wanted: sc.wanted, showing: sc.showing, x: sc.x, y: sc.y, lock: sc.lockedContinuity, dir: sc.lockedDirection };
  };
  window.__bj29alive = () => {
    pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
    pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false; pl.fallStartY = null;
    pl.x = 54 * 16; pl.y = 130 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  };
  window.__bj29rowEnd = () => {
    let e = 51;
    for (let x = 40; x <= 90; x++) if (st.get(x, 126) !== 0) e = x;
    return e;
  };
  window.__bj29alive();
  window.__bj29hold(platItem);
});

const scState = () => page.evaluate(() => window.__bj29sc());
const target = () => page.evaluate(() => window.__bj29target());
const rowEnd = () => page.evaluate(() => window.__bj29rowEnd());
const settle = (ms = 200) => new Promise((r) => setTimeout(r, ms));

// ═══ Phase 1：智能关（boot 初值）+ 持平台 → 点 (52,126)（行尾右邻） ═══
await settle(900);                                   // 等相机落定到玩家（boot 漂移伪影防御）
await page.evaluate(() => { window.__bj29alive(); window.__bj29aimTile(52, 126); });
await settle();
const t1 = await target();
await page.evaluate(() => window.__bj29click(1));
await settle();
const phase1 = {
  aimTarget: t1,
  sc: await scState(),
  placed: await page.evaluate(() => window.__swGame.world.store.get(52, 126) !== 0),
};
await page.evaluate(() => window.__bj29aimTile(52, 126));
await settle(350);
await page.screenshot({ path: OUT + '/bj29-phase1-smart-off-platform.png' });

// ═══ Phase 2：智能关 + 持泥土（物块面）→ 点 (56,129)（地板上方） ═══
await page.evaluate(async () => {
  const itemsMod = window.__bj29items;
  const dirtItem = itemsMod.ITEM_DEFS.find((d) => d.tile === 'dirt' && d.key.startsWith('vi_2'));
  window.__bj29alive();
  window.__bj29hold(dirtItem);
  window.__bj29aimTile(56, 129);
});
await settle();
const t2 = await target();
await page.evaluate(() => window.__bj29click(1));
await settle();
const phase2 = { aimTarget: t2, sc: await scState(), placed: await page.evaluate(() => window.__swGame.world.store.get(56, 129) !== 0) };

// ═══ Phase 3：先瞄准行尾+1 → 智能开（lookup 即按当前鼠标取目标）→ 按住拖拽 ═══
const end3 = await rowEnd();
await page.evaluate(async (endX) => {
  const itemsMod = window.__bj29items;
  const platItem = itemsMod.ITEM_DEFS.find((d) => d.key === 'vi_94_wood_platform');
  window.__bj29alive();
  window.__bj29hold(platItem);
  window.__bj29aimTile(endX + 1, 126);
}, end3);
await page.evaluate(() => window.__bj29smartToggle());
const phase3on = { sc: await scState(), aimTarget: await target() };
await page.evaluate(() => { window.__bj29alive(); });
await settle(150);
await page.evaluate(() => { window.__swGame.input.mouseDown = true; });
await settle(120);
await page.screenshot({ path: OUT + '/bj29-phase3-smart-on-drag.png' });   // 智能开态（黄框目标格）
await settle(280);
const phase3drag = { sc: await scState(), rowEnd: await rowEnd(), aimTarget: await target() };
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await settle(150);

// ═══ Phase 4（★定罪帧）：重新置锁 → 按住不松 → Ctrl toggle 关智能 → 读锁态 ═══
const end4 = await rowEnd();
await page.evaluate((endX) => { window.__bj29alive(); window.__bj29aimTile(endX + 1, 126); }, end4);
await settle(150);
await page.evaluate((endX) => { window.__bj29alive(); window.__bj29aimTile(endX + 1, 126); window.__swGame.input.mouseDown = true; }, end4);
await settle(250);
const phase4lock = { sc: await scState(), aimTarget: await target() };        // 锁应在位
await page.evaluate(() => window.__bj29smartToggle());                        // 按住不松 toggle 关
const phase4off = { sc: await scState() };                                    // ★修复前 lock 滞留非 null
await page.evaluate(() => { window.__swGame.input.mouseDown = false; });
await settle(150);
const phase4rel = { sc: await scState() };

// ═══ Phase 5：智能关态再点平台（行尾新邻格） ═══
const end5 = await rowEnd();
await page.evaluate((endX) => {
  window.__bj29alive();
  window.__bj29aimTile(endX + 1, 126);
  window.__swGame.player.useTime = 0;
}, end5);
await settle();
const t5 = await target();
await page.evaluate(() => window.__bj29click(1));
await settle();
const phase5 = {
  rowEndBefore: end5, aimTarget: t5, sc: await scState(),
  placed: await page.evaluate((endX) => window.__swGame.world.store.get(endX + 1, 126) !== 0, end5),
};
await page.evaluate((endX) => { window.__bj29alive(); window.__bj29aimTile(endX + 1, 126); }, end5);
await settle(350);
await page.screenshot({ path: OUT + '/bj29-phase5-smart-off-after-toggle.png' });

// ═══ Phase 6：智能关态再点泥土（物块面复验） ═══
await page.evaluate(async () => {
  const itemsMod = window.__bj29items;
  const dirtItem = itemsMod.ITEM_DEFS.find((d) => d.tile === 'dirt' && d.key.startsWith('vi_2'));
  window.__bj29alive();
  window.__bj29hold(dirtItem);
  window.__bj29aimTile(58, 129);
});
await settle();
const t6 = await target();
await page.evaluate(() => window.__bj29click(1));
await settle();
const phase6 = { aimTarget: t6, sc: await scState(), placed: await page.evaluate(() => window.__swGame.world.store.get(58, 129) !== 0) };

// ═══ 收尾展场 ═══
await page.evaluate(() => {
  const g = window.__swGame;
  const btns = [...document.querySelectorAll('button, .btn, [role=button]')];
  const ok = btns.find((b) => (b.textContent || '').includes('我已知晓'));
  if (ok) ok.click();
  window.__bj29alive();
  g.camera.x = 52 * 16; g.camera.y = 126 * 16;
});
await settle(700);
await page.screenshot({ path: OUT + '/bj29-showcase.png' });

console.log(JSON.stringify({
  phase1_smartOff_platform: phase1,
  phase2_smartOff_dirt: phase2,
  phase3_smartOn: phase3on,
  phase3_drag: phase3drag,
  phase4_lockHeld: phase4lock,
  phase4_toggleOffWhileHolding: phase4off,
  phase4_afterRelease: phase4rel,
  phase5_smartOff_platform_again: phase5,
  phase6_smartOff_dirt_again: phase6,
}, null, 2));
await browser.close();
