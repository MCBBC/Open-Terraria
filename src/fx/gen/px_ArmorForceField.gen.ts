/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=210, 实指令=41,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorForceField(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#5 op:0x01 */
let tmp5_0 = T[0];
R[0] = tmp5_0;
/* inst#6 op:0x02 */
let tmp6_1 = T[1] + C[4];
R[1] = tmp6_1;
/* inst#7 op:0x01 */
let tmp7_0 = T[0];
R[4] = tmp7_0;
/* inst#8 op:0x02 */
let tmp8_1 = T[1] + C[0];
R[5] = tmp8_1;
/* inst#9 op:0x42 */
SAM[0]!(R[0], R[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#10 op:0x42 */
SAM[0]!(R[4], R[5], sm2Scr);
R[4] = sm2Scr[0];
R[5] = sm2Scr[1];
R[6] = sm2Scr[2];
R[7] = sm2Scr[3];
/* inst#11 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[8] = sm2Scr[0];
R[9] = sm2Scr[1];
R[10] = sm2Scr[2];
R[11] = sm2Scr[3];
/* inst#12 op:0x01 */
let tmp12_0 = C[20];
let tmp12_1 = C[21];
R[0] = tmp12_0;
R[1] = tmp12_1;
/* inst#13 op:0x04 */
let tmp13_0 = T[0] * R[0] + (-C[16]);
let tmp13_1 = T[1] * R[1] + (-C[17]);
R[0] = tmp13_0;
R[1] = tmp13_1;
/* inst#14 op:0x02 */
let tmp14_2 = R[1] + (-C[8]);
R[2] = tmp14_2;
/* inst#15 op:0x04 */
let tmp15_2 = R[2] * C[24] + C[25];
R[2] = tmp15_2;
/* inst#16 op:0x13 */
let tmp16_2 = R[2] - Math.floor(R[2]);
R[2] = tmp16_2;
/* inst#17 op:0x04 */
let tmp17_2 = R[2] * C[26] + C[27];
R[2] = tmp17_2;
/* inst#18 op:0x25 */
R[13] = Math.sin(R[2]);
/* inst#19 op:0x05 */
let tmp19_2 = R[3] * R[13];
R[2] = tmp19_2;
/* inst#20 op:0x02 */
let tmp20_1 = R[1] + C[8];
R[1] = tmp20_1;
/* inst#21 op:0x04 */
let tmp21_0 = R[0] * C[24] + C[25];
R[0] = tmp21_0;
/* inst#22 op:0x13 */
let tmp22_0 = R[0] - Math.floor(R[0]);
R[0] = tmp22_0;
/* inst#23 op:0x04 */
let tmp23_0 = R[0] * C[26] + C[27];
R[0] = tmp23_0;
/* inst#24 op:0x25 */
R[13] = Math.sin(R[0]);
/* inst#25 op:0x04 */
let tmp25_0 = R[1] * C[24] + C[25];
R[0] = tmp25_0;
/* inst#26 op:0x13 */
let tmp26_0 = R[0] - Math.floor(R[0]);
R[0] = tmp26_0;
/* inst#27 op:0x04 */
let tmp27_0 = R[0] * C[26] + C[27];
R[0] = tmp27_0;
/* inst#28 op:0x25 */
R[17] = Math.sin(R[0]);
/* inst#29 op:0x04 */
let tmp29_0 = R[13] * R[17] + R[2];
R[0] = tmp29_0;
/* inst#30 op:0x0a */
let tmp30_3 = Math.min(R[0], C[28]);
R[15] = tmp30_3;
/* inst#31 op:0x05 */
let tmp31_0 = R[15] * C[12];
let tmp31_1 = R[15] * C[13];
let tmp31_2 = R[15] * C[14];
R[12] = tmp31_0;
R[13] = tmp31_1;
R[14] = tmp31_2;
/* inst#32 op:0x05 */
let tmp32_0 = R[12] * C[30];
let tmp32_1 = R[13] * C[30];
let tmp32_2 = R[14] * C[30];
let tmp32_3 = R[15] * C[30];
R[0] = tmp32_0;
R[1] = tmp32_1;
R[2] = tmp32_2;
R[3] = tmp32_3;
/* inst#33 op:0x0a */
let tmp33_0 = Math.min(R[0], C[28]);
let tmp33_1 = Math.min(R[1], C[28]);
let tmp33_2 = Math.min(R[2], C[28]);
let tmp33_3 = Math.min(R[3], C[28]);
R[12] = tmp33_0;
R[13] = tmp33_1;
R[14] = tmp33_2;
R[15] = tmp33_3;
/* inst#34 op:0x02 */
let tmp34_0 = R[9] + R[8];
R[0] = tmp34_0;
/* inst#35 op:0x02 */
let tmp35_0 = R[10] + R[0];
R[0] = tmp35_0;
/* inst#36 op:0x04 */
let tmp36_1 = R[0] * (-C[31]) + R[7];
R[1] = tmp36_1;
/* inst#37 op:0x05 */
let tmp37_0 = R[0] * C[29];
R[0] = tmp37_0;
/* inst#38 op:0x05 */
let tmp38_0 = R[0] * C[12];
let tmp38_1 = R[0] * C[13];
let tmp38_2 = R[0] * C[14];
R[4] = tmp38_0;
R[5] = tmp38_1;
R[6] = tmp38_2;
/* inst#39 op:0x05 */
let tmp39_0 = R[12] * R[1];
let tmp39_1 = R[13] * R[1];
let tmp39_2 = R[14] * R[1];
let tmp39_3 = R[15] * R[1];
R[12] = tmp39_0;
R[13] = tmp39_1;
R[14] = tmp39_2;
R[15] = tmp39_3;
/* inst#40 op:0x58 */
let tmp40_0 = R[1] >= 0 ? R[12] : C[32];
let tmp40_1 = R[1] >= 0 ? R[13] : C[32];
let tmp40_2 = R[1] >= 0 ? R[14] : C[32];
let tmp40_3 = R[1] >= 0 ? R[15] : C[32];
R[0] = sat(tmp40_0);
R[1] = sat(tmp40_1);
R[2] = sat(tmp40_2);
R[3] = sat(tmp40_3);
/* inst#41 op:0x01 */
let tmp41_3 = C[28];
R[7] = tmp41_3;
/* inst#42 op:0x05 */
let tmp42_0 = R[11] * R[4];
let tmp42_1 = R[11] * R[5];
let tmp42_2 = R[11] * R[6];
let tmp42_3 = R[11] * R[7];
R[4] = tmp42_0;
R[5] = tmp42_1;
R[6] = tmp42_2;
R[7] = tmp42_3;
/* inst#43 op:0x05 */
let tmp43_0 = R[4] * V[0];
let tmp43_1 = R[5] * V[1];
let tmp43_2 = R[6] * V[2];
let tmp43_3 = R[7] * V[3];
R[4] = tmp43_0;
R[5] = tmp43_1;
R[6] = tmp43_2;
R[7] = tmp43_3;
/* inst#44 op:0x04 */
let tmp44_0 = R[0] * C[25] + R[4];
let tmp44_1 = R[1] * C[25] + R[5];
let tmp44_2 = R[2] * C[25] + R[6];
let tmp44_3 = R[3] * C[25] + R[7];
R[0] = tmp44_0;
R[1] = tmp44_1;
R[2] = tmp44_2;
R[3] = tmp44_3;
/* inst#45 op:0x01 */
let tmp45_0 = R[0];
let tmp45_1 = R[1];
let tmp45_2 = R[2];
let tmp45_3 = R[3];
O[0] = tmp45_0;
O[1] = tmp45_1;
O[2] = tmp45_2;
O[3] = tmp45_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

