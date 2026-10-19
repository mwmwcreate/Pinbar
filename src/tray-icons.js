"use strict";

const { nativeImage } = require("electron");

// メニューバーのアイコンは 18pt の枠に、少し小さめ（14pt、約 0.75 倍）に描く。
// favicon は枠いっぱいに描かれているものが多く、そのままだと標準のアイコンより大きく見える。
// Retina 用に 2x も持たせる。
const TRAY_ICON_SIZE = 18;
const TRAY_GLYPH_SIZE = 14;
const SCALE_FACTORS = [1, 2];

// favicon を保存するときの一辺（2x の分まで持つ）。
const STORED_FAVICON_SIZE = TRAY_ICON_SIZE * 2;

// 不透明な面積がこの割合以上なら「塗りつぶし型」（丸や四角の地に記号が乗る favicon）とみなす。
const FILLED_COVERAGE = 0.6;

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function smoothstep(edge0, edge1, value) {
  const t = clamp01((value - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

// toBitmap() は 1 ピクセル 4 バイト（BGRA、アルファ乗算済み）。乗算を戻して色を読む。
function readPixel(bitmap, offset) {
  const alpha = bitmap[offset + 3];
  if (alpha === 0) return { r: 0, g: 0, b: 0, alpha };
  return {
    b: Math.round((bitmap[offset] * 255) / alpha),
    g: Math.round((bitmap[offset + 1] * 255) / alpha),
    r: Math.round((bitmap[offset + 2] * 255) / alpha),
    alpha,
  };
}

// いちばん多く使われている不透明色を「地の色」とみなす（5bit に量子化して集計）。
function findDominantColor(bitmap) {
  const bins = new Map();
  for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
    const pixel = readPixel(bitmap, offset);
    if (pixel.alpha < 200) continue;
    const key = ((pixel.r >> 3) << 10) | ((pixel.g >> 3) << 5) | (pixel.b >> 3);
    const bin = bins.get(key) || { count: 0, r: 0, g: 0, b: 0 };
    bin.count += 1;
    bin.r += pixel.r;
    bin.g += pixel.g;
    bin.b += pixel.b;
    bins.set(key, bin);
  }
  let best = null;
  for (const bin of bins.values()) {
    if (!best || bin.count > best.count) best = bin;
  }
  if (!best) return null;
  return {
    r: best.r / best.count,
    g: best.g / best.count,
    b: best.b / best.count,
  };
}

/**
 * favicon をメニューバー用のテンプレート画像（黒＋アルファ）に変換する。
 * macOS がメニューバーの色に合わせて黒／白で描くので、他のアイコンと同じ見た目になる。
 *
 * - 地が透明な favicon（Slack の # や Google の G など）: 形をそのまま塗りつぶす
 * - 丸や四角の地に記号が乗る favicon: 地の色と違う部分だけを形として取り出す
 */
function toTemplateBitmap(bitmap) {
  const pixelCount = bitmap.length / 4;
  let covered = 0;
  for (let offset = 3; offset < bitmap.length; offset += 4) {
    if (bitmap[offset] >= 128) covered += 1;
  }
  const coverage = covered / pixelCount;

  const silhouette = Buffer.alloc(bitmap.length);
  for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
    silhouette[offset + 3] = bitmap[offset + 3];
  }
  if (coverage < FILLED_COVERAGE) return silhouette;

  const background = findDominantColor(bitmap);
  if (!background) return silhouette;

  const glyph = Buffer.alloc(bitmap.length);
  let glyphWeight = 0;
  let sourceWeight = 0;
  for (let offset = 0; offset + 3 < bitmap.length; offset += 4) {
    const pixel = readPixel(bitmap, offset);
    if (pixel.alpha === 0) continue;
    const distance = Math.hypot(
      pixel.r - background.r,
      pixel.g - background.g,
      pixel.b - background.b,
    );
    const alpha = Math.round(pixel.alpha * smoothstep(24, 96, distance));
    glyph[offset + 3] = alpha;
    glyphWeight += alpha;
    sourceWeight += pixel.alpha;
  }
  // 地の色と違う部分がほとんど無い（ほぼ単色の塗りつぶし）なら、形をそのまま使う。
  if (sourceWeight === 0 || glyphWeight / sourceWeight < 0.03) return silhouette;
  return glyph;
}

// 通知が来たときにアイコンの右上に付ける丸（単位は pt）。
// テンプレート画像のまま描くので、メニューバーの色に合わせて黒／白になる。
// 丸のまわりは図柄を少し削って、丸が図柄に埋もれないようにする。
const BADGE_RADIUS = 3;
const BADGE_GAP = 1.5;

/**
 * BGRA（アルファ乗算済み）のビットマップの右上に丸を描く。元のバッファは変えない。
 * width / height はピクセル数、scale はそのビットマップの倍率（1x なら 1、2x なら 2）。
 */
function drawBadge(bitmap, width, height, scale) {
  const out = Buffer.from(bitmap);
  const radius = BADGE_RADIUS * scale;
  const clearRadius = (BADGE_RADIUS + BADGE_GAP) * scale;
  const centerX = width - radius;
  const centerY = radius;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const distance = Math.hypot(x + 0.5 - centerX, y + 0.5 - centerY);
      if (distance > clearRadius + 0.5) continue;
      const keep = clamp01(distance - clearRadius + 0.5);
      const dot = clamp01(radius - distance + 0.5);
      const offset = (y * width + x) * 4;
      const glyph = keep * (1 - dot);
      out[offset] = Math.round(out[offset] * glyph);
      out[offset + 1] = Math.round(out[offset + 1] * glyph);
      out[offset + 2] = Math.round(out[offset + 2] * glyph);
      out[offset + 3] = Math.round(255 * dot + out[offset + 3] * glyph);
    }
  }
  return out;
}

/** テンプレート画像の各倍率に丸を描いた版を作る。 */
function withBadge(image) {
  const badged = nativeImage.createEmpty();
  for (const scaleFactor of image.getScaleFactors()) {
    const size = image.getSize(scaleFactor);
    const width = Math.round(size.width * scaleFactor);
    const height = Math.round(size.height * scaleFactor);
    const bitmap = image.toBitmap({ scaleFactor });
    if (bitmap.length !== width * height * 4) continue;
    badged.addRepresentation({
      scaleFactor,
      width,
      height,
      buffer: drawBadge(bitmap, width, height, scaleFactor),
    });
  }
  if (badged.isEmpty()) return image;
  badged.setTemplateImage(true);
  return badged;
}

function representationBitmap(image, pixels) {
  const bitmap = image.resize({ width: pixels, height: pixels }).toBitmap();
  return bitmap.length === pixels * pixels * 4 ? bitmap : null;
}

// 小さく描いた図柄を、透明な枠の中央に置く。
function centerInCanvas(bitmap, glyphPixels, canvasPixels) {
  const canvas = Buffer.alloc(canvasPixels * canvasPixels * 4);
  const offset = Math.floor((canvasPixels - glyphPixels) / 2);
  for (let y = 0; y < glyphPixels; y += 1) {
    bitmap.copy(
      canvas,
      ((y + offset) * canvasPixels + offset) * 4,
      y * glyphPixels * 4,
      (y + 1) * glyphPixels * 4,
    );
  }
  return canvas;
}

/**
 * 保存済み favicon（data URL）から、カラー版・モノクロ（テンプレート）版・
 * 通知の丸付きモノクロ版のトレイアイコンを作る。
 * 表示中はカラー、閉じているときはモノクロ、通知が来ていれば丸付きを使う。
 * 画像が読めないときは null（呼び出し側で既定のテンプレートアイコンを使う）。
 */
function buildTrayIcons(faviconDataUrl) {
  if (!faviconDataUrl) return null;
  const source = nativeImage.createFromDataURL(faviconDataUrl);
  if (source.isEmpty()) return null;

  // 形の判定は大きい方（2x）で行い、1x はその結果を縮小して作る。
  const largePixels = TRAY_ICON_SIZE * 2;
  const largeBitmap = representationBitmap(source, largePixels);
  if (!largeBitmap) return null;
  const template = nativeImage.createFromBitmap(toTemplateBitmap(largeBitmap), {
    width: largePixels,
    height: largePixels,
  });

  const color = nativeImage.createEmpty();
  const mono = nativeImage.createEmpty();
  for (const scaleFactor of SCALE_FACTORS) {
    const canvasPixels = TRAY_ICON_SIZE * scaleFactor;
    const glyphPixels = TRAY_GLYPH_SIZE * scaleFactor;
    const colorBitmap = representationBitmap(source, glyphPixels);
    const monoBitmap = representationBitmap(template, glyphPixels);
    if (!colorBitmap || !monoBitmap) return null;
    color.addRepresentation({
      scaleFactor,
      width: canvasPixels,
      height: canvasPixels,
      buffer: centerInCanvas(colorBitmap, glyphPixels, canvasPixels),
    });
    mono.addRepresentation({
      scaleFactor,
      width: canvasPixels,
      height: canvasPixels,
      buffer: centerInCanvas(monoBitmap, glyphPixels, canvasPixels),
    });
  }
  if (color.isEmpty() || mono.isEmpty()) return null;
  mono.setTemplateImage(true);
  return { color, mono, badged: withBadge(mono) };
}

/** 取得した favicon を保存用の大きさに整える。 */
function normalizeFavicon(image) {
  return image.resize({ width: STORED_FAVICON_SIZE, height: STORED_FAVICON_SIZE });
}

/** 複数の favicon 候補から、いちばん大きいものを選ぶ。 */
function pickLargestImage(images) {
  let best = null;
  for (const image of images) {
    if (!image || image.isEmpty()) continue;
    const { width, height } = image.getSize();
    if (!best || width * height > best.width * best.height) {
      best = { image, width, height };
    }
  }
  return best ? best.image : null;
}

module.exports = {
  buildTrayIcons,
  drawBadge,
  normalizeFavicon,
  pickLargestImage,
  toTemplateBitmap,
  withBadge,
  TRAY_ICON_SIZE,
};
