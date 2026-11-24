/**
 * Color conversion utilities for LetterPeople library
 * Includes OKLCH to RGB conversion and vice versa for perceptually uniform colors
 */

/**
 * OKLCH color representation
 */
export interface OklchColor {
  l: number; // Lightness (0-1)
  c: number; // Chroma (0-0.4 typically)
  h: number; // Hue (0-360 degrees)
}

/**
 * Convert OKLCH to RGB
 * @param l Lightness (0-1)
 * @param c Chroma (0-0.4, typically)
 * @param h Hue (0-360 degrees)
 * @returns RGB string in format "rgb(r, g, b)"
 */
export function oklchToRgb(l: number, c: number, h: number): string {
  // Convert hue to radians
  const hRad = (h * Math.PI) / 180;

  // Convert OKLCH to OKLab
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);

  // Convert OKLab to linear RGB
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const l3 = l_ * l_ * l_;
  const m3 = m_ * m_ * m_;
  const s3 = s_ * s_ * s_;

  // Linear RGB
  let r = +4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  let g = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  let b_ = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  // Apply gamma correction (linear to sRGB)
  const gammaCorrect = (c: number): number => {
    if (c <= 0.0031308) {
      return 12.92 * c;
    } else {
      return 1.055 * Math.pow(c, 1.0 / 2.4) - 0.055;
    }
  };

  r = gammaCorrect(r);
  g = gammaCorrect(g);
  b_ = gammaCorrect(b_);

  // Clamp to 0-1 and convert to 0-255
  r = Math.max(0, Math.min(1, r)) * 255;
  g = Math.max(0, Math.min(1, g)) * 255;
  b_ = Math.max(0, Math.min(1, b_)) * 255;

  return `rgb(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b_)})`;
}

/**
 * Generate vibrant rainbow colors using OKLCH
 * All colors have the same perceptual lightness and chroma (vibrancy)
 * @param count Number of colors to generate
 * @param lightness Lightness level (0-1, recommend 0.7)
 * @param chroma Chroma/saturation (0-0.4, recommend 0.15)
 * @param startHue Starting hue in degrees (0-360)
 * @returns Array of RGB color strings
 */
export function generateVibrancyRainbow(
  count: number,
  lightness: number = 0.7,
  chroma: number = 0.15,
  startHue: number = 0,
): string[] {
  const colors: string[] = [];
  const hueStep = 360 / count;

  for (let i = 0; i < count; i++) {
    const hue = (startHue + i * hueStep) % 360;
    colors.push(oklchToRgb(lightness, chroma, hue));
  }

  return colors;
}

/**
 * Generate random vibrant color using OKLCH
 * @param lightness Lightness level (0-1, recommend 0.7)
 * @param chroma Chroma/saturation (0-0.4, recommend 0.15)
 * @returns RGB color string
 */
export function randomVibrancyColor(
  lightness: number = 0.7,
  chroma: number = 0.15,
): string {
  const hue = Math.random() * 360;
  return oklchToRgb(lightness, chroma, hue);
}

/**
 * Helper presets for common use cases
 */
export const ColorPresets = {
  // High contrast vibrant colors (good for letters)
  vibrancyHigh: {
    lightness: 0.7,
    chroma: 0.15,
  },

  // Medium vibrant colors
  vibrancyMedium: {
    lightness: 0.65,
    chroma: 0.12,
  },

  // Soft pastel colors
  pastel: {
    lightness: 0.8,
    chroma: 0.08,
  },

  // Dark vibrant colors
  darkVibrancy: {
    lightness: 0.5,
    chroma: 0.15,
  },
};

/**
 * Apply OKLCH color to letter options
 * @param l Lightness (0-1)
 * @param c Chroma (0-0.4)
 * @param h Hue (0-360)
 * @returns Color string suitable for LetterOptions
 */
export function oklch(l: number, c: number, h: number): string {
  return oklchToRgb(l, c, h);
}

// Export for convenience
export { oklch as oklchColor };

/**
 * Parse a hex color string to RGB values
 * @param hex Hex color string (with or without #, 3 or 6 digits)
 * @returns RGB values as [r, g, b] in 0-255 range, or null if invalid
 */
export function hexToRgbValues(hex: string): [number, number, number] | null {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Handle 3-digit hex
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  if (hex.length !== 6) {
    return null;
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  if (isNaN(r) || isNaN(g) || isNaN(b)) {
    return null;
  }

  return [r, g, b];
}

/**
 * Parse an rgb() or rgba() string to RGB values
 * @param rgb RGB string like "rgb(255, 128, 0)" or "rgba(255, 128, 0, 0.5)"
 * @returns RGB values as [r, g, b] in 0-255 range, or null if invalid
 */
export function parseRgbString(rgb: string): [number, number, number] | null {
  const match = rgb.match(/rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (!match) {
    return null;
  }

  return [parseInt(match[1], 10), parseInt(match[2], 10), parseInt(match[3], 10)];
}

// Common CSS named colors
const NAMED_COLORS: Record<string, string> = {
  black: '#000000',
  white: '#FFFFFF',
  red: '#FF0000',
  green: '#00FF00',
  blue: '#0000FF',
  yellow: '#FFFF00',
  cyan: '#00FFFF',
  magenta: '#FF00FF',
  gray: '#808080',
  grey: '#808080',
  silver: '#C0C0C0',
  maroon: '#800000',
  olive: '#808000',
  lime: '#00FF00',
  aqua: '#00FFFF',
  teal: '#008080',
  navy: '#000080',
  fuchsia: '#FF00FF',
  purple: '#800080',
  orange: '#FFA500',
};

/**
 * Parse any CSS color string (hex, rgb, or named) to RGB values
 * @param color Color string (hex, rgb format, or CSS named color)
 * @returns RGB values as [r, g, b] in 0-255 range, or null if invalid
 */
export function parseColor(color: string): [number, number, number] | null {
  color = color.trim().toLowerCase();

  // Check for named color
  if (NAMED_COLORS[color]) {
    return hexToRgbValues(NAMED_COLORS[color]);
  }

  if (color.startsWith('#')) {
    return hexToRgbValues(color);
  }

  if (color.startsWith('rgb')) {
    return parseRgbString(color);
  }

  // Try as hex without #
  if (/^[0-9a-fA-F]{3,6}$/.test(color)) {
    return hexToRgbValues(color);
  }

  return null;
}

/**
 * Convert RGB values to OKLCH
 * @param r Red (0-255)
 * @param g Green (0-255)
 * @param b Blue (0-255)
 * @returns OKLCH color object
 */
export function rgbToOklch(r: number, g: number, b: number): OklchColor {
  // Normalize to 0-1
  r = r / 255;
  g = g / 255;
  b = b / 255;

  // Convert sRGB to linear RGB
  const toLinear = (c: number): number => {
    if (c <= 0.04045) {
      return c / 12.92;
    }
    return Math.pow((c + 0.055) / 1.055, 2.4);
  };

  const rLin = toLinear(r);
  const gLin = toLinear(g);
  const bLin = toLinear(b);

  // Linear RGB to LMS (using OKLab matrix)
  const l_ = Math.cbrt(0.4122214708 * rLin + 0.5363325363 * gLin + 0.0514459929 * bLin);
  const m_ = Math.cbrt(0.2119034982 * rLin + 0.6806995451 * gLin + 0.1073969566 * bLin);
  const s_ = Math.cbrt(0.0883024619 * rLin + 0.2817188376 * gLin + 0.6299787005 * bLin);

  // LMS to OKLab
  const L = 0.2104542553 * l_ + 0.7936177850 * m_ - 0.0040720468 * s_;
  const a = 1.9779984951 * l_ - 2.4285922050 * m_ + 0.4505937099 * s_;
  const lab_b = 0.0259040371 * l_ + 0.7827717662 * m_ - 0.8086757660 * s_;

  // OKLab to OKLCH
  const c = Math.sqrt(a * a + lab_b * lab_b);
  let h = Math.atan2(lab_b, a) * (180 / Math.PI);
  if (h < 0) {
    h += 360;
  }

  return { l: L, c, h };
}

/**
 * Convert a CSS color string to OKLCH
 * @param color CSS color string (hex or rgb format)
 * @returns OKLCH color object, or null if parsing failed
 */
export function colorToOklch(color: string): OklchColor | null {
  const rgb = parseColor(color);
  if (!rgb) {
    return null;
  }
  return rgbToOklch(rgb[0], rgb[1], rgb[2]);
}

/**
 * Adjust the lightness of an OKLCH color
 * @param color OKLCH color object
 * @param delta Amount to add to lightness (can be negative)
 * @returns New OKLCH color with adjusted lightness (clamped to 0-1)
 */
export function adjustLightness(color: OklchColor, delta: number): OklchColor {
  return {
    l: Math.max(0, Math.min(1, color.l + delta)),
    c: color.c,
    h: color.h,
  };
}

/**
 * Adjust the chroma (saturation) of an OKLCH color
 * @param color OKLCH color object
 * @param delta Amount to add to chroma (can be negative)
 * @returns New OKLCH color with adjusted chroma (clamped to 0-0.4)
 */
export function adjustChroma(color: OklchColor, delta: number): OklchColor {
  return {
    l: color.l,
    c: Math.max(0, Math.min(0.4, color.c + delta)),
    h: color.h,
  };
}

/**
 * Convert an OKLCH color object to RGB string
 * @param color OKLCH color object
 * @returns RGB string in format "rgb(r, g, b)"
 */
export function oklchToRgbString(color: OklchColor): string {
  return oklchToRgb(color.l, color.c, color.h);
}

/**
 * Generate color variants for UI states (hover, pressed) from a base color
 * Uses OKLCH for perceptually uniform adjustments
 * @param baseColor CSS color string (hex or rgb)
 * @param hoverLightnessDelta Lightness adjustment for hover state (default +0.08)
 * @param pressedLightnessDelta Lightness adjustment for pressed state (default -0.1)
 * @returns Object with base, hover, and pressed color strings, or null if parsing failed
 */
export function generateColorVariants(
  baseColor: string,
  hoverLightnessDelta: number = 0.08,
  pressedLightnessDelta: number = -0.1,
): { base: string; hover: string; pressed: string } | null {
  const oklch = colorToOklch(baseColor);
  if (!oklch) {
    return null;
  }

  const hoverOklch = adjustLightness(oklch, hoverLightnessDelta);
  const pressedOklch = adjustLightness(oklch, pressedLightnessDelta);

  return {
    base: oklchToRgbString(oklch),
    hover: oklchToRgbString(hoverOklch),
    pressed: oklchToRgbString(pressedOklch),
  };
}

/**
 * Convert RGB values (0-255) to hex string
 * @param r Red (0-255)
 * @param g Green (0-255)
 * @param b Blue (0-255)
 * @returns Hex color string with # prefix
 */
export function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (c: number) => {
    const hex = Math.round(Math.max(0, Math.min(255, c))).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Blend two colors in OKLCH space for perceptually uniform mixing
 * @param color1 First CSS color string (hex or rgb)
 * @param color2 Second CSS color string (hex or rgb)
 * @param ratio Blend ratio (0-1, where 0 = all color1, 1 = all color2, 0.5 = equal blend)
 * @returns Blended RGB color string, or fallback to color1 if parsing fails
 */
export function blendColors(
  color1: string,
  color2: string,
  ratio: number = 0.5,
): string {
  const oklch1 = colorToOklch(color1);
  const oklch2 = colorToOklch(color2);

  // Fallback if parsing fails
  if (!oklch1 || !oklch2) {
    console.warn(`Failed to parse colors for blending: ${color1}, ${color2}`);
    return color1;
  }

  // Clamp ratio
  ratio = Math.max(0, Math.min(1, ratio));

  // Blend in OKLCH space
  const blendedL = oklch1.l * (1 - ratio) + oklch2.l * ratio;
  const blendedC = oklch1.c * (1 - ratio) + oklch2.c * ratio;

  // Hue blending needs special handling for circular values
  let hue1 = oklch1.h;
  let hue2 = oklch2.h;

  // Take shortest path around the hue circle
  const hueDiff = hue2 - hue1;
  if (hueDiff > 180) {
    hue1 += 360;
  } else if (hueDiff < -180) {
    hue2 += 360;
  }

  let blendedH = hue1 * (1 - ratio) + hue2 * ratio;

  // Normalize back to 0-360
  if (blendedH < 0) {
    blendedH += 360;
  } else if (blendedH >= 360) {
    blendedH -= 360;
  }

  return oklchToRgb(blendedL, blendedC, blendedH);
}
