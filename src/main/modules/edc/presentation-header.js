const protocol = require('./protocol');

const TRANSACTION_CODES = {
  '20': 'รายการขาย Card และ QR Code',
  '25': 'รายการเบิกส่งคืน',
  '26': 'รายการยกเลิก',
  '27': 'รายการขาย Key in',
  '28': 'รายการถอนเงินสด',
  '50': 'รายการโอนยอด',
  '92': 'รายการพิมพ์สลิปซ้ำ',
  'QR': 'รายการขาย QR Code',
  'Q5': 'รายการ QR เบิกเกินส่งคืน',
  'IQ': 'ตรวจสอบ QR Code',
};

const RESPONSE_CODES = {
  '00': 'COMPLETE',
  '01': 'MSG LEN ERR', '02': 'FORMAT ERR', '03': 'TER VER ERR',
  '04': 'MSG VER ERR', '05': 'MAC ERR', '06': 'TX CODE ERR',
  '07': 'TER CER ERR', '08': 'TID NOT FOUND', '11': 'CARD NOT FOUND',
  '12': 'TX NOT FOUND', '13': 'VOID NOT MATCH', '14': 'EXCEED AMT',
  '15': 'EXCEED USE', '21': 'SERV TIMEOUT', '22': 'TOO MANY CONN',
  '31': 'DATABASE ERR', '32': 'EMCI ERR', '33': 'INVALID BATCH',
  '34': 'TID NOT FOUND', '40': 'EMCI ERR', '41': 'EMCI TIMEOUT',
  '42': 'EMCI MALFUNC', '43': 'INCORRECT PIN', '44': 'INVALID CARD',
  '45': 'DO NOT HONOR', '46': 'PIN EXCEED', '47': 'TXN NOT PERMIT',
  '48': 'CARD EXPIRE', '49': 'PICKUP CARD', '50': 'INVALID TXN',
  '51': 'INVALID TIN/PIN', '52': 'INV CARD CATG', '69': 'INVALID TID',
  '95': 'TXN CODE ERR', '96': 'TOP TIMEOUT', '97': 'TOP FAIL',
  '98': 'EXCEED AMT DEPOSIT',
  'ND': 'TXN CANCEL', 'EN': 'CONNECT FAILED', 'NA': 'NOT AVAILABLE',
};

function createHeaderHex(header) {
  let hex = '';
  hex += protocol.stringToHexString(header.FormatVersion || '1');
  hex += protocol.stringToHexString(header.RequestResponseIndicator || '0');
  hex += protocol.stringToHexString(header.TransactionCode || '20');
  hex += protocol.stringToHexString(header.ResponseCode || '00');
  hex += protocol.stringToHexString(header.MoreDataIndicator || '0');
  hex += '1C'; // Field separator
  return hex;
}

const HEADERS = {
  Card: () => createHeaderHex({ FormatVersion: '1', RequestResponseIndicator: '0', TransactionCode: '20', ResponseCode: '00', MoreDataIndicator: '0' }),
  QR: () => createHeaderHex({ FormatVersion: '1', RequestResponseIndicator: '0', TransactionCode: 'QR', ResponseCode: '00', MoreDataIndicator: '0' }),
  Cancel: () => createHeaderHex({ FormatVersion: '1', RequestResponseIndicator: '0', TransactionCode: '26', ResponseCode: '00', MoreDataIndicator: '0' }),
  RePrint: () => createHeaderHex({ FormatVersion: '1', RequestResponseIndicator: '0', TransactionCode: '92', ResponseCode: '00', MoreDataIndicator: '0' }),
};

function getTransactionCodeDesc(code) {
  return TRANSACTION_CODES[code] || 'Code not found';
}

function getResponseCodeDesc(code) {
  return RESPONSE_CODES[code] || 'Code not found';
}

module.exports = {
  TRANSACTION_CODES, RESPONSE_CODES, HEADERS,
  createHeaderHex, getTransactionCodeDesc, getResponseCodeDesc,
};
