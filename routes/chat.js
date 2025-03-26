// routes/chat.js
const express = require('express');
const router = express.Router();
const { Anthropic } = require('@anthropic-ai/sdk');
const axios = require('axios');
const ChatHistory = require('../models/ChatHistory');

// Vector service configuration
const VECTOR_SERVICE_PORT = 5050;
const VECTOR_SERVICE_URL = `http://localhost:${VECTOR_SERVICE_PORT}`;

const anthropic = new Anthropic({
  // apiKey: process.env.CLAUDE_API_KEY,
  apiKey: "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"
});

// Import the server module
const server = require('../server');

// Function to query the legal knowledge base using the vector service
async function queryLegalKnowledge(query) {
  try {
    console.log('Querying legal knowledge base with:', query);
    
    // Check if the vector service is running
    const statusResponse = await axios.get(`${VECTOR_SERVICE_URL}/status`);
    
    // If the database is not loaded, try to load it
    if (!statusResponse.data.loaded) {
      console.log('Vector database not loaded, attempting to load it now...');
      
      try {
        // Use the loadVectorDatabase function from server.js
        const loaded = await server.loadVectorDatabase();
        
        if (!loaded) {
          console.error('Failed to load vector database');
          return {
            status: 'error',
            message: 'Failed to load vector database'
          };
        }
        
        console.log('Vector database loaded successfully on demand');
      } catch (loadError) {
        console.error('Error loading vector database:', loadError.message);
        return {
          status: 'error',
          message: `Error loading vector database: ${loadError.message}`
        };
      }
    }
    
    // Query the vector service
    const response = await axios.post(`${VECTOR_SERVICE_URL}/query`, {
      query: query,
      k: 3  // Reduced from 5 to 3 for faster responses
    });
    
    return response.data;
  } catch (error) {
    console.error('Error querying vector service:', error.message);
    
    // If the vector service is not available, return an error
    return {
      status: 'error',
      message: `Error querying vector service: ${error.message}`
    };
  }
}

// Function to extract document type from Claude's response tag
function extractDocumentType(content) {
  // Check for the [LEGAL_DRAFT][DOCUMENT_TYPE] tag
  const match = content.match(/^\[LEGAL_DRAFT\]\[([A-Z_]+)\]/i);
  if (match && match[1]) {
    return match[1].toLowerCase();
  }
  return 'general';
}

// Function to remove the tag from Claude's response
function removeResponseTag(content) {
  // Remove either [GENERAL_RESPONSE] or [LEGAL_DRAFT][DOCUMENT_TYPE] tag
  return content.replace(/^\[(?:GENERAL_RESPONSE|LEGAL_DRAFT\]\[[A-Z_]+)\]\s*/i, '');
}

// Function to get the unified system prompt for all queries
function getUnifiedSystemPrompt() {
  return `You are a legal AI assistant that can both answer general questions and draft legal documents.

  YOUR PRIMARY TASK: Analyze the conversation context and the current user question to determine if it is:
  1. A GENERAL QUESTION (asking for information, explanation, or advice)
  2. A DRAFT REQUEST (asking you to create a legal document)
  3. A FOLLOW-UP to a previous question or request

  HOW TO ANALYZE THE CONVERSATION:
  - Consider the entire conversation history, not just the current message
  - Look for connections between the current message and previous messages
  - If the current message appears to be answering questions you previously asked, use that information to continue the conversation

  HOW TO IDENTIFY REQUEST TYPES:
  - General questions typically ask for information, explanations, or advice
    Examples: "What is a non-disclosure agreement?", "How does bankruptcy work?", "What are my rights as a tenant?"
  - Draft requests may be direct or indirect, and can use various phrasings
    Direct examples: "Draft an NDA", "Write a non-disclosure agreement", "Create a cease and desist letter"
    Indirect examples: "I need an NDA", "Can you help with a rental agreement?", "I'm looking for a contract"
  - Follow-up responses typically provide information you requested or answer questions you asked

  FOR GENERAL QUESTIONS:
  - Provide informative, accurate, and helpful responses
  - Draw on your knowledge of legal concepts and general topics
  - Maintain a professional but friendly tone
  - Be concise but thorough
  - Start your response with "[GENERAL_RESPONSE]" (this tag will be removed before showing to the user)

  FOR DRAFT REQUESTS:
  - For ANY draft request (whether direct like "write NDA" or indirect like "I need an NDA"), ALWAYS ask follow-up questions to gather necessary information UNLESS:
    1. The user has already provided detailed specifications in their request, OR
    2. The user is clearly responding to your previous questions with the necessary information
  - Required information typically includes: parties involved, key terms, jurisdiction, special requirements, etc.
  - Once you have enough information, create a legal draft that mimics the style and structure of professional legal documents
  - Format your draft with appropriate headings, sections, and legal terminology
  - Structure the document according to its type (contract, memo, letter, etc.)
  - Make the draft comprehensive and tailored to the specific request
  - Start your response with "[LEGAL_DRAFT]" followed by the document type in brackets, e.g., "[LEGAL_DRAFT][CONTRACT]" (this tag will be removed before showing to the user)

  FOR FOLLOW-UP RESPONSES:
  - Connect the new information to what was previously discussed
  - If the user is answering questions you asked about a document request, use that information to create or refine the document
  - If you need more information, ask additional specific questions
  - If you now have enough information to create a draft, proceed with creating it

  WHEN CREATING LEGAL DRAFTS, include elements such as:
  - Clear title and introduction
  - Proper identification of parties (for contracts and agreements)
  - Well-organized sections with appropriate headings
  - Formal legal language and terminology
  - Proper formatting appropriate for the document type
  - Signature blocks or conclusion as appropriate

  Base your drafts on the legal knowledge provided in the context (if available) and follow standard legal drafting conventions.
  
  ALWAYS start your response with either "[GENERAL_RESPONSE]" or "[LEGAL_DRAFT][DOCUMENT_TYPE]" to indicate the type of response you are providing.`;
}

router.post('/', async (req, res) => {
  try {
    const { message, patientName, chatHistoryId } = req.body;
    
    console.log('Received message:', message);
    
    // Query the legal knowledge base for all messages
    let legalKnowledge = [];
    try {
      console.log('Querying legal knowledge base');
      const legalResult = await queryLegalKnowledge(message);
      if (legalResult.status === 'success') {
        legalKnowledge = legalResult.results;
      }
    } catch (error) {
      console.error('Error querying legal knowledge:', error);
    }
    
    // Create the legal context from the knowledge base results
    let legalContext = '';
    if (legalKnowledge && legalKnowledge.length > 0) {
      legalContext = 'Legal Knowledge:\n' + legalKnowledge.map(item => 
        `[Relevance Score: ${(1 - item.score).toFixed(2)}]\n${item.content}`
      ).join('\n\n');
    }
    
    // Use the unified system prompt for all queries
    const systemPrompt = getUnifiedSystemPrompt();
    
    // Create the message content
    // Always include legal context if available
    let userContent = message;
    if (legalContext) {
      userContent = `Context:\n${legalContext}\n\nRequest: ${message}`;
    }
    
    // Prepare messages array for Claude API
    let messagesForClaude = [];
    
    // If we have a chat history ID, retrieve the conversation history
    if (chatHistoryId) {
      try {
        // Retrieve chat history from database
        const chatHistory = await ChatHistory.findById(chatHistoryId);
        
        if (chatHistory && chatHistory.messages && chatHistory.messages.length > 0) {
          // Convert the chat history to the format expected by Claude
          messagesForClaude = chatHistory.messages.map(msg => ({
            role: msg.role,
            content: msg.content
          }));
          
          // Add the current message with context
          messagesForClaude.push({
            role: "user",
            content: userContent
          });
        } else {
          // If no chat history found, just use the current message
          messagesForClaude = [{
            role: "user",
            content: userContent
          }];
        }
      } catch (error) {
        console.error('Error retrieving chat history:', error);
        // If there's an error, fall back to just using the current message
        messagesForClaude = [{
          role: "user",
          content: userContent
        }];
      }
    } else {
      // If no chat history ID, just use the current message
      messagesForClaude = [{
        role: "user",
        content: userContent
      }];
    }
    
    // Call Claude API with the full conversation history
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 8000,
      temperature: 0,
      system: systemPrompt,
      messages: messagesForClaude
    });

    // Process the response
    let formattedContent = response.content[0].text;
    
    // Check if the response starts with the legal draft tag
    const isLegalDraft = formattedContent.startsWith('[LEGAL_DRAFT]');
    
    // Extract document type if it's a legal draft
    const documentType = isLegalDraft ? extractDocumentType(formattedContent) : null;
    
    // Remove the tag from the response
    formattedContent = removeResponseTag(formattedContent);
    
    // Create the response object
    const processedResponse = {
      content: formattedContent,
      isGeneralQuestion: !isLegalDraft, // If it's not a draft, it's a general question
      isLegalConversational: false, // No longer using this distinction
      isVagueRequest: false, // No longer using this distinction
      documentType: documentType,
      isLegalDraft: isLegalDraft
    };

    // Create or update chat history
    try {
      if (chatHistoryId) {
        // Update existing chat history
        const chatHistory = await ChatHistory.findById(chatHistoryId);
        if (chatHistory) {
          chatHistory.messages.push(
            { role: 'user', content: message },
            { 
              role: 'assistant', 
              content: formattedContent,
              isLegalDraft: processedResponse.isLegalDraft,
              draftContent: processedResponse.draftContent
            }
          );
          chatHistory.updatedAt = Date.now();
          await chatHistory.save();
          processedResponse.chatHistoryId = chatHistory._id;
        }
      } else {
        // Create new chat history
        const title = message.length > 50 ? message.substring(0, 50) + '...' : message;
        
        let chatHistoryData = {
          title,
          messages: [
            { role: 'user', content: message },
            { 
              role: 'assistant', 
              content: formattedContent,
              isLegalDraft: processedResponse.isLegalDraft,
              draftContent: processedResponse.draftContent
            }
          ]
        };
        
        const chatHistory = new ChatHistory(chatHistoryData);
        await chatHistory.save();
        processedResponse.chatHistoryId = chatHistory._id;
      }
    } catch (error) {
      console.error('Error saving chat history:', error);
    }

    res.json(processedResponse);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Error processing request' });
  }
});

module.exports = router;
