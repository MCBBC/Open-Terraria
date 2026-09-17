/**
 * _drop368-flymeal.mjs v3 — FlyMeal(臭虫剑 5129)真实鼠标挥击杀旅商 368 → 商贩帽 2222
 * v2 教训:合成 input.mouseDown 不触发 use(0 use);v3 用 CDP 真实鼠标事件
 * (page.mouse.move/down/up,按住 2s 走 autoReuse 连挥)。光标钉商人盒外斜下 45px。
 * 原版锚:Player.cs:44627 FlyMeal 豁免 friendly 门 + ItemDropDatabase.cs:745 100%×1。
 * 运行:SW_ORIGIN=http://localhost:5219 node tools/probe.mjs run scripts/_drop368-flymeal.mjs
 */
import {
  launchBrowser, openPage, bootstrap, createGame, pump,
  clearEnemies, godMode, ledger, giveItems,
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

  const gi = await giveItems(page, [{ vid: 5129, n: 1 }], { wipe: true, select: 0 });
  L.chk('give FlyMeal slot0', !!gi?.ok && gi.placed?.[0]?.slot === 0, JSON.stringify(gi).slice(0, 120));

  const sp = await page.evaluate(() => {
    const g = window.__swGame;
    return import('/src/entities/TownNPC.ts').then(({ TownNPC }) => {
      const cx = g.player.cx + 42, foot = g.player.cy + 21;
      const n = new TownNPC('travelling_merchant', cx, foot);
      n.x = cx - n.w / 2; n.home = null;
      g.entities.add(n, 'npcs');
      return { ok: true, id: n.id, vid: n.vanillaId, cx: n.cx, cy: n.cy };
    });
  });
  L.chk('spawn merchant', !!sp?.ok && sp.vid === 368, JSON.stringify(sp));
  await pump(page, 10);

  // 真实鼠标目标点(屏幕坐标) = 商人盒外斜下 45px
  const tgt = await page.evaluate(({ id }) => {
    const g = window.__swGame;
    const cam = g.renderer?.camera ?? g.camera;
    const n = g.entities.npcs.find((e) => e.id === id);
    const [sx, sy] = cam.worldToScreen(n.cx, n.cy + 45);
    return { sx, sy, dialog: !!g.dialogNpc };
  }, { id: sp.id });
  L.chk('aim point', !!tgt?.sx, JSON.stringify(tgt));

  // 增量读环(每轮只扫新增段,防重复计数)
  const readNew = async (mark) => page.evaluate((mark) => {
    const g = window.__swGame;
    const r = g.recorder;
    const out = { use: 0, hurt: [], drops: [] };
    const from = mark ?? Math.max(0, r.total - 10);
    for (let j = from; j < r.total; j++) {
      const e = r.buf[j % r.buf.length];
      if (!e) continue;
      if (e.k === 'use') out.use++;
      else if (e.k === 'hurt' && e.d?.vid === 368) out.hurt.push(e.d);
      else if (e.k === 'drop') out.drops.push(e.d);
    }
    return { ...out, mark: r.total };
  }, mark);

  let mark = (await readNew(null)).mark;
  // FlyMeal 无 autoReuse（vanilla useTime 17）——连点 14 次（每次 0.4s ≥ 17t 挥拍）
  await page.mouse.move(tgt.sx, tgt.sy);
  for (let c = 0; c < 14 && c < 1e9; c++) {
    const st = await page.evaluate((id) => {
      const g = window.__swGame;
      const n = g.entities.npcs.find((e) => e.id === id);
      return n ? !n.dead : false;
    }, sp.id);
    if (!st) break;
    await page.mouse.down();
    await new Promise((r) => setTimeout(r, 60));
    await page.mouse.up();
    await new Promise((r) => setTimeout(r, 340));
  }
  const r1 = await readNew(mark); mark = r1.mark;

  const state = await page.evaluate((id) => {
    const g = window.__swGame;
    const n = g.entities.npcs.find((e) => e.id === id);
    return n ? { present: true, dead: n.dead, hp: n.hp } : { present: false };
  }, sp.id);

  const hatDropped = r1.drops.some((d) => String(d.key).includes('vi_2222'));
  L.chk('FlyMeal 挥击杀 368 → 2222 recLog', !!hatDropped,
    `use=${r1.use} hurtN=${r1.hurt.length} hurtTail=${JSON.stringify(r1.hurt.slice(-3))} drops=${JSON.stringify(r1.drops)} state=${JSON.stringify(state)}`);
  console.log('[flymeal done]');
} catch (e) {
  L.fails.push(String(e?.stack ?? e));
  console.error(e);
} finally {
  console.log('[ledger]', JSON.stringify({ fails: L.fails, lines: L.lines, elapsed: L.elapsed() }, null, 1));
  await browser.close();
}
