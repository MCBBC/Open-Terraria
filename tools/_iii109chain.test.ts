// IIII109 链级取证仪（末批秘种子迷你链四臂）：w.wld 快照字段 + JS 全量世界证据对拍。
// 只读;tests/golden 零写入（输出全部走 stdout / SW109_OUT 指定 /tmp 路径）。
//
// 用法（cd game）：
//   # A) x86 w.wld 快照（spawn/箱/旗标效应字段）：
//   SW109_WLD=/tmp/iii135-out/x86-pglun/w.wld npx vitest run tools/_iii109chain.test.ts
//   # B) JS 全量世界同字段（与 mile8 生成同参;SW109_JS_FLAGS 逗号分隔 SeedFlags 字段名）：
//   SW109_JS_SEED='wedonteventestforthat|20260904' SW109_JS_FLAGS=portalGunInChests \
//     SW109_JS_OUT=/tmp/iii109-out/js-pglun.json npx vitest run tools/_iii109chain.test.ts
//   # C) A+B 同发 → 直接出对拍裁决行（spawn 逐值 / portalGun 箱坐标集合 / savedStylist）
import { it } from 'vitest';
import { readFileSync, writeFileSync } from 'node:fs';
import { parseWld } from '../src/wld/WldParser';
import { generateWorld } from '../src/world/gen/WorldGen';

const WLD = process.env.SW109_WLD ?? '';
const JS_SEED = process.env.SW109_JS_SEED ?? '';
const JS_EVIL = process.env.SW109_JS_EVIL !== undefined ? Number(process.env.SW109_JS_EVIL) : 0;
const JS_FLAGS: Record<string, boolean> = {};
for (const f of (process.env.SW109_JS_FLAGS ?? '').split(',').filter(Boolean)) JS_FLAGS[f] = true;
const JS_OUT = process.env.SW109_JS_OUT ?? '';
const RUN_WLD = !!WLD;
const RUN_JS = !!JS_SEED;

const GUN = 3384;          // ItemID.PortalGun（1458 DoPortalGunInChests SetDefaults(3384)，x86 wld 面）
const GUN_JS = 4277;       // 本仓内部 id（vidItem(3384)=ITEM_BY_KEY['vi_3384_PortalGun']=4277）

interface Snap {
  spawn: [number, number]; dungeon: [number, number]; crimson: boolean | undefined; hardMode: boolean | undefined;
  chestCount: number; gunCount: number; gunChests: Array<[number, number]>;
  savedStylist: boolean; worldId: number; groundLevel: number; rockLevel: number;
}
function snapOf(s: {
  spawnX: number; spawnY: number; dungeonX: number; dungeonY: number; isCrimson: boolean;
  hardMode: boolean | undefined; chests: Array<{ x: number; y: number; items: Array<{ id: number; stack: number } | null> }>;
  flags: Record<string, boolean>; worldId: number; groundLevel: number; rockLevel: number;
}): Snap {
  const gunId = (s as { __js?: boolean }).__js ? GUN_JS : GUN;   // JS 面走内部 id
  const gunChests = s.chests.filter((c) => (c.items ?? []).some((it) => it && it.id === gunId && (it.stack ?? 0) > 0))
    .map((c) => [c.x, c.y] as [number, number]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  return {
    spawn: [s.spawnX, s.spawnY], dungeon: [s.dungeonX, s.dungeonY], crimson: s.isCrimson ?? s.crimson,
    hardMode: s.hardMode ?? s.flags?.hardMode, chestCount: s.chests.length, gunCount: gunChests.length, gunChests,
    savedStylist: !!s.flags.savedStylist, worldId: s.worldId,
    groundLevel: Math.round(s.groundLevel), rockLevel: Math.round(s.rockLevel),
  };
}

(RUN_WLD ? it : it.skip)('III109 x86 wld snapshot', { timeout: 900_000 }, async () => {
  const buf = readFileSync(WLD);
  const w = parseWld(new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength));
  const snap = snapOf(w as never);
  console.log('WLD ' + JSON.stringify(snap));
  if (JS_SEED) {
    await runJs(snap);
  }
});

async function runJs(x86?: Snap): Promise<void> {
  const world = await generateWorld({
    width: 4200, height: 1200, seedText: JS_SEED, evil: JS_EVIL as -1 | 0 | 1,
    seedFlags: Object.keys(JS_FLAGS).length > 0 ? JS_FLAGS : undefined,
  });
  const snap = snapOf({ ...(world as unknown as object), __js: true } as never);
  console.log('JS  ' + JSON.stringify(snap));
  if (JS_OUT) writeFileSync(JS_OUT, JSON.stringify(snap));
  if (x86) {
    const rows: string[] = [];
    const cmp = (k: string, a: unknown, b: unknown, eq: boolean) =>
      rows.push(`${eq ? '✓' : '✗'} ${k}: x86=${JSON.stringify(a)} js=${JSON.stringify(b)}`);
    cmp('spawn', x86.spawn, snap.spawn, x86.spawn[0] === snap.spawn[0] && x86.spawn[1] === snap.spawn[1]);
    cmp('dungeon', x86.dungeon, snap.dungeon, x86.dungeon[0] === snap.dungeon[0] && x86.dungeon[1] === snap.dungeon[1]);
    cmp('crimson', x86.crimson, snap.crimson, x86.crimson === snap.crimson);
    cmp('hardMode', x86.hardMode, snap.hardMode, x86.hardMode === snap.hardMode);
    cmp('chestCount', x86.chestCount, snap.chestCount, x86.chestCount === snap.chestCount);
    cmp('gunCount', x86.gunCount, snap.gunCount, x86.gunCount === snap.gunCount);
    cmp('gunChests', x86.gunChests, snap.gunChests, JSON.stringify(x86.gunChests) === JSON.stringify(snap.gunChests));
    cmp('savedStylist', x86.savedStylist, snap.savedStylist, x86.savedStylist === snap.savedStylist);
    const bad = rows.some((r) => r.startsWith('✗'));
    console.log((bad ? 'III109-VERDICT ✗' : 'III109-VERDICT ✓') + '  ' + JS_SEED);
    for (const r of rows) console.log('  ' + r);
  }
}

(RUN_JS ? it : it.skip)('III109 js world snapshot', { timeout: 900_000 }, async () => {
  if (WLD) return;   // A+C 分支已覆盖
  await runJs();
});
