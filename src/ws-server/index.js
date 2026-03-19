const { WebSocketServer } = require('ws');
const { createLogger } = require('../main/logger');

const logger = createLogger('ws-server');

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

    // Handle legacy frontend format (from DcPaymentWebsocket.vue)
    if (data.PresentationHeader || data.ReserveForFurfuresUse) {
      return this._handleEdcLegacy(ws, id, data);
    }

    try {
      let txCode;
      switch (action) {
        case 'pay':
          txCode = data.transactionCode || '20';
          break;
        case 'cancel':
          txCode = '26';
          break;
        case 'reprint':
          txCode = '92';
          break;
        default:
          throw new Error(`Unknown EDC action: ${action}`);
      }

      // Send ACK first
      ws.send(JSON.stringify({
        id,
        AcknowledgeCode: 'AA',
        AcknowledgeDateTime: new Date().toISOString(),
      }));

      const result = await this.modules.edc.processTransaction(txCode, data);
      ws.send(JSON.stringify({ id, ...result }));
    } catch (err) {
      ws.send(JSON.stringify({ id, event: 'error', error: err.message }));
    }
  }

  async _handleEdcLegacy(ws, id, msg) {
    try {
      const txCode = msg.PresentationHeader?.TransactionCode || '20';
      const fields = msg.FieldDatas || [];

      const data = {};
      for (const f of fields) {
        switch (f.FieldType) {
          case 'A1': data.ref1 = f.Data; data.receiptNo = f.Data; break;
          case 'A2': data.ref2 = f.Data; break;
          case 'A3': data.vatRefund = f.Data; break;
          case '40': data.amount = f.Data; break;
          case '65': data.invoiceNo = f.Data; break;
          case '01': data.approvalCode = f.Data; break;
          case 'F1': data.cardType = f.Data?.trim(); break;
        }
      }

      // Send ACK
      ws.send(JSON.stringify({
        AcknowledgeCode: 'AA',
        AcknowledgeDateTime: new Date().toISOString(),
      }));

      const result = await this.modules.edc.processTransaction(txCode, data);
      ws.send(JSON.stringify(result));
    } catch (err) {
      ws.send(JSON.stringify({ event: 'error', error: err.message }));
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
