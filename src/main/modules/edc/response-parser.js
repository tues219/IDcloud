const protocol = require('./protocol');
const { FIELD_NAMES } = require('./field-data');
const { getTransactionCodeDesc, getResponseCodeDesc } = require('./presentation-header');

function parseResponse(rawData) {
  // Convert ASCII byte data to hex string
  const sHex = protocol.asciiStringToHex(rawData);

  // Split by FS (0x1C) separator
  const parts = sHex.split('1C');

  // Parse field data (skip first part=header area, skip last part=ETX+LRC)
  const fieldDatas = [];
  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i];
    if (part.length > 8) {
      const fieldType = protocol.hexStringToString(part.substring(0, 4));
      const data = protocol.hexStringToString(part.substring(8));
      fieldDatas.push({
        FieldType: fieldType,
        FieldName: FIELD_NAMES[fieldType] || fieldType,
        Data: data.trim(),
      });
    }
  }

  // Parse presentation header
  let presentationHeader = null;
  if (parts[0] && parts[0].length > 26) {
    const headerPart = parts[0].substring(26);
    if (headerPart.length >= 14) {
      presentationHeader = {
        FormatVersion: protocol.hexStringToString(headerPart.substring(0, 2)),
        RequestResponseIndicator: protocol.hexStringToString(headerPart.substring(2, 4)),
        TransactionCode: protocol.hexStringToString(headerPart.substring(4, 8)),
        ResponseCode: protocol.hexStringToString(headerPart.substring(8, 12)),
        MoreDataIndicator: protocol.hexStringToString(headerPart.substring(12, 14)),
      };
    }
  }

  return {
    PresentationHeader: presentationHeader,
    FieldDatas: fieldDatas,
    ResponseCode: presentationHeader ? presentationHeader.ResponseCode : null,
    ResponseCodeDetail: presentationHeader ? getResponseCodeDesc(presentationHeader.ResponseCode) : null,
    TransactionCode: presentationHeader ? presentationHeader.TransactionCode : null,
    TransactionCodeDetail: presentationHeader ? getTransactionCodeDesc(presentationHeader.TransactionCode) : null,
    ResponseCodeIsPass: presentationHeader ? presentationHeader.ResponseCode === '00' : false,
  };
}

module.exports = { parseResponse };
