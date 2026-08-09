// 导入参考 wld 后长时间运行,捕捉白屏根因:pageerror / RAF 死亡 / tick 冻结
import puppeteer from 'puppeteer-core';
import { readFileSync } from 'fs';

const WLD = '/Users/vinlic/Downloads/不负责任的女妖啤酒厂.wld';
const buf = readFileSync(WLD);
const b64 = buf.toString('base64');
console.log('wld bytes:', buf.length);

const browser = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => { errors.push('PAGEERROR: ' + String(e?.stack || e).slice(0, 800)); console.log('[pageerror]', String(e).slice(0, 300)); });
page.on('console', m => {
  const t = m.text();
  if (m.type() === 'error' || /error|uncaught/i.test(t)) { errors.push('CONSOLE: ' + t.slice(0, 800)); console.log('[console.error]', t.slice(0, 300)); }
});
await page.goto('http://localhost:5199', { waitUntil: 'domcontentloaded', timeout: 60000 });

const started = await page.evaluate(async (b64) => {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const parse = window.__parseWld;
  if (!parse) return { err: 'no __parseWld' };
  const { save } = parse(bytes);
  const { loadSave } = await import('/src/save/SaveFile.ts');
  const { Game } = await import('/src/core/Game.ts');
  const { world } = loadSave(JSON.stringify(save));
  const root = document.getElementById('app') || document.body;
  const g = new Game(root, {
    onWorldReady: () => {},
    onInventoryChanged: () => {},
    onToast: () => {},
  });
  window.__wldGame = g;
  await g.loadWorld(world, () => {});
  g.start();
  return { ok: true, w: world.store.w, h: world.store.h, name: save.header.name };
}, b64);
console.log('started:', JSON.stringify(started));

// 每 10s 采样 tick 推进 + 是否还能 evaluate(卡死时 evaluate 会 timeout)
for (let round = 0; round < 12; round++) {
  await new Promise(r => setTimeout(r, 10000));
  try {
    const snap = await page.evaluate(() => {
      const g = window.__wldGame;
      if (!g) return { gone: true };
      return {
        tick: g.tickCount ?? (g._tickCount ?? null),
        running: g.running,
        entities: {
          enemies: g.entities.enemies.length,
          drops: g.entities.drops.length,
          projectiles: g.entities.projectiles.length,
          npcs: g.entities.npcs.length,
          critters: g.entities.critters.length,
          props: g.entities.props?.length ?? -1,
        },
        playerHp: g.player?.hp,
        px: Math.floor((g.player?.x ?? 0) / 16),
        py: Math.floor((g.player?.y ?? 0) / 16),
      };
    }, { timeout: 8000 });
    console.log(`t=${(round + 1) * 10}s`, JSON.stringify(snap));
  } catch (e) {
    console.log(`t=${(round + 1) * 10}s EVAL-TIMEOUT(主线程阻塞)`, String(e).slice(0, 120));
    break;
  }
  if (errors.length) break;
}
console.log('errors collected:', errors.length);
for (const e of errors.slice(0, 3)) console.log('----\n' + e);
await browser.close();
