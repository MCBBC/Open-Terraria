// QQQQQ ②：#73 Spreading_Grass 单格定罪——快照槽27末（=SpreadingGrass 入口，dump72 逐位同）
// 的帧态，打印目标格邻域 7×7（type/act/fx/fy/half/slope/wall）。onWorldPartial 传的是
// 活引用——必须在回调内切片快照。
// 用法：SW_QQ2=1 SW_QQ2_SEED=12345 SW_QQ2_X=1647 SW_QQ2_Y=227 npx vitest run tools/_qq2.test.ts
import { it } from 'vitest';
const RUN = process.env.SW_QQ2 === '1';
import { generateWorld } from '../src/world/gen/WorldGen';
import { TILE_DEFS } from '../src/data/tiles';

(RUN ? it : it.skip)('qq2: #73 pile config at SpreadingGrass entry', async () => {
  const SEED = process.env.SW_QQ2_SEED ?? '12345';
  const EVIL = Number(process.env.SW_QQ2_EVIL ?? '1');
  const PX = Number(process.env.SW_QQ2_X ?? '1647');
  const PY = Number(process.env.SW_QQ2_Y ?? '227');
  const SLOT = Number(process.env.SW_QQ2_SLOT ?? '27');
  const snap: {
    type: Uint16Array; flags: Uint8Array; frameX: Uint16Array; frameY: Uint16Array;
    half: Uint8Array; slope: Uint8Array; wall: Uint16Array;
  } | null = null as never;
  let S = snap;
  await generateWorld({
    width: 4200, height: 1200, seedText: SEED, evil: EVIL as -1 | 0 | 1,
    onWorldPartial: (w, i) => {
      if (i === SLOT && !S) {
        const st = w.store;
        S = {
          type: st.type.slice(), flags: st.flags.slice(), frameX: st.frameX.slice(),
          frameY: st.frameY.slice(), half: st.half.slice(), slope: st.slope.slice(),
          wall: st.wall.slice(),
        } as never;
      }
    },
  });
  if (!S) throw new Error(`slot ${SLOT} capture failed`);
  const st = S as unknown as NonNullable<typeof S>;
  const idx = (x: number, y: number) => y * 4200 + x;
  console.log(`seed=${SEED} slot=${SLOT} target=(${PX},${PY}) sheet=${TILE_DEFS[st.type[idx(PX, PY)]]?.vanilla?.sheet}`);
  for (let y = PY - 3; y <= PY + 3; y++) {
    const row: string[] = [];
    for (let x = PX - 3; x <= PX + 3; x++) {
      const i = idx(x, y);
      const sh = st.flags[i] ? (TILE_DEFS[st.type[i]]?.vanilla?.sheet ?? -1) : -1;
      row.push(`(${x},${y}) a${st.flags[i] ? 1 : 0} t${sh} fx${st.frameX[i]} fy${st.frameY[i]} h${st.half[i]} s${st.slope[i]} w${st.wall[i]}`);
    }
    console.log(row.join('  '));
  }
}, 300_000);
