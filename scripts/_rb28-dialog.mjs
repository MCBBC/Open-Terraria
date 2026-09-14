// RB28 红蓝对抗:对话域近期改动(刀19/20+FX22/23/27)取证探针。
// 只读+运行时插桩(wrap game.npcDialogButton 计数),零源码改动。
// 运行:SW_ORIGIN=http://localhost:5211 node tools/run-diag.mjs scripts/_rb28-dialog.mjs
// RB28-F1/F3(2026-09-14):PHASE 4B=发型 minimize+理发窗独显;P1=命中盒恒定语义。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5211';
const fails = [];
const ok = (cond, name) => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`); if (!cond) fails.push(name); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });

async function newPage(layout = 'vanilla') {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  await page.goto(`${ORIGIN}/?play=small&invlayout=${layout}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  if (layout === 'vanilla') {
    await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  }
  await sleep(600);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
  });
  await sleep(150);
  return { page, errs };
}

/** 生成会话 NPC 并贴身(真实 TownNPC);key 变化时重建实体。
 *  贴身放置 = 玩家列向下扫实心 tile 落地(groundLevel 在丘陵/洞穴地形与实际地面
 *  可差 170px+,直贴 cy 会把玩家放进悬空/嵌墙地形 → keepAlive 正确判出界关对话
 *  =探针伪影,故落地吸附)。 */
const spawnNpc = (page, key, open = true) => page.evaluate(async (npcKey, doOpen) => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  if (!window.__rb28npc || window.__rb28npc.npcKey !== npcKey) {
    if (window.__rb28npc) window.__rb28npc.dead = true;
    const npc = new TownNPC(npcKey, g.player.x + 30, g.world.groundLevel * 16 - 48);
    npc.home = null;
    g.entities.add(npc, 'npcs');
    window.__rb28npc = npc;
  }
  const npc = window.__rb28npc;
  npc.dead = false;
  // 玩家贴 NPC【本列】支撑格:以 NPC 自身脚底支撑 tile 为基准(邻列地形可有洞/悬差,
  // 用 NPC 所站地面才保证 keepAlive 矩形内)。等待 NPC 落地稳定(游走/下落)后再贴。
  const st = g.world.store;
  const col = Math.floor(npc.cx / 16);
  let gy = Math.max(0, Math.floor((npc.y + npc.h + 2) / 16));
  let solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  for (let k = 0; k < 40 && !solid; k++) {
    gy++;
    solid = st.get(col, gy) !== 0 && st.hasTile(col, gy);
  }
  g.player.x = npc.cx - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  g.player.vx = 0; g.player.vy = 0;
  g.player.hp = g.player.maxHp; g.player.dead = false;
  if (doOpen) g.openNpcDialog(npc);
  return { vanillaId: npc.vanillaId, session: !!g.dialogNpc, dy: Math.round(g.player.y - npc.y) };
}, key, open);

const walkAway = (page, dx = 420) => page.evaluate((d) => {
  const g = window.__swGame;
  g.player.x += d; g.player.vx = 0;
}, dx);

/** 玩家重新贴 NPC 当前位置(地面吸附;NPC 游走后用) */
const gluePlayer = (page) => page.evaluate(() => {
  const g = window.__swGame;
  const npc = window.__rb28npc;
  if (!npc) return null;
  const st = g.world.store;
  const col = Math.floor((npc.cx - 24) / 16);
  let gy = Math.floor(npc.y / 16);
  for (let k = 0; k < 30; k++) {
    const t = st.get(col, gy);
    if (t !== 0 && st.hasTile(col, gy)) break;
    gy++;
  }
  g.player.x = col * 16 + 8 - g.player.w / 2;
  g.player.y = gy * 16 - g.player.h - 1;
  g.player.vx = 0; g.player.vy = 0;
  return { dx: Math.round(npc.cx - g.player.cx), dy: Math.round(npc.cy - g.player.cy) };
});

/** 会话面板建立重试(地形/NPC 游走导致 keepAlive 出界=正确行为,探针换列重试;
 *  双采样 300ms 间隔=确认会话在 keepAlive 下存活) */
async function spawnUntilPanel(page, key, attempts = 8) {
  for (let i = 0; i < attempts; i++) {
    if (i > 0) await page.evaluate((dx) => { window.__swGame.player.x += dx; }, 96 * i);
    await spawnNpc(page, key, true);
    // 等 NPC 落地/游走稳定(y 两次采样一致)再判存活
    for (let w = 0; w < 6; w++) {
      await sleep(200);
      const stable = await page.evaluate(() => {
        const g = window.__swGame, npc = window.__rb28npc;
        if (!npc) return { stable: false, session: false, panel: false };
        const y0 = Math.round(npc.y);
        return { y0, npc };
      });
      await sleep(150);
      const settled = await page.evaluate((prev) => {
        const g = window.__swGame, npc = window.__rb28npc;
        return !!npc && Math.abs(npc.y - prev) < 2 && !!g.dialogNpc && !!document.querySelector('.sw-npc-dialog');
      }, stable.y0 ?? -99999);
      if (settled) return true;
    }
    const good = await page.evaluate(() => !!window.__swGame.dialogNpc && !!document.querySelector('.sw-npc-dialog'));
    if (good) return true;
  }
  console.log(`[rb28] spawnUntilPanel('${key}') ${attempts} 次未稳(地形/游走),后续断言可能连锁失败`);
  return false;
}

const state = (page) => page.evaluate(() => {
  const ui = window.__swUI;
  const g = window.__swGame;
  return {
    session: !!g.dialogNpc,
    npcDialogActive: g.npcDialogActive,
    panelOpen: !!document.querySelector('.sw-npc-dialog'),
    reforgeOpen: ui.vinvReforgeOpen,
    guideMenu: ui.vinvGuideMenuOpen,
    modernOpen: ui.vinvModernCraftOpen,
    shopOpen: !!g.npcShopOpen,
    invOpen: ui.inventoryOpen,
    happyOpen: !!document.querySelector('.sw-happy-panel'),
    hairOpen: !!document.querySelector('.sw-char-panel'),   // RB28-F1:理发窗(CharCreation)
    mouseDown: g.input.mouseDown,
    rightDown: g.input.rightDown,
    uiBlocking: g.input.uiBlocking,
  };
});

async function pressHold(page, sel, holdMs = 250, dragDx = 0) {
  const pos = await page.evaluate((s) => {
    const b = document.querySelector(s);
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  }, sel);
  if (!pos) return null;
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.down();
  await sleep(holdMs);
  if (dragDx) await page.mouse.move(pos.x + dragDx, pos.y, { steps: 5 });
  await page.mouse.up();
  return pos;
}

const armCounters = (page) => page.evaluate(() => {
  const g = window.__swGame;
  if (!g.__rb28armed) {
    g.__rb28armed = true;
    const orig = g.npcDialogButton.bind(g);
    g.npcDialogButton = (id) => {
      g.__rb28counts = g.__rb28counts ?? {};
      g.__rb28counts[id] = (g.__rb28counts[id] ?? 0) + 1;
      return orig(id);
    };
  }
  g.__rb28counts = {};
  return true;
});
const counters = (page) => page.evaluate(() => window.__swGame.__rb28counts ?? {});

// ═════════ PHASE 1:会话泄漏矩阵(vanilla 布局) ═════════
{
  const { page, errs } = await newPage();

  // S1 向导 craft → 会话保持 → 走远 → 退出门消费
  await spawnUntilPanel(page, 'guide');
  await sleep(200);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="craft"]');
  await sleep(300);
  let s = await state(page);
  ok(!s.panelOpen && s.session && s.guideMenu && s.modernOpen && s.invOpen,
    `S1a craft=minimize+向导态(panel=${s.panelOpen} session=${s.session} guide=${s.guideMenu} modern=${s.modernOpen})`);
  await walkAway(page);
  await sleep(900);
  s = await state(page);
  ok(!s.session && !s.guideMenu && !s.modernOpen,
    `S1b 走远 keepAlive→向导态退(session=${s.session} guide=${s.guideMenu} modern=${s.modernOpen})`);

  // S2 哥布林重铸 → 走远退出(刀19 主诉回归面)
  await spawnUntilPanel(page, 'goblin_tinkerer');
  await sleep(200);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="reforge"]');
  await sleep(300);
  s = await state(page);
  ok(!s.panelOpen && s.session && s.reforgeOpen && s.invOpen,
    `S2a reforge=minimize+重铸态(panel=${s.panelOpen} reforge=${s.reforgeOpen})`);
  await walkAway(page);
  await sleep(900);
  s = await state(page);
  ok(!s.session && !s.reforgeOpen, `S2b 走远→重铸态退(session=${s.session} reforge=${s.reforgeOpen})`);

  // S3 恶臭 buff → 静默 close → 退出门
  await walkAway(page, -420);
  await sleep(400);
  await spawnUntilPanel(page, 'goblin_tinkerer');
  await sleep(200);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="reforge"]');
  await sleep(250);
  await page.evaluate(() => import('/src/stats/Buffs.ts').then(({ BuffType }) => {
    window.__swGame.player.buffs.apply(BuffType.Stinky, 30);
  }));
  await sleep(800);
  s = await state(page);
  ok(!s.session && !s.reforgeOpen && !s.panelOpen,
    `S3 Stinky→静默关→重铸态退(session=${s.session} reforge=${s.reforgeOpen})`);

  // S4 重铸态 → 开箱 → 退出门(chest 臂)
  await page.evaluate(() => import('/src/stats/Buffs.ts').then(({ BuffType }) => {
    window.__swGame.player.buffs.remove(BuffType.Stinky);   // S3 的 stinky 30s 未散,先解(否则每拍静默关对话)
  }));
  await sleep(200);
  await walkAway(page, -420);
  await sleep(400);
  await spawnUntilPanel(page, 'goblin_tinkerer');
  await sleep(200);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="reforge"]');
  await sleep(250);
  await page.evaluate(() => {
    const g = window.__swGame;
    g.openChest?.({ x: -2, y: 0, items: g.player.banks[0] });   // 猪罐态等价(keepAlive chestOpen 同一 ref)
  });
  await sleep(800);
  s = await state(page);
  ok(!s.session && !s.reforgeOpen, `S4 开箱→重铸态退(session=${s.session} reforge=${s.reforgeOpen})`);
  await page.evaluate(() => { window.__swUI.closeInventory(); });
  await sleep(150);

  // S5 商店(画家) → 走远 → 店+会话双清
  await spawnUntilPanel(page, 'painter');
  await sleep(200);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="shop"]');
  await sleep(300);
  s = await state(page);
  ok(!s.panelOpen && s.session && s.shopOpen && s.invOpen,
    `S5a shop=minimize+货架开(panel=${s.panelOpen} shop=${s.shopOpen})`);
  await walkAway(page);
  await sleep(900);
  s = await state(page);
  ok(!s.session && !s.shopOpen,
    `S5b 走远→店+会话清,背包保持开(原版同相 playerInventory 不清)(session=${s.session} shop=${s.shopOpen} inv=${s.invOpen})`);

  // S6 四态互斥合成:reforge+guide 同开 → 刷新拍互斥收敛
  await page.evaluate(() => {
    const ui = window.__swUI;
    ui.vinvReforgeOpen = true;
    ui.vinvGuideMenuOpen = true;
    ui.refreshAll();
  });
  await sleep(300);
  s = await state(page);
  ok(!s.reforgeOpen && !s.guideMenu, `S6 互斥收敛(reforge=${s.reforgeOpen} guide=${s.guideMenu})`);

  // S7 重铸态物理 Esc → closeNpcDialog+closeInventory(链 npcDialogActive 支,minimize 下仍 true)
  await walkAway(page, -420);
  await sleep(400);
  await spawnUntilPanel(page, 'goblin_tinkerer');
  await sleep(200);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="reforge"]');
  await sleep(250);
  const activeMinimized = await page.evaluate(() => window.__swGame.npcDialogActive && !document.querySelector('.sw-npc-dialog'));
  await page.keyboard.press('Escape');
  await sleep(400);
  s = await state(page);
  ok(activeMinimized, 'S7a minimize 下 npcDialogActive 仍 true(虚拟链可达)');
  ok(!s.session && !s.reforgeOpen && !s.invOpen && !s.panelOpen,
    `S7b 重铸态 Esc→全清(session=${s.session} reforge=${s.reforgeOpen} inv=${s.invOpen})`);
  ok(errs.length === 0, `S8 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ═════════ PHASE 2:事件流(armed 闩/派发中途收面板) ═════════
{
  const { page, errs } = await newPage();
  let s = null;
  await spawnUntilPanel(page, 'guide');
  await sleep(200);

  // E1 长按 close → 恰 1 发
  await armCounters(page);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="close"]', 300);
  await sleep(200);
  let c = await counters(page);
  ok((c.close ?? 0) === 1, `E1 长按 close 恰 1 发(实际 ${JSON.stringify(c)})`);

  // E2 rebuild-mid-press(help=面板重建):不许二次派发
  await spawnUntilPanel(page, 'guide');
  await sleep(250);
  await armCounters(page);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="help"]', 350);
  await sleep(300);
  c = await counters(page);
  ok((c.help ?? 0) === 1, `E2 help 重建中途按压恰 1 发(实际 ${JSON.stringify(c)})`);

  // E3 mousedown 后拖离再松开 → 1 发
  await spawnUntilPanel(page, 'guide');
  await sleep(250);
  await armCounters(page);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="close"]', 250, 140);
  await sleep(200);
  c = await counters(page);
  ok((c.close ?? 0) === 1, `E3 拖离中途松键恰 1 发(实际 ${JSON.stringify(c)})`);

  // E4 右键对话钮 → 0 发且面板保持
  await spawnUntilPanel(page, 'guide');
  await sleep(250);
  await armCounters(page);
  const pos = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="close"]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(pos.x, pos.y);
  await page.mouse.click(pos.x, pos.y, { button: 'right' });
  await sleep(200);
  c = await counters(page);
  s = await state(page);
  ok(Object.keys(c).length === 0 && s.panelOpen, `E4 右键钮 0 发且面板保持(${JSON.stringify(c)} panel=${s.panelOpen})`);

  // E5 重开后二次按压 → 恰 1 发(闩随新钮重建复位)
  await armCounters(page);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="close"]', 80);
  await sleep(200);
  c = await counters(page);
  ok((c.close ?? 0) === 1, `E5 重开二次按压恰 1 发(实际 ${JSON.stringify(c)})`);

  // E6 FX22:派发中途收面板 → mouseDown 不得置位(世界开火/耗弹回归面)
  await spawnUntilPanel(page, 'guide');
  await sleep(250);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="close"]', 120);
  await sleep(150);
  s = await state(page);
  ok(!s.mouseDown && !s.rightDown, `E6 close 派发中途收面板→mouseDown=${s.mouseDown} rightDown=${s.rightDown}`);
  ok(errs.length === 0, `E7 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ═════════ PHASE 2C:classic 布局嵌套商店买入 ═════════
{
  const { page, errs } = await newPage('classic');
  await page.evaluate(async () => {
    const { COIN_KEYS } = await import('/src/items/Inventory.ts');
    const { ITEM_BY_KEY } = await import('/src/data/items.ts');
    window.__swGame.player.inv.add(ITEM_BY_KEY[COIN_KEYS[3]], 2);   // 2 铂 = 200 万铜,货架全可买
  });
  await sleep(200);
  await spawnUntilPanel(page, 'merchant');
  await sleep(250);
  const shopBtn = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="shop"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (shopBtn) {
    await page.mouse.click(shopBtn.x, shopBtn.y);
    await sleep(400);
    const shopCell = await page.evaluate(() => {
      const el = document.querySelector('.sw-npc-shop .sw-shop-item[data-ok="1"]');
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: el.dataset.id };
    });
    if (shopCell) {
      const invBefore = await page.evaluate(() => window.__swGame.coinsOwned());
      await page.mouse.click(shopCell.x, shopCell.y);
      await sleep(400);
      const invAfter = await page.evaluate(() => window.__swGame.coinsOwned());
      const st = await state(page);
      const cnt = await counters(page);
      ok(invAfter < invBefore && !st.mouseDown, `E8 经典店买入单发+无开火泄漏(before=${invBefore} after=${invAfter} mouseDown=${st.mouseDown})`);
      ok((cnt.shop ?? 0) === 0, `E8b 买入不触发对话钮(${JSON.stringify(cnt)})`);
    } else {
      ok(false, 'E8 经典店货架无可买格(前置失败)');
    }
  } else {
    ok(false, 'E8 商店钮缺失(前置失败)');
  }
  ok(errs.length === 0, `E9 classic 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ═════════ PHASE 3:bubbleLatch(FX23-R/BJ25) ═════════
{
  const { page, errs } = await newPage();

  // 准备:向导实体 + 其脚下格放真箱 tile(仓库 type 16=T.CHEST/sheet 21)+登记 ChestData
  // (NPC 游走/地形差 → 帧盒悬停预测不成立时换列重试,最多 4 次)
  let setup = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt > 0) await page.evaluate((dx) => { window.__swGame.player.x += dx; }, 96 * attempt);
    setup = await page.evaluate(async () => {
      const g = window.__swGame;
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
      if (window.__rb28guide) window.__rb28guide.dead = true;
      const npc = new TownNPC('guide', g.player.x + 48, g.world.groundLevel * 16 - 48);
      npc.home = null;
      g.entities.add(npc, 'npcs');
      window.__rb28guide = npc;
      const chestT = TILE_BY_KEY['chest'];
      const tx = Math.floor(npc.cx / 16), ty = Math.floor((npc.y + npc.h - 6) / 16);
      g.world.store.setTile(tx, ty, chestT);
      g.world.chests.push({ x: tx, y: ty, items: new Array(20).fill(null) });
      window.__rb28tile = { tx, ty, chestT };
      g.player.x = npc.cx - 40; g.player.y = npc.cy - 8;
      g.player.vx = 0; g.player.vy = 0;
      g.player.dead = false; g.player.hp = g.player.maxHp;
      return { tileNow: g.world.store.get(tx, ty), chestT };
    });
    await sleep(900);
    const probe = await page.evaluate(() => {
      const g = window.__swGame;
      const npc = window.__rb28guide;
      const [sx, sy] = g.camera.worldToScreen(npc.cx, npc.cy);
      const [wx, wy] = g.camera.screenToWorld(sx, sy);
      return { x: sx, y: sy, bubble: g.npcChatBubbleHovered(wx, wy), npcDead: npc.dead };
    });
    if (probe.bubble && !probe.npcDead) break;
    setup = null;
  }
  const body = await page.evaluate(() => {
    const g = window.__swGame;
    const npc = window.__rb28guide;
    const [sx, sy] = g.camera.worldToScreen(npc.cx, npc.cy);
    const [wx, wy] = g.camera.screenToWorld(sx, sy);
    return { x: sx, y: sy, wx, wy, bubble: g.npcChatBubbleHovered(wx, wy), npcDead: npc.dead };
  });
  ok(body.bubble === true && !body.npcDead && setup.tileNow === setup.chestT,
    `R0 前置:帧盒悬停预测=${body.bubble} npcDead=${body.npcDead} 箱tile=${setup.tileNow}/${setup.chestT}`);

  // R1 帧盒内右键(格=箱) → 对话开,箱不开/包不开(FX23-R 修复面)
  await page.mouse.move(body.x, body.y);
  await sleep(150);
  await page.mouse.down({ button: 'right' });
  await sleep(700);
  await page.mouse.up({ button: 'right' });
  await sleep(400);
  let s = await state(page);
  ok(s.session && s.panelOpen && !s.invOpen && !s.shopOpen,
    `R1 帧盒内右键向导(脚下箱)=对话开/箱不开/包不开(session=${s.session} inv=${s.invOpen})`);

  // R2 会话中 press 边沿右键同格(箱 tile 中心,仍在帧盒内) → 格臂消费+会话静默清
  // (NPC 游走自愈:箱 tile 重放到 NPC 当前脚下格,玩家贴箱列,悬停复核,最多 3 次)
  let chestPt = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    // 重放箱 tile 到当前脚下 + 贴位
    const st2 = await page.evaluate(async () => {
      const g = window.__swGame;
      const npc = window.__rb28guide;
      const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
      const chestT = TILE_BY_KEY['chest'];
      const tx = Math.floor(npc.cx / 16), ty = Math.floor((npc.y + npc.h - 6) / 16);
      g.world.store.setTile(tx, ty, chestT);
      if (!g.world.chests.some((c) => c.x === tx && c.y === ty)) {
        g.world.chests.push({ x: tx, y: ty, items: new Array(20).fill(null) });
      }
      window.__rb28tile = { tx, ty, chestT };
      g.player.x = tx * 16 + 8 - g.player.w / 2;
      g.player.y = ty * 16 - g.player.h - 1;
      g.player.vx = 0; g.player.vy = 0;
      return { tileNow: g.world.store.get(tx, ty) };
    });
    await sleep(450);   // 相机跟随缓动落定后再取屏幕坐标(瞬移后立即取=陈旧锚)
    const st3 = await page.evaluate(() => {
      const g = window.__swGame;
      const { tx, ty } = window.__rb28tile;
      const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
      const [wx, wy] = g.camera.screenToWorld(sx, sy);
      return { x: sx, y: sy, hovered: g.npcChatBubbleHovered(wx, wy), tileNow: g.world.store.get(tx, ty) };
    });
    chestPt = st3;
    if (st3.hovered && st3.tileNow === chestPt.tileNow) break;
    await sleep(250);
  }
  ok(chestPt && chestPt.hovered === true, `R2-pre 箱 tile 中心仍在帧盒内(hovered=${chestPt?.hovered})`);
  await page.mouse.move(chestPt.x, chestPt.y);
  await sleep(150);
  await page.mouse.down({ button: 'right' });
  await sleep(700);
  await page.mouse.up({ button: 'right' });
  await sleep(400);
  s = await state(page);
  ok(!s.session && s.invOpen, `R2 会话中边沿右键帧盒内箱=格臂消费+会话清+箱开(session=${s.session} inv=${s.invOpen})`);
  await page.evaluate(() => { window.__swUI.closeInventory(); });
  await sleep(200);

  // R3 Stinky 压泡 → 右键不开对话(原版 :43785 同款)
  await page.evaluate(() => import('/src/stats/Buffs.ts').then(({ BuffType }) => {
    window.__swGame.player.buffs.apply(BuffType.Stinky, 30);
  }));
  await sleep(300);
  await page.mouse.move(body.x, body.y);
  await page.mouse.down({ button: 'right' });
  await sleep(700);
  await page.mouse.up({ button: 'right' });
  await sleep(400);
  s = await state(page);
  ok(!s.session && !s.panelOpen && !s.invOpen, `R3 Stinky 压泡→右键不开对话不开箱(session=${s.session} inv=${s.invOpen})`);
  ok(errs.length === 0, `R4 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ═════════ PHASE 4:Esc 链四态 ═════════
{
  const { page, errs } = await newPage();
  await spawnUntilPanel(page, 'guide');
  await sleep(200);
  // K1 对话开 → 物理 Esc → 只关对话,不开背包
  await page.keyboard.press('Escape');
  await sleep(350);
  let s = await state(page);
  ok(!s.session && !s.panelOpen && !s.invOpen, `K1 对话态 Esc→关对话不开包(session=${s.session} inv=${s.invOpen})`);

  // K2 快乐度浮层开 → Esc → 浮层+对话同收(RB28-F2:对话 capture 闩注册在先,浮层
  //  window 捕获监听死码不可达,Esc=双收——原版同相:报告写在 npcChatText,Esc 整段关。
  //  探针直驱 ui.showNpcHappiness:原钮门=无家 NPC 无 happiness 钮,曾点 status 空转)
  await spawnUntilPanel(page, 'dryad');
  await sleep(250);
  await page.evaluate(() => {
    window.__swUI.showNpcHappiness({ name: 'RB28', lines: ['快乐度行'], priceMul: 1 });
  });
  await sleep(300);
  s = await state(page);
  const happyWasOpen = s.happyOpen;
  await page.keyboard.press('Escape');
  await sleep(350);
  s = await state(page);
  ok(happyWasOpen && !s.happyOpen && !s.session && !s.panelOpen,
    `K2 快乐度浮层 Esc→浮层+对话双收(浮层曾开=${happyWasOpen} happy=${s.happyOpen} session=${s.session})`)

  // K3 商店态 Esc → 店+会话双清
  await spawnUntilPanel(page, 'merchant');
  await sleep(250);
  await pressHold(page, '.sw-npc-dialog .sw-npc-btn[data-b="shop"]', 120);
  await sleep(300);
  s = await state(page);
  const shopWas = s.shopOpen;
  await page.keyboard.press('Escape');
  await sleep(350);
  s = await state(page);
  ok(shopWas && !s.shopOpen && !s.session && !s.invOpen,
    `K3 商店态 Esc→店+会话清(shop曾开=${shopWas} shop=${s.shopOpen} session=${s.session})`);
  ok(errs.length === 0, `K4 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ═════════ PHASE 4B:RB28-F1 造型师发型=minimize+理发窗独显 ═════════
{
  const { page, errs } = await newPage();
  // 原版锚:OpenHairWindow(Main.cs:44390-44403)npcChatText=""+talkNPC 保持=刀19
  // minimize 同语义;CancelHairWindow(:44405-44419)对造型师 SetTalkNPC(-1)=Esc 一发
  // 理发窗自取消+会话同清(repo cancel=mainFlow.ts:502 closeNpcDialog 同相)
  // 探针自备外观(?play 快开无角色选择,selectedAppearance=null→mainFlow:491 防御
  // 早退=真实游玩链不触;循 E8 金币自备先例)
  await page.evaluate(async () => {
    const g = window.__swGame;
    if (!g.player.appearance) {
      const { defaultAppearance } = await import('/src/player/Appearance.ts');
      g.player.appearance = defaultAppearance('rb28');
    }
  });
  await spawnUntilPanel(page, 'stylist');
  await sleep(250);
  await armCounters(page);
  const hairBtn = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="hair"]');
    if (!b) return null;
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  if (hairBtn) {
    await page.mouse.click(hairBtn.x, hairBtn.y);
    await sleep(400);
    let s = await state(page);
    const cnt = await counters(page);
    ok(!s.panelOpen && s.hairOpen && s.session && (cnt.hair ?? 0) === 1,
      `H1 发型=面板收+理发窗独显+会话保持(panel=${s.panelOpen} hair=${s.hairOpen} session=${s.session} hair发=${cnt.hair ?? 0})`);
    // 物理 Esc 一发 → 理发窗自取消(NpcDialog 闩已随 minimize 摘除,Esc 直达
    // CharCreation onCancel=CancelHairWindow;链 closeNpcDialog 幂等收敛,会话同清)
    await page.keyboard.press('Escape');
    await sleep(400);
    s = await state(page);
    ok(!s.hairOpen && !s.panelOpen && !s.session && !s.invOpen,
      `H2 Esc 一发→理发窗收+会话清(hair=${s.hairOpen} panel=${s.panelOpen} session=${s.session} inv=${s.invOpen})`);
  } else {
    ok(false, 'H1 造型师无发型钮(前置失败)');
  }
  ok(errs.length === 0, `H3 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

// ═════════ PHASE 5:呈现回归 ═════════
{
  const { page, errs } = await newPage();
  let s = null;
  // 地形健壮性:keepAlive 出界=正确行为,探针换列重试(丘陵/洞穴地形 NPC 落点与玩家列不一致时)
  let opened = false;
  for (let attempt = 0; attempt < 4 && !opened; attempt++) {
    await page.evaluate((dx) => { window.__swGame.player.x += dx; }, attempt * 96);
    await spawnUntilPanel(page, 'guide');
    await sleep(450);
    opened = await page.evaluate(() => !!document.querySelector('.sw-npc-dialog') && !!window.__swGame.dialogNpc);
  }
  ok(opened, 'P0 向导会话面板建立(重试后)');

  // P1 hover 命中盒 vs 原版矩形(RB28-F3:绘制/命中解耦——命中盒恒=压缩文本矩形
  //  NPCChatPanel.cs:117-118 flag=rectangle.Contains 恒宽;悬停缩放只作用文字绘制,
  //  承载于内层 .sw-npc-btn-t pointer-events:none。旧实现 :hover transform 在 button
  //  上=命中盒 24→32px 扩张,P1a 曾按扩张断言=病灶记录,修后翻转)
  const hit = await page.evaluate(() => {
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="close"]');
    if (!b) return null;
    const layoutW = b.offsetWidth;
    const r0 = b.getBoundingClientRect();
    return { layoutW, rectW0: Math.round(r0.width), right0: Math.round(r0.right), midY: Math.round(r0.y + r0.height / 2) };
  });
  if (hit) {
    // 真实悬停(:hover 才触发 transform)
    await page.mouse.move(hit.right0 - 2, hit.midY);
    await sleep(250);
    const hover = await page.evaluate(() => {
      const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="close"]');
      const t = b.querySelector('.sw-npc-btn-t');
      const r = b.getBoundingClientRect();
      const p = document.elementFromPoint(r.right - 2, r.y + r.height / 2);
      const pOut = document.elementFromPoint(r.right + Math.round(r.width * 0.2), r.y + r.height / 2);
      const gap = document.elementFromPoint(r.right + 15, r.y + r.height / 2);   // 列距 30 的行向缝(:135)
      const tf = getComputedStyle(t).transform;
      const m = tf && tf !== 'none' ? new DOMMatrixReadOnly(tf) : null;
      const hitId = (el) => (el ? (el === b || b.contains(el) ? 'SELF' : (el.className || el.tagName)) : 'none');
      return {
        rectW: Math.round(r.width),
        spanScale: m ? Math.round(Math.hypot(m.a, m.b) * 1000) / 1000 : 1,
        spanShiftX: m ? Math.round(m.e) : 0,
        hitAtScaledRight: hitId(p),
        hitBeyondScaled: hitId(pOut),
        hitGap: hitId(gap),
      };
    });
    ok(Math.abs(hover.rectW - hit.layoutW) <= 1,
      `P1a 命中盒恒定=压缩文本矩形(layout=${hit.layoutW} hover=${hover.rectW}px,原版 :117-118 rect.Contains 不随悬停放大)`);
    ok(Math.abs(hover.spanScale - 1.3333) < 0.01 && hover.spanShiftX < 0,
      `P1b 悬停缩放 1.3333+左扩补偿承载内层 span(scale=${hover.spanScale} shiftX=${hover.spanShiftX}px,绘制与命中解耦)`);
    ok(hover.hitBeyondScaled !== 'SELF', `P1c 右缘外 elementFromPoint 不命中自身(${hover.hitBeyondScaled})`);
    ok(hover.hitGap !== 'SELF', `P1d 行向 30px 缝隙不被劫走(${hover.hitGap})`);
    console.log(`[P1] hitAtScaledRight=${hover.hitAtScaledRight} hitBeyondScaled=${hover.hitBeyondScaled}`);
  } else {
    ok(false, 'P1 close 钮缺失');
  }

  // P2 头像四模式渲染
  const modes = ['detailed', 'closeUp', 'fullBodyRetro', 'disabled'];
  for (const m of modes) {
    await page.evaluate(async (mode) => {
      const options = window.__swOptions ?? (await import('/src/core/Options.ts')).options;
      await options.set('dialoguePortraitMode', mode);
      const g = window.__swGame;
      if (g.dialogNpc) g.refreshNpcDialog(g.dialogNpc, '测试台词');
    }, m);
    await sleep(600);
    const px = await page.evaluate(() => {
      const c = document.querySelector('.sw-npc-dialog canvas.sw-npc-portrait');
      if (!c) return null;
      const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
      let n = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] > 0) n++;
      return n;
    });
    if (m === 'disabled') ok(px === null || px === 0, `P2 disabled=整段不画(px=${px})`);
    else ok(!!px && px > 50, `P2 ${m} 头像绘制(px=${px})`);
  }

  // P3 hop:普通刷新不重播;help(hop 动作)重播
  const hop = await page.evaluate(async () => {
    const g = window.__swGame;
    const has = () => !!document.querySelector('.sw-npc-dialog .sw-portrait-hop');
    if (g.dialogNpc) g.refreshNpcDialog(g.dialogNpc, '普通刷新');
    await new Promise((r) => setTimeout(r, 60));
    const afterPlain = has();
    return { afterPlain };
  });
  ok(hop.afterPlain === false, `P3 普通刷新不重播 hop(${JSON.stringify(hop)})`);

  // P4 窄屏 scale 命中面
  await page.setViewport({ width: 500, height: 900 });
  await sleep(350);
  const narrow = await page.evaluate(() => {
    const panel = document.querySelector('.sw-npc-dialog');
    if (!panel) return null;
    const tf = getComputedStyle(panel).transform;
    const b = document.querySelector('.sw-npc-dialog .sw-npc-btn[data-b="close"]') || document.querySelector('.sw-npc-dialog .sw-npc-btn');
    if (!b) return { tf, btn: null };
    const r = b.getBoundingClientRect();
    return { tf, btn: { x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2) } };
  });
  if (narrow?.btn) {
    await page.mouse.click(narrow.btn.x, narrow.btn.y);
    await sleep(250);
    s = await state(page);
    ok(!s.panelOpen, `P4 窄屏 scale 命中面可点(tf=${narrow.tf ? narrow.tf.slice(0, 26) : 'none'})`);
  } else {
    ok(!!narrow, 'P4 窄屏面板在位');
  }
  ok(errs.length === 0, `P5 零页面错误(${errs.slice(0, 2).join(' | ')})`);
  await page.close();
}

await browser.close();
console.log(fails.length ? `\nRB28 FAILURES: ${fails.length}\n- ${fails.join('\n- ')}` : '\nRB28 ALL PASS');
process.exit(fails.length ? 1 : 0);
