const protocol = require('./protocol');
const fieldData = require('./field-data');
const { HEADERS } = require('./presentation-header');

const RESERVE_HEX = protocol.stringToHexString('0000000000');

const CARD_TYPE_MAP = {
  ONUS: 'ONUS ',
  OFFUS: 'OFFUS',
  QR: 'QR',
};

function buildPaymentMessage(txCode, amount, vatRefund, ref1, ref2) {
  const headerHex = txCode === 'QR' ? HEADERS.QR() : HEADERS.Card();

  const fieldA1 = fieldData.createStringField('A1', ref1 || '');
  const fieldA2 = fieldData.createStringField('A2', ref2 || '');
  const fieldA3 = fieldData.createNumberField('A3_NUM', vatRefund || 0);
  const field40 = fieldData.createNumberField('40', amount || 0);

  const hexMsg = protocol.packMessage(RESERVE_HEX, headerHex, [fieldA1, fieldA2, fieldA3, field40]);
  return protocol.byteHexStringMessageData(hexMsg);
}

function buildCancelMessage(cardType, invoiceNo, approvalCode) {
  const headerHex = HEADERS.Cancel();
  const ct = CARD_TYPE_MAP[cardType] || 'ONUS ';

  const field65 = fieldData.createStringField('65', invoiceNo || '');
  const field01 = fieldData.createStringField('01', approvalCode || '');
  const fieldF1 = fieldData.createStringField('F1', ct);

  const hexMsg = protocol.packMessage(RESERVE_HEX, headerHex, [field65, field01, fieldF1]);
  return protocol.byteHexStringMessageData(hexMsg);
}

function buildReprintMessage(cardType, invoiceNo, approvalCode) {
  const headerHex = HEADERS.RePrint();
  const ct = CARD_TYPE_MAP[cardType] || 'ONUS ';

  const field65 = fieldData.createStringField('65', invoiceNo || '');
  const field01 = fieldData.createStringField('01', approvalCode || '');
  const fieldF1 = fieldData.createStringField('F1', ct);

  const hexMsg = protocol.packMessage(RESERVE_HEX, headerHex, [field65, field01, fieldF1]);
  return protocol.byteHexStringMessageData(hexMsg);
}

module.exports = { buildPaymentMessage, buildCancelMessage, buildReprintMessage };
