/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=153, 实指令=27,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorLivingFlame(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#6 op:0x01 */
let tmp6_3 = C[16];
R[7] = tmp6_3;
/* inst#7 op:0x04 */
let tmp7_0 = T[0] * R[7] + (-C[12]);
R[4] = tmp7_0;
/* inst#8 op:0x05 */
let tmp8_0 = R[4] * C[20];
R[4] = sat(tmp8_0);
/* inst#9 op:0x04 */
let tmp9_1 = R[4] * C[25] + C[26];
R[5] = tmp9_1;
/* inst#10 op:0x05 */
let tmp10_0 = R[4] * R[4];
R[4] = tmp10_0;
/* inst#11 op:0x05 */
let tmp11_0 = R[5] * R[4];
R[4] = tmp11_0;
/* inst#12 op:0x02 */
let tmp12_1 = R[1] + R[0];
R[5] = tmp12_1;
/* inst#13 op:0x02 */
let tmp13_1 = R[2] + R[5];
R[5] = tmp13_1;
/* inst#14 op:0x04 */
let tmp14_0 = R[5] * C[27] + R[4];
R[4] = tmp14_0;
/* inst#15 op:0x05 */
let tmp15_1 = R[5] * C[24];
R[5] = tmp15_1;
/* inst#16 op:0x02 */
let tmp16_0 = R[4] + C[8];
R[4] = tmp16_0;
/* inst#17 op:0x23 */
let tmp17_2 = Math.abs(R[4]);
R[6] = tmp17_2;
/* inst#18 op:0x13 */
let tmp18_2 = R[6] - Math.floor(R[6]);
R[6] = tmp18_2;
/* inst#19 op:0x58 */
let tmp19_0 = R[4] >= 0 ? R[6] : (-R[6]);
R[4] = tmp19_0;
/* inst#20 op:0x04 */
let tmp20_0 = R[4] * C[28] + C[29];
R[4] = tmp20_0;
/* inst#21 op:0x13 */
let tmp21_0 = R[4] - Math.floor(R[4]);
R[4] = tmp21_0;
/* inst#22 op:0x04 */
let tmp22_0 = R[4] * C[30] + C[31];
R[4] = tmp22_0;
/* inst#23 op:0x25 */
R[8] = Math.cos(R[4]);
/* inst#24 op:0x04 */
let tmp24_0 = R[8] * (-C[29]) + C[29];
R[4] = tmp24_0;
/* inst#25 op:0x04 */
let tmp25_0 = V[0] * C[32] + C[33];
let tmp25_1 = V[1] * C[32] + C[33];
let tmp25_2 = V[2] * C[32] + C[33];
R[8] = tmp25_0;
R[9] = tmp25_1;
R[10] = tmp25_2;
/* inst#26 op:0x01 */
let tmp26_0 = C[0];
let tmp26_1 = C[1];
let tmp26_2 = C[2];
R[12] = tmp26_0;
R[13] = tmp26_1;
R[14] = tmp26_2;
/* inst#27 op:0x04 */
let tmp27_0 = C[4] * R[8] + (-R[12]);
let tmp27_1 = C[5] * R[9] + (-R[13]);
let tmp27_2 = C[6] * R[10] + (-R[14]);
R[8] = tmp27_0;
R[9] = tmp27_1;
R[10] = tmp27_2;
/* inst#28 op:0x04 */
let tmp28_0 = R[4] * R[8] + C[0];
let tmp28_1 = R[4] * R[9] + C[1];
let tmp28_2 = R[4] * R[10] + C[2];
R[8] = tmp28_0;
R[9] = tmp28_1;
R[10] = tmp28_2;
/* inst#29 op:0x05 */
let tmp29_0 = R[5] * R[8];
let tmp29_1 = R[5] * R[9];
let tmp29_2 = R[5] * R[10];
R[0] = tmp29_0;
R[1] = tmp29_1;
R[2] = tmp29_2;
/* inst#30 op:0x05 */
let tmp30_0 = R[0] * V[3];
let tmp30_1 = R[1] * V[3];
let tmp30_2 = R[2] * V[3];
let tmp30_3 = R[3] * V[3];
R[0] = tmp30_0;
R[1] = tmp30_1;
R[2] = tmp30_2;
R[3] = tmp30_3;
/* inst#31 op:0x01 */
let tmp31_0 = R[0];
let tmp31_1 = R[1];
let tmp31_2 = R[2];
let tmp31_3 = R[3];
O[0] = tmp31_0;
O[1] = tmp31_1;
O[2] = tmp31_2;
O[3] = tmp31_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

