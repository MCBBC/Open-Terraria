// 资产分片 CDN 发布(2026-10-13,方案A:npm 分片多包 + npmmirror/jsDelivr 双源)。
// 链路:读 <dist>/assets-zip/manifest.json → 逐分片发 npm 包(版本=0.0.0-<hash8>
// 内容寻址幂等,重跑零副作用)→ 触发 npmmirror sync → 逐 URL 验活(zipBytes 对账)
// → 产出 <dist>/assets-zip/cdn.json(每片候选 URL 序列,只列验活通过的)。
//
// ★cdn.json 是客户端切源开关:AssetCache 拉到它才走 CDN 候选(末位恒同源兜底);
//   生产构建/部署天然无此文件=纯同源(2026-10-13 用户令:生产先不动)。
//   ★若把生产也切源:对本 dist 重跑本脚本后部署 main;若要把已带 cdn.json 的
//   dist 部署回同源形态,先删 dist/assets-zip/cdn.json 再部署(脚本收尾有提醒)。
// ★包粒度=每分片一包(tarball 8-21MB):jsDelivr 实测 tarball 硬帽 150MB
//  (408MB 包 403 "Package size exceeded the configured limit of 150 MB"),
//  单包 281MB 方案不可行;分片包同步/缓存粒度也最优(npmmirror 逐包 sync)。
// ★jsDelivr/npm 双限额(2026-10-13 实测):单文件 50MB、tarball 150MB——分片
//  20MiB 硬帽(pack-assets)下两者天然满足。
//
// 纯函数导出 + CLI 薄壳(先例 scripts/pack-assets.mjs);测试 tests/asset-cdn-fallback.test.ts。
// 用法:node scripts/publish-assets-cdn.mjs [--dist dist-release] [--scope @sandboxworld]
//        [--dry-run] [--skip-publish] [--timeout 300] [--concurrency 4]
import { spawn } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const NPM_MIRROR_BASE = 'https://registry.npmmirror.com';
const JSDELIVR_BASE = 'https://cdn.jsdelivr.net/npm';
const SYNC_BASE = 'https://registry-direct.npmmirror.com';

/** 分片文件名 → 包名(索引直映射;'p13-xxx.zip' → '@scope/assets-p13') */
export function pkgName(scope, file) {
  const m = /^p(\d+)-[0-9a-f]{8}\.zip$/.exec(file);
  if (!m) throw new Error(`分片文件名形状不符: ${file}`);
  return `${scope}/assets-p${m[1]}`;
}

/** 分片文件名 → npm 版本(内容寻址;同名=同字节,幂等重跑) */
export function npmVersion(file) {
  const m = /^p\d+-([0-9a-f]{8})\.zip$/.exec(file);
  if (!m) throw new Error(`分片文件名形状不符: ${file}`);
  return `0.0.0-${m[1]}`;
}

export function npmmirrorFileUrl(pkg, ver, file) {
  return `${NPM_MIRROR_BASE}/${pkg}/${ver}/files/${file}`;
}
export function jsDelivrFileUrl(pkg, ver, file) {
  return `${JSDELIVR_BASE}/${pkg}@${ver}/${file}`;
}

/** npmmirror tarball URL(国内快车道;unpkg files API 有白名单,registry tarball 无)。
 *  ★scoped 包 tarball basename 剥 scope:@scope/name@ver → name-ver.tgz(npm 规则) */
export function npmmirrorTarballUrl(pkg, ver) {
  const base = pkg.includes('/') ? pkg.split('/')[1] : pkg;
  return `${NPM_MIRROR_BASE}/${pkg}/-/${base}-${ver}.tgz`;
}

/** manifest → 发布计划(纯函数;顺序=manifest.parts,确定性) */
export function derivePlan(manifest, scope) {
  if (!manifest || !Array.isArray(manifest.parts) || manifest.parts.length === 0) {
    throw new Error('manifest.parts 为空/形状不符');
  }
  return manifest.parts.map((p) => {
    const pkg = pkgName(scope, p.file);
    const ver = npmVersion(p.file);
    return {
      file: p.file,
      zipBytes: p.zipBytes,
      pkg,
      ver,
      npmmirrorUrl: npmmirrorFileUrl(pkg, ver, p.file),
      npmmirrorTgzUrl: npmmirrorTarballUrl(pkg, ver),
      jsDelivrUrl: jsDelivrFileUrl(pkg, ver, p.file),
    };
  });
}

// ---- CLI ----
const args = process.argv.slice(2);
const flag = (k, dflt) => {
  const i = args.indexOf(`--${k}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const has = (k) => args.includes(`--${k}`);
const DIST = resolve(import.meta.dirname, '..', flag('dist', 'dist-release'));
const SCOPE = flag('scope', '@sandboxworld');
const DRY = has('dry-run');
const SKIP_PUBLISH = has('skip-publish');
const VERIFY_TIMEOUT_MS = Number(flag('timeout', '300')) * 1000;
const CONCURRENCY = Math.max(1, Number(flag('concurrency', '4')));
const ZIP_DIR = join(DIST, 'assets-zip');
const CDN_JSON_PATH = join(ZIP_DIR, 'cdn.json');

const log = (s) => console.log(`[cdn] ${s}`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function run(cmd, cmdArgs, opts = {}) {
  return new Promise((res) => {
    const p = spawn(cmd, cmdArgs, { stdio: ['ignore', 'pipe', 'pipe'], ...opts });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('close', (code) => res({ code, out: out.trim(), err: err.trim() }));
    p.on('error', (e) => res({ code: -1, out: '', err: String(e) }));
  });
}

async function npmPublished(pkg, ver) {
  const r = await run('npm', ['view', `${pkg}@${ver}`, 'version', '--json']);
  return r.code === 0 && r.out.includes(ver);
}

/** 发布一个分片包(临时目录内 package.json + zip;幂等:已存在即跳过) */
async function publishPart(part, dry) {
  if (await npmPublished(part.pkg, part.ver)) return 'exists';
  if (dry) return 'dry-run';
  const tmp = mkdtempSync(join(tmpdir(), 'swcdn-'));
  try {
    const zipDst = join(tmp, part.file);
    copyFileSync(join(ZIP_DIR, part.file), zipDst);
    writeFileSync(join(tmp, 'package.json'), JSON.stringify({
      name: part.pkg,
      version: part.ver,
      description: `SandboxWorld asset shard ${part.file} (content-addressed, immutable)`,
      files: [part.file],
      license: 'UNLICENSED',
      publishConfig: { access: 'public' },
    }, null, 2));
    const pubArgs = ['publish', '--access', 'public'];
    // 2FA 账号:--otp 或 NPM_CONFIG_OTP 环境变量均可(npm 原生识别后者)
    const otp = flag('otp', process.env.NPM_CONFIG_OTP ?? '');
    if (otp) pubArgs.push('--otp', otp);
    const r = await run('npm', pubArgs, { cwd: tmp });
    if (r.code !== 0) {
      if (/previously published|E409|version exists/i.test(r.err + r.out)) return 'exists';
      // ★取 stderr 尾段:npm 的真实错误(E403/EOTP 等)在末尾,notice 噪声在头部
      throw new Error(`npm publish 失败(${part.pkg}@${part.ver}): ${(r.err || r.out).slice(-400)}`);
    }
    return 'published';
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** URL 验活:Range GET 取首字节 → 返回实测总字节数(content-range),不符/失败 = null。
 *  ★tgz 候选的期望字节未知(dist.size 字段不可靠)——以实测为准回填 cdn.json,
 *  客户端长度校验即用此值;zip 候选须与 zipBytes 逐位相等 */
async function measureUrl(url, expectBytes) {
  try {
    const res = await fetch(url, { headers: { Range: 'bytes=0-0' }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const cr = res.headers.get('content-range');   // "bytes 0-0/<total>"
    const total = cr ? Number(cr.split('/')[1]) : Number(res.headers.get('content-length'));
    if (!Number.isFinite(total) || total <= 0) return null;
    if (expectBytes != null && total !== expectBytes) return null;
    return total;
  } catch {
    return null;
  }
}

/** 触发 npmmirror 同步(cnpmcore API:PUT /-/package/<enc>/syncs + body{name};
 *  非致命:失败只影响就绪速度,验活循环兜底;cnpmcore 对未知包的 GET 元数据
 *  也会按需回源,双保险) */
async function triggerSync(pkg) {
  try {
    await fetch(`${SYNC_BASE}/-/package/${encodeURIComponent(pkg)}/syncs`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: pkg, sync_upstream: true }),
      signal: AbortSignal.timeout(10000),
    });
  } catch { /* 同步接口偶发不可用;验活轮询是最终裁决 */ }
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  const lane = async () => {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx], idx);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return out;
}

async function main() {
  const t0 = Date.now();
  const manifest = JSON.parse(readFileSync(join(ZIP_DIR, 'manifest.json'), 'utf8'));
  const plan = derivePlan(manifest, SCOPE);
  log(`dist=${DIST} 分片=${plan.length} 总字节=${(plan.reduce((a, p) => a + p.zipBytes, 0) / 1048576).toFixed(1)}MB scope=${SCOPE}`);
  // 部署工件一致性:zip 存在且体积对账(fail-loud,防半成品 dist 进管线)
  for (const p of plan) {
    const f = join(ZIP_DIR, p.file);
    if (!existsSync(f)) throw new Error(`分片缺失: ${f}`);
    const actual = statSync(f).size;
    if (actual !== p.zipBytes) throw new Error(`体积不符: ${p.file} manifest=${p.zipBytes} 实际=${actual}`);
  }

  if (!DRY && !SKIP_PUBLISH) {
    const who = await run('npm', ['whoami']);
    if (who.code !== 0) {
      console.error('[cdn] npm 未登录。请先 `! npm login --auth-type=web`(或 --skip-publish 只验活不发)。');
      process.exit(1);
    }
    log(`npm 账号: ${who.out}`);
  }

  // 1) 发布(并发受控;npm publish 对同账号串行安全,这里只做轻并发)
  const pubStates = await mapLimit(plan, DRY || SKIP_PUBLISH ? CONCURRENCY : 2, async (p) => {
    try {
      const st = await publishPart(p, DRY);
      if (st === 'published') log(`发布 ${p.pkg}@${p.ver} (${(p.zipBytes / 1048576).toFixed(1)}MB)`);
      return st;
    } catch (e) {
      log(`发布失败 ${p.file}: ${e.message}`);
      return 'failed';
    }
  });
  if (pubStates.includes('failed') && !DRY && !SKIP_PUBLISH) process.exit(1);

  // 2) 触发 npmmirror 同步(仅新发布的/全部——PUT 幂等,开销小)
  if (!DRY) await mapLimit(plan, 4, async (p) => { await triggerSync(p.pkg); });

  // 3) 验活轮询:npmmirror tarball(国内)与 jsDelivr zip(全球)就绪即入 cdn.json;
  //    files API 受 unpkg 白名单限制(新 scope 拒),不作候选
  const st = new Map(plan.map((p) => [p.file, { tgz: null, jsdelivr: false }]));
  const deadline = Date.now() + VERIFY_TIMEOUT_MS;
  const verifyOnce = async () => {
    await mapLimit(plan, 6, async (p) => {
      const s = st.get(p.file);
      if (!s.tgz) s.tgz = await measureUrl(p.npmmirrorTgzUrl, null);   // tgz 字节实测回填
      if (!s.jsdelivr) s.jsdelivr = (await measureUrl(p.jsDelivrUrl, p.zipBytes)) != null;
    });
  };
  log(`验活开始(超时 ${VERIFY_TIMEOUT_MS / 1000}s)…`);
  await verifyOnce();
  while (Date.now() < deadline && st.size > 0 && [...st.values()].some((s) => !s.tgz || !s.jsdelivr)) {
    await sleep(15000);
    await verifyOnce();
  }

  // 4) 产出 cdn.json(只写 dist 工件;仅列验活通过的,空 = 客户端回同源)
  //    ★候选优先级由客户端定:tgzUrls(国内)→ urls(jsDelivr)→ 同源
  const parts = {};
  let mmOk = 0, jdOk = 0, none = 0;
  for (const p of plan) {
    const s = st.get(p.file);
    const tgzUrls = s?.tgz ? [{ url: p.npmmirrorTgzUrl, bytes: s.tgz }] : [];
    const urls = s?.jsdelivr ? [p.jsDelivrUrl] : [];
    if (tgzUrls.length) mmOk++;
    if (urls.length) jdOk++;
    if (!tgzUrls.length && !urls.length) none++;
    parts[p.file] = { pkg: p.pkg, version: p.ver, urls, ...(tgzUrls.length ? { tgzUrls } : {}) };
  }
  const cdn = { v: 1, generatedAt: new Date().toISOString(), scope: SCOPE, parts };
  if (DRY) {
    log('--dry-run:不写 cdn.json');
  } else {
    writeFileSync(CDN_JSON_PATH, JSON.stringify(cdn, null, 2));
    log(`cdn.json → ${CDN_JSON_PATH}(${Object.keys(parts).length}片)`);
  }
  log(`验活结果: npmmirror ${mmOk}/${plan.length}  jsDelivr ${jdOk}/${plan.length}  双皆无 ${none}`);
  if (none > 0) {
    log(`⚠ ${none} 片无可用 CDN 源(客户端自动回同源,不影响功能)`);
    if (jdOk === plan.length && mmOk < plan.length) {
      log(`⚠ npmmirror 未就绪 = sync 排队中(实测几分钟~几十分钟):可先部署(jsDelivr 顶上),`);
      log(`  过 10-30 分钟后重跑本脚本 --skip-publish 补入 tgzUrls,再部署一次(纯 cdn.json 差量,秒级)`);
    }
  }
  log(`用时 ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  log(`★提醒: cdn.json 已进 ${DIST} —— 部署 preview 即生效切源;若要生产保持同源,` +
    `部署 main 前删除 ${CDN_JSON_PATH}(见 game/docs/asset-cdn-rollout.md)`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => { console.error('[cdn] FAILED:', e.message); process.exit(1); });
}
