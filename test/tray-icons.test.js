"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { drawBadge } = require("../src/tray-icons");

function filledBitmap(size) {
  // 全面が不透明な黒（BGRA、アルファ乗算済み）
  const bitmap = Buffer.alloc(size * size * 4);
  for (let offset = 3; offset < bitmap.length; offset += 4) bitmap[offset] = 255;
  return bitmap;
}

function alphaAt(bitmap, size, x, y) {
  return bitmap[(y * size + x) * 4 + 3];
}

test("draws the notification dot in the top-right corner", () => {
  const size = 36; // 18pt @2x
  const source = filledBitmap(size);
  const badged = drawBadge(source, size, size, 2);

  // 丸の中心（右上から 3pt）は不透明
  assert.equal(alphaAt(badged, size, 30, 5), 255);
  // 丸と図柄のあいだ（中心から 3.75pt）は削られて透明
  assert.equal(alphaAt(badged, size, 30 - 8, 5 + 4), 0);
  // 左下の図柄はそのまま
  assert.equal(alphaAt(badged, size, 4, 31), 255);
  // 元のバッファは変えない
  assert.equal(alphaAt(source, size, 30 - 8, 5 + 4), 255);
});

test("keeps the dot inside a 1x canvas", () => {
  const size = 18;
  const badged = drawBadge(Buffer.alloc(size * size * 4), size, size, 1);
  assert.equal(alphaAt(badged, size, 15, 2), 255);
  assert.equal(alphaAt(badged, size, 2, 15), 0);
});
