// 一次性:浏览器运行时校验死亡文本全分支(vanilla 语言包已加载)
// SW_ORIGIN=http://localhost:5201 node tools/run-diag.mjs --timeout=300000 scripts/_death-text-browser.mjs
import puppeteer from 'puppeteer-core';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox'], defaultViewport: { width: 1280, height: 800 } });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto((process.env.SW_ORIGIN ?? 'http://localhost:5199') + '/?play=small', { waitUntil: 'domcontentloaded', timeout: 60000 });
let inGame = false;
for (let i = 0; i < 150 && !inGame; i++) {
  inGame = await page.evaluate(() => !!(window.__swGame && window.__swGame.renderer)).catch(() => false);
  if (!inGame) await new Promise((r) => setTimeout(r, 2000));
}
if (!inGame) { console.error('未进游戏', errors.slice(0, 3)); process.exit(1); }
const out = await page.evaluate(async () => {
  const rt = await import('/src/i18n/RandomText.ts');
  const kinds = [
    ['npc', { kind: 'npc', name: '僵尸' }],
    ['fell', { kind: 'fell' }], ['drowned', { kind: 'drowned' }], ['lava', { kind: 'lava' }],
    ['defaultWrap', { kind: 'defaultWrap' }], ['slain', { kind: 'slain' }], ['petrified', { kind: 'petrified' }],
    ['stabbed', { kind: 'stabbed' }], ['suffocated', { kind: 'suffocated' }], ['burned', { kind: 'burned' }],
    ['poisoned', { kind: 'poisoned' }], ['electrocuted', { kind: 'electrocuted' }], ['triedToEscape', { kind: 'triedToEscape' }],
    ['tongued', { kind: 'tongued' }], ['teleportFail', { kind: 'teleportFail' }], ['inferno', { kind: 'inferno' }],
    ['diedInTheDark', { kind: 'diedInTheDark' }], ['starved', { kind: 'starved' }], ['space', { kind: 'space' }],
    ['teamTank', { kind: 'teamTank' }], ['underground', { kind: 'underground' }], ['vampire', { kind: 'vampire' }],
  ];
  const res = {};
  for (const [k, cause] of kinds) {
    const t = rt.createDeathText('测试员', cause, '泰拉世界');
    res[k] = { ok: t.length > 2 && !/\{\d\}/.test(t), text: t };
  }
  return res;
});
for (const [k, v] of Object.entries(out)) console.log((v.ok ? '✓' : '✗'), k.padEnd(16), v.text);
console.log('pageerrors:', errors.slice(0, 3));
await browser.close();
