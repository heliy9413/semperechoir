// Renders the dashboard "የዕለቱ ቃል ማዕድ" scripture card as a crisp PNG for the
// Telegram daily post.
//
// Text is NEVER rasterized through pureimage's font/curve pipeline: its
// 10-segment bezier flattening visibly warps the round Ethiopic fidels (the
// "deformed / garbled / disjointed letters" seen in earlier Telegram posts).
// Instead, glyph outlines come straight from the full Noto Sans Ethiopic /
// Noto Sans TTFs (via opentype.js) and are rasterized here with a dedicated
// 3x-supersampled scanline (even-odd) rasterizer that preserves enclosed
// loops, exact advances and real letter shapes. pureimage is used only to
// allocate the pixel buffer and encode the final PNG.

// @ts-ignore
import { make as makeImage, encodePNGToStream } from "npm:pureimage@0.4.20/dist/index.esm.js";
// @ts-ignore
import opentype from "npm:opentype.js@1.3.4";
// @ts-ignore
import { Writable } from "node:stream";

// ---- canvas / palette ------------------------------------------------------

const W = 1080; // 4:5 portrait
const H = 1350;
const CARD_INSET = 18;
const CARD_R = 44;
const BORDER = 5;
const PAD = 92;

const WHITE = [255, 255, 255];
const NAVY = [15, 30, 61];
const NAVY_DARK = [10, 23, 41];
const GOLD = [201, 162, 39];
const GOLD_LIGHT = [230, 199, 102];
const SLATE = [203, 213, 225];
const SNOW = [248, 250, 252];

const TITLE_TEXT = "የዕለቱ ቃል ማዕድ";
const SUBTITLE_TEXT = "Daily Scripture · ከአማርኛ መጽሐፍ ቅዱስ";
const REFLECTION_LABEL = "የዕለቱ ትምህርት · Daily Reflection";
const FOOTER_TEXT = "የሰምፔር መዘምራን · Sempere Choir";

// ---- fonts ------------------------------------------------------------------
// Full-coverage hinted TTFs from the official Noto release CDN. (Google Fonts'
// CSS API serves a Latin-only ~21KB subset to server clients, which turns every
// Amharic glyph into a tofu box — never use it here.)
const FONT_SOURCES = [
  "https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts",
  "https://raw.githubusercontent.com/notofonts/notofonts.github.io/main/fonts",
];
const FONT_FILES: Record<string, string> = {
  ETH: "NotoSansEthiopic/hinted/ttf/NotoSansEthiopic-Regular.ttf",
  ETH_BOLD: "NotoSansEthiopic/hinted/ttf/NotoSansEthiopic-Bold.ttf",
  LAT: "NotoSans/hinted/ttf/NotoSans-Regular.ttf",
  LAT_BOLD: "NotoSans/hinted/ttf/NotoSans-Bold.ttf",
};

type FontKey = keyof typeof FONT_FILES;
type Fonts = Record<FontKey, any>;

let fontsReady: Promise<Fonts> | null = null;
const fontKeyMap = new WeakMap<object, FontKey>();

function loadFonts(): Promise<Fonts> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const out: Partial<Fonts> = {};
      await Promise.all(
        (Object.keys(FONT_FILES) as FontKey[]).map(async (key: FontKey) => {
          let lastErr: any = null;
          for (const base of FONT_SOURCES) {
            try {
              const res = await fetch(`${base}/${FONT_FILES[key]}`, { signal: AbortSignal.timeout(20000) });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              const font = opentype.parse(await res.arrayBuffer());
              out[key] = font;
              fontKeyMap.set(font, key);
              return;
            } catch (err: any) {
              lastErr = err;
            }
          }
          throw lastErr || new Error(`font ${key} unavailable`);
        })
      );
      return out as Fonts;
    })();
  }
  return fontsReady;
}

const isEthiopic = (ch: string): boolean => {
  const c = ch.codePointAt(0) || 0;
  return (c >= 0x1200 && c <= 0x139f) || (c >= 0x2d80 && c <= 0x2ddf);
};

// Picks the font that actually contains this character's glyph.
function resolveFont(fonts: Fonts, ch: string, bold: boolean): { font: any; key: string } {
  const eth = isEthiopic(ch);
  const primary = eth ? (bold ? fonts.ETH_BOLD : fonts.ETH) : (bold ? fonts.LAT_BOLD : fonts.LAT);
  const secondary = eth ? (bold ? fonts.LAT_BOLD : fonts.LAT) : (bold ? fonts.ETH_BOLD : fonts.ETH);
  if (primary && primary.charToGlyph(ch).index !== 0) return { font: primary, key: fontKeyMap.get(primary) || "p" };
  if (secondary && secondary.charToGlyph(ch).index !== 0) return { font: secondary, key: fontKeyMap.get(secondary) || "s" };
  return { font: primary, key: fontKeyMap.get(primary) || "p" };
}

// ---- glyph rasterizer (exact outlines, 3x supersampled even-odd fill) ------

type Raster = { w: number; h: number; cov: Uint8Array; x0: number; y0: number; adv: number };

const SEGS = 24; // bezier flattening density (pureimage used ~10 — too coarse)

function glyphContours(glyph: any, size: number): number[][][] {
  const path = glyph.getPath(0, 0, size);
  const contours: number[][][] = [];
  let cur: number[] = [0, 0];
  for (const c of path.commands) {
    if (c.type === "M") {
      cur = [c.x, c.y];
      contours.push([cur]);
    } else if (c.type === "L") {
      if (!contours.length) continue;
      contours[contours.length - 1].push([c.x, c.y]);
      cur = [c.x, c.y];
    } else if (c.type === "Q") {
      if (!contours.length) continue;
      const pts = contours[contours.length - 1];
      const [x0, y0] = cur;
      for (let i = 1; i <= SEGS; i++) {
        const t = i / SEGS;
        const mt = 1 - t;
        pts.push([mt * mt * x0 + 2 * mt * t * c.x1 + t * t * c.x, mt * mt * y0 + 2 * mt * t * c.y1 + t * t * c.y]);
      }
      cur = [c.x, c.y];
    } else if (c.type === "C") {
      if (!contours.length) continue;
      const pts = contours[contours.length - 1];
      const [x0, y0] = cur;
      for (let i = 1; i <= SEGS; i++) {
        const t = i / SEGS;
        const mt = 1 - t;
        pts.push([
          mt * mt * mt * x0 + 3 * mt * mt * t * c.x1 + 3 * mt * t * t * c.x2 + t * t * t * c.x,
          mt * mt * mt * y0 + 3 * mt * mt * t * c.y1 + 3 * mt * t * t * c.y2 + t * t * t * c.y,
        ]);
      }
      cur = [c.x, c.y];
    } else if (c.type === "Z") {
      if (contours.length && contours[contours.length - 1].length > 1) {
        const pts = contours[contours.length - 1];
        const first = pts[0];
        const last = pts[pts.length - 1];
        if (Math.abs(first[0] - last[0]) > 0.01 || Math.abs(first[1] - last[1]) > 0.01) pts.push([first[0], first[1]]);
      }
    }
  }
  return contours;
}

function rasterizeGlyph(glyph: any, size: number): Raster {
  const unitsPerEm: number = glyph?.path?.unitsPerEm || glyph?.font?.unitsPerEm || 1000;
  const adv = (glyph.advanceWidth / unitsPerEm) * size;
  const contours = glyphContours(glyph, size).filter((pts: number[][]) => pts.length > 2);
  if (!contours.length) return { w: 0, h: 0, cov: new Uint8Array(0), x0: 0, y0: 0, adv };

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const pts of contours) {
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[1] > maxY) maxY = p[1];
    }
  }
  const x0 = Math.floor(minX) - 1;
  const y0 = Math.floor(minY) - 1;
  const w = Math.ceil(maxX) - x0 + 2;
  const h = Math.ceil(maxY) - y0 + 2;

  const edges: number[][] = [];
  for (const pts of contours) {
    for (let i = 0; i < pts.length - 1; i++) edges.push([pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1]]);
  }

  const SS = 3; // 3x vertical supersampling; spans give horizontal AA
  const cov = new Uint8Array(w * h);
  const xs: number[] = [];
  for (let sy = 0; sy < h * SS; sy++) {
    const y = (sy + 0.5) / SS + y0;
    xs.length = 0;
    for (const e of edges) {
      const y1 = e[1], y2 = e[3];
      if ((y1 <= y) !== (y2 <= y)) xs.push(e[0] + ((y - y1) / (y2 - y1)) * (e[2] - e[0]));
    }
    if (!xs.length) continue;
    xs.sort((a: number, b: number) => a - b);
    const py = Math.floor(sy / SS);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = xs[i], xb = xs[i + 1];
      const pxStart = Math.floor(xa);
      const pxEnd = Math.floor(xb);
      for (let px = pxStart; px <= pxEnd; px++) {
        const l = Math.max(px, xa);
        const r = Math.min(px + 1, xb);
        const cover = (r - l) * (255 / SS);
        if (cover > 0 && px >= 0 && px < w) {
          const idx = py * w + px;
          cov[idx] = Math.min(255, cov[idx] + cover);
        }
      }
    }
  }
  return { w, h, cov, x0, y0, adv };
}

const rasterCache = new Map<string, Raster>();

function getRaster(fonts: Fonts, ch: string, size: number, bold: boolean): Raster {
  const { font, key } = resolveFont(fonts, ch, bold);
  const ck = `${key}|${ch.codePointAt(0)}|${size}`;
  let r = rasterCache.get(ck);
  if (!r) {
    r = rasterizeGlyph(font.charToGlyph(ch), size);
    rasterCache.set(ck, r);
  }
  return r;
}

// ---- text measuring / wrapping / drawing -------------------------------------

function measureText(fonts: Fonts, text: string, size: number, bold: boolean): number {
  let width = 0;
  for (const ch of Array.from(String(text ?? ""))) width += getRaster(fonts, ch, size, bold).adv;
  return width;
}

function wrapText(fonts: Fonts, text: string, size: number, bold: boolean, maxWidth: number, maxLines: number): string[] {
  const clean = String(text ?? "").replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const lines: string[] = [];
  let cur = "";
  for (const word of clean.split(" ")) {
    const cand = cur ? `${cur} ${word}` : word;
    if (measureText(fonts, cand, size, bold) <= maxWidth) {
      cur = cand;
      continue;
    }
    if (cur) {
      lines.push(cur);
      cur = "";
    }
    // A single word wider than the line is split by characters.
    let piece = "";
    for (const ch of Array.from(word)) {
      if (piece && measureText(fonts, piece + ch, size, bold) > maxWidth) {
        lines.push(piece);
        piece = ch;
      } else {
        piece += ch;
      }
    }
    cur = piece;
  }
  if (cur) lines.push(cur);

  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    let last = kept[maxLines - 1];
    while (last.length > 1 && measureText(fonts, last + "…", size, bold) > maxWidth) {
      last = last.slice(0, -1).replace(/[\s,፣።.]+$/, "");
    }
    kept[maxLines - 1] = last + "…";
    return kept;
  }
  return lines;
}

function compositeGlyph(img: any, g: Raster, px: number, py: number, rgb: number[]): void {
  const d = img.data;
  const iw = img.width;
  const ih = img.height;
  for (let yy = 0; yy < g.h; yy++) {
    const dy = py + yy;
    if (dy < 0 || dy >= ih) continue;
    for (let xx = 0; xx < g.w; xx++) {
      const a = g.cov[yy * g.w + xx];
      if (!a) continue;
      const dx = px + xx;
      if (dx < 0 || dx >= iw) continue;
      const i = (dy * iw + dx) * 4;
      const t = a / 255;
      const it = 1 - t;
      d[i] = (rgb[0] * t + d[i] * it) | 0;
      d[i + 1] = (rgb[1] * t + d[i + 1] * it) | 0;
      d[i + 2] = (rgb[2] * t + d[i + 2] * it) | 0;
      d[i + 3] = 255;
    }
  }
}

function drawText(
  img: any,
  fonts: Fonts,
  text: string,
  xLeft: number,
  yBaseline: number,
  size: number,
  bold: boolean,
  rgb: number[],
  align: "left" | "center" = "left"
): void {
  const width = measureText(fonts, text, size, bold);
  let cx = align === "center" ? xLeft - width / 2 : xLeft;
  for (const ch of Array.from(String(text ?? ""))) {
    const g = getRaster(fonts, ch, size, bold);
    if (g.cov.length) {
      compositeGlyph(img, g, Math.round(cx + g.x0), Math.round(yBaseline + g.y0), rgb);
    }
    cx += g.adv;
  }
}

// ---- shapes (exact math, no curve rasterization needed) ---------------------

const mix = (a: number[], b: number[], t: number): number[] => [
  Math.round(a[0] * (1 - t) + b[0] * t),
  Math.round(a[1] * (1 - t) + b[1] * t),
  Math.round(a[2] * (1 - t) + b[2] * t),
];

function setPx(img: any, x: number, y: number, rgb: number[], alpha = 1): void {
  const iw = img.width;
  const i = (y * iw + x) * 4;
  const d = img.data;
  const t = Math.min(1, Math.max(0, alpha));
  const it = 1 - t;
  d[i] = (rgb[0] * t + d[i] * it) | 0;
  d[i + 1] = (rgb[1] * t + d[i + 1] * it) | 0;
  d[i + 2] = (rgb[2] * t + d[i + 2] * it) | 0;
  d[i + 3] = 255;
}

function roundedRowSpan(y: number, rx: number, ry: number, rw: number, rh: number, r: number): [number, number] | null {
  const top = ry;
  const bot = ry + rh;
  if (y < top || y >= bot) return null;
  let inset = 0;
  if (y < top + r) {
    const dy = top + r - (y + 0.5);
    inset = r - Math.sqrt(Math.max(0, r * r - dy * dy));
  } else if (y > bot - r) {
    const dy = y + 0.5 - (bot - r);
    inset = r - Math.sqrt(Math.max(0, r * r - dy * dy));
  }
  return [rx + inset, rx + rw - inset];
}

function fillRoundedRect(
  img: any,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  r: number,
  color: number[] | ((x: number, y: number) => number[]),
  alpha = 1
): void {
  for (let y = Math.floor(ry); y < Math.ceil(ry + rh); y++) {
    const span = roundedRowSpan(y, rx, ry, rw, rh, r);
    if (!span) continue;
    for (let x = Math.round(span[0]); x < Math.round(span[1]); x++) {
      const c = typeof color === "function" ? color(x + 0.5, y + 0.5) : color;
      setPx(img, x, y, c, alpha);
    }
  }
}

function fillRect(img: any, rx: number, ry: number, rw: number, rh: number, rgb: number[], alpha = 1): void {
  for (let y = Math.round(ry); y < Math.round(ry + rh); y++) {
    for (let x = Math.round(rx); x < Math.round(rx + rw); x++) setPx(img, x, y, rgb, alpha);
  }
}

function glow(img: any, cx: number, cy: number, radius: number, rgb: number[], strength: number): void {
  for (let y = Math.max(0, Math.floor(cy - radius)); y < Math.min(img.height, Math.ceil(cy + radius)); y++) {
    for (let x = Math.max(0, Math.floor(cx - radius)); x < Math.min(img.width, Math.ceil(cx + radius)); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      if (d <= radius) setPx(img, x, y, rgb, (1 - d / radius) * strength);
    }
  }
}

// ---- card composition ---------------------------------------------------------

export type ScriptureCardInput = {
  verse: string;
  reference: string;
  takeaway: string;
};

export async function renderScriptureCardPng(input: ScriptureCardInput): Promise<Uint8Array> {
  const fonts = await loadFonts();

  const img = makeImage(W, H);

  // white frame + gold-bordered navy card (rounded, 4:5)
  fillRect(img, 0, 0, W, H, WHITE);
  fillRoundedRect(img, CARD_INSET, CARD_INSET, W - CARD_INSET * 2, H - CARD_INSET * 2, CARD_R, GOLD);
  const innerX = CARD_INSET + BORDER;
  const innerY = CARD_INSET + BORDER;
  fillRoundedRect(
    img,
    innerX,
    innerY,
    W - innerX * 2,
    H - innerY * 2,
    CARD_R - BORDER,
    (x: number, y: number) => mix(NAVY, NAVY_DARK, (x / W + y / H) / 2)
  );

  // soft decorative glows
  glow(img, W - CARD_INSET - 40, CARD_INSET + 80, 240, GOLD, 0.05);
  glow(img, CARD_INSET + 40, H - CARD_INSET - 60, 190, WHITE, 0.035);

  // header: gold book tile + title
  fillRoundedRect(img, PAD, 112, 96, 96, 20, GOLD, 0.18);
  fillRect(img, PAD + 44, 138, 4, 50, GOLD);
  fillRect(img, PAD + 22, 138, 20, 42, GOLD);
  fillRect(img, PAD + 50, 138, 20, 42, GOLD);

  drawText(img, fonts, TITLE_TEXT, PAD + 124, 180, 52, true, GOLD_LIGHT);
  drawText(img, fonts, SUBTITLE_TEXT, PAD + 124, 218, 24, false, SLATE);

  // gold divider under the header
  fillRect(img, PAD, 254, W - PAD * 2, 2, mix(NAVY, GOLD, 0.35));

  // scripture verse — crisp off-white Amharic
  const verse = String(input.verse || input.takeaway || "").trim();
  const verseLines = wrapText(fonts, verse, 42, false, W - PAD * 2, 10);
  const lineH = 66;
  let y = 326;
  for (const line of verseLines) {
    drawText(img, fonts, line, PAD, y, 42, false, SNOW);
    y += lineH;
  }

  // reference block
  const refY = Math.min(326 + Math.max(verseLines.length - 1, 0) * lineH + 64, 1000);
  fillRect(img, PAD, refY, 64, 5, GOLD);
  drawText(img, fonts, input.reference, PAD, refY + 54, 36, true, WHITE);

  // reflection
  drawText(img, fonts, REFLECTION_LABEL, PAD, refY + 120, 24, true, GOLD_LIGHT);
  const takeawayLines = wrapText(fonts, input.takeaway, 29, false, W - PAD * 2, 3);
  let ty = refY + 160;
  for (const line of takeawayLines) {
    drawText(img, fonts, line, PAD, ty, 29, false, SLATE);
    ty += 46;
  }

  // footer
  fillRect(img, PAD, 1248, W - PAD * 2, 2, mix(NAVY, GOLD, 0.35));
  drawText(img, fonts, FOOTER_TEXT, W / 2, 1306, 27, true, GOLD, "center");

  // encode PNG in memory
  const chunks: Uint8Array[] = [];
  const sink = new Writable({
    write(chunk: Uint8Array, _enc: unknown, cb: (err?: Error | null) => void) {
      chunks.push(chunk);
      cb();
    },
  });
  await encodePNGToStream(img, sink);

  let total = 0;
  for (const c of chunks) total += c.length;
  const png = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    png.set(c, offset);
    offset += c.length;
  }
  return png;
}