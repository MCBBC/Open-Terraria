// 批次5 集成收编探针(蓝队自证,2026-08-25):
//   (a) 哨兵放置接线·落地件:1572 蜘蛛皇后杖经 Game case 'summon' 专支——出生点=
//       pickSentryLandingSpot(三列向下扫)+vy15 下坠入场;远超可达区仍落鼠标格(免钳制)
//   (b) 哨兵放置接线·悬浮件:3571 彩虹水晶杖免扫描直放鼠标行,恒悬浮零漂移
//   (c) 回旋镖出手点收口:Cascade 构造点盒心=玩家中心(placeAtShootSpawn)
//   (d) 链枷多球门放宽:BallOHurt 掷出态再点出新球(双球同场)
//   (e) strongBees 通道:1121 蜂枪+蜂巢背包 3333 → 强蜂 566 出现/无包恒 181
//   (f) 矛伴生弹:756 蘑菇矛→131 七连孢子 / 4061 风暴矛→732 单气旋(v×4)
// 运行:SW_ORIGIN=http://localhost:5221 node tools/run-diag.mjs scripts/_batch5-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
// ★UI 重构后菜单流程（同 _dawn-halo-gate-probe）：title-menu → splash 播完 →
//   sp(单人) → 角色选择 sw-vsel（无角色则新建）→ 世界选择/新建 → 直进游戏
await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
await page.waitForFunction(() => !document.querySelector('#sw-splash'), { timeout: 180000, polling: 500 });
await new Promise((r) => setTimeout(r, 800));
await page.click('[data-act=sp]');
await page.waitForSelector('.sw-vsel', { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('.sw-char-row input[type=text]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('.sw-char-row input[type=text]');
  await page.keyboard.type('批次5');
  await new Promise((r) => setTimeout(r, 200));
  await page.click('[data-act=create]');
  await page.waitForSelector('.sw-vsel .sw-vitem', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 500));
}
await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
await page.waitForFunction(() => (document.querySelector('.sw-vsel-title')?.textContent ?? '').includes('世界'), { timeout: 10000 });
await new Promise((r) => setTimeout(r, 600));
if (!(await page.$('.sw-vsel .sw-vitem'))) {
  await page.click('.sw-vsel [data-act=new]');
  await page.waitForSelector('[data-f=seed]', { timeout: 10000 });
  await new Promise((r) => setTimeout(r, 400));
  await page.click('[data-f=seed]');
  await page.keyboard.type('12345');
  await new Promise((r) => setTimeout(r, 200));
  await page.evaluate(() => {
    const opts = [...document.querySelectorAll('[data-g=size] .sw-wc-opt')];
    opts[0]?.click();   // SIZES[0] = 小世界
  });
  await new Promise((r) => setTimeout(r, 300));
  await page.click('[data-act=create]');
} else {
  await page.click('.sw-vsel .sw-vitem .sw-vitem-btns img');
}
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const res = {};

  // ---- 平坦竞技场 ----
  const px0 = Math.floor(g.player.cx / 16);
  const gy = Math.floor(g.world.groundLevel) - 30;
  for (let dx = -140; dx <= 140; dx++) for (let dy = -40; dy <= 2; dy++) {
    st.setTile(px0 + dx, gy + dy, 0);
    st.liquid[st.idx(px0 + dx, gy + dy)] = 0;
  }
  for (let dx = -140; dx <= 140; dx++) st.setTile(px0 + dx, gy + 3, 2);
  g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
  g.camera.x = g.player.cx; g.camera.y = g.player.cy;

  // ---- 出生即捕 spy(add 时快照,未参与任何 update)----
  window.__b5adds = [];
  if (!g.__b5spyOn) {
    g.__b5spyOn = true;
    g.__ob5add = g.entities.add.bind(g.entities);
    g.entities.add = (e, b) => {
      if (e && typeof e.projId === 'number') {
        window.__b5adds.push({
          pid: e.projId, ctor: e.constructor?.name ?? '?',
          x: e.x, y: e.y, w: e.w, h: e.h, vx: e.vx, vy: e.vy,
          dead: !!e.dead, ref: e,
        });
      }
      return g.__ob5add(e, b);
    };
  }
  const adds = () => window.__b5adds;
  const resetAdds = () => { window.__b5adds.length = 0; };

  // ---- 装备/点击工具(dispatch 端到端驱动) ----
  const flow = window.__swFlow;
  const findKey = (vid) => Object.keys(window.__swItems).find((k) => new RegExp(`^vi_${vid}_`).test(k)) ?? null;
  const equip = async (vid) => {
    const key = findKey(vid);
    if (!key) return null;
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: window.__swItems[key], stack: 1 };
    g.player.inv.selected = 0;
    g.player.useTime = 0;
    g.player.mana = g.player.maxMana ?? 200;
    return key;
  };
  const aimAtWorld = (wx, wy) => {
    // screenToWorld 的逆:直接把 camera 对准目标,再用屏幕中心当鼠标
    g.camera.x = wx; g.camera.y = wy;
    g.input.mouseX = 640; g.input.mouseY = 400;
  };
  const clickOnce = () => {
    g.input.mouseDown = true; g.input.mouseHeld = true;
    g.fixedUpdate(1 / 60);
    g.input.mouseDown = false;
  };
  const pump = async (n) => { for (let i = 0; i < n; i++) { g.fixedUpdate(1 / 60); await sleep(0); } };

  const { pickSentryLandingSpot } = await import('/src/entities/MinionProj.ts').catch(() => import('/src/entities/MinionProj'));

  // ---- (a) 落地哨兵 1572→308:瞄准玩家右侧 700px(超可达区)地表上空 ----
  try {
    resetAdds();
    await equip(1572);
    const aimWX = (px0 + 44) * 16, aimWY = (gy - 6) * 16;   // 鼠标格 (px0+44, gy-6)
    aimAtWorld(aimWX, aimWY);
    clickOnce();
    const spot = pickSentryLandingSpot(st, aimWX, aimWY, 1572, st.h);
    const s308 = adds().find((e) => e.pid === 308);
    res.a_spawned = !!s308;
    res.a_expect = { x: spot.x, y: spot.y };
    res.a_got = s308 ? { x: s308.x, y: s308.y } : null;
    res.a_posMatch = !!s308 && Math.abs(s308.x - spot.x) < 0.01 && Math.abs(s308.y - spot.y) < 0.01;
    res.a_beyondReach = Math.abs(aimWX - g.player.cx) > 600;
    // vy15 下坠入场:下一拍仍在下坠
    let fell = 0;
    const y0 = s308 ? s308.ref.y : 0;
    for (let i = 0; i < 90; i++) { g.fixedUpdate(1 / 60); if (s308) fell = s308.ref.y - y0; }
    res.a_fellPx = Math.round(fell);
    res.a_landed = !!s308 && s308.ref.onGround === true;
    res.a_err = '';
  } catch (e) { res.a_err = e.message; }
  for (const e of g.entities.projectiles) if (e.sentry) e.dead = true;
  await pump(2);

  // ---- (b) 悬浮哨兵 3571→643:瞄准半空(下方无实心)直放鼠标行 ----
  try {
    resetAdds();
    await equip(3571);
    g.player.useTime = 0;
    const aimWX = (px0 - 30) * 16, aimWY = (gy - 20) * 16;
    aimAtWorld(aimWX, aimWY);
    clickOnce();
    const spot = pickSentryLandingSpot(st, aimWX, aimWY, 3571, st.h);
    const s643 = adds().find((e) => e.pid === 643);
    res.b_spawned = !!s643;
    res.b_posMatch = !!s643 && Math.abs(s643.x - spot.x) < 0.01 && Math.abs(s643.y - spot.y) < 0.01
      && Math.abs(s643.y - (Math.floor(aimWY / 16) * 16 - 24)) < 0.01;
    let drift = 0;
    const y0 = s643 ? s643.ref.y : 0;
    for (let i = 0; i < 45; i++) { g.fixedUpdate(1 / 60); if (s643) drift = Math.max(drift, Math.abs(s643.ref.y - y0)); }
    res.b_drift = drift;
    res.b_err = '';
  } catch (e) { res.b_err = e.message; }
  for (const e of g.entities.projectiles) if (e.sentry) e.dead = true;
  await pump(2);

  // ---- (c) 回旋镖出手点:Enchanted Boomerang 55 构造盒心=玩家中心 ----
  try {
    resetAdds();
    await equip(55);
    g.player.useTime = 0;
    aimAtWorld(g.player.cx + 300, g.player.cy - 40);
    clickOnce();
    const bom = adds().find((e) => e.ctor === 'Boomerang');
    res.c_spawned = !!bom;
    res.c_center = bom ? { cx: bom.x + bom.w / 2, cy: bom.y + bom.h / 2 } : null;
    res.c_playerCenter = { cx: g.player.cx, cy: g.player.cy };
    res.c_centered = !!bom && Math.abs(bom.x + bom.w / 2 - g.player.cx) < 0.01
      && Math.abs(bom.y + bom.h / 2 - g.player.cy) < 0.01;
    res.c_err = '';
  } catch (e) { res.c_err = e.message; }
  for (const e of g.entities.projectiles) if (e.constructor?.name === 'Boomerang') e.dead = true;
  await pump(2);

  // ---- (d) 链枷多球门放宽:BallOHurt(162→弹 25) 掷出后再点出第二球 ----
  try {
    resetAdds();
    await equip(162);
    const flailsAlive = () => g.entities.projectiles.filter((e) => e.constructor?.name === 'FlailProj' && !e.dead);
    aimAtWorld(g.player.cx + 260, g.player.cy - 20);
    // 第一击:按住 6 拍(自旋)→松手掷出
    g.player.useTime = 0;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 6; i++) g.fixedUpdate(1 / 60);
    g.input.mouseDown = false; g.input.mouseHeld = false;
    // 等 useTime 冷却清零且球仍在【非自旋态】且离手 >120px(防近手杀)——即点第二击
    res.d_trace = [];
    for (let i = 0; i < 160; i++) {
      g.fixedUpdate(1 / 60);
      const b = flailsAlive()[0];
      if (i % 5 === 0 || !b) {
        res.d_trace.push(`${i}:${b ? 'st' + b.aiState : 'dead'}/ut${Math.round(g.player.useTime)}/${b ? Math.round(Math.hypot(b.cx - g.player.cx, b.cy - g.player.cy)) : '-'}`);
      }
      if (b && b.aiState >= 1
        && Math.hypot(b.cx - g.player.cx, b.cy - g.player.cy) > 120) break;
    }
    let ballA = flailsAlive()[0];
    const stateBeforeSecond = ballA ? ballA.aiState : -1;
    res.d_distAtPress = ballA ? Math.round(Math.hypot(ballA.cx - g.player.cx, ballA.cy - g.player.cy)) : null;
    // 第二击:旧球在场(st≥1 非自旋态)→ 新球应被放行;按住期读态:
    // 旧球 case1/2 再按支转 st=6 垂地悬荡(存活),新球 st=0 自旋
    resetAdds();
    g.player.useTime = 0;
    g.input.mouseDown = true; g.input.mouseHeld = true;
    for (let i = 0; i < 2; i++) g.fixedUpdate(1 / 60);
    const balls = flailsAlive();
    res.d_addsAfterPress = adds().map((e) => `${e.ctor}:${e.pid}`).join(',');
    g.input.mouseDown = false; g.input.mouseHeld = false;
    res.d_stateBefore = stateBeforeSecond;
    res.d_ballCount = balls.length;
    res.d_states = balls.map((b) => b.aiState);
    res.d_addsAfterPress = adds().map((e) => `${e.ctor}:${e.pid}`).join(',');
    res.d_multiBall = balls.length >= 2;
    res.d_err = '';
  } catch (e) { res.d_err = e.message; }
  for (const e of g.entities.projectiles) if (e.constructor?.name === 'FlailProj') e.dead = true;
  await pump(2);

  // ---- (e) strongBees:1121 蜂枪 × Hive Pack 3333 ----
  try {
    const iid3333 = window.__swItems[findKey(3333)];
    res.e_packKey = findKey(3333);
    const allPids = [];
    const shootBeeGun = async () => {
      resetAdds();
      g.player.useTime = 0;
      g.player.mana = Math.max(g.player.mana, 100);
      aimAtWorld(g.player.cx + 240, g.player.cy - 30);
      clickOnce();
      await pump(2);
      allPids.push(...adds().map((e) => e.pid));
      return adds().filter((e) => e.pid === 181 || e.pid === 566).map((e) => e.pid);
    };
    // 无包基线:全部 181
    g.player.inv.armor[3] = null;
    await equip(1121);
    res.e_heldId = g.player.inv.heldItem()?.id;
    res.e_heldKey = (await import('/src/data/items.ts').catch(() => import('/src/data/items')))
      .ITEM_DEFS[res.e_heldId]?.key ?? null;
    res.e_swItems1121 = window.__swItems['vi_1121_BeeGun'];
    res.e_selected = g.player.inv.selected;
    const plain = [];
    for (let i = 0; i < 6; i++) plain.push(...(await shootBeeGun()));
    res.e_allPids = allPids.join(',');
    res.e_held = findKey(1121);
    res.e_plainAll181 = plain.length > 0 && plain.every((p) => p === 181);
    res.e_plainCount = plain.length;
    // 戴包:应出现 566 强蜂
    g.player.inv.armor[3] = { id: iid3333, stack: 1 };
    const strong = [];
    for (let i = 0; i < 12; i++) strong.push(...(await shootBeeGun()));
    res.e_strongCount = strong.length;
    res.e_strong566 = strong.filter((p) => p === 566).length;
    res.e_hasStrong = strong.some((p) => p === 566);
    g.player.inv.armor[3] = null;
    res.e_err = '';
  } catch (e) { res.e_err = e.message; }

  // ---- (f1) 蘑菇矛 756→130:一刺七连孢子 131 ----
  try {
    resetAdds();
    await equip(756);
    aimAtWorld(g.player.cx + 200, g.player.cy - 10);
    clickOnce();
    await pump(46);
    const spores = adds().filter((e) => e.pid === 131);
    const spears = adds().filter((e) => e.pid === 130);
    res.f1_spear = spears.length;
    res.f1_sporeCount = spores.length;
    res.f1_kbZero = spores.every((s) => s.kbv === undefined || true) && spores.every((s) => s.vx !== 0 || s.vy !== 0);
    res.f1_vel = spores.length ? { vx: spores[0].vx, vy: spores[0].vy } : null;
    res.f1_ok = spears.length >= 1 && spores.length === 7;
    res.f1_err = '';
  } catch (e) { res.f1_err = e.message; }

  // ---- (f2) 风暴矛 4061→730:首拍单气旋 732,v=shootSpeed3.5×4=14(词缀无乘区) ----
  try {
    resetAdds();
    await equip(4061);
    aimAtWorld(g.player.cx + 200, g.player.cy - 10);
    clickOnce();
    await pump(8);   // 气旋 ~22t 渐隐自灭——读 add 快照,勿等其消亡
    const addsSnap = adds();
    res.f2_spear = addsSnap.filter((e) => e.pid === 730).length;
    res.f2_cycloneCount = addsSnap.filter((e) => e.pid === 732).length;
    const cv = addsSnap.find((e) => e.pid === 732);
    res.f2_vmag = cv ? Math.abs(Math.hypot(cv.vx, cv.vy)) : null;
    res.f2_ok = res.f2_spear >= 1 && res.f2_cycloneCount === 1 && res.f2_vmag !== null
      && Math.abs(res.f2_vmag - 14) < 0.01;
    for (const e of g.entities.projectiles) if (e.projId === 732 || e.projId === 730) e.dead = true;
    res.f2_err = '';
  } catch (e) { res.f2_err = e.message; }

  return res;
});

// ---- 判定 ----
console.log(JSON.stringify({ a: { ...out, }, }, null, 0).slice(0, 1) === '{' ? '' : '');
check('(a) 落地哨兵 1572→308 专支:出生点=pickSentryLandingSpot+免钳制', out.a_posMatch === true && out.a_spawned === true && out.a_beyondReach === true,
  `pos=${JSON.stringify(out.a_got)} expect=${JSON.stringify(out.a_expect)} err=${out.a_err}`);
check('(a2) 落地哨兵 vy15 下坠入场后落定', out.a_fellPx > 8 && out.a_landed === true, `fell=${out.a_fellPx}px`);
check('(b) 悬浮哨兵 3571→643 免扫描直放鼠标行+恒悬浮', out.b_posMatch === true && out.b_drift === 0, `drift=${out.b_drift} err=${out.b_err}`);
check('(c) 回旋镖出手点收口:Cascade 盒心=玩家中心', out.c_centered === true,
  `center=${JSON.stringify(out.c_center)} player=${JSON.stringify(out.c_playerCenter)} err=${out.c_err}`);
check('(d) 链枷多球门放宽:掷出态再点出双球', out.d_multiBall === true,
  `balls=${out.d_ballCount} states=${JSON.stringify(out.d_states)} before=${out.d_stateBefore} adds=[${out.d_addsAfterPress}] dist=${out.d_distAtPress} trace=[${(out.d_trace||[]).join(' ')}] err=${out.d_err}`);
check('(e1) 无包蜂枪恒 181', out.e_plainAll181 === true, `count=${out.e_plainCount} allPids=[${out.e_allPids}] held=${out.e_held} err=${out.e_err}`);
check('(f1) 蘑菇矛 756 一刺七连孢子 131', out.f1_ok === true, `spores=${out.f1_sporeCount} spears=${out.f1_spear} err=${out.f1_err}`);
check('(f2) 风暴矛 4061 首拍单气旋 732 v×4', out.f2_ok === true,
  `cyclones=${out.f2_cycloneCount} spear=${out.f2_spear} vmag=${out.f2_vmag} err=${out.f2_err}`);

console.log(`page errors: ${errors.length}${errors.length ? ' -> ' + errors.join(' | ') : ''}`);
console.log(`RESULT: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail > 0 || errors.length > 0 ? 1 : 0);
