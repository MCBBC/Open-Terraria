// hover 不滚动探针（用户报"鼠标往后移会直接触发列表滚动,滚动只应由滚轮操作"）：
// ①hover 渲染窗各行 → 渲染窗 start 不变（首行配方号恒定）+ 材料格切到 hover 行
// ②滚轮 → 窗口移动 + hoverFocus 退场
// ③移出列表 → 预览回落焦点
import puppeteer from 'puppeteer-core';
const browser = await puppeteer.launch({
  executablePath: process.env.HOME + '/.cache/puppeteer/chrome/mac_arm-150.0.7871.24/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
  headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 300000,
});
const page = await browser.newPage();
page.on('pageerror', (e) => console.log('[pageerror]', String(e.message).slice(0, 200)));
await page.goto('http://localhost:5201', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000 });
const r = await page.evaluate(async () => {
  const { World } = await import('/src/world/World.ts');
  const sf = await import('/src/save/SaveFile.ts');
  const world = new World(300, 180, 777, 'hover-scroll');
  world.spawnX = 150; world.spawnY = 90;
  world.groundLevel = 60; world.rockLevel = 120; world.lavaLine = 160;
  for (let x = 0; x < 300; x++) { for (let y = 95; y < 180; y++) world.store.setTile(x, y, 1); world.store.setTile(x, 94, 3); }
  world.store.setTile(152, 93, 13);
  const parts = sf.buildSaveParts(world);
  await window.__swFlow.loadJson(sf.serializeSave(parts.view, parts.meta, parts.player, 0));
  const g = window.__swGame, ui = window.__swUI;
  const items = await import('/src/data/items.ts');
  g.player.inv.add(items.ITEM_BY_KEY[items.VANILLA_ITEM_KEY_BY_ID[9]], 999);
  ui.openInventory();
  let t0 = Date.now();
  while (ui.craftListEl.children.length < 8 && Date.now() - t0 < 3000) await new Promise((r2) => setTimeout(r2, 100));
  await new Promise((r2) => setTimeout(r2, 300));
  const rows = ui.craftListEl.children;
  const startRow = () => rows[0] ? rows[0].innerText.split('\n')[0] : null;
  const gridCnt = () => ui.craftGridEl.querySelector('.cnt')?.textContent ?? null;
  const s0 = startRow(), f0 = ui.craftFocus;
  // ① hover 窗内各行（首行→末行来回扫）
  for (let k = 0; k < rows.length; k++) {
    rows[k].dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise((r2) => setTimeout(r2, 120));
  }
  const afterHover = { start: startRow(), focus: ui.craftFocus, hover: ui.hoverFocus, grid: gridCnt() };
  // ② 移出列表 → 预览回落
  ui.craftListEl.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
  await new Promise((r2) => setTimeout(r2, 250));
  const afterLeave = { hover: ui.hoverFocus, grid: gridCnt() };
  // ③ 滚轮 → 窗口移动
  // 灵敏度（阈值 100）：60 不动；100 走 1 行；5×100 走 5 行
  ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 60, bubbles: true, cancelable: true }));
  await new Promise((r2) => setTimeout(r2, 200));
  const afterSmall = { focus: ui.craftFocus };          // 期望仍 0
  ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
  await new Promise((r2) => setTimeout(r2, 200));
  const afterOne = { focus: ui.craftFocus };            // 期望 1
  for (let k = 0; k < 5; k++) {
    ui.craftListEl.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true }));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  const afterWheel = { focus: ui.craftFocus };          // 期望 6
  // 滚动条：可见、thumb 高>0；点槽下半 → 焦点跳大
  const trk = ui.craftTrackEl, thb = ui.craftThumbEl;
  const sb = {
    visible: trk && trk.style.display !== 'none',
    thumbH: thb ? Math.round(thb.getBoundingClientRect().height) : -1,
    trackH: trk ? Math.round(trk.getBoundingClientRect().height) : -1,
  };
  if (trk) {
    const tr = trk.getBoundingClientRect();
    trk.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, clientY: tr.bottom - 2 }));
  }
  await new Promise((r2) => setTimeout(r2, 300));
  const afterJump = { focus: ui.craftFocus };
  return { s0, focus0: f0, afterHover, afterLeave, afterSmall, afterOne, afterWheel, sb, afterJump };
});
console.log(JSON.stringify(r, null, 1));
const ok = r.afterHover.start === r.s0 && r.afterHover.focus === r.focus0
  && r.afterHover.hover >= 0 && r.afterLeave.hover === -1
  && r.afterSmall.focus === 0 && r.afterOne.focus === 1 && r.afterWheel.focus === 6
  && r.sb.visible && r.sb.thumbH > 0 && r.afterJump.focus > r.afterWheel.focus;
console.log(ok ? 'PASS: hover 不滚窗只切材料格;滚轮才滚动' : 'FAIL');
await browser.close();
