// ★BJ421 实机探针:商店储蓄行(存款)与快乐度行并存不叠验证。
// 链路:?play=small 世界 → 地面生成 Merchant → 塞猪猪存钱罐(银67+铜30=6730铜,
// 计数显示 0 0 67 30=用户截图同款)→ openNpcDialog+openShopFromButton 开店 →
// 量测 vinvShopCoinCnts/Icons/HappyIcon/HappyText DOM rect(逻辑空间=rect/K,
// K=HappyIcon 宽/24)→ 断言计数带 ∩ 快乐带 = ∅ → 截图留档 docs/evidence/bj421/。
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'node:fs';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const OUT = new URL('../docs/evidence/bj421/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const b = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const p = await b.newPage();
const errors = [];
p.on('pageerror', (e) => errors.push(String(e.message).slice(0, 160)));
await p.goto(ORIGIN + '/?play=small&bj421p=' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world && g.renderer; }, { timeout: 150000 });
await sleep(1500);

const diag = await p.evaluate(async () => {
  // 摘欢迎覆层(未 ack 层组盖全屏,截图面须先摘;DOM 直摘=与 ack 按钮同效面)
  document.getElementById('sw-welcome-announce')?.remove();
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
  const st = g.world.store;
  const groundY = (px) => { const tx = Math.floor(px / 16); for (let ty = 0; ty < st.h; ty++) { if (st.isSolid(tx, ty)) return ty * 16; } return null; };
  const px0 = g.player.x;
  const gy = groundY(px0 + 48);
  // 清障+落地商人(玩家身边,不加载具——原版 NPC 无碰撞嵌墙)
  const merchant = new TownNPC('merchant', px0 + 48, gy - 40);
  g.entities.add(merchant, 'npcs');
  // 猪猪存钱罐(banks[0])塞 银币×67 + 铜币×30 → 储蓄 6730 铜 → 计数 0 0 67 30
  g.player.banks[0] = [];
  g.player.banks[0].push({ id: invIndexOfVanilla(72), stack: 67 });
  g.player.banks[0].push({ id: invIndexOfVanilla(71), stack: 30 });
  await new Promise((r) => setTimeout(r, 400));
  // 开对话→商店按钮链(真实链:openNpcDialog 置 dialogNpc/dialogHappiness →
  // openShopFromButton → openNpcShop → cb.onNpcShop → UI.showNpcShop)
  g.openNpcDialog(merchant);
  await new Promise((r) => setTimeout(r, 400));
  // 复刻用户实报配置:快乐度 100%(森林旷野无房 150% 与报告不符;mul 只影响表情帧/
  // 文案,行几何与 mul 无关——钉 1 = 用户截图同款「100%」)
  if (g.dialogHappiness) g.dialogHappiness.priceMul = 1;
  g.openShopFromButton(false);
  await new Promise((r) => setTimeout(r, 700));
  const ui = window.__swUI;
  const cnts = (ui.vinvShopCoinCnts ?? []).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, text: e.textContent }; });
  const icons = (ui.vinvShopCoinIcons ?? []).map((e) => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const rect = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
  const happy = rect(ui.vinvShopHappyIcon);
  const happyTxt = rect(ui.vinvShopHappyText);
  const label = rect(ui.vinvShopSavedEl);
  const happyText = ui.vinvShopHappyText?.textContent ?? '';
  const layout = ui._builtLayout;
  const open = g.npcShopOpen;
  const savingsCopper = g.coinSavingsCopper();
  const split = g.coinSavingsSplit();
  const mul = g.shopHappinessMul;
  return { layout, open, savingsCopper, split, mul, happyText, cnts, icons, happy, happyTxt, label,
    merchantVid: merchant.vanillaId };
});

const fmt = (r) => r ? `(${Math.round(r.x)},${Math.round(r.y)}) ${Math.round(r.w)}x${Math.round(r.h)}` : 'null';

// 逻辑空间换算:vinv 根 = fixed inset:0 + transform scale(K)(origin top-left)→
// screen = logical×K;K 取快乐图标实宽/24(UI_NPCHappiness 帧逻辑 24×24)
const K = diag.happy ? diag.happy.w / 24 : 0;
const lg = (v) => Math.round((v / K) * 10) / 10;

let gapIcon = null, gapText = null, allOk = false;
if (K > 0 && diag.cnts.length === 4 && diag.happy) {
  // 计数带底(4 格最大 bottom)vs 快乐图标顶/文字顶——逻辑空间
  const cntBottom = Math.max(...diag.cnts.map((c) => lg(c.y + c.h)));
  const cntTop = Math.min(...diag.cnts.map((c) => lg(c.y)));
  const iconTopL = lg(diag.happy.y);
  const txtTopL = diag.happyTxt ? lg(diag.happyTxt.y) : null;
  gapIcon = Math.round((iconTopL - cntBottom) * 10) / 10;
  gapText = txtTopL === null ? null : Math.round((txtTopL - cntBottom) * 10) / 10;
  // 图标中心逻辑位(应=515+24j,333)+计数文字顶(应=333)
  const iconCenters = diag.icons.map((i) => [lg(i.x + i.w / 2), lg(i.y + i.h / 2)]);
  const cntTops = diag.cnts.map((c) => lg(c.y));
  const expectedIcons = [515, 539, 563, 587].map((x) => [x, 333]);
  const centersOk = iconCenters.every(([x, y], i) => Math.abs(x - expectedIcons[i][0]) <= 1 && Math.abs(y - expectedIcons[i][1]) <= 1);
  const topsOk = cntTops.every((y) => Math.abs(y - 333) <= 1);
  allOk = gapIcon >= 0 && gapText >= 0 && centersOk && topsOk
    && diag.cnts.map((c) => c.text).join(',') === '0,0,67,30';
  console.log(JSON.stringify({
    layout: diag.layout, shopOpen: diag.open, savingsCopper: diag.savingsCopper, split: diag.split,
    happinessMul: diag.mul, happyText: diag.happyText, merchantVid: diag.merchantVid,
    K: Math.round(K * 1000) / 1000,
    cntRects: diag.cnts.map(fmt), iconRects: diag.icons.map(fmt),
    happyRect: fmt(diag.happy), happyTxtRect: fmt(diag.happyTxt), labelRect: fmt(diag.label),
    logical: { cntBand: [cntTop, cntBottom], iconTop: iconTopL, txtTop: txtTopL,
      iconCenters, cntTops, expectedIcons },
    gaps: { cntBottom_to_happyIconTop: gapIcon, cntBottom_to_happyTextTop: gapText },
    countsText: diag.cnts.map((c) => c.text).join(','),
    centersOk, topsOk, VERDICT: allOk ? 'PASS 不重叠' : 'FAIL 重叠/锚漂移',
  }, null, 1));
} else {
  console.log(JSON.stringify({ VERDICT: 'FAIL 量测面缺失', K, cntCount: diag.cnts.length, happy: !!diag.happy, diag }, null, 1));
}

await p.screenshot({ path: OUT + 'bj421-shop-full.png' });
// 裁剪区 = 储蓄列(标签+币行+快乐度)外扩:logical x 460..680 × y 240..430 → screen=logical×K
if (K > 0) {
  await p.screenshot({ path: OUT + 'bj421-shop-savings-column.png', clip: {
    x: Math.max(0, 460 * K), y: Math.max(0, 240 * K),
    width: Math.min(1280 - 460 * K, 220 * K), height: Math.min(800 - 240 * K, 190 * K) } });
}

if (errors.length) console.log('[pageerrors]', JSON.stringify(errors.slice(0, 5)));
await b.close();
process.exit(allOk ? 0 : 3);
