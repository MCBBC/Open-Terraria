// ★RB31a 复核探针#3(2026-09-16)——终局三面:
//  C'' 高尔夫 delayUseItem 门(带球座:tee tile sheet494+高尔夫球件)
//  MD' 地图内右键取消臂仍禁(判别式:menuTick 音效=取消臂指纹;开图门无音效)
//  E'' FX57 烘焙计数+缓存 churn(关包态:infoAccs 文本支只 在 !playerInventory 画)
// 跑法:SW_ORIGIN=http://localhost:5264 node tools/run-diag.mjs scripts/_rb31a-input-bake3.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message.slice(0, 200)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)); });
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1200));
await page.evaluate(() => document.getElementById('sw-welcome-announce')?.remove());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const note = (n, x = '') => console.log(`INFO: ${n}${x ? '  ' + x : ''}`);
const ticks = (n = 4) => page.evaluate((n) => new Promise((res) => {
  const g = window.__swGame; const t0 = g.tickCount;
  const iv = setInterval(() => { if (g.tickCount - t0 >= n) { clearInterval(iv); res(g.tickCount - t0); } }, 8);
}), n);
const hygiene = () => page.evaluate(() => {
  const g = window.__swGame;
  g.renderer.fullMap.open = false;
  g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false; g.input.delayUseItem = false;
  g._prevRightDown = false; g._prevMouseDown = false;
  g.housingMode = null;
  g.player.dead = false; g.player.respawnTimer = 0; g.player.useTime = 0;
  g.golfAim = false; g.golfAimBall = null; g.renderer.golfPower = null;
});
const GY = 300;
const makeFlat = () => page.evaluate(({ GY }) => {
  const st = window.__swGame.world.store;
  for (let x = 130; x <= 630; x++) for (let y = GY - 60; y <= GY + 20; y++) { st.setTile(x, y, 0); st.setSlope(x, y, 0); }
  for (let x = 140; x <= 620; x++) st.setTile(x, GY, 1);
}, { GY });
const placePlayer = (tx) => page.evaluate(({ GY, tx }) => {
  const g = window.__swGame, p = g.player;
  p.x = tx * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = false; p.dead = false; p.respawnTimer = 0;
  p.statLife = p.statLifeMax2; p.useTime = 0;
}, { GY, tx });

// ============ C'' 高尔夫 delayUseItem 门(带 tee) ============
{
  await hygiene(); await makeFlat(); await placePlayer(220); await sleep(300);
  const setup = await page.evaluate(async ({ GY }) => {
    const g = window.__swGame;
    // tee tile(内部 id 经 tiles.ts 查 sheet494)+ 高尔夫球件
    let teeType = -1;
    const defs = (await import('/src/data/tiles.ts')).TILE_DEFS;
    for (let i = 0; i < defs.length; i++) if (defs[i]?.vanilla?.sheet === 494) { teeType = i; break; }
    const st = g.world.store;
    const ptx = Math.floor(g.player.x / 16), pty = Math.floor(g.player.y / 16);
    st.setTile(ptx + 2, GY - 1, teeType);   // 玩家右侧 2 格、地面上一格
    // 球件入包
    const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
    const it = window.__swItems ?? {};
    const bkey = vk[4090]; if (bkey && it[bkey]) g.player.inv.slots[10] = { id: it[bkey], stack: 1 };
    const defsI = window.__swITEMS ?? [];
    const club = defsI.find((d) => d && typeof d.key === 'string' && /^vi_4092_/.test(d.key));
    g.player.inv.slots[0] = { id: club.id ?? defsI.indexOf(club), stack: 1 };
    g.player.inv.selected = 0;
    return { teeType, ptx, pty };
  }, { GY }).catch((e) => ({ err: String(e).slice(0, 120) }));
  check("C''0 tee+球杆+球就绪", !!setup && setup.teeType > 0, JSON.stringify(setup));
  if (setup?.teeType > 0) {
    await page.evaluate(() => { const g = window.__swGame; g.input.mouseX = 640; g.input.mouseY = 320; });
    await page.evaluate(() => { const i = window.__swGame.input; i.mouseDown = true; i.mouseHeld = true; i.delayUseItem = true; });
    await ticks(8);
    let st = await page.evaluate(() => ({ aim: window.__swGame.golfAim, ut: window.__swGame.player.useTime }));
    check("C''1 旗存续期按杆不开瞄(delayUseItem 压制)", !st.aim && st.ut === 0, JSON.stringify(st));
    await page.evaluate(() => { window.__swGame.input.delayUseItem = false; });
    await ticks(8);
    st = await page.evaluate(() => ({ aim: window.__swGame.golfAim, ball: !!window.__swGame.golfAimBall }));
    check("C''2 撤旗同电平照常开瞄(门不误吞)", st.aim === true, JSON.stringify(st));
    await page.evaluate(() => { window.__swGame.input.delayUseItem = true; });
    await ticks(4);
    st = await page.evaluate(() => {
      const b = window.__swGame.golfAimBall ?? window.__swGame.entities.projectiles.find((e) => e.isMine && !e.dead);
      return { aim: window.__swGame.golfAim, ut: window.__swGame.player.useTime, ballV: b ? +Math.hypot(b.vx, b.vy).toFixed(2) : null };
    });
    note("C''3 旗存续期瞄准臂让位行为(登记=击球同相)", JSON.stringify(st));
    await page.evaluate(() => { const i = window.__swGame.input; i.mouseDown = false; i.mouseHeld = false; i.delayUseItem = false; });
    await ticks(4);
  }
  await hygiene();
}

// ============ MD' 地图内右键取消臂仍禁(menuTick 指纹判别) ============
{
  await hygiene(); await placePlayer(240); await sleep(300);
  await page.evaluate(() => {
    const g = window.__swGame;
    g.__md = { ticks: 0 };
    const op = g.sfx.play.bind(g.sfx);
    g.sfx.play = (n, ...a) => { if (n === 'menuTick') g.__md.ticks++; return op(n, ...a); };
    g._prevRightDown = false;
  });
  // 基线:关图+query 携带+右键沿 → 取消臂跑(1 次 menuTick)
  await page.evaluate(() => { const g = window.__swGame; g.housingMode = { kind: 'query' }; g.input.rightDown = true; });
  await ticks(2);
  await page.evaluate(() => { const g = window.__swGame; g.input.rightDown = false; g._prevRightDown = false; });
  await ticks(2);
  const base = await page.evaluate(() => ({ t: window.__swGame.__md.ticks, hm: window.__swGame.housingMode?.kind ?? null }));
  check("MD'1 关图右键沿=取消臂(menuTick≥1+携带清)", base.t >= 1 && base.hm === null, JSON.stringify(base));
  // 开图:query 携带+右键沿 → 开图门先清(无 menuTick=取消臂未跑)
  await page.evaluate(() => {
    const g = window.__swGame;
    g.__md.ticks = 0;
    g.housingMode = { kind: 'query' };
    g.renderer.fullMap.open = true;
    g.input.rightDown = true; g._prevRightDown = false;
  });
  await ticks(3);
  const inMap = await page.evaluate(() => ({ t: window.__swGame.__md.ticks, hm: window.__swGame.housingMode?.kind ?? null, open: window.__swGame.renderer.fullMap.open }));
  check("MD'2 开图右键沿=门清携带且取消臂禁(menuTick=0)", inMap.open && inMap.hm === null && inMap.t === 0, JSON.stringify(inMap));
  await page.evaluate(() => { const g = window.__swGame; g.input.rightDown = false; g.renderer.fullMap.open = false; });
  await ticks(2);
  await hygiene();
}

// ============ E'' FX57 烘焙计数+churn(关包态) ============
{
  await hygiene(); await placePlayer(260); await sleep(300);
  // 关包(确保 !playerInventory → 文本支绘制)+ 关图
  await page.evaluate(() => { window.__swUI.closeInventory?.(); });
  await ticks(2);
  await page.evaluate(() => {
    const g = window.__swGame;
    const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
    const it = window.__swItems ?? {};
    [17, 18, 393, 3119, 3099, 3084].forEach((vid, i) => {
      const k = vk[vid]; if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 };
    });
  });
  await sleep(600);
  const pre = await page.evaluate(() => ({
    rows: window.__swGame.renderer.infoAccs.state.rows.length,
    inv: window.__swUI.inventoryOpen ?? null,
    playerInventory: window.__swGame.renderer.playerInventory ?? null,
  }));
  note("E''-0 行态", JSON.stringify(pre));
  check("E''-0 信息行在画(6 行+背包关)", pre.rows >= 5 && pre.playerInventory === false, JSON.stringify(pre));
  // 计数:行文本 fillText=0(烘焙生效)+每帧每行恰 2 次位图 drawImage(基线扣除)
  await page.evaluate(() => {
    window.__rb3 = { fills: 0, draw5: 0, f0: window.__swGame.renderer.animTick, rows: window.__swGame.renderer.infoAccs.state.rows.map((r) => r.text) };
    if (!window.__rb3Wrapped) {
      window.__rb3Wrapped = true;
      const od = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (img, a, b, c, d, ...rest) {
        if (a !== undefined && d !== undefined && rest.length === 0 && img instanceof HTMLCanvasElement) window.__rb3.draw5++;
        return od.call(this, img, a, b, c, d, ...rest);
      };
      const of = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
        if (window.__rb3.rows?.includes(String(s))) window.__rb3.fills++;
        return of.call(this, s, x, y);
      };
    }
    window.__rb3.rows = window.__swGame.renderer.infoAccs.state.rows.map((r) => r.text);
  });
  await sleep(1000);
  const live = await page.evaluate(() => ({ fills: window.__rb3.fills, draw5: window.__rb3.draw5, frames: window.__swGame.renderer.animTick - window.__rb3.f0, rows: window.__rb3.rows.length }));
  const perRow = live.rows ? live.draw5 / Math.max(1, live.frames) / live.rows : -1;
  check("E''-1 信息行文本零 fillText(烘焙生效)", live.fills === 0, JSON.stringify({ fills: live.fills, rows: live.rows }));
  note("E''-2 每帧每行烘焙位图 drawImage(期望≈2)", `draw5=${live.draw5} frames=${live.frames} rows=${live.rows} → ${perRow.toFixed(2)}`);
  check("E''-2 每行恰 2 次位图绘制(剪影+染色,无双调用)", perRow > 1.5 && perRow < 2.6, perRow.toFixed(2));
  // churn:移动玩家(罗盘逐帧新串)
  const churn = await page.evaluate(async () => {
    const m = await import('/src/vui/draw/MouseTextBake.ts');
    const g = window.__swGame;
    const traj = [m.bakeStats().count];
    let clears = 0, prev = traj[0];
    const iv = setInterval(() => { g.player.x += 20; }, 33);
    const t0 = performance.now();
    while (performance.now() - t0 < 2000) {
      await new Promise((r) => setTimeout(r, 100));
      const c = m.bakeStats().count;
      if (c < prev) clears++;
      prev = c; traj.push(c);
    }
    clearInterval(iv);
    return { max: Math.max(...traj), last: traj[traj.length - 1], clears, head: traj.slice(0, 6) };
  });
  note("E''-3 2s 移动期缓存轨迹", JSON.stringify(churn));
  check("E''-3 动态行入键(缓存增长)", churn.max > churn.head[0], `head0=${churn.head[0]} max=${churn.max}`);
  check("E''-3 有界且非病态全清(max≤512,clears≤20)", churn.max <= 512 && churn.clears <= 20, `max=${churn.max} clears=${churn.clears}`);
  await page.evaluate(() => { const g = window.__swGame; g.player.x -= 20 * 70; });
  await hygiene();
}

check('全程零页面异常', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
