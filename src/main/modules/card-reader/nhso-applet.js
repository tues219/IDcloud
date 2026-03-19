const { CommandApdu } = require('smartcard');
const legacy = require('legacy-encoding');
const { getData, delay } = require('./reader');
const apduNhso = require('./apdu-nhso');

class NhsoApplet {
  constructor(card, req = [0x00, 0xc0, 0x00, 0x00], options = {}) {
    this.card = card;
    this.req = req;
    this.options = { delayMs: options.delayMs || 50, commandTimeout: options.commandTimeout || 5000 };
  }

  async readField(command, decode = null) {
    const maxFieldRetries = 3;
    for (let i = 0; i < maxFieldRetries; i++) {
      try {
        const data = await getData(this.card, command, this.req, this.options);
        await delay(this.options.delayMs);
        if (decode === 'tis620') {
          return legacy.decode(data, 'tis620').slice(0, -2).toString().trim();
        }
        return data.slice(0, -2).toString().trim();
      } catch (err) {
        if (i < maxFieldRetries - 1) {
          await delay(this.options.delayMs * 2);
        } else {
          throw err;
        }
      }
    }
  }

  async getInfo(logger) {
    const info = { _errors: [] };

    // Select NHSO applet
    await this.card.issueCommand(
      new CommandApdu({
        bytes: [...apduNhso.SELECT, ...apduNhso.NHSO_CARD],
      })
    );
    await delay(this.options.delayMs);

    logger.info('NHSO applet selected');

    // maininscl
    try {
      info.maininscl = await this.readField(apduNhso.CMD_MAININSCL, 'tis620');
      logger.info('Read maininscl');
    } catch (err) {
      info.maininscl = null;
      info._errors.push({ field: 'maininscl', error: err.message });
      logger.error('Failed to read maininscl', { error: err.message });
    }

    // subinscl
    try {
      info.subinscl = await this.readField(apduNhso.CMD_SUBINSCL, 'tis620');
      logger.info('Read subinscl');
    } catch (err) {
      info.subinscl = null;
      info._errors.push({ field: 'subinscl', error: err.message });
    }

    // main hospital name
    try {
      info.mainHospitalName = await this.readField(apduNhso.CMD_MAIN_HOSPITAL_NAME, 'tis620');
      logger.info('Read mainHospitalName');
    } catch (err) {
      info.mainHospitalName = null;
      info._errors.push({ field: 'mainHospitalName', error: err.message });
    }

    // sub hospital name
    try {
      info.subHospitalName = await this.readField(apduNhso.CMD_SUB_HOSPITAL_NAME, 'tis620');
    } catch (err) {
      info.subHospitalName = null;
      info._errors.push({ field: 'subHospitalName', error: err.message });
    }

    // paid type
    try {
      info.paidType = await this.readField(apduNhso.CMD_PAID_TYPE);
    } catch (err) {
      info.paidType = null;
      info._errors.push({ field: 'paidType', error: err.message });
    }

    // Issue Date
    try {
      const raw = await this.readField(apduNhso.CMD_ISSUE);
      info.issueDate = `${+raw.slice(0, 4) - 543}-${raw.slice(4, 6)}-${raw.slice(6)}`;
    } catch (err) {
      info.issueDate = null;
      info._errors.push({ field: 'issueDate', error: err.message });
    }

    // Expire Date
    try {
      const raw = await this.readField(apduNhso.CMD_EXPIRE);
      info.expireDate = `${+raw.slice(0, 4) - 543}-${raw.slice(4, 6)}-${raw.slice(6)}`;
    } catch (err) {
      info.expireDate = null;
      info._errors.push({ field: 'expireDate', error: err.message });
    }

    // Update Date
    try {
      const raw = await this.readField(apduNhso.CMD_UPDATE);
      info.updateDate = `${+raw.slice(0, 4) - 543}-${raw.slice(4, 6)}-${raw.slice(6)}`;
    } catch (err) {
      info.updateDate = null;
      info._errors.push({ field: 'updateDate', error: err.message });
    }

    // Change Hospital Amount
    try {
      info.changeHospitalAmount = await this.readField(apduNhso.CMD_CHANGE_HOSPITAL_AMOUNT);
    } catch (err) {
      info.changeHospitalAmount = null;
      info._errors.push({ field: 'changeHospitalAmount', error: err.message });
    }

    if (info._errors.length > 0) {
      logger.warn('NHSO field errors', { errors: info._errors });
    }

    logger.info('NHSO read complete');
    return info;
  }
}

module.exports = NhsoApplet;
