// RB28 红队探针(临时,取证后删):暂停菜单重组/设置摘除/tooltip anchor 三面/布局签名
// 运行:SW_ORIGIN=http://localhost:5213 node tools/run-diag.mjs scripts/_rb28-save.mjs
import puppeteer from 'puppeteer-core';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'], defaultViewport: { width: 1360, height: 900 } });

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  [' + extra + ']' : ''}`); ok ? pass++ : fail++; };

const ERRS = [];
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function waitSel(page, sel, timeout) {
  try { await page.waitForSelector(sel, { timeout }); return true; } catch { return false; }
}
async function toCharSelect(page) {
  for (let i = 0; i < 5; i++) {
    if (await page.evaluate(() => !!document.querySelector('.sw-vsel'))) return true;
    await page.evaluate(() => document.querySelector('[data-act=sp]')?.click()).catch(() => {});
    if (await waitSel(page, '.sw-vsel', 8000)) return true;
    // 建角色后有一次整页 reload(烘焙管线):回标题重走
    await sleep(1500);
    if (!(await page.evaluate(() => !!document.querySelector('.sw-title-menu')))) {
      await page.waitForSelector('.sw-title-menu', { timeout: 60000 }).catch(() => {});
    }
  }
  return false;
}
async function vselTitle(page) {
  return page.evaluate(() => document.querySelector('.sw-vsel-title')?.textContent ?? '');
}
async function bootPage(url) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => ERRS.push('pageerror: ' + e.message));
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.sw-title-menu', { timeout: 120000 });
  await sleep(800);
  if (!(await toCharSelect(page))) throw new Error('无法进入角色选择');
  // 角色面:无角色则建(标题含「玩家」=角色选择面)
  for (let i = 0; i < 3 && !(await page.evaluate(() => !!document.querySelector('.sw-vsel .sw-vitem'))); i++) {
    if (!(await vselTitle(page)).includes('玩家')) break;
    await page.evaluate(() => document.querySelector('.sw-vsel [data-act=new]')?.click());
    if (!await waitSel(page, '.sw-char-panel', 10000)) break;
    await sleep(1000);
    await page.click('.sw-char-row input[type=text]');
    await page.keyboard.type('RB28');
    await sleep(200);
    await page.evaluate(() => document.querySelector('.sw-char-panel [data-act=create]')?.click());
    await sleep(3000);
    await toCharSelect(page);
  }
  // 选角色 → 世界面;世界面:无世界则建;选世界 → 进世界
  for (let i = 0; i < 6; i++) {
    if (await page.evaluate(() => !!window.__swGame?.player)) break;
    const title = await vselTitle(page);
    const hasItem = await page.evaluate(() => !!document.querySelector('.sw-vsel .sw-vitem'));
    if (!hasItem) {
      await page.evaluate(() => document.querySelector('.sw-vsel [data-act=new]')?.click());
      if (await waitSel(page, '.sw-wc-panel', 10000)) {
        await sleep(400);
        await page.click('[data-g=size] .sw-wc-opt');
        await sleep(200);
        await page.evaluate(() => document.querySelector('.sw-wc-panel [data-act=create]')?.click());
        // 世界生成:等进入世界(vsel 消失 + player 出现)
        await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
        break;
      }
      continue;
    }
    if (title.includes('玩家')) {
      await page.evaluate(() => document.querySelector('.sw-vsel .sw-vitem')?.click());
      await sleep(800);
    } else {
      await page.evaluate(() => document.querySelector('.sw-vsel .sw-vitem')?.click());
      await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
    }
  }
  await page.waitForFunction(() => window.__swGame?.player, { timeout: 180000 });
  await sleep(1500);
  // 首launch欢迎弹窗(WelcomeAnnounce,无 class 的居中 DIV)会挡 elementFromPoint 采样:点掉
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => /我已知晓|已知晓|OK|I understand/i.test(b.textContent ?? ''));
    btn?.click();
  });
  await sleep(300);
  return page;
}

/** 悬停槽位并测量 tooltip 锚 */
async function probeTooltip(page, slotSel) {
  return page.evaluate(async (sel) => {
    const slot = document.querySelector(sel);
    if (!slot) return { ok: false, why: 'slot 不存在: ' + sel };
    slot.dispatchEvent(new MouseEvent('mouseenter', { bubbles: false }));
    await new Promise(r => setTimeout(r, 120));
    const tip = document.querySelector('.sw-tooltip');
    const out = { sel };
    if (!tip || tip.style.display !== 'block') {
      out.ok = false; out.why = 'tooltip 未显示';
      return out;
    }
    const r = slot.getBoundingClientRect();
    const tr = tip.getBoundingClientRect();
    out.slotRect = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, w: r.width };
    out.tipPos = { left: tr.left, top: tr.top };
    out.expectLeft = r.right + 8;   // UI.ts:2616 定位式 left = r.right + 8
    out.dx = Math.round(tr.left - (r.right + 8));
    out.dy = Math.round(tr.top - r.top);
    // 回退锚取证:slotEl(i,where) 全文档首匹配(修复前回退面)的 rect
    const mI = sel.match(/data-idx="(\d+)"/), mW = sel.match(/data-where="(\w+)"/);
    const fb = (mI && mW) ? document.querySelector(`[data-idx="${mI[1]}"][data-where="${mW[1]}"]`) : null;
    const fr = fb?.getBoundingClientRect();
    out.fallbackIsSame = fb === slot;
    out.fallbackRect = fr ? { left: fr.left, top: fr.top, w: fr.width, h: fr.height } : null;
    out.ok = Math.abs(out.dx) <= 2 && Math.abs(out.dy) <= 40;
    slot.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    return out;
  }, slotSel);
}

async function openInventory(page) {
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 400));
}
async function openPauseViaSettingsBtn(page) {
  const ok = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.sw-vinv button')].find((b) => b.textContent === '设置');
    if (!btn) return false;
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return true;
  });
  await new Promise(r => setTimeout(r, 400));
  return ok;
}
const pauseButtons = (page) => page.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].map((b) => b.textContent));

// ================= Part 1:vanilla 缺省布局 =================
console.log('==== Part1 vanilla(缺省) ====');
const p1 = await bootPage(ORIGIN);
check('P1 进世界', await p1.evaluate(() => !!window.__swGame?.player));

// 槽位 10 放一件物品(vid 1=铁镐)
const prepared = await p1.evaluate(() => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(1);
  if (!iid || iid < 0) return 'itemByVid(1)=' + iid;
  g.player.inv.slots[3] = { id: iid, stack: 1 };
  g.player.inv.slots[10] = { id: iid, stack: 5 };
  return 'ok iid=' + iid;
});
check('P1 背包放入铁镕 vid1', prepared.startsWith('ok'), prepared);

await openInventory(p1);
check('P1 Esc 开背包', await p1.evaluate(() => { const r = document.querySelector('[data-idx="12"][data-where="inv"]')?.getBoundingClientRect(); return !!r && r.width > 0; }), '');

const tA = await probeTooltip(p1, '[data-where="inv"][data-idx="3"]');
check('P1 tooltip anchor=inv槽3(vanilla,修复面:回退锚=隐藏热栏)', tA.ok,
  `dx=${tA.dx} dy=${tA.dy} slot=${JSON.stringify(tA.slotRect)} fallbackSame=${tA.fallbackIsSame} fallbackRect=${JSON.stringify(tA.fallbackRect)}`);
const tB = await probeTooltip(p1, '[data-where="inv"][data-idx="10"]');
check('P1 tooltip anchor=背包槽10(vanilla)', tB.ok, `dx=${tB.dx} dy=${tB.dy} fallbackSame=${tB.fallbackIsSame}`);

// 宝箱面(vanilla 内嵌箱条)
const chestRes = await p1.evaluate(() => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(1);
  const items = Array.from({ length: 40 }, (_, i) => (i === 0 ? { id: iid, stack: 1 } : null));
  g.openChest({ x: -1, y: -1, items, name: '' });
  return document.querySelector('[data-where="chest"][data-idx="0"]')?.isConnected ?? false;
});
await new Promise(r => setTimeout(r, 400));
const tC = await probeTooltip(p1, '[data-where="chest"][data-idx="0"]');
check('P1 宝箱槽开成功(vanilla 内嵌条)', chestRes);
check('P1 tooltip anchor=箱槽0(vanilla)', tC.ok, `dx=${tC.dx} dy=${tC.dy} fallbackSame=${tC.fallbackIsSame} fallbackRect=${JSON.stringify(tC.fallbackRect)}`);
await p1.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 400));   // 关箱+关包

// 商店面(vanilla 内嵌货架):直接打 cb.onNpcShop 桥
const shopRes = await p1.evaluate(() => {
  const g = window.__swGame;
  g.npcShopOpen = true;
  const cb = g.cb || g._cb;
  if (!cb?.onNpcShop) return 'no cb.onNpcShop keys=' + Object.keys(g).filter(k => /cb/i.test(k)).join(',');
  cb.onNpcShop('RB28商店', [{ key: 'torch', vanillaId: 8, name: '火把', price: 50 }], 10000);
  return 'ok';
});
await new Promise(r => setTimeout(r, 600));
const tD = await probeTooltip(p1, '.sw-vshop-cell');
check('P1 商店货架建立(vanilla 内嵌)', shopRes === 'ok' && (tD.slotRect?.w ?? 0) > 0, String(shopRes));
check('P1 tooltip anchor=商店格(vanilla 内嵌货架)', tD.ok, `dx=${tD.dx} dy=${tD.dy}`);
await p1.evaluate(() => { const g = window.__swGame; g.npcShopOpen = false; });
await p1.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 500));   // 关包

// ---- 暂停菜单主视图 ----
check('P1 暂停开启(背包内设置钮)', await openPauseViaSettingsBtn(p1));
const btns1 = await pauseButtons(p1);
console.log('  暂停主视图按钮:', JSON.stringify(btns1));
check('P1 主视图有开发者选项', btns1.includes('开发者选项'));
check('P1 主视图无导出存档(onExport 缺省分支)', !btns1.includes('导出存档'));
check('P1 主视图无住房/图鉴入口(反馈轮8摘除)', !btns1.some((b) => /住房|图鉴/.test(b)));

// ---- 开发者选项子视图 ----
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '开发者选项')?.click());
await new Promise(r => setTimeout(r, 200));
const btns2 = await pauseButtons(p1);
console.log('  开发者选项子视图按钮:', JSON.stringify(btns2));
check('P2 子视图=天气/时间/搜索/返回', ['天气控制', '时间控制', '道具搜索', '返回'].every((x) => btns2.includes(x)), JSON.stringify(btns2));
check('P2 子视图主按钮已收(继续不在)', !btns2.some((b) => /继续|保存/.test(b)));

// ---- 子视图 → 天气控制(首用门+暂停态) ----
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '天气控制')?.click());
await new Promise(r => setTimeout(r, 300));
const gateShown = await p1.evaluate(() => !!document.getElementById('sw-journeyquick-gate-weather'));
check('P2 天气首用门弹出', gateShown);
if (gateShown) {
  await p1.evaluate(() => [...document.querySelectorAll('#sw-journeyquick-gate-weather button')].find((b) => b.textContent === '确认启用')?.click());
  await new Promise(r => setTimeout(r, 300));
}
const afterWeather = await p1.evaluate(() => ({
  paused: window.__swGame.paused,
  weatherOpen: window.__swGame.renderer.weatherPanelOpen,
  pausePanelGone: !document.querySelector('.sw-pause-panel'),
  gateGone: !document.getElementById('sw-journeyquick-gate-weather'),
}));
check('P2 天气面板开+暂停解除+暂停面板清', afterWeather.paused === false && afterWeather.weatherOpen === true && afterWeather.pausePanelGone && afterWeather.gateGone, JSON.stringify(afterWeather));
await p1.evaluate(() => { window.__swGame.renderer.weatherPanelOpen = false; });

// ---- 状态残留回归:子视图 → 返回 → 主视图按钮复原 ----
check('P2 重开暂停', await (async () => { await openInventory(p1); return openPauseViaSettingsBtn(p1); })());
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '开发者选项')?.click());
await new Promise(r => setTimeout(r, 200));
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '时间控制')?.click());
await new Promise(r => setTimeout(r, 300));
const timeGate = await p1.evaluate(() => !!document.getElementById('sw-journeyquick-gate-time'));
if (timeGate) {
  await p1.evaluate(() => [...document.querySelectorAll('#sw-journeyquick-gate-time button')].find((b) => b.textContent === '确认启用')?.click());
  await new Promise(r => setTimeout(r, 300));
}
const afterTime = await p1.evaluate(() => ({ paused: window.__swGame.paused, timeOpen: window.__swGame.renderer.timePanelOpen }));
check('P2 时间首用门弹出(时间门独立于天气门)', timeGate);
check('P2 时间面板开+暂停解除', afterTime.timeOpen === true && afterTime.paused === false, JSON.stringify(afterTime));
await p1.evaluate(() => { window.__swGame.renderer.timePanelOpen = false; });

check('P2 三开暂停', await (async () => { await openInventory(p1); return openPauseViaSettingsBtn(p1); })());
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '开发者选项')?.click());
await new Promise(r => setTimeout(r, 200));
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '返回')?.click());
await new Promise(r => setTimeout(r, 200));
const btns3 = await pauseButtons(p1);
console.log('  返回后主视图按钮:', JSON.stringify(btns3));
check('P2 返回后主视图复原(继续/保存/设置/开发者选项/退出钮)',
  ['开发者选项'].every((x) => btns3.includes(x)) && btns3.some((b) => /继续/.test(b)) && btns3.some((b) => /保存/.test(b)) && btns3.some((b) => /设置/.test(b)) && btns3.some((b) => /退出|主菜单/.test(b)) && btns3.length === btns1.length,
  JSON.stringify(btns3));

// ---- 暂停 → 设置:z 序/Esc 行为/页签摘除 ----
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => b.textContent === '设置')?.click());
await new Promise(r => setTimeout(r, 300));
const setStack = await p1.evaluate(() => {
  const pause = document.querySelector('.sw-pause-panel');
  const set = document.querySelector('.sw-set-panel');
  if (!set) return { present: false };
  const zP = pause ? +getComputedStyle(pause).zIndex : null;
  const zS = +getComputedStyle(set).zIndex;
  const pr = pause?.getBoundingClientRect();
  const sr = set.getBoundingClientRect();
  // 重叠区采样:屏中心(=暂停面板中心,两面板几何中心同点)
  const cx = pr ? pr.left + pr.width / 2 : window.innerWidth / 2;
  const cy = pr ? pr.top + pr.height / 2 : window.innerHeight / 2;
  const centerEl = document.elementFromPoint(cx, cy);
  const centerInPause = !!centerEl && !!pause && (pause.contains(centerEl) || centerEl === pause);
  const centerTag = centerEl ? `${centerEl.tagName}.${centerEl.className}` : null;
  const cats = [...document.querySelectorAll('.sw-set-cats div')].map((d) => d.dataset.cat);
  return { present: true, zP, zS, pauseRect: pr ? { l: Math.round(pr.left), t: Math.round(pr.top), r: Math.round(pr.right), b: Math.round(pr.bottom) } : null,
    setRect: { l: Math.round(sr.left), t: Math.round(sr.top), r: Math.round(sr.right), b: Math.round(sr.bottom) },
    centerInPause, centerTag, cats };
});
console.log('  设置面板层序:', JSON.stringify(setStack));
await p1.screenshot({ path: '/tmp/rb28-pause-settings.png' });   // 层序视觉物证
check('P2 设置面板存在', setStack.present === true);
check('P2 设置页签=音量/界面/游戏/按键(触控已摘)', JSON.stringify(setStack.cats) === JSON.stringify(['sound', 'ui', 'game', 'controls']), JSON.stringify(setStack.cats));
check('P2 设置面板在暂停面板之上(重叠区可点)', setStack.zS > (setStack.zP ?? 0) && setStack.centerInPause === false, `zSet=${setStack.zS} zPause=${setStack.zP} 重叠区顶元素=${setStack.centerTag} pauseRect=${JSON.stringify(setStack.pauseRect)} setRect=${JSON.stringify(setStack.setRect)}`);

// Esc 一按:链 closePause + 设置自身 Esc 同帧双发?
await p1.keyboard.press('Escape');
await new Promise(r => setTimeout(r, 400));
const escOnce = await p1.evaluate(() => {
  const slot = document.querySelector('[data-idx="12"][data-where="inv"]');
  const r = slot?.getBoundingClientRect();
  return {
    pauseGone: !document.querySelector('.sw-pause-panel'),
    setGone: !document.querySelector('.sw-set-panel'),
    paused: window.__swGame.paused,
    invVisible: !!r && r.width > 0,   // 背包行12(无热栏镜像)
  };
});
console.log('  设置态按 Esc 一次:', JSON.stringify(escOnce));
check('P2 Esc 只收设置回暂停(预期)——若双收+开背包=状态残留', escOnce.setGone === true && escOnce.pauseGone === false, JSON.stringify(escOnce));
// 收尾:关设置,关暂停
await p1.evaluate(() => document.querySelector('.sw-set-back')?.click());
await new Promise(r => setTimeout(r, 200));
await p1.evaluate(() => [...document.querySelectorAll('.sw-pause-panel .sw-pause-btn')].find((b) => /继续/.test(b.textContent))?.click());
await new Promise(r => setTimeout(r, 200));
await p1.close();

// ================= Part 2:classic 回退布局 =================
console.log('==== Part2 classic(?invlayout=legacy) ====');
const p2 = await bootPage(ORIGIN + '/?invlayout=legacy');
check('P2 进世界(classic)', await p2.evaluate(() => !!window.__swGame?.player));
check('P2 布局=classic', await p2.evaluate(() => !!document.querySelector('.sw-inv-panel, .sw-panel') && !document.querySelector('.sw-vinv')), '');
await p2.evaluate(() => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(1);
  g.player.inv.slots[3] = { id: iid, stack: 1 };
  g.player.inv.slots[10] = { id: iid, stack: 5 };
});
await openInventory(p2);
const t2a = await probeTooltip(p2, '[data-where="inv"][data-idx="10"]');
check('P2 tooltip anchor=背包槽10(classic 零变化面)', t2a.ok, `dx=${t2a.dx} dy=${t2a.dy} fallbackSame=${t2a.fallbackIsSame}`);
const chestRes2 = await p2.evaluate(() => {
  const g = window.__swGame;
  const iid = window.__swFlow.itemByVid(1);
  const items = Array.from({ length: 40 }, (_, i) => (i === 0 ? { id: iid, stack: 1 } : null));
  g.openChest({ x: -1, y: -1, items, name: '' });
  return true;
});
await new Promise(r => setTimeout(r, 400));
const t2b = await probeTooltip(p2, '[data-where="chest"][data-idx="0"]');
check('P2 tooltip anchor=箱槽0(classic modal)', t2b.ok, `dx=${t2b.dx} dy=${t2b.dy} fallbackSame=${t2b.fallbackIsSame} rect=${JSON.stringify(t2b.slotRect)}`);
await p2.keyboard.press('Escape'); await new Promise(r => setTimeout(r, 400));   // 关箱+关包再开店
const shopRes2 = await p2.evaluate(() => {
  const g = window.__swGame;
  g.npcShopOpen = true;
  (g.cb || g._cb).onNpcShop('RB28商店', [{ key: 'torch', vanillaId: 8, name: '火把', price: 50 }], 10000);
  return true;
});
await new Promise(r => setTimeout(r, 500));
const shopDom = await p2.evaluate(async () => {
  // 探针经 cb.onNpcShop 直开(未走对话)→ sw-npc-style 只在 NpcDialog 构造器注入,
  // 补注入使 classic 浮面板样式生效(真实流程开店必先开对话,样式恒在——探针旁路面)
  const m = await import('/src/ui/NpcDialog.ts');
  if (!document.getElementById('sw-npc-style')) new m.NpcDialog(document.body, () => {});
  const cells = [...document.querySelectorAll('.sw-npc-shop .sw-shop-grid .sw-shop-item')];
  const c = cells.find((x) => x.dataset.ok === '1' && x.querySelector('img'));
  return { n: cells.length, first: c ? { rect: c.getBoundingClientRect().toJSON(), cls: c.className, parent: c.parentElement?.className } : null };
});
console.log('  classic 商店格:', JSON.stringify(shopDom).slice(0, 200));
const t2c = shopDom.first ? await probeTooltip(p2, '.sw-npc-shop .sw-shop-grid .sw-shop-item[data-ok="1"]') : { ok: false, why: '无可点商店格' };
check('P2 tooltip anchor=商店格(classic 浮面板)', t2c.ok, `dx=${t2c.dx} dy=${t2c.dy} rect=${JSON.stringify(t2c.slotRect)}`);
// classic 暂停:开发者选项应缺(停车坪门=vanilla)
const classicPause = await p2.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === '设置' && b.className.includes('vinv-txt'));
  return { hasVinvSettingsBtn: !!btn };
});
console.log('  classic 设置钮探测:', JSON.stringify(classicPause));
check('P2 classic 无 vinv 设置钮(停车坪不达)', classicPause.hasVinvSettingsBtn === false);
await p2.close();

console.log(`\n==== RB28 汇总: PASS=${pass} FAIL=${fail} ====${ERRS.length ? '\n页面错误:\n' + ERRS.slice(0, 10).join('\n') : ''}`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
