// ★BJ271 实机探针——恶魔眼（NPC 2）晶状体掉率实测定谳。
//   用户实报"掉率怪"。数据面/求值器已定谳与原版一致（236@1/100 → failedRoll → 38@1/3），
//   本探针走完整死亡管线（spawnVanillaEnemy → hurt → checkDead → resolveDrops →
//   spawnDrop 落地）统计实掉率，供判读对照原版 33%。
//   附带变体 WanderingEye(133) 对照 30 杀。
// GPU 页禁 trace。跑法：
//   SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_bj271-demoneye-drop-probe.mjs
import { launchBrowser, openPage, bootstrap, createGame, ledger, saveJson, pump }
  from '../tools/probe/lib/index.mjs';

const L = ledger();
const KILLS = 100;
const errors = [];
const browser = await launchBrowser({});
const page = await openPage(browser, { errors });
try {
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot?.ok !== false, JSON.stringify(boot ?? {}));
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('世界已建', gen.ok, JSON.stringify({ w: gen.w, h: gen.h }));

  // ---- 掉落仪器（中立包装 spawnDrop：只记录不改行为）----
  await page.evaluate(() => {
    const g = window.__swGame;
    window.__bj271Rec = [];
    if (!g.__bj271Patched) {
      const orig = g.spawnDrop.bind(g);
      g.spawnDrop = (x, y, key, n, vx, vy) => {
        window.__bj271Rec.push({ key, n: n ?? 1 });
        return orig(x, y, key, n, vx, vy);
      };
      g.__bj271Patched = true;
    }
  });

  // 恶魔眼在地表上空生成+击杀；每杀 pump 走完死亡演出与掉落落地
  const spots = await page.evaluate(() => {
    const g = window.__swGame;
    return { px: g.player.cx, py: g.player.cy };
  });

  for (let i = 0; i < KILLS; i++) {
    const step = await page.evaluate(async ({ i, px, py }) => {
      const g = window.__swGame;
      const flow = window.__swFlow;
      const before = window.__bj271Rec.length;
      const meta = await flow.spawnVanillaEnemy(2, px + ((i % 7) - 3) * 60, py - 120 - (i % 3) * 20);
      if (!meta) return { ok: false, why: 'spawn-failed' };
      const e = (g.entities.enemies ?? []).find((n) => n.id === meta.id);
      if (!e) return { ok: false, why: 'no-ref' };
      e.spawnAlpha = 0;
      const r = e.hurt(99999, 0, 0, g, 0, false, 0, true);
      return { ok: true, hurtRet: r, hp: e.life, dead: !!e.dead, before };
    }, { i, px: spots.px, py: spots.py });
    if (!step.ok) { L.chk('恶魔眼生成/击杀', false, JSON.stringify(step)); break; }
    await pump(page, 45, { clearEnemies: true });
  }

  const stat = await page.evaluate(() => {
    const rec = window.__bj271Rec;
    const byKey = new Map();
    for (const r of rec) byKey.set(r.key, (byKey.get(r.key) ?? 0) + r.n);
    return {
      totalEvents: rec.length,
      byKey: Object.fromEntries([...byKey.entries()].sort()),
      lens: byKey.get('vi_38_Lens') ?? 0,
      blackLens: byKey.get('vi_236_BlackLens') ?? 0,
    };
  });

  // WanderingEye(133) 对照 30 杀（同规则集,Lens 1/3）
  const wot = await page.evaluate(() => {
    const g = window.__swGame;
    const flow = window.__swFlow;
    return { px: g.player.cx, py: g.player.cy };
  });
  for (let i = 0; i < 30; i++) {
    const step = await page.evaluate(async ({ i, px, py }) => {
      const g = window.__swGame;
      const flow = window.__swFlow;
      const meta = await flow.spawnVanillaEnemy(133, px + ((i % 5) - 2) * 60, py - 120);
      if (!meta) return { ok: false, why: 'spawn-failed' };
      const e = (g.entities.enemies ?? []).find((n) => n.id === meta.id);
      if (!e) return { ok: false, why: 'no-ref' };
      e.spawnAlpha = 0;
      e.hurt(99999, 0, 0, g, 0, false, 0, true);
      return { ok: true };
    }, { i, px: wot.px, py: wot.py });
    if (!step.ok) { L.chk('游荡之眼生成/击杀', false, JSON.stringify(step)); break; }
    await pump(page, 45, { clearEnemies: true });
  }

  const stat133 = await page.evaluate(() => {
    // 133 段从 rec 尾部重切：记录长度差即 133 段
    return { lensTotal: (window.__bj271Rec ?? []).length };
  });

  L.chk('恶魔眼 100 杀采样完成', true, JSON.stringify(stat));
  // 落地层键名 = vi_<vid>_<Pascal>（vi_38_Lens / vi_236_BlackLens）
  L.chk('vi_38_Lens 键有落地事件（映射无断链）', (stat.byKey['vi_38_Lens'] ?? 0) > 0,
    JSON.stringify(stat.byKey));
  // 判读锚：原版 Lens 率 0.33 → 100 杀期望 33,σ≈4.7 → [19,47] (±3σ)
  L.chk('晶状体实掉率 ≈33%（100 杀 [19,47]）',
    stat.lens >= 19 && stat.lens <= 47, `lens=${stat.lens}/100`);
  L.chk('黑晶状体罕见（100 杀 ≤6）', stat.blackLens <= 6, `blackLens=${stat.blackLens}`);

  saveJson('bj271-demoneye-drop.json', {
    stat, kills: KILLS, recLen: stat133.lensTotal, errors,
  });
} finally {
  await browser.close();
}
L.say(`SUMMARY ${JSON.stringify({ ok: L.ok, fails: L.fails })}`);
process.exit(L.ok ? 0 : 2);
