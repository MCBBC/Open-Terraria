/* 由 tools/gen-fx-codegen.mjs 生成——注册表,勿手编 */
import { px_Default } from './px_Default.gen';
import { px_ColorOnly } from './px_ColorOnly.gen';
import { px_ArmorMartian } from './px_ArmorMartian.gen';
import { px_ArmorColored } from './px_ArmorColored.gen';
import { px_ArmorColoredAndBlack } from './px_ArmorColoredAndBlack.gen';
import { px_ArmorColoredAndSilverTrim } from './px_ArmorColoredAndSilverTrim.gen';
import { px_ArmorSilverTrim } from './px_ArmorSilverTrim.gen';
import { px_ArmorBrightnessColored } from './px_ArmorBrightnessColored.gen';
import { px_ArmorColoredGradient } from './px_ArmorColoredGradient.gen';
import { px_ArmorColoredAndBlackGradient } from './px_ArmorColoredAndBlackGradient.gen';
import { px_ArmorBrightnessGradient } from './px_ArmorBrightnessGradient.gen';
import { px_ArmorColoredRainbow } from './px_ArmorColoredRainbow.gen';
import { px_ArmorBrightnessRainbow } from './px_ArmorBrightnessRainbow.gen';
import { px_ArmorLivingRainbow } from './px_ArmorLivingRainbow.gen';
import { px_ArmorInvert } from './px_ArmorInvert.gen';
import { px_ArmorLivingOcean } from './px_ArmorLivingOcean.gen';
import { px_ArmorLivingFlame } from './px_ArmorLivingFlame.gen';
import { px_ArmorWisp } from './px_ArmorWisp.gen';
import { px_ArmorHighContrastGlow } from './px_ArmorHighContrastGlow.gen';
import { px_ArmorPlaid } from './px_ArmorPlaid.gen';
import { px_ArmorDev } from './px_ArmorDev.gen';
import { px_ArmorReflectiveColor } from './px_ArmorReflectiveColor.gen';
import { px_ArmorBasicColor } from './px_ArmorBasicColor.gen';
import { px_ArmorHades } from './px_ArmorHades.gen';
import { px_ArmorTwilight } from './px_ArmorTwilight.gen';
import { px_ArmorAcid } from './px_ArmorAcid.gen';
import { px_ArmorMushroom } from './px_ArmorMushroom.gen';
import { px_ArmorPhase } from './px_ArmorPhase.gen';
import { px_ArmorReflective } from './px_ArmorReflective.gen';
import { px_ArmorSolar } from './px_ArmorSolar.gen';
import { px_ArmorNebula } from './px_ArmorNebula.gen';
import { px_ArmorVortex } from './px_ArmorVortex.gen';
import { px_ArmorStardust } from './px_ArmorStardust.gen';
import { px_ArmorVoid } from './px_ArmorVoid.gen';
import { px_ArmorShiftingSands } from './px_ArmorShiftingSands.gen';
import { px_ArmorShiftingPearlsands } from './px_ArmorShiftingPearlsands.gen';
import { px_ArmorFog } from './px_ArmorFog.gen';
import { px_ArmorHallowBoss } from './px_ArmorHallowBoss.gen';
import { px_ArmorMirage } from './px_ArmorMirage.gen';
import { px_ArmorMidnightRainbow } from './px_ArmorMidnightRainbow.gen';
import { px_ArmorColoredAndSilverTrimGradient } from './px_ArmorColoredAndSilverTrimGradient.gen';
import { px_ArmorPolarized } from './px_ArmorPolarized.gen';
import { px_ArmorGel } from './px_ArmorGel.gen';
import { px_ArmorFlow } from './px_ArmorFlow.gen';
import { px_ArmorForceField } from './px_ArmorForceField.gen';
import { px_ArmorLoki } from './px_ArmorLoki.gen';
import { px_ForceField } from './px_ForceField.gen';
import { px_WaterProcessor } from './px_WaterProcessor.gen';
import { px_WaterDistortionObject } from './px_WaterDistortionObject.gen';
import { px_HallowBoss } from './px_HallowBoss.gen';
import { px_TitaniumStorm } from './px_TitaniumStorm.gen';
import { px_QueenSlime } from './px_QueenSlime.gen';
import { px_MagicMissile } from './px_MagicMissile.gen';
import { px_FinalFractal } from './px_FinalFractal.gen';
import { px_FinalFractalVertex } from './px_FinalFractalVertex.gen';
import { px_MaskedFade } from './px_MaskedFade.gen';
import { px_RainbowTownSlime } from './px_RainbowTownSlime.gen';
import { px_HorizonClouds } from './px_HorizonClouds.gen';
import { px_LitNature } from './px_LitNature.gen';
import { px_Aurora } from './px_Aurora.gen';
import { px_StormLightning } from './px_StormLightning.gen';
import { px_LensFlare } from './px_LensFlare.gen';
import { px_MouseItem } from './px_MouseItem.gen';

export interface GenEntry { px: unknown /* PxGenFn */; killable: boolean }
export const GEN_MAP: Record<string, GenEntry> = {
  'Default': { px: px_Default, killable: false },
  'ColorOnly': { px: px_ColorOnly, killable: false },
  'ArmorMartian': { px: px_ArmorMartian, killable: false },
  'ArmorColored': { px: px_ArmorColored, killable: false },
  'ArmorColoredAndBlack': { px: px_ArmorColoredAndBlack, killable: false },
  'ArmorColoredAndSilverTrim': { px: px_ArmorColoredAndSilverTrim, killable: false },
  'ArmorSilverTrim': { px: px_ArmorSilverTrim, killable: false },
  'ArmorBrightnessColored': { px: px_ArmorBrightnessColored, killable: false },
  'ArmorColoredGradient': { px: px_ArmorColoredGradient, killable: false },
  'ArmorColoredAndBlackGradient': { px: px_ArmorColoredAndBlackGradient, killable: false },
  'ArmorBrightnessGradient': { px: px_ArmorBrightnessGradient, killable: false },
  'ArmorColoredRainbow': { px: px_ArmorColoredRainbow, killable: false },
  'ArmorBrightnessRainbow': { px: px_ArmorBrightnessRainbow, killable: false },
  'ArmorLivingRainbow': { px: px_ArmorLivingRainbow, killable: false },
  'ArmorInvert': { px: px_ArmorInvert, killable: false },
  'ArmorLivingOcean': { px: px_ArmorLivingOcean, killable: false },
  'ArmorLivingFlame': { px: px_ArmorLivingFlame, killable: false },
  'ArmorWisp': { px: px_ArmorWisp, killable: false },
  'ArmorHighContrastGlow': { px: px_ArmorHighContrastGlow, killable: false },
  'ArmorPlaid': { px: px_ArmorPlaid, killable: false },
  'ArmorDev': { px: px_ArmorDev, killable: false },
  'ArmorReflectiveColor': { px: px_ArmorReflectiveColor, killable: false },
  'ArmorBasicColor': { px: px_ArmorBasicColor, killable: false },
  'ArmorHades': { px: px_ArmorHades, killable: false },
  'ArmorTwilight': { px: px_ArmorTwilight, killable: false },
  'ArmorAcid': { px: px_ArmorAcid, killable: false },
  'ArmorMushroom': { px: px_ArmorMushroom, killable: false },
  'ArmorPhase': { px: px_ArmorPhase, killable: false },
  'ArmorReflective': { px: px_ArmorReflective, killable: false },
  'ArmorSolar': { px: px_ArmorSolar, killable: false },
  'ArmorNebula': { px: px_ArmorNebula, killable: false },
  'ArmorVortex': { px: px_ArmorVortex, killable: false },
  'ArmorStardust': { px: px_ArmorStardust, killable: false },
  'ArmorVoid': { px: px_ArmorVoid, killable: false },
  'ArmorShiftingSands': { px: px_ArmorShiftingSands, killable: false },
  'ArmorShiftingPearlsands': { px: px_ArmorShiftingPearlsands, killable: false },
  'ArmorFog': { px: px_ArmorFog, killable: false },
  'ArmorHallowBoss': { px: px_ArmorHallowBoss, killable: false },
  'ArmorMirage': { px: px_ArmorMirage, killable: false },
  'ArmorMidnightRainbow': { px: px_ArmorMidnightRainbow, killable: false },
  'ArmorColoredAndSilverTrimGradient': { px: px_ArmorColoredAndSilverTrimGradient, killable: false },
  'ArmorPolarized': { px: px_ArmorPolarized, killable: false },
  'ArmorGel': { px: px_ArmorGel, killable: false },
  'ArmorFlow': { px: px_ArmorFlow, killable: false },
  'ArmorForceField': { px: px_ArmorForceField, killable: false },
  'ArmorLoki': { px: px_ArmorLoki, killable: false },
  'ForceField': { px: px_ForceField, killable: false },
  'WaterProcessor': { px: px_WaterProcessor, killable: false },
  'WaterDistortionObject': { px: px_WaterDistortionObject, killable: false },
  'HallowBoss': { px: px_HallowBoss, killable: false },
  'TitaniumStorm': { px: px_TitaniumStorm, killable: false },
  'QueenSlime': { px: px_QueenSlime, killable: false },
  'MagicMissile': { px: px_MagicMissile, killable: false },
  'FinalFractal': { px: px_FinalFractal, killable: false },
  'FinalFractalVertex': { px: px_FinalFractalVertex, killable: false },
  'MaskedFade': { px: px_MaskedFade, killable: false },
  'RainbowTownSlime': { px: px_RainbowTownSlime, killable: false },
  'HorizonClouds': { px: px_HorizonClouds, killable: false },
  'LitNature': { px: px_LitNature, killable: false },
  'Aurora': { px: px_Aurora, killable: false },
  'StormLightning': { px: px_StormLightning, killable: false },
  'LensFlare': { px: px_LensFlare, killable: false },
  'MouseItem': { px: px_MouseItem, killable: false },
};

