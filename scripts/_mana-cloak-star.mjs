// 一次性:法力斗篷星链全链验证——
// ①魔法命中触发:冷却门/非装备拒 ②星 723 生成 ③落地掉 4143 ④拾取 +50 魔力
// ⑤300t 消失
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1200, height: 800 } });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGEERROR:', (e.stack || e.message).slice(0, 200)));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000, polling: 1000 });
await new Promise((r) => setTimeout(r, 1200));
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const items = await import('/src/data/items.ts');
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  // 装备法力斗篷 4001 到饰品栏
  const mcId = items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[4001]];
  g.player.inv.armor[g.player.inv.accSlotMax ? 3 : 3] = { id: mcId, stack: 1 };   // 饰品槽(3 起)
  if (g.refreshAll) g.refreshAll();
  const px = Math.floor(g.player.cx / 16);
  const X = px + 4, Y = Math.floor(g.world.groundLevel) - 3;
  g.player.x = (X - 3) * 16; g.player.y = (Y - 2) * 16; g.player.mana = g.player.maxMana = 200; g.player.mana = 100;
  const st = g.world.store;
  for (let y = Y - 8; y <= Y + 3; y++) for (let x = X - 40; x <= X + 40; x++) if (st.inBounds(x, y)) st.setTile(x, y, 0);
  for (let x = X - 40; x <= X + 40; x++) st.setTile(x, Y + 3, 2);   // 全域地板:星落此线必碰
  const res = {};
  // ① 未装备时拒?先卸装备测——先测装备态,再卸装备补测
  g.tryManaCloakStarOnMagicHit(X * 16, Y * 16);
  await raf(2);
  const star = g.entities.projectiles.find((p) => p.projId === 723);
  res.starSpawned = !!star;
  res.manaCloakCooldown = g.player.starCloakCooldown;
  // ② 冷却门:同 tick 二次调用拒
  g.tryManaCloakStarOnMagicHit(X * 16, Y * 16);
  const star2 = g.entities.projectiles.filter((p) => p.projId === 723 && !p.dead);
  res.cooldownGate = star2.length === 1;
  // ③ 星落地 → 4143 掉落(星速 23 归一,500-800px 外落下,落地几秒——快进)
  g.player.mana = 100; g.player.maxMana = 200;
  const starEnt = () => g.entities.projectiles.find((p) => p.projId === 723 && !p.dead);
  for (let i = 0; i < 600 && !g.entities.drops.some((d) => !d.dead && (items.ITEM_DEFS[d.itemId]?.key || '').includes('4143')); i++) g.fixedUpdate(1 / 60);
  const se = starEnt();
  const starEnd = { starAlive: !!se, starPos: se ? [Math.round(se.x / 16), Math.round(se.y / 16)] : null,
    starCollide: se ? se.starCollide : null, starY: se ? se.starY : null,
    onTile: se ? st.get(Math.floor(se.x / 16), Math.floor(se.y / 16)) : null };
  const manaStar = g.entities.drops.find((d) => !d.dead && (items.ITEM_DEFS[d.itemId]?.key || '').includes('4143'));
  res.starDrop4143 = !!manaStar;
  res.starEnd = starEnd;
  // ④ 拾取 +50 魔力: Mana 拨 100,把心放到玩家脚下碰触
  const manaBefore = g.player.mana;
  if (manaStar) { manaStar.x = g.player.x; manaStar.y = g.player.y; g.player.mana = 0; }
  g.fixedUpdate(1 / 60);
  res.pickup = { manaGain: g.player.mana - manaBefore, gone: !manaStar || manaStar.dead };
  // ⑤a 4143 拾取精测:玩家盒内、mana 0、单 tick → +50
  const it2 = g.spawnDrop(g.player.x + 4, g.player.y, 'vi_4143_manacloakstar', 1);
  it2.age = 30;   // 过 PICKUP_DELAY(25t)
  g.player.mana = 0;
  // 同落:玩家与掉落物同速下落,落地瞬间盒交叠 → 触碰收集
  for (let i = 0; i < 120; i++) g.fixedUpdate(1 / 60);
  res.pickup4143 = { collected: !!it2.dead, mana: g.player.mana,
    dropPos: [Math.round(it2.x / 16), Math.round(it2.y / 16)],
    playerPos: [Math.round(g.player.x / 16), Math.round(g.player.y / 16)],
    pickupKind: it2.pickup ?? null };
  // ⑤b 300t 消失:age 拨 301 → 消失
  const it3 = g.spawnDrop(X * 16, (Y + 1) * 16, 'vi_4143_manacloakstar', 1);
  it3.age = 301;
  g.fixedUpdate(1 / 60);
  res.despawn301 = it3.dead;
  // ⑥ 未装备拒:卸装备 → 清冷却 → 调用 → 无星
  g.player.inv.armor[3] = null;
  g.player.starCloakCooldown = 0;
  for (const p of g.entities.projectiles) if (p.projId === 723) p.dead = true;
  g.tryManaCloakStarOnMagicHit(X * 16, Y * 16);
  await raf(2);
  res.unequippedReject = !g.entities.projectiles.some((p) => p.projId === 723 && !p.dead);
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
