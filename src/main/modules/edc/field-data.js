const protocol = require('./protocol');

// Field type definitions with max lengths
const FIELD_TYPES = {
  A1: { type: 'A1', length: 20, dataType: 'string' },  // Reference 1
  A2: { type: 'A2', length: 20, dataType: 'string' },  // Reference 2
  A3_STR: { type: 'A3', length: 20, dataType: 'string' },  // Reference 3 (string)
  A3_NUM: { type: 'A3', length: 12, dataType: 'number' },  // VAT Refund (number)
  '30': { type: '30', length: 19, dataType: 'string' },  // Card No
  '31': { type: '31', length: 4, dataType: 'string' },   // Card Expire MMYY
  '40': { type: '40', length: 12, dataType: 'number' },  // Amount
  '65': { type: '65', length: 6, dataType: 'string' },   // Invoice No
  '01': { type: '01', length: 9, dataType: 'string' },   // Approval Code
  F1: { type: 'F1', length: 5, dataType: 'string' },    // Card Type
};

// Field name mapping for responses
const FIELD_NAMES = {
  '01': 'Approval Code',
  '02': 'Response Message',
  '03': 'Date',
  '04': 'Time',
  '16': 'Terminal ID',
  '30': 'Card No.',
  '31': 'Card Expire',
  '40': 'Amount',
  '65': 'Invoice No.',
  A1: 'Ref 1',
  A2: 'Ref 2',
  A3: 'Ref 3 / VAT Refund Amount',
  D1: 'Merchant ID',
  D3: 'Reference No.',
  F1: 'Card Type',
};

function createFieldDataHex(fieldType, length, data) {
  const typeHex = protocol.stringToHexString(fieldType);
  const lengthHex = protocol.calcLength(length);
  const dataHex = protocol.stringToHexString(data);
  const separatorHex = '1C';
  return typeHex + lengthHex + dataHex + separatorHex;
}

function createStringField(fieldTypeKey, data) {
  const def = FIELD_TYPES[fieldTypeKey];
  if (!def) throw new Error(`Unknown field type: ${fieldTypeKey}`);
  const paddedData = protocol.formatStringToDigitString(data || '', def.length);
  return createFieldDataHex(def.type, def.length, paddedData);
}

function createNumberField(fieldTypeKey, data) {
  const def = FIELD_TYPES[fieldTypeKey];
  if (!def) throw new Error(`Unknown field type: ${fieldTypeKey}`);
  const formattedData = protocol.formatNumberToDigitString(data || 0, def.length);
  return createFieldDataHex(def.type, def.length, formattedData);
}

module.exports = {
  FIELD_TYPES,
  FIELD_NAMES,
  createFieldDataHex,
  createStringField,
  createNumberField,
};
