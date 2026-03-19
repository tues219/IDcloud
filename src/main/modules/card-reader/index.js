const EventEmitter = require('events');
const smartcard = require('smartcard');
const { getReaderConfig } = require('./atr-config');
const PersonalApplet = require('./personal-applet');
const NhsoApplet = require('./nhso-applet');
const { delay } = require('./reader');

class CardReaderModule extends EventEmitter {
  constructor(logger, config) {
    super();
    this.logger = logger;
    this.config = config || {};
    this.devices = null;
    this.currentCard = null;
    this.currentDevice = null;
    this.lastReadData = null;
    this.isReading = false; // Mutex lock for reading
    this.status = 'disconnected';
    this._listeners = []; // Track listeners for cleanup
    this._destroyed = false;
    this._reconnectTimer = null;
  }

  async init() {
    this._destroyed = false;
    this.devices = new smartcard.Devices();

    this.devices.on('device-activated', (event) => {
      const device = event.device;
      this.currentDevice = device;
      this.status = 'connected';
      this.logger.info('Card reader connected', { device: String(device) });
      this.emit('status', { status: 'connected', device: String(device) });

      // Use .on but track for cleanup
      const onCardInserted = async (event) => {
        if (this._destroyed) return;
        await delay(300);
        this.status = 'card-inserted';
        this.emit('status', { status: 'card-inserted' });

        const card = event.card;
        this.currentCard = card;
        const atr = card.getAtr();
        const readerConfig = getReaderConfig(atr);
        this.logger.info('Card inserted', { atr, readerType: readerConfig.readerType });

        try {
          await this._readCardData(card, readerConfig);
        } catch (err) {
          this.logger.error('Card read failed', { error: err.message });
          this.status = 'error';
          this.emit('status', { status: 'error', error: err.message });
          // Reset state after error
          this.currentCard = null;
          this.lastReadData = null;
          this.isReading = false;
        }
      };

      const onCardRemoved = (event) => {
        this.logger.info('Card removed');
        this.currentCard = null;
        this.lastReadData = null;
        this.isReading = false;
        this.status = 'connected';
        this.emit('status', { status: 'connected' });
      };

      const onDeviceError = (event) => {
        this.logger.error('Device error');
        this.status = 'error';
        this.emit('status', { status: 'error', error: 'Device error' });
      };

      device.on('card-inserted', onCardInserted);
      device.on('card-removed', onCardRemoved);
      device.on('error', onDeviceError);
      this._listeners.push({ target: device, events: { 'card-inserted': onCardInserted, 'card-removed': onCardRemoved, 'error': onDeviceError } });
    });

    this.devices.on('device-deactivated', (event) => {
      this.logger.warn('Card reader disconnected');
      this.currentDevice = null;
      this.currentCard = null;
      this.lastReadData = null;
      this.isReading = false;
      this.status = 'disconnected';
      this.emit('status', { status: 'disconnected' });
      this._startReconnect();
    });

    this.devices.on('error', (error) => {
      this.logger.error('Smart card system error', { error: error.error || error.message });
      this.status = 'error';
      this.emit('status', { status: 'error', error: error.error || error.message });
    });

    this.logger.info('Card reader module initialized');
  }

  async _readCardData(card, readerConfig) {
    // Mutex lock — reject if already reading
    if (this.isReading) {
      this.logger.warn('Read already in progress, skipping');
      return;
    }
    this.isReading = true;

    try {
      // 10 second timeout for entire read operation
      const readPromise = this._performRead(card, readerConfig);
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('READ_TIMEOUT')), 10000)
      );

      const data = await Promise.race([readPromise, timeoutPromise]);
      this.lastReadData = data;
      this.status = 'read-complete';
      this.emit('card-data', data);
      this.emit('status', { status: 'read-complete' });
      this.logger.info('Card read complete');
    } finally {
      this.isReading = false;
    }
  }

  async _performRead(card, readerConfig) {
    const req = readerConfig.req;
    const options = { delayMs: readerConfig.delayMs, commandTimeout: 5000 };

    const personalApplet = new PersonalApplet(card, req, options);
    const personal = await personalApplet.getInfo(this.logger);

    const nhsoApplet = new NhsoApplet(card, req, options);
    const nhso = await nhsoApplet.getInfo(this.logger);

    return { ...personal, nhso };
  }

  // Called by WS handler when frontend requests a read
  async readCard() {
    if (this.lastReadData) {
      return { success: true, personal: this._formatForFrontend(this.lastReadData) };
    }
    return { success: false, personal: null, msgDetail: 'กรุณาเสียบบัตรประชาชน' };
  }

  _formatForFrontend(data) {
    const { cid, name, nameEN, dob, gender, address, photo, issuer, issueDate, expireDate } = data;
    const personal = {
      Citizenid: cid || null,
      Th_Prefix: name ? name.prefix : null,
      Th_Firstname: name ? name.firstname : null,
      Th_Middlename: name ? name.middlename : null,
      Th_Lastname: name ? name.lastname : null,
      En_Prefix: nameEN ? nameEN.prefix : null,
      En_Firstname: nameEN ? nameEN.firstname : null,
      En_Middlename: nameEN ? nameEN.middlename : null,
      En_Lastname: nameEN ? nameEN.lastname : null,
      Birthday: dob || null,
      gender: gender === '1' ? 'ชาย' : gender === '2' ? 'หญิง' : gender ? 'อื่นๆ' : null,
      addrProvince: address ? address.province : null,
      addrAmphur: address ? address.district : null,
      addrTambol: address ? address.subdistrict : null,
      addrHouseNo: address
        ? [address.houseNo, address.soi, address.street, address.moo].filter(Boolean).join(' ')
        : null,
      PhotoRaw: photo || null,
      Issuer: issuer || null,
      IssueDate: issueDate || null,
      ExpireDate: expireDate || null,
    };
    return personal;
  }

  _startReconnect() {
    if (this._reconnectTimer || this._destroyed) return;
    this._reconnectTimer = setInterval(() => {
      if (this.currentDevice || this._destroyed) {
        clearInterval(this._reconnectTimer);
        this._reconnectTimer = null;
        return;
      }
      this.logger.debug('Waiting for card reader reconnection...');
    }, 3000);
  }

  getStatus() {
    return {
      status: this.status,
      hasCard: !!this.currentCard,
      hasData: !!this.lastReadData,
      isReading: this.isReading,
    };
  }

  async destroy() {
    this._destroyed = true;
    if (this._reconnectTimer) {
      clearInterval(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    // Cleanup all event listeners
    for (const { target, events } of this._listeners) {
      for (const [event, handler] of Object.entries(events)) {
        target.removeListener(event, handler);
      }
    }
    this._listeners = [];
    this.currentCard = null;
    this.currentDevice = null;
    this.lastReadData = null;
    this.isReading = false;
    this.removeAllListeners();
    this.logger.info('Card reader module destroyed');
  }
}

module.exports = CardReaderModule;
