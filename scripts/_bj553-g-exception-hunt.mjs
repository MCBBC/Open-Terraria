/**
 * BJ553-g:render 尾段被砍根因猎捕。
 *  v5 定谳:门恒真但 6425 行 60 帧仅 1 达 → 尾段(6402-6440)几乎不执行。
 *  假说:①emote 块抛错吞尾段 ②render 中途早退。仪表:
 *  render 包装 try/catch 记栈(帧计数确认 render 每帧达)+emoteSheet 包裹+
 *  window error/unhandledrejection 监听+尾段 canary(setTimeout 不行——用
 *  requestAnimationFrame 计帧对照 render 计数)。
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { launchBrowser, openPage, bootstrap, createGame, pump,
  godMode, clearEnemies, spawnEnemy, giveItems, Ledger,
} from '../tools/probe/lib/index.mjs';

const L = new Ledger();
const OUT = process.env.SW_PROBE_OUT ?? '/tmp/probe-out/_bj553g';
mkdirSync(OUT, { recursive: true });

const INSTALL = `
window.__bj553g = { renderCalls: 0, renderErrs: [], emoteCalls: 0, emoteErrs: [],
  winErrs: [], raf: 0, evCalls: 0, markerSheetCalls: 0 };
window.addEventListener('error', (e) => {
  if (window.__bj553g.winErrs.length < 8) window.__bj553g.winErrs.push(String(e.message ?? e).slice(0, 200));
});
window.addEventListener('unhandledrejection', (e) => {
  if (window.__bj553g.winErrs.length < 8) window.__bj553g.winErrs.push('rej:' + String(e.reason ?? e).slice(0, 180));
});
window.__bj553gInstall = async () => {
  const { Renderer } = await import('/src/render/Renderer.ts');
  const proto = Renderer.prototype;
  if (!proto.__bj553gp) {
    proto.__bj553gp = true;
    const or_ = proto.render;
    proto.render = function (...a) {
      window.__bj553g.renderCalls++;
      try {
        return or_.apply(this, a);
      } catch (e) {
        if (window.__bj553g.renderErrs.length < 6) {
          window.__bj553g.renderErrs.push(String(e?.stack ?? e).split('\\n').slice(0, 4).join(' | ').slice(0, 400));
        }
        throw e;
      }
    };
    const oe = proto.emoteSheet;
    proto.emoteSheet = function (...a) {
      window.__bj553g.emoteCalls++;
      try {
        const r = oe.apply(this, a);
        return r;
      } catch (e) {
        if (window.__bj553g.emoteErrs.length < 6) {
          window.__bj553g.emoteErrs.push(String(e?.stack ?? e).split('\\n').slice(0, 4).join(' | ').slice(0, 400));
        }
        throw e;
      }
    };
  }
  const { SpriteAtlas } = await import('/src/assets/SpriteAtlas.ts');
  if (!SpriteAtlas.prototype.__bj553gp) {
    SpriteAtlas.prototype.__bj553gp = true;
    const ov = SpriteAtlas.prototype.ensureVImage;
    SpriteAtlas.prototype.ensureVImage = function (file, ...rest) {
      if (file === 'vanilla/Extra_199.png') window.__bj553g.evCalls++;
      return ov.apply(this, [file, ...rest]);
    };
  }
  // rAF 心跳(对照 render 计数)
  const oraf = window.requestAnimationFrame.bind(window);
  window.requestAnimationFrame = (cb, ...rest) => oraf((t) => { window.__bj553g.raf++; return cb(t); }, ...rest);
  return 'ok';
};
'ok';
`;

const browser = await launchBrowser({});
try {
  const page = await openPage(browser, { errors: L.fails });
  page.__probeOrigin = process.env.SW_ORIGIN;
  const boot = await bootstrap(page, process.env.SW_ORIGIN);
  L.chk('bootstrap', boot.ok, boot.why ?? '');
  const gen = await createGame(page, { mode: 'direct', seed: '05162020', size: 'small' });
  L.chk('createGame', gen.ok, gen.why ?? '');
  await godMode(page, true);
  await clearEnemies(page);
  await pump(page, 30);
  const gi = await giveItems(page, [{ vid: 4672, slot: 0 }], { select: 0 });
  L.chk('give-whip', gi.ok, '');
  const spot = await page.evaluate(() => {
    const g = window.__swGame;
    return { x: Math.round(g.player.cx), y: Math.round(g.player.cy) };
  });
  const sp = await spawnEnemy(page, 3, spot.x + 80, spot.y);
  L.chk('spawn-zombie', sp.ok, '');
  await pump(page, 20);

  await page.evaluate(INSTALL);
  await page.evaluate(async () => { await window.__bj553gInstall(); });
  await page.evaluate(() => {
    const g = window.__swGame;
    const z = (g.entities.enemies ?? []).find((en) => en.vanillaId === 3);
    g.player.minionTargetId = z ? z.id : -1;
    window.__bj553g.renderCalls = 0; window.__bj553g.raf = 0;
    window.__bj553g.evCalls = 0; window.__bj553g.emoteCalls = 0;
  });
  await pump(page, 60);
  const st = await page.evaluate(() => ({
    ...window.__bj553g,
    renderErrs: window.__bj553g.renderErrs, emoteErrs: window.__bj553g.emoteErrs,
    winErrs: window.__bj553g.winErrs,
    tid: window.__swGame.player.minionTargetId,
  }));
  L.say(`render=${st.renderCalls} raf=${st.raf} emote=${st.emoteCalls} evCalls=${st.evCalls} tid=${st.tid}`);
  L.say(`renderErrs: ${JSON.stringify(st.renderErrs)}`);
  L.say(`emoteErrs: ${JSON.stringify(st.emoteErrs)}`);
  L.say(`winErrs: ${JSON.stringify(st.winErrs)}`);
  L.chk('render-every-frame', st.renderCalls >= 55, `render=${st.renderCalls}/60 raf=${st.raf}`);
  L.chk('no-render-throw', st.renderErrs.length === 0, `errs=${st.renderErrs.length}`);
  L.chk('marker-Heartbeat-evCalls', st.evCalls >= 55, `evCalls=${st.evCalls}/60`);

  writeFileSync(`${OUT}/bj553g-result.json`, JSON.stringify(st, null, 2));
} finally {
  await browser.close().catch(() => {});
}
process.exit(L.exitCode());
