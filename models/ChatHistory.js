// models/ChatHistory.js
const mongoose = require('mongoose');

const sourceDocumentSchema = new mongoose.Schema({
  filename: {
    type: String,
    required: true
  },
  source: {
    type: String,
    enum: ['local', 's3'],
    default: 'local'
  },
  s3Key: String
}, { _id: false });

const messageSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['user', 'assistant', 'system'],
    required: true
  },
  content: {
    type: String,
    required: true
  },
  isLegalDraft: {
    type: Boolean,
    default: false
  },
  draftContent: String,
  sourceFiles: [String],
  sourceDocuments: [sourceDocumentSchema]
});

const chatHistorySchema = new mongoose.Schema({
  patientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
    required: false // Make patientId optional
  },
  title: {
    type: String,
    required: true
  },
  messages: [messageSchema],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('ChatHistory', chatHistorySchema);
