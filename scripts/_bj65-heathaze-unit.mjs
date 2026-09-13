// BJ65 合成图案隔离探针：页内直调 GLScreenFilters.drawChain 跑真 FRAG_HEAT，
// 决定化（固定 time → 噪声场固定）验证三条语义：
//   ①顶缘：wrap(旧)=顶行采底行(蓝) vs clamp(新/原版 FNA LinearClamp)=顶行钳到红；
//   ②底缘：wrap(旧)=底行采顶行(红) vs clamp(新)=底行保持蓝；
//   ③内部：棋盘格被扭曲位移（效果活），且修前后内部逐字节全等（最小刀自证——
//     mod 只影响越界 uv，内部同一操作序列）。
// 修前跑：①②红证据（wrap 在）+③全等基线；修后跑：①②翻转+③内部与修前全等。
import { launchBrowser, openPage, bootstrap, ledger, saveJson, resolveShotPath } from '../tools/probe/lib/index.mjs';

const L = ledger();
const TIME = 123.45;                       // 固定 GlobalTimeWrappedHourly → 噪声场决定化
const INTENSITY = 2, OPACITY = 1;          // 沙漠正午档（i=2）
const W = 256, H = 256;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  const warns = [];
  page.on('console', (m) => { const t = m.text?.() ?? ''; if (m.type() === 'warning' || m.type() === 'error') warns.push(t.slice(0, 200)); });
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  await page.goto(process.env.SW_ORIGIN, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !!window.__swFlow, { timeout: 30000, polling: 200 });

  const out = await page.evaluate(async ({ TIME, INTENSITY, OPACITY, W, H }) => {
    if (!globalThis.__bj65warns) {
      globalThis.__bj65warns = [];
      const ow = console.warn.bind(console);
      console.warn = (...a) => { globalThis.__bj65warns.push(a.map(String).join(' ').slice(0, 220)); ow(...a); };
    }
    const { GLScreenFilters } = await import('/src/render/GLScreenFilters.ts');
    // 源图案：内部 16px 棋盘格(红绿) + 顶 2 行纯蓝(255,0,0→用蓝标顶?) —
    // 语义钉死：顶 2 行 = 红(255,0,0)、底 2 行 = 蓝(0,0,255)、其余棋盘格
    const src = document.createElement('canvas');
    src.width = W; src.height = H;
    const c = src.getContext('2d');
    for (let y = 0; y < H; y += 16) {
      for (let x = 0; x < W; x += 16) {
        c.fillStyle = ((x / 16 + y / 16) % 2) ? 'rgb(40,200,40)' : 'rgb(220,60,60)';
        c.fillRect(x, y, 16, 16);
      }
    }
    c.fillStyle = 'rgb(255,0,0)'; c.fillRect(0, 0, W, 2);          // 顶 2 行红
    c.fillStyle = 'rgb(0,0,255)'; c.fillRect(0, H - 2, W, 2);      // 底 2 行蓝
    const fx = new GLScreenFilters();
    if (fx.unavailable) return { ok: false, why: 'webgl-unavailable' };
    // 噪声图懒加载：drawChain 内部 ensureNoise 失败会跳过 pass → 轮询重试
    const pass = { kind: 'FilterHeatDistortion', screenRes: [W, H], screenPos: [0, 0],
      intensity: INTENSITY, opacity: OPACITY, time: TIME };
    let drew = false;
    for (let i = 0; i < 100 && !drew; i++) {
      drew = fx.drawChain(src, [pass], [1, 1, 1]);
      if (!drew) await new Promise((r) => setTimeout(r, 100));
    }
    if (!drew) {
      // 诊断：噪声图可达性 + 独立 Image 加载
      let fetchState = 'n/a', imgState = 'n/a';
      try {
        const resp = await fetch('sprites/vanilla/Misc_noise.png');
        fetchState = `${resp.status} ${resp.headers.get('content-type') ?? ''}`;
      } catch (e) { fetchState = 'throw:' + String(e).slice(0, 80); }
      try {
        imgState = await new Promise((res) => {
          const im = new Image();
          im.onload = () => res(`ok ${im.naturalWidth}x${im.naturalHeight}`);
          im.onerror = () => res('error');
          im.src = 'sprites/vanilla/Misc_noise.png';
          setTimeout(() => res('timeout'), 5000);
        });
      } catch (e) { imgState = 'throw:' + String(e).slice(0, 80); }
      return { ok: false, why: `drawChain-false(噪声未就绪?) fetch=${fetchState} img=${imgState} unavail=${fx.unavailable} dead=${!!fx.diedAt} warns=${globalThis.__bj65warns.slice(0, 3).join(' | ')}` };
    }
    const outCv = fx.canvas;
    const cop = document.createElement('canvas');
    cop.width = W; cop.height = H;
    const octx = cop.getContext('2d');
    octx.drawImage(outCv, 0, 0);          // WebGL 源(preserveDrawingBuffer=true)中转读取
    const rd = octx.getImageData(0, 0, W, H).data;
    const sctx = src.getContext('2d');
    const sd = sctx.getImageData(0, 0, W, H).data;
    const px = (d, x, y) => { const i = (y * W + x) * 4; return [d[i], d[i + 1], d[i + 2]]; };
    const rowMean = (d, y) => {
      let r = 0, g = 0, b = 0;
      for (let x = 0; x < W; x++) { const p = px(d, x, y); r += p[0]; g += p[1]; b += p[2]; }
      return [r / W, g / W, b / W].map((v) => +v.toFixed(1));
    };
    // 内部活动性：输出 vs 源 在去边内圈的差（棋盘格位移→大）
    let s = 0, n = 0;
    for (let y = 16; y < H - 16; y += 2) for (let x = 16; x < W - 16; x += 2) {
      const a = px(rd, x, y), b = px(sd, x, y);
      s += (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2])) / 3; n++;
    }
    const interiorWarp = +(s / n).toFixed(2);
    // 内部指纹（修前后全等判定用）：去边内圈逐字节 FNV
    let fnv = 0x811c9dc5;
    for (let y = 8; y < H - 8; y++) for (let x = 8; x < W - 8; x++) {
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) { fnv ^= rd[i + k]; fnv = (fnv * 0x01000193) >>> 0; }
    }
    return {
      ok: true,
      top2: { out: rowMean(rd, 0), src: rowMean(sd, 0) },
      top5: rowMean(rd, 5),
      bottom2: { out: rowMean(rd, H - 1), src: rowMean(sd, H - 1) },
      interiorWarp,
      interiorFnv: fnv >>> 0,
      glsfx: { dead: !!fx.diedAt, unavail: !!fx.unavailable },
    };
  }, { TIME, INTENSITY, OPACITY, W, H });

  console.log('[bj65-unit]', JSON.stringify(out));
  if (!out?.ok) { L.chk('合成隔离探针', false, out?.why ?? 'unknown'); process.exit(L.exitCode()); }
  if (!out?.top2 || !out?.bottom2) { L.chk('合成隔离探针输出形状', false, JSON.stringify(out).slice(0, 120)); process.exit(L.exitCode()); }
  saveJson(resolveShotPath('bj65-unit-result.json'), out);

  // ---- 判定 ----
  const [tr, tg, tb] = out.top2.out;
  const topIsWrapped = tb > 150 && tb > tr;          // 顶行=蓝(底行内容) → wrap 在
  const topIsClamped = tr > 150 && tr > tb;          // 顶行=红(顶行自身) → clamp(原版语义)
  const [br, bg, bb] = out.bottom2.out;
  const bottomIsWrapped = br > 150 && br > bb;       // 底行=红(顶行内容) → wrap 在
  const bottomIsClamped = bb > 150 && bb > br;       // 底行=蓝 → clamp
  L.chk('①顶缘=clamp(顶行保持自身内容,原版 FNA LinearClamp)', topIsClamped && !topIsWrapped,
    `top2.out=${JSON.stringify(out.top2.out)}`);
  L.chk('②底缘=clamp(底行保持自身内容)', bottomIsClamped && !bottomIsWrapped,
    `bottom2.out=${JSON.stringify(out.bottom2.out)}`);
  L.chk('③内部扭曲活(棋盘格位移,interiorWarp>10)', out.interiorWarp > 10, `warp=${out.interiorWarp}`);
  console.log('[bj65-unit] interiorFnv=', out.interiorFnv, '(修前后对比键)');

  process.exit(L.exitCode());
} finally { await browser.close().catch(() => {}); }
