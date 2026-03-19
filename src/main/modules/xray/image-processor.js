const sharp = require('sharp');
const path = require('path');
const fs = require('fs').promises;

class ImageProcessor {
  constructor(logger) {
    this.logger = logger;
  }

  async processImageFile(filePath) {
    try {
      const image = sharp(filePath);
      const metadata = await image.metadata();
      const stats = await fs.stat(filePath);

      // Generate thumbnail
      const thumbnailBuffer = await image
        .resize(200, 200, { fit: 'inside' })
        .jpeg({ quality: 70 })
        .toBuffer();
      const thumbnail = `data:image/jpeg;base64,${thumbnailBuffer.toString('base64')}`;

      const result = {
        patientId: null, // JPG/PNG don't have embedded patient ID
        patientName: null,
        modality: 'XR',
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        fileSize: stats.size,
        thumbnail,
        requiresAssignment: true,
      };

      this.logger.info('Image processed', { file: path.basename(filePath), format: metadata.format });
      return { success: true, metadata: result, filePath };
    } catch (error) {
      this.logger.error('Image processing failed', { error: error.message });
      return { success: false, error: error.message, filePath };
    }
  }
}

module.exports = ImageProcessor;
