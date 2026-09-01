/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=56, 实指令=10,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_HallowBoss(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#1 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#2 op:0x02 */
let tmp2_0 = R[0] + C[0];
R[0] = tmp2_0;
/* inst#3 op:0x23 */
let tmp3_1 = Math.abs(R[0]);
R[1] = tmp3_1;
/* inst#4 op:0x13 */
let tmp4_1 = R[1] - Math.floor(R[1]);
R[1] = tmp4_1;
/* inst#5 op:0x58 */
let tmp5_0 = R[0] >= 0 ? R[1] : (-R[1]);
R[0] = tmp5_0;
/* inst#6 op:0x01 */
let tmp6_1 = C[4];
R[1] = tmp6_1;
/* inst#7 op:0x42 */
SAM[1](R[0], R[1], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#8 op:0x05 */
let tmp8_0 = R[4] * V[0];
let tmp8_1 = R[5] * V[1];
let tmp8_2 = R[6] * V[2];
let tmp8_3 = R[7] * V[3];
R[4] = tmp8_0;
R[5] = tmp8_1;
R[6] = tmp8_2;
R[7] = tmp8_3;
/* inst#9 op:0x05 */
let tmp9_0 = R[3] * R[4];
let tmp9_1 = R[3] * R[5];
let tmp9_2 = R[3] * R[6];
let tmp9_3 = R[3] * R[7];
R[0] = tmp9_0;
R[1] = tmp9_1;
R[2] = tmp9_2;
R[3] = tmp9_3;
/* inst#10 op:0x01 */
let tmp10_0 = R[0];
let tmp10_1 = R[1];
let tmp10_2 = R[2];
let tmp10_3 = R[3];
O[0] = tmp10_0;
O[1] = tmp10_1;
O[2] = tmp10_2;
O[3] = tmp10_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

