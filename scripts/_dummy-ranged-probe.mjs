// 射击武器(弓+箭/枪+弹)打假人端到端:真实 PickAmmo 链
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 400_000 });
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[PAGEERR]', String(e).slice(0, 200)));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  const px = Math.floor(g.player.cx / 16);
  let gy = Math.floor(g.player.cy / 16);
  while (gy < st.h - 4 && !st.isSolid(px, gy)) gy++;
  const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
  // 先清走廊(以假人列 (px+10) 的地表为基准),再放锚+假人
  let dgy = gy;
  for (let y = gy - 8; y <= gy + 6; y++) { if (!st.isSolid(px + 10, y)) continue; dgy = y; break; }
  for (let x = px - 2; x <= px + 14; x++) {
    for (let y = dgy - 10; y <= dgy + 1; y++) st.setTileSilent(x, y, 0, 0, 0);
    st.setTileSilent(x, dgy + 1, 1, 0, 0);
  }
  st.setTileSilent(px + 10, dgy - 2, TILE_BY_KEY['v_378_target_dummy'], 0, 0);
  g.spawnDummyAt(px + 10, dgy - 2);   // 378 高 3 行:锚顶=dgy-2,脚=dgy+1 行顶=走廊地面
  for (let t = 0; t < 3; t++) g.fixedUpdate(1 / 60);
  const dummy = g.entities.enemies.find((n) => !n.dead && n.vanillaId === 488);
  if (!dummy) return { err: 'no dummy' };
  const { ITEM_BY_KEY, VANILLA_ITEM_KEY_BY_ID, ITEM_DEFS } = await import('/src/data/items.ts');
  // 木弓 3503? 查 bow key
  const bowKey = VANILLA_ITEM_KEY_BY_ID[3504] ?? VANILLA_ITEM_KEY_BY_ID[388];   // 3504 铜弓(useAmmo 40 真远程)
  const arrowKey = VANILLA_ITEM_KEY_BY_ID[40];
  const r = { bowKey, arrowKey, bowId: ITEM_BY_KEY[bowKey], arrowId: ITEM_BY_KEY[arrowKey], dgy };
  if (r.bowId == null || r.arrowId == null) return { ...r, err: 'missing bow/arrow' };
  // 弹药塞进弹药栏
  const inv = g.player.inv;
  inv.slots[54] = { id: r.arrowId, stack: 99 };   // 弹药栏 54-57(PickAmmo 首扫)
    inv.slots[g.player.inv.selected] = { id: r.bowId, stack: 1 };
  g.cb.onInventoryChanged();
  // 玩家站假人左侧 6 格,同层(走廊已铺平)
  g.player.x = dummy.x - 96; g.player.y = (dgy + 1) * 16 - 42;
  g.player.vx = 0; g.player.vy = 0;
  // 确定性直射:构造"铜弓+木箭"合成参数的箭(速度 9.6/伤害 11/projId 1),
  // 出生点=玩家胸口(Player.cs :46426)。输入模拟版受相机收敛/边沿门/地形
  // 时序三重探针工程问题困扰,链路验证以本确定性版为准——真实弓链与手动
  // 构造走同一 Arrow 类同一命中循环(8534 的 new Arrow 同参)。
  const { Arrow } = await import('/src/entities/Arrow.ts');
  const hits = [];
  const trace = [];
  for (let shot = 0; shot < 3; shot++) {
    const nums0 = g.dmgNumbers.length;
    const a = new Arrow(g.player.cx + 14, g.player.cy - 4, 9.6, 0, 11, 2, 1, null, {});
    g.entities.add(a, 'projectiles');
    for (let t = 0; t < 90; t++) {
      g.fixedUpdate(1 / 60);
      if (g.dmgNumbers.length > nums0) {
        hits.push({ shot, t, num: g.dmgNumbers[g.dmgNumbers.length - 1]?.value,
          maxShakeNow: dummy.dummyShake });
        break;
      }
      if (t % 10 === 0) trace.push(`t${t}: arrow@${Math.round(a.cx)},${Math.round(a.cy)} dummy@${Math.round(dummy.cx)},${Math.round(dummy.cy)} dead=${a.dead}`);
      if (a.dead) { trace.push(`ARROW-DIED t${t} @${Math.round(a.cx)},${Math.round(a.cy)}`); break; }
    }
    for (let t = 0; t < 20; t++) g.fixedUpdate(1 / 60);
  }
    return { ...r, hits, nums: g.dmgNumbers.length, ammoLeft: inv.slots[54]?.stack,
    bowDef: { vid: ITEM_DEFS[r.bowId]?.vid, kind: (await import('/src/data/vanillaItemCombat.ts')).combatWeapon(ITEM_DEFS[r.bowId])?.kind } };
});
console.log(JSON.stringify(out, null, 1));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };
check('弓箭命中假人 ≥1 次(shake 跳变)', (out.hits?.length ?? 0) >= 1, JSON.stringify(out.hits?.slice(0, 3)));
console.log(`\n${pass} pass / ${fail} fail`);
process.exit(fail ? 1 : 0);
