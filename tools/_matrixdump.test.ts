// #22 收敛矩阵锚点批量采集：解析 /tmp/vserver/ 下全部 .wld 头 → matrix-anchors.tsv
// 运行：cd game && npx vitest run tools/_matrixdump.test.ts
// 头部走位与 src/wld/WldParser.ts 1:1（只取到 isCrimson 为止，跳过 tiles 重解码）。
// worldId 语义（1456 WorldGen.cs:11353）：= genRand.Next(int.MaxValue)，是生成期抽样值
// 而非种子 id；种子 int 形（translateSeed）不落盘。本测试用「genRand 原始流第 t 个样本
// 按 Next(int.MaxValue) 重放 = wld worldId」做间接校验——所有世界应命中同一位点 t。
import { it } from 'vitest';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { BinaryReaderLE } from '../src/wld/BinaryReaderLE';
import { UnifiedRandom, translateSeed } from '../src/core/rng';

const VSRV = '/tmp/vserver';
const TSV = `${VSRV}/matrix-anchors.tsv`;
// Next(maxValue) = trunc(sample * max)；sample = raw * 4.656612875245797e-10（rng.ts 同序乘法）
const SAMPLE_SCALE = 4.656612875245797e-10;
const INT_MAX = 2147483647;
const DIMS: Record<string, [number, number]> = { s: [4200, 1200], m: [6400, 1800], l: [8400, 2400] };

interface H {
  version: number; title: string; seedText: string; worldId: number;
  tilesWide: number; tilesHigh: number; moonType: number;
  spawnX: number; spawnY: number; groundLevel: number; rockLevel: number;
  dungeonX: number; dungeonY: number; isCrimson: boolean;
}

function parseHeader(buf: Uint8Array): H {
  const r = new BinaryReaderLE(buf);
  const version = r.u32();
  if (version < 210) throw new Error(`version ${version} < 210 非 1.4 世界`);
  if (version >= 140) {
    r.bytes(7);      // magic "relogic"
    r.byte();        // fileType
    r.u32();         // revision
    r.u64();         // favorites
  }
  const sectionCount = r.i16();
  const pointers: number[] = [];
  for (let i = 0; i < sectionCount; i++) pointers.push(r.i32());
  r.seek(pointers[0]);
  const title = r.string();
  let seedText = '';
  if (version >= 179) {
    seedText = version === 179 ? String(r.i32()) : r.string();
    r.u64(); // worldGenVersion
  }
  if (version >= 181) r.bytes(16); // guid
  const worldId = r.i32();
  r.i32(); r.i32(); r.i32(); r.i32(); // bounds
  const tilesHigh = r.i32();
  const tilesWide = r.i32();
  if (version >= 209) {
    r.i32(); // gameMode
    for (const g of [222, 227, 238, 239, 241, 249, 266, 267, 302]) if (version >= g) r.boolean();
  } else if (version === 208 || version >= 112) r.boolean();
  if (version >= 141) r.i64(); // creationtime
  if (version >= 284) r.i64(); // lastPlayed
  const moonType = r.u8();
  for (let i = 0; i < 3; i++) r.i32();    // treeX
  for (let i = 0; i < 4; i++) r.i32();    // treeStyle
  for (let i = 0; i < 3; i++) r.i32();    // caveBackX
  for (let i = 0; i < 4; i++) r.i32();    // caveBackStyle
  r.i32(); r.i32(); r.i32();              // ice/jungle/hell back
  const spawnX = r.i32(), spawnY = r.i32();
  const groundLevel = r.f64(), rockLevel = r.f64();
  r.f64(); r.boolean(); r.i32(); r.boolean(); r.boolean(); // time/day/moonPhase/blood/eclipse
  const dungeonX = r.i32(), dungeonY = r.i32();
  const isCrimson = r.boolean();
  return {
    version, title, seedText, worldId, tilesWide, tilesHigh, moonType,
    spawnX, spawnY, groundLevel, rockLevel, dungeonX, dungeonY, isCrimson,
  };
}

/** genRand 原始流按 Next(int.MaxValue) 重放，找 worldId 命中的样本位点（1 起） */
function findWorldIdDraw(seedInt: number, target: number, max = 600): number {
  const r = new UnifiedRandom(seedInt);
  for (let t = 1; t <= max; t++) {
    const raw = r.next();
    const candidate = Math.trunc(raw * SAMPLE_SCALE * INT_MAX);
    if (candidate === target) return t;
  }
  return -1;
}

it('matrix anchors dump', () => {
  const files = readdirSync(VSRV).filter((f) => /^[sml].+\.wld$/.test(f));
  if (!files.length) throw new Error('/tmp/vserver 无 .wld');
  // 排序：按尺寸前缀（s<m<l）再按文件名
  const ordered = files.sort((a, b) => {
    const ka = 'sml'.indexOf(a[0]) * 1e9 + a.length;
    const kb = 'sml'.indexOf(b[0]) * 1e9 + b.length;
    return ka - kb || a.localeCompare(b);
  });

  const rows: string[] = ['file\tsize\tseed\tevil(isCrimson)\tgroundLevel\trockLevel\tworldId\tmoonType\tdungeonX\tdungeonY\tspawnX\tseedId(translateSeed)\tworldIdDraw'];
  const errs: string[] = [];
  const drawPositions = new Set<number>();
  let crimson = 0, corruption = 0;
  const parsed: Array<{ f: string; h: H; k: number }> = [];

  for (const f of ordered) {
    const m = /^([sml])(.+?)(?:_e([01]))?\.wld$/.exec(f);
    if (!m) continue;
    const [, sizeKey, seedPart, evilReq] = m;
    let h: H;
    try {
      h = parseHeader(new Uint8Array(readFileSync(`${VSRV}/${f}`)));
    } catch (e) {
      errs.push(`${f}: 解析失败(${(e as Error).message})——可能正被服务器写入，批跑结束后重跑本测试`);
      continue;
    }
    const seedId = translateSeed(seedPart);
    const k = findWorldIdDraw(seedId, h.worldId);
    if (k > 0) drawPositions.add(k);
    else errs.push(`${f}: genRand 前 600 样本未命中 worldId=${h.worldId}(seedId=${seedId})`);
    h.isCrimson ? crimson++ : corruption++;
    // SW_EVIL 对照组：isCrimson 必须等于请求值；且 setup 期锚点（ground/rock/worldId/moon，
    // 均在 evil pass 之前决定）必须与同 seed 自然版一致——证明补丁未扰动 RNG 流。
    if (evilReq !== undefined) {
      const want = evilReq === '1';
      if (h.isCrimson !== want) errs.push(`${f}: SW_EVIL=${evilReq} 未生效（isCrimson=${h.isCrimson ? 1 : 0}）`);
      const base = `${sizeKey}${seedPart}.wld`;
      try {
        const b = parseHeader(new Uint8Array(readFileSync(`${VSRV}/${base}`)));
        for (const [key, va, vb] of [
          ['groundLevel', h.groundLevel, b.groundLevel], ['rockLevel', h.rockLevel, b.rockLevel],
          ['worldId', h.worldId, b.worldId], ['moonType', h.moonType, b.moonType],
        ] as const) {
          if (va !== vb) errs.push(`${f}: ${key}=${va} 与自然版 ${base}(${vb}) 不一致——补丁疑似扰动 RNG`);
        }
        if (h.dungeonX !== b.dungeonX || h.dungeonY !== b.dungeonY || h.spawnX !== b.spawnX) {
          console.log(`  注: ${f} dungeon/spawn 与自然版不同（evil pass 下游影响）：(${h.dungeonX},${h.dungeonY},${h.spawnX}) vs (${b.dungeonX},${b.dungeonY},${b.spawnX})`);
        }
      } catch { console.log(`  注: 无自然版 ${base} 可对照`); }
    }

    // 硬校验：尺寸/版本/头内 seed 文本
    const [w, hh] = DIMS[sizeKey];
    if (h.tilesWide !== w || h.tilesHigh !== hh) errs.push(`${f}: 尺寸 ${h.tilesWide}x${h.tilesHigh} ≠ 前缀期望 ${w}x${hh}`);
    if (h.version !== 319) errs.push(`${f}: version=${h.version}（预期 319）`);
    if (h.seedText !== seedPart) errs.push(`${f}: 头内 seedText="${h.seedText}" ≠ 文件名 seed="${seedPart}"`);

    parsed.push({ f, h, k });
    rows.push([
      f, sizeKey, seedPart, h.isCrimson ? 1 : 0,
      String(h.groundLevel), String(h.rockLevel), String(h.worldId), String(h.moonType),
      String(h.dungeonX), String(h.dungeonY), String(h.spawnX),
      String(seedId), String(k),
    ].join('\t'));
  }

  writeFileSync(TSV, rows.join('\n') + '\n');
  console.log(`已写入 ${TSV}（${parsed.length} 世界）`);
  console.log(rows.join('\n'));

  // oracle 交叉验证（此前会话已确认真值；oracle 生成参数=小尺寸同 seed）
  let oracleOk = 0, oracleMiss = 0;
  for (const { f, h } of parsed) {
    const seedPart = /^([sml])(.+?)(?:_e[01])?\.wld$/.exec(f)![2];
    if (!f.startsWith('s')) continue;
    let txt = '';
    try { txt = readFileSync(`${VSRV}/oracle_${seedPart}.txt`, 'utf8'); } catch { continue; }
    const t = txt.match(/terrain ok: worldSurface=(\d+) rockLayer=(\d+)/);
    const rv = txt.match(/RESETVALS worldId=(-?\d+)/);
    const mo = txt.match(/moon=(-?\d+)/);
    if (!t || !rv || !mo) { oracleMiss++; continue; }
    const bad =
      Number(t[1]) !== h.groundLevel || Number(t[2]) !== h.rockLevel ||
      Number(rv[1]) !== h.worldId || Number(mo[1]) !== h.moonType;
    if (bad) errs.push(`${f}: oracle 交叉验证失败 wld(ws=${h.groundLevel},rl=${h.rockLevel},id=${h.worldId},moon=${h.moonType}) vs oracle(${t[1]},${t[2]},${rv[1]},${mo[1]})`);
    else oracleOk++;
  }
  console.log(`oracle 交叉验证: ${oracleOk} 通过 / ${oracleMiss} 缺 oracle（仅小尺寸有 oracle）`);
  console.log(`evil 分布: crimson=${crimson} corruption=${corruption}`);
  console.log(`worldId 命中位点: ${[...drawPositions].join(',')}（应唯一）`);

  if (errs.length) {
    console.log('问题清单:\n' + errs.map((e) => '  ✗ ' + e).join('\n'));
    throw new Error(`矩阵锚点存在 ${errs.length} 处问题（TSV 已写出）`);
  }
});
