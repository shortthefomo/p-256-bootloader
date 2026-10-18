// QR codes for sign requests. Byte mode, error correction M, versions 1–20.
// Enough for a wallet URL. No third-party encoder or decoder.

const ALIGN = [
  [],
  [6, 18],
  [6, 22],
  [6, 26],
  [6, 30],
  [6, 34],
  [6, 22, 38],
  [6, 24, 42],
  [6, 26, 46],
  [6, 28, 50],
  [6, 30, 54],
  [6, 32, 58],
  [6, 34, 62],
  [6, 26, 46, 66],
  [6, 26, 48, 70],
  [6, 26, 50, 74],
  [6, 30, 54, 78],
  [6, 30, 56, 82],
  [6, 30, 58, 86],
  [6, 34, 62, 90],
];

// Error correction M. Groups are count, codewords in the block, data codewords.
const RS_M = [
  [1, 26, 16],
  [1, 44, 28],
  [1, 70, 44],
  [2, 50, 32],
  [2, 67, 43],
  [4, 43, 27],
  [4, 49, 31],
  [2, 60, 38, 2, 61, 39],
  [3, 58, 36, 2, 59, 37],
  [4, 69, 43, 1, 70, 44],
  [1, 80, 50, 4, 81, 51],
  [6, 58, 36, 2, 59, 37],
  [8, 59, 37, 1, 60, 38],
  [4, 64, 40, 5, 65, 41],
  [5, 65, 41, 5, 66, 42],
  [7, 73, 45, 3, 74, 46],
  [10, 74, 46, 1, 75, 47],
  [9, 69, 43, 4, 70, 44],
  [3, 70, 44, 11, 71, 45],
  [3, 67, 41, 13, 68, 42],
];

const G15 = 0x0537;
const G18 = 0x1f25;
const FORMAT_MASK = 0x5412;
const PAD0 = 0xec;
const PAD1 = 0x11;

const EXP = new Uint8Array(512);
const LOG = new Uint8Array(256);
(() => {
  let x = 1;
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= 0x11d;
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255];
})();

function mul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP[LOG[a] + LOG[b]];
}

function div(a, b) {
  if (b === 0) throw new Error("qr field divide by zero");
  if (a === 0) return 0;
  return EXP[(LOG[a] + 255 - LOG[b]) % 255];
}

function bch(data, generator, shift) {
  let value = data << shift;
  const limit = 1 << shift;
  while (value >= limit) {
    const degree = 32 - Math.clz32(value);
    const genDegree = 32 - Math.clz32(generator);
    value ^= generator << (degree - genDegree);
  }
  return (data << shift) | value;
}

function rsBlocks(version) {
  const row = RS_M[version - 1];
  const blocks = [];
  for (let i = 0; i < row.length; i += 3) {
    for (let n = 0; n < row[i]; n += 1) blocks.push({ total: row[i + 1], data: row[i + 2] });
  }
  return blocks;
}

function dataCapacity(version) {
  return rsBlocks(version).reduce((sum, block) => sum + block.data, 0);
}

function generator(length) {
  let poly = [1];
  for (let i = 0; i < length; i += 1) {
    const next = new Array(poly.length + 1).fill(0);
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j];
      next[j + 1] ^= mul(poly[j], EXP[i]);
    }
    poly = next;
  }
  return poly;
}

const GENERATORS = new Map();
function eccPoly(length) {
  let poly = GENERATORS.get(length);
  if (!poly) {
    poly = generator(length);
    GENERATORS.set(length, poly);
  }
  return poly;
}

function remainder(data, gen) {
  const msg = data.concat(new Array(gen.length - 1).fill(0));
  for (let i = 0; i < data.length; i += 1) {
    const lead = msg[i];
    if (lead === 0) continue;
    for (let j = 1; j < gen.length; j += 1) msg[i + j] ^= mul(gen[j], lead);
  }
  return msg.slice(data.length);
}

function interleave(bytes, blocks) {
  const dataParts = [];
  const eccParts = [];
  let offset = 0;
  let maxData = 0;
  let maxEcc = 0;
  for (const block of blocks) {
    const chunk = bytes.slice(offset, offset + block.data);
    offset += block.data;
    const ecc = remainder(chunk, eccPoly(block.total - block.data));
    dataParts.push(chunk);
    eccParts.push(ecc);
    maxData = Math.max(maxData, chunk.length);
    maxEcc = Math.max(maxEcc, ecc.length);
  }
  const out = [];
  for (let i = 0; i < maxData; i += 1) {
    for (const part of dataParts) if (i < part.length) out.push(part[i]);
  }
  for (let i = 0; i < maxEcc; i += 1) {
    for (const part of eccParts) if (i < part.length) out.push(part[i]);
  }
  return out;
}

function countBits(version) {
  return version < 10 ? 8 : 16;
}

function payloadBytes(text) {
  const bytes = new TextEncoder().encode(text);
  if (bytes.length > 600) throw new Error("this sign request is too large for a QR code");
  return bytes;
}

function chooseVersion(length) {
  for (let version = 1; version <= RS_M.length; version += 1) {
    const bits = 4 + countBits(version) + length * 8;
    if (bits <= dataCapacity(version) * 8) return version;
  }
  throw new Error("this sign request is too large for a QR code");
}

function pack(bytes, version) {
  const blocks = rsBlocks(version);
  const capacity = blocks.reduce((sum, block) => sum + block.data, 0);
  const bits = [];
  const put = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1);
  };
  put(0b0100, 4);
  put(bytes.length, countBits(version));
  for (const byte of bytes) put(byte, 8);
  const maxBits = capacity * 8;
  const terminator = Math.min(4, maxBits - bits.length);
  for (let i = 0; i < terminator; i += 1) bits.push(0);
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0;
    for (let b = 0; b < 8; b += 1) byte = (byte << 1) | bits[i + b];
    data.push(byte);
  }
  let pad = 0;
  while (data.length < capacity) {
    data.push(pad % 2 === 0 ? PAD0 : PAD1);
    pad += 1;
  }
  return interleave(data, blocks);
}

function maskOf(pattern, row, col) {
  switch (pattern) {
    case 0: return ((row + col) & 1) === 0;
    case 1: return (row & 1) === 0;
    case 2: return col % 3 === 0;
    case 3: return (row + col) % 3 === 0;
    case 4: return ((row >> 1) + Math.floor(col / 3)) % 2 === 0;
    case 5: return ((row * col) % 2) + ((row * col) % 3) === 0;
    case 6: return (((row * col) % 2) + ((row * col) % 3)) % 2 === 0;
    default: return (((row * col) % 3) + ((row + col) & 1)) % 2 === 0;
  }
}

function blank(size) {
  return {
    dark: new Uint8Array(size * size),
    taken: new Uint8Array(size * size),
    size,
  };
}

function set(grid, row, col, dark) {
  if (row < 0 || col < 0 || row >= grid.size || col >= grid.size) return;
  const index = row * grid.size + col;
  grid.dark[index] = dark ? 1 : 0;
  grid.taken[index] = 1;
}

function finder(grid, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const on = (r >= 0 && r <= 6 && (c === 0 || c === 6))
        || (c >= 0 && c <= 6 && (r === 0 || r === 6))
        || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
      set(grid, row + r, col + c, on);
    }
  }
}

function align(grid, version) {
  const pos = ALIGN[version - 1];
  for (const row of pos) {
    for (const col of pos) {
      if (grid.taken[row * grid.size + col]) continue;
      for (let r = -2; r <= 2; r += 1) {
        for (let c = -2; c <= 2; c += 1) {
          const on = r === -2 || r === 2 || c === -2 || c === 2 || (r === 0 && c === 0);
          set(grid, row + r, col + c, on);
        }
      }
    }
  }
}

function timing(grid) {
  for (let i = 8; i < grid.size - 8; i += 1) {
    if (!grid.taken[i * grid.size + 6]) set(grid, i, 6, (i & 1) === 0);
    if (!grid.taken[6 * grid.size + i]) set(grid, 6, i, (i & 1) === 0);
  }
}

function formatBits(mask) {
  return bch(mask, G15, 10) ^ FORMAT_MASK;
}

function versionBits(version) {
  return bch(version, G18, 12);
}

function paintFormat(grid, mask, reserve) {
  const bits = reserve ? 0 : formatBits(mask);
  for (let i = 0; i < 15; i += 1) {
    const on = !reserve && ((bits >>> i) & 1) === 1;
    const row = i < 6 ? i : i < 8 ? i + 1 : grid.size - 15 + i;
    set(grid, row, 8, on);
    const col = i < 8 ? grid.size - 1 - i : i === 8 ? 7 : 14 - i;
    set(grid, 8, col, on);
  }
  set(grid, grid.size - 8, 8, !reserve);
}

function paintVersion(grid, version, reserve) {
  if (version < 7) return;
  const bits = reserve ? 0 : versionBits(version);
  for (let i = 0; i < 18; i += 1) {
    const on = !reserve && ((bits >>> i) & 1) === 1;
    set(grid, Math.floor(i / 3), (i % 3) + grid.size - 11, on);
    set(grid, (i % 3) + grid.size - 11, Math.floor(i / 3), on);
  }
}

function paintData(grid, codewords, mask) {
  let row = grid.size - 1;
  let col = grid.size - 1;
  let dir = -1;
  let index = 0;
  let bit = 7;
  while (col > 0) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        const x = col - c;
        const at = row * grid.size + x;
        if (grid.taken[at]) continue;
        let dark = false;
        if (index < codewords.length) dark = ((codewords[index] >>> bit) & 1) === 1;
        if (maskOf(mask, row, x)) dark = !dark;
        grid.dark[at] = dark ? 1 : 0;
        grid.taken[at] = 1;
        bit -= 1;
        if (bit < 0) {
          index += 1;
          bit = 7;
        }
      }
      row += dir;
      if (row < 0 || row >= grid.size) {
        row -= dir;
        dir = -dir;
        break;
      }
    }
    col -= 2;
  }
}

function penalty(grid) {
  const { size, dark } = grid;
  const at = (row, col) => dark[row * size + col] === 1;
  let score = 0;
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      let same = 0;
      const on = at(row, col);
      for (let r = -1; r <= 1; r += 1) {
        for (let c = -1; c <= 1; c += 1) {
          if ((r === 0 && c === 0) || row + r < 0 || col + c < 0 || row + r >= size || col + c >= size) continue;
          if (at(row + r, col + c) === on) same += 1;
        }
      }
      if (same > 5) score += 3 + same - 5;
    }
  }
  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const count = at(row, col) + at(row + 1, col) + at(row, col + 1) + at(row + 1, col + 1);
      if (count === 0 || count === 4) score += 3;
    }
  }
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size - 6; col += 1) {
      if (at(row, col) && !at(row, col + 1) && at(row, col + 2) && at(row, col + 3) && at(row, col + 4) && !at(row, col + 5) && at(row, col + 6)) {
        score += 40;
      }
    }
  }
  for (let col = 0; col < size; col += 1) {
    for (let row = 0; row < size - 6; row += 1) {
      if (at(row, col) && !at(row + 1, col) && at(row + 2, col) && at(row + 3, col) && at(row + 4, col) && !at(row + 5, col) && at(row + 6, col)) {
        score += 40;
      }
    }
  }
  let darkCount = 0;
  for (const bit of dark) darkCount += bit;
  score += (Math.abs((100 * darkCount) / size / size - 50) / 5) * 10;
  return score;
}

function build(version, codewords, mask, reserve) {
  const grid = blank(version * 4 + 17);
  finder(grid, 0, 0);
  finder(grid, 0, grid.size - 7);
  finder(grid, grid.size - 7, 0);
  align(grid, version);
  timing(grid);
  paintFormat(grid, mask, reserve);
  paintVersion(grid, version, reserve);
  paintData(grid, codewords, mask);
  return grid;
}

export function encodeQr(text) {
  const bytes = payloadBytes(text);
  const version = chooseVersion(bytes.length);
  const codewords = pack(bytes, version);
  let bestMask = 0;
  let bestScore = Infinity;
  for (let mask = 0; mask < 8; mask += 1) {
    const score = penalty(build(version, codewords, mask, true));
    if (score < bestScore) {
      bestScore = score;
      bestMask = mask;
    }
  }
  const grid = build(version, codewords, bestMask, false);
  return { version, size: grid.size, mask: bestMask, modules: grid.dark };
}

function hamming(a, b, bits) {
  let diff = a ^ b;
  let count = 0;
  for (let i = 0; i < bits; i += 1) {
    count += diff & 1;
    diff >>>= 1;
  }
  return count;
}

function readFormat(modules, size) {
  let vertical = 0;
  let horizontal = 0;
  for (let i = 0; i < 15; i += 1) {
    const row = i < 6 ? i : i < 8 ? i + 1 : size - 15 + i;
    if (modules[row * size + 8]) vertical |= 1 << i;
    const col = i < 8 ? size - 1 - i : i === 8 ? 7 : 14 - i;
    if (modules[8 * size + col]) horizontal |= 1 << i;
  }
  let best = null;
  let bestDist = 4;
  for (const bits of [vertical, horizontal]) {
    for (let mask = 0; mask < 8; mask += 1) {
      const expect = formatBits(mask);
      const dist = hamming(bits, expect, 15);
      if (dist < bestDist) {
        bestDist = dist;
        best = mask;
      }
    }
  }
  return best;
}

function readCodewords(modules, size, mask) {
  const out = [];
  let row = size - 1;
  let col = size - 1;
  let dir = -1;
  let byte = 0;
  let bit = 0;
  const taken = functionModules(size);
  while (col > 0) {
    if (col === 6) col -= 1;
    for (;;) {
      for (let c = 0; c < 2; c += 1) {
        const x = col - c;
        if (taken[row * size + x]) continue;
        let dark = modules[row * size + x] === 1;
        if (maskOf(mask, row, x)) dark = !dark;
        byte = (byte << 1) | (dark ? 1 : 0);
        bit += 1;
        if (bit === 8) {
          out.push(byte);
          byte = 0;
          bit = 0;
        }
      }
      row += dir;
      if (row < 0 || row >= size) {
        row -= dir;
        dir = -dir;
        break;
      }
    }
    col -= 2;
  }
  return out;
}

function functionModules(size) {
  const version = (size - 17) / 4;
  const grid = blank(size);
  finder(grid, 0, 0);
  finder(grid, 0, size - 7);
  finder(grid, size - 7, 0);
  align(grid, version);
  timing(grid);
  paintFormat(grid, 0, true);
  paintVersion(grid, version, true);
  return grid.taken;
}

function horner(bytes, x) {
  let y = 0;
  for (const byte of bytes) y = mul(y, x) ^ byte;
  return y;
}

function evalLow(coeffs, x) {
  let y = 0;
  let power = 1;
  for (const coeff of coeffs) {
    y ^= mul(coeff, power);
    power = mul(power, x);
  }
  return y;
}

function berlekamp(syndrome) {
  let locator = [1];
  let previous = [1];
  let length = 0;
  let shift = 1;
  let scale = 1;
  for (let i = 0; i < syndrome.length; i += 1) {
    let delta = syndrome[i];
    for (let j = 1; j <= length; j += 1) delta ^= mul(locator[j] || 0, syndrome[i - j]);
    if (delta === 0) {
      shift += 1;
      continue;
    }
    const next = locator.slice();
    const coef = div(delta, scale);
    while (locator.length < previous.length + shift) locator.push(0);
    for (let j = 0; j < previous.length; j += 1) locator[j + shift] ^= mul(coef, previous[j]);
    if (2 * length <= i) {
      length = i + 1 - length;
      previous = next;
      scale = delta;
      shift = 1;
    } else {
      shift += 1;
    }
  }
  return { locator, length };
}

function rsCorrect(codeword, eccLen) {
  const syndrome = [];
  for (let i = 0; i < eccLen; i += 1) syndrome.push(horner(codeword, EXP[i]));
  if (syndrome.every((value) => value === 0)) return codeword.slice(0, codeword.length - eccLen);
  const found = berlekamp(syndrome);
  const locator = found.locator;
  while (locator.length > 1 && locator[locator.length - 1] === 0) locator.pop();
  const length = locator.length - 1;
  if (length === 0 || length > eccLen / 2 || length !== found.length) return null;
  const where = [];
  for (let i = 0; i < codeword.length; i += 1) {
    const power = (codeword.length - 1 - i) % 255;
    const root = power === 0 ? 1 : EXP[255 - power];
    if (evalLow(locator, root) === 0) where.push(i);
  }
  if (where.length !== length) return null;
  const omega = new Array(eccLen).fill(0);
  for (let i = 0; i < eccLen; i += 1) {
    let sum = 0;
    for (let j = 0; j < locator.length && j <= i; j += 1) sum ^= mul(locator[j], syndrome[i - j]);
    omega[i] = sum;
  }
  const fixed = codeword.slice();
  for (const index of where) {
    const power = (codeword.length - 1 - index) % 255;
    const xInv = power === 0 ? 1 : EXP[255 - power];
    let deriv = 0;
    for (let j = 1; j < locator.length; j += 2) {
      deriv ^= mul(locator[j], EXP[((j - 1) * (255 - power)) % 255]);
    }
    if (deriv === 0) return null;
    fixed[index] ^= div(evalLow(omega, xInv), mul(deriv, xInv));
  }
  for (let i = 0; i < eccLen; i += 1) {
    if (horner(fixed, EXP[i]) !== 0) return null;
  }
  return fixed.slice(0, fixed.length - eccLen);
}

function deinterleave(codewords, blocks) {
  const data = blocks.map((block) => new Array(block.data));
  const ecc = blocks.map((block) => new Array(block.total - block.data));
  let index = 0;
  const maxData = Math.max(...blocks.map((block) => block.data));
  const maxEcc = Math.max(...ecc.map((part) => part.length));
  for (let i = 0; i < maxData; i += 1) {
    for (let b = 0; b < blocks.length; b += 1) {
      if (i < data[b].length) data[b][i] = codewords[index++];
    }
  }
  for (let i = 0; i < maxEcc; i += 1) {
    for (let b = 0; b < blocks.length; b += 1) {
      if (i < ecc[b].length) ecc[b][i] = codewords[index++];
    }
  }
  const bytes = [];
  for (let b = 0; b < blocks.length; b += 1) {
    const corrected = rsCorrect(data[b].concat(ecc[b]), ecc[b].length);
    if (!corrected) return null;
    bytes.push(...corrected);
  }
  return bytes;
}

function readPayload(bytes, version) {
  let cursor = 0;
  const take = (length) => {
    let value = 0;
    for (let i = 0; i < length; i += 1) {
      const bit = (bytes[cursor >> 3] >> (7 - (cursor & 7))) & 1;
      value = (value << 1) | bit;
      cursor += 1;
    }
    return value;
  };
  if (bytes.length * 8 < 4) return "";
  const mode = take(4);
  if (mode === 0) return "";
  if (mode !== 0b0100) return "";
  const count = take(countBits(version));
  if (count > 600 || cursor + count * 8 > bytes.length * 8) return "";
  const raw = new Uint8Array(count);
  for (let i = 0; i < count; i += 1) raw[i] = take(8);
  return new TextDecoder().decode(raw);
}

export function decodeQr(modules, size) {
  if ((size - 17) % 4 !== 0) return "";
  const version = (size - 17) / 4;
  if (version < 1 || version > RS_M.length) return "";
  const mask = readFormat(modules, size);
  if (mask == null) return "";
  const blocks = rsBlocks(version);
  const needed = blocks.reduce((sum, block) => sum + block.total, 0);
  const codewords = readCodewords(modules, size, mask);
  if (codewords.length < needed) return "";
  const data = deinterleave(codewords.slice(0, needed), blocks);
  if (!data) return "";
  return readPayload(data, version);
}

function pixel(bin, width, height, x, y) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= width || iy >= height) return 0;
  return bin[iy * width + ix];
}

function sampleModule(map, bin, width, height, col, row) {
  let dark = 0;
  for (const [dx, dy] of [[0, 0], [0.18, 0], [-0.18, 0], [0, 0.18], [0, -0.18]]) {
    const point = map(col + 0.5 + dx, row + 0.5 + dy);
    dark += pixel(bin, width, height, point.x, point.y);
  }
  return dark >= 3 ? 1 : 0;
}

function homography(src, dst) {
  const a = [];
  const b = [];
  for (let i = 0; i < 4; i += 1) {
    const s = src[i];
    const d = dst[i];
    a.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    a.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }
  const h = solve(a, b);
  if (!h) return null;
  return (x, y) => {
    const w = h[6] * x + h[7] * y + 1;
    return { x: (h[0] * x + h[1] * y + h[2]) / w, y: (h[3] * x + h[4] * y + h[5]) / w };
  };
}

function solve(matrix, values) {
  const n = values.length;
  const m = matrix.map((row, i) => row.concat(values[i]));
  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(m[row][col]) > Math.abs(m[pivot][col])) pivot = row;
    }
    if (Math.abs(m[pivot][col]) < 1e-9) return null;
    [m[col], m[pivot]] = [m[pivot], m[col]];
    const scale = m[col][col];
    for (let k = col; k <= n; k += 1) m[col][k] /= scale;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = m[row][col];
      for (let k = col; k <= n; k += 1) m[row][k] -= factor * m[col][k];
    }
  }
  return m.map((row) => row[n]);
}

function binarize(rgba, width, height) {
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i += 1) {
    gray[i] = (rgba[i * 4] * 54 + rgba[i * 4 + 1] * 183 + rgba[i * 4 + 2] * 19) >> 8;
  }
  const integral = new Uint32Array((width + 1) * (height + 1));
  for (let y = 0; y < height; y += 1) {
    let row = 0;
    for (let x = 0; x < width; x += 1) {
      row += gray[y * width + x];
      integral[(y + 1) * (width + 1) + (x + 1)] = integral[y * (width + 1) + (x + 1)] + row;
    }
  }
  const win = Math.max(8, (Math.min(width, height) / 8) | 0);
  const radius = win >> 1;
  const bin = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const area = (y1 - y0 + 1) * (x1 - x0 + 1);
      const sum = integral[(y1 + 1) * (width + 1) + (x1 + 1)]
        - integral[y0 * (width + 1) + (x1 + 1)]
        - integral[(y1 + 1) * (width + 1) + x0]
        + integral[y0 * (width + 1) + x0];
      bin[y * width + x] = gray[y * width + x] * area * 4 < sum * 3 ? 1 : 0;
    }
  }
  return bin;
}

function downscale(rgba, width, height, maxEdge) {
  const edge = Math.max(width, height);
  if (edge <= maxEdge) return { rgba, width, height };
  const scale = maxEdge / edge;
  const w = Math.max(21, Math.round(width * scale));
  const h = Math.max(21, Math.round(height * scale));
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const sy = Math.min(height - 1, Math.floor(y / scale));
    for (let x = 0; x < w; x += 1) {
      const sx = Math.min(width - 1, Math.floor(x / scale));
      const from = (sy * width + sx) * 4;
      const to = (y * w + x) * 4;
      out[to] = rgba[from];
      out[to + 1] = rgba[from + 1];
      out[to + 2] = rgba[from + 2];
      out[to + 3] = 255;
    }
  }
  return { rgba: out, width: w, height: h };
}

function ratioOk(lengths, darkFirst) {
  if (!darkFirst) return false;
  const total = lengths.reduce((sum, n) => sum + n, 0);
  if (total < 7) return false;
  const module = total / 7;
  const tol = module * 0.7;
  return Math.abs(lengths[0] - module) <= tol
    && Math.abs(lengths[1] - module) <= tol
    && Math.abs(lengths[2] - module * 3) <= tol
    && Math.abs(lengths[3] - module) <= tol
    && Math.abs(lengths[4] - module) <= tol;
}

function crossCenter(bin, width, height, x, y) {
  if (x < 0 || y < 0 || x >= width || y >= height || bin[y * width + x] !== 1) return null;
  const at = (yy) => yy >= 0 && yy < height && bin[yy * width + x] === 1;
  let top = y;
  while (top > 0 && at(top - 1)) top -= 1;
  let bottom = y;
  while (bottom + 1 < height && at(bottom + 1)) bottom += 1;
  const run = (from, dark, dir) => {
    let n = 0;
    let cursor = from;
    while (cursor >= 0 && cursor < height && at(cursor) === dark && n <= height) {
      n += 1;
      cursor += dir;
    }
    return { n, cursor };
  };
  const whiteUp = run(top - 1, false, -1);
  const blackUp = run(whiteUp.cursor, true, -1);
  const whiteDown = run(bottom + 1, false, 1);
  const blackDown = run(whiteDown.cursor, true, 1);
  const lengths = [blackUp.n, whiteUp.n, bottom - top + 1, whiteDown.n, blackDown.n];
  if (!ratioOk(lengths, true)) return null;
  return { y: top + (lengths[2] - 1) / 2, module: lengths.reduce((sum, n) => sum + n, 0) / 7 };
}

function findFinders(bin, width, height) {
  const found = [];
  for (let y = 0; y < height; y += 1) {
    const runs = [];
    let color = bin[y * width];
    let length = 0;
    let start = 0;
    const consider = () => {
      runs.push({ color, length, start });
      if (runs.length > 5) runs.shift();
      if (runs.length < 5 || runs[0].color !== 1) return;
      const lengths = runs.map((run) => run.length);
      if (!ratioOk(lengths, true)) return;
      const total = lengths.reduce((sum, n) => sum + n, 0);
      const cx = runs[0].start + total / 2;
      const hit = crossCenter(bin, width, height, Math.round(cx), y);
      if (!hit) return;
      found.push({ x: cx, y: hit.y, module: (total / 7 + hit.module) / 2 });
    };
    for (let x = 0; x < width; x += 1) {
      const on = bin[y * width + x];
      if (on === color) length += 1;
      else {
        consider();
        color = on;
        length = 1;
        start = x;
      }
    }
    consider();
  }
  const clusters = [];
  for (const point of found) {
    const cluster = clusters.find((item) => Math.hypot(item.x - point.x, item.y - point.y) < point.module * 2);
    if (!cluster) clusters.push({ ...point, n: 1 });
    else {
      cluster.x = (cluster.x * cluster.n + point.x) / (cluster.n + 1);
      cluster.y = (cluster.y * cluster.n + point.y) / (cluster.n + 1);
      cluster.module = (cluster.module * cluster.n + point.module) / (cluster.n + 1);
      cluster.n += 1;
    }
  }
  return clusters.filter((item) => item.n >= 2).sort((a, b) => b.n - a.n).slice(0, 8);
}

function orderFinders(points) {
  let best = null;
  let bestScore = Infinity;
  for (let i = 0; i < points.length; i += 1) {
    for (let j = i + 1; j < points.length; j += 1) {
      for (let k = j + 1; k < points.length; k += 1) {
        const trio = [points[i], points[j], points[k]];
        const ordered = orderTrio(trio);
        if (!ordered) continue;
        if (ordered.score < bestScore) {
          bestScore = ordered.score;
          best = ordered;
        }
      }
    }
  }
  return best && bestScore < 0.35 ? best : null;
}

function orderTrio(points) {
  const [a, b, c] = points;
  const ab = Math.hypot(a.x - b.x, a.y - b.y);
  const ac = Math.hypot(a.x - c.x, a.y - c.y);
  const bc = Math.hypot(b.x - c.x, b.y - c.y);
  let tl;
  let p;
  let q;
  if (ab >= ac && ab >= bc) { tl = c; p = a; q = b; }
  else if (ac >= ab && ac >= bc) { tl = b; p = a; q = c; }
  else { tl = a; p = b; q = c; }
  const v1 = { x: p.x - tl.x, y: p.y - tl.y };
  const v2 = { x: q.x - tl.x, y: q.y - tl.y };
  const cross = v1.x * v2.y - v1.y * v2.x;
  if (Math.abs(cross) < 1) return null;
  const tr = cross > 0 ? p : q;
  const bl = cross > 0 ? q : p;
  const d1 = Math.hypot(tr.x - tl.x, tr.y - tl.y);
  const d2 = Math.hypot(bl.x - tl.x, bl.y - tl.y);
  const modules = [tl.module, tr.module, bl.module];
  const mean = (modules[0] + modules[1] + modules[2]) / 3;
  if (mean < 1) return null;
  const moduleSpread = Math.max(...modules.map((value) => Math.abs(value - mean))) / mean;
  const sideSpread = Math.abs(d1 - d2) / Math.max(d1, d2);
  const dot = ((tr.x - tl.x) * (bl.x - tl.x) + (tr.y - tl.y) * (bl.y - tl.y)) / (d1 * d2);
  return { tl, tr, bl, score: moduleSpread + sideSpread + Math.abs(dot) };
}

function alignmentAt(bin, width, height, x, y, module) {
  if (pixel(bin, width, height, x, y) !== 1) return null;
  const arm = Math.max(2, module * 2.4);
  const run = (dirX, dirY) => {
    let n = 0;
    let cx = x;
    let cy = y;
    const on = pixel(bin, width, height, x, y) === 1;
    while (n < arm && pixel(bin, width, height, cx, cy) === (on ? 1 : 0)) {
      n += 1;
      cx += dirX;
      cy += dirY;
    }
    return n;
  };
  const left = run(-1, 0);
  const right = run(1, 0);
  const up = run(0, -1);
  const down = run(0, 1);
  const horizontal = left + right - 1;
  if (horizontal < module * 0.4 || horizontal > module * 1.8) return null;
  if (Math.abs(up + down - 1 - horizontal) > module * 0.8) return null;
  return { x, y, module: horizontal };
}

function findAlignment(bin, width, height, expect, module) {
  const radius = Math.max(2, Math.round(module * 4));
  let best = null;
  let bestDist = Infinity;
  for (let y = Math.round(expect.y) - radius; y <= Math.round(expect.y) + radius; y += 1) {
    for (let x = Math.round(expect.x) - radius; x <= Math.round(expect.x) + radius; x += 1) {
      const hit = alignmentAt(bin, width, height, x, y, module);
      if (!hit) continue;
      const dist = Math.hypot(x - expect.x, y - expect.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = hit;
      }
    }
  }
  return best;
}

function tryGrid(bin, width, height, finders, version) {
  const size = version * 4 + 17;
  const srcFinder = [
    { x: 3.5, y: 3.5 },
    { x: size - 3.5, y: 3.5 },
    { x: 3.5, y: size - 3.5 },
  ];
  const dstFinder = [finders.tl, finders.tr, finders.bl];
  const module = (finders.tl.module + finders.tr.module + finders.bl.module) / 3;
  const fourth = {
    x: finders.tr.x + (finders.bl.x - finders.tl.x),
    y: finders.tr.y + (finders.bl.y - finders.tl.y),
  };
  const maps = [];
  const affine = homography(srcFinder.concat([{ x: size - 3.5, y: size - 3.5 }]), dstFinder.concat([fourth]));
  if (affine) maps.push(affine);
  const pos = ALIGN[version - 1];
  if (pos.length && affine) {
    const ax = pos[pos.length - 1];
    const expected = affine(ax, ax);
    const hit = findAlignment(bin, width, height, expected, module);
    if (hit) {
      const perspective = homography(srcFinder.concat([{ x: ax, y: ax }]), dstFinder.concat([hit]));
      if (perspective) maps.push(perspective);
    }
  }
  for (const map of maps) {
    const modules = new Uint8Array(size * size);
    for (let row = 0; row < size; row += 1) {
      for (let col = 0; col < size; col += 1) modules[row * size + col] = sampleModule(map, bin, width, height, col, row);
    }
    const text = decodeQr(modules, size);
    if (text) return text;
  }
  return "";
}

function scanBinary(bin, width, height) {
  const points = findFinders(bin, width, height);
  const ordered = orderFinders(points);
  if (!ordered) return "";
  const module = (ordered.tl.module + ordered.tr.module + ordered.bl.module) / 3;
  const span = (Math.hypot(ordered.tr.x - ordered.tl.x, ordered.tr.y - ordered.tl.y)
    + Math.hypot(ordered.bl.x - ordered.tl.x, ordered.bl.y - ordered.tl.y)) / 2;
  const guess = Math.round((span / module + 7 - 17) / 4);
  for (const version of [guess, guess - 1, guess + 1]) {
    if (version < 1 || version > RS_M.length) continue;
    const text = tryGrid(bin, width, height, ordered, version);
    if (text) return text;
  }
  return "";
}

export function decodeImage(rgba, width, height) {
  if (!rgba || width < 21 || height < 21) return "";
  const scaled = downscale(rgba, width, height, 520);
  try {
    const bin = binarize(scaled.rgba, scaled.width, scaled.height);
    return scanBinary(bin, scaled.width, scaled.height);
  } catch {
    return "";
  }
}

export function rasterQr(text, scale = 4, quiet = 4) {
  const qr = encodeQr(text);
  const size = (qr.size + quiet * 2) * scale;
  const rgba = new Uint8ClampedArray(size * size * 4);
  rgba.fill(255);
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  for (let row = 0; row < qr.size; row += 1) {
    for (let col = 0; col < qr.size; col += 1) {
      if (!qr.modules[row * qr.size + col]) continue;
      for (let dy = 0; dy < scale; dy += 1) {
        for (let dx = 0; dx < scale; dx += 1) {
          const x = (col + quiet) * scale + dx;
          const y = (row + quiet) * scale + dy;
          const index = (y * size + x) * 4;
          rgba[index] = 17;
          rgba[index + 1] = 17;
          rgba[index + 2] = 17;
        }
      }
    }
  }
  return { rgba, width: size, height: size };
}
