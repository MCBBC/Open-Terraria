// SW-FX31 波 3 探针：倒挂（gravDir=-1）持物绘制域活体烟测。
//  断言面：①倒挂态零页面错误；②drawUseItem 翻转路径真实执行且零异常；
//  ③静持/挥舞两路在倒挂态渲染循环内跑通（结构性公式/判定盒镜像由 vitest 承担）。
import { launchBrowser, openPage, bootstrap, createGame, pump, ledger,
  giveItems, installPinnedRandom } from '../tools/probe/lib/index.mjs';

const L = ledger();
const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  installPinnedRandom(page, 20260911);
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await pump(page, 60, { clearEnemies: true });

  // 村正 155 入包并选中；重力药水（buff 18）在身 → 倒挂态驻存（FX19 :26933 else 支语义）
  const give = await giveItems(page, [{ vid: 155, stack: 1 }], { select: 0 });
  L.chk('giveItems', give.ok, JSON.stringify(give.failed ?? ''));

  // 仪器：drawUseItem 调用计数 + 倒挂透传验证 + 异常捕获
  await page.evaluate(() => {
    const g = window.__swGame;
    const p = g.player;
    p.buffs.apply(61, 600);            // BuffType.Gravitation（仓内枚举 61=原版 18）
    p.gravDir = -1;
    window.__fx31 = { drawUse: 0, gravNeg: 0, err: null, hsDraw: 0 };
    const R = Object.getPrototypeOf(g.renderer);
    if (R && R.drawUseItem) {
      const orig = R.drawUseItem;
      R.drawUseItem = function (...a) {
        const pp = a[1];
        window.__fx31.drawUse++;
        if (pp && pp.gravDir === -1) window.__fx31.gravNeg++;
        try { return orig.apply(this, a); }
        catch (e) { window.__fx31.err = String((e && e.message) || e); throw e; }
      };
    } else { window.__fx31.err = 'no-drawUseItem-prototype'; }
  });

  // 造一条挥舞 swing（t/dur 与 vitest 行为测同构）→ 渲染循环内 drawUseItem 消费
  await page.evaluate(() => {
    const g = window.__swGame;
    const iid = g.player.inv.slots[0]?.id;
    g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: iid, useStyle: 1 };
  });
  await pump(page, 12, { clearEnemies: true });
  await page.evaluate(() => {
    const g = window.__swGame;
    const iid = g.player.inv.slots[0]?.id;
    g.swing = { t: 20, dur: 30, dmg: 10, kb: 3, item: iid, useStyle: 1 };
  });
  await pump(page, 12, {});

  const res = await page.evaluate(() => ({
    fx31: window.__fx31,
    gravDir: window.__swGame.player.gravDir,
  }));
  L.chk('gravDir=-1 生效', res.gravDir === -1, `gravDir=${res.gravDir}`);
  L.chk('drawUseItem 倒挂路径执行', res.fx31.gravNeg > 0,
    `drawUse=${res.fx31.drawUse} gravNeg=${res.fx31.gravNeg}`);
  L.chk('倒挂绘制零异常', !res.fx31.err, res.fx31.err ?? '');
  L.chk('页面零报错', L.fails.length === 0, L.fails.join(' | ').slice(0, 400));
  process.exit(L.exitCode());
} finally {
  await browser.close().catch(() => {});
}
