// 指针图标收口批探针:①宝箱悬停(有记录=图标/孤儿=文本抑制)②梳妆台三态
// (记录=样式图标/孤儿=文本/下半格=269)③文本态渲染无异常④tryPlace 放置建记录(88 族)
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600_000, defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`${process.env.SW_ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 90000 });
await page.waitForFunction(() => window.__swGame?.player && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(() => {
  const g = window.__swGame;
  const st = g.world.store;
  const p = g.player;
  // ---- 场地:挑一只世界gen宝箱,旁边清出带地板的口袋(防下坠漂移) ----
  const chest = g.world.chests[0];
  if (!chest) return { fatal: 'no worldgen chest' };
  const ctx0 = Math.max(10, chest.x + 3), cty0 = chest.y;
  for (let dy = -4; dy <= 1; dy++) for (let dx = 0; dx <= 5; dx++) {
    st.setTile(ctx0 + dx, cty0 + dy, 0);
    st.liquid[st.idx(ctx0 + dx, cty0 + dy)] = 0;
  }
  for (let dx = -1; dx <= 6; dx++) st.setTile(ctx0 + dx, cty0 + 2, 2);   // 石地板
  p.x = ctx0 * 16; p.y = cty0 * 16; p.vy = 0; p.hp = 100; p.dead = false;
  for (let i = 0; i < 40; i++) g.fixedUpdate(1 / 60);
  p.vy = 0;
  const hover = (tx, ty) => {
    const [sx, sy] = g.camera.worldToScreen(tx * 16 + 8, ty * 16 + 8);
    g.input.mouseX = sx; g.input.mouseY = sy;
    for (let i = 0; i < 3; i++) { g.fixedUpdate(1 / 60); p.vy = 0; }
    return { id: p.cursorItemIconID, text: p.cursorItemIconText, en: p.cursorItemIconEnabled };
  };
  const r = {};
  // ① 宝箱:有记录 → 图标无文本(先预热一轮:相机缓动收敛后再断言,防首帧竞态)
  hover(chest.x, chest.y);
  r.chestWithRec = hover(chest.x, chest.y);
  // 孤儿(临时摘记录) → 文本 + 图标抑制(-1)
  const recBackup = g.world.chests.splice(0, 1)[0];
  r.chestOrphan = hover(chest.x, chest.y);
  g.world.chests.push(recBackup);
  // ② 梳妆台(合成 3×2,frames 0/18/36 × 0/18)
  const D = window.__swTileByKey('dresser');
  const dtx = ctx0, dty = cty0 - 3;
  for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
    st.setTile(dtx + i, dty + j, D, i * 18, j * 18);
  }
  g.world.chests.push({ x: dtx, y: dty, items: Array(10).fill(null) });
  r.dresserTopWithRec = hover(dtx, dty);
  g.world.chests = g.world.chests.filter((c) => !(c.x === dtx && c.y === dty));
  r.dresserTopOrphan = hover(dtx, dty);
  r.dresserBottom = hover(dtx, dty + 1);
  // ④ tryPlace 放置建记录:vi_48_Chest(宝箱物品,sheet 21)——回归验证登记行
  //    重构(tileId===T.CHEST → sheet 21/467/88)后 21 支不破;88/467 支本仓
  //    暂无可放置物品(vi_334 无 tile 字段),按原版 PlaceDresserDirect 预置
  const itemId = window.__swFlow.itemByKey('vi_48_Chest');
  r.place = { fatal: itemId > 0 ? null : 'no Chest item' };
  if (itemId > 0) {
    p.inv.slots[p.inv.selected] = { id: itemId, stack: 1 };
    p.useTime = 0;
    // 清掉②的合成梳妆台,腾出 3×2 放置位(地板在 cty0+2)
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) st.setTile(dtx + i, dty + j, 0);
    const before = g.world.chests.length;
    g.tryPlace(dtx, dty, window.__swITEMS[itemId]);
    r.place = { before, after: g.world.chests.length };
  }
  // ③ 文本态下渲染若干 rAF(渲染层消费 cursorItemIconText)
  hover(dtx, dty);
  return r;
});
if (out.fatal) { check('前置', false, out.fatal); }
else {
  check('宝箱·有记录→类型图标', out.chestWithRec.id > 0 && out.chestWithRec.text === '', JSON.stringify(out.chestWithRec));
  check('宝箱·孤儿→文本支+图标抑制(-1)', out.chestOrphan.id === -1 && out.chestOrphan.text === '宝箱', JSON.stringify(out.chestOrphan));
  check('梳妆台·有记录→样式图标(334)', out.dresserTopWithRec.id === 334 && out.dresserTopWithRec.text === '', JSON.stringify(out.dresserTopWithRec));
  check('梳妆台·孤儿上半→文本支', out.dresserTopOrphan.id === -1 && out.dresserTopOrphan.text === '梳妆台', JSON.stringify(out.dresserTopOrphan));
  check('梳妆台·下半格恒 269', out.dresserBottom.id === 269 && out.dresserBottom.text === '', JSON.stringify(out.dresserBottom));
  if (out.place?.fatal) check('放置登记(tryPlace 88 族)', false, out.place.fatal);
  else check('放置登记(tryPlace 88 族)→chests +1', out.place.after === out.place.before + 1,
    `before=${out.place.before} after=${out.place.after}`);
}
await new Promise((r) => setTimeout(r, 900));   // rAF 跑文本渲染路径
check('渲染无 pageerror', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`\n${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail ? 1 : 0);
