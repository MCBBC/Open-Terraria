// 生成位置验证：统计所有新生成敌人的出生点相对视口的位置分布，
// 断言原版语义（FindSpawnTile L879：生成点必须落在 safeArea=玩家±(屏×0.52) 之外）
import puppeteer from 'puppeteer-core';

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 2000));
await page.waitForSelector('select', { timeout: 30000 });
await page.evaluate(() => { const _s = document.querySelector('select'); _s.selectedIndex = 0; _s.parentElement.querySelector('button').click(); });
await page.waitForFunction(() => window.__swGame && window.__swGame.world, { timeout: 300000 });
await new Promise((r) => setTimeout(r, 1200));

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? '  ' + extra : ''}`); ok ? pass++ : fail++; };

const out = await page.evaluate(async () => {
  const g = window.__swGame;
  const st = g.world.store;
  // 观测地表一段，白天白池随机走自然生成
  const px0 = Math.floor(g.player.cx / 16);
  const py0 = Math.floor(g.player.cy / 16);
  g.world.clock.timeOfDay = 0.5;
  // 记录器：包裹 entities.add 捕捉一切新生成实体的出生坐标
  const spawnLog = [];
  const origAdd = g.entities.add.bind(g.entities);
  g.entities.add = (ent, bucket) => {
    const rec = {
      bucket,
      key: ent.key ?? ent.npcKey ?? String(ent.itemId),
      vanillaId: ent.vanillaId ?? null,
      x: Math.round((ent.x ?? 0) / 16), y: Math.round((ent.y ?? 0) / 16),
    };
    // 相对玩家的格距与相对视口半宽
    const halfW = Math.ceil(g.camera.viewW / (g.camera.zoom || 1) / 2 / 16);
    const halfH = Math.ceil(g.camera.viewH / (g.camera.zoom || 1) / 2 / 16);
    const ptx = Math.floor(g.player.cx / 16), pty = Math.floor(g.player.cy / 16);
    rec.dTiles = Math.max(Math.abs(rec.x - ptx) - halfW, Math.abs(rec.y - pty) - halfH); // >0 屏外
    spawnLog.push(rec);
    return origAdd(ent, bucket);
  };
  // 让玩家静止在原地（排除相机滞后干扰），步进 90 秒游戏时间
  const keepX = g.player.x, keepY = g.player.y;
  for (let i = 0; i < 60 * 90; i++) {
    if (g.player.hp < 60) g.player.hp = g.player.maxHp;
    g.fixedUpdate(1 / 60);
  }
  void keepX; void keepY;
  const enemies = spawnLog.filter((r) => r.bucket === 'enemies' || r.bucket === 'critters');
  const onScreen = enemies.filter((r) => r.dTiles <= 0);
  const near = enemies.filter((r) => r.dTiles > 0 && r.dTiles < 6);
  return {
    total: enemies.length,
    onScreen: onScreen.length,
    nearCount: near.length,
    samples: enemies.slice(0, 12),
    onScreenSamples: onScreen.slice(0, 8),
    zoom: g.camera.zoom,
  };
});
console.log(JSON.stringify(out, null, 1));
check('有生成样本可统计', out.total > 0, `total=${out.total} zoom=${out.zoom}`);
check('无屏内生成（原版 safeArea 语义）', out.onScreen === 0, `onScreen=${out.onScreen}`);
check('贴屏生成(屏外≤5格)占比低', out.total === 0 || out.nearCount / out.total < 0.5, `near=${out.nearCount}/${out.total}`);
console.log(`\n${pass} passed, ${fail} failed`);
if (errors.length) console.log('页面异常:', errors.slice(0, 3));
await browser.close();
process.exit(fail ? 1 : 0);
