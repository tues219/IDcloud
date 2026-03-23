/**
 * Transforms raw EDC parseResponse() output into business-friendly format
 * for WebSocket clients. Keeps all EDC protocol details inside the bridge.
 */

function formatEdcResponse(parsed) {
  if (!parsed || !parsed.PresentationHeader) {
    return {
      event: 'error',
      error: {
        code: 'EDC_PARSE_ERROR',
        message: 'Invalid EDC response',
        responseCode: null,
        recoverable: false,
      },
    };
  }

  const responseCode = parsed.ResponseCode;

  if (!parsed.ResponseCodeIsPass) {
    return {
      event: 'error',
      error: {
        code: responseCode === 'ND' ? 'EDC_CANCELLED' : 'EDC_DECLINED',
        message: parsed.ResponseCodeDetail || 'Unknown error',
        responseCode,
        recoverable: false,
      },
    };
  }

  // Build flat field map from FieldDatas array
  const fieldMap = {};
  for (const f of parsed.FieldDatas || []) {
    fieldMap[f.FieldType] = (f.Data || '').trim();
  }

  return {
    event: 'success',
    data: {
      approved: true,
      responseCode,
      responseMessage: parsed.ResponseCodeDetail || 'COMPLETE',
      approvalCode: fieldMap['01'] || '',
      responseMsg: fieldMap['02'] || '',
      cardNo: fieldMap['30'] || '',
      cardType: fieldMap['F1'] || '',
      invoiceNo: fieldMap['65'] || '',
      merchantId: fieldMap['D1'] || '',
      terminalId: fieldMap['16'] || '',
      referenceNo: fieldMap['D3'] || '',
      amount: fieldMap['40'] || '',
      date: fieldMap['03'] || '',
      time: fieldMap['04'] || '',
      ref1: fieldMap['A1'] || '',
      ref2: fieldMap['A2'] || '',
      vatRefund: fieldMap['A3'] || '',
    },
  };
}

module.exports = { formatEdcResponse };
