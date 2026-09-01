/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=276, 实指令=50,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorFog(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#8 op:0x42 */
SAM[0](T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#9 op:0x01 */
let tmp9_0 = C[28];
let tmp9_1 = C[29];
R[4] = tmp9_0;
R[5] = tmp9_1;
/* inst#10 op:0x04 */
let tmp10_2 = T[1] * R[5] + (-C[25]);
R[6] = tmp10_2;
/* inst#11 op:0x05 */
let tmp11_2 = R[6] * C[0];
R[6] = tmp11_2;
/* inst#12 op:0x01 */
let tmp12_3 = C[32];
R[7] = tmp12_3;
/* inst#13 op:0x04 */
let tmp13_2 = R[6] * R[7] + C[4];
R[6] = tmp13_2;
/* inst#14 op:0x04 */
let tmp14_2 = R[6] * C[33] + C[34];
R[6] = tmp14_2;
/* inst#15 op:0x13 */
let tmp15_2 = R[6] - Math.floor(R[6]);
R[6] = tmp15_2;
/* inst#16 op:0x04 */
let tmp16_2 = R[6] * C[36] + C[37];
R[6] = tmp16_2;
/* inst#17 op:0x25 */
R[9] = Math.sin(R[6]);
/* inst#18 op:0x04 */
let tmp18_2 = R[9] * C[34] + C[34];
R[6] = tmp18_2;
/* inst#19 op:0x02 */
let tmp19_3 = R[1] + R[0];
R[7] = tmp19_3;
/* inst#20 op:0x02 */
let tmp20_3 = R[2] + R[7];
R[7] = tmp20_3;
/* inst#21 op:0x05 */
let tmp21_0 = R[7] * C[35];
R[8] = tmp21_0;
/* inst#22 op:0x04 */
let tmp22_2 = R[6] * C[40] + R[8];
R[6] = tmp22_2;
/* inst#23 op:0x04 */
let tmp23_0 = T[0] * R[4] + (-C[24]);
let tmp23_1 = T[1] * R[5] + (-C[25]);
R[4] = tmp23_0;
R[5] = tmp23_1;
/* inst#24 op:0x05 */
let tmp24_0 = R[4] * C[41];
let tmp24_1 = R[5] * C[41];
R[4] = tmp24_0;
R[5] = tmp24_1;
/* inst#25 op:0x04 */
let tmp25_1 = R[5] * C[9] + R[6];
R[9] = tmp25_1;
/* inst#26 op:0x01 */
let tmp26_3 = C[8];
R[15] = tmp26_3;
/* inst#27 op:0x04 */
let tmp27_0 = R[4] * R[15] + C[12];
R[8] = tmp27_0;
/* inst#28 op:0x42 */
SAM[1](R[8], R[9], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#29 op:0x05 */
let tmp29_0 = R[7] * C[42];
R[4] = tmp29_0;
/* inst#30 op:0x04 */
let tmp30_1 = R[7] * C[38] + C[39];
R[5] = tmp30_1;
/* inst#31 op:0x05 */
let tmp31_1 = R[5] * C[22];
let tmp31_2 = R[5] * C[21];
let tmp31_3 = R[5] * C[20];
R[5] = tmp31_1;
R[6] = tmp31_2;
R[7] = tmp31_3;
/* inst#32 op:0x05 */
let tmp32_1 = R[5] * V[2];
let tmp32_2 = R[6] * V[1];
let tmp32_3 = R[7] * V[0];
R[5] = tmp32_1;
R[6] = tmp32_2;
R[7] = tmp32_3;
/* inst#33 op:0x04 */
let tmp33_0 = R[8] * C[43] + R[4];
R[4] = tmp33_0;
/* inst#34 op:0x02 */
let tmp34_0 = R[4] + C[44];
R[8] = tmp34_0;
/* inst#35 op:0x02 */
let tmp35_0 = R[4] + C[48];
R[4] = tmp35_0;
/* inst#36 op:0x05 */
let tmp36_0 = R[4] * C[49];
R[4] = sat(tmp36_0);
/* inst#37 op:0x05 */
let tmp37_0 = R[8] * C[45];
R[8] = sat(tmp37_0);
/* inst#38 op:0x04 */
let tmp38_1 = R[8] * C[46] + C[47];
R[9] = tmp38_1;
/* inst#39 op:0x05 */
let tmp39_0 = R[8] * R[8];
R[8] = tmp39_0;
/* inst#40 op:0x05 */
let tmp40_0 = R[9] * R[8];
R[8] = tmp40_0;
/* inst#41 op:0x05 */
let tmp41_1 = V[2] * C[50];
let tmp41_2 = V[1] * C[50];
let tmp41_3 = V[0] * C[50];
R[9] = tmp41_1;
R[10] = tmp41_2;
R[11] = tmp41_3;
/* inst#42 op:0x04 */
let tmp42_1 = V[3] * C[51] + R[9];
let tmp42_2 = V[3] * C[51] + R[10];
let tmp42_3 = V[3] * C[51] + R[11];
R[9] = tmp42_1;
R[10] = tmp42_2;
R[11] = tmp42_3;
/* inst#43 op:0x04 */
let tmp43_1 = C[18] * R[9] + (-R[5]);
let tmp43_2 = C[17] * R[10] + (-R[6]);
let tmp43_3 = C[16] * R[11] + (-R[7]);
R[9] = tmp43_1;
R[10] = tmp43_2;
R[11] = tmp43_3;
/* inst#44 op:0x04 */
let tmp44_1 = R[8] * R[9] + R[5];
let tmp44_2 = R[8] * R[10] + R[6];
let tmp44_3 = R[8] * R[11] + R[7];
R[5] = tmp44_1;
R[6] = tmp44_2;
R[7] = tmp44_3;
/* inst#45 op:0x05 */
let tmp45_0 = V[0] * C[34];
let tmp45_1 = V[1] * C[34];
let tmp45_2 = V[2] * C[34];
R[8] = tmp45_0;
R[9] = tmp45_1;
R[10] = tmp45_2;
/* inst#46 op:0x04 */
let tmp46_0 = V[3] * C[34] + R[8];
let tmp46_1 = V[3] * C[34] + R[9];
let tmp46_2 = V[3] * C[34] + R[10];
R[8] = tmp46_0;
R[9] = tmp46_1;
R[10] = tmp46_2;
/* inst#47 op:0x05 */
let tmp47_0 = R[0] * R[8];
let tmp47_1 = R[1] * R[9];
let tmp47_2 = R[2] * R[10];
R[12] = tmp47_0;
R[13] = tmp47_1;
R[14] = tmp47_2;
/* inst#48 op:0x05 */
let tmp48_0 = R[12] * (-C[44]);
let tmp48_1 = R[13] * (-C[44]);
let tmp48_2 = R[14] * (-C[44]);
R[12] = tmp48_0;
R[13] = tmp48_1;
R[14] = tmp48_2;
/* inst#49 op:0x04 */
let tmp49_1 = R[5] * C[52] + R[14];
let tmp49_2 = R[6] * C[52] + R[13];
let tmp49_3 = R[7] * C[52] + R[12];
R[5] = tmp49_1;
R[6] = tmp49_2;
R[7] = tmp49_3;
/* inst#50 op:0x04 */
let tmp50_0 = R[0] * R[8] + (-R[7]);
let tmp50_1 = R[1] * R[9] + (-R[6]);
let tmp50_2 = R[2] * R[10] + (-R[5]);
R[0] = tmp50_0;
R[1] = tmp50_1;
R[2] = tmp50_2;
/* inst#51 op:0x04 */
let tmp51_0 = R[4] * C[46] + C[47];
R[8] = tmp51_0;
/* inst#52 op:0x05 */
let tmp52_0 = R[4] * R[4];
R[4] = tmp52_0;
/* inst#53 op:0x05 */
let tmp53_0 = R[8] * R[4];
R[4] = tmp53_0;
/* inst#54 op:0x04 */
let tmp54_0 = R[4] * R[0] + R[7];
let tmp54_1 = R[4] * R[1] + R[6];
let tmp54_2 = R[4] * R[2] + R[5];
R[4] = tmp54_0;
R[5] = tmp54_1;
R[6] = tmp54_2;
/* inst#55 op:0x01 */
let tmp55_3 = V[3];
R[7] = tmp55_3;
/* inst#56 op:0x05 */
let tmp56_0 = R[3] * R[4];
let tmp56_1 = R[3] * R[5];
let tmp56_2 = R[3] * R[6];
let tmp56_3 = R[3] * R[7];
R[0] = tmp56_0;
R[1] = tmp56_1;
R[2] = tmp56_2;
R[3] = tmp56_3;
/* inst#57 op:0x01 */
let tmp57_0 = R[0];
let tmp57_1 = R[1];
let tmp57_2 = R[2];
let tmp57_3 = R[3];
O[0] = tmp57_0;
O[1] = tmp57_1;
O[2] = tmp57_2;
O[3] = tmp57_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

