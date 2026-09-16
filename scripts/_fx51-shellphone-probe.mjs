// ★FX51-SP 实机探针：贝壳电话（Shellphone 5358-5361/5437）三案端到端取证
//   ① 右键转正:5437 Dummy →5358(Home),再右键 5360(Ocean)→5361(Hell)→5359(Spawn)循环
//   ② 左键传送三环境:Home(床/世界点)/Ocean(海侧带)/Hell(地狱带)/Spawn(世界出生点锚)
//   ③ 信息显示:持 5358 → equipStats.infoAccs 12 门禁全开 + infoAccs 行面板非空
// 运行:SW_ORIGIN=http://localhost:5252 node tools/run-diag.mjs scripts/_fx51-shellphone-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new',
  defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { const t = m.text(); if (t.startsWith('[probe]')) console.log(t); });
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5252', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 800));
await page.evaluate(() => {
  for (const b of document.querySelectorAll('button')) if ((b.textContent || '').includes('我已知晓')) { b.click(); break; }
});
await new Promise((r) => setTimeout(r, 700));

const result = await page.evaluate(async () => {
  const g = window.__swGame;
  const { ITEM_DEFS } = await import('/src/data/items.ts');
  const { TILE } = await import('/src/core/constants.ts');
  const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
  const slotOfVid = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);
  const out = { steps: [], errors: [] };
  const hold = (vid) => {
    for (let i = 0; i < 60; i++) g.player.inv.slots[i] = null;
    g.player.inv.slots[0] = { id: slotOfVid(vid), stack: 9 };
    g.player.inv.selected = 0;
    g.player.useTime = 0; g.player.itemAnimTicks = 0;
    g.cb.onInventoryChanged?.();
  };
  const heldVid = () => vidOf(ITEM_DEFS[g.player.inv.slots[g.player.inv.selected]?.id ?? -1] ?? {});
  const rightClickEdge = () => {      // 右键边沿一拍（Game._prevRightDown 在 updateUse 后记录）
    g.input.rightDown = true;
    g.fixedUpdate(1 / 60);
    g.input.rightDown = false;
    g.fixedUpdate(1 / 60);
  };
  // 右键循环到目标变体——原版 !tileInteractionHappened 语义:光标悬可交互格(箱/祭坛等)
  // 时 tile 交互优先消费边沿=不换型(原版本相);探针侧挪光标重试直至换到目标。
  const cycleTo = (expectedFrom, target) => {
    const tries = [];
    for (let i = 0; i < 8; i++) {
      if (heldVid() === target) break;
      const before = heldVid();
      rightClickEdge();
      tries.push(heldVid());
      if (before === expectedFrom && heldVid() === target) break;
      g.input.mouseX = (g.input.mouseX ?? 0) + 137;   // 挪光标离开交互格
      g.input.mouseX %= 800;
    }
    return tries;
  };
  const leftChannel = () => {         // 左键引导至触发拍+通道清空
    g.input.mouseDown = true;
    let fired = false;
    for (let t = 0; t < 240 && !fired; t++) {
      g.fixedUpdate(1 / 60);
      if (g.player.useTime === 0 && !g.recallChannel) fired = t > 0;
    }
    g.input.mouseDown = false;
    return fired;
  };
  const pos = () => ({ x: g.player.x, y: g.player.y, tx: Math.round(g.player.x / 16), ty: Math.round(g.player.y / 16) });

  // ---- ① Dummy 5437 右键转正 ----
  hold(5437);
  const step1 = { name: 'dummy-convert', before: heldVid() };
  rightClickEdge();
  step1.after = heldVid();
  step1.ok = step1.before === 5437 && step1.after === 5358;
  out.steps.push(step1);

  // ---- ② 5358 Home 左键传送（无床 → 世界出生点面;开局已在家=落点不变属合法） ----
  const step2 = { name: 'teleport-home', before: pos() };
  step2.fired = leftChannel();
  step2.after = pos();
  const sp = { tx: g.world.spawnX0, ty: g.world.spawnY0 };
  step2.spawn = sp;
  const distOf = (p) => Math.hypot(p.tx - sp.tx, p.ty - sp.ty);
  step2.beforeDistTiles = distOf(step2.before);
  step2.distTiles = distOf(step2.after);
  step2.moved = step2.after.x !== step2.before.x || step2.after.y !== step2.before.y;
  step2.ok = step2.fired && step2.distTiles < 60 && (step2.moved || step2.beforeDistTiles < 10);
  out.steps.push(step2);

  // ---- ③ 信息显示（持 5358 即开全组;面板行非空——等渲染拍构建） ----
  await new Promise((r) => setTimeout(r, 500));
  const gates = g.player.equipStats.infoAccs;
  const rows = (g.renderer.infoAccs?.state?.rows ?? []).map((r) => r.icon);
  out.steps.push({
    name: 'info-display',
    gates: { watch: gates.accWatch, depth: gates.accDepthMeter, compass: gates.accCompass,
      fish: gates.accFishFinder, weather: gates.accWeatherRadio, calendar: gates.accCalendar,
      thirdEye: gates.accThirdEye, jar: gates.accJarOfSouls, critter: gates.accCritterGuide,
      stopwatch: gates.accStopwatch, ore: gates.accOreFinder, dps: gates.accDreamCatcher },
    rowsIcons: rows,
    ok: gates.accWatch === 3 && gates.accDepthMeter === 1 && gates.accCompass === 1
      && gates.accFishFinder && gates.accWeatherRadio && gates.accCalendar
      && gates.accThirdEye && gates.accJarOfSouls && gates.accCritterGuide
      && gates.accStopwatch && gates.accOreFinder && gates.accDreamCatcher
      && rows.length > 0,
  });

  // ---- ④ 右键→Ocean 5360 → 传送海侧 ----
  const step4Tries = cycleTo(5358, 5360);
  const step4 = { name: 'teleport-ocean', heldAfterCycle: heldVid(), before: pos(), tries: step4Tries };
  step4.fired = leftChannel();
  step4.after = pos();
  const half = g.world.store.w / 2;
  const edgeTx = (step4.before.tx < half) ? g.world.store.w - 40 : 40;
  step4.edgeTx = edgeTx;
  step4.edgeDist = Math.abs(step4.after.tx - edgeTx);
  step4.ok = step4.fired && heldVid() === 5360 && step4.edgeDist < 420;
  out.steps.push(step4);

  // ---- ⑤ 右键→Hell 5361 → 传送地狱带 ----
  cycleTo(5360, 5361);
  const step5 = { name: 'teleport-hell', heldAfterCycle: heldVid(), before: pos() };
  step5.fired = leftChannel();
  step5.after = pos();
  step5.lavaLine = Math.round(g.world.lavaLine > 0 ? g.world.lavaLine : (g.world.store.h - 200));
  step5.inHellBand = step5.after.ty >= step5.lavaLine + 20;
  step5.ok = step5.fired && step5.inHellBand;
  out.steps.push(step5);

  // ---- ⑥ 右键→Spawn 5359 → 世界出生点锚 ----
  const step6Tries = cycleTo(5361, 5359);
  const step6 = { name: 'teleport-spawn', heldAfterCycle: heldVid(), before: pos(), tries: step6Tries };
  step6.fired = leftChannel();
  step6.after = pos();
  step6.anchorDistTiles = Math.hypot(step6.after.tx - sp.tx, step6.after.ty - sp.ty);
  step6.ok = step6.fired && step6.anchorDistTiles < 12;
  out.steps.push(step6);

  return out;
});

console.log('[probe] fx51-shellphone result=', JSON.stringify(result, null, 1));
const allOk = result.steps.every((s) => s.ok) && errors.length === 0;
console.log(`[probe] verdict=${allOk ? 'ALL-GREEN' : 'RED'} errors=${JSON.stringify(errors)}`);

await page.screenshot({ path: '/tmp/fx51-shellphone.png' });
console.log('[probe] screenshot -> /tmp/fx51-shellphone.png');
await browser.close();
process.exit(allOk ? 0 : 1);
