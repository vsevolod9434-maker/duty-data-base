import fs from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const sourcePath = path.join(process.cwd(), "tools", "map-source", "MAP.bmp");
const outputRoot = path.join(process.cwd(), "public", "map", "zone");
const tilesRoot = path.join(outputRoot, "tiles");
const metadataPath = path.join(outputRoot, "metadata.json");
const tileSize = 512;

function readBmpHeader(buffer) {
  if (buffer.toString("ascii", 0, 2) !== "BM") {
    throw new Error("Source file is not a BMP image.");
  }

  const pixelOffset = buffer.readUInt32LE(10);
  const dibHeaderSize = buffer.readUInt32LE(14);
  const width = buffer.readInt32LE(18);
  const rawHeight = buffer.readInt32LE(22);
  const planes = buffer.readUInt16LE(26);
  const bitsPerPixel = buffer.readUInt16LE(28);
  const compression = buffer.readUInt32LE(30);

  if (dibHeaderSize < 40 || planes !== 1 || compression !== 0) {
    throw new Error("Only uncompressed BMP files with a BITMAPINFOHEADER are supported.");
  }

  if (bitsPerPixel !== 24 && bitsPerPixel !== 32) {
    throw new Error("Only 24-bit and 32-bit BMP files are supported.");
  }

  if (width <= 0 || rawHeight === 0) {
    throw new Error("BMP has invalid dimensions.");
  }

  return {
    bitsPerPixel,
    bottomUp: rawHeight > 0,
    height: Math.abs(rawHeight),
    pixelOffset,
    width,
  };
}

function decodeBmpToRgba(buffer) {
  const metadata = readBmpHeader(buffer);
  const bytesPerPixel = metadata.bitsPerPixel / 8;
  const rowStride = Math.floor((metadata.width * metadata.bitsPerPixel + 31) / 32) * 4;
  const rgba = Buffer.allocUnsafe(metadata.width * metadata.height * 4);

  for (let y = 0; y < metadata.height; y += 1) {
    const sourceY = metadata.bottomUp ? metadata.height - 1 - y : y;
    const sourceRowOffset = metadata.pixelOffset + sourceY * rowStride;
    const targetRowOffset = y * metadata.width * 4;

    for (let x = 0; x < metadata.width; x += 1) {
      const sourceOffset = sourceRowOffset + x * bytesPerPixel;
      const targetOffset = targetRowOffset + x * 4;

      rgba[targetOffset] = buffer[sourceOffset + 2];
      rgba[targetOffset + 1] = buffer[sourceOffset + 1];
      rgba[targetOffset + 2] = buffer[sourceOffset];
      rgba[targetOffset + 3] = metadata.bitsPerPixel === 32 ? buffer[sourceOffset + 3] : 255;
    }
  }

  return {
    data: rgba,
    height: metadata.height,
    width: metadata.width,
  };
}

function getMaxZoom(width, height) {
  return Math.max(0, Math.ceil(Math.log2(Math.max(width, height) / tileSize)));
}

function getLevelSize(width, height, maxZoom, zoom) {
  const scale = 2 ** (zoom - maxZoom);

  return {
    height: Math.max(1, Math.round(height * scale)),
    width: Math.max(1, Math.round(width * scale)),
  };
}

async function removeExistingTiles() {
  await fs.rm(tilesRoot, { force: true, recursive: true });
  await fs.mkdir(tilesRoot, { recursive: true });
}

async function createLevelRaw(source, zoom, maxZoom) {
  const size = getLevelSize(source.width, source.height, maxZoom, zoom);

  if (size.width === source.width && size.height === source.height) {
    return {
      data: source.data,
      ...size,
    };
  }

  const data = await sharp(source.data, {
    raw: {
      channels: 4,
      height: source.height,
      width: source.width,
    },
  })
    .resize(size.width, size.height, { fit: "fill", kernel: sharp.kernel.lanczos3 })
    .raw()
    .toBuffer();

  return {
    data,
    ...size,
  };
}

function extractTile(level, tileX, tileY) {
  const left = tileX * tileSize;
  const top = tileY * tileSize;
  const width = Math.min(tileSize, level.width - left);
  const height = Math.min(tileSize, level.height - top);
  const tile = Buffer.allocUnsafe(width * height * 4);

  for (let row = 0; row < height; row += 1) {
    const sourceStart = ((top + row) * level.width + left) * 4;
    const targetStart = row * width * 4;
    level.data.copy(tile, targetStart, sourceStart, sourceStart + width * 4);
  }

  return { data: tile, height, width };
}

async function writeTile(tile, filePath) {
  await sharp(tile.data, {
    raw: {
      channels: 4,
      height: tile.height,
      width: tile.width,
    },
  })
    .png({ compressionLevel: 9 })
    .toFile(filePath);
}

async function main() {
  const sourceBuffer = await fs.readFile(sourcePath);
  const source = decodeBmpToRgba(sourceBuffer);
  const maxZoom = getMaxZoom(source.width, source.height);
  let tileCount = 0;

  await fs.mkdir(outputRoot, { recursive: true });
  await removeExistingTiles();

  for (let zoom = 0; zoom <= maxZoom; zoom += 1) {
    const level = await createLevelRaw(source, zoom, maxZoom);
    const columns = Math.ceil(level.width / tileSize);
    const rows = Math.ceil(level.height / tileSize);
    const zoomDir = path.join(tilesRoot, String(zoom));

    for (let x = 0; x < columns; x += 1) {
      await fs.mkdir(path.join(zoomDir, String(x)), { recursive: true });

      for (let y = 0; y < rows; y += 1) {
        const tile = extractTile(level, x, y);
        await writeTile(tile, path.join(zoomDir, String(x), `${y}.png`));
        tileCount += 1;
      }
    }

    console.log(`zoom ${zoom}: ${level.width}x${level.height}, ${columns * rows} tiles`);
  }

  await fs.writeFile(
    metadataPath,
    `${JSON.stringify(
      {
        height: source.height,
        maxZoom,
        minZoom: 0,
        tileSize,
        tilesPath: "/map/zone/tiles",
        width: source.width,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`metadata: ${metadataPath}`);
  console.log(`total tiles: ${tileCount}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
