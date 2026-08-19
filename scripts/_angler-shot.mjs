// bound 渔夫视觉+交互终验：截图 + 紧贴唤醒（玩家站定不掉坡）
import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto(`${ORIGIN}/?play=small`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.world.store, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const TILE = 16;
  const st = g.world.store;
  g.enemySpawnEnabled = false;
  const res = {};
  const n = g.entities.npcs.find(x => x.npcKey === 'angler' && x.bound && !x.dead);
  if (!n) { res.error = 'no bound angler'; return res; }
  // 玩家冻结式紧贴：直接钉在 NPC 左侧 20px，且反复校正位置防滑落
  const park = () => {
    g.player.x = n.x - g.player.w - 20;
    g.player.y = n.y + n.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
  };
  park();
  await sleep(600);
  park();   // 落定后再钉一次
  await sleep(200);
  const overlap = g.player.x < n.x + n.w && g.player.x + g.player.w > n.x
    && g.player.y < n.y + n.h && g.player.y + g.player.h > n.y;
  res.dist = Math.round(Math.hypot(n.cx - g.player.cx, n.cy - g.player.cy));
  res.overlap = overlap;
  // 相机居中到 NPC 与玩家之间
  const midX = (n.cx + g.player.cx) / 2, midY = (n.cy + g.player.cy) / 2;
  g.camera.centerOn?.(midX, midY);
  await sleep(300);
  // 鼠标点 NPC 盒中心
  const [sx, sy] = g.camera.worldToScreen(n.cx, n.cy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  await sleep(200);
  res.mouse = { sx: Math.round(sx), sy: Math.round(sy) };
  res.shot1 = 'shots/_angler-bound-before.png';
  return res;
});
// 截图 1：唤醒前
await p.screenshot({ path: 'shots/_angler-bound-before.png' });
const out2 = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const n = g.entities.npcs.find(x => x.npcKey === 'angler');
  const res = {};
  let calls = 0;
  const od = g.cb.onNpcDialog;
  g.cb.onNpcDialog = (...a) => { calls++; return od?.(...a); };
  // 右键（保持玩家钉在旁边）
  g.player.x = n.x - g.player.w - 20;
  g.player.y = n.y + n.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  const [sx, sy] = g.camera.worldToScreen(n.cx, n.cy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.input.rightDown = true;
  await sleep(100);
  // 每帧重钉防滑落
  for (let i = 0; i < 6; i++) { g.player.x = n.x - g.player.w - 20; g.player.y = n.y + n.h - g.player.h; g.player.vx = 0; g.player.vy = 0; await sleep(50); }
  g.input.rightDown = false;
  res.afterRightClick = { bound: !!n.bound, savedAngler: !!g.world.flags.savedAngler, dialogCalls: calls };
  // 若已解救，再右键开对话
  if (!n.bound && !n.dead) {
    const [sx2, sy2] = g.camera.worldToScreen(n.cx, n.cy);
    g.input.mouseX = sx2; g.input.mouseY = sy2;
    g.input.rightDown = true;
    await sleep(300);
    g.input.rightDown = false;
    res.secondClick = { dialogCalls: calls, chat: g.dialogNpc ? 'opened' : 'none' };
  }
  g.cb.onNpcDialog = od;
  return res;
});
console.log(JSON.stringify({ ...out, ...out2 }, null, 1));
await p.screenshot({ path: 'shots/_angler-bound-after.png' });
await b.close();
