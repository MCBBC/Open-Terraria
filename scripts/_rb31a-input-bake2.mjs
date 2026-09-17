// ★RB31a 复核探针#2(2026-09-16)——#1 的 B5 泄漏开图态污染 C/D2/E2,本探针带状态卫生重测:
//  B3' MED-2 重开无跳变(隔离判别式:关图期移鼠→重开→拖 60px;修复=+60,旧 bug=+200)
//  C'  MINOR-4 高尔夫 delayUseItem 门(关图态)
//  A4' 死亡态 MINOR-5 降级(证 updateUse 死亡期可达,与开图门解耦)
//  D2' MINOR-5 住房面板每帧降级链(关图态)
//  E2' FX57 烘焙位图计数(基线扣除非烘焙 drawImage)+ E3' 缓存实例/churn 取证
// 跑法:SW_ORIGIN=http://localhost:5264 node tools/run-diag.mjs scripts/_rb31a-input-bake2.mjs
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
// 状态卫生:关图+抬鼠+清住房+复活
const hygiene = () => page.evaluate(() => {
  const g = window.__swGame;
  g.renderer.fullMap.open = false;
  g.input.mouseDown = false; g.input.mouseHeld = false; g.input.rightDown = false; g.input.delayUseItem = false;
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

// ============ B3' MED-2 重开无跳变(判别式 60 vs 200) ============
{
  await hygiene(); await makeFlat(); await placePlayer(300); await sleep(300);
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(3);
  await page.mouse.move(500, 400);
  await page.mouse.down();
  await page.mouse.move(560, 400, { steps: 4 });   // 拖 60px
  await ticks(2);
  const d1 = await page.evaluate(() => { const r = window.__swGame.renderer; return { md: r.mapDragging, lm: { ...r.lastMouse } }; });
  check("B3'-1 开图拖拽中(md=true,lastMouse=560)", d1.md === true && d1.lm.x === 560, JSON.stringify(d1));
  await page.evaluate(() => window.__swGame.toggleFullMap());   // 按住关图
  await ticks(4);
  await page.mouse.move(700, 400);   // ★关图期移鼠(旧 bug 的跳变源:stale lastMouse=560)
  const d2 = await page.evaluate(() => { const r = window.__swGame.renderer; return { md: r.mapDragging, lm: { ...r.lastMouse }, open: r.fullMap.open }; });
  check("B3'-2 按住关图复位(md=false,lastMouse=0)", !d2.open && d2.md === false && d2.lm.x === 0 && d2.lm.y === 0, JSON.stringify(d2));
  await page.evaluate(() => window.__swGame.toggleFullMap());   // 按住重开
  await sleep(2600);   // 缓动收敛(zoom 0.5→2),期间按住静止=位移门不重锚
  await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; f.zoomTarget = f.zoom; });   // 冻结缩放,去缓动混杂
  await ticks(3);
  const pan0 = await page.evaluate(() => window.__swGame.renderer.fullMap.panX);
  await page.mouse.move(760, 400, { steps: 4 });   // 重开后拖 60px
  await ticks(3);
  const pan1 = await page.evaluate(() => window.__swGame.renderer.fullMap.panX);
  const dpan = pan1 - pan0;
  check("B3'-3 重开首段拖拽=本轮位移(≈+60;旧 bug 会 +200)", Math.abs(dpan - 60) <= 12, `panΔ=${dpan.toFixed(1)}`);
  await page.mouse.up();
  await hygiene();
}

// ============ C' MINOR-4 高尔夫 delayUseItem 门(关图态) ============
{
  await hygiene(); await makeFlat(); await placePlayer(220); await sleep(400);
  const clubKey = await page.evaluate(() => {
    const g = window.__swGame;
    const defs = window.__swITEMS ?? [];
    const def = defs.find((d) => d && typeof d.key === 'string' && /^vi_4092_/.test(d.key));
    if (!def) return null;
    g.player.inv.slots[0] = { id: def.id ?? defs.indexOf(def), stack: 1 };
    g.player.inv.selected = 0;
    return def.key;
  });
  check("C'0 推杆在手", !!clubKey, clubKey ?? 'none');
  await page.evaluate(() => {
    const g = window.__swGame;
    g.input.mouseX = 640; g.input.mouseY = 320;
  });
  // C'1 旗存续+按住 → 开瞄被压制
  await page.evaluate(() => { const i = window.__swGame.input; i.mouseDown = true; i.mouseHeld = true; i.delayUseItem = true; });
  await ticks(8);
  let st = await page.evaluate(() => ({ aim: window.__swGame.golfAim, ut: window.__swGame.player.useTime, flag: window.__swGame.input.delayUseItem }));
  check("C'1 旗存续期按杆不开瞄(压制,useTime 也须 0)", !st.aim && st.ut === 0, JSON.stringify(st));
  // C'2 同电平撤旗 → 开瞄
  await page.evaluate(() => { window.__swGame.input.delayUseItem = false; });
  await ticks(8);
  st = await page.evaluate(() => ({ aim: window.__swGame.golfAim, ut: window.__swGame.player.useTime }));
  check("C'2 撤旗同电平照常开瞄(门不误吞)", st.aim === true, JSON.stringify(st));
  // C'3 瞄准期旗掉 → 让位击球支(登记=channel 掉同相)
  await page.evaluate(() => { window.__swGame.input.delayUseItem = true; });
  await ticks(4);
  st = await page.evaluate(() => {
    const b = window.__swGame.golfAimBall;
    return { aim: window.__swGame.golfAim, ut: window.__swGame.player.useTime, ballV: b ? +Math.hypot(b.vx || 0, b.vy || 0).toFixed(2) : null };
  });
  note("C'3 旗存续期瞄准臂让位行为(登记=击球)", JSON.stringify(st));
  await page.evaluate(() => { const i = window.__swGame.input; i.mouseDown = false; i.mouseHeld = false; i.delayUseItem = false; });
  await ticks(4);
  await hygiene();
}

// ============ A4' 死亡态 MINOR-5 降级(updateUse 死亡期可达,关图解耦) ============
{
  await hygiene(); await makeFlat(); await placePlayer(240); await sleep(300);
  const r = await page.evaluate(async () => {
    const g = window.__swGame;
    let npc = g.entities.npcs.find((n) => n.npcKey && !n.dead);
    if (!npc) {
      const { TownNPC } = await import('/src/entities/TownNPC.ts');
      npc = new TownNPC('guide', g.player.x + 40, g.player.y);
      g.entities.add(npc, 'npcs');
      await new Promise((res) => setTimeout(res, 300));
    }
    if (!npc || npc.dead) return { ok: false };
    g.player.dead = true; g.player.respawnTimer = 600; g.player.deadTime = 100;
    g.housingMode = { kind: 'assign', npcKey: npc.npcKey };
    const before = g.housingMode?.kind ?? null;
    npc.dead = true;                     // 携带 NPC 死亡(玩家已死)
    await new Promise((res) => setTimeout(res, 400));
    return { ok: true, before, after: g.housingMode?.kind ?? null, dead: g.player.dead };
  });
  check("A4' 玩家死亡期 MINOR-5 降级照跑(updateUse 死亡期可达)", r.ok && r.before === 'assign' && r.after === 'query',
    JSON.stringify(r.ok ? { before: r.before, after: r.after } : r));
  await hygiene();
}

// ============ D2' 住房面板每帧降级链(关图态) ============
{
  await hygiene(); await placePlayer(250); await sleep(300);
  const opened = await page.evaluate(async () => {
    const ui = window.__swUI;
    ui.onHousing?.();
    for (let i = 0; i < 60; i++) { if (window.__swHousingPanel) return true; await new Promise((r) => setTimeout(r, 50)); }
    return !!window.__swHousingPanel;
  });
  check("D'0 住房面板挂载", opened);
  if (opened) {
    const r = await page.evaluate(async () => {
      const g = window.__swGame, p = window.__swHousingPanel;
      const npc = g.entities.npcs.find((n) => n.npcKey && !n.dead);
      if (!npc) return { ok: false, why: 'no npc' };
      const key = npc.npcKey;
      let setCursorCalls = 0, cbCalls = 0;
      const oS = p.setCursor.bind(p);
      p.setCursor = (m) => { setCursorCalls++; oS(m); };
      const oC = g.cb.onHousingCursor;
      g.cb.onHousingCursor = (m, kp) => { cbCalls++; oC?.(m, kp); };
      p.setCursor({ kind: 'assign', npcKey: key });
      const picked = g.housingMode?.kind ?? null;
      npc.dead = true;
      await new Promise((res) => setTimeout(res, 500));
      return { ok: true, picked, gameNow: g.housingMode?.kind ?? null, panelNow: p.cursor?.kind ?? null, setCursorCalls, cbCalls };
    });
    check("D'2 携带 NPC 死亡→半秒内降级 query(Game+面板双链收敛)",
      r.ok && r.picked === 'assign' && r.gameNow === 'query' && r.panelNow === 'query',
      JSON.stringify(r.ok ? { picked: r.picked, game: r.gameNow, panel: r.panelNow, setCursor: r.setCursorCalls, cb: r.cbCalls } : r));
    check("D'3 降级零风暴(setCursor≤3/半秒,cb≤3)", r.ok && r.setCursorCalls <= 3 && r.cbCalls <= 3,
      `setCursor=${r.setCursorCalls} cb=${r.cbCalls}`);
    await page.evaluate(() => window.__swHousingPanel?.destroy());
    await ticks(2);
  }
  await hygiene();
}

// ============ E2'/E3' FX57:烘焙计数(基线扣除)+缓存实例 ============
{
  await hygiene(); await placePlayer(260); await sleep(300);
  // E3'-a 模块实例取证:直接经 import 的实例画一行唯一串→count 是否 +1;并找 app 实际资源 URL
  const inst = await page.evaluate(async () => {
    const m = await import('/src/vui/draw/MouseTextBake.ts');
    const c0 = m.bakeStats().count;
    const cv = document.createElement('canvas'); cv.width = 300; cv.height = 40;
    const ctx = cv.getContext('2d');
    m.drawBakedMouseText(ctx, 'RB31A实例探针串', 10, 20, { anchor: 'top', color: '#fff' });
    const c1 = m.bakeStats().count;
    const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.includes('MouseTextBake'));
    return { c0, c1, urls: [...new Set(urls)] };
  });
  note("E3'-a 模块实例取证", JSON.stringify(inst));
  check("E3'-a import 实例可烘(探针串入缓存 c1=c0+1)", inst.c1 === inst.c0 + 1, `c0=${inst.c0} c1=${inst.c1}`);

  // E2'-b 基线:无信息件 draw5 率 → 装件后差分
  const clearAccs = () => page.evaluate(() => {
    const g = window.__swGame;
    for (let i = 40; i < 46; i++) g.player.inv.slots[i] = null;
  });
  const putAccs = () => page.evaluate(() => {
    const g = window.__swGame;
    const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
    const it = window.__swItems ?? {};
    [17, 18, 393, 3119, 3099, 3084].forEach((vid, i) => {
      const k = vk[vid]; if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 };
    });
  });
  clearAccs(); await sleep(500);
  await page.evaluate(() => { window.__rb2 = { fills: 0, draw5: 0, frames0: window.__swGame.renderer.animTick }; });
  await sleep(600);
  const base = await page.evaluate(() => ({ draw5: window.__rb2.draw5, fills: window.__rb2.fills, frames: window.__swGame.renderer.animTick - window.__rb2.frames0 }));
  putAccs(); await sleep(600);
  await page.evaluate(() => {
    window.__rb2.draw5 = 0; window.__rb2.fills = 0; window.__rb2.frames0 = window.__swGame.renderer.animTick;
    window.__rb2.rows = window.__swGame.renderer.infoAccs.state.rows.map((r) => r.text);
  });
  await sleep(1000);
  const live = await page.evaluate(() => ({ draw5: window.__rb2.draw5, fills: window.__rb2.fills, frames: window.__swGame.renderer.animTick - window.__rb2.frames0, rows: window.__rb2.rows.length }));
  const rows = live.rows || 1;
  const perRow = (live.draw5 - base.draw5 * (live.frames / Math.max(1, base.frames))) / (live.frames * rows);
  check("E2'-1 信息行零 fillText(烘焙生效,关图态)", live.fills === 0, JSON.stringify({ fills: live.fills, rows: live.rows }));
  note("E2'-2 基线扣除后每帧每行烘焙 drawImage(期望≈2)", `base=${base.draw5}/${base.frames}f live=${live.draw5}/${live.frames}f rows=${rows} → ${perRow.toFixed(2)}`);
  check("E2'-2 每行恰 2 次位图绘制(无双调用)", perRow > 1.5 && perRow < 2.6, perRow.toFixed(2));

  // E3'-c 缓存 churn:移动玩家,app 实例(经探针实例无法读 app 缓存→改用 fillText 零+churn 间接?直接读
  //  同一 URL 的模块——若 urls 显示带 query 的 app 实例则改读该实例)
  const appInst = await page.evaluate(async (instUrls) => {
    const alt = (instUrls ?? []).find((u) => !u.endsWith('/src/vui/draw/MouseTextBake.ts'));
    const mApp = alt ? await import(alt) : await import('/src/vui/draw/MouseTextBake.ts');
    return { usedUrl: alt ?? '/src/vui/draw/MouseTextBake.ts', count0: mApp.bakeStats().count };
  }, inst.urls);
  note("E3'-c app 侧缓存实例", JSON.stringify(appInst));
  const churn = await page.evaluate(async (count0) => {
    const m = await (async () => {
      const urls = performance.getEntriesByType('resource').map((e) => e.name).filter((u) => u.includes('MouseTextBake'));
      const alt = urls.find((u) => !u.endsWith('/src/vui/draw/MouseTextBake.ts'));
      return alt ? import(alt) : import('/src/vui/draw/MouseTextBake.ts');
    })();
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
    return { count0, max: Math.max(...traj), last: traj[traj.length - 1], clears, head: traj.slice(0, 6) };
  }, appInst.count0);
  note("E3'-c 2s 移动期缓存轨迹(app 实例)", JSON.stringify(churn));
  check("E3'-c 缓存非空且增长(动态行逐帧入键)", churn.count0 > 0 && churn.max > churn.count0, JSON.stringify(churn));
  check("E3'-c 有界(churn.max≤512 且全清次数≤20)", churn.max <= 512 && churn.clears <= 20, `max=${churn.max} clears=${churn.clears}`);
  await hygiene();
}

check('全程零页面异常', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
