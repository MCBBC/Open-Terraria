// 陷阱弹幕对怪物/城镇NPC伤害验证:走廊内摆靶 → 触发火焰陷阱(穿透) → 断言掉血
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGEERR:', e.message));
await page.goto('http://localhost:5199', { waitUntil: 'networkidle0', timeout: 180000 });

const out = await page.evaluate(async () => {
  await new Promise((r) => setTimeout(r, 500));
  document.querySelector('select').selectedIndex = 0;
  document.querySelector('select').parentElement.querySelector('button').click();
  const t0 = Date.now();
  while (!(window.__swGame && window.__swGame.world && window.__swGame.renderer?.atlas) && Date.now() - t0 < 240000) {
    await new Promise((r) => setTimeout(r, 1000));
  }
  const g = window.__swGame;
  const st = g.world.store;
  const tiles = await import('/src/data/tiles.ts');
  const { Enemy } = await import('/src/entities/Enemy.ts');
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const TRAP = tiles.TILE_BY_KEY['v_137_traps'];
  const LEVER = tiles.TILE_BY_KEY['v_136_switch'];

  // 出生点旁找平地
  let sx = -1, sy = -1;
  outer: for (let x = g.world.spawnX + 3; x < g.world.spawnX + 80; x++) {
    for (let y = g.world.spawnY - 6; y < g.world.spawnY + 6; y++) {
      const i1 = st.idx(x, y), i2 = st.idx(x, y - 1), i3 = st.idx(x, y + 1);
      if (!st.flags[i1] && !st.flags[i2] && st.flags[i3]) { sx = x; sy = y; break outer; }
    }
  }
  if (sx < 0) return { err: 'no flat spot' };

  // 走廊 + 烈焰陷阱(frameY=36 → kind2 烈焰,穿透) 朝右;地面(ty+1 行)保持实心作地板
  const ty = sy - 1;
  for (let x = sx - 14; x <= sx; x++) {
    st.setTileSilent(x, ty, 0); st.setTileSilent(x, ty - 1, 0);
    st.wire[st.idx(x, ty)] = 0;
  }
  st.setTileSilent(sx - 14, ty, tiles.TILE_BY_KEY['v_43_green_brick'] ?? tiles.T.STONE);
  st.setTileSilent(sx - 13, ty, TRAP, 18, 36); // 朝右 + 烈焰(kind2,穿透)
  st.setTileSilent(sx, ty, LEVER, 0, 0);
  for (let x = sx - 13; x <= sx; x++) st.wire[st.idx(x, ty)] |= 1;

  // 靶:僵尸(3) + 商人 NPC 立于弹道(ty 行)上,地面在 ty+1;玩家移远防干扰
  const zomb = Enemy.fromVanilla(3, (sx - 9) * 16 + 8, ty * 16 + 10);
  const bunny = Enemy.fromVanilla(46, (sx - 12) * 16 + 8, ty * 16 + 10); // 小动物,陷阱口 t=1 即命中(防蹦走)
  const npc = new TownNPC('merchant', (sx - 5) * 16 + 4, (ty + 1) * 16); // y=构造用,下方重设脚底
  npc.y = (ty + 1) * 16 - npc.h; // 脚踏地板,身体跨 ty 行(弹道)
  g.entities.add(zomb, 'enemies');
  g.entities.add(bunny, 'critters');
  g.entities.add(npc, 'npcs');
  g.player.x = (sx + 20) * 16; g.player.y = ty * 16;

  const zHp0 = zomb.hp, nHp0 = npc.hp;
  g.paused = true; // 冻结实时循环,避免与手动步进双跑
  g.wiring.hitSwitch(sx, ty);
  // 手动步进 40 tick(烈焰速 5px/tick,两靶间距 64px 需 ~23 tick)
  const trace = [];
  for (let k = 0; k < 40; k++) {
    g.fixedUpdate(1 / 60);
    const pr = g.entities.projectiles[g.entities.projectiles.length - 1];
    trace.push({
      t: k + 1, px: pr ? Math.round(pr.x) : null, dead: pr ? pr.dead : null,
      zh: zomb.hp, nh: npc.hp, bh: bunny.hp,
      nz: [Math.round(zomb.x), Math.round(zomb.y)],
      nn: [Math.round(npc.x), Math.round(npc.y), Math.round(npc.w), Math.round(npc.h)],
      nb: [Math.round(bunny.x), Math.round(bunny.y), Math.round(bunny.w), Math.round(bunny.h), bunny.iframes],
    });
  }
  g.paused = false;
  return {
    zombHp: [zHp0, zomb.hp, zomb.dead],
    bunnyDead: bunny.dead,
    npcHp: [nHp0, npc.hp, npc.dead],
    npcIf: npc.iframes,
    trace,
  };
});
console.log(JSON.stringify(out, null, 1));
const dz = out.zombHp ? out.zombHp[0] - Math.max(0, out.zombHp[1]) : 0;
const dn = out.npcHp ? out.npcHp[0] - Math.max(0, out.npcHp[1]) : 0;
console.log(`僵尸掉血: ${dz}  兔子死亡: ${out.bunnyDead}  商人掉血: ${dn}`);
console.log(dz > 0 && dn > 0 && out.bunnyDead ? 'PASS: 陷阱弹幕对怪物/小动物/城镇 NPC 均造成伤害' : 'FAIL');
await browser.close();
process.exit(dz > 0 && dn > 0 ? 0 : 1);
