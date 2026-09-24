// BJ320 探针：门/宝箱悬停交互图标频闪复现+逐帧定谳（私域 5201;SW_ORIGIN 换源）
// 场景：石台+关闭木门(sheet10)+宝箱(sheet21)，玩家站旁，合成鼠标钉在门中格。
// 仪表：wrap Game.prototype.{mouseOversClear,fixedUpdate,tickCursorIcon} +
//       Renderer.prototype.drawCursorItemIcon + g.frame——逐帧记录
//       {steps, cleared, claimEnabled/ID, drawnT(flag/flag2/cacheTime/uiB/npcH)}。
// 相位：A=frameSkipMode 'off' 静止悬停 / B='subtle' 静止 / C='off' 手持镐（余辉错图标面）
//       D='off' 鼠标 1px 抖动（"光标移动中可闪"面）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--no-sandbox', '--use-angle=metal'],
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000,
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push(String(e.message).slice(0, 200)));
await page.goto(ORIGIN + '/', { waitUntil: 'domcontentloaded', timeout: 90000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 90000 });
await page.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { World } = await import('/src/world/World.ts');
  WorldGenClient.prototype.probe = async () => true;
  WorldGenClient.prototype.generate = async (cfg) => new World(cfg.width, cfg.height, 7, 'bj320-probe');
  for (const id of ['sw-boot-prime', 'sw-splash', 'sw-welcome-announce']) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }
});
await page.evaluate(() => window.__swFlow.newWorld('bj320', 420, 220));
await page.waitForFunction(() => !!window.__swGame?.player, { timeout: 240000 });
await new Promise((r) => setTimeout(r, 1500));

// ---- 场地 + 鼠标钉门 + 仪表 ----
await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const tilesMod = await import('/src/data/tiles.ts');
  const TK = tilesMod.TILE_BY_KEY ?? {};
  const doorId = TK['door_closed'] ?? -1;
  const chestId = TK['chest'] ?? 16;
  // 清场：46-82 × 112-134，石地板 y=132，关闭木门 @(66,128..130) style0(frameX=0,frameY=j*54)
  for (let x = 44; x <= 82; x++) for (let y = 112; y <= 134; y++) {
    const i = st.idx(x, y);
    st.setTileSilent(x, y, 0, 0, 0); st.setWallSilent(x, y, 0);
    st.liquid[i] = 0; st.slope[i] = 0; st.half[i] = 0;
  }
  for (let x = 46; x <= 80; x++) st.setTileSilent(x, 132, 1, 0, 0);
  for (let j = 0; j < 3; j++) st.setTileSilent(66, 128 + j, doorId, 0, j * 54);
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    st.setTileSilent(58 + i, 128 + j, chestId, i * 18, j * 18);
  }
  g.chunks.markDirtyArea(44, 112, 82, 134);
  g.world.chests.push({ x: 58, y: 128, items: Array(40).fill(null), frame: 0 });
  g.world.spawnX = 61; g.world.spawnY = 130; g.world.spawnX0 = 61; g.world.spawnY0 = 130;
  const pl = g.player;
  pl.maxHp = 999999; pl.hp = 999999; pl.dead = false; pl.deadTime = 0;
  pl.respawnTimer = 0; pl._deathHandled = false; pl.ghost = false; pl.fallStartY = null;
  pl.x = 61 * 16; pl.y = 132 * 16 - pl.h; pl.vx = 0; pl.vy = 0;
  // NPC 清场（npcHover 会压图标,污染定谳）
  for (const n of g.entities.npcs) n.dead = true;
  // 鼠标钉门中格 (66,129)：screenToWorld 线性反解
  const w00 = g.camera.screenToWorld(0, 0);
  const w10 = g.camera.screenToWorld(1, 0);
  const w01 = g.camera.screenToWorld(0, 1);
  const sx = w10[0] - w00[0], sy = w01[1] - w00[1];
  const wx = 66 * 16 + 8, wy = 129 * 16 + 8;
  const mx = Math.round((wx - w00[0]) / sx), my = Math.round((wy - w00[1]) / sy);
  const [bwx, bwy] = g.camera.screenToWorld(mx, my);
  window.__swBJ320 = {
    doorId, chestId, mx, my,
    pin: { tx: Math.floor(bwx / 16), ty: Math.floor(bwy / 16) },
    mapOk: Math.floor(bwx / 16) === 66 && Math.floor(bwy / 16) === 129,
    frames: [],
    phase: '',
  };
  g.input.mouseX = mx; g.input.mouseY = my;
});

// ---- 仪表（prototype wrap;cur 闭包共享;逐帧重钉鼠标=相机跟手;lastTime 拨 steps） ----
await page.evaluate(() => {
  const g = window.__swGame;
  const R = window.__swBJ320;
  const gproto = Object.getPrototypeOf(g);
  let cur = null;
  const origClear = gproto.mouseOversClear;
  gproto.mouseOversClear = function () {
    if (cur) cur.cleared++;
    return origClear.call(this);
  };
  const origFU = gproto.fixedUpdate;
  gproto.fixedUpdate = function (dt) {
    if (cur) cur.steps++;
    return origFU.call(this, dt);
  };
  const origTCI = gproto.tickCursorIcon;
  gproto.tickCursorIcon = function () {
    const r = origTCI.call(this);
    if (cur) { cur.claimEnabled = this.player.cursorItemIconEnabled; cur.claimID = this.player.cursorItemIconID; }
    return r;
  };
  const rr = g.renderer;
  const rproto = Object.getPrototypeOf(rr);
  const origDraw = rproto.drawCursorItemIcon;
  rproto.drawCursorItemIcon = function (ctx, player) {
    const c = this.cursorIconCtx;
    if (cur) {
      let num = c.heldVid;
      if (c.biomeTorch !== null && num === 8) num = c.biomeTorch;
      else if (c.biomeCampfire !== null && num === 966) num = c.biomeCampfire;
      if (player.cursorItemIconID !== 0) num = player.cursorItemIconID;
      const flag = player.cursorItemIconEnabled && num !== 0;
      const flag2 = c.cacheTime > 0 && !c.uiHeld;
      cur.drawn = {
        flag, flag2,
        t: (flag || flag2) && !c.npcHover ? (num !== 0 ? num : c.cacheVid) : null,
        enabled: player.cursorItemIconEnabled, id: player.cursorItemIconID,
        cacheTime: c.cacheTime, cacheVid: c.cacheVid, heldVid: c.heldVid,
        uiB: c.uiBlocking, npcH: c.npcHover,
      };
    }
    return origDraw.call(this, ctx, player);
  };
  // 逐帧重钉：世界锚点 (66*16+8, 129*16+8) 反解到当前相机屏坐标（相机跟手防漂移）
  R.pinFrame = (jx, jy) => {
    const w00 = g.camera.screenToWorld(0, 0);
    const w10 = g.camera.screenToWorld(1, 0);
    const w01 = g.camera.screenToWorld(0, 1);
    const sx = w10[0] - w00[0], sy = w01[1] - w00[1];
    g.input.mouseX = Math.round((66 * 16 + 8 + jx - w00[0]) / sx);
    g.input.mouseY = Math.round((129 * 16 + 8 + jy - w00[1]) / sy);
  };
  // steps 拨盘：frame(now) 用 now-this.lastTime 作 dt——预置 lastTime 精确控制
  // 本帧步数（8ms→0 步 / 34ms→2 步 / 16.7ms→1 步）。
  R.dtPlan = null;   // 每帧取 R.dtPlan[R.frameIdx % len]，null=不拨（自然节拍）
  R.frameIdx = 0;
  const origFrame = g.frame.bind(g);
  g.frame = function (now) {
    const dt = R.dtPlan ? R.dtPlan[R.frameIdx % R.dtPlan.length] : null;
    if (dt != null) this.lastTime = now - dt;
    R.frameIdx++;
    cur = { steps: 0, cleared: 0, claimEnabled: null, claimID: null, drawn: null, dt };
    if (R.pinFrame) R.pinFrame(R.jx || 0, R.jy || 0);
    const out = origFrame(now);
    if (R.frames.length < 100000) R.frames.push(cur);
    cur = null;
    return out;
  };
});
await new Promise((r) => setTimeout(r, 300));

// ---- 相位驱动 ----
async function runPhase(name, mode, frames, opts) {
  const o = opts || {};
  await page.evaluate(async (name, mode, frames, o) => {
    const { options } = await import('/src/core/Options.ts');
    options.data.frameSkipMode = mode;
    const g = window.__swGame;
    const R = window.__swBJ320;
    R.phase = name; R.frames.length = 0; R.frameIdx = 0;
    R.dtPlan = o.dtPlan ?? null;
    R.jx = o.jitter ? 1 : 0; R.jy = o.jitter ? 1 : 0;   // 抖动=钉位偏 1px（亚像素移动）
    await new Promise((resolve) => setTimeout(resolve, frames * 16.9 + 200));
    R.dtPlan = null; R.jx = 0; R.jy = 0;
  }, name, mode, frames, o);
  return page.evaluate(() => {
    const R = window.__swBJ320;
    return { phase: R.phase, n: R.frames.length, frames: R.frames.slice(0, 100000) };
  });
}

const P02 = [8, 34];        // 0 步/2 步交替（60Hz 抖动真机形态）
const P11 = [16.7];         // 恒 1 步（原版 60Hz 锁步形态,对照）
const out = { errs };
out.A_off_02 = await runPhase('A_off_02', 'off', 240, { dtPlan: P02 });
out.B_subtle_02 = await runPhase('B_subtle_02', 'subtle', 240, { dtPlan: P02 });
out.C_off_02_pickaxe = await page.evaluate(async () => {
  // 手持镐面：热键区内 pick 件（余辉缓存进钙面→0 步帧错图标）
  const g = window.__swGame;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const inv = g.player.inv;
  for (let i = 0; i < Math.min(10, inv.slots.length); i++) {
    const sl = inv.slots[i];
    if (sl && ITEM_DEFS[sl.id]?.tool?.type === 'pick') { inv.selected = i; return { picked: i, vid: ITEM_DEFS[sl.id].vid }; }
  }
  return { picked: -1 };
});
out.C_off_02_pickaxe.frames = (await runPhase('C_off_02_pickaxe', 'off', 240, { dtPlan: P02 })).frames;
out.D_off_11 = await runPhase('D_off_11', 'off', 240, { dtPlan: P11 });
out.E_off_02_jitter = await runPhase('E_off_02_jitter', 'off', 240, { dtPlan: P02, jitter: true });

console.log(JSON.stringify(out));
await browser.close();
if (errs.length) { console.error('PAGEERRORS', errs.join('|')); process.exit(1); }
