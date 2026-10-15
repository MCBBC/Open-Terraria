// ★BJ685 探针：开箱→开制作菜单→堆叠至附近宝箱钮消失（用户实报）。
// 序贯性定谳：modern 窗 / classic 网格两路 × 正反序，全程采样
// openChest / 钮 display / 钮渲染可见性(offsetWidth) / 箱条 / layoutSig。
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5207';

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.setDefaultTimeout(60000);
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(ORIGIN + '/?play=small&bj685=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 60000 });
let ok = false;
for (let i = 0; i < 90 && !ok; i++) {
  ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!ok) await new Promise((r) => setTimeout(r, 2000));
}
if (!ok) throw new Error('未进游戏');
await new Promise((r) => setTimeout(r, 8000));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');

  const st = g.world.store;

  const hammer = () => [...document.querySelectorAll('button')].find((b) => (b.querySelector('img')?.src ?? '').includes('UI_Craft_Toggle_'));
  const click = (btn, which) => btn.dispatchEvent(new MouseEvent('mousedown', { button: which, bubbles: true }));

  // 每相开箱前重锚：玩家重力漂移会把固定位置的箱甩出交互距离（tickChestAutoClose）
  let curChest = null;
  const anchorChest = () => {
    if (curChest) {
      const i = g.world.chests.indexOf(curChest);
      if (i >= 0) g.world.chests.splice(i, 1);
    }
    const tx = Math.round(g.player.cx / 16) + 3, ty = Math.round(g.player.cy / 16) - 2;
    const fx = 28 * 36;
    st.setTile(tx, ty, TILE_BY_KEY['chest'], fx, 0);
    st.setTile(tx + 1, ty, TILE_BY_KEY['chest'], fx + 18, 0);
    st.setTile(tx, ty + 1, TILE_BY_KEY['chest'], fx, 18);
    st.setTile(tx + 1, ty + 1, TILE_BY_KEY['chest'], fx + 18, 18);
    curChest = { x: tx, y: ty, items: new Array(10).fill(null) };
    g.world.chests.push(curChest);
    return curChest;
  };

  const sample = (tag) => {
    const q = ui.vinvQuickBtn;
    const chestSlot = ui.vinvSlots?.get('chest:0');
    return {
      tag,
      player: `${Math.round(g.player.cx / 16)},${Math.round(g.player.cy / 16)}`,
      openChest: ui.openChest ? `@${ui.openChest.x},${ui.openChest.y}` : 'null',
      invPanel: ui.invPanel.style.display,
      modernOpen: ui.vinvModernCraftOpen,
      grid: ui.vinvPipsUseGrid,
      quickBtn_display: q ? q.style.display : 'NO-BTN',
      quickBtn_rendered: q ? !!(q.offsetWidth || q.offsetHeight) : false,
      chestSlot_display: chestSlot ? chestSlot.style.display : 'n/a',
      layoutSig: ui.vinvLayoutSig,
      layout: ui._builtLayout,
    };
  };
  const steps = [];

  // ---------- Phase A：modern 窗（缺省配置） ----------
  steps.push(sample('A0 基线(未开箱未开菜单)'));
  const chestA = anchorChest();
  ui.openChestPanel(chestA);
  steps.push(sample('A1t0 开箱(即时)'));
  await sleep(250);
  steps.push(sample('A1 开箱(+250ms)'));
  let h = hammer(); click(h, 0); await sleep(250);
  steps.push(sample('A2 开箱后左键锤子=开 modern 窗'));
  h = hammer(); click(h, 0); await sleep(250);
  steps.push(sample('A3 再左键锤子=关 modern 窗'));
  ui.closeChest(); await sleep(250);
  steps.push(sample('A4 关箱'));

  // ---------- Phase B：classic 网格 ----------
  h = hammer(); click(h, 2); await sleep(400);   // 右键锤子=切 classic
  const { options } = await import('/src/core/Options.ts');
  const ctl = options.data.craftingGridControl;
  steps.push({ tag: 'B0 切 craftingGridControl', ctl });
  ui.openChestPanel(anchorChest()); await sleep(250);
  steps.push(sample('B1 开箱(classic 模式)'));
  h = hammer(); click(h, 0); await sleep(250);
  steps.push(sample('B2 开箱后左键锤子=开 classic 网格'));
  h = hammer(); click(h, 0); await sleep(250);
  steps.push(sample('B3 再左键锤子=关网格'));
  ui.closeChest(); await sleep(250);
  steps.push(sample('B4 关箱'));
  h = hammer(); click(h, 2); await sleep(400);   // 切回 modern（还原缺省）

  // ---------- Phase C：反向序（制作菜单开着→开箱→关箱） ----------
  ui.openInventory(); await sleep(150);
  h = hammer(); click(h, 0); await sleep(250);   // 开 modern 窗（背包开态=真实用户态）
  steps.push(sample('C1 直接开 modern 窗(无箱)'));
  ui.openChestPanel(anchorChest()); await sleep(250);
  steps.push(sample('C2 窗开着开箱'));
  ui.closeChest(); await sleep(250);
  steps.push(sample('C3 窗开着关箱'));
  h = hammer(); click(h, 0); await sleep(250);   // 关窗
  steps.push(sample('C4 关窗'));

  // ---------- Phase D：开箱→右键合成站（modern 模式） ----------
  const wb = TILE_BY_KEY['workbench'];
  const anchorStation = () => {
    const wx = Math.round(g.player.cx / 16) - 3, wy = Math.round(g.player.cy / 16) - 2;
    st.setTile(wx, wy, wb, 0, 0);
    st.setTile(wx + 1, wy, wb, 18, 0);
    return wx;
  };
  // 真实链 Game.ts:30946 craftingFilterForTile(sheet) → f.tile = 原版 sheet 域
  //（工作台 sheet=18;内部 type=13 是错域——D0 诊断定谳 expandStationTiles 产 sheet 域）
  const stationFilter = () => ({ kind: 'station', tile: 18 });
  anchorStation();
  await sleep(200);
  {
    const { expandStationTiles } = await import('/src/data/vanillaRecipes.ts');
    const nearby = [...g.vanillaNearbyStations()];
    const near18 = nearby.filter((t) => (window.__TILE_DEFS__?.[t]?.vanilla?.sheet) === 18);
    steps.push({
      tag: 'D0 站点诊断',
      wbType: wb,
      nearbySize: nearby.length,
      nearbyHasWb: nearby.includes(wb),
      expand18: expandStationTiles(18).slice(0, 8),
      expand18HasWb: expandStationTiles(18).includes(wb),
      stTypeAtStation: st.type[st.idx(Math.round(g.player.cx / 16) - 3, Math.round(g.player.cy / 16) - 2)],
    });
  }
  ui.openChestPanel(anchorChest()); await sleep(250);
  steps.push(sample('D1 开箱'));
  ui.openCraftingStationFilter(stationFilter()); await sleep(250);
  steps.push(sample('D2 右键合成站=modern 窗开(站点路径)'));
  ui.openCraftingStationFilter(stationFilter()); await sleep(250);
  steps.push(sample('D3 再右键站点=关窗'));
  ui.closeChest(); await sleep(250);
  steps.push(sample('D4 关箱'));

  // ---------- Phase E：开箱→右键合成站（classic 模式） ----------
  h = hammer(); click(h, 2); await sleep(400);   // 切 classic
  anchorStation();
  ui.openChestPanel(anchorChest()); await sleep(250);
  steps.push(sample('E1 开箱(classic)'));
  ui.openCraftingStationFilter(stationFilter()); await sleep(250);
  steps.push(sample('E2 右键合成站=classic 网格开(vinvCloseAllQuiet 路径)'));
  ui.openCraftingStationFilter(stationFilter()); await sleep(250);
  steps.push(sample('E3 再右键站点=LOUD CloseAll'));
  ui.openInventory(true); await sleep(250);
  steps.push(sample('E4 重开背包'));
  return steps;
});
console.log(JSON.stringify(out, null, 1));
console.log('pageerrors:', JSON.stringify(errors));
await browser.close();
