// 刀20 对话面板 1:1 呈现探针（NPCChatPanel.cs:52-86 几何 + DrawNPCPortrait 四模式）。
// 跑法：SW_PORT=5201 SW_NO_HMR=1 SW_CACHE=/tmp/sw-vite-5201 nohup npx vite 后台起，
//       SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_fx20-dialog-panel-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = process.env.SW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, defaultViewport: { width: 1400, height: 900 } });
const page = await browser.newPage();
const errs = [];
page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
await page.waitForFunction((sel) => document.querySelector(sel), { timeout: 300000, polling: 1000 }, '.sw-vinv');
await sleep(800);

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS ${name}${extra ? ' | ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
};
const approx = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// ============ A. 面板几何（cb 直驱,8 按钮两行 + 长台词）============
const A = await page.evaluate(async () => {
  document.getElementById('sw-welcome-announce')?.remove();
  const ui = window.__swUI;
  const buttons = ['shop', 'shopDecor', 'collect', 'heal', 'close', 'status', 'quest', 'help']
    .map((id, i) => ({ id, label: `按钮${i}${id}`, coins: id === 'heal' ? 12345 : undefined }));
  ui.showNpcDialog('商人', '第一行台词\n第二行台词', buttons,
    { vanillaId: 17, variationIndex: 0, altTexture: 0, shimmered: false, url: 'sprites/portraits/Portrait_Merchant.png' }, 17, 0);
  await new Promise((r) => setTimeout(r, 200));
  // hop 动画 1.333s——窗/名字几何断言须待落定（transform translateY 影响矩形）
  const panel = document.querySelector('.sw-npc-dialog');
  if (!panel) return { panelExists: false };
  const pr = panel.getBoundingClientRect();
  const chat = panel.querySelector('.sw-npc-chat');
  const cr = chat.getBoundingClientRect();
  const cs = getComputedStyle(chat);
  const btns = [...panel.querySelectorAll('button[data-b]')].map((b) => b.getBoundingClientRect());
  const bgBody = panel.querySelector('.sw-npc-bg-body');
  const bgBodyImg = panel.querySelector('.sw-npc-bg-body img');
  const bgCap = panel.querySelector('.sw-npc-bg-cap img');
  // 台词行数（scrollHeight/30）
  const lines = Math.max(1, Math.round(chat.scrollHeight / 30));
  const btnRows = 2;
  const H = 30 + 30 * lines + 30 * btnRows + 2 * (btnRows - 1);
  // 金币条（heal 钮 −151,−44）
  const healBtn = panel.querySelector('button[data-b="heal"]');
  const tag = healBtn?.querySelector('.sw-npc-coins');
  const hr = healBtn?.getBoundingClientRect();
  const tr = tag?.getBoundingClientRect();
  return {
    panelExists: true,
    width: pr.width, top: pr.top, left: pr.left, vw: window.innerWidth, height: pr.height,
    expectHeight: H, lines,
    chatLeft: cr.left - pr.left, chatTop: cr.top - pr.top, chatW: cs.width,
    lineHeight: cs.lineHeight,
    bodyImgH: bgBodyImg ? parseFloat(getComputedStyle(bgBodyImg).height) : -1,
    bodyH: bgBody?.getBoundingClientRect().height ?? -1,
    hasCap: !!bgCap,
    btnTops: btns.map((b) => b.top), btnLefts: btns.map((b) => b.left),
    btnHeights: btns.map((b) => b.height),
    btnRow0TopDelta: btns.length ? btns[0].top - pr.bottom : -1,
    coinsDeltaX: tr && hr ? hr.left - tr.left : -1,
    coinsDeltaY: tr && hr ? tr.top - hr.top : -1,
    hasCoins: !!tag, coinsText: tag?.textContent ?? '',
  };
});
ok('A1 面板存在', A.panelExists);
ok('A2 面板宽 500', approx(A.width, 500, 1), `w=${A.width}`);
ok('A3 面板 y=100 顶置', approx(A.top, 100, 1), `top=${A.top}`);
ok('A4 面板水平居中(screenWidth/2-250)', approx(A.left, A.vw / 2 - 250, 1), `left=${A.left} vw/2-250=${A.vw / 2 - 250}`);
ok('A5 文本 inset (20,20)', approx(A.chatLeft, 20, 1) && approx(A.chatTop, 20, 1), `l=${A.chatLeft} t=${A.chatTop}`);
ok('A6 换行宽 460', approx(parseFloat(A.chatW), 460, 1), `w=${A.chatW}`);
ok('A7 行距 30', A.lineHeight === '30px', `lh=${A.lineHeight}`);
ok('A8 面板高=30+30L+30n+max(0,2(n-1))', approx(A.height, A.expectHeight, 1), `h=${A.height} expect=${A.expectHeight} lines=${A.lines}`);
// A9(②刀 2026-09-14 更):反编译核读 NPCChatPanel.cs:71 主体 = Draw(tex, TopLeft,
// source(0,0,500,rect.H-30))——源高=目标高【1:1 零拉伸】切顶部 H-30 行(旧断言
// 「源(0,0,500,470)→H-30 纵向压缩」系 spec 转写误锚=顶角被压扁根因,已修)
ok('A9 Chat_Back 两段绘制 1:1(主体=源顶 H-30 行@原尺寸 :71,底帽=源(0,470,500,30) :72)',
  approx(A.bodyImgH, 500, 1) && approx(A.bodyH, A.height - 30, 1) && A.hasCap, `imgH=${A.bodyImgH} bodyH=${A.bodyH} cap=${A.hasCap}`);
// 按钮行：行高 22 / 列距 30 / 4 列换行（:97/:103-107/:135）
ok('A10 按钮行高 22', A.btnHeights.every((h) => approx(h, 22, 1)), `hs=${A.btnHeights.join(',')}`);
ok('A11 4 列换行(第 5 钮回行首)', approx(A.btnLefts[4], A.btnLefts[0], 1) && approx(A.btnTops[4] - A.btnTops[0], 22, 1), `l4=${A.btnLefts[4]} l0=${A.btnLefts[0]} dy=${A.btnTops[4] - A.btnTops[0]}`);
const colGap = await page.evaluate(() => {
  const panel = document.querySelector('.sw-npc-dialog');
  const bs = [...panel.querySelectorAll('button[data-b]')].slice(0, 4).map((b) => b.getBoundingClientRect());
  return bs[1].left - (bs[0].left + bs[0].width);
});
ok('A12 列距 30', approx(colGap, 30, 1), `gap=${colGap}`);
ok('A13 行高 22(第 2 行 top 差)', approx(A.btnTops[4] - A.btnTops[0], 22, 1));
// 金币条：DrawMoney @ (rect.X-45,rect.Y-44) 后 rect.X+=106 → 按钮相对 (-151,-44)
ok('A14 金币条 @按钮(-151,-44)', A.hasCoins && approx(A.coinsDeltaX, 151, 3) && approx(A.coinsDeltaY, -44, 3), `dx=${A.coinsDeltaX} dy=${A.coinsDeltaY} text=${A.coinsText}`);

// ============ B. 头像四模式（真实 Game 开商人对话 + options 切换）============
await page.evaluate(async () => {
  const g = window.__swGame;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  const n = new TownNPC('merchant', g.player.x + 30, g.world.groundLevel * 16 - 48);
  n.home = { x: Math.floor(n.cx / 16), y: Math.floor(n.cy / 16) };
  g.entities.add(n, 'npcs');
  (window).__fx20npc = n;
});
const B = await page.evaluate(async (mode) => {
  const g = window.__swGame;
  const { options } = await import('/src/core/Options.ts');
  options.data.dialoguePortraitMode = mode;
  g.closeNpcDialog();
  const npc = window.__fx20npc;
  g.player.x = npc.cx - 30; g.player.y = npc.cy - 8;
  g.openNpcDialog.call(g, npc);
  await new Promise((r) => setTimeout(r, 1500));   // 待 hop 动画(1.333s)落定再测几何
  const panel = document.querySelector('.sw-npc-dialog');
  const wrap = panel?.querySelector('.sw-npc-portrait-wrap');
  const win = panel?.querySelector('.sw-npc-window');
  const cv = panel?.querySelector('canvas.sw-npc-portrait');
  const pname = panel?.querySelector('.sw-npc-pname');
  let px = -1; let pxInClip = -1; let pxOutClip = -1;
  if (cv) {
    const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
    px = 0; pxInClip = 0; pxOutClip = 0;
    for (let y = 0; y < cv.height; y++) {
      for (let x = 0; x < cv.width; x++) {
        if (d[(y * cv.width + x) * 4 + 3] > 8) {
          px++;
          const inClip = x >= 52 && x <= 148 && y >= 2 && y <= 148;
          if (inClip) pxInClip++; else pxOutClip++;
        }
      }
    }
  }
  // 名字行位置 = P+(0,57)：P = 面板左上 + (-62,+62)
  const pr = panel?.getBoundingClientRect();
  const nr = pname?.getBoundingClientRect();
  const nameDx = pr && nr ? (pr.left - 62) - (nr.left + nr.width / 2) : -1;
  const nameDy = pr && nr ? (pr.top + 62 + 57) - (nr.top + nr.height / 2) : -1;
  // 底框：面板左上 + (-118,+6)
  const wr = win?.getBoundingClientRect();
  const winDx = pr && wr ? (pr.left - 118) - wr.left : -1;
  const winDy = pr && wr ? (pr.top + 6) - wr.top : -1;
  return {
    hasPanel: !!panel, hasWrap: !!wrap, hasWin: !!win, hasCanvas: !!cv, hasName: !!pname,
    px, pxInClip, pxOutClip, hopClass: wrap ? wrap.classList.contains('sw-portrait-hop') : false,
    nameDx, nameDy, winDx, winDy,
    nameText: pname?.textContent ?? '',
  };
}, 'detailed');
ok('B1 detailed:窗+画布+名字行齐备', B.hasWrap && B.hasWin && B.hasCanvas && B.hasName);
ok('B2 detailed:画布有像素(200×200 原尺寸直绘)', B.px > 500, `px=${B.px}`);
ok('B3 底框 @面板左上(-118,+6)', approx(B.winDx, 0, 2) && approx(B.winDy, 0, 2), `dx=${B.winDx} dy=${B.winDy}`);
ok('B4 名字行 @P+(0,57) 中心锚', approx(B.nameDx, 0, 3) && approx(B.nameDy, 0, 3), `dx=${B.nameDx} dy=${B.nameDy}`);
ok('B5 首开 hop 类(EaseOutBounce 80 帧)', B.hopClass);
const B2 = await page.evaluate(async () => {
  const g = window.__swGame;
  const npc = window.__fx20npc;
  g.refreshNpcDialog.call(g, npc, '再次刷新台词');
  await new Promise((r) => setTimeout(r, 300));
  const wrap = document.querySelector('.sw-npc-dialog .sw-npc-portrait-wrap');
  return { hopClass: wrap ? wrap.classList.contains('sw-portrait-hop') : false, hasPanel: !!wrap };
});
ok('B6 刷新(非 hop 动作)不重播 hop', B2.hasPanel && !B2.hopClass);
for (const mode of ['closeUp', 'fullBodyRetro']) {
  const R = await page.evaluate(async (m) => {
    const g = window.__swGame;
    const { options } = await import('/src/core/Options.ts');
    options.data.dialoguePortraitMode = m;
    g.closeNpcDialog();
    const npc = window.__fx20npc;
    g.openNpcDialog.call(g, npc);
    await new Promise((r) => setTimeout(r, 600));
    const cv = document.querySelector('.sw-npc-dialog canvas.sw-npc-portrait');
    let px = -1; let pxOutClip = -1;
    if (cv) {
      const d = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
      px = 0; pxOutClip = 0;
      for (let y = 0; y < cv.height; y++) {
        for (let x = 0; x < cv.width; x++) {
          if (d[(y * cv.width + x) * 4 + 3] > 8) {
            px++;
            if (!(x >= 52 && x <= 148 && y >= 2 && y <= 148)) pxOutClip++;
          }
        }
      }
    }
    return { hasCanvas: !!cv, px, pxOutClip };
  }, mode);
  ok(`B7 ${mode}:画布有像素`, R.hasCanvas && R.px > 200, `px=${R.px}`);
  if (mode === 'closeUp') ok('B8 closeUp:剪裁窗 96×146 外无像素', R.pxOutClip === 0, `out=${R.pxOutClip}`);
}
const B3 = await page.evaluate(async () => {
  const g = window.__swGame;
  const { options } = await import('/src/core/Options.ts');
  options.data.dialoguePortraitMode = 'disabled';
  g.closeNpcDialog();
  g.openNpcDialog.call(g, window.__fx20npc);
  await new Promise((r) => setTimeout(r, 200));
  const panel = document.querySelector('.sw-npc-dialog');
  return {
    panel: !!panel,
    wrap: !!panel?.querySelector('.sw-npc-portrait-wrap'),
    win: !!panel?.querySelector('.sw-npc-window'),
    cv: !!panel?.querySelector('canvas.sw-npc-portrait'),
    name: !!panel?.querySelector('.sw-npc-pname'),
  };
});
ok('B9 disabled:整段不画(连底框/名字也没有,:41015)', B3.panel && !B3.wrap && !B3.win && !B3.cv && !B3.name);

// ============ C. 按钮接线 + 台词 ≤10 行截断 + 截图 ============
const C = await page.evaluate(async () => {
  const g = window.__swGame;
  const ui = window.__swUI;
  // 长台词 >10 行 → 面板高封顶在 30+300+按钮行
  const buttons = [{ id: 'close', label: '关闭' }];
  ui.showNpcDialog('商人', '长\n'.repeat(40) + '台词', buttons, null, 17, 0);
  await new Promise((r) => setTimeout(r, 150));
  const panel = document.querySelector('.sw-npc-dialog');
  const chat = panel?.querySelector('.sw-npc-chat');
  const maxH = chat ? parseFloat(getComputedStyle(chat).maxHeight) : -1;
  const linesCapped = chat ? Math.round(chat.getBoundingClientRect().height / 30) : -1;
  return { maxH, linesCapped, panelH: panel?.getBoundingClientRect().height ?? -1 };
});
ok('C1 台词 ≤10 行封顶(maxHeight 300)', approx(C.maxH, 300, 1) && C.linesCapped <= 10, `maxH=${C.maxH} visLines=${C.linesCapped}`);
// 截图（商人实机对话,detailed）
await page.evaluate(async () => {
  const g = window.__swGame;
  const { options } = await import('/src/core/Options.ts');
  options.data.dialoguePortraitMode = 'detailed';
  g.closeNpcDialog();
  g.openNpcDialog.call(g, window.__fx20npc);
  await new Promise((r) => setTimeout(r, 500));
});
const dlg = await page.$('.sw-npc-dialog');
if (dlg) await dlg.screenshot({ path: '/tmp/fx20-dialog.png' });
// 含头像窗的全景（头像悬在面板左外侧,元素截图裁不到）
const pr = await page.evaluate(() => {
  const r = document.querySelector('.sw-npc-dialog')?.getBoundingClientRect();
  return r ? { x: r.left, y: r.top, w: r.width, h: r.height } : null;
});
if (pr) {
  await page.screenshot({ path: '/tmp/fx20-dialog-wide.png', clip: {
    x: Math.max(0, pr.x - 180), y: Math.max(0, pr.y - 10),
    width: Math.min(1400, pr.w + 190), height: pr.h + 20,
  } });
}
ok('C2 截图 /tmp/fx20-dialog.png + /tmp/fx20-dialog-wide.png', true);
// 关闭钮 mousedown 直驱收面板（接线等价）
const C3 = await page.evaluate(async () => {
  const g = window.__swGame;
  const btn = [...document.querySelectorAll('.sw-npc-dialog button[data-b="close"]')][0];
  btn?.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 }));
  await new Promise((r) => setTimeout(r, 200));
  return { panelGone: !document.querySelector('.sw-npc-dialog'), npcCleared: g.dialogNpc === null };
});
ok('C3 关闭钮 mousedown 直驱=面板收+dialogNpc 清', C3.panelGone && C3.npcCleared);

console.log(`\nfx20 probe: ${pass} PASS / ${fail} FAIL  errs:${errs.length ? ' ' + errs.slice(0, 2).join(' | ') : ' none'}`);
if (errs.length) { fail++; console.log('FAIL 页面错误存在'); }
await browser.close();
process.exit(fail ? 1 : 0);
