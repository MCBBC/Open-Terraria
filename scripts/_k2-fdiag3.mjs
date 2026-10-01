// ★K2 场值闸诊断③：常量表经验定谳——变参扫描（uTime×{0,1}×uSourceRect/uImageSize0
// 变体）钉死 preshader 终值公式 + 全常量表 c0..c12 转储。
// 运行:SW_ORIGIN=http://localhost:5202 node tools/run-diag.mjs scripts/_k2-fdiag3.mjs
import { launchBrowser, openPage, bootstrap } from '../tools/probe/lib/index.mjs';

const ORIGIN = process.env.SW_ORIGIN || 'http://localhost:5202';
const browser = await launchBrowser({});
const page = await openPage(browser, {});
await bootstrap(page, ORIGIN + '/');

const out = await page.evaluate(async () => {
  const smMod = await import('/src/fx/SM2Effect.ts');
  const pass = smMod.getPass('ForceField');
  const dump = (u) => {
    const c = pass.setupConstants(u);
    const m = {};
    for (let r = 0; r < 13; r++) {
      const v = [c[r * 4], c[r * 4 + 1], c[r * 4 + 2], c[r * 4 + 3]];
      m['c' + r] = v.map((x) => +x.toPrecision(7));
    }
    return m;
  };
  const base = () => {
    const u = smMod.defaultUniforms();
    u.uTime = 0; u.uColor = [1, 1, 1];
    u.uSourceRect = [0, 0, 128, 128]; u.uImageSize0 = [128, 128];
    return u;
  };
  const res = {};
  const b = base(); res.base_t0 = dump(b);
  const b1 = base(); b1.uTime = 1; res.t1 = dump(b1);
  const b2 = base(); b2.uTime = 0.2; res.t02 = dump(b2);
  const b3 = base(); b3.uSourceRect = [0, 0, 64, 96]; res.sr_64x96 = dump(b3);
  const b4 = base(); b4.uSourceRect = [16, 24, 128, 128]; res.sr_xy1624 = dump(b4);
  const b5 = base(); b5.uImageSize0 = [256, 256]; res.is0_256 = dump(b5);
  return res;
});
console.log(JSON.stringify(out, null, 1));
process.exit(0);
