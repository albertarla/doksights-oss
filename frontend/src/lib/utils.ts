import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function hexToHsl(hex: string): string {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }

  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }

  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function isLightColor(hex: string): boolean {
  if (!hex) return true;
  hex = hex.replace('#', '');
  if (hex.length === 3) {
    hex = hex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(hex.substring(0, 2), 16);
  const g = parseInt(hex.substring(2, 4), 16);
  const b = parseInt(hex.substring(4, 6), 16);
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
}

/**
 * Adjusts the lightness of an HSL color string by a given percentage.
 * @param hslStr HSL string in format "H S% L%"
 * @param amount Percentage to add to lightness (can be negative)
 */
export function adjustHSL(hslStr: string, amount: number): string {
  const parts = hslStr.split(' ');
  if (parts.length !== 3) return hslStr;
  
  const h = parts[0];
  const s = parts[1];
  let l = parseInt(parts[2].replace('%', ''));
  
  l = Math.max(0, Math.min(100, l + amount));
  
  return `${h} ${s} ${l}%`;
}

/**
 * Generates a set of CSS variables for a custom theme.
 */
export function getThemeVariables(primaryHex?: string | null, backgroundHex?: string | null) {
  const variables: Record<string, string> = {};

  if (primaryHex) {
    const primaryHsl = hexToHsl(primaryHex);
    variables['--primary'] = primaryHsl;
    variables['--primary-foreground'] = isLightColor(primaryHex) ? '220 20% 10%' : '0 0% 100%';
    variables['--ring'] = primaryHsl;
  }

  if (backgroundHex) {
    const backgroundHsl = hexToHsl(backgroundHex);
    variables['--background'] = backgroundHsl;
    
    const isLight = isLightColor(backgroundHex);
    
    if (isLight) {
        variables['--foreground'] = '220 20% 10%';
        variables['--card'] = adjustHSL(backgroundHsl, 2);
        variables['--card-foreground'] = '220 20% 10%';
        variables['--secondary'] = adjustHSL(backgroundHsl, -5);
        variables['--secondary-foreground'] = '220 20% 10%';
        variables['--muted'] = adjustHSL(backgroundHsl, -3);
        variables['--muted-foreground'] = '220 10% 40%';
        variables['--border'] = adjustHSL(backgroundHsl, -8);
        variables['--accent'] = adjustHSL(backgroundHsl, -3);
        variables['--accent-foreground'] = '220 20% 10%';
    } else {
        variables['--foreground'] = '0 0% 100%';
        variables['--card'] = adjustHSL(backgroundHsl, 4);
        variables['--card-foreground'] = '0 0% 100%';
        variables['--secondary'] = adjustHSL(backgroundHsl, 10);
        variables['--secondary-foreground'] = '0 0% 100%';
        variables['--muted'] = adjustHSL(backgroundHsl, 8);
        variables['--muted-foreground'] = '220 10% 70%';
        variables['--border'] = adjustHSL(backgroundHsl, 12);
        variables['--accent'] = adjustHSL(backgroundHsl, 8);
        variables['--accent-foreground'] = '0 0% 100%';
    }
  }

  return variables;
}
