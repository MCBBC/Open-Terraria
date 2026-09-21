/* 由 tools/gen-fx-codegen.mjs 生成（PR#3,E 方案）。源=fxPixelShader.json,
 * tokens=163, 实指令=34,
 * 修改必先改生成器并重跑: node tools/gen-fx-codegen.mjs */
import { sat } from '../sm2Runtime';

/** 直线代码体；签名与 runtime 契约一致(C,R,T,V,O,SAM)。
     * 返回 null=texkill 命中；OUT 写入最终 UNORM 值。 */
export function px_ArmorHighContrastGlow(C: Float64Array, R: Float64Array, T: Float64Array, V: Float64Array, O: Float64Array, SAM: Array<((u: number, v: number, out: Float64Array) => void) | undefined>, OUT: Float64Array, sm2Scr: Float64Array): boolean | null {
  R.fill(0); O.fill(0);
/* inst#2 op:0x42 */
SAM[0]!(T[0], T[1], sm2Scr);
R[0] = sm2Scr[0];
R[1] = sm2Scr[1];
R[2] = sm2Scr[2];
R[3] = sm2Scr[3];
/* inst#3 op:0x0b */
let tmp3_3 = Math.max(R[1], R[2]);
R[7] = tmp3_3;
/* inst#4 op:0x0b */
let tmp4_3 = Math.max(R[0], R[7]);
R[11] = tmp4_3;
/* inst#5 op:0x0a */
let tmp5_0 = Math.min(R[2], R[1]);
R[4] = tmp5_0;
/* inst#6 op:0x0a */
let tmp6_0 = Math.min(R[4], R[0]);
R[8] = tmp6_0;
/* inst#7 op:0x02 */
let tmp7_0 = R[11] + R[8];
R[0] = tmp7_0;
/* inst#8 op:0x02 */
let tmp8_1 = R[11] + (-R[8]);
R[1] = tmp8_1;
/* inst#9 op:0x04 */
let tmp9_2 = R[0] * (-C[20]) + C[21];
R[2] = tmp9_2;
/* inst#10 op:0x01 */
let tmp10_2 = C[22];
R[6] = tmp10_2;
/* inst#11 op:0x04 */
let tmp11_0 = R[2] * (-C[0]) + R[6];
let tmp11_1 = R[2] * (-C[1]) + R[6];
let tmp11_2 = R[2] * (-C[2]) + R[6];
R[4] = tmp11_0;
R[5] = tmp11_1;
R[6] = tmp11_2;
/* inst#12 op:0x04 */
let tmp12_3 = R[0] * (-C[20]) + C[20];
R[7] = tmp12_3;
/* inst#13 op:0x05 */
let tmp13_0 = R[0] * C[12];
let tmp13_1 = R[0] * C[13];
let tmp13_2 = R[0] * C[14];
R[8] = tmp13_0;
R[9] = tmp13_1;
R[10] = tmp13_2;
/* inst#14 op:0x58 */
let tmp14_0 = R[7] >= 0 ? R[8] : R[4];
let tmp14_1 = R[7] >= 0 ? R[9] : R[5];
let tmp14_2 = R[7] >= 0 ? R[10] : R[6];
R[4] = tmp14_0;
R[5] = tmp14_1;
R[6] = tmp14_2;
/* inst#15 op:0x04 */
let tmp15_0 = R[0] * (-C[20]) + R[4];
let tmp15_1 = R[0] * (-C[20]) + R[5];
let tmp15_2 = R[0] * (-C[20]) + R[6];
R[4] = tmp15_0;
R[5] = tmp15_1;
R[6] = tmp15_2;
/* inst#16 op:0x05 */
let tmp16_3 = R[0] * C[20];
R[7] = tmp16_3;
/* inst#17 op:0x05 */
let tmp17_0 = R[1] * C[16];
R[0] = tmp17_0;
/* inst#18 op:0x01 */
let tmp18_0 = C[24];
R[8] = tmp18_0;
/* inst#19 op:0x04 */
let tmp19_1 = R[1] * C[16] + R[8];
R[1] = tmp19_1;
/* inst#20 op:0x02 */
let tmp20_1 = R[1] + R[1];
R[1] = tmp20_1;
/* inst#21 op:0x01 */
let tmp21_0 = C[4];
R[8] = tmp21_0;
/* inst#22 op:0x04 */
let tmp22_0 = R[0] * R[8] + C[8];
R[0] = tmp22_0;
/* inst#23 op:0x04 */
let tmp23_0 = R[0] * R[4] + R[7];
let tmp23_1 = R[0] * R[5] + R[7];
let tmp23_2 = R[0] * R[6] + R[7];
R[4] = tmp23_0;
R[5] = tmp23_1;
R[6] = tmp23_2;
/* inst#24 op:0x05 */
let tmp24_3 = V[0] * C[23];
R[7] = tmp24_3;
/* inst#25 op:0x04 */
let tmp25_0 = V[0] * (-C[23]) + C[21];
R[0] = tmp25_0;
/* inst#26 op:0x04 */
let tmp26_3 = R[1] * R[0] + R[7];
R[7] = tmp26_3;
/* inst#27 op:0x05 */
let tmp27_0 = R[4] * R[7];
let tmp27_1 = R[5] * R[7];
let tmp27_2 = R[6] * R[7];
R[4] = tmp27_0;
R[5] = tmp27_1;
R[6] = tmp27_2;
/* inst#28 op:0x01 */
let tmp28_3 = C[22];
R[7] = tmp28_3;
/* inst#29 op:0x05 */
let tmp29_0 = R[3] * R[4];
let tmp29_1 = R[3] * R[5];
let tmp29_2 = R[3] * R[6];
let tmp29_3 = R[3] * R[7];
R[0] = tmp29_0;
R[1] = tmp29_1;
R[2] = tmp29_2;
R[3] = tmp29_3;
/* inst#30 op:0x0a */
let tmp30_0 = Math.min(R[0], C[22]);
let tmp30_1 = Math.min(R[1], C[22]);
let tmp30_2 = Math.min(R[2], C[22]);
let tmp30_3 = Math.min(R[3], C[22]);
R[4] = tmp30_0;
R[5] = tmp30_1;
R[6] = tmp30_2;
R[7] = tmp30_3;
/* inst#31 op:0x0b */
let tmp31_0 = Math.max(V[0], V[3]);
let tmp31_1 = Math.max(V[1], V[3]);
let tmp31_2 = Math.max(V[2], V[3]);
R[0] = tmp31_0;
R[1] = tmp31_1;
R[2] = tmp31_2;
/* inst#32 op:0x12 */
let tmp32_0 = C[25] * R[0] + (1 - C[25]) * V[0];
let tmp32_1 = C[25] * R[1] + (1 - C[25]) * V[1];
let tmp32_2 = C[25] * R[2] + (1 - C[25]) * V[2];
R[8] = tmp32_0;
R[9] = tmp32_1;
R[10] = tmp32_2;
/* inst#33 op:0x01 */
let tmp33_3 = V[3];
R[11] = tmp33_3;
/* inst#34 op:0x05 */
let tmp34_0 = R[4] * R[8];
let tmp34_1 = R[5] * R[9];
let tmp34_2 = R[6] * R[10];
let tmp34_3 = R[7] * R[11];
R[0] = tmp34_0;
R[1] = tmp34_1;
R[2] = tmp34_2;
R[3] = tmp34_3;
/* inst#35 op:0x01 */
let tmp35_0 = R[0];
let tmp35_1 = R[1];
let tmp35_2 = R[2];
let tmp35_3 = R[3];
O[0] = tmp35_0;
O[1] = tmp35_1;
O[2] = tmp35_2;
O[3] = tmp35_3;
  O[0] = sat(O[0]); O[1] = sat(O[1]); O[2] = sat(O[2]); O[3] = sat(O[3]);
  OUT[0] = O[0]; OUT[1] = O[1]; OUT[2] = O[2]; OUT[3] = O[3];
  return false;
}

