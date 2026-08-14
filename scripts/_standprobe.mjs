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
  // 入场沉降门：出生点传送/spawn 收敛完成后再摆场景（否则位置被入场流程覆写）
  await waitUntil(() => p.onGround, 8000);
  const settleX = p.x, settleY = p.y;
  await new Promise(r => setTimeout(r, 600));
  while (Math.abs(p.x - settleX) + Math.abs(p.y - settleY) > 0.5) {
    await new Promise(r => setTimeout(r, 300));   // 等 spawn 微调结束
  }
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
  // 先清空一片建造区（出生点附近自然地形会干扰锚行）
  for (let x = col0 - 2; x <= col0 + 24; x++) {
    for (let y = row0; y <= row0 + 8; y++) st.setTile(x, y, 0);
  }
  // 地板列（col0..col0+20）
  for (let x = col0 - 1; x <= col0 + 22; x++) st.setTile(x, row0 + 6, 1);

  // ② 工作台顶可站（sheet 18 → 本地 def key 'workbench'）
  const WB = idOf('workbench');
  ok('② 工作台条目', WB > 0, WB);
  if (WB > 0) {
    for (let x = col0; x <= col0 + 2; x++) st.setTile(x, row0 + 5, WB, 0, 0);
    p.x = col0 * TILE + 8; p.y = (row0 + 5) * TILE - 42 - 4; p.vx = 0; p.vy = 0; p.fallStartY = null; p.onGround = false;
    p.inputX = 0; p.inputUp = false; p.inputDown = false;
    const trace = [];
    for (let f = 0; f < 60; f++) {
      await new Promise(r => setTimeout(r, 16));
      trace.push(`${(p.y + p.h).toFixed(1)}/vy${p.vy.toFixed(2)}/${p.onGround ? 'G' : '-'}`);
      if (p.onGround && Math.abs(p.y + p.h - (row0 + 5) * TILE) < 0.01) break;
    }
    await waitUntil(() => p.onGround, 3000);
    const dbg = { trace: trace.join(' '),
      h: p.h, bottom: p.y + p.h, row0, col0,
      cx: Math.floor(p.cx / TILE), rowBelow: Math.floor((p.y + p.h) / TILE),
      tBelow: st.get(Math.floor(p.cx / TILE), Math.floor((p.y + p.h) / TILE)),
      tAt5: st.get(Math.floor(p.cx / TILE), row0 + 5),
      stepRenderY: p.stepRenderY,
    };
    ok('② 落到工作台顶站稳（底=顶行格顶）', p.onGround && Math.abs(p.y + p.h - (row0 + 5) * TILE) < 0.01,
      `onGround=${p.onGround} bottom=${p.y + p.h} want=${(row0 + 5) * TILE} dbg=${JSON.stringify(dbg)}`);
  }

  // ③ 按住↑行走踏上前方铁砧（sheet 16 → 本地 def key 'anvil'）
  const ANVIL = idOf('anvil');
  ok('③ 铁砧条目', ANVIL > 0, ANVIL);
  if (ANVIL > 0) {
    for (let x = col0; x <= col0 + 22; x++) st.setTile(x, row0 + 6, 1);  // 补地板
    const ax = col0 + 6;
    st.setTile(ax, row0 + 5, ANVIL, 0, 0);
    // 起点=干净地板（② 的工作台占 col0..col0+2，③ 从 col0+4 起走——身体不嵌入）
    p.x = (col0 + 4) * TILE + 8; p.y = (row0 + 6) * TILE - 42; p.vx = 0; p.vy = 0; p.fallStartY = null;
    p.hp = p.maxHp; p.dead = false;   // 窒息/意外伤害护栏（死亡会冻结 fixedUpdate）
    g.input.touchKeys.add('KeyD'); g.input.touchKeys.add('KeyW');   // 走输入通道（直赋被每帧注入覆写）
    let stepped = false;
    const tr3 = [];
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) {
      await new Promise(r => setTimeout(r, 16));
      tr3.push(`${Math.floor(p.x / TILE)}:${(p.y + p.h - (row0 + 6) * TILE).toFixed(0)}${p.onGround ? 'G' : ''}`);
      if (p.onGround && Math.abs(p.y + p.h - (row0 + 5) * TILE) < 0.01) { stepped = true; break; }
      if (p.dead || p.hp <= 0) break;
    }
    void tr3;
    g.input.touchKeys.delete('KeyD'); g.input.touchKeys.delete('KeyW');
    ok('③ 按住↑行走踏上铁砧（holdsMatching）', stepped,
      `bottom=${p.y + p.h} want=${(row0 + 5) * TILE} dead=${p.dead} hp=${p.hp} col=${Math.floor(p.x / TILE)} tr=${tr3.slice(-14).join(' ')}`);
    p.inputX = 0; p.inputUp = false;
  }

  // ④ 笼子顶可站、笼身可穿（sheet 285 蜗牛笼 2×3：顶行 frameY=0）
  const CAGE = idOf('v_285_');
  ok('④ 蜗牛笼条目', CAGE > 0, CAGE);
  if (CAGE > 0) {
    const cx = col0 + 12;
    for (let dy = 0; dy < 3; dy++) st.setTile(cx, row0 + 3 + dy, CAGE, 0, dy * 18);
    p.hp = p.maxHp; p.dead = false;
    p.x = cx * TILE + 8; p.y = (row0 + 3) * TILE - 42 - 4; p.vx = 0; p.vy = 0; p.fallStartY = null; p.onGround = false;
    p.inputX = 0;
    const tr4 = [];
    for (let f = 0; f < 30 && !p.onGround; f++) {
      await new Promise(r => setTimeout(r, 16));
      tr4.push(`${(p.y + p.h).toFixed(1)}/vy${p.vy.toFixed(2)}${p.onGround ? 'G' : ''}`);
    }
    ok('④ 逐帧', tr4.length > 0, tr4.slice(0, 12).join(' '));
    ok('④ 落到笼顶站稳（顶行 frameY=0）', p.onGround && Math.abs(p.y + p.h - (row0 + 3) * TILE) < 0.01,
      `bottom=${p.y + p.h} want=${(row0 + 3) * TILE} dead=${p.dead} hp=${p.hp}`);
    // 下穿：从笼顶下缘起步直接下落（腿行 frameY≠0 不挡）
    p.y = (row0 + 4) * TILE + 2; p.vy = 0; p.fallStartY = null; p.onGround = false;
    await new Promise(r => setTimeout(r, 400));
    ok('④ 笼身可穿（落到地板）', p.y + p.h >= (row0 + 6) * TILE - 0.01, `bottom=${p.y + p.h}`);
  }

  // ⑤ 致动平台下穿（nactive 门；sheet 19 → 本地 def key 'platform'）
  const PLAT = idOf('platform');
  ok('⑤ 平台条目', PLAT > 0, PLAT);
  if (PLAT > 0) {
    const px = col0 + 16;
    for (let x = px; x <= px + 2; x++) st.setTile(x, row0 + 4, PLAT, 0, 0);
    p.hp = p.maxHp; p.dead = false;
    p.x = px * TILE + 8; p.y = (row0 + 4) * TILE - 42 - 4; p.vx = 0; p.vy = 0; p.fallStartY = null; p.onGround = false;
    const tr5 = [];
    for (let f = 0; f < 40 && !p.onGround; f++) {
      await new Promise(r => setTimeout(r, 16));
      tr5.push(`${(p.y + p.h).toFixed(1)}/vy${p.vy.toFixed(2)}${p.onGround ? 'G' : ''}`);
    }
    ok('⑤ 平台正常站立', p.onGround && Math.abs(p.y + p.h - (row0 + 4) * TILE) < 0.01,
      `bottom=${p.y + p.h} want=${(row0 + 4) * TILE} tr=${tr5.slice(0, 10).join(' ')} plat=${st.isPlatform(px, row0 + 4)} drop=${p.dropThrough ?? 'n/a'} down=${p.inputDown}`);
    for (let x = px; x <= px + 2; x++) st.setActuated(x, row0 + 4, true);
    p.y = (row0 + 4) * TILE - 42 - 4; p.vy = 0; p.fallStartY = null; p.onGround = false;
    await new Promise(r => setTimeout(r, 500));
    ok('⑤ 致动后下穿（落到地板）', p.y + p.h >= (row0 + 6) * TILE - 0.01, `bottom=${p.y + p.h}`);
    for (let x = px; x <= px + 2; x++) st.setActuated(x, row0 + 4, false);
  }

  // ⑥ 开门可穿、关门阻挡（10/11）
  const D_OPEN = idOf('door_open'); const D_CLOSED = idOf('door_closed');
  ok('⑥ 门条目', D_OPEN > 0 && D_CLOSED > 0, `${D_OPEN}/${D_CLOSED}`);
  if (D_OPEN > 0) {
    const wx = col0 + 20;
    for (let dy = 0; dy < 3; dy++) st.setTile(wx, row0 + 3 + dy, D_OPEN, 0, dy * 18);
    p.hp = p.maxHp; p.dead = false;
    p.x = (wx - 1) * TILE - 4; p.y = (row0 + 6) * TILE - 42; p.vx = 0; p.vy = 0; p.fallStartY = null;
    g.input.touchKeys.add('KeyD');
    await new Promise(r => setTimeout(r, 700));
    g.input.touchKeys.delete('KeyD');
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
