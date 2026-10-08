// ★BJ572 面②活体验证：右键开径向菜单→左键图标 XOR ToolMode→右键收。
import { launchBrowser, openPage, bootstrap, createGame, pump } from '../tools/probe/lib/index.mjs';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5201';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN);
await createGame(page, { mode: 'direct', seed: '05162020', size: 'small', pinRandom: 20260923 });
await page.evaluate(() => {
  const g = window.__swGame;
  const byKey = window.__swItems ?? {};
  const key = Object.keys(byKey).find((k) => /^vi_3611_/.test(k));
  g.player.inv.slots[0] = { id: byKey[key], stack: 1 };
  g.player.selected = 0;
  const r = g.renderer;
  window.__radialSnap = () => {
    const ui = r.wiresRadialUi;
    return ui ? { active: ui.st.active, px: ui.st.px, py: ui.st.py, op: Math.round(ui.st.opacity * 100) / 100, mode: ui.toolMode, vid: ui.heldVid } : null;
  };
});
await pump(page, 30);
console.log('INITIAL:', JSON.stringify(await page.evaluate(() => window.__radialSnap())));
// 右键（press+release）→ 径向开
await page.mouse.move(700, 400);
await page.mouse.click(700, 400, { button: 'right' });
await pump(page, 3);
console.log('AFTER-RCLICK:', JSON.stringify(await page.evaluate(() => window.__radialSnap())));
// 左键点红色图标槽（右下方向?读槽位几何——直接读 renderer 注入槽位:点 opening position=700,400,红=槽0）
const redPos = await page.evaluate(() => {
  const ui = window.__swGame.renderer.wiresRadialUi;
  // 从 wiresRadial 模块几何复算不可得,直接点鼠标开位下方模式:左键在开位=中心剪线钳——先点空白关?改为点红槽:重开一次在已知位置
  return ui ? { px: ui.st.px, py: ui.st.py } : null;
});
// 红槽角 = px+cos(ang)·45 —— 直接用活体 API 不可达,以屏幕坐标近似:开位中心=(700,400),红槽在角度 3·2π/5−π/11
const ang = 3 * (Math.PI * 2) / 5 - Math.PI / 11;
const rx = 700 + Math.cos(ang) * 45, ry = 400 + Math.sin(ang) * 45;
await page.mouse.click(rx, ry, { button: 'left' });
await pump(page, 3);
const after = await page.evaluate(() => window.__radialSnap());
console.log('AFTER-LCLICK-ICON:', JSON.stringify(after), 'expect mode bitToggled; active stays');
// 右键收
await page.mouse.click(700, 400, { button: 'right' });
await pump(page, 3);
console.log('AFTER-RCLICK2:', JSON.stringify(await page.evaluate(() => window.__radialSnap())));
await browser.close();
