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

  if (dtype !== 1 || arraysCount !== 2) throw new Error('Unsupported SAC variant');

  const lengthA = dv.getUint32(8, true);
  const lengthB = dv.getUint32(12, true);
  const width = dv.getUint32(16, true);
  const height = dv.getUint32(20, true);

  const offA = 24;
  const offB = offA + lengthA * 2;

  if (offB + lengthB * 2 !== buffer.byteLength) throw new Error('Length mismatch');

  const a = new Int16Array(buffer, offA, lengthA);
  const b = new Int16Array(buffer, offB, lengthB);

  if (width && height && (lengthA !== width * height || lengthB !== width * height)) {
    throw new Error('Shape mismatch');
  }

  return { a, b, width, height, flags };
}

function buildSAC(a: Int16Array, b: Int16Array, width: number, height: number): ArrayBuffer {
  const lengthA = a.length;
  const lengthB = b.length;

  const header = new ArrayBuffer(24);
  const dv = new DataView(header);

  dv.setUint8(0, 'S'.charCodeAt(0));
  dv.setUint8(1, 'A'.charCodeAt(0));
  dv.setUint8(2, 'C'.charCodeAt(0));
  dv.setUint8(3, '1'.charCodeAt(0));
  dv.setUint8(4, 0);
  dv.setUint8(5, 1);
  dv.setUint8(6, 2);
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

      expect(() => parseSAC(buffer)).toThrow('Unsupported SAC variant');
    });

    test('should reject incorrect array count', () => {
      const buffer = new ArrayBuffer(24);
      const dv = new DataView(buffer);
      dv.setUint8(0, 'S'.charCodeAt(0));
      dv.setUint8(1, 'A'.charCodeAt(0));
      dv.setUint8(2, 'C'.charCodeAt(0));
      dv.setUint8(3, '1'.charCodeAt(0));
      dv.setUint8(5, 1);
      dv.setUint8(6, 3); // Invalid array count

      expect(() => parseSAC(buffer)).toThrow('Unsupported SAC variant');
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

      expect(() => parseSAC(sac)).toThrow('Shape mismatch');
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
