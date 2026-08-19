// 解救后对话调试：直调 talkToNearbyNpc + 各门检查
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
await new Promise(r => setTimeout(r, 2500));
const out = await p.evaluate(async () => {
  const g = window.__swGame;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  g.enemySpawnEnabled = false;
  const res = {};
  const angler = g.entities.enemies.find(e => e.vanillaId === 376 && !e.dead);
  if (!angler) { res.error = 'no 376'; return res; }
  // 唤醒
  g.player.x = angler.x - g.player.w - 20;
  g.player.y = angler.y + angler.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  await sleep(600);
  const [sx, sy] = g.camera.worldToScreen(angler.cx, angler.cy);
  g.input.mouseX = sx; g.input.mouseY = sy;
  g.input.rightDown = true;
  await sleep(300);
  g.input.rightDown = false;
  await sleep(300);
  const freed = g.entities.npcs.find(n => n.npcKey === 'angler' && !n.dead && !n.bound);
  res.freed = !!freed;
  res.savedAngler = !!g.world.flags.savedAngler;
  g.closeNpcDialog();
  await sleep(200);
  if (!freed) return res;
  // 状态检查
  res.gates = {
    uiBlocking: g.input.uiBlocking,
    playerDead: g.player.dead,
    fullMapOpen: g.renderer.fullMap.open,
    timeUiHover: g.renderer.timeUiHover,
    weatherUiHover: g.renderer.weatherUiHover,
    freedTalking: freed.talking,
    freedTalkCooldown: freed.talkCooldown,
  };
  // 手动直调 talkToNearbyNpc（tile = 渔夫中心格）
  let dialogCalls = 0;
  const od = g.cb.onNpcDialog;
  g.cb.onNpcDialog = (...a) => { dialogCalls++; return od?.(...a); };
  g.player.x = freed.x - g.player.w - 20;
  g.player.y = freed.y + freed.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  await sleep(100);
  const tx = Math.floor(freed.cx / 16), ty = Math.floor(freed.cy / 16);
  const ok = g.talkToNearbyNpc(tx, ty);
  res.directCall = { ok, dialogCalls, dist: Math.round(Math.hypot(freed.cx - g.player.cx, freed.cy - g.player.cy)) };
  // 用鼠标路径再试（含相机稳定）
  g.closeNpcDialog();
  dialogCalls = 0;
  await sleep(400);
  g.player.x = freed.x - g.player.w - 20;
  g.player.y = freed.y + freed.h - g.player.h;
  g.player.vx = 0; g.player.vy = 0;
  freed.vx = 0;
  await sleep(400);
  const [fsx, fsy] = g.camera.worldToScreen(freed.cx, freed.cy);
  g.input.mouseX = fsx; g.input.mouseY = fsy;
  g.input.rightDown = true;
  await sleep(300);
  g.input.rightDown = false;
  await sleep(200);
  res.mousePath = { dialogCalls, rightDownStill: g.input.rightDown };
  g.cb.onNpcDialog = od;
  return res;
});
console.log(JSON.stringify(out, null, 1));
await b.close();
