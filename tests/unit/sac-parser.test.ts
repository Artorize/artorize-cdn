/**
 * Unit tests for SAC v1 Parser
 */

import { describe, test, expect } from '@jest/globals';

interface SACData {
  a: Int16Array;
  b: Int16Array;
  width: number;
  height: number;
  flags: number;
}

function parseSAC(buffer: ArrayBuffer): SACData {
  const dv = new DataView(buffer);

  const m0 = String.fromCharCode(dv.getUint8(0), dv.getUint8(1), dv.getUint8(2), dv.getUint8(3));
  if (m0 !== 'SAC1') throw new Error('Bad magic');

  const flags = dv.getUint8(4);
  const dtype = dv.getUint8(5);
  const arraysCount = dv.getUint8(6);

  if (dtype !== 1) throw new Error('Unsupported data type');

  const lengthA = dv.getUint32(8, true);
  const lengthB = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const height = dv.getUint32(20, true);

  // SAC v1.1: FLAG_SINGLE_ARRAY (bit 0) indicates B = A (grayscale mask)
  const FLAG_SINGLE_ARRAY = 0x01;
  const isSingleArray = (flags & FLAG_SINGLE_ARRAY) !== 0;

  const offA = 24;
  let a: Int16Array;
  let b: Int16Array;

  if (isSingleArray) {
    // v1.1 single-array mode
    if (arraysCount !== 1) throw new Error('arraysCount must be 1 for SINGLE_ARRAY mode');
    const expectedSize = 24 + lengthA * 2;
    if (buffer.byteLength !== expectedSize) throw new Error('Length mismatch');

    a = new Int16Array(buffer, offA, lengthA);
    b = a; // B references same data as A
  } else {
    // v1.0 dual-array mode
    if (arraysCount !== 2) throw new Error('arraysCount must be 2 for dual-array mode');
    const offB = offA + lengthA * 2;
    const expectedSize = offB + lengthB * 2;
    if (buffer.byteLength !== expectedSize) throw new Error('Length mismatch');

    a = new Int16Array(buffer, offA, lengthA);
    b = new Int16Array(buffer, offB, lengthB);
  }

  if (width && height) {
    if (lengthA !== width * height) throw new Error('Shape mismatch for array A');
    if (!isSingleArray && lengthB !== width * height) throw new Error('Shape mismatch for array B');
  }

  return { a, b, width, height, flags };
}

// Build SAC v1.0 (dual-array mode)
function buildSAC(a: Int16Array, b: Int16Array, width: number, height: number): ArrayBuffer {
  const lengthA = a.length;
  const lengthB = b.length;

  const header = new ArrayBuffer(24);
  const dv = new DataView(header);

  dv.setUint8(0, 'S'.charCodeAt(0));
  dv.setUint8(1, 'A'.charCodeAt(0));
  dv.setUint8(2, 'C'.charCodeAt(0));
  dv.setUint8(3, '1'.charCodeAt(0));
  dv.setUint8(4, 0);  // flags = 0
  dv.setUint8(5, 1);  // dtype = int16
  dv.setUint8(6, 2);  // arrays_count = 2
  dv.setUint8(7, 0);
  dv.setUint32(8, lengthA, true);
  dv.setUint32(12, lengthB, true);
  dv.setUint32(16, width, true);
  dv.setUint32(20, height, true);

  const total = new Uint8Array(24 + lengthA * 2 + lengthB * 2);
  total.set(new Uint8Array(header), 0);
  total.set(new Uint8Array(a.buffer), 24);
  total.set(new Uint8Array(b.buffer), 24 + lengthA * 2);

  return total.buffer;
}

// Build SAC v1.1 (single-array mode for grayscale masks)
function buildSAC_v11(a: Int16Array, width: number, height: number): ArrayBuffer {
  const lengthA = a.length;

  const header = new ArrayBuffer(24);
  const dv = new DataView(header);

  dv.setUint8(0, 'S'.charCodeAt(0));
  dv.setUint8(1, 'A'.charCodeAt(0));
  dv.setUint8(2, 'C'.charCodeAt(0));
  dv.setUint8(3, '1'.charCodeAt(0));
  dv.setUint8(4, 0x01);  // flags = FLAG_SINGLE_ARRAY
  dv.setUint8(5, 1);     // dtype = int16
  dv.setUint8(6, 1);     // arrays_count = 1
  dv.setUint8(7, 0);
  dv.setUint32(8, lengthA, true);
  dv.setUint32(12, lengthA, true);  // lengthB = lengthA
  dv.setUint32(16, width, true);
  dv.setUint32(20, height, true);

  const total = new Uint8Array(24 + lengthA * 2);
  total.set(new Uint8Array(header), 0);
  total.set(new Uint8Array(a.buffer), 24);

  return total.buffer;
}

describe('SAC Parser', () => {
  describe('parseSAC', () => {
    test('should parse valid SAC v1 file', () => {
      const width = 3;
      const height = 2;
      const a = new Int16Array([0, 1, -1, 2, -2, 3]);
      const b = new Int16Array([5, -5, 4, -4, 0, 1]);

      const sac = buildSAC(a, b, width, height);
      const result = parseSAC(sac);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.a.length).toBe(6);
      expect(result.b.length).toBe(6);
      expect(Array.from(result.a)).toEqual([0, 1, -1, 2, -2, 3]);
      expect(Array.from(result.b)).toEqual([5, -5, 4, -4, 0, 1]);
      expect(result.flags).toBe(0);
    });

    test('should reject invalid magic bytes', () => {
      const buffer = new ArrayBuffer(24);
      const dv = new DataView(buffer);
      dv.setUint8(0, 'B'.charCodeAt(0));
      dv.setUint8(1, 'A'.charCodeAt(0));
      dv.setUint8(2, 'D'.charCodeAt(0));
      dv.setUint8(3, '1'.charCodeAt(0));

      expect(() => parseSAC(buffer)).toThrow('Bad magic');
    });

    test('should reject unsupported dtype', () => {
      const buffer = new ArrayBuffer(24);
      const dv = new DataView(buffer);
      dv.setUint8(0, 'S'.charCodeAt(0));
      dv.setUint8(1, 'A'.charCodeAt(0));
      dv.setUint8(2, 'C'.charCodeAt(0));
      dv.setUint8(3, '1'.charCodeAt(0));
      dv.setUint8(5, 2); // Invalid dtype
      dv.setUint8(6, 2);

      expect(() => parseSAC(buffer)).toThrow('Unsupported data type');
    });

    test('should reject incorrect array count for v1.0 (dual-array)', () => {
      const buffer = new ArrayBuffer(48);
      const dv = new DataView(buffer);
      dv.setUint8(0, 'S'.charCodeAt(0));
      dv.setUint8(1, 'A'.charCodeAt(0));
      dv.setUint8(2, 'C'.charCodeAt(0));
      dv.setUint8(3, '1'.charCodeAt(0));
      dv.setUint8(4, 0); // No flags
      dv.setUint8(5, 1);
      dv.setUint8(6, 3); // Invalid array count (should be 2 for dual-array)
      dv.setUint32(8, 3, true);
      dv.setUint32(12, 3, true);

      expect(() => parseSAC(buffer)).toThrow('arraysCount must be 2 for dual-array mode');
    });

    test('should detect length mismatch', () => {
      const buffer = new ArrayBuffer(24);
      const dv = new DataView(buffer);
      dv.setUint8(0, 'S'.charCodeAt(0));
      dv.setUint8(1, 'A'.charCodeAt(0));
      dv.setUint8(2, 'C'.charCodeAt(0));
      dv.setUint8(3, '1'.charCodeAt(0));
      dv.setUint8(5, 1);
      dv.setUint8(6, 2);
      dv.setUint32(8, 10, true); // Claims 10 elements
      dv.setUint32(12, 10, true);

      expect(() => parseSAC(buffer)).toThrow('Length mismatch');
    });

    test('should detect shape mismatch', () => {
      const a = new Int16Array([1, 2, 3]);
      const b = new Int16Array([4, 5, 6]);
      const sac = buildSAC(a, b, 10, 10); // Wrong dimensions

      expect(() => parseSAC(sac)).toThrow('Shape mismatch for array A');
    });

    test('should handle large arrays', () => {
      const width = 1920;
      const height = 1080;
      const size = width * height;
      const a = new Int16Array(size);
      const b = new Int16Array(size);

      // Fill with test pattern
      for (let i = 0; i < size; i++) {
        a[i] = (i % 1000) - 500;
        b[i] = ((i * 2) % 1000) - 500;
      }

      const sac = buildSAC(a, b, width, height);
      const result = parseSAC(sac);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.a.length).toBe(size);
      expect(result.b.length).toBe(size);
      expect(result.a[0]).toBe(-500);
      expect(result.b[size - 1]).toBe((((size - 1) * 2) % 1000) - 500);
    });

    test('should handle edge cases with zeros', () => {
      const a = new Int16Array([0, 0, 0]);
      const b = new Int16Array([0, 0, 0]);
      const sac = buildSAC(a, b, 3, 1);
      const result = parseSAC(sac);

      expect(result.a.length).toBe(3);
      expect(result.b.length).toBe(3);
      expect(Array.from(result.a)).toEqual([0, 0, 0]);
      expect(Array.from(result.b)).toEqual([0, 0, 0]);
    });

    test('should handle maximum int16 values', () => {
      const a = new Int16Array([32767, -32768, 0]);
      const b = new Int16Array([-32768, 32767, 1]);
      const sac = buildSAC(a, b, 3, 1);
      const result = parseSAC(sac);

      expect(result.a[0]).toBe(32767);
      expect(result.a[1]).toBe(-32768);
      expect(result.b[0]).toBe(-32768);
      expect(result.b[1]).toBe(32767);
    });

    test('should parse without width/height when set to 0', () => {
      const a = new Int16Array([1, 2, 3, 4]);
      const b = new Int16Array([5, 6, 7, 8]);
      const sac = buildSAC(a, b, 0, 0); // No dimensions

      const dv = new DataView(sac);
      dv.setUint32(16, 0, true);
      dv.setUint32(20, 0, true);

      const result = parseSAC(sac);

      expect(result.width).toBe(0);
      expect(result.height).toBe(0);
      expect(result.a.length).toBe(4);
      expect(result.b.length).toBe(4);
    });
  });

  describe('buildSAC', () => {
    test('should create valid SAC v1 structure', () => {
      const a = new Int16Array([1, 2, 3]);
      const b = new Int16Array([4, 5, 6]);
      const sac = buildSAC(a, b, 3, 1);

      const dv = new DataView(sac);

      // Check magic
      expect(String.fromCharCode(dv.getUint8(0))).toBe('S');
      expect(String.fromCharCode(dv.getUint8(1))).toBe('A');
      expect(String.fromCharCode(dv.getUint8(2))).toBe('C');
      expect(String.fromCharCode(dv.getUint8(3))).toBe('1');

      // Check header fields
      expect(dv.getUint8(5)).toBe(1); // dtype
      expect(dv.getUint8(6)).toBe(2); // arrays_count
      expect(dv.getUint32(8, true)).toBe(3); // lengthA
      expect(dv.getUint32(12, true)).toBe(3); // lengthB
      expect(dv.getUint32(16, true)).toBe(3); // width
      expect(dv.getUint32(20, true)).toBe(1); // height
    });

    test('should have correct total size', () => {
      const a = new Int16Array([1, 2, 3]);
      const b = new Int16Array([4, 5, 6]);
      const sac = buildSAC(a, b, 3, 1);

      // 24 byte header + 3*2 + 3*2 = 36 bytes
      expect(sac.byteLength).toBe(36);
    });
  });
});

describe('SAC Integration', () => {
  test('should round-trip correctly', () => {
    const width = 10;
    const height = 10;
    const size = width * height;
    const a = new Int16Array(size);
    const b = new Int16Array(size);

    for (let i = 0; i < size; i++) {
      a[i] = i - 50;
      b[i] = 50 - i;
    }

    const sac = buildSAC(a, b, width, height);
    const result = parseSAC(sac);

    expect(result.width).toBe(width);
    expect(result.height).toBe(height);
    expect(Array.from(result.a)).toEqual(Array.from(a));
    expect(Array.from(result.b)).toEqual(Array.from(b));
  });
});

describe('SAC v1.1 (SINGLE_ARRAY)', () => {
  describe('parseSAC v1.1', () => {
    test('should parse valid SAC v1.1 file with SINGLE_ARRAY flag', () => {
      const width = 3;
      const height = 2;
      const a = new Int16Array([10, 20, 30, 40, 50, 60]);

      const sac = buildSAC_v11(a, width, height);
      const result = parseSAC(sac);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.flags).toBe(0x01); // FLAG_SINGLE_ARRAY
      expect(result.a.length).toBe(6);
      expect(result.b.length).toBe(6);
      expect(Array.from(result.a)).toEqual([10, 20, 30, 40, 50, 60]);
      // B should reference same data as A
      expect(result.a).toBe(result.b);
    });

    test('should have 50% smaller file size compared to v1.0', () => {
      const a = new Int16Array([1, 2, 3, 4, 5, 6]);
      const b = new Int16Array([1, 2, 3, 4, 5, 6]); // Same as A

      const sacV10 = buildSAC(a, b, 3, 2);
      const sacV11 = buildSAC_v11(a, 3, 2);

      // v1.0: 24 + 6*2 + 6*2 = 48 bytes
      // v1.1: 24 + 6*2 = 36 bytes (50% smaller payload)
      expect(sacV10.byteLength).toBe(48);
      expect(sacV11.byteLength).toBe(36);
      expect(sacV11.byteLength).toBe(sacV10.byteLength - 12); // 12 bytes saved
    });

    test('should reject v1.1 file with incorrect arraysCount', () => {
      const a = new Int16Array([1, 2, 3]);
      const sac = buildSAC_v11(a, 3, 1);

      // Corrupt arrays_count to 2 (should be 1 for SINGLE_ARRAY)
      const dv = new DataView(sac);
      dv.setUint8(6, 2);

      expect(() => parseSAC(sac)).toThrow('arraysCount must be 1 for SINGLE_ARRAY mode');
    });

    test('should handle large grayscale arrays efficiently', () => {
      const width = 1920;
      const height = 1080;
      const size = width * height;
      const a = new Int16Array(size);

      // Fill with grayscale diff pattern
      for (let i = 0; i < size; i++) {
        a[i] = (i % 200) - 100;
      }

      const sac = buildSAC_v11(a, width, height);
      const result = parseSAC(sac);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.a.length).toBe(size);
      expect(result.b.length).toBe(size);
      expect(result.a).toBe(result.b); // Zero-copy reference
      expect(result.a[0]).toBe(-100);
      expect(result.a[size - 1]).toBe(((size - 1) % 200) - 100);
    });

    test('should detect length mismatch in v1.1 file', () => {
      const a = new Int16Array([1, 2, 3]);
      const sac = buildSAC_v11(a, 3, 1);

      // Corrupt the file by adding extra bytes
      const corrupted = new Uint8Array(sac.byteLength + 10);
      corrupted.set(new Uint8Array(sac), 0);

      expect(() => parseSAC(corrupted.buffer)).toThrow('Length mismatch');
    });

    test('should handle grayscale masks with maximum int16 values', () => {
      const a = new Int16Array([32767, -32768, 0, -100, 100]);
      const sac = buildSAC_v11(a, 5, 1);
      const result = parseSAC(sac);

      expect(result.a[0]).toBe(32767);
      expect(result.a[1]).toBe(-32768);
      expect(result.b[0]).toBe(32767); // Same as A
      expect(result.b[1]).toBe(-32768);
    });
  });

  describe('buildSAC v1.1', () => {
    test('should create valid SAC v1.1 structure', () => {
      const a = new Int16Array([100, 200, 300]);
      const sac = buildSAC_v11(a, 3, 1);

      const dv = new DataView(sac);

      // Check magic
      expect(String.fromCharCode(dv.getUint8(0))).toBe('S');
      expect(String.fromCharCode(dv.getUint8(1))).toBe('A');
      expect(String.fromCharCode(dv.getUint8(2))).toBe('C');
      expect(String.fromCharCode(dv.getUint8(3))).toBe('1');

      // Check header fields
      expect(dv.getUint8(4)).toBe(0x01); // flags = FLAG_SINGLE_ARRAY
      expect(dv.getUint8(5)).toBe(1); // dtype
      expect(dv.getUint8(6)).toBe(1); // arrays_count = 1
      expect(dv.getUint32(8, true)).toBe(3); // lengthA
      expect(dv.getUint32(12, true)).toBe(3); // lengthB = lengthA
      expect(dv.getUint32(16, true)).toBe(3); // width
      expect(dv.getUint32(20, true)).toBe(1); // height
    });

    test('should have correct total size (header + single array)', () => {
      const a = new Int16Array([1, 2, 3]);
      const sac = buildSAC_v11(a, 3, 1);

      // 24 byte header + 3*2 = 30 bytes (not 36 like v1.0)
      expect(sac.byteLength).toBe(30);
    });
  });

  describe('v1.1 Integration', () => {
    test('should round-trip grayscale masks correctly', () => {
      const width = 10;
      const height = 10;
      const size = width * height;
      const a = new Int16Array(size);

      for (let i = 0; i < size; i++) {
        a[i] = (i % 50) - 25; // Grayscale diff pattern
      }

      const sac = buildSAC_v11(a, width, height);
      const result = parseSAC(sac);

      expect(result.width).toBe(width);
      expect(result.height).toBe(height);
      expect(result.flags).toBe(0x01);
      expect(Array.from(result.a)).toEqual(Array.from(a));
      expect(Array.from(result.b)).toEqual(Array.from(a)); // B = A
      expect(result.a).toBe(result.b); // Same reference
    });

    test('should maintain backward compatibility with v1.0 files', () => {
      const a = new Int16Array([1, 2, 3]);
      const b = new Int16Array([4, 5, 6]);
      const sacV10 = buildSAC(a, b, 3, 1);

      const result = parseSAC(sacV10);

      expect(result.flags).toBe(0); // No flags set
      expect(result.a).not.toBe(result.b); // Separate arrays
      expect(Array.from(result.a)).toEqual([1, 2, 3]);
      expect(Array.from(result.b)).toEqual([4, 5, 6]);
    });
  });
});
