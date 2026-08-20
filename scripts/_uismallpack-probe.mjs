// S 级 UI 小件包 4 项冒烟（_ 一次性探针，tools/run-diag.mjs 运行）：
//  ① 月总战滤镜：核心 398 在场 → MoonLord 滤镜激活/淡出（SceneState.cs:109）
//  ② PvP 背包快切钮：背包面板剑+6 队色钮 DOM/帧位/点击链/冷却（Main.cs:42074-42195）
//  ③ MapStyle/MapAlpha：Tab 三态循环（隐藏小地图）+ PageUp/Down 电平步进
//  ④ 全图箱名 hover：宝箱格 → LegacyChestType 名（Main.cs:55282）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'networkidle0' });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// ---- ① 月总战滤镜（SceneState.cs:109 ClosestNPCPosition[398]≠Zero）----
{
  const st = await page.evaluate(() => {
    const g = window.__swGame;
    const f = g.renderer.monoFilters.state('MoonLord');
    return { active: f?.active ?? null, opacity: f?.opacity ?? null };
  });
  check('① 初始无核心 → MoonLord 未激活', st.active === false && st.opacity === 0, JSON.stringify(st));
  const spawned = await page.evaluate(() => {
    const g = window.__swGame;
    g.debugSpawnNpc(398, 1, false);
    return g.entities.enemies.some((e) => e.vanillaId === 398 && !e.dead);
  });
  check('① 核心 398 召唤在场', spawned);
  await new Promise((r) => setTimeout(r, 1300));   // 1/s 斜坡 → 1
  let st2 = await page.evaluate(() => {
    const f = window.__swGame.renderer.monoFilters.state('MoonLord');
    return { active: f.active, opacity: f.opacity };
  });
  check('① 核心在场 → 激活 + 斜坡到 1', st2.active === true && st2.opacity >= 0.99, JSON.stringify(st2));
  await page.evaluate(() => {
    // 直置 dead（绕过月总死亡演出 ai0=2——演出期核心仍 active 是原版语义,
    // 此处验证的是"不在场→淡出"所以直接摘除）
    for (const e of window.__swGame.entities.enemies) if (e.vanillaId === 398) e.dead = true;
  });
  await new Promise((r) => setTimeout(r, 700));
  const op = await page.evaluate(() => window.__swGame.renderer.monoFilters.state('MoonLord').opacity);
  check('① 核心退场 → 淡出中（0<op<1）', op > 0 && op < 1, `op=${op}`);
}

// ---- ② PvP 背包快切钮（DrawPVPIcons Main.cs:42074-42195）----
{
  await page.evaluate(() => { window.__swUI.openInventory(); });
  await new Promise((r) => setTimeout(r, 300));
  const dom = await page.evaluate(() => {
    const panel = window.__swUI.invPanel;
    const sword = [...panel.querySelectorAll('button')].find((b) => /UI_PVP_0/.test(b.style.backgroundImage));
    const teamIcons = [...panel.querySelectorAll('button div')].filter((d) => /UI_PVP_1/.test(d.style.backgroundImage));
    return {
      swordExists: !!sword,
      swordPos: sword?.style.backgroundPosition ?? null,
      swordSize: sword ? [sword.style.width, sword.style.height] : null,
      teamCount: teamIcons.length,
      positions: teamIcons.slice(0, 6).map((d) => d.style.backgroundPosition),
    };
  });
  check('② PvP 剑钮存在（UI_PVP_0 36×37）', dom.swordExists && dom.swordSize[0] === '36px' && dom.swordSize[1] === '37px', JSON.stringify(dom.swordSize));
  check('② 初始剑帧 0% 0%（非敌对/白队）', dom.swordPos === '0% 0%', dom.swordPos);
  check('② 6 队色格（UI_PVP_1）', dom.teamCount === 6, `n=${dom.teamCount}`);
  check('② 队格帧位 i*20%', dom.positions.join(',') === '0% 0%,20% 0%,40% 0%,60% 0%,80% 0%,100% 0%', dom.positions.join(','));
  const hostile = await page.evaluate(() => {
    const g = window.__swGame;
    const panel = window.__swUI.invPanel;
    const sword = [...panel.querySelectorAll('button')].find((b) => /UI_PVP_0/.test(b.style.backgroundImage));
    sword.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return g.player.hostile;
  });
  check('② 剑点击 → hostile=true', hostile === true);
  await new Promise((r) => setTimeout(r, 100));
  const afterClick = await page.evaluate(() => {
    const g = window.__swGame;
    const panel = window.__swUI.invPanel;
    const sword = [...panel.querySelectorAll('button')].find((b) => /UI_PVP_0/.test(b.style.backgroundImage));
    return { pos: sword.style.backgroundPosition, title: sword.title };
  });
  check('② hostile 剑帧 col=2（66.667%）+ 冷却期无提示（:42099 teamCooldown==0 门）',
    afterClick.pos.startsWith('66.6') && afterClick.title === '', `${afterClick.pos} | title="${afterClick.title}"`);
  const blocked = await page.evaluate(() => {
    const g = window.__swGame;
    const panel = window.__swUI.invPanel;
    const sword = [...panel.querySelectorAll('button')].find((b) => /UI_PVP_0/.test(b.style.backgroundImage));
    sword.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    return g.player.hostile;   // 仍 true = 冷却拦截
  });
  check('② 冷却期（300t=5s）内点击被拦', blocked === true);
  // 冷却结束后提示恢复（PvpIcon_Active 官译"禁用玩家对决"）
  await page.evaluate(() => { window.__swUI.pvpCooldownUntil = 0; window.__swUI.refreshPvpButtons(); });
  const titleAfter = await page.evaluate(() => {
    const panel = window.__swUI.invPanel;
    return [...panel.querySelectorAll('button')].find((b) => /UI_PVP_0/.test(b.style.backgroundImage)).title;
  });
  check('② 冷却结束 → 提示 = UI.PvpIcon_Active 官译', titleAfter.length > 0, `title="${titleAfter}"`);
  await page.evaluate(() => { window.__swGame.player.team = 3; window.__swUI.refreshPvpButtons(); });
  const rowFrame = await page.evaluate(() => {
    const panel = window.__swUI.invPanel;
    return [...panel.querySelectorAll('button')].find((b) => /UI_PVP_0/.test(b.style.backgroundImage)).style.backgroundPosition;
  });
  check('② team=3 → 剑行 60%（row=team）',
    parseFloat(rowFrame.split(' ')[1]) === 60 && rowFrame.split(' ')[1].endsWith('%'), rowFrame);
  // 复位
  await page.evaluate(() => {
    const g = window.__swGame;
    g.player.team = 0; g.player.hostile = false;
    window.__swUI.refreshPvpButtons(); window.__swUI.closeInventory();
  });
}

// ---- ③ MapStyle/MapAlpha（Player.cs:24596-24653）----
{
  const init = await page.evaluate(() => {
    const g = window.__swGame;
    return { style: g.renderer.mapStyle, alpha: g.renderer.minimapAlpha, rect: { ...g.renderer.minimapRect } };
  });
  check('③ 默认 mapStyle=1（Main.cs:874）', init.style === 1, `style=${init.style}`);
  check('③ 小地图正常上报矩形', init.rect.w > 0, JSON.stringify(init.rect));
  await page.keyboard.press('Tab');
  await new Promise((r) => setTimeout(r, 300));
  let st = await page.evaluate(() => ({ style: window.__swGame.renderer.mapStyle, rect: { ...window.__swGame.renderer.minimapRect } }));
  check('③ Tab → mapStyle=2（覆盖式）', st.style === 2, `style=${st.style}`);
  check('③ 样式 2 小地图隐藏（零矩形）', st.rect.w === 0, JSON.stringify(st.rect));
  await page.keyboard.press('Tab');
  await new Promise((r) => setTimeout(r, 300));
  st = await page.evaluate(() => ({ style: window.__swGame.renderer.mapStyle, rect: { ...window.__swGame.renderer.minimapRect } }));
  check('③ Tab → mapStyle=0（隐藏）', st.style === 0 && st.rect.w === 0, `style=${st.style}`);
  await page.keyboard.press('Tab');
  await new Promise((r) => setTimeout(r, 300));
  st = await page.evaluate(() => ({ style: window.__swGame.renderer.mapStyle, rect: { ...window.__swGame.renderer.minimapRect } }));
  check('③ Tab → 回 1（循环 0→1）', st.style === 1 && st.rect.w > 0, `style=${st.style}`);
  // α 电平：置 0.5 后按住 PageUp 400ms（≈24t × 0.015 → ~0.86）
  await page.evaluate(() => { window.__swGame.renderer.minimapAlpha = 0.5; });
  await page.keyboard.down('PageUp');
  await new Promise((r) => setTimeout(r, 400));
  await page.keyboard.up('PageUp');
  const a1 = await page.evaluate(() => window.__swGame.renderer.minimapAlpha);
  check('③ PageUp 按住 → α 电平步进（≈0.86）', a1 > 0.8 && a1 < 1, `α=${a1.toFixed(3)}`);
  await page.keyboard.down('PageDown');
  await new Promise((r) => setTimeout(r, 300));
  await page.keyboard.up('PageDown');
  const a2 = await page.evaluate(() => window.__swGame.renderer.minimapAlpha);
  check('③ PageDown 按住 → α 回落', a2 < a1 - 0.2, `α=${a2.toFixed(3)}`);
}

// ---- ④ 全图箱名 hover（Main.cs:55227-55360）----
{
  const out = await page.evaluate(async () => {
    const g = window.__swGame;
    const { TILE_DEFS } = await import('/src/data/tiles.ts');
    const { mapHoverNameKey, mapChestHoverName } = await import('/src/render/Renderer.ts');
    const { Lang } = await import('/src/i18n/Lang.ts');
    // 找 sheet 21（宝箱）内部 id，在玩家右侧放 2×2 帧
    let chestId = -1;
    for (let i = 0; i < TILE_DEFS.length; i++) if (TILE_DEFS[i]?.vanilla?.sheet === 21) { chestId = i; break; }
    const p = g.player;
    const tx = Math.floor(p.cx / 16) + 4, ty = Math.floor(p.cy / 16) - 3;
    const st = g.world.store;
    st.setTile(tx, ty, chestId, 0, 0);
    st.setTile(tx + 1, ty, chestId, 18, 0);
    st.setTile(tx, ty + 1, chestId, 0, 18);
    st.setTile(tx + 1, ty + 1, chestId, 18, 18);
    // 探索门（2×2 四格全标——悬停点落在右下格，只标左列会迷雾拦截）
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      g.world.explored[(ty + dy) * g.world.w + (tx + dx)] = 1;
    }
    // 悬停链同源计算（drawFullMap 内联段 → 此处复算）
    const sheet = TILE_DEFS[st.type[st.idx(tx, ty)]]?.vanilla?.sheet ?? -1;
    const key = mapHoverNameKey(sheet, st.frameX[st.idx(tx, ty)]);
    const typeName = Lang.has(key) ? Lang.text(key) : null;
    return {
      tx, ty, chestId, sheet, key, typeName,
      composed: mapChestHoverName({ typeName: typeName ?? '?', name: null }),
      l10n: { has: Lang.has('LegacyChestType.0'), text: Lang.text('LegacyChestType.0') },
    };
  });
  check('④ 宝箱格 → sheet 21 / 键 LegacyChestType.0', out.sheet === 21 && out.key === 'LegacyChestType.0', JSON.stringify({ sheet: out.sheet, key: out.key }));
  check('④ 官译类型名 = 宝箱（未命名支）', out.l10n.has && out.l10n.text === '宝箱' && out.composed === '宝箱', JSON.stringify(out.l10n));
  // 全屏地图打开态下 hover 字段联动（M 键开关链已由键位批/M 冒烟覆盖——此处
  // 直开图并钉 zoom，排除开图对焦缓动对坐标的干扰）
  await page.evaluate(() => {
    const g = window.__swGame;
    g.renderer.fullMap.open = true;
    g.renderer['_mapInit'] = false;
  });
  await new Promise((r) => setTimeout(r, 300));
  const fmOut = await page.evaluate(({ tx, ty }) => {
    const g = window.__swGame;
    const fm = g.renderer.fullMap;
    const viewW = g.renderer.canvas.width, viewH = g.renderer.canvas.height;
    const cx0 = viewW / 2 - (g.world.w * fm.zoom) / 2 + fm.panX;
    const cy0 = viewH / 2 - (g.world.h * fm.zoom) / 2 + fm.panY;
    // 悬停点 = 箱格中心屏幕坐标；_mouseX 每帧被 input.mouseX 覆盖 → 写源头
    g.input.mouseX = cx0 + (tx + 1) * fm.zoom;
    g.input.mouseY = cy0 + (ty + 1) * fm.zoom;
    return { open: fm.open };
  }, out);
  await new Promise((r) => setTimeout(r, 300));   // 等一帧 drawFullMap
  const hoverName = await page.evaluate(() => window.__swGame.renderer.fullMapHoverName);
  check('④ 全屏地图悬停箱格 → fullMapHoverName=宝箱', fmOut.open && hoverName === '宝箱', `name=${hoverName}`);
  await page.keyboard.press('KeyM');
}

check('零页面错误', errors.length === 0, errors.slice(0, 3).join(' | '));
console.log(`\n== ${pass} pass / ${fail} fail ==`);
await browser.close();
process.exit(fail > 0 ? 1 : 0);
