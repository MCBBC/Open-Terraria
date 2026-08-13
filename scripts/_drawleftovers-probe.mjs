// NPC 绘制侧遗留六件套的运行时冒烟（draw-side-leftovers）：
//   ① 568 出生紫雾 + 死亡紫魂环（localAI 0/3 读回 + 帧循环无异常）
//   ② 宠物 637/638/656 派对帽（partyUp 强制 + 三宠物同屏）
//   ③ 229 海盗帽位（弓态触发见 town-npc-attack，此处至少画帽不炸）
//   ④ 160/209 Glow 变体档（shimmered 翻转 + 帧循环无异常）
//   ⑤ 月总白闪帧尾（无月总时不画，仅验证调用点不炸）
//   ⑥ gore 点光（16 号火苗 gore 落场 + lighting.perFrameCount 增长）
// 用法：SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_drawleftovers-probe.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox', '--window-size=1280,800'],
});
const page = await b.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERR: ' + String(e && e.stack ? e.stack : e).slice(0, 1200)));
page.on('console', (m) => {
  if (m.type() === 'error') errors.push('CONSOLE: ' + m.text().slice(0, 300));
});
await page.goto(ORIGIN + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise((r) => setTimeout(r, 2500));

const res = await page.evaluate(async () => {
  const g = window.__swGame;
  const out = {};
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { toggleManualParty } = await import('/src/world/wiring/party.ts');
  const { GorePiece } = await import('/src/entities/GorePiece.ts');
  const dd2 = await import('/src/entities/bossAI_dd2.ts');

  const p = g.player;
  const px = Math.floor(p.cx / 16), py = Math.floor(p.cy / 16);
  // 找脚下实心面
  let floorY = py;
  for (let y = py; y < py + 30; y++) {
    if (g.world.store.isSolid(px, y)) { floorY = y; break; }
  }
  const spawnX = (dx) => (px + dx) * 16 + 8;
  const groundY = (floorY - 1) * 16;

  // ① 568 枯萎兽（出生紫雾 + 灵气环）——放在玩家旁 6 格，600 触发距内进灵气态
  const beast = Enemy.fromVanilla(568, spawnX(6), groundY - 40);
  out.beastSpawned = !!beast;
  if (beast) g.entities.add(beast, 'enemies');

  // ② 宠物 + ③ 海盗 + ④ 160/209（209 顺带 shimmered 翻 Glow_350 档）
  const townKeys = ['town_cat', 'town_dog', 'town_bunny', 'pirate', 'truffle', 'cyborg'];
  let i = 0;
  for (const k of townKeys) {
    const n = new TownNPC(k, spawnX(-8 - i * 4), groundY);
    g.entities.add(n, 'npcs');
    i++;
  }
  const truffle = g.entities.npcs.find((n) => n.npcKey === 'truffle');
  const cyborg = g.entities.npcs.find((n) => n.npcKey === 'cyborg');
  if (truffle) truffle.shimmered = true;      // Glow_352 档
  if (cyborg) cyborg.shimmered = true;        // Glow_350 档（altTexture≠1）
  out.townCount = g.entities.npcs.length;

  // 派对帽：强制 ManualParty
  toggleManualParty(g.partyState);
  out.partyUp = !!g.renderer.scene?.partyUp;

  // ⑥ gore 火苗点光
  const before = g.lighting.perFrameCount;
  const fire = GorePiece.newGore(16, spawnX(-2), groundY - 20, 0, -2, 1);
  out.fireGore = !!fire;

  // 跑 5s（≈300 tick）：出生 60t + 灵气态进入（windup 110t）+ 派对帽/帽子多帧
  await new Promise((r) => setTimeout(r, 5000));

  out.lightPerFrame = g.lighting.perFrameCount;
  out.lightBefore = before;
  if (beast) {
    const [lai0, lai3] = dd2.witherBeastLocal(beast);
    out.beastLocal = { lai0, lai3, ai0: beast.ai0 };
  }
  out.sceneParty = !!g.renderer.scene?.partyUp;
  out.pirateAtk = g.entities.npcs.find((n) => n.npcKey === 'pirate')?.attackState ?? null;
  return out;
});

// 再等两帧后截图（覆盖 5 帧尾白闪调用点与 4.6 gore 层）
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: '/tmp/draw-leftovers-5201.png' });
console.log(JSON.stringify(res, null, 2));
console.log('ERRORS(' + errors.length + '):');
for (const e of errors.slice(0, 10)) console.log('  ' + e);
await b.close();
process.exit(errors.length ? 1 : 0);
