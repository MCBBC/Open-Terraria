// FX60 重铸连点探针:哥布林工匠锤钮连击 5 次量化逐击间隔+重铸执行计数。
// 原版节奏(Main.cs:42370/:42626):mouseLeftRelease 边沿即重铸,普通档零冷却
// (reforgeCooldown=60 仅最优档掷中才置,且鼠标离锤即清 :42279)。
// 用法:SW_ORIGIN=http://localhost:5269 node tools/run-diag.mjs scripts/_fx60-reforge-spam.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', defaultViewport: { width: 1280, height: 800 },
  protocolTimeout: 600000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('PAGE ERROR:', e.message));
await page.goto(ORIGIN, { waitUntil: 'networkidle0', timeout: 120000 });
await page.waitForFunction(() => typeof window.__swFlow === 'object' && !!window.__swFlow?.loadJson, { timeout: 120000 });
await page.evaluate(async () => { await window.__swFlow.newWorld('424242', 4200, 1200); });
await page.waitForFunction(() => !!window.__swGame, { timeout: 300000, polling: 500 });
await new Promise((r) => setTimeout(r, 2000));

const report = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  if (!g || !ui) return { error: '__swGame/__swUI 缺失' };
  // 经济面桩化(探针只测节奏,不测账目):买得起+扣得动
  g.coinsOwned = () => 9999999;
  g.spendCopper = () => true;
  // 选一把可重铸物(池≥3):扫描 vid → 可掷池(与 Game.doReforge 同式 vid 推导)
  const { ITEM_DEFS, ITEM_BY_KEY } = await import('/src/data/items.ts');
  const pfxMod = await import('/src/data/vanillaPrefixes.ts');
  let picked = null;
  for (const [key, idRaw] of Object.entries(ITEM_BY_KEY)) {
    const id = Number(idRaw);
    const d = ITEM_DEFS[id];
    if (!d || !Number.isFinite(id)) continue;
    const vid = d.vid ?? (d.key?.startsWith('vi_') ? parseInt(d.key.slice(3), 10) : -1);
    if (!Number.isFinite(vid) || vid <= 0) continue;
    const pool = pfxMod.rollablePrefixes(vid, !!d.accessory);
    if (pool && pool.length >= 3 && pfxMod.prefixValueMul) {
      const best = Math.max(...pool.map(pfxMod.prefixValueMul));
      picked = { id, vid, key, poolLen: pool.length, best };
      if (pool.length >= 8) break;   // 池越大 top-tier 越难中(1/len),连点样本越稳
    }
  }
  if (!picked) return { error: '无可重铸物' };
  // 打开重铸面板(真实入口 showReforge;vanilla 布局 → vinv 原位面)
  ui.vinvReforgeVisible = () => true;   // 探针侧显示门直通(免真实对话 NPC;仅影响布点)
  ui.showReforge();
  ui.reforgeItem = { id: picked.id, stack: 1, prefix: 0 };
  ui.refreshAll();
  await new Promise((r) => setTimeout(r, 400));   // 等 vinvUpdateReforge 拍回写+重排
  const hammer = ui.vinvReforgeHammerEl;
  if (!hammer) return { error: '锤钮元素缺失', picked };

  // doReforge 计数包装(先装再点;透传 out)
  const orig = g.doReforge.bind(g);
  const execs = [];
  g.doReforge = (item, out) => {
    const np = orig(item, out);
    execs.push({ t: performance.now(), np, topTier: !!(out && out.topTier) });
    return np;
  };

  const clickOnce = () => {
    const before = performance.now();
    const cdBefore = ui.vinvReforgeCooldownUntil ?? 0;
    hammer.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
    const after = performance.now();
    return { dispatchAt: before, handlerMs: +(after - before).toFixed(2), cdBefore, cdAfter: ui.vinvReforgeCooldownUntil ?? 0 };
  };

  const runs = {};
  for (const [name, gapMs] of [['human_spam_45ms', 45], ['machine_burst_0ms', 0]]) {
    ui.vinvReforgeCooldownUntil = 0;   // 每轮清冷(上一轮余量不污染)
    execs.length = 0;
    const clicks = [];
    for (let i = 0; i < 5; i++) {
      clicks.push(clickOnce());
      if (gapMs) await new Promise((r) => setTimeout(r, gapMs));
    }
    runs[name] = {
      clicks,
      executed: execs.length,
      // 相邻两次「执行」的间隔 ms(用户感知节奏);单执行= null
      execIntervals: execs.slice(1).map((e, i) => +(e.t - execs[i].t).toFixed(2)),
      topTierHits: execs.filter((e) => e.topTier).length,
      prefixes: execs.map((e) => e.np),
    };
  }
  const shot = { picked, runs, hammerVisible: hammer.getBoundingClientRect().width > 0 };
  window.__fx60 = shot;
  return shot;
});
console.log(JSON.stringify(report, null, 1));
if (!report.error) {
  await page.screenshot({ path: '/tmp/fx60-reforge-spam.png' });
  console.log('screenshot -> /tmp/fx60-reforge-spam.png');
}
await browser.close();
