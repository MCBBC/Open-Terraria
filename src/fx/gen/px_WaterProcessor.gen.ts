/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=259, 实指令=56,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_WaterProcessor(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#4 op:0x01 */
let tmp4_0 = (-C[4]);
R[0] = tmp4_0;
/* inst#5 op:0x01 */
let tmp5_1 = C[22];
R[1] = tmp5_1;
/* inst#6 op:0x02 */
let tmp6_0 = R[0] + T[0];
let tmp6_1 = R[1] + T[1];
R[0] = tmp6_0;
R[1] = tmp6_1;
/* inst#7 op:0x02 */
let tmp7_0 = T[0] + C[4];
R[4] = tmp7_0;
/* inst#8 op:0x01 */
let tmp8_1 = T[1];
R[5] = tmp8_1;
/* inst#9 op:0x01 */
let tmp9_0 = C[22];
R[8] = tmp9_0;
/* inst#10 op:0x01 */
let tmp10_1 = (-C[0]);
R[9] = tmp10_1;
/* inst#11 op:0x02 */
let tmp11_0 = R[8] + T[0];
let tmp11_1 = R[9] + T[1];
R[8] = tmp11_0;
R[9] = tmp11_1;
/* inst#12 op:0x01 */
let tmp12_0 = T[0];
R[12] = tmp12_0;
/* inst#13 op:0x02 */
let tmp13_1 = T[1] + C[0];
R[13] = tmp13_1;
/* inst#14 op:0x42 */
SAM[0]!(R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#15 op:0x42 */
SAM[0]!(R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#16 op:0x42 */
SAM[0]!(R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#17 op:0x42 */
SAM[0]!(R[12], R[13], sm2Scr);
R[12] = sm2Scr[0];
R[13] = sm2Scr[1];
R[14] = sm2Scr[2];
R[15] = sm2Scr[3];
/* inst#18 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[16] = sm2Scr[0];
R[17] = sm2Scr[1];
R[18] = sm2Scr[2];
R[19] = sm2Scr[3];
/* inst#19 op:0x04 */
let tmp19_3 = R[0] * C[12] + C[13];
R[19] = tmp19_3;
/* inst#20 op:0x04 */
let tmp20_3 = R[4] * C[12] + R[19];
R[19] = tmp20_3;
/* inst#21 op:0x04 */
let tmp21_0 = R[8] * C[12] + C[13];
R[0] = tmp21_0;
/* inst#22 op:0x02 */
let tmp22_3 = R[19] + R[0];
R[19] = tmp22_3;
/* inst#23 op:0x04 */
let tmp23_0 = R[12] * C[12] + C[13];
R[0] = tmp23_0;
/* inst#24 op:0x02 */
let tmp24_3 = R[19] + R[0];
R[19] = tmp24_3;
/* inst#25 op:0x02 */
let tmp25_3 = R[19] + C[13];
R[19] = tmp25_3;
/* inst#26 op:0x04 */
let tmp26_0 = R[16] * C[12] + C[13];
R[0] = tmp26_0;
/* inst#27 op:0x04 */
let tmp27_1 = R[19] * C[9] + (-R[0]);
R[1] = tmp27_1;
/* inst#28 op:0x02 */
let tmp28_2 = (-R[18]) + (-C[13]);
R[2] = tmp28_2;
/* inst#29 op:0x04 */
let tmp29_3 = R[17] * C[14] + C[15];
R[3] = tmp29_3;
/* inst#30 op:0x05 */
let tmp30_1 = R[1] * R[2];
R[1] = tmp30_1;
/* inst#31 op:0x02 */
let tmp31_1 = R[1] + R[1];
R[1] = tmp31_1;
/* inst#32 op:0x58 */
let tmp32_0 = (-R[3]) >= 0 ? C[20] : C[21];
R[4] = tmp32_0;
/* inst#33 op:0x58 */
let tmp33_1 = R[3] >= 0 ? C[22] : C[23];
R[5] = tmp33_1;
/* inst#34 op:0x05 */
let tmp34_3 = R[3] * R[3];
R[3] = tmp34_3;
/* inst#35 op:0x02 */
let tmp35_0 = R[4] + R[5];
R[4] = tmp35_0;
/* inst#36 op:0x04 */
let tmp36_1 = R[3] * R[4] + R[1];
R[1] = tmp36_1;
/* inst#37 op:0x02 */
let tmp37_1 = R[0] + R[1];
R[1] = tmp37_1;
/* inst#38 op:0x05 */
let tmp38_3 = R[2] * C[8];
R[3] = tmp38_3;
/* inst#39 op:0x02 */
let tmp39_2 = (-R[2]) + (-C[13]);
R[2] = tmp39_2;
/* inst#40 op:0x04 */
let tmp40_2 = R[2] * (-C[10]) + C[11];
R[2] = tmp40_2;
/* inst#41 op:0x0e */
let tmp41_3 = 2 ** R[3];
R[3] = tmp41_3;
/* inst#42 op:0x04 */
let tmp42_0 = R[1] * R[3] + (-R[0]);
R[0] = tmp42_0;
/* inst#43 op:0x05 */
let tmp43_1 = R[1] * R[3];
R[1] = tmp43_1;
/* inst#44 op:0x04 */
let tmp44_1 = R[1] * C[17] + C[17];
R[1] = tmp44_1;
/* inst#45 op:0x04 */
let tmp45_1 = R[1] * C[18] + C[17];
R[1] = tmp45_1;
/* inst#46 op:0x05 */
let tmp46_0 = R[2] * R[0];
R[0] = tmp46_0;
/* inst#47 op:0x58 */
let tmp47_2 = (-R[0]) >= 0 ? C[20] : C[21];
R[2] = tmp47_2;
/* inst#48 op:0x58 */
let tmp48_3 = R[0] >= 0 ? C[22] : C[23];
R[3] = tmp48_3;
/* inst#49 op:0x23 */
let tmp49_0 = Math.abs(R[0]);
R[0] = tmp49_0;
/* inst#50 op:0x07 */
let tmp50_0 = 1 / Math.sqrt(R[0]);
R[0] = tmp50_0;
/* inst#51 op:0x06 */
let tmp51_0 = 1 / R[0];
R[0] = tmp51_0;
/* inst#52 op:0x02 */
let tmp52_2 = R[2] + R[3];
R[2] = tmp52_2;
/* inst#53 op:0x05 */
let tmp53_0 = R[0] * R[2];
R[0] = tmp53_0;
/* inst#54 op:0x04 */
let tmp54_1 = R[0] * C[16] + C[17];
R[5] = tmp54_1;
/* inst#55 op:0x13 */
let tmp55_0 = R[1] - Math.floor(R[1]);
R[0] = tmp55_0;
/* inst#56 op:0x02 */
let tmp56_0 = R[1] + (-R[0]);
R[0] = tmp56_0;
/* inst#57 op:0x05 */
let tmp57_0 = R[0] * C[19];
R[4] = tmp57_0;
/* inst#58 op:0x01 */
let tmp58_2 = (-C[22]);
let tmp58_3 = (-C[23]);
R[6] = tmp58_2;
R[7] = tmp58_3;
/* inst#59 op:0x01 */
let tmp59_0 = R[4];
let tmp59_1 = R[5];
let tmp59_2 = R[6];
let tmp59_3 = R[7];
O[0] = tmp59_0;
O[1] = tmp59_1;
O[2] = tmp59_2;
O[3] = tmp59_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

