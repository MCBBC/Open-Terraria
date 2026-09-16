// FX52 探针:税官金币条锚定修正复核(NPCChatPanel.cs:135+140-144 DrawMoney 逐字定谳)。
// 攻击面:
//   A. 真实 Game 链(用户实报 repro):tax_collector + player.taxMoney=118850(11金88银50铜)
//      → openNpcDialog → 币条 = 收集钮右侧同行 106 预留槽(左缘=钮右+19,顶=钮顶-5),
//      不压台词带(台词底 ≤ 币条顶),且「关闭」钮右移 106+30(:143 推进后续钮);
//      截图 /tmp/fx52-tax.png。
//   B. 换行随动(合成 NpcDialog 直驱):collect(coins) 在 index 3(行 0 末列)与
//      index 4(行 1 首列)两种位型——币条矩形恒随其钮(right+19/top-5);
//      且 index 3 型下后续行首钮复位 X=0(:105 换行复位吞掉 :143 的 +106)。
// 跑法:SW_ORIGIN=http://localhost:5254 node tools/run-diag.mjs scripts/_fx52-tax-coins.mjs
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
await page.waitForSelector('.sw-vinv', { timeout: 300000 });
await sleep(3000);   // 世界装载/出生落位链(unembed/ForceClearArea)走完再开对话——过早入场的实体可能被装载链清掉

let pass = 0; let fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log(`PASS ${name}${extra ? ' | ' + extra : ''}`); }
  else { fail++; console.log(`FAIL ${name}${extra ? ' | ' + extra : ''}`); }
};
const approx = (a, b, tol = 2) => Math.abs(a - b) <= tol;

// ================= A. 真实链:税官 + 税款>0(用户实报 repro) =================
await page.evaluate(() => { document.getElementById('sw-welcome-announce')?.remove(); });
const A = await page.evaluate(async () => {
  const g = window.__swGame;
  const gAny = g;
  const { TownNPC } = await import('/src/entities/TownNPC.ts');
  // 重试 6 次：世界装载链可能清掉早入场实体/走远收面板——每轮重插+重钉+重开
  let n = null;
  for (let i = 0; i < 6; i++) {
    if (!n || n.dead || !g.entities.npcs.includes(n)) {
      n = new TownNPC('tax_collector', g.player.x + 40, g.world.groundLevel * 16 - 48);
      n.home = null;
      g.entities.add(n, 'npcs');
      window.__fx52npc = n;
    }
    n.dead = false;
    n.x = g.player.x + 40; n.y = g.world.groundLevel * 16 - n.h; n.vx = 0; n.vy = 0;
    g.player.x = n.x - (n.w / 2) - 12; g.player.y = n.y + n.h - g.player.h;
    g.player.vx = 0; g.player.vy = 0;
    g.player.taxMoney = 118850;   // 11金 88银 50铜(用户实报值)
    gAny.openNpcDialog.call(g, n);
    await new Promise((r) => setTimeout(r, 600));
    if (document.querySelector('.sw-npc-dialog')) break;
  }
  await new Promise((r) => setTimeout(r, 1300));   // 头像 hop 1.333s 落定
  const panel = document.querySelector('.sw-npc-dialog');
  if (!panel) return { panelExists: false, npcDead: n?.dead ?? null };
  const pr = panel.getBoundingClientRect();
  const chat = panel.querySelector('.sw-npc-chat');
  const cr = chat.getBoundingClientRect();
  const lines = Math.max(1, Math.round(chat.scrollHeight / 30));
  const btns = [...panel.querySelectorAll('button[data-b]')].map((b) => ({ id: b.dataset.b, r: b.getBoundingClientRect() }));
  const tag = panel.querySelector('.sw-npc-coins');
  const tr = tag?.getBoundingClientRect();
  const collect = btns.find((b) => b.id === 'collect')?.r;
  const close = btns.find((b) => b.id === 'close')?.r;
  return {
    panelExists: true, text: tag?.textContent ?? '',
    panelH: pr.height, lines,
    chatBottom: cr.bottom, chatTop: cr.top, chatH: cr.height,
    tag: tr ? { l: tr.left, t: tr.top, r: tr.right, b: tr.bottom, w: tr.width } : null,
    collect: collect ? { l: collect.left, t: collect.top, r: collect.right, b: collect.bottom } : null,
    close: close ? { l: close.left, t: close.top, r: close.right } : null,
    btnIds: btns.map((b) => b.id),
    panelRect: { l: pr.left, t: pr.top, r: pr.right, b: pr.bottom },
  };
});
ok('A1 对话面板打开(按钮序=collect,close,home)', A.panelExists && A.btnIds.join(',') === 'collect,close,home', A.btnIds?.join(','));
ok('A2 币条文案=11金88银50铜', A.text.includes('11') && A.text.includes('88') && A.text.includes('50'), A.text);
ok('A3 币条左缘=收集钮右+19', A.tag && A.collect && approx(A.tag.l - A.collect.r, 19, 3), `Δ=${(A.tag.l - A.collect.r).toFixed(1)}`);
ok('A4 币条顶=钮顶-5(同行,币心带 y=钮顶+6)', A.tag && A.collect && approx(A.tag.t - A.collect.t, -5, 3), `Δ=${(A.tag.t - A.collect.t).toFixed(1)}`);
ok('A5 币条不压台词带(币条顶 ≥ 台词底)', A.tag && A.tag.t >= A.chatBottom - 1, `币条顶-台词底=${(A.tag.t - A.chatBottom).toFixed(1)}(台词底 ${A.chatBottom.toFixed(1)} 行数${A.lines})`);
ok('A6 关闭钮右移 = 钮宽+30+106(:143 推进后续钮)', A.close && A.collect && approx(A.close.l - A.collect.r, 136, 3), `Δ=${(A.close.l - A.collect.r).toFixed(1)}`);
ok('A7 币条整体在面板内(右缘 ≤ 面板右)', A.tag && A.tag.r <= A.panelRect.r + 1, `币条右 ${A.tag.r.toFixed(1)} ≤ 面板右 ${A.panelRect.r.toFixed(1)}`);
{
  const pr = A.panelRect;
  await page.screenshot({ path: '/tmp/fx52-tax.png', clip: {
    x: Math.max(0, pr.l - 210), y: Math.max(0, pr.t - 30),
    width: Math.min(1400, pr.r - pr.l + 260), height: Math.min(900, pr.b - pr.t + 60) } });
  console.log('screenshot -> /tmp/fx52-tax.png');
}
await page.evaluate(() => { const g = window.__swGame; g.npcDialogButton('close'); });

// ================= B. 换行随动(合成直驱,collect 非首位两种位型) =================
const B = await page.evaluate(async () => {
  const { NpcDialog } = await import('/src/ui/NpcDialog.ts');
  const dlg = new NpcDialog(document.body, () => {});
  const mk = (i, coins) => ({ id: coins ? 'collect' : `b${i}`, label: `选项${i}`, ...(coins ? { coins: 118850 } : {}) });
  const measure = () => {
    const panel = document.querySelector('.sw-npc-dialog');
    const btns = [...panel.querySelectorAll('button[data-b]')].map((b) => ({ id: b.dataset.b, r: b.getBoundingClientRect() }));
    const tag = panel.querySelector('.sw-npc-coins');
    const tr = tag?.getBoundingClientRect();
    const host = btns.find((b) => b.id === 'collect')?.r;
    const firstRow2 = btns[4]?.r;
    return {
      tag: tr ? { l: tr.left, t: tr.top, r: tr.right, w: tr.width } : null,
      host: host ? { l: host.left, t: host.top, r: host.right, w: host.width } : null,
      row2FirstLeft: firstRow2 ? firstRow2.left - btns[0].r.left : -1,   // 行 1 首钮相对行 0 首钮 X
      chatBottom: panel.querySelector('.sw-npc-chat').getBoundingClientRect().bottom,
    };
  };
  // B1:collect 在 index 3(行 0 末列,币条悬行 0 右端;后续行 1 首钮 X 复位)
  dlg.open('换行A', '台词。', [mk(0), mk(1), mk(2), mk(3, true), mk(4), mk(5)], null);
  await new Promise((r) => setTimeout(r, 120));
  const b1 = measure();
  dlg.close();
  // B2:collect 在 index 4(行 1 首列,换行后锚随动)
  dlg.open('换行B', '台词。', [mk(0), mk(1), mk(2), mk(3), mk(4, true), mk(5)], null);
  await new Promise((r) => setTimeout(r, 120));
  const b2 = measure();
  dlg.close();
  return { b1, b2 };
});
const dx = (s) => s.tag && s.host ? (s.tag.l - s.host.r).toFixed(1) : 'n/a';
const dy = (s) => s.tag && s.host ? (s.tag.t - s.host.t).toFixed(1) : 'n/a';
ok('B1[collect=行0末列] 币条左缘=钮右+19', B.b1.tag && B.b1.host && approx(B.b1.tag.l - B.b1.host.r, 19, 3), `Δ=${dx(B.b1)}`);
ok('B1[collect=行0末列] 币条顶=钮顶-5(随行 0)', B.b1.tag && B.b1.host && approx(B.b1.tag.t - B.b1.host.t, -5, 3), `Δ=${dy(B.b1)}`);
ok('B1 行1首钮 X 复位 0(:105 吞 :143 推进)', approx(B.b1.row2FirstLeft, 0, 2), `Δ=${B.b1.row2FirstLeft.toFixed(1)}`);
ok('B2[collect=行1首列] 币条左缘=钮右+19(锚随动)', B.b2.tag && B.b2.host && approx(B.b2.tag.l - B.b2.host.r, 19, 3), `Δ=${dx(B.b2)}`);
ok('B2[collect=行1首列] 币条顶=钮顶-5(随行 1)', B.b2.tag && B.b2.host && approx(B.b2.tag.t - B.b2.host.t, -5, 3), `Δ=${dy(B.b2)}`);

console.log(`\npageerrors: ${errs.length ? errs.join(' | ') : '(none)'}`);
console.log(`\nRESULT pass=${pass} fail=${fail}`);
await browser.close();
process.exit(fail > 0 || errs.length > 0 ? 1 : 0);
