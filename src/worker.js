// src/worker.js
require('dotenv').config();
const { Worker } = require('bullmq');
const fs = require('fs').promises;
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
const { connection } = require('./config/queue'); // Use the same Redis connection

console.log('🚀 PDF Worker process started. Waiting for jobs...');

// This worker processes jobs from the 'pdfWatermarking' queue.
const worker = new Worker('pdfWatermarking', async job => {
  console.log(`Processing job ${job.id}: ${job.name}`);
  const { filePath, username } = job.data;

  try {
    const originalPdfBytes = await fs.readFile(filePath);
    const pdfDoc = await PDFDocument.load(originalPdfBytes);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const pages = pdfDoc.getPages();

    // Apply the correct watermark based on the job name
    if (job.name === 'watermarkUserUpload') {
      for (const page of pages) {
        page.drawText(`Uploaded by ${username} on Learnify`, {
          x: 40, y: 40, font, size: 10,
          color: rgb(0.5, 0.5, 0.5), opacity: 0.6,
        });
      }
    } else if (job.name === 'watermarkAdminUpload') {
        pdfDoc.setProducer('Learnify');
        pdfDoc.setCreator('Learnify Admin');
    }

    const watermarkedPdfBytes = await pdfDoc.save();
    // Overwrite the original uploaded file with the new watermarked version
    await fs.writeFile(filePath, watermarkedPdfBytes);

    console.log(`✅ Job ${job.id} completed successfully.`);
  } catch (err) {
    console.error(`❌ Job ${job.id} failed:`, err.message);
    // Let BullMQ know the job failed so it can be retried if configured
    throw err;
  }
}, { connection });

worker.on('failed', (job, err) => {
  console.error(`Job ${job.id} failed with error: ${err.message}`);
});
