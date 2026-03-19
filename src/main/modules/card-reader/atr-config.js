const ATR_CONFIGS = [
  { prefix: "3b67", req: [0x00, 0xc0, 0x00, 0x01], delayMs: 100, readerType: "SCR3310v2 / ACS ACR38" },
  { prefix: "3b68", req: [0x00, 0xc0, 0x00, 0x00], delayMs: 150, readerType: "OMNIKEY 3021/3121" },
  { prefix: "3b78", req: [0x00, 0xc0, 0x00, 0x00], delayMs: 100, readerType: "ACS ACR39U" },
  { prefix: "3b88", req: [0x00, 0xc0, 0x00, 0x00], delayMs: 150, readerType: "ACS ACR1252" },
  { prefix: "3b6f", req: [0x00, 0xc0, 0x00, 0x00], delayMs: 100, readerType: "Gemalto IDBridge" },
  { prefix: "3b6d", req: [0x00, 0xc0, 0x00, 0x00], delayMs: 100, readerType: "BIT4ID miniLector" },
];

const DEFAULT_CONFIG = {
  req: [0x00, 0xc0, 0x00, 0x00],
  delayMs: 100,
  readerType: "Generic (3b fallback)",
};

function getReaderConfig(atr) {
  const atrLower = (atr || "").toLowerCase();
  for (const config of ATR_CONFIGS) {
    if (atrLower.startsWith(config.prefix)) {
      return { req: config.req, delayMs: config.delayMs, readerType: config.readerType };
    }
  }
  return { ...DEFAULT_CONFIG };
}

module.exports = { getReaderConfig, ATR_CONFIGS, DEFAULT_CONFIG };
