// 亡命箱(Dead Man's Chest)开箱触发全链验证——用真实存档复现：
//  ① 权威判定: Containers2(467) styleRow=frameX/36==4
//  ② 开箱 → wiring.hitSwitch(topLeft) 级联 → 发射器射镖 / 炸药爆炸Projectile108
//  ③ 阴性对照: 同一箱 frameX 改 styleRow5 → 再开零触发
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERROR:', String(e.message).slice(0, 200)));
const B = process.env.T || 'http://localhost:5201';
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 180000 });
await page.evaluate(async (b) => {
  const t = await (await fetch(b + '/_deadman-world.sbw.json')).text();
  await window.__swFlow.loadJson(t);
}, B);
await page.waitForFunction(() => !!window.__swGame && !!window.__swGame.wiring, { timeout: 120000 });
await new Promise((r) => setTimeout(r, 800));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  g.player.debugGod = true;
  const st = g.world.store;
  // ---- 定位目标箱（已知地形坐标附近）----
  let chest = null;
  for (let dy = -6; dy <= 6 && !chest; dy++) for (let dx = -14; dx <= 8 && !chest; dx++) {
    const x = 2243 + dx, y = 365 + dy;
    const c = g.findChest(x, y) ?? g.findChestNear(x, y);
    if (c && c.x !== undefined) chest = c;
  }
  if (!chest || chest.x === undefined) return { fail: 'no chest at cabin' };
  const info = { chest: { x: chest.x, y: chest.y } };
  info.sheet = g.wiring.sheetOf(chest.x, chest.y);
  info.fx = st.frameX[st.idx(chest.x, chest.y)];
  info.styleRow = Math.floor(info.fx / 36);
  info.rigged = info.sheet === 467 && info.styleRow === 4;
  // 站到箱旁（神化躲伤害）——★须在开箱交互距离内，否则 tickChestAutoClose 秒关面板
  g.player.x = (chest.x + 3) * 16; g.player.y = (chest.y - 1) * 16;
  // ---- 捕获弹体生成 ----
  const projLog = [];
  // 爆炸取证：explodeAt 无弹体实体，直接记录锚点
  const boomLog = [];
  if (!window.__boomHooked) {
    window.__boomHooked = true;
    const ob = g.explodeAt.bind(g);
    g.explodeAt = (...a) => { boomLog.push({ x: a[0], y: a[1], r: a[3] }); return ob(...a); };
  }
  // 滚石/爆炸/监听链综合取证
  const rollLog = [];
  window.__rollSeen = rollLog;
  const emAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, bucket) => {
    if (bucket === 'projectiles') {
      projLog.push({ cls: e.constructor.name, pid: e.projId ?? null, tag: e.tag ?? '', x: Math.round(e.x), y: Math.round(e.y) });
      if (e.constructor.name === 'RollingBoulder') rollLog.push({ x: Math.round(e.x / 16 * 10) / 10, y: Math.round(e.y / 16 * 10) / 10, projId: e.projId });
    }
    return emAdd(e, bucket);
  };
  if (!window.__closeHooked) {
    window.__closeHooked = true;
    const oc = g.closeChestPanel;
    g.closeChestPanel = () => {
      const c0 = g.openChestRef?.();
      window.__closeInfo = c0 ? {
        chest: [c0.x, c0.y], sheetNow: (() => { try { return window.__swGame.wiring.sheetOf(c0.x, c0.y); } catch { return -9; } })(),
        p: [Math.round(g.player.x / 16), Math.round(g.player.y / 16), Math.round(g.player.cx), Math.round(g.player.cy)],
        dead: g.player.dead,
      } : { gone: true };
      if (oc) return oc();
    };
  }
  if (!window.__recHooked) {
    window.__recHooked = true;
    const oRec = g.recLog.bind(g);
    g.recLog = (k, v) => { if (k === 'boulderRoll') rollLog.push({ viaRec: k, ...v }); try { return oRec(k, v); } catch {} };
  }
  // ---- 正例：真实开箱路径（markBoom 须在触发前取基线）----
  const beforeN = projLog.length;
  const markBoom = boomLog.length;
  try { g.tryOpenChest(chest); } catch (e) { info.openErr1 = String(e && e.message); }
  const panelSync = g.openChestRef?.();
  info.panelSync = panelSync ? { at: [panelSync.x, panelSync.y], items: panelSync.items.filter(Boolean).length } : null;
  await raf(120);
  const panelPost = g.openChestRef?.();
  info.closeInfo = window.__closeInfo ?? null;
  info.panelPost = panelPost ? { at: [panelPost.x, panelPost.y] } : null;
  info.fired1 = projLog.length > beforeN;
  // ---- 内容面板断言：openChestRef 应指向该箱且 items 非空（真档该箱含 7+ 格战利品）----
  const panel = g.openChestRef?.();
  info.panel = panel && panel.x === chest.x && panel.y === chest.y
    ? { items: panel.items.filter(Boolean).length, first: panel.items.find(Boolean) }
    : { open: false, at: panel ? [panel.x, panel.y] : null };
  info.boomAnchors1 = boomLog.slice(markBoom).slice(0, 8);
  info.rollLog1 = rollLog.slice();
  // ---- 滚石运动轨迹：t0/t30/t90 三拍采样（错位修复=应从盒心出生；没掉落修复=应有落差与横移）----
  const rollerAt = () => Array.from(g.entities.projectiles)
    .filter((e) => e.constructor.name === 'RollingBoulder')
    .map((e) => ({ x: +(e.x / 16).toFixed(2), y: +(e.y / 16).toFixed(2), vx: +e.vx.toFixed(2), vy: +e.vy.toFixed(2), ground: !!e.onGround }));
  const tracks = [];
  const t0 = rollerAt();
  tracks.push({ t: 0, s: t0 });
  for (let k = 0; k < 90; k++) {
    g.fixedUpdate(1 / 60); g.postUpdate();
    if (k === 29 || k === 89) tracks.push({ t: k + 1, s: rollerAt() });
    await new Promise((r) => setTimeout(r, 4));
  }
  info.tracks = tracks;
  info.newSpawns = projLog.slice(beforeN).slice(0, 12);
  // 炸药:引擎 explodeAt 直拆无弹体实体 → 爆炸以 boomAnchors 取证；TrapShot=发射器
  info.darts1 = projLog.slice(beforeN).filter((p) => p.cls === 'TrapShot').length;
  info.boom1 = projLog.slice(beforeN).filter((p) => p.pid === 108).length;
  // ---- 负例：styleRow 改 5 后再开 → 零触发 ----
  const cx2 = chest.x, cy2 = chest.y;
  const saveFx = st.frameX[st.idx(cx2, cy2)];
  st.frameX[st.idx(cx2, cy2)] = saveFx + 36;   // styleRow+1
  const mark = projLog.length;
  try { g.tryOpenChest(chest); } catch (e) { info.openErr2 = String(e && e.message); }
  await raf(60);
  info.newAfterRestyle = projLog.length - mark;
  st.frameX[st.idx(cx2, cy2)] = saveFx;        // 还原帧
  return out0(info);
  function out0(o) { return o; }
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
