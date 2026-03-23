const { WebSocketServer } = require('ws');
const { createLogger } = require('../main/logger');
const { formatEdcResponse } = require('../main/modules/edc/response-formatter');

const logger = createLogger('ws-server');

const ACTION_TX_MAP = {
  sale: '20',
  'qr-sale': 'QR',
  cancel: '26',
  reprint: '92',
};

const EDC_ERROR_CODES = {
  EDC_NOT_CONNECTED: { recoverable: true },
  EDC_NO_ACK: { recoverable: true },
  EDC_ACK_TIMEOUT: { recoverable: true },
  EDC_RESPONSE_TIMEOUT: { recoverable: true },
  EDC_CHECKSUM_ERROR: { recoverable: true },
};

function mapEdcError(err) {
  const code = err.message;
  const known = EDC_ERROR_CODES[code];
  return {
    code: known ? code : 'EDC_ERROR',
    message: err.message,
    responseCode: null,
    recoverable: known ? known.recoverable : false,
  };
}

class WsServer {
  constructor(modules) {
    this.modules = modules; // { cardReader, edc }
    this.wss = null;
    this.clients = new Set();
    this.pingInterval = null;
  }

  start(port = 9900) {
    this.wss = new WebSocketServer({ port });

    this.wss.on('connection', (ws) => {
      this.clients.add(ws);
      logger.info('Client connected', { total: this.clients.size });

      // Send connected event
      ws.send(JSON.stringify({ event: 'connected', version: '1.0.0' }));

      ws.on('message', async (raw) => {
        try {
          await this._handleMessage(ws, raw);
        } catch (err) {
          logger.error('Message handler error', { error: err.message });
          ws.send(JSON.stringify({ event: 'error', error: err.message }));
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('Client disconnected', { total: this.clients.size });
      });

      ws.on('error', (err) => {
        logger.error('WebSocket error', { error: err.message });
        this.clients.delete(ws);
      });

      // Pong handler for heartbeat
      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
    });

    // Heartbeat every 30 seconds
    this.pingInterval = setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    logger.info(`WebSocket server started on port ${port}`);
  }

  async _handleMessage(ws, raw) {
    const msgStr = raw.toString();

    // Legacy support: raw "READ" string from old card reader
    if (msgStr === 'READ') {
      const result = await this.modules.cardReader.readCard();
      ws.send(JSON.stringify(result));
      return;
    }

    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch {
      ws.send(JSON.stringify({ event: 'error', error: 'Invalid JSON' }));
      return;
    }

    const { id, type, action, data } = msg;

    switch (type) {
      case 'card-reader':
        await this._handleCardReader(ws, id, action, data);
        break;
      case 'edc':
        await this._handleEdc(ws, id, action, data);
        break;
      default:
        ws.send(JSON.stringify({ id, event: 'error', error: `Unknown type: ${type}` }));
    }
  }

  async _handleCardReader(ws, id, action, data) {
    if (action === 'read') {
      const result = await this.modules.cardReader.readCard();
      ws.send(JSON.stringify({
        id,
        type: 'card-reader',
        event: result.success ? 'success' : 'error',
        data: result,
      }));
    }
  }

  async _handleEdc(ws, id, action, data) {
    if (!data) data = {};

    const txCode = ACTION_TX_MAP[action];
    if (!txCode) {
      ws.send(JSON.stringify({
        id, type: 'edc', event: 'error',
        error: { code: 'INVALID_REQUEST', message: `Unknown action: ${action}`, responseCode: null, recoverable: false },
      }));
      return;
    }

    // Validate required fields
    if ((action === 'sale' || action === 'qr-sale') && (!data.amount || data.amount <= 0)) {
      ws.send(JSON.stringify({
        id, type: 'edc', event: 'error',
        error: { code: 'INVALID_REQUEST', message: 'Amount is required and must be > 0', responseCode: null, recoverable: false },
      }));
      return;
    }
    if ((action === 'cancel' || action === 'reprint') && !data.invoiceNo) {
      ws.send(JSON.stringify({
        id, type: 'edc', event: 'error',
        error: { code: 'INVALID_REQUEST', message: 'Invoice number is required', responseCode: null, recoverable: false },
      }));
      return;
    }

    // Send ACK
    ws.send(JSON.stringify({
      id, type: 'edc', event: 'ack',
      timestamp: new Date().toISOString(),
    }));

    try {
      const result = await this.modules.edc.processTransaction(txCode, data);
      const formatted = formatEdcResponse(result);
      ws.send(JSON.stringify({ id, type: 'edc', ...formatted }));
    } catch (err) {
      logger.error('EDC transaction failed', { action, error: err.message });
      ws.send(JSON.stringify({
        id, type: 'edc', event: 'error',
        error: mapEdcError(err),
      }));
    }
  }

  broadcast(event, data) {
    const msg = JSON.stringify({ event, data });
    for (const client of this.clients) {
      if (client.readyState === 1) { // OPEN
        client.send(msg);
      }
    }
  }

  stop() {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    if (this.wss) {
      this.wss.close();
      this.wss = null;
    }
    this.clients.clear();
    logger.info('WebSocket server stopped');
  }
}

module.exports = WsServer;
