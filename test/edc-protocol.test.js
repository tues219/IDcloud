import { describe, it, expect } from 'vitest';
const protocol = require('../src/main/modules/edc/protocol');
const fieldData = require('../src/main/modules/edc/field-data');
const { HEADERS, createHeaderHex } = require('../src/main/modules/edc/presentation-header');
const messageBuilder = require('../src/main/modules/edc/message-builder');
const { parseResponse } = require('../src/main/modules/edc/response-parser');

describe('EDC Protocol', () => {
  describe('charToHex', () => {
    it('converts ASCII char to hex string', () => {
      expect(protocol.charToHex('A')).toBe('41');
      expect(protocol.charToHex('0')).toBe('30');
      expect(protocol.charToHex(' ')).toBe('20');
    });
  });

  describe('stringToHexString', () => {
    it('converts string to hex', () => {
      expect(protocol.stringToHexString('ABC')).toBe('414243');
      expect(protocol.stringToHexString('0000000000')).toBe('30303030303030303030');
    });
  });

  describe('hexStringToString', () => {
    it('converts hex back to string', () => {
      expect(protocol.hexStringToString('414243')).toBe('ABC');
      expect(protocol.hexStringToString('30303030')).toBe('0000');
    });
  });

  describe('formatNumberToDigitString', () => {
    it('formats amounts correctly', () => {
      expect(protocol.formatNumberToDigitString(125.02, 12)).toBe('000000012502');
      expect(protocol.formatNumberToDigitString(0, 12)).toBe('000000000000');
      expect(protocol.formatNumberToDigitString(1.5, 12)).toBe('000000000150');
      expect(protocol.formatNumberToDigitString(100, 12)).toBe('000000010000');
    });
  });

  describe('formatStringToDigitString', () => {
    it('pads strings with spaces', () => {
      expect(protocol.formatStringToDigitString('DATA1', 10)).toBe('     DATA1');
      expect(protocol.formatStringToDigitString('', 20).length).toBe(20);
    });
  });

  describe('calcLength', () => {
    it('formats length as 4-digit BCD', () => {
      expect(protocol.calcLength(12)).toBe('0012');
      expect(protocol.calcLength(0)).toBe('0000');
      expect(protocol.calcLength(1024)).toBe('1024');
    });
  });

  describe('calculateXor', () => {
    it('calculates XOR checksum', () => {
      expect(protocol.calculateXor(['02', '30', '31', '30', '1C', '03'])).toBe('2C');
    });

    it('handles single value', () => {
      expect(protocol.calculateXor(['FF'])).toBe('FF');
    });
  });

  describe('splitHexStringToList', () => {
    it('splits hex string into pairs', () => {
      expect(protocol.splitHexStringToList('414243')).toEqual(['41', '42', '43']);
    });
  });

  describe('asciiStringToHex', () => {
    it('converts ASCII bytes to hex', () => {
      const input = String.fromCharCode(0x02) + '0050';
      const expected = '02' + '30303530';
      expect(protocol.asciiStringToHex(input)).toBe(expected);
    });

    it('handles empty string', () => {
      expect(protocol.asciiStringToHex('')).toBe('');
    });
  });

  describe('numberDigitStringToString', () => {
    it('converts digit string back to decimal', () => {
      expect(protocol.numberDigitStringToString('000000012502')).toBe('125.02');
      expect(protocol.numberDigitStringToString('000000000000')).toBe('0.00');
    });
  });
});

describe('Field Data', () => {
  it('creates string field hex correctly', () => {
    const hex = fieldData.createStringField('A1', 'REC00001');
    expect(hex).toContain('1C'); // ends with separator
    const parts = hex.split('1C');
    expect(parts.length).toBe(2);
  });

  it('creates number field hex correctly', () => {
    const hex = fieldData.createNumberField('40', 100.50);
    expect(hex).toContain('1C');
  });
});

describe('Presentation Header', () => {
  it('creates Card header', () => {
    const hex = HEADERS.Card();
    expect(hex).toContain('1C');
    // Should contain "1" (FormatVersion), "0" (Request), "20" (TxCode), "00" (ResponseCode), "0" (MoreData)
    const decoded = protocol.hexStringToString(hex.replace('1C', ''));
    expect(decoded).toBe('1020000');
  });

  it('creates QR header', () => {
    const hex = HEADERS.QR();
    const decoded = protocol.hexStringToString(hex.replace('1C', ''));
    expect(decoded).toBe('10QR000');
  });

  it('creates Cancel header', () => {
    const hex = HEADERS.Cancel();
    const decoded = protocol.hexStringToString(hex.replace('1C', ''));
    expect(decoded).toBe('1026000');
  });

  it('creates RePrint header', () => {
    const hex = HEADERS.RePrint();
    const decoded = protocol.hexStringToString(hex.replace('1C', ''));
    expect(decoded).toBe('1092000');
  });
});

describe('Message Builder', () => {
  it('builds payment message', () => {
    const msg = messageBuilder.buildPaymentMessage('20', 100, 0, 'REC001', '');
    expect(msg).toBeTruthy();
    expect(msg.length).toBeGreaterThan(10);
    // Should start with STX (0x02)
    expect(msg.charCodeAt(0)).toBe(0x02);
    // Should contain ETX (0x03) near the end
    const etxIdx = msg.indexOf(String.fromCharCode(0x03));
    expect(etxIdx).toBeGreaterThan(0);
  });

  it('builds cancel message', () => {
    const msg = messageBuilder.buildCancelMessage('ONUS', '000014', 'SO1IAY');
    expect(msg).toBeTruthy();
    expect(msg.charCodeAt(0)).toBe(0x02);
  });

  it('builds reprint message', () => {
    const msg = messageBuilder.buildReprintMessage('OFFUS', '000014', '');
    expect(msg).toBeTruthy();
    expect(msg.charCodeAt(0)).toBe(0x02);
  });
});

describe('LRC Validation', () => {
  it('validates correct LRC', () => {
    // Build a message, then validate its LRC
    const msg = messageBuilder.buildPaymentMessage('20', 50, 0, 'TEST', '');
    expect(protocol.validateLrc(msg)).toBe(true);
  });

  it('rejects corrupted data', () => {
    const msg = messageBuilder.buildPaymentMessage('20', 50, 0, 'TEST', '');
    // Corrupt a byte
    const corrupted = msg.substring(0, 5) + 'X' + msg.substring(6);
    expect(protocol.validateLrc(corrupted)).toBe(false);
  });
});
