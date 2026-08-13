// 通行性浏览器探针：可站家具（桌/砧/笼/金属条/平台）真实链路站立 + 致动器 + 门通行。
// 语义源：Main.cs tileSolid/tileSolidTop（vanilla-tilecollision.json 全表对账已绿）。
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true,
  args: ['--no-sandbox'],
  defaultViewport: { width: 1280, height: 720 },
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await new Promise(r => setTimeout(r, 400));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-list-panel', { timeout: 10000 });
await new Promise(r => setTimeout(r, 800));
const hasChar = await page.evaluate(() => !!document.querySelector('.sw-item'));
if (!hasChar) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-char-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('通行性测试');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-item', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 600));
}
await page.click('.sw-item');
await page.waitForFunction(() => document.querySelector('.sw-list-title')?.textContent === '选择世界', { timeout: 10000 });
await new Promise(r => setTimeout(r, 700));
const hasWorld = await page.evaluate(() => !!document.querySelector('.sw-list-panel .sw-item'));
if (!hasWorld) {
  await page.click('.sw-list-footer [data-act=new]');
  await page.waitForSelector('.sw-wc-panel', { timeout: 10000 });
  await new Promise(r => setTimeout(r, 500));
  await page.click('[data-g=size] .sw-wc-opt');
  await new Promise(r => setTimeout(r, 200));
  await page.click('[data-act=create]');
}
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player; }, { timeout: 180000 });
await new Promise(r => setTimeout(r, 2500));

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const res = { steps: [] };
  const ok = (name, cond, extra) => { res.steps.push({ name, pass: !!cond, extra }); return !!cond; };
  const waitUntil = async (fn, ms = 4000) => {
    const t0 = performance.now();
    while (!fn() && performance.now() - t0 < ms) await new Promise(r => setTimeout(r, 30));
    return fn();
  };
  const p = g.player;
  const st = g.world.store;
  // 从 TILE_DEFS 反查：sheet → 内部 id
  const defs = window.__swGame.renderer ? null : null;
  // 通过模块不可达——用 store 现存 tile 扫描不行；改用放置链？直接借 atlas 不行。
  // 换法：v_ defs 的 key 已注入 window.__swTiles？检测可用全局。
  const tilesGlobal = window.__swTiles;
  ok('① tile id 表可用（__swTiles）', !!tilesGlobal && Object.keys(tilesGlobal).length > 100,
    tilesGlobal ? Object.keys(tilesGlobal).length : 'missing');

  const idOf = (needle) => {
    for (const [k, v] of Object.entries(tilesGlobal)) if (k.includes(needle)) return v;
    return -1;
  };
  const TILE = 16;
  const col0 = Math.floor(p.cx / TILE) + 6;   // 玩家右侧一段
  const row0 = Math.floor((p.y + p.h) / TILE) + 2;
  // 地板列（col0..col0+20）
  for (let x = col0 - 1; x <= col0 + 22; x++) st.setTile(x, row0 + 6, 1);

  // ② 工作台顶可站（sheet 18 → key 'v_18'）
  const WB = idOf('v_18_');
  ok('② 工作台条目', WB > 0, WB);
  if (WB > 0) {
    for (let x = col0; x <= col0 + 2; x++) st.setTile(x, row0 + 5, WB, 0, 0);
    p.x = col0 * TILE + 8; p.y = (row0 + 5) * TILE - 42 - 4; p.vx = 0; p.vy = 0; p.fallStartY = null;
    p.inputX = 0; p.inputUp = false; p.inputDown = false;
    await waitUntil(() => p.onGround, 3000);
    ok('② 落到工作台顶站稳（底=顶行格顶）', p.onGround && Math.abs(p.y + p.h - (row0 + 5) * TILE) < 0.01,
      `onGround=${p.onGround} bottom=${p.y + p.h} want=${(row0 + 5) * TILE}`);
  }

  // ③ 按住↑行走踏上前方铁砧（sheet 16）
  const ANVIL = idOf('v_16_');
  ok('③ 铁砧条目', ANVIL > 0, ANVIL);
  if (ANVIL > 0) {
    for (let x = col0; x <= col0 + 22; x++) st.setTile(x, row0 + 6, 1);  // 补地板
    const ax = col0 + 6;
    st.setTile(ax, row0 + 5, ANVIL, 0, 0);
    p.x = (col0 + 2) * TILE; p.y = (row0 + 6) * TILE - 42; p.vx = 0; p.vy = 0; p.fallStartY = null;
    p.inputX = 1; p.inputUp = true; p.inputDown = false;
    let stepped = false;
    const t0 = performance.now();
    while (performance.now() - t0 < 4000) {
      await new Promise(r => setTimeout(r, 16));
      if (p.onGround && Math.abs(p.y + p.h - (row0 + 5) * TILE) < 0.01) { stepped = true; break; }
    }
    ok('③ 按住↑行走踏上铁砧（holdsMatching）', stepped, `bottom=${p.y + p.h}`);
    p.inputX = 0; p.inputUp = false;
  }

  // ④ 笼子顶可站、笼身可穿（sheet 285 蜗牛笼 2×3：顶行 frameY=0）
  const CAGE = idOf('v_285_');
  ok('④ 蜗牛笼条目', CAGE > 0, CAGE);
  if (CAGE > 0) {
    const cx = col0 + 10;
    for (let dy = 0; dy < 3; dy++) st.setTile(cx, row0 + 3 + dy, CAGE, 0, dy * 18);
    p.x = cx * TILE + 8; p.y = (row0 + 3) * TILE - 42 - 4; p.vx = 0; p.vy = 0; p.fallStartY = null;
    p.inputX = 0;
    await waitUntil(() => p.onGround, 3000);
    ok('④ 落到笼顶站稳（顶行 frameY=0）', p.onGround && Math.abs(p.y + p.h - (row0 + 3) * TILE) < 0.01,
      `bottom=${p.y + p.h} want=${(row0 + 3) * TILE}`);
    // 下穿：从笼顶下缘起步直接下落（腿行 frameY≠0 不挡）
    p.y = (row0 + 4) * TILE + 2; p.vy = 0; p.fallStartY = null;
    await new Promise(r => setTimeout(r, 400));
    ok('④ 笼身可穿（落到地板）', p.y + p.h >= (row0 + 6) * TILE - 0.01, `bottom=${p.y + p.h}`);
  }

  // ⑤ 致动平台下穿（nactive 门）
  const PLAT = idOf('v_19_');
  ok('⑤ 平台条目', PLAT > 0, PLAT);
  if (PLAT > 0) {
    const px = col0 + 14;
    for (let x = px; x <= px + 2; x++) st.setTile(x, row0 + 4, PLAT, 0, 0);
    p.x = px * TILE + 8; p.y = (row0 + 4) * TILE - 42 - 4; p.vx = 0; p.vy = 0; p.fallStartY = null;
    await waitUntil(() => p.onGround, 3000);
    ok('⑤ 平台正常站立', p.onGround && Math.abs(p.y + p.h - (row0 + 4) * TILE) < 0.01, `bottom=${p.y + p.h}`);
    for (let x = px; x <= px + 2; x++) st.setActuated(x, row0 + 4, true);
    p.y = (row0 + 4) * TILE - 42 - 4; p.vy = 0; p.fallStartY = null;
    await new Promise(r => setTimeout(r, 500));
    ok('⑤ 致动后下穿（落到地板）', p.y + p.h >= (row0 + 6) * TILE - 0.01, `bottom=${p.y + p.h}`);
    for (let x = px; x <= px + 2; x++) st.setActuated(x, row0 + 4, false);
  }

  // ⑥ 开门可穿、关门阻挡（10/11）
  const D_OPEN = idOf('v_11_'); const D_CLOSED = idOf('v_10_');
  ok('⑥ 门条目', D_OPEN > 0 && D_CLOSED > 0, `${D_OPEN}/${D_CLOSED}`);
  if (D_OPEN > 0) {
    const wx = col0 + 18;
    for (let dy = 0; dy < 3; dy++) st.setTile(wx, row0 + 3 + dy, D_OPEN, 0, dy * 18);
    p.x = (wx - 1) * TILE - 4; p.y = (row0 + 6) * TILE - 42; p.vx = 0; p.vy = 0; p.fallStartY = null;
    p.inputX = 1;
    await new Promise(r => setTimeout(r, 700));
    ok('⑥ 开门可穿行', p.x > wx * TILE + TILE, `x=${p.x} threshold=${wx * TILE + TILE}`);
    for (let dy = 0; dy < 3; dy++) st.setTile(wx, row0 + 3 + dy, D_CLOSED, 0, dy * 18);
    const xBefore = p.x;
    p.x = (wx - 1) * TILE - 4; p.vx = 0;
    await new Promise(r => setTimeout(r, 700));
    ok('⑥ 关门阻挡', p.x < wx * TILE && p.x - ((wx - 1) * TILE - 4) < 3 * TILE, `x=${p.x}`);
    p.inputX = 0;
    void xBefore;
  }
  return res;
});

let pass = 0, fail = 0;
for (const s of out.steps) {
  console.log(`${s.pass ? '✅' : '❌'} ${s.name}${s.extra !== undefined ? '  → ' + s.extra : ''}`);
  s.pass ? pass++ : fail++;
}
console.log(`---- 通行性探针: ${pass}✅ ${fail}❌  pageerror=${errs.length}`);
for (const e of errs) console.log('  ' + e);
await browser.close();
process.exit(fail || errs.length ? 1 : 0);
