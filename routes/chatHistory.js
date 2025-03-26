// routes/chatHistory.js
const express = require('express');
const router = express.Router();
const ChatHistory = require('../models/ChatHistory');

// Get all chat histories
router.get('/', async (req, res) => {
  console.log("GET /chat-history - Fetching all chat histories");
  try {
    const chatHistories = await ChatHistory.find()
      .sort({ updatedAt: -1 })
      .limit(50); // Limit to most recent 50 conversations
    
    console.log(`Found ${chatHistories.length} chat histories`);
    
    // Log some details about the first few chat histories
    if (chatHistories.length > 0) {
      console.log("Sample chat histories:");
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
router.get('/:patientId', async (req, res) => {
  try {
    const chatHistories = await ChatHistory.find({ 
      patientId: req.params.patientId 
    }).sort({ updatedAt: -1 });
    
    res.json(chatHistories);
  } catch (error) {
    console.error('Error fetching chat histories:', error);
    res.status(500).json({ error: 'Error fetching chat histories' });
  }
});

// Get a specific chat history
router.get('/conversation/:id', async (req, res) => {
  console.log(`GET /chat-history/conversation/${req.params.id} - Fetching specific chat history`);
  try {
    const chatHistory = await ChatHistory.findById(req.params.id);
    if (!chatHistory) {
      console.log(`Chat history with ID ${req.params.id} not found`);
      return res.status(404).json({ error: 'Chat history not found' });
    }
    
    console.log(`Found chat history: ID: ${chatHistory._id}, Title: ${chatHistory.title}, Messages: ${chatHistory.messages.length}`);
    
    // Log some details about the messages
    if (chatHistory.messages.length > 0) {
      console.log("Sample messages:");
      chatHistory.messages.slice(0, 3).forEach((msg, index) => {
        console.log(`${index + 1}. Role: ${msg.role}, Content: ${msg.content.substring(0, 50)}...`);
      });
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

module.exports = router;
