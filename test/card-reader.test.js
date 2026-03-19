import { describe, it, expect } from 'vitest';
const { getReaderConfig, ATR_CONFIGS } = require('../src/main/modules/card-reader/atr-config');
const { getStatusWord } = require('../src/main/modules/card-reader/reader');

describe('ATR Config', () => {
  it('returns config for known ATR prefix 3b67', () => {
    const config = getReaderConfig('3b67xxxx');
    expect(config.readerType).toBe('SCR3310v2 / ACS ACR38');
    expect(config.req).toEqual([0x00, 0xc0, 0x00, 0x01]);
    expect(config.delayMs).toBe(100);
  });

  it('returns config for OMNIKEY 3b68', () => {
    const config = getReaderConfig('3b68xxxx');
    expect(config.readerType).toBe('OMNIKEY 3021/3121');
    expect(config.delayMs).toBe(150);
  });

  it('returns default config for unknown ATR', () => {
    const config = getReaderConfig('3bffxxxx');
    expect(config.readerType).toBe('Generic (3b fallback)');
    expect(config.req).toEqual([0x00, 0xc0, 0x00, 0x00]);
  });

  it('handles null/undefined ATR', () => {
    expect(getReaderConfig(null).readerType).toBe('Generic (3b fallback)');
    expect(getReaderConfig(undefined).readerType).toBe('Generic (3b fallback)');
    expect(getReaderConfig('').readerType).toBe('Generic (3b fallback)');
  });

  it('is case insensitive', () => {
    const lower = getReaderConfig('3b67xxxx');
    const upper = getReaderConfig('3B67XXXX');
    expect(lower.readerType).toBe(upper.readerType);
  });
});

describe('Status Word Parser', () => {
  it('extracts SW1/SW2 from buffer', () => {
    const buf = Buffer.from([0x01, 0x02, 0x90, 0x00]);
    const sw = getStatusWord(buf);
    expect(sw.sw1).toBe(0x90);
    expect(sw.sw2).toBe(0x00);
    expect(sw.sw).toBe('9000');
  });

  it('handles SW 61xx (more data)', () => {
    const buf = Buffer.from([0x61, 0x0d]);
    const sw = getStatusWord(buf);
    expect(sw.sw1).toBe(0x61);
    expect(sw.sw2).toBe(0x0d);
  });

  it('handles SW 6Cxx (wrong length)', () => {
    const buf = Buffer.from([0x6c, 0x64]);
    const sw = getStatusWord(buf);
    expect(sw.sw1).toBe(0x6c);
    expect(sw.sw2).toBe(0x64);
  });

  it('handles empty/null buffer', () => {
    expect(getStatusWord(null).sw).toBe('0000');
    expect(getStatusWord(Buffer.alloc(0)).sw).toBe('0000');
    expect(getStatusWord(Buffer.from([0x01])).sw).toBe('0000');
  });
});

describe('APDU Commands', () => {
  it('person APDU has all required commands', () => {
    const person = require('../src/main/modules/card-reader/apdu-person');
    expect(person.SELECT).toBeDefined();
    expect(person.THAI_CARD).toBeDefined();
    expect(person.CMD_CID).toBeDefined();
    expect(person.CMD_THFULLNAME).toBeDefined();
    expect(person.CMD_ENFULLNAME).toBeDefined();
    expect(person.CMD_BIRTH).toBeDefined();
    expect(person.CMD_GENDER).toBeDefined();
    expect(person.CMD_ISSUER).toBeDefined();
    expect(person.CMD_ISSUE).toBeDefined();
    expect(person.CMD_EXPIRE).toBeDefined();
    expect(person.CMD_ADDRESS).toBeDefined();
    // 20 photo chunks
    for (let i = 1; i <= 20; i++) {
      expect(person[`CMD_PHOTO${i}`]).toBeDefined();
    }
  });

  it('nhso APDU has all required commands', () => {
    const nhso = require('../src/main/modules/card-reader/apdu-nhso');
    expect(nhso.SELECT).toBeDefined();
    expect(nhso.NHSO_CARD).toBeDefined();
    expect(nhso.CMD_MAININSCL).toBeDefined();
    expect(nhso.CMD_SUBINSCL).toBeDefined();
    expect(nhso.CMD_MAIN_HOSPITAL_NAME).toBeDefined();
    expect(nhso.CMD_SUB_HOSPITAL_NAME).toBeDefined();
    expect(nhso.CMD_PAID_TYPE).toBeDefined();
    expect(nhso.CMD_ISSUE).toBeDefined();
    expect(nhso.CMD_EXPIRE).toBeDefined();
    expect(nhso.CMD_UPDATE).toBeDefined();
    expect(nhso.CMD_CHANGE_HOSPITAL_AMOUNT).toBeDefined();
  });
});
