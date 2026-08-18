import puppeteer from 'puppeteer-core';
const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5199';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', defaultViewport: { width: 800, height: 600 } });
const p = await b.newPage();
p.on('pageerror', e => console.log('[pageerr]', String(e).slice(0, 200)));
await p.goto(`${ORIGIN}/?rlog=0`, { waitUntil: 'domcontentloaded', timeout: 60000 });
await new Promise(r => setTimeout(r, 4000));
const r = await p.evaluate(async () => {
  const mod = await import('/src/render/GLSpriteLayer.ts');
  const layer = new mod.GLSpriteLayer();
  if (layer.unavailable) return { err: 'GL 不可用' };
  // 红色测试图
  const c = document.createElement('canvas');
  c.width = 32; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#ff0000'; x.fillRect(0, 0, 32, 32);
  layer.resize(64, 64);
  layer.begin();
  const e = layer.texFromImage('test:red', c);
  layer.quad(e, 0, 0, 32, 32, 0, 0, 64, 64, { tint: [0.5, 1.0, 0.25], alpha: 1, smooth: false });
  layer.end();
  const gl = layer.canvas.getContext('webgl2');
  const px = new Uint8Array(4 * 64 * 64);
  gl.readPixels(0, 0, 64, 64, gl.RGBA, gl.UNSIGNED_BYTE, px);
  // 中点像素(y 翻转取 32,32)
  const i = (32 * 64 + 32) * 4;
  return { mid: [px[i], px[i + 1], px[i + 2], px[i + 3]], expect: [128, 255, 64, 255] };
}).catch(e => ({ err: String(e) }));
console.log(JSON.stringify(r));
await b.close(); process.exit(0);
