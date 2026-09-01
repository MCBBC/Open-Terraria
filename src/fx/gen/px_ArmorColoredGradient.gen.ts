/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=156, 实指令=32,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorColoredGradient(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x01 */
let tmp3_3 = C[28];
R[7] = tmp3_3;
/* inst#4 op:0x04 */
let tmp4_0 = T[0] * R[7] + (-C[24]);
R[4] = tmp4_0;
/* inst#5 op:0x05 */
let tmp5_0 = R[4] * C[0];
R[4] = sat(tmp5_0);
/* inst#6 op:0x04 */
let tmp6_1 = R[4] * C[32] + C[33];
R[5] = tmp6_1;
/* inst#7 op:0x05 */
let tmp7_0 = R[4] * R[4];
R[4] = tmp7_0;
/* inst#8 op:0x05 */
let tmp8_0 = R[5] * R[4];
R[4] = tmp8_0;
/* inst#9 op:0x04 */
let tmp9_0 = R[4] * C[34] + C[35];
R[4] = tmp9_0;
/* inst#10 op:0x01 */
let tmp10_0 = C[4];
let tmp10_1 = C[5];
let tmp10_2 = C[6];
R[8] = tmp10_0;
R[9] = tmp10_1;
R[10] = tmp10_2;
/* inst#11 op:0x04 */
let tmp11_0 = R[4] * R[8] + C[16];
let tmp11_1 = R[4] * R[9] + C[17];
let tmp11_2 = R[4] * R[10] + C[18];
R[4] = tmp11_0;
R[5] = tmp11_1;
R[6] = tmp11_2;
/* inst#12 op:0x02 */
let tmp12_0 = (-R[4]) + C[38];
let tmp12_1 = (-R[5]) + C[38];
let tmp12_2 = (-R[6]) + C[38];
R[8] = tmp12_0;
R[9] = tmp12_1;
R[10] = tmp12_2;
/* inst#13 op:0x0b */
let tmp13_3 = Math.max(R[1], R[2]);
R[7] = tmp13_3;
/* inst#14 op:0x0b */
let tmp14_3 = Math.max(R[0], R[7]);
R[11] = tmp14_3;
/* inst#15 op:0x0a */
let tmp15_3 = Math.min(R[2], R[1]);
R[7] = tmp15_3;
/* inst#16 op:0x0a */
let tmp16_3 = Math.min(R[7], R[0]);
R[15] = tmp16_3;
/* inst#17 op:0x02 */
let tmp17_3 = R[11] + R[15];
R[7] = tmp17_3;
/* inst#18 op:0x02 */
let tmp18_3 = R[11] + (-R[15]);
R[11] = tmp18_3;
/* inst#19 op:0x05 */
let tmp19_3 = R[11] * C[20];
R[11] = tmp19_3;
/* inst#20 op:0x01 */
let tmp20_0 = C[8];
R[0] = tmp20_0;
/* inst#21 op:0x04 */
let tmp21_3 = R[11] * R[0] + C[12];
R[11] = tmp21_3;
/* inst#22 op:0x04 */
let tmp22_0 = R[7] * (-C[36]) + C[37];
R[0] = tmp22_0;
/* inst#23 op:0x04 */
let tmp23_0 = R[0] * (-R[8]) + C[38];
let tmp23_1 = R[0] * (-R[9]) + C[38];
let tmp23_2 = R[0] * (-R[10]) + C[38];
R[0] = tmp23_0;
R[1] = tmp23_1;
R[2] = tmp23_2;
/* inst#24 op:0x05 */
let tmp24_0 = R[4] * R[7];
let tmp24_1 = R[5] * R[7];
let tmp24_2 = R[6] * R[7];
R[4] = tmp24_0;
R[5] = tmp24_1;
R[6] = tmp24_2;
/* inst#25 op:0x04 */
let tmp25_0 = R[7] * (-C[36]) + C[36];
R[8] = tmp25_0;
/* inst#26 op:0x58 */
let tmp26_0 = R[8] >= 0 ? R[4] : R[0];
let tmp26_1 = R[8] >= 0 ? R[5] : R[1];
let tmp26_2 = R[8] >= 0 ? R[6] : R[2];
R[0] = tmp26_0;
R[1] = tmp26_1;
R[2] = tmp26_2;
/* inst#27 op:0x04 */
let tmp27_0 = R[7] * (-C[36]) + R[0];
let tmp27_1 = R[7] * (-C[36]) + R[1];
let tmp27_2 = R[7] * (-C[36]) + R[2];
R[0] = tmp27_0;
R[1] = tmp27_1;
R[2] = tmp27_2;
/* inst#28 op:0x05 */
let tmp28_0 = R[7] * C[36];
R[4] = tmp28_0;
/* inst#29 op:0x04 */
let tmp29_0 = R[11] * R[0] + R[4];
let tmp29_1 = R[11] * R[1] + R[4];
let tmp29_2 = R[11] * R[2] + R[4];
R[4] = tmp29_0;
R[5] = tmp29_1;
R[6] = tmp29_2;
/* inst#30 op:0x01 */
let tmp30_3 = C[38];
R[7] = tmp30_3;
/* inst#31 op:0x05 */
let tmp31_0 = R[3] * R[4];
let tmp31_1 = R[3] * R[5];
let tmp31_2 = R[3] * R[6];
let tmp31_3 = R[3] * R[7];
R[0] = tmp31_0;
R[1] = tmp31_1;
R[2] = tmp31_2;
R[3] = tmp31_3;
/* inst#32 op:0x05 */
let tmp32_0 = R[0] * V[0];
let tmp32_1 = R[1] * V[1];
let tmp32_2 = R[2] * V[2];
let tmp32_3 = R[3] * V[3];
R[0] = tmp32_0;
R[1] = tmp32_1;
R[2] = tmp32_2;
R[3] = tmp32_3;
/* inst#33 op:0x01 */
let tmp33_0 = R[0];
let tmp33_1 = R[1];
let tmp33_2 = R[2];
let tmp33_3 = R[3];
O[0] = tmp33_0;
O[1] = tmp33_1;
O[2] = tmp33_2;
O[3] = tmp33_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

