// ★SW-BJ147 一次性探针：光明/夜光钥匙 × 空宝箱 → 大宝箱怪 全链 + 473 可伤害面
//  场景 A：注入空箱+光明钥匙 → openChestRef 开→关 → chestChangeEvents → 目视 475 + 箱毁
//  场景 B：夜光钥匙 → 473（腐化世界小世界）
//  场景 C：473 可伤害面（协调者插报"腐化宝箱怪不掉血"）：spawnVanillaEnemy → hurt() 实扣
//  场景 D：真实命中面——玩家持剑挥击命中伪装态 473（hitbox 对位验证,排除"打不到"体感）
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5243';

const boot = async (browser, tag) => {
  const page = await browser.newPage();
  page.setDefaultTimeout(60000);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(ORIGIN + '/?play=small&mimic' + Date.now() + '=1', { waitUntil: 'domcontentloaded', timeout: 60000 });
  let ok = false;
  for (let i = 0; i < 90 && !ok; i++) {
    ok = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
    if (!ok) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!ok) throw new Error(tag + ' 未进游戏');
  await new Promise((r) => setTimeout(r, 1200));
  // 出生点清场窗口（spawn-embed 家族 ForceClearArea）会清玩家近旁 tile——settle 8s 再铺
  await new Promise((r) => setTimeout(r, 8000));
  return { page, errors };
};

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const out = {};

// ================= 场景 A：光明钥匙 → 475 =================
{
  const { page, errors } = await boot(browser, 'mimicA');
  out.A = await page.evaluate(async () => {
    const g = window.__swGame;
    const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    g.world.flags.hardMode = true;
    g.world.flags.downed_262 = true;
    const st = g.world.store;
    const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) - 30;   // 出生清场半径外
    const chestTile = TILE_BY_KEY['chest'];
    const fx = 0;
    st.setTile(tx, ty, chestTile, fx, 0);
    st.setTile(tx + 1, ty, chestTile, fx + 18, 0);
    st.setTile(tx, ty + 1, chestTile, fx, 18);
    st.setTile(tx + 1, ty + 1, chestTile, fx + 18, 18);
    const chestData = { x: tx, y: ty, items: [{ id: invIndexOfVanilla(3092), stack: 1 }, null, null, null, null, null, null, null, null, null] };
    g.world.chests.push(chestData);
    const before = g.entities.enemies.filter((e) => !e.dead).map((e) => e.vanillaId);
    // 模拟开箱→关箱拍
    g.openChestRef = () => chestData;
    g.chestChangeEvents();
    g.openChestRef = () => null;
    g.chestChangeEvents();
    await new Promise((r) => setTimeout(r, 600));
    const after = g.entities.enemies.filter((e) => !e.dead && e.vanillaId != null).map((e) => ({ id: e.vanillaId, x: Math.round(e.x), y: Math.round(e.y), hp: e.hp, maxHp: e.maxHp }));
    const tileLeft = [0, 0, 0, 0].map((_, i) => st.type[st.idx(tx + (i % 2), ty + Math.floor(i / 2))]);
    return {
      chestGone: !g.world.chests.includes(chestData),
      tileCleared: tileLeft.every((t) => t === 0),
      mimic475: after.find((e) => e.id === 475) ?? null,
      enemiesBefore: before.length,
      enemiesAfter: after,
      chestStill: g.world.chests.length,
      errors: [],
    };
  });
  out.A.errors = errors;
  try { await page.screenshot({ path: '/tmp/mimic-probe-A-475.png' }); } catch { /* 无头视口态无关紧要 */ }
  await page.close();
}

// ================= 场景 B：夜光钥匙 → 473（腐化世界） =================
{
  const { page, errors } = await boot(browser, 'mimicB');
  out.B = await page.evaluate(async () => {
    const g = window.__swGame;
    const { invIndexOfVanilla } = await import('/src/data/vanillaRecipes.ts');
    const { TILE_BY_KEY } = await import('/src/data/tiles.ts');
    g.world.flags.hardMode = true;
    g.world.crimson = false;   // 腐化世界 → 473
    const st = g.world.store;
    const tx = Math.round(g.player.cx / 16) + 100, ty = Math.round(g.player.cy / 16) - 30;   // 出生清场半径外
    const chestTile = TILE_BY_KEY['chest'];
    st.setTile(tx, ty, chestTile, 0, 0);
    st.setTile(tx + 1, ty, chestTile, 18, 0);
    st.setTile(tx, ty + 1, chestTile, 0, 18);
    st.setTile(tx + 1, ty + 1, chestTile, 18, 18);
    const chestData = { x: tx, y: ty, items: [{ id: invIndexOfVanilla(3091), stack: 1 }, null, null, null, null, null, null, null, null, null] };
    g.world.chests.push(chestData);
    const diag = {
      nightIid: invIndexOfVanilla(3091), lightIid: invIndexOfVanilla(3092),
      hardMode: g.world.flags.hardMode, crimson: g.world.crimson,
      inBounds: st.inBounds(tx, ty),
      tileAt: st.type[st.idx(tx, ty)],
      sheetAt: (await import('/src/data/tiles.ts')).TILE_DEFS[st.type[st.idx(tx, ty)]]?.vanilla?.sheet,
      found: g.world.chests.some((c) => c.x === tx && c.y === ty),
    };
    g.openChestRef = () => chestData;
    g.chestChangeEvents();
    g.openChestRef = () => null;
    g.chestChangeEvents();
    await new Promise((r) => setTimeout(r, 600));
    const mimic = g.entities.enemies.find((e) => !e.dead && e.vanillaId === 473);
    return {
      diag,
      mimic473: mimic ? { x: Math.round(mimic.x), y: Math.round(mimic.y), hp: mimic.hp, maxHp: mimic.maxHp, w: mimic.w, h: mimic.h } : null,
      chestGone: !g.world.chests.includes(chestData),
    };
  });
  out.B.errors = errors;

  // ================= 场景 C：473 可伤害面（hurt 实扣） =================
  out.C = await page.evaluate(async () => {
    const g = window.__swGame;
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    const e = spawnVanillaEnemy(g, 473, g.player.cx, g.player.cy + 40);
    if (!e) return { error: 'spawn null' };
    e.y -= e.h / 2;
    const hp0 = e.hp;
    const def0 = { dontTakeDamage: e.dontTakeDamage, immortal: e.immortal, def: e.def?.hp, defDef: e.def?.defense, lifeMax: e.vanilla?.lifeMax };
    const r1 = e.hurt(100, 0, 0, g, 0, false, 1, true);       // 单发弹语义（pierce=1 豁免免疫窗）
    const hp1 = e.hp;
    const r2 = e.hurt(60, 0, 0, g, 0, false, 0, true);        // 非弹语义（近战档）
    const hp2 = e.hp;
    await new Promise((r) => setTimeout(r, 300));
    return {
      def0,
      strike1: { ret: r1, hpDelta: hp0 - hp1 },
      strike2: { ret: r2, hpDelta: hp1 - hp2 },
      hpNow: e.hp,
      ai0: e.ai0,   // 受击应已唤醒（0 伪装 → 1+）
      takeable: hp0 - hp2 > 0,
    };
  });
  try { await page.screenshot({ path: '/tmp/mimic-probe-C-473.png' }); } catch { /* 同上 */ }

  // ================= 场景 D：真实挥击命中伪装态 473（BJ233 重制） =================
  //  旧判据欠功效（BJ174 报告自注 harness 限界）：等 g.playerSwingHitEnemies()
  //  （不存在的 API → hitApi absent = 空转,零实证）。
  //  新判据：真实输入链驱动（_autoreuse-probe 习语）——持真剑 vi_7 银阔剑 →
  //  input.mouseDown+fixedUpdate 循环 → updateUse 起手建 swing → updateSwingHits
  //  （Game.ts:31387 近战盒 × 敌怪盒逐拍结算）→ 断言伤害面 hpDelta≥1（原版 min 1
  //  保底）+ 命中面 justHitT/击退面 vx 命中瞬采样（justHitT=2 逐拍衰减,须当场记）。
  out.D = await page.evaluate(async () => {
    const g = window.__swGame;
    const { spawnVanillaEnemy } = await import('/src/entities/bossAI.ts');
    // 清场:除目标外全部 vanilla 敌怪摘除（C 臂/B 段遗留怪不串味采样）
    const e = spawnVanillaEnemy(g, 473, g.player.cx + 40, g.player.cy);
    if (!e) return { error: 'spawn null' };
    e.y -= e.h / 2;
    for (const en of g.entities.enemies) if (en !== e && !en.dead && en.vanillaId != null) en.dead = true;
    // 底锚落稳 20 拍（自然落地到真实地面,再贴脸——防空挥盒错位）
    for (let i = 0; i < 20; i++) g.fixedUpdate(1 / 60);
    e.ai0 = 0; e.ai1 = 0; e.vx = 0; e.vy = 0;   // 强制伪装态（先打再唤醒序）
    const hp0 = e.hp;
    // 持真剑（vi_7 银阔剑 melee damage>0——近战整体门 Player.cs:42964 要求 damage>0）
    const van = await (await fetch('sprites/vanilla.json')).json();
    let key = null;
    for (const [idStr, m] of Object.entries(van.items ?? {})) {
      if (Number(idStr) === 7) { key = 'vi_7_' + String(m.key).replace(/[^A-Za-z0-9]/g, ''); break; }
    }
    const id = key != null ? window.__swItems?.[key] : undefined;
    if (id === undefined) return { error: 'no-item-id', key };
    const p = g.player;
    const saved = p.inv.slots[p.inv.selected];
    p.inv.slots[p.inv.selected] = { id, stack: 1 };
    g.cb?.onInventoryChanged?.();
    // 贴脸站位（玩家右缘距怪左缘 ~10px,挥盒必达）+ 鼠标指向怪盒心（起手 ChangeDir 到光标侧）
    p.x = e.x - 30; p.y = e.y + e.h - p.h;
    p.direction = 1;
    const [sx, sy] = g.camera.worldToScreen(e.x + e.w / 2, e.y + e.h / 2);
    g.input.mouseX = sx; g.input.mouseY = sy;
    g.input.mouseDown = true;
    let swings = 0, last = null, hitTick = -1, justHitAtHit = false, vxAtHit = 0, ai0AtHit = -1;
    for (let i = 0; i < 90; i++) {
      g.fixedUpdate(1 / 60);
      if (g.swing && g.swing !== last) { swings++; last = g.swing; }
      if (!g.swing) last = null;
      if (hitTick < 0 && e.hp < hp0) {   // 命中瞬采样（justHitT/kb 逐拍衰减,当场记）
        hitTick = i;
        justHitAtHit = e.justHitT > 0;
        vxAtHit = Math.abs(e.vx);
        ai0AtHit = e.ai0;
        break;
      }
    }
    g.input.mouseDown = false;
    const hpDelta = hp0 - e.hp;
    const res = {
      swingChain: 'real-input(mouseDown+fixedUpdate→updateSwingHits)',
      swings, hitTick,
      hpDelta,                       // 伤害面（主断言 ≥1）
      justHitAtHit,                  // 命中面
      vxAtHit,                       // 击退面（命中瞬残余速度,信息面）
      ai0AtHit, ai0After: e.ai0,     // 唤醒序（信息面:贴近 80px 唤醒=原版本相）
      hitLanded: hitTick >= 0 && hpDelta >= 1,
    };
    p.inv.slots[p.inv.selected] = saved;   // 还原持物
    g.cb?.onInventoryChanged?.();
    return res;
  });
  await page.close();
}

await browser.close();
console.log(JSON.stringify(out, null, 1));
// BJ233 判据:D 臂=真实挥击命中伪装态宝箱怪的有效断言（伤害面 ≥1 为门,命中/击退面同证）
const dOk = !!(out.D && out.D.hitLanded);
console.log(dOk ? '[mimic-probe] D-ARM PASS' : '[mimic-probe] D-ARM FAIL');
process.exit(dOk ? 0 : 1);
