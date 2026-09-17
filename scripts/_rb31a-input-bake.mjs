// ★RB31a 红队取证探针(2026-09-16)——输入/呈现域未审修复本体:
//  A. RB30a MED-1/MINOR-3 updateUse 住房分支 fullMap 门+开图清携带(三入口/死亡/assign)
//  B. RB30a MED-2 drawFullMap 关图复位 mapDragging/lastMouse(按住关图重开无跳变)
//  C. RB30a MINOR-4 高尔夫 delayUseItem 门(开瞄沿压制/无旗不误吞)
//  D. RB30a MINOR-5 HousingPanel.loop→refresh 每帧化(降级链/事件风暴/帧成本)
//  E. FX57 MouseTextBake(烘焙生效/回退闪烁/双调用/缓存churn/215钳制/二值性)
//  F. 衣柜面板 pointer-events auto+domTargets(开拦/关释放/分离门/世界不误拦)
// 跑法:SW_ORIGIN=http://localhost:5264 node tools/run-diag.mjs scripts/_rb31a-input-bake.mjs
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

// ---- 公共:平地 rig ----
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

// ================= A. RB30a MED-1/MINOR-3:fullMap 门+开图清携带 =================
{
  await makeFlat(); await placePlayer(200); await sleep(300);
  // 间谍:cb.onHousingCursor + housingQuery/housingAssign
  await page.evaluate(() => {
    const g = window.__swGame;
    g.__rb = { cursorCalls: [], queryCalls: 0, assignCalls: 0 };
    const orig = g.cb.onHousingCursor?.bind(g.cb);
    g.cb.onHousingCursor = (m, kp) => { g.__rb.cursorCalls.push([m ? m.kind : null, !!kp]); orig?.(m, kp); };
    const oq = g.housingQuery.bind(g), oa = g.housingAssign.bind(g);
    g.housingQuery = (...a) => { g.__rb.queryCalls++; return oq(...a); };
    g.housingAssign = (...a) => { g.__rb.assignCalls++; return oa(...a); };
  });
  // A1 query 态开图(M 键入口=toggleFullMap)→ 清携带 + keepPanel=true
  await page.evaluate(() => { const g = window.__swGame; g.housingMode = { kind: 'query' }; g.toggleFullMap(); });
  await ticks(4);
  let s = await page.evaluate(() => ({ open: window.__swGame.renderer.fullMap.open, hm: window.__swGame.housingMode, rb: window.__swGame.__rb }));
  check('A1 query 开图(M 入口)→携带清+housingMode=null', s.open && s.hm === null, JSON.stringify({ hm: s.hm, cursorCalls: s.rb.cursorCalls }));
  check('A1 清携带走 onHousingCursor(null,keepPanel=true)', s.rb.cursorCalls.some((c) => c[0] === null && c[1] === true), JSON.stringify(s.rb.cursorCalls));
  // A2 地图开着时左键不消费住房查询(不开新查询)
  await page.evaluate(() => {
    const g = window.__swGame;
    g.__rb.queryCalls = 0; g.__rb.cursorCalls.length = 0;
    g.housingMode = { kind: 'query' };
    g.input.mouseX = 640; g.input.mouseY = 300;   // 地图视口内世界坐标随缘
  });
  await page.mouse.move(640, 300); await page.mouse.down(); await ticks(3); await page.mouse.up();
  s = await page.evaluate(() => ({ hm: window.__swGame.housingMode, rb: window.__swGame.__rb, md: window.__swGame.input.mouseDown }));
  check('A2 地图开着时左键沿零住房查询(med-1 吞消费)', s.rb.queryCalls === 0, JSON.stringify({ q: s.rb.queryCalls, hm: s.hm?.kind ?? null }));
  check('A2 携带仍被开图门清(每帧覆盖)', s.hm === null, `hm=${JSON.stringify(s.hm)}`);
  // A3 晶塔式入口(fm.open 直置,不经过 toggleFullMap)同清
  await page.evaluate(() => { const g = window.__swGame; g.renderer.fullMap.open = false; g.housingMode = { kind: 'assign', npcKey: 'no-such' }; });
  await ticks(1);
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = true; });
  await ticks(3);
  s = await page.evaluate(() => ({ hm: window.__swGame.housingMode, open: window.__swGame.renderer.fullMap.open, rb: window.__swGame.__rb }));
  check('A3 直置入口(fm.open=true,晶塔/虫洞同构)→携带清', !s.open || s.hm === null, JSON.stringify({ hm: s.hm?.kind ?? null, calls: s.rb.cursorCalls.length }));
  // A4 死亡+开图+携带:updateUse 死亡期照跑否?(跑=清,不跑=清不掉=洞)
  await page.evaluate(() => { const g = window.__swGame; g.renderer.fullMap.open = false; });
  await ticks(2);
  await page.evaluate(() => {
    const g = window.__swGame, p = g.player;
    p.dead = true; p.respawnTimer = 600; p.deadTime = 100; g.housingMode = { kind: 'query' }; g.renderer.fullMap.open = true;
  });
  await ticks(4);
  s = await page.evaluate(() => ({ hm: window.__swGame.housingMode, dead: window.__swGame.player.dead, rb: window.__swGame.__rb }));
  check('A4 死亡态开图携带仍清(updateUse 死亡期可达)', s.hm === null, JSON.stringify({ hm: s.hm?.kind ?? null, cursorCalls: s.rb.cursorCalls.slice(-3) }));
  await page.evaluate(() => { const g = window.__swGame; g.renderer.fullMap.open = false; g.player.dead = false; g.player.respawnTimer = 0; g.housingMode = null; });
  await ticks(2);
  // A5 关包链:closeInventory 清 housingMode(UI.ts:2882 与 RB30a 同域复核)
  await page.evaluate(() => { const g = window.__swGame; g.housingMode = { kind: 'query' }; window.__swUI.closeInventory(); });
  await ticks(2);
  s = await page.evaluate(() => window.__swGame.housingMode);
  check('A5 closeInventory 收包链清住房携带', s === null, `hm=${JSON.stringify(s)}`);
}

// ================= B. RB30a MED-2:关图复位拖拽态 =================
{
  await placePlayer(300); await sleep(200);
  const dragState = () => page.evaluate(() => { const r = window.__swGame.renderer; return { md: r.mapDragging, lm: r.lastMouse, panX: r.fullMap.panX, open: r.fullMap.open }; });
  // 开图→按住拖拽→按住关图(M 同构 toggleFullMap)→断言复位
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(3);
  await page.mouse.move(640, 400);
  await page.mouse.down();
  await page.mouse.move(560, 400, { steps: 6 });   // 向左拖 80px
  await ticks(2);
  let d = await dragState();
  const panBefore = d.panX;
  check('B1 开图按住拖拽生效(mapDragging=true+pan 位移)', d.md === true && d.panX !== 0, JSON.stringify(d));
  // 按住期间关图
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(4);
  d = await dragState();
  check('B2 按住关图→mapDragging=false+lastMouse 复位(med-2 本体)', !d.open && d.md === false && d.lm.x === 0 && d.lm.y === 0, JSON.stringify(d));
  // 按住不放重开→移动 60px:pan 增量应≈60(无陈旧 dx 跳变)
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(3);
  await page.mouse.move(600, 400);
  await page.mouse.move(660, 400, { steps: 4 });   // +60px
  await ticks(2);
  d = await dragState();
  const delta = d.panX - panBefore;
  check('B3 重开首段拖拽无跳变(pan 增量≈本轮位移 60px,方向负)', delta < -20 && delta > -140, `panΔ=${delta}(期望≈-60)`);
  await page.mouse.up();
  // B4 直置关闭(晶塔/虫洞 release 帧关图同构)也复位
  await page.evaluate(() => { const g = window.__swGame; const r = g.renderer; r.mapDragging = true; r.lastMouse = { x: 111, y: 222 }; r.fullMap.open = false; });
  await ticks(4);
  d = await dragState();
  check('B4 fm.open=false 直置关图路径同复位', d.md === false && d.lm.x === 0 && d.lm.y === 0, JSON.stringify(d));
  // B5 缩放中关图重开:zoom 目标不炸(观察)
  await page.evaluate(() => { const g = window.__swGame; g.renderer.fullMap.zoomTarget = 2; g.toggleFullMap(); });
  await ticks(2);
  await page.evaluate(() => { const g = window.__swGame; g.renderer.fullMap.zoomTarget = 3.2; });
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(2);
  await page.evaluate(() => window.__swGame.toggleFullMap());
  await ticks(6);
  const zoom = await page.evaluate(() => { const f = window.__swGame.renderer.fullMap; return { zoom: +f.zoom.toFixed(3), zt: f.zoomTarget, open: f.open }; });
  note('B5 缩放中关图重开 zoom 收敛观察', JSON.stringify(zoom));
  check('B5 重开后 zoom 缓动趋向 zoomTarget(有限值)', Number.isFinite(zoom.zoom) && Math.abs(zoom.zoom - zoom.zt) < 1.5, JSON.stringify(zoom));
}

// ================= C. RB30a MINOR-4:高尔夫 delayUseItem 门 =================
{
  await makeFlat(); await placePlayer(220); await sleep(300);
  const clubKey = await page.evaluate(() => {
    const g = window.__swGame;
    const defs = window.__swITEMS ?? [];
    const def = defs.find((d) => d && typeof d.key === 'string' && /^vi_409[2-5]_/.test(d.key));
    if (!def) return null;
    g.player.inv.slots[0] = { id: def.id ?? defs.indexOf(def), stack: 1 };
    g.player.inv.selected = 0;
    return def.key;
  });
  check('C0 高尔夫球杆在手', !!clubKey, clubKey ?? 'no vi_409x def');
  if (clubKey) {
    await page.mouse.move(640, 300);
    // C1 旗存续(delayUseItem=true)+mouseDown 电平 → 开瞄沿被压制
    await page.evaluate(() => { const i = window.__swGame.input; i.delayUseItem = true; i.mouseDown = true; i.mouseHeld = true; });
    await ticks(6);
    let st = await page.evaluate(() => ({ aim: window.__swGame.golfAim, flag: window.__swGame.input.delayUseItem }));
    check('C1 旗存续期按杆不开瞄(delayUseItem 压制)', !st.aim, JSON.stringify(st));
    // C2 无旗同电平 → 开瞄(门不误吞)
    await page.evaluate(() => { window.__swGame.input.delayUseItem = false; });
    await ticks(4);
    st = await page.evaluate(() => ({ aim: window.__swGame.golfAim }));
    check('C2 无旗同电平照常开瞄(门不误吞)', st.aim === true, JSON.stringify(st));
    // C3 瞄准期旗掉 → 走松手击球支(登记:channel 掉同相=击球,非吞)
    await page.evaluate(() => { const g = window.__swGame; g.input.delayUseItem = true; });
    await ticks(4);
    st = await page.evaluate(() => ({ aim: window.__swGame.golfAim, ut: window.__swGame.player.useTime, power: !!window.__swGame.renderer.golfPower }));
    note('C3 旗存续期瞄准臂让位行为(登记=击球同相)', JSON.stringify(st));
    await page.evaluate(() => { const i = window.__swGame.input; i.mouseDown = false; i.mouseHeld = false; i.delayUseItem = false; });
    await ticks(4);
  }
}

// ================= D. RB30a MINOR-5:HousingPanel 每帧 refresh =================
{
  await placePlayer(240); await sleep(200);
  // 开住房面板(背包房屋按钮链 → mainFlow.openHousing)
  const opened = await page.evaluate(async () => {
    const ui = window.__swUI;
    if (typeof ui?.onHousing === 'function') { ui.onHousing(); }
    else {
      // 兜底:动态 import mainFlow 不可行,直接找按钮
      const b = [...document.querySelectorAll('[data-act]')].find((e) => e.dataset.act === 'housing');
      b?.click();
    }
    for (let i = 0; i < 60; i++) {
      if (window.__swHousingPanel) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return !!window.__swHousingPanel;
  });
  check('D0 住房面板挂载(__swHousingPanel)', opened);
  if (opened) {
    // 计数 refresh/draw/每帧 onCursor 风暴
    const cnt = await page.evaluate(async () => {
      const p = window.__swHousingPanel;
      const oR = p.refresh.bind(p), oD = p.draw.bind(p);
      let r = 0, d = 0, t = 0, maxMs = 0;
      p.refresh = (...a) => { const t0 = performance.now(); oR(...a); const ms = performance.now() - t0; t += ms; maxMs = Math.max(maxMs, ms); r++; };
      p.draw = () => { d++; oD(); };
      await new Promise((res) => setTimeout(res, 1000));
      return { refresh: r, draw: d, avgMs: +(t / Math.max(1, r)).toFixed(3), maxMs: +maxMs.toFixed(3) };
    });
    check('D1 refresh 每界面帧现刷(≥30/s,原版 DrawNPCHousesInUI 同相)', cnt.refresh >= 30, JSON.stringify(cnt));
    note('D1 单次 refresh 帧成本', `avg=${cnt.avgMs}ms max=${cnt.maxMs}ms`);
    // 携带 NPC 离场 → 每帧降级链(MINOR-5 双通道:Game.updateUse+panel.refresh,应恰好收敛无风暴)
    const down = await page.evaluate(async () => {
      const g = window.__swGame, p = window.__swHousingPanel;
      const npc = g.entities.npcs.find((n) => n.npcKey && !n.dead);
      if (!npc) return { ok: false, why: 'no town npc' };
      const key = npc.npcKey;
      const before = { hm: g.housingMode?.kind ?? null };
      let cursorCalls = 0;
      const orig = g.cb.onHousingCursor;
      g.cb.onHousingCursor = (m, kp) => { cursorCalls++; orig?.(m, kp); };
      // 面板选 NPC(直接走 setCursor 同款)
      p.setCursor({ kind: 'assign', npcKey: key });
      const picked = g.housingMode?.kind;
      npc.dead = true;                       // 离场
      await new Promise((res) => setTimeout(res, 500));   // ~30 帧窗
      return { ok: true, key, before, picked, now: g.housingMode?.kind ?? null, cursorCalls };
    });
    check('D2 携带 NPC 死亡→半秒内降级 query(MINOR-5 每帧链)', down.ok && down.picked === 'assign' && down.now === 'query',
      JSON.stringify(down.ok ? { picked: down.picked, now: down.now, cbCalls: down.cursorCalls } : down));
    check('D3 降级零事件风暴(cb.onHousingCursor 调用≤3/半秒)', down.ok && down.cursorCalls <= 3, `calls=${down.cursorCalls}`);
    await page.evaluate(() => window.__swHousingPanel?.destroy());
    await ticks(2);
  }
}

// ================= E. FX57 MouseTextBake =================
{
  // 入包信息族(同 _fx57 探针)
  await page.evaluate(() => {
    const g = window.__swGame;
    const vk = window.__swVANILLA_ITEM_KEY_BY_ID ?? {};
    const it = window.__swItems ?? {};
    [17, 18, 393, 3119, 3099, 3084].forEach((vid, i) => {
      const k = vk[vid]; if (k && it[k]) g.player.inv.slots[40 + i] = { id: it[k], stack: 1 };
    });
  });
  await sleep(600);
  const rows = await page.evaluate(() => window.__swGame.renderer.infoAccs.state.rows.map((r) => r.text));
  check('E0 信息行渲染中', rows.length >= 3, JSON.stringify(rows.slice(0, 6)));

  // E1 烘焙管线常量+生效
  const bake = await page.evaluate(async () => {
    const m = await import('/src/vui/draw/MouseTextBake.ts');
    return { stats: m.bakeStats(), ready: (await import('/src/vui/draw/PixelText.ts')).PixelText.ready };
  });
  check('E1 烘焙管线:字体就绪+outline=1+upscale=14/12', bake.ready && bake.stats.outline === 1 && Math.abs(bake.stats.upscale - 14 / 12) < 1e-9,
    JSON.stringify(bake));

  // E2 行文本零 fillText(烘焙生效,无回退闪烁)+ 每帧双 drawImage(sil+染mask)
  await page.evaluate(() => {
    window.__rb57 = { fills: 0, draw5: 0 };
    const of = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, x, y) {
      if (window.__rb57Rows?.includes(String(s))) window.__rb57.fills++;
      return of.call(this, s, x, y);
    };
    const od = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function (img, a, b, c, d, ...rest) {
      if (a !== undefined && d !== undefined && rest.length === 0 && img instanceof HTMLCanvasElement) window.__rb57.draw5++;
      return od.call(this, img, a, b, c, d, ...rest);
    };
    window.__rb57Rows = window.__swGame.renderer.infoAccs.state.rows.map((r) => r.text);
  });
  await sleep(1000);
  const live = await page.evaluate(() => {
    const frames = window.__swGame.renderer.animTick;
    return { fills: window.__rb57.fills, draw5: window.__rb57.draw5, frames, rows: window.__rb57Rows.length };
  });
  check('E2 1s 窗信息行零 fillText(回退未触发/无闪烁)', live.fills === 0, JSON.stringify(live));
  const perFrame = live.rows > 0 ? live.draw5 / 60 / live.rows : -1;
  note('E2 每帧每行烘焙位图 drawImage(期望≈2:剪影+染色)', `draw5=${live.draw5} frames≈60 rows=${live.rows} → ${perFrame.toFixed(2)}`);
  check('E2 每行恰 2 次位图 drawImage(无双调用/无漏)', perFrame > 1.2 && perFrame < 3.2, perFrame.toFixed(2));

  // E3 缓存 churn:移动玩家(罗盘/深度行逐帧变文本)观察 cache.size 轨迹
  const churn = await page.evaluate(async () => {
    const m = await import('/src/vui/draw/MouseTextBake.ts');
    const g = window.__swGame;
    const traj = [];
    let rebaked = 0;
    const t0 = performance.now();
    const iv = setInterval(() => { g.player.x += 20; }, 33);   // ≈2 tile/帧 罗盘逐帧新串
    while (performance.now() - t0 < 2000) {
      const c0 = m.bakeStats().count;
      await new Promise((r) => setTimeout(r, 100));
      const c1 = m.bakeStats().count;
      if (c1 < c0) rebaked++;                     // 全清(≥cap 或别的清端)
      traj.push(c1);
    }
    clearInterval(iv);
    return { max: Math.max(...traj), last: traj[traj.length - 1], clears: rebaked, traj: traj.slice(0, 8) };
  });
  note('E3 缓存轨迹(2s 移动期)', JSON.stringify(churn));
  check('E3 缓存有界(cap=512)', churn.max <= 512, `max=${churn.max}`);
  check('E3 动态行文本未逐帧全清缓存(clears 少=静态行不被驱逐', churn.clears <= 20, `clears=${churn.clears}`);

  // E4 215 钳制行:烘焙 vs 旧直绘 A/B(墨宽/二值性/位移)
  const ab = await page.evaluate(() => {
    const g = window.__swGame;
    const W = 520, H = 400, X = W - 280, Y = -32, pitch = 22;
    const long = '矿脉示踪: 极 long label —— 铂金矿×3 钨金矿×4 银矿×6 铁矿×8 铜矿×10 锡矿×12 铅矿×14 '.repeat(2);
    const infoCtx = {
      gates: { accWatch: 3, accDepthMeter: 3, accCompass: 3, accOreFinder: true },
      mainTime: 27000, dayTime: true,
      weather: { storming: false, maxRaining: 0, cloudBGActive: 0, numClouds: 0, windSpeedCurrent: 2, sandstorm: false, globalTimeSec: 0 },
      moonPhase: 0, bloodMoon: false, eclipse: false,
      fishingText: null, oreText: long, rareText: null, rareVid: null,
      enemyCount: 0, killText: null, dps: -1, mph: 42,
      centerX: 2100, bottomY: 331 * 16, worldSurface: 331, rockLevel: 427, maxTilesX: 4200, maxTilesY: 1200,
    };
    const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; return cv; };
    const newCv = mk(), oldCv = mk();
    const nctx = newCv.getContext('2d');
    nctx.fillStyle = '#fff'; nctx.fillRect(0, 0, W, H);
    const nRows = g.renderer.infoAccs.draw(nctx, W, H, infoCtx, [], false, false, -1, 0, 0, () => {});
    const drawn = g.renderer.infoAccs.state.rows.map((r) => r.text);
    const octx = oldCv.getContext('2d');
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, W, H);
    octx.imageSmoothingEnabled = false;
    octx.textAlign = 'left'; octx.textBaseline = 'middle';
    octx.font = '14px "Fusion Pixel 12px", monospace';
    drawn.forEach((text, i) => {
      const ty = Y + 74 + pitch * i + 48;
      const w = octx.measureText(text).width;
      let scaleX = 1; if (w > 215) scaleX = 215 / w;
      let scaleY = 1; if (scaleX < 0.58) scaleY = 1 - scaleX / 3;
      octx.save();
      octx.translate(X + 20, ty); octx.scale(scaleX, scaleY);
      for (const [ox, oy] of [[2, 0], [-2, 0], [0, 2], [0, -2]]) { octx.fillStyle = '#000'; octx.fillText(text, ox, oy); }
      octx.fillStyle = '#e8e4f0'; octx.fillText(text, 0, 0);
      octx.restore();
    });
    // 墨宽(行带内非白列跨度)+ 软边计数(非调色板像素)
    const ink = (cv, ty) => {
      const d = cv.getContext('2d').getImageData(X + 8, ty - 11, 232, 22).data;
      let l = 1e9, rr = -1, soft = 0;
      for (let y = 0; y < 22; y++) for (let x = 0; x < 232; x++) {
        const p = (y * 232 + x) * 4;
        const isBg = d[p] > 246 && d[p + 1] > 246 && d[p + 2] > 246;
        if (!isBg) { l = Math.min(l, x); rr = Math.max(rr, x); }
        const lum = (d[p] + d[p + 1] + d[p + 2]) / 3;
        if (!isBg && lum > 40 && lum < 215 && d[p] === d[p + 1] && d[p + 1] === d[p + 2]) soft++;   // 灰阶过渡
      }
      return { l, r: rr, w: rr < 0 ? 0 : rr - l + 1, soft };
    };
    const tyOre = Y + 74 + pitch * drawn.findIndex((t) => t.includes('矿脉示踪')) + 48;
    const a = ink(oldCv, tyOre), b = ink(newCv, tyOre);
    return { nRows, rows: drawn.map((t) => t.slice(0, 8)), tyOre, a, b };
  });
  check('E4 长行行存在(oreText 注入)', ab.rows.some(() => true) && Number.isFinite(ab.tyOre), JSON.stringify(ab.rows));
  note('E4 215 钳制行墨宽 旧直绘 vs 烘焙', JSON.stringify({ old: ab.a, neu: ab.b }));
  check('E4 烘焙墨宽与旧直绘偏差 ≤4px(钳制域零漂移)', Math.abs(ab.a.w - ab.b.w) <= 4, `Δ=${Math.abs(ab.a.w - ab.b.w)}`);
  check('E4 烘焙行灰阶软边 ≈0(二值性)', ab.b.soft <= 8, `soft=${ab.b.soft} (旧直绘=${ab.a.soft})`);
  await page.evaluate(() => { window.__swGame.player.x -= 0; });

  // E5 悬停标签(drawMouseTextLayer)走烘焙:标签文本 fillText=0
  const rect = await page.evaluate(() => {
    const r = window.__swGame.renderer.infoAccs.state.iconRects[0];
    return r ? { x: r.x, y: r.y } : null;
  });
  if (rect) {
    await page.mouse.move(rect.x + 5, rect.y + 5);
    await sleep(400);
    await page.evaluate(() => { window.__rb57Rows = [window.__swGame.player.cursorItemIconText].filter(Boolean); window.__rb57.fills = 0; });
    await sleep(300);
    const lab = await page.evaluate(() => ({ text: window.__swGame.player.cursorItemIconText, fills: window.__rb57.fills }));
    check('E5 悬停行标签走烘焙(标签 fillText=0)', lab.text !== '' && lab.fills === 0, JSON.stringify(lab));
    await page.mouse.move(300, 600);
    await sleep(200);
  }
}

// ================= F. 衣柜面板 pointer-events auto + domTargets =================
{
  await placePlayer(260); await sleep(200);
  const open = await page.evaluate(() => {
    const g = window.__swGame;
    g.cb.onClothesWindow?.(g.player.appearance);
    const p = document.querySelector('.sw-char-panel');
    if (!p) return { opened: false };
    const r = p.getBoundingClientRect();
    return { opened: true, pe: getComputedStyle(p).pointerEvents, parent: p.parentElement?.className,
      rect: { x: r.x, y: r.y, w: r.width, h: r.height } };
  });
  check('F0 更衣窗挂载+pointer-events=auto', open.opened && open.pe === 'auto', JSON.stringify(open));
  // F1 面板开着:面板中心 inpOverDomUi=真(世界悬停面被拦)
  const f1 = await page.evaluate(() => {
    const g = window.__swGame;
    const p = document.querySelector('.sw-char-panel');
    const r = p.getBoundingClientRect();
    g.input.mouseX = r.x + r.width / 2 - (g.input.canvasRectLeft ?? 0);
    g.input.mouseY = r.y + r.height / 2 - (g.input.canvasRectTop ?? 0);
    // 直接触发一次 elementFromPoint 路径:绕 30t 快照(直接打满 tickCache 不可行→用 window 事件流验证 mousedown 门)
    return { mx: g.input.mouseX, my: g.input.mouseY };
  });
  // F1 真实 mousedown 在面板上:input.mouseDown 不得置位(Input 门 isDomUiTarget)
  const cxp = await page.evaluate(() => {
    const r = document.querySelector('.sw-char-panel').getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.move(cxp.x, cxp.y);
  await page.mouse.down(); await sleep(80);
  const f1b = await page.evaluate(() => ({ md: window.__swGame.input.mouseDown, mh: window.__swGame.input.mouseHeld }));
  await page.mouse.up(); await sleep(80);
  check('F1 面板上按压零世界输入(mouseDown 不置位)', !f1b.md && !f1b.mh, JSON.stringify(f1b));
  // F2 面板开着:面板外世界区域点击照常世界输入(不过度拦截)
  await page.evaluate(() => { const g = window.__swGame; g.player.inv.slots[0] = null; g.player.inv.selected = 0; });
  await page.mouse.move(200, 650);   // 面板外
  await page.mouse.down(); await sleep(100);
  const f2 = await page.evaluate(() => ({ md: window.__swGame.input.mouseDown, ut: window.__swGame.player.useTime }));
  await page.mouse.up(); await sleep(60);
  check('F2 面板开着世界区域输入不误拦', f2.md, JSON.stringify(f2));
  // F3 分离子树门(detached target closest 命中 .sw-char-panel)
  const f3 = await page.evaluate(async () => {
    const { isDomUiTarget } = await import('/src/core/input/domTargets.ts');
    const p = document.querySelector('.sw-char-panel');
    const clone = p.cloneNode(true);
    document.body.appendChild(clone);
    const btn = clone.querySelector('[data-act=back]');
    let cap = null;
    const onMd = (e) => { cap = { dom: isDomUiTarget(e.target), root: !!e.target.closest?.('.sw-root'), panel: !!e.target.closest?.('.sw-char-panel') }; };
    window.addEventListener('mousedown', onMd, { once: true });
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clone.remove();
    return cap;
  });
  check('F3 分离态按钮 target 判 UI(domTargets 补录生效)', f3?.dom === true && f3?.panel === true, JSON.stringify(f3));
  // F4 真实点击取消 → 面板关 + 关后世界输入释放(点击世界照常置位)
  const cancel = await page.evaluate(() => {
    const b = document.querySelector('.sw-char-panel [data-act=back]');
    const r = b.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  });
  await page.mouse.click(cancel.x, cancel.y);
  await sleep(200);
  const f4a = await page.evaluate(() => ({ gone: !document.querySelector('.sw-char-panel'), md: window.__swGame.input.mouseDown }));
  check('F4a 取消钮关面板+未漏世界输入', f4a.gone && !f4a.md, JSON.stringify(f4a));
  await page.mouse.move(200, 650); await page.mouse.down(); await sleep(80);
  const f4b = await page.evaluate(() => ({ md: window.__swGame.input.mouseDown }));
  await page.mouse.up(); await sleep(60);
  check('F4b 关面板后世界输入释放', f4b.md === true, JSON.stringify(f4b));
}

check('全程零页面异常', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n${pass} PASS / ${fail} FAIL`);
await browser.close();
process.exit(fail ? 1 : 0);
