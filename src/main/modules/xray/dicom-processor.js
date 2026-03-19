const dicomParser = require('dicom-parser');
const fs = require('fs').promises;

class DicomProcessor {
  constructor(logger) {
    this.logger = logger;
  }

  async processDicomFile(filePath) {
    try {
      const fileBuffer = await fs.readFile(filePath);
      const byteArray = new Uint8Array(fileBuffer);
      const dataSet = dicomParser.parseDicom(byteArray);
      const metadata = this.extractMetadata(dataSet);
      this.logger.info('DICOM metadata extracted', { patientId: metadata.patientId });
      return { success: true, metadata, filePath };
    } catch (error) {
      this.logger.error('DICOM processing failed', { error: error.message });
      return { success: false, error: error.message, filePath };
    }
  }

  extractMetadata(dataSet) {
    const m = {};
    m.patientId = this.getString(dataSet, 'x00100020');
    m.patientName = this.getString(dataSet, 'x00100010');
    m.patientBirthDate = this.getString(dataSet, 'x00100030');
    m.patientSex = this.getString(dataSet, 'x00100040');
    m.studyInstanceUID = this.getString(dataSet, 'x0020000d');
    m.studyDate = this.getString(dataSet, 'x00080020');
    m.studyTime = this.getString(dataSet, 'x00080030');
    m.studyDescription = this.getString(dataSet, 'x00081030');
    m.accessionNumber = this.getString(dataSet, 'x00080050');
    m.seriesInstanceUID = this.getString(dataSet, 'x0020000e');
    m.seriesNumber = this.getString(dataSet, 'x00200011');
    m.seriesDescription = this.getString(dataSet, 'x0008103e');
    m.modality = this.getString(dataSet, 'x00080060');
    m.sopInstanceUID = this.getString(dataSet, 'x00080018');
    m.instanceNumber = this.getString(dataSet, 'x00200013');
    m.manufacturer = this.getString(dataSet, 'x00080070');
    m.manufacturerModelName = this.getString(dataSet, 'x00081090');
    m.stationName = this.getString(dataSet, 'x00081010');
    m.bodyPartExamined = this.getString(dataSet, 'x00180015');
    m.institutionName = this.getString(dataSet, 'x00080080');
    m.referringPhysicianName = this.getString(dataSet, 'x00080090');

    if (m.patientName) {
      const parts = m.patientName.split('^');
      m.patientNameFormatted = [parts[1], parts[2], parts[0]].filter(Boolean).join(' ').trim() || m.patientName;
    }
    if (m.patientBirthDate && m.patientBirthDate.length === 8) {
      m.patientBirthDateFormatted = `${m.patientBirthDate.substring(0, 4)}-${m.patientBirthDate.substring(4, 6)}-${m.patientBirthDate.substring(6, 8)}`;
    }
    if (m.studyDate && m.studyDate.length === 8) {
      m.studyDateFormatted = `${m.studyDate.substring(0, 4)}-${m.studyDate.substring(4, 6)}-${m.studyDate.substring(6, 8)}`;
    }
    return m;
  }

  getString(dataSet, tag) {
    try {
      const el = dataSet.elements[tag];
      if (el && el.length > 0) return dataSet.string(tag);
    } catch {}
    return null;
  }
}

module.exports = DicomProcessor;
