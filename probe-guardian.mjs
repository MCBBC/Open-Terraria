// 地牢守卫 68 探针：传送到地牢内部(dungeonY+40 以下)看是否按原版 SpawnNPC 链替换生成；
// 顺带检查门口守卫老人 37 是否存在
import puppeteer from 'puppeteer-core';

const b = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', args: ['--no-sandbox'],
});
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 200)));
await p.goto('http://localhost:5199/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swGame && window.__swGame.liquid, { timeout: 600000 });
await new Promise(r => setTimeout(r, 2000));

const info = await p.evaluate(async () => {
  const g = window.__swGame;
  const w = g.world;
  const st = w.store;
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const res = {
    dungeonX: w.dungeonX, dungeonY: w.dungeonY, groundLevel: w.groundLevel,
    oldMan: g.entities.npcs.filter((n) => n.npcKey === 'old_man').map((n) => ({ x: n.x / 16, y: n.y / 16, dead: n.dead })),
  };
  // 地牢门口附近的墙采样（dungeonX 列，dungeonY 附近）：看砖墙存在性
  const dx = w.dungeonX;
  const colWalls = [];
  for (let y = Math.floor(w.groundLevel) + 10; y < Math.floor(w.groundLevel) + 40; y += 5) {
    colWalls.push(st.wall[st.idx(dx, y)]);
  }
  res.colWalls = colWalls;

  // 传送进地牢内部：从 dungeonY+45 向下找空气格
  const tx = dx;
  let ty = (w.dungeonY || Math.floor(w.groundLevel)) + 45;
  while (ty < st.h - 10 && st.isSolid(tx, ty)) ty++;
  res.teleportTile = { tx, ty };
  g.player.x = tx * 16 + 8 - g.player.w / 2;
  g.player.y = ty * 16 - g.player.h;
  await sleep(3000);
  res.scene = { zoneDungeon: g.scene?.zoneDungeon, tileY: g.scene?.tileY };
  res.spawnerFlags = { zoneDungeon: g.vanillaSpawner ? true : false };

  // 等待生成（spawnRate=10 → 每帧 1/10 概率；15s 足够）
  await sleep(15000);
  res.enemies = g.entities.enemies.map((e) => ({ vid: e.vanillaId, y: Math.round(e.y / 16), boss: !!e.def?.boss }));
  res.hasGuardian = res.enemies.some((e) => e.vid === 68);
  return res;
});
console.log(JSON.stringify(info));
await b.close();
