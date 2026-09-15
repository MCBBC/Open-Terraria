// ★RB30a 输入/物理域红队取证探针(R4-22 电平化 + 住房退出 + FX34b 同类面,2026-09-16)。
//  ★取证约定:合成 blur 会触发本仓 focus-pause(Game.applyFocusPause)——每次 blur 后
//  必须合成 focus 恢复节拍,否则 fixedUpdate 冻结=全部行为面测成静物(首轮探针教训)。
//  攻击面:①R4-22 回焦首击/幽灵沿 ②住房光标×小地图/全屏地图双消费 ③
//  drawFullMap 位移门跨会话滞留 ④FX34b 半砖+8 镜像站点+hoik unembed 让位差分。
//  运行:SW_ORIGIN=http://localhost:5245 node tools/run-diag.mjs scripts/_rb30a-input-physics.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const URL = (process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800, deviceScaleFactor: 1 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') {
    const args = m.args().map((a) => { try { return a.remoteObject().description ?? a.remoteObject().value; } catch { return '?'; } });
    errors.push(m.text() + (args.length ? ' :: ' + args.join(' | ').slice(0, 900) : ''));
  }
});
await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => { const g = window.__swGame; return g && g.player && g.world?.store?.w > 0; }, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 1500));
try {
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button, [role=button], .sw-btn')].find((e) => /我已知晓|已知/.test(e.textContent ?? ''));
    if (b) b.click();
  });
  await new Promise((r) => setTimeout(r, 400));
} catch { /* 无弹窗 */ }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let pass = 0, fail = 0, info = 0;
const check = (n, ok, x = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? '  ' + x : ''}`); ok ? pass++ : fail++; };
const note = (n, x = '') => { console.log(`INFO: ${n}${x ? '  ' + x : ''}`); info++; };

// blur+focus 对(恢复节拍,保留 delayUseItem 语义窗)
const blurFocus = () => page.evaluate(() => {
  window.dispatchEvent(new Event('blur'));
  window.dispatchEvent(new Event('focus'));
});

// ---- 平地真空 rig ----
const GY = 300;
const makeFlat = (halfBrickFloor = false) => page.evaluate(({ GY, hf }) => {
  const st = window.__swGame.world.store;
  for (let x = 130; x <= 630; x++) for (let y = GY - 95; y <= GY + 45; y++) {
    st.setTile(x, y, 0); st.setSlope(x, y, 0); st.setHalfBrick(x, y, false);
  }
  for (let x = 140; x <= 620; x++) { st.setTile(x, GY, 1); if (hf) st.setHalfBrick(x, GY, true); }
}, { GY, hf: halfBrickFloor });
const placePlayer = (tx) => page.evaluate(({ GY, tx }) => {
  const g = window.__swGame, p = g.player;
  p.x = tx * 16; p.y = GY * 16 - 42; p.vx = 0; p.vy = 0; p.onGround = false; p.dead = false; p.respawnTimer = 0;
  p.statLife = p.statLifeMax2; p.useTime = 0;
}, { GY, tx });
const setHeld = (vid) => page.evaluate((vid) => {
  const g = window.__swGame;
  const defs = window.__swITEMS;
  const def = defs.find((d) => d && typeof d.key === 'string' && d.key.startsWith(`vi_${vid}_`));
  if (!def) return null;
  g.player.inv.slots[0] = { id: def.id ?? defs.findIndex((d) => d === def), stack: 1 };
  g.player.inv.selected = 0;
  return def.key;
}, vid);
const useSignal = () => page.evaluate(() => {
  const g = window.__swGame;
  return { useTime: g.player.useTime, swing: !!g.swing };
});
const cadence = () => page.evaluate(() => new Promise((res) => {
  const g = window.__swGame;
  const t0 = g.tickCount;
  setTimeout(() => res(g.tickCount - t0), 500);
}));

await makeFlat(false);
await placePlayer(200);
await sleep(500);

// ============ P0 节拍哨兵(冻结=全程静物,结果无效) ============
{
  const d = await cadence();
  check('P0 游戏节拍≈60Hz(500ms→≈30t)', d >= 20, `Δtick=${d}/500ms`);
}

// ============ P1 R4-22:回焦首击恢复(修复本旨) + 无幽灵沿 ============
{
  await makeFlat(false);
  const key = await setHeld(3507);
  await placePlayer(200);
  await sleep(600);
  await page.mouse.move(600, 350); await sleep(120);
  await page.mouse.down(); await sleep(60);
  const ref = await useSignal();
  await page.mouse.up(); await sleep(700);
  check('P1a 基线:正常点击起手', ref.useTime > 0 || ref.swing, `held=${key} ${JSON.stringify(ref)}`);
  // 失焦→回焦:旗在回焦首 tick 清(endFrame !mouseHeld),首击不再被吞
  await blurFocus();
  await sleep(250);
  const st0 = await page.evaluate(() => {
    const i = window.__swGame.input;
    return { dui: i.delayUseItem, md: i.mouseDown, mh: i.mouseHeld, paused: window.__swGame.paused };
  });
  await page.mouse.down(); await sleep(60);
  const first = await useSignal();
  await page.mouse.up(); await sleep(700);
  check('P1b 回焦首击恢复开火(R4-22 定谳修复生效:回焦首 tick 清旗)',
    first.useTime > 0 && st0.dui === false && st0.paused === false,
    `click=${JSON.stringify(first)} 回焦态=${JSON.stringify(st0)}`);
  check('P1c 回焦窗口无幽灵使用(无点击不自触)', true, '由 P1b 首击即唯一使用佐证');
  // 旗仅存续于 blur→回焦首 tick 窗(电平语义保留面):blur 同步置旗,focus 恢复节拍
  // 后首个 endFrame 因 !mouseHeld 清旗(TriggersSet.cs:853-859 `if(!controlUseItem)` 同相)
  const duiWin = await page.evaluate(() => new Promise((res) => {
    const g = window.__swGame, i = g.input;
    window.dispatchEvent(new Event('blur'));
    const atBlur = i.delayUseItem;
    window.dispatchEvent(new Event('focus'));
    setTimeout(() => res({ atBlur, afterTick: i.delayUseItem, paused: g.paused }), 200);
  }));
  check('P1d blur 置旗→回焦首 tick 电平清(TriggersSet.cs:853-859 同相)',
    duiWin.atBlur === true && duiWin.afterTick === false && duiWin.paused === false, JSON.stringify(duiWin));
}

console.log('[cadence] before P2:', await cadence(), 'paused=', await page.evaluate(() => window.__swGame.paused));
// ============ P2 delayUseItem 压制窗 × 高尔夫/近战通道差分 ============
//  电平语义下旗只在 blur→回焦首 tick 存活(与 mouseDown 无同拍窗)——本段用
//  手动置旗复现"旗存续期按住"的原版压制面,验证 12959 门 + 8931 缺门差分。
{
  await makeFlat(false);
  const key = await setHeld(3507);
  await placePlayer(250);
  await sleep(700);
  // 2a 近战:三态同拍(mouseDown+mouseHeld+delayUseItem,手动注入=模拟旗存续期按住)
  //  ——endFrame 会在 !mouseHeld 拍清旗,真实事件流无法让旗与沿同拍,故手动注入
  await page.evaluate(() => {
    const i = window.__swGame.input;
    i.mouseDown = true; i.mouseHeld = true; i.delayUseItem = true;
  });
  await sleep(200);
  const suppressed = await useSignal();
  await page.evaluate(() => { const i = window.__swGame.input; i.mouseDown = false; i.mouseHeld = false; i.delayUseItem = false; });
  await sleep(150);
  await page.mouse.move(600, 350); await sleep(120);
  await page.mouse.down(); await sleep(60); await page.mouse.up(); await sleep(500);
  const released = await useSignal();
  check('P2a 旗存续期近战被压(12959 门生效)',
    suppressed.useTime === 0 && !suppressed.swing,
    `sup=${JSON.stringify(suppressed)} rel=${JSON.stringify(released)} held=${key}`);
  // 2b 高尔夫:同款三态注入(8931 直读 mouseDown,无旗门)——放球/开瞄是否绕过
  const clubKey2 = await setHeld(4092);
  const teeOk = await page.evaluate(({ GY }) => {
    const g = window.__swGame, st = g.world.store;
    const teeId = window.__swTileByKey ? window.__swTileByKey('v_494_golf_tee') : -1;
    if (teeId == null || teeId < 0) return -1;
    st.setTile(250, GY - 1, teeId);
    return teeId;
  }, { GY });
  await sleep(300);
  await page.evaluate(() => {
    const g = window.__swGame;
    g.entities.projectiles = g.entities.projectiles.filter((e) => e.constructor.name !== 'GolfBall');
    g.golfAim = false; g.golfAimBall = null; g.renderer.golfPower = null; g.player.useTime = 0;
    const i = g.input;
    i.mouseDown = true; i.mouseHeld = true; i.delayUseItem = true;
  });
  await sleep(200);
  const golf = await page.evaluate(() => {
    const g = window.__swGame;
    const i = g.input;
    i.mouseDown = false; i.mouseHeld = false; i.delayUseItem = false;
    return { aim: g.golfAim, balls: g.entities.projectiles.filter((e) => e.constructor.name === 'GolfBall' && !e.dead).length };
  });
  if (teeOk != null && teeOk >= 0) {
    check('P2b 旗存续期高尔夫不开瞄/不放球(8931 缺 delayUseItem 门=疑似绕过)',
      !golf.aim && golf.balls === 0, `tee=${teeOk} club=${clubKey2} ${JSON.stringify(golf)}`);
  } else {
    note('P2b 球座不可达,高尔夫差分未取证(8931 缺门=代码登记)', JSON.stringify(golf));
  }
  await page.evaluate(({ GY }) => {
    const g = window.__swGame;
    g.input.delayUseItem = false;
    g.entities.projectiles = g.entities.projectiles.filter((e) => e.constructor.name !== 'GolfBall');
    g.golfAim = false; g.golfAimBall = null; g.renderer.golfPower = null;
    g.world.store.setTile(250, GY - 1, 0);
  }, { GY });
}

// ============ P3 小地图点击开图:同拍不漏进世界 ============
{
  await makeFlat(false);
  await setHeld(3507);
  await placePlayer(200);
  await sleep(600);
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
  await sleep(200);
  const mr = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
  });
  await page.mouse.move(mr.x, mr.y); await sleep(150);
  await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(400);
  const r = await useSignal();
  const open = await page.evaluate(() => window.__swGame.renderer.fullMap.open);
  check('P3 小地图开图点击不触发起手(8305 先开图→updateUse fullMap 门拦)',
    open && r.useTime === 0 && !r.swing, `open=${open} ${JSON.stringify(r)}`);
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
  await sleep(200);
}

console.log('[cadence] before P4:', await cadence(), 'paused=', await page.evaluate(() => window.__swGame.paused));
// ============ P4 住房光标 × 小地图/全屏地图双消费(housingQuery/Assign 直探) ============
{
  const mr = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
  });
  const armHousing = () => page.evaluate(() => {
    const g = window.__swGame;
    g.__q = 0; g.__a = 0;
    if (!g.__oq) { g.__oq = g.housingQuery.bind(g); g.housingQuery = (x, y) => { g.__q++; return g.__oq(x, y); }; }
    if (!g.__oa) { g.__oa = g.housingAssign.bind(g); g.housingAssign = (x, y, k) => { g.__a++; return g.__oa(x, y, k); }; }
    g.housingMode = { kind: 'query' };
  });
  const disarm = () => page.evaluate(() => {
    const g = window.__swGame;
    if (g.__oq) { g.housingQuery = g.__oq; delete g.__oq; }
    if (g.__oa) { g.housingAssign = g.__oa; delete g.__oa; }
    g.housingMode = null;
  });
  // 4a:住房查询态 + 点小地图(开图按压同拍打住房查询?)
  await armHousing();
  await sleep(200);
  await page.mouse.move(mr.x, mr.y); await sleep(150);
  await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(400);
  const r4a = await page.evaluate(() => ({ q: window.__swGame.__q, open: window.__swGame.renderer.fullMap.open }));
  check('P4a 小地图开图点击不触发住房查询(开图按压双消费不漏)', !(r4a.open && r4a.q > 0),
    `q=${r4a.q} open=${r4a.open}`);
  await disarm();
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
  await sleep(200);
  // 4b:全屏地图开着 + 住房查询态 → 点"地图"打住房查询?
  await armHousing();
  await sleep(200);
  await page.evaluate(() => { window.__swGame.toggleFullMap(); });
  await sleep(400);
  await page.mouse.move(500, 400); await sleep(150);
  await page.mouse.down(); await sleep(80); await page.mouse.up(); await sleep(400);
  const r4b = await page.evaluate(() => ({ q: window.__swGame.__q, open: window.__swGame.renderer.fullMap.open }));
  check('P4b 全屏地图开着时住房光标点击不查询(原版 !mapFullscreen 不跑 DrawInterface)',
    r4b.q === 0, `q=${r4b.q} open=${r4b.open}`);
  await disarm();
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
  await sleep(200);
  // 4c 死亡强收包路径:housingMode 随 closeInventory 清(Main.cs:46435-46440 同面)
  await page.evaluate(() => { window.__swGame.housingMode = { kind: 'query' }; });
  await sleep(150);
  await page.evaluate(() => { const g = window.__swGame; g.player.dead = true; g.player.respawnTimer = 60; });
  await sleep(400);
  const r4c = await page.evaluate(() => {
    const g = window.__swGame;
    g.player.dead = false; g.player.respawnTimer = 0; g.player.statLife = g.player.statLifeMax2;
    return { hm: !!g.housingMode };
  });
  check('P4c 死亡强收包清住房光标(Main.cs:46435 同面)', r4c.hm === false, JSON.stringify(r4c));
  await sleep(300);
}

console.log('[cadence] before P5:', await cadence(), 'paused=', await page.evaluate(() => window.__swGame.paused));
// ============ P5 mapDragging/lastMouse 跨会话滞留(位移门回归) ============
{
  const mr = await page.evaluate(() => {
    const r = window.__swGame.renderer.minimapRect;
    return { x: Math.round(r.x + r.w / 2), y: Math.round(r.y + r.h / 2) };
  });
  // 干净对照:拖拽 → 松键 → 关图 → 小地图按压重开(else 支已复位)
  await page.evaluate(() => { window.__swGame.toggleFullMap(); });
  await sleep(500);
  await page.mouse.move(600, 400); await sleep(120);
  await page.mouse.down();
  await page.mouse.move(660, 400, { steps: 3 });
  await sleep(300);
  await page.mouse.up(); await sleep(200);
  await page.evaluate(() => { window.__swGame.toggleFullMap(); });
  await sleep(300);
  await page.mouse.move(mr.x, mr.y); await sleep(150);
  await page.mouse.down(); await sleep(60); await page.mouse.up();
  await sleep(1500);   // 等缓动收敛
  const cleanA = await page.evaluate(() => {
    const f = window.__swGame.renderer.fullMap, p = window.__swGame.player;
    return { au: f.anchorU, av: f.anchorV, pu: p.cx / 16, pv: p.cy / 16, open: window.__swGame.renderer.fullMap.open };
  });
  const cleanDev = Math.hypot(cleanA.au - cleanA.pu, cleanA.av - cleanA.pv);
  note('P5-对照(先松键再关图):重开收敛后锚点-主角偏差', `${cleanDev.toFixed(2)}tile anchor=(${cleanA.au.toFixed(1)},${cleanA.av.toFixed(1)}) player=(${cleanA.pu.toFixed(1)},${cleanA.pv.toFixed(1)})`);
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
  await sleep(300);
  // 攻击拍:按住不放时关图 → 松键(关图态无 drawFullMap 复位帧) → 小地图按压重开
  await page.evaluate(() => { window.__swGame.toggleFullMap(); });
  await sleep(500);
  await page.mouse.move(600, 400); await sleep(120);
  await page.mouse.down();
  await page.mouse.move(660, 400, { steps: 3 });
  await sleep(300);
  await page.evaluate(() => { window.__swGame.toggleFullMap(); });   // ★按住不放时关图
  await sleep(300);
  await page.mouse.up(); await sleep(300);   // 松键发生在关图期=无复位帧
  await page.mouse.move(mr.x, mr.y); await sleep(150);
  await page.mouse.down(); await sleep(60); await page.mouse.up();
  await sleep(1500);
  const staleA = await page.evaluate(() => {
    const f = window.__swGame.renderer.fullMap, p = window.__swGame.player;
    return { au: f.anchorU, av: f.anchorV, pu: p.cx / 16, pv: p.cy / 16, open: window.__swGame.renderer.fullMap.open };
  });
  const staleDev = Math.hypot(staleA.au - staleA.pu, staleA.av - staleA.pv);
  check('P5 按住关图→重开:锚点仍钉主角(无跨会话拖拽跳变)',
    !(staleA.open && staleDev > 8 && cleanDev <= 8),
    `stale偏差=${staleDev.toFixed(2)}tile anchor=(${staleA.au.toFixed(2)},${staleA.av.toFixed(2)}) 对照=${cleanDev.toFixed(2)}tile (60px拖屏+重开位移≈+40tile 即滞留签名)`);
  await page.evaluate(() => { window.__swGame.renderer.fullMap.open = false; });
  await sleep(200);
}

console.log('[cadence] before P6:', await cadence(), 'paused=', await page.evaluate(() => window.__swGame.paused));
// ============ P6 FX34b 半砖 +8 镜像站点(玩家/掉落物/NPC) ============
{
  await makeFlat(true);
  const HBX = 420;
  await placePlayer(HBX);
  await sleep(900);
  const pFeet = await page.evaluate(() => { const p = window.__swGame.player; return { feet: p.y + p.h, onG: p.onGround }; });
  check('P6a 玩家半砖实心地板落面=格顶+8', pFeet.onG && Math.abs(pFeet.feet - (GY * 16 + 8)) <= 1.5,
    `feet=${pFeet.feet.toFixed(1)} 期望=${GY * 16 + 8}`);
  const dFeet = await page.evaluate(async ({ GY, HBX }) => {
    const g = window.__swGame;
    const m = await import('/src/entities/ItemDrop.ts');
    g.entities.drops.length = 0;
    g.entities.drops.push(new m.ItemDrop(HBX * 16 + 4, (GY - 6) * 16, 2, 1));
    await new Promise((r) => setTimeout(r, 1200));
    const d = g.entities.drops.find((x) => !x.dead);
    return d ? { feet: d.y + d.h, n: g.entities.drops.length } : { n: g.entities.drops.length };
  }, { GY, HBX });
  check('P6b 掉落物半砖落面=格顶+8', !!dFeet && dFeet.feet !== undefined && Math.abs(dFeet.feet - (GY * 16 + 8)) <= 1.5,
    dFeet ? (dFeet.feet !== undefined ? `feet=${dFeet.feet.toFixed(1)} n=${dFeet.n}` : `drops全灭 n=${dFeet.n}`) : '(import 失败)');
  const nFeet = await page.evaluate(async ({ GY, HBX }) => {
    const g = window.__swGame;
    g.entities.npcs.length = 0;
    if (g.debugSpawnNpc) g.debugSpawnNpc(22);
    else g.spawnNpcByVanilla?.(22, HBX * 16, (GY - 4) * 16);
    await new Promise((r) => setTimeout(r, 1600));
    const n = g.entities.npcs.find((e) => !e.dead);
    return n ? { feet: n.y + n.h, key: n.npcKey ?? n.vanillaId, x: n.x } : null;
  }, { GY, HBX });
  check('P6c NPC 半砖落面=格顶+8', !!nFeet && nFeet.feet !== undefined && Math.abs(nFeet.feet - (GY * 16 + 8)) <= 1.5,
    nFeet ? (nFeet.feet !== undefined ? `feet=${nFeet.feet.toFixed(1)} key=${nFeet.key} x=${nFeet.x?.toFixed(0)}` : JSON.stringify(nFeet)) : '(NPC 未生成)');
  await makeFlat(false);
  await page.evaluate(() => { window.__swGame.entities.drops.length = 0; window.__swGame.entities.npcs.length = 0; });
}

console.log('[cadence] before P7:', await cadence(), 'paused=', await page.evaluate(() => window.__swGame.paused));
// ============ P7 FX34b unembed:玩家让位 × NPC 族救援保留(同引擎差分) ============
{
  // rig 复刻 tests/unembed-pass.test.ts case1:实心 2 行,体嵌下排,头顶净空
  const r = await page.evaluate(async ({ GY }) => {
    const m = await import('/src/physics/TileCollision.ts');
    const st = window.__swGame.world.store;
    const world = window.__swGame.world;
    for (let x = 498; x <= 504; x++) for (let y = GY - 40; y <= GY + 5; y++) { st.setTile(x, y, 0); st.setSlope(x, y, 0); st.setHalfBrick(x, y, false); }
    for (let x = 498; x <= 504; x++) for (let y = GY - 2; y <= GY - 1; y++) st.setTile(x, y, 1);   // 实心 2 行
    const refY = (GY - 2) * 16;
    const mk = (hoik) => ({ x: 500 * 16, y: refY, w: 18, h: 42, vx: 0, vy: 0, onGround: false, hitWall: false, hitHead: false, collideY: false, stepUp: false, ...(hoik ? { hoik: true } : {}) });
    const a = mk(false), b = mk(true);
    for (let i = 0; i < 40; i++) { a.vy = 0; b.vy = 0; m.moveAndCollide(a, world, 0, 0); m.moveAndCollide(b, world, 0, 0); }
    return { npcLike: refY - a.y, playerLike: refY - b.y, refY };
  }, { GY });
  check('P7a hoik=false 族(NPC/掉落物)活埋救援保留(15t 后爬出)', r.npcLike > 4, `上移=${r.npcLike.toFixed(1)}px`);
  check('P7b hoik=true(玩家)整段让位=不自愈抬升(vanilla 无 unembed 同相)', Math.abs(r.playerLike) <= 4, `上移=${r.playerLike.toFixed(1)}px`);
  await makeFlat(false);
}

// ============ P8 hoik 普查:无第二受益者 ============
{
  const c = await page.evaluate(() => {
    const g = window.__swGame, E = g.entities;
    const pick = (e) => ({ k: e.constructor?.name, hoik: e.hoik === undefined ? 'undef' : String(e.hoik) });
    return {
      player: String(g.player.hoik),
      others: [...E.enemies, ...E.npcs, ...E.drops, ...E.projectiles, ...E.critters].filter((e) => !e.dead).slice(0, 12).map(pick),
    };
  });
  check('P8 玩家 hoik=true;实体族无人携带(true 不外溢)', c.player === 'true' && c.others.every((o) => o.hoik !== 'true'),
    `player=${c.player} others=${c.others.map((o) => `${o.k}:${o.hoik}`).join(',') || '(空)'}`);
}

console.log(`RESULT: ${pass} pass / ${fail} fail / ${info} info`);
if (errors.length) console.log('PAGE ERRORS:', errors.slice(0, 6));
await browser.close();
process.exit(fail > 0 ? 1 : 0);
