import { PixelRatio } from "react-native";

const TARGET_DENSITY = 2.55;
const DENSITY_NORMALIZATION = TARGET_DENSITY / PixelRatio.get();

export const n = (size: number): number => size * DENSITY_NORMALIZATION;
export const getDensityNormalization = (): number => DENSITY_NORMALIZATION;
