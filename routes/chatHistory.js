// routes/chatHistory.js
const express = require('express');
const router = express.Router();
const ChatHistory = require('../models/ChatHistory');

// Get all chat histories
router.get('/', async (req, res) => {
  try {
    const chatHistories = await ChatHistory.find()
      .sort({ updatedAt: -1 })
      .limit(50); // Limit to most recent 50 conversations
    
    console.log(`Found ${chatHistories.length} chat histories`);
    
    // Log some details about the first few chat histories
    if (chatHistories.length > 0) {
      chatHistories.slice(0, 3).forEach((chat, index) => {
        console.log(`${index + 1}. ID: ${chat._id}, Title: ${chat.title}, Messages: ${chat.messages.length}`);
      });
    }
    
    res.json(chatHistories);
  } catch (error) {
    console.error('Error fetching all chat histories:', error);
    res.status(500).json({ error: 'Error fetching chat histories' });
  }
});

// Get all chat histories for a patient
router.get('/patient/:patientId', async (req, res) => {
  console.log(`GET /chat-history/patient/${req.params.patientId} - Fetching chat histories for patient`);
  try {
    const chatHistories = await ChatHistory.find({ 
      patientId: req.params.patientId 
    }).sort({ updatedAt: -1 });
    
    console.log(`Found ${chatHistories.length} chat histories for patient ${req.params.patientId}`);
    
    res.json(chatHistories);
  } catch (error) {
    console.error('Error fetching chat histories for patient:', error);
    res.status(500).json({ error: 'Error fetching chat histories' });
  }
});

// Get a specific chat history
router.get('/conversation/:id', async (req, res) => {
  try {
    const chatHistory = await ChatHistory.findById(req.params.id);
    if (!chatHistory) {
      console.log(`Chat history with ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Chat history not found' });
    }
    res.json(chatHistory);
  } catch (error) {
    console.error('Error fetching chat history:', error);
    res.status(500).json({ error: 'Error fetching chat history' });
  }
});

// Create a new chat history
router.post('/', async (req, res) => {
  try {
    const { patientId, title, messages } = req.body;
    const chatHistory = new ChatHistory({
      patientId,
      title,
      messages
    });
    await chatHistory.save();
    res.status(201).json(chatHistory);
  } catch (error) {
    console.error('Error creating chat history:', error);
    res.status(500).json({ error: 'Error creating chat history' });
  }
});

// Update an existing chat history
router.put('/:id', async (req, res) => {
  try {
    const { messages } = req.body;
    const chatHistory = await ChatHistory.findById(req.params.id);
    
    if (!chatHistory) {
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    chatHistory.messages = messages;
    chatHistory.updatedAt = Date.now();
    await chatHistory.save();
    
    res.json(chatHistory);
  } catch (error) {
    console.error('Error updating chat history:', error);
    res.status(500).json({ error: 'Error updating chat history' });
  }
});

// Delete a chat history
router.delete('/:id', async (req, res) => {
  console.log(`DELETE /chat-history/${req.params.id} - Deleting chat history`);
  console.log('Request params:', req.params);
  console.log('Request query:', req.query);
  console.log('Request body:', req.body);
  
  try {
    console.log(`Attempting to find and delete chat history with ID: ${req.params.id}`);
    const result = await ChatHistory.findByIdAndDelete(req.params.id);
    
    if (!result) {
      console.log(`Chat history with ID ${req.params.id} not found for deletion`);
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    console.log(`Successfully deleted chat history with ID: ${req.params.id}`);
    console.log('Deleted document:', result);
    res.json({ message: 'Chat history deleted successfully', deletedId: req.params.id });
  } catch (error) {
    console.error('Error deleting chat history:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    
    if (error.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    res.status(500).json({ error: 'Error deleting chat history', message: error.message });
  }
});

module.exports = router;
