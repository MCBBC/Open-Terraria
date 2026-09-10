// SW-FX6 探针(2026-09-10 补债批:BJ16 §4 ①②③⑥ 绘制面实机自证):
//   ① 641 月门 A 支专绘(中心锚+Extra_50 叠环+加算主绘) → >0
//   ② 691 陷阱塔 Bottom 锚专绘 → >0
//   ③ 308/377 半宽切片专绘 → >0
//   ⑥ 831/970 hide=true → 实体【存活在渲染循环】内 drawImage ==0(隐形计数器)
//   附:全程 pageerror 必须为空(新专绘块在真渲染器/真 atlas 下零异常)
// 注1:各型逐轮隔离生成——原版 UpdateMaxTurrets(Game.ts:8529-8533)会把同场第 2+ 哨兵
//   杀掉(同轮多哨兵互相驱逐=探针伪影,非绘制路径问题)。
// 注2:623 走真实星尘套装(armor[0..2])满足 Game.ts:8538 guardianOn 生成条件;实测世界
//   载入后段存在库存 armor 被清的时序窗 → 10ms 续写 + 60 盾牌池双保险(仅恢复生成
//   条件,不触碰绘制路径)。623 轮置于首位(页面态最干净)。
// 运行:SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs scripts/_sw-fx6-probe.mjs
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 }, protocolTimeout: 600000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(process.env.SW_ORIGIN ?? 'http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2500));
await page.waitForSelector('select', { timeout: 120000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world && window.__swGame.player, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1500));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

// 原型钩(一次):进入被包裹实体 draw 期间按 tag 计 drawImage 实调
await page.evaluate(() => {
  window.__fx6Tag = null;
  window.__fx6Counts = {};
  const proto = CanvasRenderingContext2D.prototype;
  if (!proto.__fx6Hooked) {
    const orig = proto.drawImage;
    proto.drawImage = function (...a) {
      if (window.__fx6Tag != null) window.__fx6Counts[window.__fx6Tag] = (window.__fx6Counts[window.__fx6Tag] ?? 0) + 1;
      return orig.apply(this, a);
    };
    proto.__fx6Hooked = true;
  }
});

// 单轮:生成一个实体 → 包裹 draw → 跑帧 → 返回 {count, alive, found}
async function round(vid, opts = '') {
  return page.evaluate(async ({ vid, opts }) => {
    const g = window.__swGame;
    const st = g.world.store;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const px0 = Math.floor(g.player.cx / 16);
    const gy = Math.floor(g.world.groundLevel) - 24;
    // 平坦竞技场(一次性,幂等)
    for (let dx = -80; dx <= 80; dx++) for (let dy = -30; dy <= 2; dy++) {
      st.setTile(px0 + dx, gy + dy, 0);
      st.liquid[st.idx(px0 + dx, gy + dy)] = 0;
    }
    for (let dx = -80; dx <= 80; dx++) st.setTile(px0 + dx, gy + 3, 2);
    g.player.x = px0 * 16; g.player.y = (gy - 2) * 16;
    g.camera.x = g.player.cx; g.camera.y = g.player.cy;

    const { MinionProj } = await import('/src/entities/MinionProj.ts').catch(() => import('/src/entities/MinionProj'));
    let m, found = false;
    {
      const bx = vid === 308 ? 80 : vid === 377 ? 66 : 16;
      m = new MinionProj(px0 * 16, gy * 16 - bx, vid, 10, 2, ![831, 970].includes(vid), 0, ![831, 970].includes(vid), () => g.player);
      g.entities.add(m, 'projectiles');
      found = true;
    }
    const origDraw = m.draw.bind(m);
    m.draw = function (r) {
      window.__fx6Tag = vid;
      try { return origDraw(r); } finally { window.__fx6Tag = null; }
    };
    for (let i = 0; i < 120; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
    await new Promise((r) => setTimeout(r, 800));
    const res = { count: window.__fx6Counts[vid] ?? 0, alive: !m.dead, found };
    m.dead = true;
    // 等实体被清场
    for (let i = 0; i < 30; i++) { g.fixedUpdate(1 / 60); await sleep(0); }
    return res;
  }, { vid, opts });
}

for (const [vid, label, expectZero] of [
  [641, '① 641 月门 A 支专绘(drawImage 实调 >0)', false],
  [691, '② 691 陷阱塔 Bottom 锚专绘(drawImage 实调 >0)', false],
  [308, '③ 308 冰霜九头蛇 半宽切片(drawImage 实调 >0)', false],
  [377, '③ 377 蜘蛛皇后 半宽切片(drawImage 实调 >0)', false],
  [831, '⑥ 831 虎宝石 存活且零绘制(hide=true)', true],
  [970, '⑥ 970 阿比盖尔计数 存活且零绘制(hide=true)', true],
]) {
  const r = await round(vid);
  const ok = expectZero ? (r.count === 0 && r.alive) : (r.count > 0 && r.alive);
  check(label, ok, `count=${r.count} alive=${r.alive} found=${r.found ?? '?'}`);
}

check('pageerror 全程为空(专绘块真机零异常)', errors.length === 0, errors.slice(0, 3).join(' | '));

console.log(`RESULT: ${pass} pass / ${fail} fail`);
await browser.close();
process.exit(fail === 0 ? 0 : 1);
