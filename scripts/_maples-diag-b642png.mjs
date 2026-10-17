// 一次性诊断:features.json 的 64×64 RGBA b64 → PNG(4 宫格拼接,2×2)
import puppeteer from 'puppeteer-core';
import { readFileSync, writeFileSync } from 'node:fs';
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const [aJson, bJson, outPng] = [process.argv[2], process.argv[3], process.argv[4]];
const A = JSON.parse(readFileSync(aJson, 'utf8'));
const B = JSON.parse(readFileSync(bJson, 'utf8'));
const key = process.argv[5] ?? 'tallgrass';   // featureB64[key] 或 playerB64[arm]
const which = process.argv[6] ?? 'feature';
const bucket = which === 'player' ? 'playerB64' : 'featureB64';
const items = [
  { label: `A:${key}`, b64: A[bucket][key] },
  { label: `B:${key}`, b64: B[bucket][key] },
];
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });
const page = await browser.newPage();
const url = await page.evaluate(async (items) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const cx = c.getContext('2d');
  cx.fillStyle = '#202020'; cx.fillRect(0, 0, 256, 128);
  for (let k = 0; k < 2; k++) {
    const bin = atob(items[k].b64);
    const u8 = new Uint8ClampedArray(bin.length);
    for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const id = new ImageData(u8, 64, 64);
    const tmp = document.createElement('canvas');
    tmp.width = 64; tmp.height = 64;
    tmp.getContext('2d').putImageData(id, 0, 0);
    cx.imageSmoothingEnabled = false;
    cx.drawImage(tmp, k * 128 + 32, 32);
    cx.fillStyle = '#fff'; cx.font = '10px monospace';
    cx.fillText(items[k].label, k * 128 + 8, 12);
    cx.fillText('4x', k * 128 + 8, 124);
  }
  return c.toDataURL('image/png');
}, items);
writeFileSync(outPng, Buffer.from(url.split(',')[1], 'base64'));
console.log('written', outPng);
await browser.close();
