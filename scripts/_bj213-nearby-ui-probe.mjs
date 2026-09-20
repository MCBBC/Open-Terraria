// ★BJ213 探针第四波：箱子放玩家交互范围内（近旁）走真实 UI 状态机 + update 自动链
//  S4 教训：箱放 100 格外 → tickChestAutoClose 每拍超距杀面板（原版行为）=探针伪影。
//  S7 = 近旁箱 + openChestPanel + pickUp/placeHeld + closeChest + 自动关箱拍
//  S8 = 近旁箱 + openChestPanel + pickUp/placeHeld + 【走远】tickChestAutoClose 超距关 → 自动关箱拍
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5201';

const boot = async (tag) => {
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&bj213d' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 9500));
  return { browser, page, errors };
};

/** 页内夹具：hardmode + 近旁王朝木箱（style28）+ 背包光明钥匙。
 *  返回 chestRefId（world.chests 中的索引）避免 puppeteer 克隆引用断裂 */
async function setup(page, distTiles) {
  return page.evaluate(async (distTiles) => {
    const g = window.__swGame;
    const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    g.world.flags.hardMode = true;
    const st = g.world.store;
    const ptx = Math.round(g.player.cx / 16), pty = Math.round(g.player.cy / 16);
    const tx = ptx + distTiles, ty = pty - 2;                       // 近旁
    // 清出 3×4 净空（防草/树干扰锚定）
    for (let dx = -1; dx <= distTiles + 2; dx++) for (let dy = -4; dy <= 1; dy++) {
      if (st.inBounds(ptx + dx, pty + dy)) st.setTile(ptx + dx, pty + dy, 0);
    }
    const fx = 28 * 36;
    st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0);
    st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
    st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18);
    st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
    const chestData = { x: tx, y: ty, items: new Array(10).fill(null) };
    g.world.chests.push(chestData);
    const keyIid = invIndexOfVanilla(3092);
    g.player.inv.slots[10] = { id: keyIid, stack: 1 };
    return { idx: g.world.chests.length - 1, keyIid, tx, ty, px: ptx, py: pty };
  }, distTiles);
}

const out = {};

// ================= S7：近旁箱 + 状态机全链 =================
{
  const { browser, page, errors } = await boot('S7');
  const fx = await setup(page, 4);
  out.S7 = await page.evaluate(async (fx) => {
    const g = window.__swGame;
    const ui = window.__swUI;
    const chestData = g.world.chests[fx.idx];
    ui.openChestPanel(chestData);
    await new Promise((r) => setTimeout(r, 40));
    const s1 = { openChest: ui.openChest === chestData, refOk: g.openChestRef?.() === chestData, inv: ui.invPanel.style.display };
    ui.pickUp(10, 'inv');
    ui.placeHeld(0, 'chest');
    const items = chestData.items.map((it) => (it ? { id: it.id, stack: it.stack, vid: fx.keyIid === it.id ? 3092 : -1 } : null));
    const s2 = { heldAfter: ui.heldStack ? 'still-held' : 'dropped', items };
    ui.closeChest();
    await new Promise((r) => setTimeout(r, 1200));
    const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 475);
    return {
      s1, s2,
      chestGone: g.world.chests[fx.idx] !== chestData || !g.world.chests.includes(chestData),
      mimic475: mimic ? { x: Math.round(mimic.x), hp: mimic.hp } : null,
    };
  }, fx);
  out.S7.errors = errors;
  await browser.close();
}

// ================= S8：真实 tryOpenChest 交互开箱（右键链） =================
{
  const { browser, page, errors } = await boot('S8');
  const fx = await setup(page, 4);
  out.S8 = await page.evaluate(async (fx) => {
    const g = window.__swGame;
    const ui = window.__swUI;
    const chestData = g.world.chests[fx.idx];
    // 走真实开箱交互（Game.tryOpenChest —— Player tile-interact 等价）
    g.tryOpenChest(chestData);
    await new Promise((r) => setTimeout(r, 40));
    const s1 = { openChest: ui.openChest === chestData, refOk: g.openChestRef?.() === chestData, inv: ui.invPanel.style.display };
    // 面板开着 → pickUp/placeHeld
    ui.pickUp(10, 'inv');
    ui.placeHeld(0, 'chest');
    const items = chestData.items.map((it) => (it ? { id: it.id, stack: it.stack } : null));
    // 真实关箱：同箱再点 = tryOpenChest 同箱臂（closeChestPanel）
    g.tryOpenChest(chestData);
    await new Promise((r) => setTimeout(r, 40));
    const s2 = { openAfterClose: ui.openChest === chestData };
    await new Promise((r) => setTimeout(r, 1200));
    const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 475);
    return {
      s1, s2, items,
      chestGone: !g.world.chests.includes(chestData),
      mimic475: mimic ? { x: Math.round(mimic.x), hp: mimic.hp } : null,
    };
  }, fx);
  out.S8.errors = errors;
  await browser.close();
}

console.log(JSON.stringify(out, null, 1));
