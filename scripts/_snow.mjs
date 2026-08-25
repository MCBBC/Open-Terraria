import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
const B = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: 'new', userDataDir: '/Users/vinlic/.claude/jobs/8405c930/tmp/sv73',
  args: ['--no-first-run'], defaultViewport: { width: 1280, height: 800 },
});
const page = await browser.newPage();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: '/Users/vinlic/.claude/jobs/8405c930/tmp/capdl' });
await page.goto(B + '/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise((r) => setTimeout(r, 3000));
await page.waitForFunction(() => !!window.__swFlow, { timeout: 120000 });
const saveJson = fs.readFileSync('/Users/vinlic/Downloads/map-浮夸的羡慕顶峰 (8).json', 'utf8');
await page.evaluate((txt) => window.__swFlow.loadJson(txt), saveJson);
await page.waitForFunction(() => !!window.__swGame && !!window.__swGame.world, { timeout: 180000 });
await page.evaluate(() => {
  const r = () => window.__swGame.renderer;
  window.__mk = () => ({ r: r(), bundle: { cam: window.__swGame.camera, world: window.__swGame.world, chunks: r().chunks,
    lightR: new Uint8Array(0), lightG: new Uint8Array(0), lightB: new Uint8Array(0),
    lightRX: 0, lightRY: 0, lightRW: 0, lightRH: 0, player: window.__swGame.player,
    entities: [], swing: null, flicker: null, remotePlayers: [] },
    env: { mouseX: 0, mouseY: 0, mouseLeft: false, mouseRight: false,
      mapOpen: false, mapEnabled: true, viewW: 1280, viewH: 800, worldW: 4200, worldH: 1200, fm: null } });
  window.__swCaptureSettings.biomeChoiceIndex = 5;   // Snow(水色 5)
  window.__swGame.renderer.biomeBg.warmStyle(7);
});
await page.keyboard.press('F4');
await new Promise((r) => setTimeout(r, 600));
await page.evaluate(() => {
  const cm = window.__swGame.renderer.captureMode;
  cm.edgeAPinned = true; cm.edgeA = { x: 150, y: 270 };
  cm.edgeBPinned = true; cm.edgeB = { x: 220, y: 300 };
});
await new Promise((r) => setTimeout(r, 4500));
await page.evaluate(() => {
  const { r, bundle, env } = window.__mk();
  window.__swGame.renderer.captureMode.pressButton(1, r, bundle, env);
});
await new Promise((r) => setTimeout(r, 6000));
console.log('done');
await browser.close();
