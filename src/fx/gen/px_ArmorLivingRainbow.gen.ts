/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=140, 实指令=28,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorLivingRainbow(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#3 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#4 op:0x01 */
let tmp4_3 = C[12];
R[7] = tmp4_3;
/* inst#5 op:0x04 */
let tmp5_0 = T[0] * R[7] + (-C[8]);
R[4] = tmp5_0;
/* inst#6 op:0x05 */
let tmp6_0 = R[4] * C[0];
R[4] = sat(tmp6_0);
/* inst#7 op:0x04 */
let tmp7_1 = R[4] * C[21] + C[22];
R[5] = tmp7_1;
/* inst#8 op:0x05 */
let tmp8_0 = R[4] * R[4];
R[4] = tmp8_0;
/* inst#9 op:0x05 */
let tmp9_0 = R[5] * R[4];
R[4] = tmp9_0;
/* inst#10 op:0x01 */
let tmp10_3 = C[23];
R[7] = tmp10_3;
/* inst#11 op:0x04 */
let tmp11_0 = R[4] * R[7] + C[4];
R[4] = tmp11_0;
/* inst#12 op:0x02 */
let tmp12_1 = R[1] + R[0];
R[5] = tmp12_1;
/* inst#13 op:0x02 */
let tmp13_1 = R[2] + R[5];
R[5] = tmp13_1;
/* inst#14 op:0x04 */
let tmp14_0 = R[5] * C[16] + R[4];
R[4] = tmp14_0;
/* inst#15 op:0x05 */
let tmp15_1 = R[5] * C[20];
R[5] = tmp15_1;
/* inst#16 op:0x02 */
let tmp16_0 = R[4] + C[19];
let tmp16_1 = R[4] + C[18];
let tmp16_2 = R[4] + C[17];
R[8] = tmp16_0;
R[9] = tmp16_1;
R[10] = tmp16_2;
/* inst#17 op:0x23 */
let tmp17_0 = Math.abs(R[8]);
let tmp17_1 = Math.abs(R[9]);
let tmp17_2 = Math.abs(R[10]);
R[12] = tmp17_0;
R[13] = tmp17_1;
R[14] = tmp17_2;
/* inst#18 op:0x13 */
let tmp18_0 = R[12] - Math.floor(R[12]);
let tmp18_1 = R[13] - Math.floor(R[13]);
let tmp18_2 = R[14] - Math.floor(R[14]);
R[12] = tmp18_0;
R[13] = tmp18_1;
R[14] = tmp18_2;
/* inst#19 op:0x58 */
let tmp19_0 = R[8] >= 0 ? R[12] : (-R[12]);
let tmp19_1 = R[9] >= 0 ? R[13] : (-R[13]);
let tmp19_2 = R[10] >= 0 ? R[14] : (-R[14]);
R[8] = tmp19_0;
R[9] = tmp19_1;
R[10] = tmp19_2;
/* inst#20 op:0x04 */
let tmp20_0 = R[8] * C[24] + C[25];
let tmp20_1 = R[9] * C[24] + C[25];
let tmp20_2 = R[10] * C[24] + C[25];
R[8] = tmp20_0;
R[9] = tmp20_1;
R[10] = tmp20_2;
/* inst#21 op:0x23 */
let tmp21_0 = Math.abs(R[8]);
let tmp21_1 = Math.abs(R[9]);
let tmp21_2 = Math.abs(R[10]);
R[8] = tmp21_0;
R[9] = tmp21_1;
R[10] = tmp21_2;
/* inst#22 op:0x02 */
let tmp22_0 = (-R[8]) + C[26];
let tmp22_1 = (-R[9]) + C[26];
let tmp22_2 = (-R[10]) + C[26];
R[8] = tmp22_0;
R[9] = tmp22_1;
R[10] = tmp22_2;
/* inst#23 op:0x05 */
let tmp23_0 = R[5] * R[8];
let tmp23_1 = R[5] * R[9];
let tmp23_2 = R[5] * R[10];
R[4] = tmp23_0;
R[5] = tmp23_1;
R[6] = tmp23_2;
/* inst#24 op:0x05 */
let tmp24_0 = R[3] * R[4];
let tmp24_1 = R[3] * R[5];
let tmp24_2 = R[3] * R[6];
R[0] = tmp24_0;
R[1] = tmp24_1;
R[2] = tmp24_2;
/* inst#25 op:0x0a */
let tmp25_0 = Math.min(R[0], C[26]);
let tmp25_1 = Math.min(R[1], C[26]);
let tmp25_2 = Math.min(R[2], C[26]);
let tmp25_3 = Math.min(R[3], C[26]);
R[4] = tmp25_0;
R[5] = tmp25_1;
R[6] = tmp25_2;
R[7] = tmp25_3;
/* inst#26 op:0x0b */
let tmp26_0 = Math.max(V[0], V[3]);
let tmp26_1 = Math.max(V[1], V[3]);
let tmp26_2 = Math.max(V[2], V[3]);
R[0] = tmp26_0;
R[1] = tmp26_1;
R[2] = tmp26_2;
/* inst#27 op:0x12 */
let tmp27_0 = C[23] * R[0] + (1 - C[23]) * V[0];
let tmp27_1 = C[23] * R[1] + (1 - C[23]) * V[1];
let tmp27_2 = C[23] * R[2] + (1 - C[23]) * V[2];
R[8] = tmp27_0;
R[9] = tmp27_1;
R[10] = tmp27_2;
/* inst#28 op:0x01 */
let tmp28_3 = V[3];
R[11] = tmp28_3;
/* inst#29 op:0x05 */
let tmp29_0 = R[4] * R[8];
let tmp29_1 = R[5] * R[9];
let tmp29_2 = R[6] * R[10];
let tmp29_3 = R[7] * R[11];
R[0] = tmp29_0;
R[1] = tmp29_1;
R[2] = tmp29_2;
R[3] = tmp29_3;
/* inst#30 op:0x01 */
let tmp30_0 = R[0];
let tmp30_1 = R[1];
let tmp30_2 = R[2];
let tmp30_3 = R[3];
O[0] = tmp30_0;
O[1] = tmp30_1;
O[2] = tmp30_2;
O[3] = tmp30_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

