/**
 * _drop368-enemy.mjs — 敌怪接触伤害杀旅商 368 → 商贩帽 2222（第五通道实测）
 *
 * 原版语义锚（敌怪×镇民接触伤,非弹幕臂）:
 *   NPC.cs:91599  townNPC 每帧 GetHurtByOtherNPCs(NPCID.Sets.AllNPCs)（:91603 蜂二遍）
 *   NPC.cs:93555-93585  GetHurtByOtherNPCs:门=dontTakeDamage/dontTakeDamageFromHostiles/
 *     immortal/immune[255]≠0;扫全表 !friendly && damage>0（非翻脸小动物）→
 *     GetMeleeCollisionData 变形盒相交 → BeHurtByOtherNPC → break
 *   NPC.cs:93588-93620  BeHurtByOtherNPC:immune[255]=30、num2=Main.DamageVar(thatNPC.damage)、
 *     StrikeNPCNoInteraction(num2, 6, ±1)（敌怪 AI 只 target 玩家;镇民被杀=其自身
 *     每帧扫描结算——夜晚敌怪拆家打死镇民=原版常见路径）
 * 本仓链:TownNPC.envHurtUpdate → enemyMeleeScan(acceptable=null) → beHurtByOtherNpc
 *   （npcVsCd=30 + DamageVar(this.rng) + this.hurt(rolled, dir*6)）→ 死亡 →
 *   townNpcDeathDrops → resolveDrops(368→2222 100%×1,ItemDropDatabase.cs:745)
 *
 * 探针几何:旅商会被危险遁走 AI(flag16,DangerDetectRange 200)拉离怪侧——每批
 *   pump 后把旅商回钉到圣骑士 439（damage 50/lifeMax 32000）盒心,只控几何不改逻辑
 *   （=玩家把它堵在怪边上的合法摆位）。期望:~7 击(50±15% −15防/2≈35/击,30t 免疫窗)
 *   杀死 → recLog drop vi_2222_PeddlersHat ×1 → 帽落地完好(无岩浆,玩家 260px 外)。
 * 运行:node tools/probe.mjs run scripts/_drop368-enemy.mjs
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump,
  clearEnemies, godMode, ledger, spawnEnemy,
} from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await pump(page, 30, { clearEnemies: true });

  // 旅商钉位 P（玩家右侧 260px）
  const P = await page.evaluate(() => {
    const g = window.__swGame;
    return import('/src/entities/TownNPC.ts').then(({ TownNPC }) => {
      const cx = g.player.cx + 260, foot = g.player.cy + 21;
      const n = new TownNPC('travelling_merchant', cx, foot);
      n.x = cx - n.w / 2; n.home = null;
      g.entities.add(n, 'npcs');
      return { ok: true, id: n.id, vid: n.vanillaId, x: n.x, y: n.y, w: n.w, h: n.h, cx: n.cx, cy: n.cy };
    });
  });
  L.chk('spawn merchant 368', !!P?.ok && P.vid === 368, JSON.stringify(P));
  await pump(page, 5);

  // 两只圣骑士 439 叠在旅商位（盒心世界像素）
  const pals = [];
  for (const dx of [0, 12]) {
    const r = await spawnEnemy(page, 439, P.cx + dx, P.cy);
    pals.push(r);
  }
  L.chk('spawn Paladin 439 ×2', pals.every((r) => r?.ok), JSON.stringify(pals.map((r) => ({ id: r?.id, hp: r?.hp }))));

  // 主循环:每批 10 tick,旅商回钉 P + 一只圣骑士回钉（防双双走散）,读增量 recLog
  const readNew = async (mark) => page.evaluate((mark) => {
    const g = window.__swGame;
    const r = g.recorder;
    const out = { hurt: [], death: [], drops: [] };
    const from = mark ?? Math.max(0, r.total - 10);
    for (let j = from; j < r.total; j++) {
      const e = r.buf[j % r.buf.length];
      if (!e) continue;
      if (e.k === 'hurt' && e.d?.vid === 368) out.hurt.push({ t: e.t, ...e.d });
      else if (e.k === 'death' && e.d?.vid === 368) out.death.push(e.t);
      else if (e.k === 'drop') out.drops.push({ t: e.t, ...e.d });
    }
    return { ...out, mark: r.total };
  }, mark);

  let mark = (await readNew(null)).mark;
  let dead = false; let hurtTicks = [];
  for (let i = 0; i < 60 && !dead; i++) {
    await pump(page, 10);
    // 几何钉位:旅商回 P,1 号圣骑士回 P（只改位置,不碰任何游戏逻辑）
    await page.evaluate(({ id, pid, px, py }) => {
      const g = window.__swGame;
      const n = g.entities.npcs.find((e) => e.id === id);
      if (n && !n.dead) { n.x = px - n.w / 2; n.y = py - n.h; }
      const p = g.entities.enemies.find((e) => e.id === pid);
      if (p && !p.dead) { p.x = px - p.w / 2; p.y = py - p.h; }
    }, { id: P.id, pid: pals[0]?.id, px: P.cx, py: P.cy });
    const r = await readNew(mark); mark = r.mark;
    hurtTicks = hurtTicks.concat(r.hurt.map((h) => h.t));
    if (r.death.length) dead = true;
  }
  const events = await readNew(Math.max(0, mark - 60));

  // 掉落桶读 + 2s 存活复核（帽落地完好:不烧不失不拾）
  const dropsNow = () => page.evaluate(() => {
    const g = window.__swGame;
    return import('/src/stats/Shimmer.ts').then(({ vanillaIdOfItem }) =>
      (g.entities.drops ?? []).filter((d) => !d.dead).map((d) => ({ vid: vanillaIdOfItem(d.itemId), n: d.stack })));
  });
  const drops1 = await dropsNow();
  await pump(page, 120);
  const drops2 = await dropsNow();
  const hat = drops2.find((d) => d.vid === 2222);

  const spacing = hurtTicks.slice(1).map((t, i) => t - hurtTicks[i]);
  L.chk('① 敌怪接触杀 368:死亡事实', dead, `deathT=${JSON.stringify(events.death)} hurtT=${JSON.stringify(hurtTicks)} spacing=${JSON.stringify(spacing)}`);
  L.chk('② 帽 2222 recLog 落地 ×1', events.drops.some((d) => String(d.key).includes('vi_2222') && d.n === 1),
    `drops=${JSON.stringify(events.drops)}`);
  L.chk('③ 帽落地完好(120t 后桶内 vid 2222 ×1)', !!hat && hat.n === 1,
    `t0=${JSON.stringify(drops1)} t+120=${JSON.stringify(drops2)}`);
  L.chk('④ 免疫窗节律 30t(BeHurtByOtherNPC immune[255]=30 签名)', spacing.length >= 3 && spacing.every((s) => s >= 28 && s <= 34),
    `spacing=${JSON.stringify(spacing)}`);
  console.log('[enemy done]');
} catch (e) {
  L.fails.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  console.log('[ledger]', JSON.stringify({ fails: L.fails, lines: L.lines, elapsed: L.elapsed() }, null, 1));
  await browser.close();
}
