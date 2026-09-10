// SW-FX28 刀①探针(2026-09-11)——箱子态内嵌布局实机面(几何金标+开/关流+让位共存)
// 运行:node tools/probe.mjs run scripts/_sw-fx28-chest-probe.mjs --vite=auto
// 金标:Terarria1457 ChestUI.cs:375-376/:158/:186/:198 + Main.cs:43073-43108(让位)
import puppeteer from 'puppeteer-core';

const CHROME = process.env.SW_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ORIGIN = process.env.SW_ORIGIN ?? 'http://localhost:5199';
const fails = [];
const ok = (cond, name) => {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${name}`);
  if (!cond) fails.push(name);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new', protocolTimeout: 600000,
  defaultViewport: { width: 1600, height: 1000 },   // K=1:vanillaScaleFor(1600,1000)=1
});

{
  const page = await browser.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push((e.stack || e.message).slice(0, 200)));
  await page.goto(ORIGIN + '/?play=small&invlayout=vanilla', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swUI, { timeout: 280000, polling: 1000 });
  await page.waitForFunction(() => document.querySelector('.sw-vinv'), { timeout: 240000, polling: 1000 });
  await sleep(800);
  const out = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ui = window.__swUI;
    const g = window.__swGame;
    // 金标几何(ChestUI.cs 逐槽截断;与 vanillaInvLayout.ts 同式)
    const gx = (i) => Math.trunc(73 + (i % 10) * 56 * 0.755);
    const gy = (i) => Math.trunc(258 + Math.floor(i / 10) * 56 * 0.755);
    document.getElementById('sw-welcome-announce')?.remove();
    const o = {};

    // ---- 放一只真木箱(内部 tile 16=BASIC_CHEST,sheet 21 四格帧)+全流程开箱 ----
    const w = g.world;
    const px = Math.floor(g.player.cx), py = Math.floor(g.player.cy);
    const cx = Math.min(px + 3, w.width - 3), cy = Math.min(py + 1, w.height - 3);
    const st = w.store;
    const setT = (x, y, fx, fy) => st.setTileSilent(x, y, 16, fx, fy);
    setT(cx, cy, 0, 0); setT(cx + 1, cy, 18, 0); setT(cx, cy + 1, 0, 18); setT(cx + 1, cy + 1, 18, 18);
    const chest = { x: cx, y: cy, items: Array.from({ length: 40 }, (_, i) => (i < 2 ? { id: 1, stack: 1 } : null)) };
    w.chests.push(chest);
    (g).tryOpenChest?.(chest);
    if (!ui.openChest) {   // 兜底:直开面板(音效面由 BJ17 单测覆盖)
      g.openChest?.(chest);
    }
    await sleep(250);
    o.openGate = !!ui.openChest;
    o.invOpenAfterChest = document.querySelector('.sw-vinv')?.style.display === 'block';

    // ---- 箱条几何:40 槽 offsetLeft/Top 逐槽 == 金标 ----
    const slots = [...document.querySelectorAll('.sw-vinv .sw-slot[data-where="chest"]')];
    o.slotCount = slots.length;
    o.slotMismatch = [];
    for (const s of slots) {
      const i = Number(s.dataset.idx);
      if (s.offsetLeft !== gx(i) || s.offsetTop !== gy(i)) {
        o.slotMismatch.push({ i, got: [s.offsetLeft, s.offsetTop], want: [gx(i), gy(i)] });
      }
    }
    o.slotsGeometryOk = slots.length === 40 && o.slotMismatch.length === 0;

    // ---- 名字 @ (504,258),文本=LegacyChestType.0 ----
    const nameEl = [...document.querySelectorAll('.sw-vinv .vinv-txt')]
      .find((e) => e.offsetLeft === 504 && e.offsetTop === 258);
    o.namePosOk = !!nameEl;
    o.nameText = nameEl?.textContent ?? '';

    // ---- 按钮列采集(类 vinv-txt 的 button;文本钮,x=506 域=ChestUI.cs:186)
    //      —— .sw-vinv 内另有设置钮(右下角坞)同名类,按 x=506 划界 ----
    const chestBtns = [...document.querySelectorAll('.sw-vinv .vinv-txt')]
      .filter((b) => b.tagName === 'BUTTON' && b.offsetParent !== null && b.offsetLeft === 506);
    o.btnPos = chestBtns.map((b) => [b.offsetLeft, b.offsetTop, b.textContent]);
    o.btnGeometryOk = o.btnPos.length === 5
      && o.btnPos.every((p, id) => p[1] === 298 + id * 26);

    // ---- 开箱态让位共存:垃圾桶 (453,426) scale0.755;2×2 钮藏;图鉴/表情 (503/539,446) ----
    const trash = document.querySelector('.sw-vinv .sw-trash');
    o.trashPos = trash ? { x: trash.offsetLeft, y: trash.offsetTop, tf: trash.style.transform } : null;
    o.trashDisplacedOk = trash && trash.offsetLeft === 453 && trash.offsetTop === 426
      && trash.style.transform === 'scale(0.755)';
    const btnByTex = (tex) => [...document.querySelectorAll('.sw-vinv .vinv-btn')]
      .find((b) => b.style.backgroundImage.includes(tex));
    const quick = btnByTex('UI_ChestStack');
    const sort = btnByTex('UI_Sort');
    o.quickHiddenOk = !quick || quick.offsetParent === null;
    o.sortHiddenOk = !sort || sort.offsetParent === null;
    const best = btnByTex('UI_Bestiary');
    const emote = btnByTex('UI_Emotes');
    o.bestiaryOk = !!best && best.offsetLeft === 503 && best.offsetTop === 446 && best.offsetParent !== null;
    o.emoteOk = !!emote && emote.offsetLeft === 539 && emote.offsetTop === 446 && emote.offsetParent !== null;

    // ---- 命中域:槽中心 elementFromPoint == 箱槽本体(真实可点,非缓存) ----
    const s0 = slots.find((s) => s.dataset.idx === '0');
    const s39 = slots.find((s) => s.dataset.idx === '39');
    const hit0 = s0 ? document.elementFromPoint(s0.offsetLeft + 19, s0.offsetTop + 19) : null;
    const hit39 = s39 ? document.elementFromPoint(s39.offsetLeft + 19, s39.offsetTop + 19) : null;
    o.hit0Ok = hit0 === s0 || (hit0 && s0.contains(hit0));
    o.hit39Ok = hit39 === s39 || (hit39 && s39.contains(hit39));

    // ---- 关箱流:关包 → 箱条整体 display:none → 重开复原同位 ----
    ui.closeInventory();
    await sleep(150);
    const hidden = slots.every((s) => s.offsetParent === null || s.style.display === 'none');
    o.closeHidesStrip = hidden && !ui.openChest;
    (g).tryOpenChest?.(chest);
    if (!ui.openChest) g.openChest?.(chest);
    await sleep(200);
    const re = [...document.querySelectorAll('.sw-vinv .sw-slot[data-where="chest"]')];
    o.reopenRestores = re.length === 40
      && re.every((s) => s.offsetParent !== null
        && s.offsetLeft === gx(Number(s.dataset.idx)) && s.offsetTop === gy(Number(s.dataset.idx)));

    // ---- 走远关箱(同箱再点=关, BJ17 音面单测覆盖;此处验 chest 态回收) ----
    (g).tryOpenChest?.(chest);
    await sleep(150);
    o.reclickCloses = !ui.openChest;

    // ---- 债项在案(不判绿):重命名钮 ID5/6 未画(登记债 editChest IME 流) ----
    o.renameDebtStillOpen = o.btnPos.length === 5;
    o.pageErrors = [];
    return o;
  });
  out.pageErrors = errs;
  for (const [k, v] of Object.entries(out)) {
    if (k !== 'pageErrors' && k !== 'slotMismatch' && k !== 'btnPos') console.log(`  ${k} = ${JSON.stringify(v)}`);
  }
  console.log(`  slotMismatch = ${JSON.stringify(out.slotMismatch.slice(0, 5))}`);
  console.log(`  btnPos = ${JSON.stringify(out.btnPos)}`);
  ok(out.openGate && out.invOpenAfterChest, '开箱流:开箱即开包(Main.cs:41164 playerInventory=true 同相)');
  ok(out.slotsGeometryOk, `箱条 40 槽逐槽==金标 73/258 步 42.28 截断(实测 mismatch=${out.slotMismatch.length})`);
  ok(out.namePosOk, `箱名 @(504,258) ChestUI.cs:158(文本=${out.nameText})`);
  ok(out.btnGeometryOk, '钮列 5 颗 @(506,298+id*26) ChestUI.cs:186/:198');
  ok(out.trashDisplacedOk, `垃圾桶让位 (453,426) scale0.755(实测 ${JSON.stringify(out.trashPos)})`);
  ok(out.quickHiddenOk && out.sortHiddenOk, '开箱态 堆叠/排列钮隐藏(Main.cs:42548)');
  ok(out.bestiaryOk && out.emoteOk, '图鉴/表情让位 (503/539,446)(Main.cs:43103-43108)');
  ok(out.hit0Ok && out.hit39Ok, '命中域:槽 0/39 中心 elementFromPoint=箱槽本体');
  ok(out.closeHidesStrip, '关包 → 箱条整体隐藏+openChest 清');
  ok(out.reopenRestores, '重开 → 40 槽同位复原');
  ok(out.reclickCloses, '同箱再点 → 关(chest=-1)');
  ok(out.renameDebtStillOpen, '登记债在案:重命名 ID5/6 未画(不判绿)');
  ok(out.pageErrors.length === 0, '红方:零页面错误');
  for (const e of out.pageErrors) console.log(`  pageError: ${e}`);
  await page.close();
}
await browser.close();
console.log(fails.length === 0 ? 'ALL PASS' : `FAILED: ${fails.length}`);
process.exit(fails.length === 0 ? 0 : 1);
