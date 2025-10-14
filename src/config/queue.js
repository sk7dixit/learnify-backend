// src/config/queue.js
const { Queue } = require('bullmq');
const IORedis = require('ioredis');

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null
});

// Create a queue for processing PDF watermarks
const pdfQueue = new Queue('pdfWatermarking', { connection });

module.exports = { pdfQueue, connection };