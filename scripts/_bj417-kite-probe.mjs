// BJ417 探针②：风筝同型在场门——首用出膛、二次左键不得重放（零副作用面）。
// 用法: SW_ORIGIN=http://localhost:5530 node tools/run-diag.mjs scripts/_bj417-kite-probe.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.log(JSON.stringify({ fatal: 'game boot timeout' })); await browser.close(); process.exit(1); }
const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  // 交错步进：每拍 fixedUpdate + 等 rAF 帧跑完（use 链/entities 更新在帧回路,
  // 纯同步 burst 会与帧错位=边沿被吞,探针时序伪影）
  const step = async (n) => {
    for (let i = 0; i < n; i++) {
      g.fixedUpdate(1 / 60); await raf();
      // ★探针坑自捕（死玩家尘假象族）：钉位若在地下,敌怪咬死玩家 → Kill 门 dead 腿
      //   收风筝 = 假红。地表钉位 + 每拍清怪断干扰源。
      g.entities.enemies.length = 0;
    }
  };
  const items = await import('/src/data/items.ts');
  const p = g.player;
  const R = { checks: [] };
  const ck = (name, ok, note = '') => R.checks.push({ name, ok, note });
  const trace = [];
  R.trace = trace;
  const snap = (tag) => trace.push(`${tag} sel=${p.inv.selected} held=${p.inv.heldItem()?.id ?? -1} kites=${kites().length} useTime=${p.useTime} anim=${p.itemAnimTicks} dead=${kites().every((k) => k.dead)}`);
  // 供弹：风筝 4367（shoot 766）热键 0
  const key = items.VANILLA_ITEM_KEY_BY_ID[4367];
  const id = items.ITEM_BY_KEY[key] ?? items.ITEM_BY_KEY[`vi_4367_`];
  p.inv.slots[0] = { id, stack: 1 };
  p.inv.selected = 0;
  await step(10);
  const kites = () => g.entities.projectiles.filter((e) => e.constructor.name === 'KiteProj' && !e.dead);
  // 钉住玩家/鼠标朝右上
  // 地表钉位：x=400 列向下找首个实心格,玩家脚踩其上（原 y=200 格深处=敌怪咬死伪影）
  {
    const st = g.world.store;
    let sy = 40;
    for (; sy < st.h - 10 && !st.isSolid(400, sy); sy++) {}
    p.x = 400 * 16; p.y = (sy - 3) * 16; p.vx = 0; p.vy = 0;
  }
  const aim = (x, y) => { const [wx, wy] = g.camera.screenToWorld(x, y); g.input.mouseX = x; g.input.mouseY = y; };
  // —— 第一次使用：单帧 mouseDown 边沿 + fixedUpdate 消费
  aim(900, 300);
  g.input.mouseDown = true; g.input.mouseHeld = true;
  await step(6);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  await step(30);
  const first = kites().length;
  ck('(a) 首用出膛 1 只', first === 1, `kites=${first}`);
  snap('after-a');
  // —— 在场时再次左键（模拟用户连点）：清 useTime/itemTime 后重新给边沿
  const k0 = kites()[0];
  const posBefore = { x: k0?.x, y: k0?.y };
  for (let rep = 0; rep < 3; rep++) {
    p.useTime = 0; p.itemTime = 0;
    g.input.mouseDown = true;
    await step(6);
    g.input.mouseDown = false;
    await step(10);
  }
  const after = kites().length;
  snap('after-b');
  ck('(b) 在场连点 3 次仍 1 只（不重放出膛）', after === 1, `kites=${after}`);
  // —— 零副作用面：原 KiteProj 位置未被第二只顶替（同只是首用那只）
  const sameOne = kites()[0] === k0;
  ck('(c) 在场仍是首用实例', sameOne, `same=${sameOne}`);
  // —— 放线仍在场可用：mouseHeld 电平 → ai0 增长（letOut）
  const a0Before = k0.ai0;
  p.useTime = 0; p.itemTime = 0;
  g.input.mouseHeld = true; g.input.mouseDown = false;
  await step(30);
  g.input.mouseHeld = false;
  ck('(d) 按住左键放线 ai0 增长', k0.ai0 > a0Before, `ai0 ${a0Before} -> ${k0.ai0}`);
  // —— 换弹型（异型风筝 4379/771）：原版面=手持切换 → 旧弹 Kill 门（heldShoot≠type）
  //   先亡 → 新弹放行合法（【任意 aiStyle160 在场拒】门的同拍窗口=换拍前,
  //   原版 Players→Projectiles 序同相;端到端不可达,谓词由单测钉住）。此处验:
  //   旧 766 亡 + 771 出膛 1 只 + 全场仍单只
  const key2 = items.VANILLA_ITEM_KEY_BY_ID[4379];
  const id2 = items.ITEM_BY_KEY[key2] ?? items.ITEM_BY_KEY[`vi_4379_`];
  p.inv.slots[1] = { id: id2, stack: 1 };
  p.inv.selected = 1;
  await step(5);
  p.useTime = 0; p.itemTime = 0;
  g.input.mouseDown = true;
  await step(6);
  g.input.mouseDown = false;
  await step(10);
  const ks = kites();
  ck('(e) 换型：旧 766 亡（heldShoot Kill 门）+ 771 出膛且全场单只', ks.length === 1 && ks[0]?.projId === 771, `kites=${ks.map((k) => k.projId).join(',')}`);
  // —— 收线消亡后再用放行：右键 channel 收到最短
  p.inv.selected = 0;
  await step(5);
  g.input.rightDown = true; g.input.mouseHeld = false; g.input.mouseDown = false;
  await step(70);
  g.input.rightDown = false;
  const afterReel = kites().length;
  snap('after-f');
  ck('(f) 右键收线到最短 → 消亡', afterReel === 0, `kites=${afterReel}`);
  await step(5);
  p.useTime = 0; p.itemTime = 0;
  g.input.mouseDown = true; g.input.mouseHeld = true;
  await step(6);
  g.input.mouseDown = false; g.input.mouseHeld = false;
  await step(20);
  ck('(g) 消亡后再次使用放行（1 只）', kites().length === 1, `kites=${kites().length}`);
  void posBefore;
  return R;
});
console.log(JSON.stringify(out, null, 1));
await browser.close();
