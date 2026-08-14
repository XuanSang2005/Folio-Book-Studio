import { readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const beforeDirectory = resolve("docs/baseline/before");
const afterDirectory = resolve("docs/baseline/after");
const imageNames = (await readdir(beforeDirectory))
  .filter((name) => name.endsWith(".png"))
  .sort();

function findVerticalAlignment(before, after) {
  const sampleStep = 10;
  const maximumOffset = Math.floor(before.height * 0.8 / sampleStep) * sampleStep;
  let best;

  for (let offset = -maximumOffset; offset <= maximumOffset; offset += sampleStep) {
    const beforeStart = Math.max(0, -offset);
    const beforeEnd = Math.min(before.height, before.height - offset);
    const overlapRatio = (beforeEnd - beforeStart) / before.height;
    let totalDelta = 0;
    let channelSamples = 0;

    for (let y = beforeStart; y < beforeEnd; y += sampleStep) {
      const afterY = y + offset;
      for (let x = 0; x < before.width; x += sampleStep) {
        const beforeIndex = (y * before.width + x) * 4;
        const afterIndex = (afterY * after.width + x) * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          totalDelta += Math.abs(
            before.data[beforeIndex + channel] - after.data[afterIndex + channel],
          );
          channelSamples += 1;
        }
      }
    }

    const meanAbsoluteColorDelta = totalDelta / channelSamples;
    const score = meanAbsoluteColorDelta / overlapRatio ** 0.15;
    if (!best || score < best.score) {
      best = { offset, overlapRatio, meanAbsoluteColorDelta, score };
    }
  }

  return {
    bestVerticalOffsetPixels: best.offset,
    alignedOverlapRatio: best.overlapRatio,
    alignedMeanAbsoluteColorDelta: best.meanAbsoluteColorDelta,
    scrollSensitive: Math.abs(best.offset) > 20,
  };
}

const comparisons = [];
for (const name of imageNames) {
  const before = PNG.sync.read(await readFile(resolve(beforeDirectory, name)));
  const after = PNG.sync.read(await readFile(resolve(afterDirectory, name)));
  if (before.width !== after.width || before.height !== after.height) {
    throw new Error(`Image dimensions differ for ${name}`);
  }
  const differentPixels = pixelmatch(
    before.data,
    after.data,
    undefined,
    before.width,
    before.height,
    { includeAA: true, threshold: 0.01 },
  );
  const totalPixels = before.width * before.height;
  comparisons.push({
    name,
    differentPixels,
    totalPixels,
    differentPixelRatio: differentPixels / totalPixels,
    ...findVerticalAlignment(before, after),
  });
}

const report = {
  metric: "Pixelmatch perceptual pixel comparison",
  generatedAt: new Date().toISOString(),
  maximumDifferentPixelRatio: Math.max(
    ...comparisons.map(({ differentPixelRatio }) => differentPixelRatio),
  ),
  meanDifferentPixelRatio:
    comparisons.reduce((total, { differentPixelRatio }) => total + differentPixelRatio, 0)
    / comparisons.length,
  meanAlignedAbsoluteColorDelta:
    comparisons.reduce(
      (total, { alignedMeanAbsoluteColorDelta }) => total + alignedMeanAbsoluteColorDelta,
      0,
    ) / comparisons.length,
  interpretation: "Raw pixel ratios include authorized Phase 4 content changes (sample controls/copy removed, backend values rendered, pending fake generated images removed), dynamic browser font/image rasterization, and recorded scroll-position differences. The public pixelmatch library replaces a removed private Playwright API. The aligned color metric searches only for a vertical offset; it does not resize, recolor, or otherwise transform either screenshot.",
  comparisons,
};

await writeFile(
  resolve("docs/baseline/comparison.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(report, null, 2));
