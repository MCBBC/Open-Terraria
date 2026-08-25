// 一次性:神锤敲恶魔祭坛全链路诊断——pre/post hardmode 两分支实测 + 门条件逐项取证
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
  const tiles = await import('/src/data/tiles.ts');
  const items = await import('/src/data/items.ts');
  const ALTAR = tiles.TILE_BY_KEY['v_26_altars'];
  const st = g.world.store;

  // —— 场地:玩家脚下清出平台,右侧放祭坛(3×2, style0) ——
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.world.groundLevel) + 8;
  while (gy < st.h - 20 && !st.isSolid(px, gy)) gy++;
  const py = gy - 6;
  for (let dy = -16; dy <= 2; dy++) for (let dx = -30; dx <= 40; dx++) {
    st.setTile(px + dx, py + dy, 0);
    st.liquid[st.idx(px + dx, py + dy)] = 0;
    st.wire[st.idx(px + dx, py + dy)] = 0;
  }
  for (let dx = -30; dx <= 40; dx++) st.setTile(px + dx, py + 1, 2);
  g.player.x = px * 16; g.player.y = (py - 4) * 16; g.player.vx = 0; g.player.vy = 0;

  const altarA = { x: px + 5, y: py - 3 };
  for (let c = 0; c < 3; c++) for (let rI = 0; rI < 2; rI++)
    st.setTile(altarA.x + c, altarA.y + rI, ALTAR, c * 18, rI * 18);

  // —— 神锤上 hotbar ——
  const idx = items.ITEM_DEFS.findIndex((d) => d && d.key === 'vi_367_pwnhammer');
  g.player.inv.selected = 0;
  g.player.inv.slots[0] = { id: idx, stack: 1 };
  const heldDef = items.ITEM_DEFS[g.player.inv.heldItem()?.id];
  let toolBridged = null;
  try { toolBridged = g.itemFuncTool(idx); } catch (e) { toolBridged = 'ERR:' + e.message; }

  const snapAltar = () => {
    let n = 0;
    for (let c = -1; c < 4; c++) for (let rI = -1; rI < 3; rI++)
      if (st.get(altarA.x + c, altarA.y + rI) === ALTAR) n++;
    return n;
  };

  const hitWithHammer = (ticks) => {
    const [sx, sy] = g.camera.worldToScreen((altarA.x + 1.5) * 16, (altarA.y + 1) * 16);
    g.input.mouseX = sx; g.input.mouseY = sy;
    for (let i = 0; i < ticks; i++) {
      g.input.mouseDown = true; g.input.mouseHeld = true;
      g.fixedUpdate(1 / 60);
      g.input.mouseDown = false;
    }
    g.input.mouseDown = false; g.input.mouseHeld = false;
  };

  const res = {
    altarInternalId: ALTAR,
    defSolid: !!tiles.TILE_DEFS[ALTAR]?.solid,
    defPick: tiles.TILE_DEFS[ALTAR]?.pick,
    pwnhammerIndex: idx,
    pwnhammerKey: heldDef?.key ?? null,
    toolDirect: heldDef?.tool ?? null,
    toolBridged,
  };

  // A: pre-hardmode(预期:反噬掉血,祭坛仍在)
  g.world.flags.hardMode = false;
  const hp0 = g.player.hp;
  res.cellsBeforeA = snapAltar();
  hitWithHammer(8);
  res.afterA = {
    cells: snapAltar(),
    hpDrop: hp0 - g.player.hp,
    hpAfter: g.player.hp,
    hardMode: !!g.world.flags.hardMode,
    altarCount: g.world.altarCount,
  };

  // B: post-hardmode(预期:祭坛消失+altarCount+1+矿档锁定)
  g.world.flags.hardMode = true;
  res.cellsBeforeB = snapAltar();
  hitWithHammer(8);
  res.afterB = {
    cells: snapAltar(),
    altarCount: g.world.altarCount,
    savedOreTiers: JSON.parse(JSON.stringify(g.world.savedOreTiers ?? null)),
    wraithsSpawned: g.entities.enemies.filter((e) => e.vanillaId === 82).length,
  };
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
