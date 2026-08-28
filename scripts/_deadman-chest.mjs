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
  // 传送玩家远离杀阵（神化躲伤害）
  g.player.x = (chest.x + 20) * 16; g.player.y = (chest.y - 6) * 16;
  // ---- 捕获弹体生成 ----
  const projLog = [];
  // 爆炸取证：explodeAt 无弹体实体，直接记录锚点
  const boomLog = [];
  if (!window.__boomHooked) {
    window.__boomHooked = true;
    const ob = g.explodeAt.bind(g);
    g.explodeAt = (...a) => { boomLog.push({ x: a[0], y: a[1], r: a[3] }); return ob(...a); };
  }
  const emAdd = g.entities.add.bind(g.entities);
  g.entities.add = (e, bucket) => {
    if (bucket === 'projectiles') projLog.push({ cls: e.constructor.name, pid: e.projId ?? null, tag: e.tag ?? '', x: Math.round(e.x), y: Math.round(e.y) });
    return emAdd(e, bucket);
  };
  // ---- 正例：真实开箱路径（markBoom 须在触发前取基线）----
  const beforeN = projLog.length;
  const markBoom = boomLog.length;
  try { g.tryOpenChest(chest); } catch (e) { info.openErr1 = String(e && e.message); }
  await raf(120);
  info.fired1 = projLog.length > beforeN;
  info.boomAnchors1 = boomLog.slice(markBoom).slice(0, 8);
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
