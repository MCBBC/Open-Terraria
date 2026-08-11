// 天空杂块 E2E 验证：页面内驱动真实 worker 预览管线
// （WorldGenClient.generate preview:true → 逐帧 GenWorldPreview.setPreviewFrame 上屏），
// 采样预览离屏 canvas 顶部天空区（tile y<60 对应行），断言整段生成期恒为天空色。
// 与 createWorldFlow 的显示路径同链路，仅不经 DOM 交互触发。
import puppeteer from 'puppeteer-core';
const b = await puppeteer.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: 'new', args: ['--no-sandbox'] });
const p = await b.newPage();
p.on('pageerror', e => console.log('ERR:', String(e).slice(0, 300)));
await p.goto('http://localhost:5199/', { waitUntil: 'domcontentloaded', timeout: 60000 });
await p.waitForFunction(() => window.__swFlow, { timeout: 60000 });

const out = await p.evaluate(async () => {
  const { WorldGenClient } = await import('/src/workers/WorldGenClient.ts');
  const { GenWorldPreview } = await import('/src/vui/states/GenWorldPreview.ts');
  const client = new WorldGenClient();
  if (!(await client.probe())) return { error: 'worker unavailable' };

  let preview = null;
  const frames = [];
  // 每帧：真实上屏（GenWorldPreview 位图路径）+ 顶部天空区采样
  const analyze = (f) => {
    if (!preview) preview = GenWorldPreview.fromFirstFrame(f.rgba, f.width, f.height);
    else preview.setPreviewFrame(f.rgba, f.width, f.height);
    const off = preview.off;
    const ctx = off.getContext('2d');
    // 位图降采样 fx=ceil(4200/640)=7 → tile y<60 = 预览前 9 行
    const rows = Math.max(1, Math.ceil(60 * off.height / 1200));
    const img = ctx.getImageData(0, 0, off.width, rows);
    let bad = 0;
    const colors = new Set();
    for (let i = 0; i < img.data.length; i += 4) {
      const c = (img.data[i] << 16) | (img.data[i + 1] << 8) | img.data[i + 2];
      colors.add(c);
      if (c !== 0x7eb6e8) bad++;
    }
    frames.push({ w: off.width, h: off.height, rows, bad, colors: [...colors].slice(0, 6) });
  };

  await client.generate(
    { width: 4200, height: 1200, seedText: 'sky-e2e-1', preview: true },
    { onPreview: analyze, timeoutMs: 240000 },
  );
  const badFrames = frames.filter(f => f.bad > 0);
  return {
    totalFrames: frames.length,
    firstFrame: frames[0] ?? null,
    lastFrame: frames[frames.length - 1] ?? null,
    badFrames: badFrames.slice(0, 6),
  };
});
console.log(JSON.stringify(out, null, 1));
await b.close();
process.exit(!out.error && out.totalFrames > 0 && out.badFrames.length === 0 ? 0 : 1);
