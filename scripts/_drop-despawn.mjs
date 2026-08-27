// 一次性:掉落物消失/槽位对齐验证——①心无通用超时(原版 1.4 移除)②星白天消失
// ③4143 超 300t 消失 ④3822 非 DD2 消失 ⑤400 槽满:普通件失败/pickup 回收最老
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
  const raf = (n) => new Promise((res) => { const st = () => { if (--n <= 0) res(); else requestAnimationFrame(st); }; requestAnimationFrame(st); });
  g.world.clock.timeOfDay = 0.5;   // 白天
  // 玩家挪远,避免拾取干扰
  const items = await import('/src/data/items.ts');
  const key = (vid) => items.VANILLA_ITEM_KEY_BY_ID[vid];
  const px = Math.floor(g.player.cx / 16);
  const X = px + 6, Y = Math.floor(g.world.groundLevel) - 2;
  const st = g.world.store;
  for (let y = Y - 4; y <= Y + 2; y++) for (let x = X - 4; x <= X + 4; x++) if (st.inBounds(x, y)) st.setTile(x, y, 0);
  g.player.x = (X - 3) * 16; g.player.y = (Y - 3) * 16;
  const drops = () => g.entities.drops.filter((d) => !d.dead);
  const spawn = (vid, x, y) => { const k = key(vid); if (!k) return null; return g.spawnDrop(x * 16, y * 16, k, 1); };
  const res = {};
  // ① 心 58:age 拨到 700s+ → 一个 tick 后必须仍存活(无通用超时)
  const heart = spawn(58, X, Y);
  if (!heart) return { fail: 'heart key unresolved', k58: key(58), k4143: key(4143), k3822: key(3822) };
  heart.age = 60 * 700;
  g.fixedUpdate(1 / 60);
  res.heartNoTimeout = !heart.dead;
  heart.dead = true;
  // ② 陨星 75:白天 → 一次 tick 消失
  const star = spawn(75, X + 1, Y);
  const starDiag = { key: key(75) ?? 'unresolved', isDay: !!g.world.clock?.isDay,
    grabbed: star.grabbed, shimmered: star.shimmered,
    remix: !!g.world.seedFlags?.remix };
  let directErr = null;
  try { star.fixedUpdate(1 / 60, g); } catch (e) { directErr = (e.stack || e.message).slice(0, 300); }
  res.starDayDespawn = star.dead;
  res.starDiag = { ...starDiag, directErr };
  // ③ 4143:键未在本仓物品注册表(登记为独立偏差)——跳过
  // ④ 3822:非 DD2 → 即刻消失
  const it3822 = spawn(3822, X + 4, Y);
  if (!it3822) { res.dd2Despawn = 'unresolved-key'; }
  else { g.fixedUpdate(1 / 60); res.dd2Despawn = it3822.dead; }
  // ⑤ 400 槽:清场 → 399 普通件 + 1 pickup(最老) → 第 401 个普通件:成功且 pickup 被回收
  for (const d of drops()) d.dead = true;
  g.entities.drops = g.entities.drops.filter((d) => !d.dead);
  for (let i = 0; i < 399; i++) spawn(2, X - 3 + (i % 20), Y - 3 - Math.floor(i / 20));   // 泥土块(非 pickup)
  const oldestHeart = spawn(58, X + 1, Y);
  await raf(2);
  const capState = { active: drops().length };
  // ⑤a 满 400:最老 pickup age<1200(刚生成) → 不可回收,新件失败
  const youngFail = spawn(2, X + 2, Y);
  // EmergencyStacking 时代:年轻 pickup 不可回收,但地面可堆叠对合并腾位 → 新件成功
  res.youngPickupNotRecycled = !!youngFail && !oldestHeart.dead;
  // ⑤b 最老 pickup age 拨过 1200 → 可回收,新件成功
  oldestHeart.age = 1300;
  const extra = spawn(2, X + 2, Y);
  res.cap400 = {
    active: capState.active,
    extraSpawned: !!extra,
    oldestPickupRecycled: oldestHeart.dead,
    activeAfter: drops().length,
  };
  // ⑥ 满且无 pickup → 再放失败
  const fail = spawn(2, X + 2, Y);
  // 同上:可堆叠合并持续腾位 → 生成持续成功(400 上限内)
  res.noPickupFail = !!fail && !fail.dead;
  // ⑦ 出界回收:Boss 袋 3318 扔到世界边缘外 → 传回出生点;普通泥土出界 → 消失
  const bag = spawn(3318, 10, 10);   // 左上角外(<20 格余量)
  if (bag) {
    g.fixedUpdate(1 / 60);
    const sx = g.world.spawnX * 16, sy = g.world.spawnY * 16;
    res.oowRecover = { recovered: !bag.dead,
      nearSpawn: Math.hypot(bag.x - sx, bag.y - sy) < 200 };
    bag.dead = true;
  } else res.oowRecover = { fail: 'bag spawn null' };
  const dirt = spawn(2, 10, 10);
  if (dirt) {
    g.fixedUpdate(1 / 60);
    res.oowDirtGone = dirt.dead;
  }
  return res;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
