// RB31b r3(收敛轮):A5 向导态(补 npcDialogActive 桩)/A7 滚动条(合成条目+主动 sync)/
// A3a furniture 滤+B4 断言修正+B6 playerState 修正+C2(仅存侧)/C3/C4/D。
// 运行:SW_ORIGIN=http://localhost:5265 node tools/run-diag.mjs scripts/_rb31b-craft-save-r3.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5265';
const fails = [];
const ok = (cond, name, extra = '') => { console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${extra ? '  ' + extra : ''}`); if (!cond) fails.push(name); };
const note = (name, extra = '') => console.log(`INFO ${name}${extra ? '  ' + extra : ''}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, defaultViewport: { width: 1600, height: 1000 } });
const newPage = async () => {
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e.stack || e.message).slice(0, 300)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 200)); });
  page.__errs = errs;
  await page.goto(`${ORIGIN}/?play=small&invlayout=vanilla`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 300000, polling: 1000 });
  await sleep(400);
  await page.evaluate(() => {
    document.getElementById('sw-welcome-announce')?.remove();
    window.__swUI.closeInventory();
    window.__md = (el) => el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  });
  await sleep(150);
  return page;
};

/* ---------- A:modern 窗收尾(A3a/A5/A7) ---------- */
const pageA = await newPage();
try {
  await pageA.evaluate(async () => {
    const ui = window.__swUI, g = window.__swGame;
    ui.openInventory(true);
    await ui.refreshAllAsync();
    const wid = g.itemId('vi_9_Wood');
    if (wid > 0) g.player.inv.add(wid, 500);
    await ui.refreshAllAsync();
    const vinv = document.querySelector('.sw-vinv');
    const toggle = [...vinv.querySelectorAll('.vinv-btn')].find((b) => b.querySelector('img')?.src.includes('Craft_Toggle_'));
    window.__md(toggle);
  });
  await pageA.waitForFunction(() => window.__swUI.vinvModernCraftOpen === true, { timeout: 15000, polling: 120 });
  await sleep(250);

  // A3a:furniture 滤(平台 frameImportant→furniture) + 条目画像观测
  const A3a = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    const prof = ui.vinvModernEntries.map((e) => {
      const it = mc.filterItemOfVid(e.r.create);
      return { vid: it.vid, ct: it.createTile, cw: it.createWall, fi: it.frameImportant };
    });
    const b = ui.vinvModernFilterBtns[4];   // furniture
    window.__md(b);
    const nF = ui.vinvModernEntries.length;
    const allF = ui.vinvModernEntries.every((e) => mc.filterFits('furniture', mc.filterItemOfVid(e.r.create)));
    window.__md(b);
    return { prof, nF, allF, before: ui.vinvModernEntries.length };
  });
  ok(A3a.nF > 0 && A3a.allF, 'A3a furniture 单选:条目全过 frameImportant 类判据(平台→furniture 非 buildingBlock)', JSON.stringify(A3a));

  // A5:向导态(补 npcDialogActive 桩——退出臂门)
  const A5 = await pageA.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    window.__npcSaved = g.npcDialogActive;
    g.npcDialogActive = true;                 // 桩:向导对话活跃(退出臂 :42396 门)
    ui.vinvCloseModernCraft(true);
    ui.openVanillaGuideCraft();
    const wood = g.itemId('vi_9_Wood');
    ui.guidePlaced = { id: wood, stack: 10 };
    ui.vinvUpdateModernCraft();
    const win = ui.vinvModernCraftEl;
    const wr = win.getBoundingClientRect();
    const rel = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - wr.x).toFixed(1), t: +(b.y - wr.y).toFixed(1) }; };
    return {
      open: ui.vinvModernCraftOpen, guide: ui.vinvGuideMenuOpen,
      n: ui.vinvModernEntries.length,
      slot: rel(ui.vinvGuideSlotModernEl), cap: rel(ui.vinvGuideModernCaptionEl), req: rel(ui.vinvGuideModernReqEl),
      detailHidden: ui.vinvModernDetailEl.style.display === 'none',
      selected: ui.vinvModernSelected,
    };
  });
  ok(A5.open && A5.guide && A5.selected === null, 'A5a 向导态开窗=窗开+向导旗+无预选(详情不画)', JSON.stringify({ open: A5.open, guide: A5.guide, n: A5.n, sel: A5.selected }));
  ok(A5.detailHidden, 'A5a-2 向导态首入详情浮层隐藏', '');
  ok(Math.abs(A5.slot.l - 24) <= 1 && Math.abs(A5.slot.t - 131) <= 1 && Math.abs(A5.cap.l - 76) <= 1 && Math.abs(A5.cap.t - 146) <= 1, 'A5b 向导槽/文案锚=(24,131)/(76,146)(刀19 锚位)', JSON.stringify(A5.slot));
  const A5c = await pageA.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    const cell = ui.vinvModernCellEls[0]?.el;
    if (!cell) return { err: 'no cells' };
    window.__md(cell);                                     // 点选
    const detail = ui.vinvModernDetailEl;
    const win = ui.vinvModernCraftEl;
    const dw = win.getBoundingClientRect(), dd = detail.getBoundingClientRect();
    const relD = (el) => { const b = el.getBoundingClientRect(); return { l: +(b.x - dd.x).toFixed(1), t: +(b.y - dd.y).toFixed(1) }; };
    const kids = [...detail.children].map(relD);
    const cntEls = [...detail.children].filter((c) => c.tagName === 'DIV' && c.style.pointerEvents === 'none');
    const wood = g.itemId('vi_9_Wood');
    const before = g.player.inv.countOf(wood);
    window.__md(cell);                                     // 已选再点=:42988 门
    const after = g.player.inv.countOf(wood);
    return {
      dRelWin: { l: +(dd.x - dw.x).toFixed(1), t: +(dd.y - dw.y).toFixed(1) },
      kids, ownedShown: cntEls.some((d) => d.style.display !== 'none'),
      noCraft: after === before,
    };
  });
  ok(A5c.dRelWin && Math.abs(A5c.dRelWin.l - 24) <= 1 && Math.abs(A5c.dRelWin.t - 73) <= 1, 'A5c-1 向导态详情容器=win+(24,73)(相对系无双重偏移)', JSON.stringify(A5c.dRelWin));
  ok(A5c.kids[0] && A5c.kids[0].l === 0 && A5c.kids[0].t === 0, 'A5c-2 向导态成品槽=容器相对(0,0)', JSON.stringify(A5c.kids.slice(0, 2)));
  ok(A5c.ownedShown === false, 'A5c-3 向导态拥有数整支不画(:482 !InGuideCraftMenu 门)', JSON.stringify({ ownedShown: A5c.ownedShown }));
  ok(A5c.noCraft, 'A5c-4 反查态点已选格不合成(:42988 门)', '');
  // 退出向导态(关窗)复原
  await pageA.evaluate(() => {
    const ui = window.__swUI, g = window.__swGame;
    ui.vinvCloseModernCraft(true);
    ui.vinvGuideMenuOpen = false;
    ui.vinvReturnGuidePlaced?.();
    g.npcDialogActive = window.__npcSaved;
  });

  // A7:滚动条(合成 120 条+主动 sync)
  const A7 = await pageA.evaluate(async () => {
    const ui = window.__swUI;
    const mc = await import('/src/ui/modernCrafting.ts');
    ui.vinvOpenModernCraft(null, true);
    const K = (() => { const tr = getComputedStyle(document.querySelector('.sw-vinv')).transform; return tr && tr !== 'none' ? parseFloat(tr.slice(7).split(',')[0]) : 1; })();
    const savedEntries = ui.vinvModernEntries, savedSel = ui.vinvModernSelected, savedSig = ui.vinvModernCellsSig;
    ui.vinvModernSelected = null;
    ui.vinvModernEntries = Array.from({ length: 120 }, (__, i) => savedEntries[i % Math.max(1, savedEntries.length)]);
    ui.vinvModernCellsSig = 'probe';
    const g = mc.mcraftGridGeometry(window.innerHeight / K, 120, false);
    ui.vinvSyncModernScroll();
    const pr = ui.vinvModernPanelEl.getBoundingClientRect();
    const sr = ui.vinvModernScrollbarEl.getBoundingClientRect();
    const hr = ui.vinvModernScrollHandle.getBoundingClientRect();
    const canScroll = g.contentH > g.list.h;
    const pos = ui.vinvModernViewPos;
    const maxV = Math.max(1, g.contentH);
    const expHandleTop = Math.trunc(g.scrollbar.innerH * (pos / maxV)) + 2;
    const expHandleH = Math.trunc(g.scrollbar.innerH * (g.list.h / maxV)) + 7;
    // 点轨下端
    const before = ui.vinvModernViewPos;
    const ev = { bubbles: true, button: 0, clientX: sr.x + 10, clientY: sr.y + sr.height - 3 };
    ui.vinvModernScrollbarEl.dispatchEvent(new MouseEvent('mousedown', ev));
    const after = ui.vinvModernViewPos;
    window.dispatchEvent(new MouseEvent('mouseup', ev));
    // 拖柄到底钳制
    const hb = hr;
    ui.vinvModernScrollHandle.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0, clientX: hb.x + 10, clientY: hb.y + 5 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: hb.x + 10, clientY: hb.y + hb.height + 500 }));
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    const dragEnd = ui.vinvModernViewPos;
    const maxExp = Math.max(0, g.contentH - g.list.h);
    ui.vinvModernEntries = savedEntries; ui.vinvModernSelected = savedSel; ui.vinvModernCellsSig = savedSig;
    ui.vinvUpdateModernCraft();
    return {
      canScroll,
      sbar: { top: +(sr.y - pr.y).toFixed(1), h: +sr.height.toFixed(1), w: +sr.width.toFixed(1), vis: sr.width > 0 },
      expSbar: { top: g.scrollbar.y - g.panel.y, h: g.scrollbar.h },
      handle: { top: +(hr.y - sr.y).toFixed(1), h: +hr.height.toFixed(1) },
      expHandle: { top: expHandleTop, h: expHandleH },
      trackClickMoved: after !== before, before, after, dragEnd, maxExp,
    };
  });
  ok(A7.canScroll && Math.abs(A7.sbar.top - A7.expSbar.top) <= 1 && Math.abs(A7.sbar.h - A7.expSbar.h) <= 1.5, 'A7a 滚动条轨盒=元素矩形(container.y+15/h-19)', JSON.stringify({ got: A7.sbar, exp: A7.expSbar }));
  ok(Math.abs(A7.handle.top - A7.expHandle.top) <= 1 && Math.abs(A7.handle.h - A7.expHandle.h) <= 1.5, 'A7b 柄盒=柄矩形本体(top=+2+innerH·pos/max,h=+7 不扩盖)', JSON.stringify({ got: A7.handle, exp: A7.expHandle }));
  ok(A7.trackClickMoved, 'A7c 点轨=翻页(LeftMouseDown Contains 域)', JSON.stringify({ before: A7.before, after: A7.after }));
  ok(Math.abs(A7.dragEnd - A7.maxExp) <= 2, 'A7d 拖柄到底=ViewPosition 钳 max-view', JSON.stringify({ dragEnd: A7.dragEnd, maxExp: A7.maxExp }));

  const errsA = pageA.__errs.filter((e) => !e.includes('favicon'));
  ok(errsA.length === 0, 'A-ERR 页面零异常', errsA.join(' | ').slice(0, 300));
} catch (e) {
  fails.push('PART-A exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-A exception: ' + String(e).slice(0, 500));
}

/* ---------- B 收尾(B4 断言修正/B6 修正)+C2(存侧)/C3/C4+D ---------- */
const pageB = await newPage();
try {
  const B4 = await pageB.evaluate(async () => {
    const g = window.__swGame;
    const { ITEM_DEFS } = await import('/src/data/items.ts');
    const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
    const cfIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 966);
    const snowIdx = ITEM_DEFS.findIndex((d) => vidOf(d) === 3048);
    const inv = g.player.inv, st = g.world.store;
    const bx = Math.floor(g.player.cx / 16) + 4, by = Math.floor(g.player.cy / 16) + 2;
    for (let dx = -3; dx <= 3; dx++) { st.setTileSilent(bx + dx, by, 1); for (let dy = -3; dy <= -1; dy++) st.setTileSilent(bx + dx, by + dy, 0); }
    g.scene.zoneSnow = true; g.scene.belowSurface = false; g.scene.zoneUnderworldHeight = false;
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: cfIdx, stack: 5 };
    g.tryPlace(bx, by - 1, ITEM_DEFS[cfIdx]);
    const conv = { fx: st.frameX[st.idx(bx, by - 1)], stack: inv.slots[inv.selected]?.stack };
    for (let dx = -2; dx <= 2; dx++) { st.setTileSilent(bx + dx, by - 1, 0); st.setTileSilent(bx + dx, by - 2, 0); }
    g.player.useTime = 0;
    inv.slots[inv.selected] = { id: snowIdx, stack: 5 };
    g.tryPlace(bx, by - 1, ITEM_DEFS[snowIdx]);
    const expl = { fx: st.frameX[st.idx(bx, by - 1)] };
    g.scene.zoneSnow = false;
    return { conv, expl, same: conv.fx === expl.fx, style: Math.floor(conv.fx / 54) };
  });
  ok(B4.same && B4.style === 3, 'B4a 雪原持普通营火→放置=显式雪原营火同帧(style3,BiomeCampfirePlaceStyle)', JSON.stringify(B4));

  const B6 = await pageB.evaluate(async () => {
    try {
      const pli = await import('/src/save/PlrImport.ts');
      const st = {
        hp: 400, baseMaxHp: 400, mana: 100, baseMaxMana: 100,
        inventory: [{ id: 0, stack: 0 }], armor: [], dye: [], banks: [[], [], [], []],
        miscEquips: [], miscDyes: [], buffs: [],
        builderAccStatus: [0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
        hbLocked: false, enabledSuperCart: true,
        permanentUpgrades: { extraAccessory: false, usedAegisCrystal: true, usedAegisFruit: false, usedArcaneCrystal: false, usedGalaxyPearl: false, usedGummyWorm: false, usedAmbrosia: false },
        unlockedBiomeTorches: true,
        taxMoney: 123456, deathsPve: 3, deathsPvp: 1, hairDye: 2, team: 0,
      };
      const app = { name: 'RB31B', hair: 0, skinVariant: 0, difficulty: 0, hairColor: { r: 1, g: 2, b: 3 }, skinColor: { r: 1, g: 2, b: 3 }, eyeColor: { r: 1, g: 2, b: 3 }, shirtColor: { r: 1, g: 2, b: 3 }, undershirtColor: { r: 1, g: 2, b: 3 }, pantsColor: { r: 1, g: 2, b: 3 }, shoeColor: { r: 1, g: 2, b: 3 }, voiceVariant: 1, voicePitchOffset: 0 };
      const bytes = pli.exportPlr(app, st);
      const dec = pli.aes128EcbDecrypt(bytes);
      let p = 4 + 20;
      const nameLen = dec[p]; p += 1 + nameLen;
      p += 1 + 8 + 4 + 1 + 1 + 2 + 1 + 1 + 16;
      const seq = Array.from(dec.slice(p, p + 8));
      const parsed = pli.parsePlr(bytes);
      return {
        seq,
        rtUnlocked: parsed.playerState.unlockedBiomeTorches,
        rtAegis: parsed.playerState.permanentUpgrades?.usedAegisCrystal,
        rtBA: parsed.playerState.builderAccStatus,
        rtTax: parsed.playerState.taxMoney,
      };
    } catch (e) {
      return { err: String(e && e.stack || e).slice(0, 300) };
    }
  });
  if (B6.err) { note('B6 异常', B6.err); fails.push('B6 exception'); }
  else {
    ok(B6.seq[1] === 1 && B6.seq[2] === 0 && B6.seq[4] === 0 && B6.seq[5] === 1, 'B6a .plr 位序:extraAcc|unlockedBiomeTorches|UsingBiomeTorches|artisan|≥324旗|aegis(无位序错位)', JSON.stringify(B6.seq));
    ok(B6.rtUnlocked === true && B6.rtAegis === true && B6.rtBA?.[1] === 1 && B6.rtTax === 123456, 'B6b parse∘export 往返:旗/builderAccStatus/taxMoney 全保(无字节漂移)', JSON.stringify({ rtUnlocked: B6.rtUnlocked, rtBA: B6.rtBA, rtTax: B6.rtTax }));
  }

  // C2 存侧:5437+词缀 → doSave → QUICK_SAVE JSON 内槽位保形
  const C2 = await pageB.evaluate(async () => {
    try {
      const g = window.__swGame;
      const { ITEM_DEFS } = await import('/src/data/items.ts');
      const vidOf = (d) => d?.vid ?? Number(String(d?.key ?? '').match(/^vi_(\d+)_/)?.[1] ?? -1);
      const idxOf = (vid) => ITEM_DEFS.findIndex((d) => vidOf(d) === vid);
      const inv = g.player.inv;
      const sel = inv.selected;
      inv.slots[sel] = { id: idxOf(5437), stack: 1, prefix: 7, favorited: true };
      window.__swFlow.doSave();
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => setTimeout(r, 500));
        const { kvGet } = await import('/src/save/KvStore.ts');
        const json = await kvGet('sandboxworld.quicksave');
        if (json) {
          const data = JSON.parse(json);
          const saved = data.player?.inventory?.[sel] ?? null;
          if (saved) return { saved: { stack: saved.stack, prefix: saved.prefix, fav: saved.favorited, idKey: typeof saved.id }, jsonLen: json.length };
        }
      }
      return { err: 'no save json after 20s' };
    } catch (e) {
      return { err: String(e && e.stack || e).slice(0, 300) };
    }
  });
  if (C2.err) { note('C2 异常/跳过', C2.err); fails.push('C2 ' + C2.err); }
  else ok(C2.saved && C2.saved.stack === 1 && C2.saved.prefix === 7 && C2.saved.fav === true, 'C2 存侧:5437 槽位 stack/prefix/favorited 落 JSON(稳定 id 表含 5437)', JSON.stringify(C2.saved));

  // C3 地狱九窗
  const C3 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const st = g.world.store;
    const h = st.h, w = st.w;
    const y0 = h - 180, y1 = h - 100;
    for (let x = 20; x < w - 20; x++) {
      for (let y = y0 - 6; y < y1 + 8; y++) { st.setTileSilent(x, y, 0); st.setWallSilent(x, y, 0); st.setLiquid(x, y, 0, 0); }
      st.setTileSilent(x, y1, 1); st.setTileSilent(x, y1 + 1, 1);
    }
    const spot = g.requestDemonConchSpot();
    const t = spot ? { x: Math.round(spot.x / 16), y: Math.round(spot.y / 16) } : null;
    for (let x = 40; x < w - 40; x++) for (let y = y0; y < y1; y++) st.setTileSilent(x, y, 1);
    for (let x = 250; x < 300; x++) for (let y = y0; y < y1 - 4; y++) st.setTileSilent(x, y, 0);
    for (let x = 250; x < 300; x++) st.setTileSilent(x, y1 - 4, 1);
    const spotEdge = g.requestDemonConchSpot();
    const tEdge = spotEdge ? { x: Math.round(spotEdge.x / 16), y: Math.round(spotEdge.y / 16) } : null;
    for (let x = 40; x < w - 40; x++) for (let y = y0; y < y1; y++) st.setTileSilent(x, y, 1);
    for (let x = 200; x < 240; x++) for (let y = y0; y < y1 - 4; y++) st.setTileSilent(x, y, 0);
    for (let x = 200; x < 240; x++) st.setTileSilent(x, y1 - 4, 1);
    const spotOcean = g.requestDemonConchSpot();
    const tOcean = spotOcean ? { x: Math.round(spotOcean.x / 16), y: Math.round(spotOcean.y / 16) } : null;
    for (let x = 40; x < w - 40; x++) for (let y = y0; y < y1; y++) st.setTileSilent(x, y, 0);
    return { w, h, band: [y0, y1], t, tEdge, tOcean };
  });
  ok(C3.t && C3.t.y >= C3.band[0] && C3.t.y <= C3.band[1] && C3.t.x >= 45 && C3.t.x < C3.w - 45, 'C3a 地狱九窗满铺:落点∈深度带[h-180,h-100]∧InWorld 45 边距', JSON.stringify(C3));
  ok(C3.tEdge && C3.tEdge.x >= 250 && C3.tEdge.x < 300, 'C3b 边缘袋(300 窗④臂):只留 [250,300) 袋仍命中', JSON.stringify(C3.tEdge));
  ok(C3.tOcean && C3.tOcean.x >= 200 && C3.tOcean.x < 240, 'C3c 海洋侧地狱(x<380)袋命中(地狱臂无海排他)', JSON.stringify(C3.tOcean));

  // C4 海洋爬行
  const C4 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const t0 = performance.now();
    const r = g.requestMagicConchTeleportPosition(true);
    const t1 = performance.now();
    const l = g.requestMagicConchTeleportPosition(false);
    const t2 = performance.now();
    const w = g.world.store.w;
    return {
      r: r ? { x: Math.round(r.x / 16), y: Math.round(r.y / 16) } : null,
      l: l ? { x: Math.round(l.x / 16), y: Math.round(l.y / 16) } : null,
      msR: +(t1 - t0).toFixed(1), msL: +(t2 - t1).toFixed(1), w,
    };
  });
  ok(C4.r !== null && C4.l !== null && C4.msR < 2000 && C4.msL < 2000, 'C4a 海洋爬行双侧均收敛(5000 预算不烧穿)', JSON.stringify({ r: C4.r, l: C4.l, msR: C4.msR, msL: C4.msL }));
  ok(C4.r && (C4.r.x >= C4.w - 380 || C4.r.x <= 380), 'C4b 落点在海滩带(≤380 或 ≥w-380)', JSON.stringify(C4.r));

  const errsB = pageB.__errs.filter((e) => !e.includes('favicon'));
  ok(errsB.length === 0, 'B/C-ERR 页面零异常', errsB.join(' | ').slice(0, 300));
} catch (e) {
  fails.push('PART-BC exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-BC exception: ' + String(e).slice(0, 500));
}

/* ---------- D:税金币条 ---------- */
try {
  const D1 = await pageB.evaluate(async () => {
    const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
    const host = document.createElement('div');
    document.body.appendChild(host);
    const dlg = new NpcDialog(host, () => {}, () => {});
    const fill = (i) => ({ id: 'shop', label: `按钮${i}` });
    const measure = () => {
      const p = dlg.panel;
      const btn = p.querySelector('button[data-b=collect]');
      const tag = btn.querySelector('.sw-npc-coins');
      const br = btn.getBoundingClientRect();
      const g = { btnW: +br.width.toFixed(1) };
      if (tag) {
        const tr = tag.getBoundingClientRect();
        g.dx = +(tr.x - br.x).toFixed(1);
        g.dy = +(tr.y - br.y).toFixed(1);
        g.text = tag.textContent;
      } else g.tag = false;
      g.rows = new Set([...p.querySelectorAll('.sw-npc-btns .sw-npc-btn')].map((b) => Math.round(b.getBoundingClientRect().y))).size;
      return g;
    };
    const out = {};
    dlg.open('税吏', '台词', [{ id: 'collect', label: '收税', coins: 250000 }, fill(2), fill(3), fill(4), fill(5)]);
    out.first = measure();
    dlg.close();
    dlg.open('税吏', '台词', [fill(1), fill(2), fill(3), fill(4), { id: 'collect', label: '收税', coins: 250000 }]);
    out.row2 = measure();
    dlg.close();
    dlg.open('税吏', '台词', [fill(1), fill(2), fill(3), { id: 'collect', label: '收税', coins: 250000 }]);
    out.last = measure();
    dlg.close();
    dlg.open('税吏', '台词', [{ id: 'collect', label: '这是一个特别特别特别特别特别长的收税按钮标签用于触发压缩', coins: 250000 }]);
    out.compressed = measure();
    dlg.close();
    dlg.open('税吏', '台词', [{ id: 'collect', label: '收税', coins: 1200000 }]);
    out.big = dlg.panel.querySelector('.sw-npc-coins')?.textContent;
    dlg.close();
    dlg.open('税吏', '台词', [{ id: 'collect', label: '收税' }]);
    out.zero = { hasTag: !!dlg.panel.querySelector('.sw-npc-coins') };
    dlg.close();
    host.remove();
    return out;
  });
  ok(Math.abs(D1.first.dy + 5) <= 1, 'D1a 币条锚 top=-5(币心带=钮顶+6)', JSON.stringify(D1.first));
  ok(Math.abs(D1.first.dx - (D1.first.btnW + 19)) <= 1, 'D1b 币条左=钮右+19', JSON.stringify({ dx: D1.first.dx, btnW: D1.first.btnW }));
  ok(/25/.test(D1.first.text), 'D1c 25 金(250000 铜)渲染', D1.first.text);
  ok(Math.abs(D1.row2.dy + 5) <= 1 && D1.row2.rows === 2, 'D1d 多行布局币条随动(行 1 钮同锚)', JSON.stringify(D1.row2));
  ok(D1.last.dx > 19, 'D1e 行末 collect:币条越面板缘=原版同相(106 只推进后续钮)', JSON.stringify(D1.last));
  ok(Math.abs(D1.compressed.dx - (D1.compressed.btnW + 19)) <= 1, 'D1f 压缩钮币条随压缩宽(:117 钉 260 同源)', JSON.stringify(D1.compressed));
  ok(/铂|platinum|白金/i.test(D1.big), 'D1g 巨额(1200000=1.2 铂)币条渲染铂档', D1.big);
  ok(D1.zero.hasTag === false, 'D1h 税 0:collect 无 coins 域→无币条', JSON.stringify(D1.zero));

  const D2 = await pageB.evaluate(() => {
    const g = window.__swGame;
    const npc = { npcKey: 'tax_collector', vanillaId: 441 };
    g.player.taxMoney = 250000;
    const withCoins = g.npcDialogButtons(npc).find((b) => b.id === 'collect');
    g.player.taxMoney = 0;
    const noCoins = g.npcDialogButtons(npc).find((b) => b.id === 'collect');
    return { coinsAt: withCoins?.coins, hasCoinsField: withCoins ? ('coins' in withCoins) : false, zeroHasCoins: noCoins ? ('coins' in noCoins) : null };
  });
  ok(D2.hasCoinsField === true && D2.coinsAt === 250000, 'D2a 税>0:collect 挂 coins=Math.floor(taxMoney)', JSON.stringify(D2));
  ok(D2.zeroHasCoins === false, 'D2b 税 0:collect 无 coins 域(按钮仍在=原版注册位)', JSON.stringify(D2));
} catch (e) {
  fails.push('PART-D exception: ' + String(e).slice(0, 200));
  console.log('FAIL PART-D exception: ' + String(e).slice(0, 500));
}

console.log(`\n==== R3 SUMMARY: ${fails.length} fail ====`);
for (const f of fails) console.log('FAIL: ' + f);
await browser.close();
process.exit(fails.length ? 3 : 0);
