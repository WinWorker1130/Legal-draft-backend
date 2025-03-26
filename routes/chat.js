// routes/chat.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs').promises;
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

// Function to detect if the message is conversational rather than a document request
function isConversationalMessage(message) {
  // Check if message is empty or very short
  if (!message || message.trim().length < 5) {
    return true;
  }
  
  // Check if message is a greeting or common conversation starter
  const conversationalPatterns = [
    /^(hi|hello|hey|greetings|howdy)/i,
    /^(good morning|good afternoon|good evening)/i,
    /^(how are you|how's it going|what's up)/i,
    /^(help|can you help|assist me)/i,
    /^(thanks|thank you)/i,
    /^(who are you|what can you do)/i
  ];
  
  if (conversationalPatterns.some(pattern => pattern.test(message.trim()))) {
    return true;
  }
  
  // Check if it's a question without specific document keywords
  const documentKeywords = [
    'contract', 'agreement', 'draft', 'document', 'legal', 'memo', 'memorandum',
    'brief', 'letter', 'opinion', 'analysis', 'complaint', 'motion'
  ];
  
  if (message.endsWith('?') && 
      !documentKeywords.some(keyword => message.toLowerCase().includes(keyword))) {
    return true;
  }
  
  return false;
}

// Function to detect if the message is a general question (not legal-specific)
function isGeneralQuestion(message) {
  // Check if the message is a question (ends with ? or starts with who/what/when/where/why/how)
  const isQuestion = message.endsWith('?') || 
    /^(who|what|when|where|why|how)\s/i.test(message);
  
  // List of topics that would indicate a general (non-legal) question
  const generalTopics = [
    'weather', 'sports', 'news', 'history', 'science', 'technology', 
    'music', 'movie', 'film', 'book', 'travel', 'food', 'recipe',
    'health', 'exercise', 'education', 'language', 'math', 'calculation',
    'translate', 'meaning', 'definition', 'explain', 'difference', 'compare',
    'best', 'recommend', 'suggestion', 'advice', 'help', 'how to', 'tutorial',
    'guide', 'instruction', 'steps', 'process', 'procedure', 'method'
  ];
  
  // Check if the message contains general topics
  const containsGeneralTopic = generalTopics.some(topic => 
    message.toLowerCase().includes(topic)
  );
  
  // Legal keywords that would indicate a legal question
  const legalKeywords = [
    'contract', 'agreement', 'law', 'legal', 'court', 'rights',
    'attorney', 'lawyer', 'plaintiff', 'defendant', 'lawsuit',
    'sue', 'litigation', 'judge', 'statute', 'regulation', 'clause',
    'provision', 'draft', 'document', 'memo', 'memorandum', 'brief',
    'letter', 'opinion', 'analysis', 'complaint', 'motion'
  ];
  
  // Check if the message does NOT contain legal keywords
  const doesNotContainLegalKeywords = !legalKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
  
  // It's a general question if it's a question AND (contains general topics OR doesn't contain legal keywords)
  return isQuestion && (containsGeneralTopic || doesNotContainLegalKeywords);
}

// Function to detect if the message is vague but might be requesting a document
function isVagueDocumentRequest(message) {
  // Check if message contains document keywords but is too short or lacks specifics
  const documentKeywords = [
    'contract', 'agreement', 'draft', 'document', 'legal', 'memo', 'memorandum',
    'brief', 'letter', 'opinion', 'analysis', 'complaint', 'motion'
  ];
  
  const hasDocumentKeyword = documentKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
  
  // If it has a document keyword but is very short, it's likely vague
  if (hasDocumentKeyword && message.split(' ').length < 8) {
    return true;
  }
  
  return false;
}

// Function to detect the type of legal document being requested
function detectDocumentType(message) {
  const documentTypes = {
    contract: ['contract', 'agreement', 'terms', 'conditions', 'service agreement', 'employment contract'],
    memo: ['memo', 'memorandum', 'legal memo', 'legal memorandum'],
    brief: ['brief', 'legal brief', 'court brief', 'amicus brief'],
    letter: ['letter', 'legal letter', 'demand letter', 'cease and desist'],
    opinion: ['opinion', 'legal opinion', 'advisory opinion'],
    analysis: ['analysis', 'legal analysis', 'case analysis'],
    complaint: ['complaint', 'legal complaint', 'lawsuit', 'petition'],
    motion: ['motion', 'legal motion', 'court motion'],
    general: ['draft', 'document', 'legal document']
  };
  
  const messageLower = message.toLowerCase();
  
  // Check each document type for keyword matches
  for (const [type, keywords] of Object.entries(documentTypes)) {
    if (keywords.some(keyword => messageLower.includes(keyword))) {
      return type;
    }
  }
  
  // Default to general if no specific type is detected
  return 'general';
}

// Function to check if a message is nonsensical or random text
function isNonsensicalInput(message) {
  if (!message) return false;
  
  // Trim and normalize the message
  const normalizedMessage = message.trim().toLowerCase();
  
  // Check for very short messages that aren't common greetings
  if (normalizedMessage.length < 10 && 
      !['hi', 'hey', 'hello', 'help'].includes(normalizedMessage)) {
    return true;
  }
  
  // Split into words
  const words = normalizedMessage.split(/\s+/);
  
  // Check for messages with very few words
  if (words.length < 2) {
    return true;
  }
  
  // Check for random character sequences (high consonant to vowel ratio)
  const letters = normalizedMessage.replace(/[^a-z]/g, '');
  if (letters.length > 5) {
    const vowels = letters.match(/[aeiou]/g) || [];
    const vowelRatio = vowels.length / letters.length;
    
    // Normal English text has a vowel ratio of roughly 0.3-0.5
    // Very low vowel ratio suggests random characters
    if (vowelRatio < 0.1) {
      return true;
    }
  }
  
  // Check for repetitive patterns that suggest nonsensical input
  const repeatedChars = normalizedMessage.match(/(.)\1{3,}/g); // Same character repeated 4+ times
  if (repeatedChars && repeatedChars.length > 0) {
    return true;
  }
  
  // Check for keyboard smashes (common patterns in random typing)
  const keyboardPatterns = [
    /asdf/i, /qwer/i, /zxcv/i, /hjkl/i, /uiop/i, /jkl;/i,
    /1234/i, /7890/i, /tyui/i, /bnm/i, /fghj/i
  ];
  
  if (keyboardPatterns.some(pattern => pattern.test(normalizedMessage))) {
    return true;
  }
  
  return false;
}

// Function to check if a message is a valid legal document request
function isValidLegalRequest(message) {
  // First check if the message is nonsensical
  if (isNonsensicalInput(message)) {
    return false;
  }
  
  // Check if message contains at least some legal terminology
  const legalKeywords = [
    'contract', 'agreement', 'law', 'legal', 'court', 'rights',
    'attorney', 'lawyer', 'plaintiff', 'defendant', 'lawsuit',
    'sue', 'litigation', 'judge', 'statute', 'regulation', 'clause',
    'provision', 'draft', 'document', 'memo', 'memorandum', 'brief',
    'letter', 'opinion', 'analysis', 'complaint', 'motion'
  ];
  
  // Check if message contains any legal keywords
  const hasLegalKeyword = legalKeywords.some(keyword => 
    message.toLowerCase().includes(keyword)
  );
  
  // Check if message has some minimal structure (e.g., complete sentences)
  const hasStructure = message.split(' ').length >= 3 && 
                       /[.!?]/.test(message);
  
  // It's a valid legal request if it has legal keywords OR proper sentence structure
  return hasLegalKeyword || hasStructure;
}

// Function to check if the assistant's response is actually a legal document draft
function isResponseLegalDraft(content) {
  if (!content) return false;
  
  // Convert to lowercase for case-insensitive matching
  const contentLower = content.toLowerCase();
  
  // First, check if this is a conversational response or greeting
  // If it contains common conversational phrases, it's not a legal draft
  const conversationalPatterns = [
    /^hello/i,
    /^hi\b/i,
    /^hey\b/i,
    /^greetings/i,
    /^good (morning|afternoon|evening)/i,
    /^i('m| am) (a|your)/i,
    /^as (a|your|an)/i,
    /^how can i (help|assist)/i,
    /^i('d| would) be happy to/i,
    /^i understand/i,
    /^thank you/i,
    /^you're welcome/i,
    /^is there anything else/i
  ];
  
  // If any conversational pattern is found at the beginning of the content, it's not a draft
  if (conversationalPatterns.some(pattern => pattern.test(contentLower.trim()))) {
    return false;
  }
  
  // Check for very short responses (definitely not legal drafts)
  if (content.length < 200) {
    return false;
  }
  
  // Check for document title/header patterns
  const documentTitlePatterns = [
    /^.*agreement/i,
    /^.*contract/i,
    /^.*memorandum/i,
    /^.*letter/i,
    /^.*opinion/i,
    /^.*brief/i,
    /^.*motion/i,
    /^.*complaint/i,
    /^.*analysis/i
  ];
  
  // Check first few lines for document titles
  const firstLines = content.split('\n').slice(0, 5).join('\n');
  const hasDocumentTitle = documentTitlePatterns.some(pattern => 
    pattern.test(firstLines)
  );
  
  // Check for legal document structure indicators
  const structureIndicators = [
    // Parties section
    /party [a-z]/i,
    /between.*and/i,
    /hereinafter/i,
    
    // Sections and clauses
    /section \d/i,
    /article \d/i,
    /clause \d/i,
    /paragraph \d/i,
    
    // Common legal document components
    /whereas/i,
    /witnesseth/i,
    /in witness whereof/i,
    /now, therefore/i,
    
    // Signature blocks
    /signature/i,
    /signed by/i,
    /dated/i
  ];
  
  // Count the number of legal structure indicators found
  const legalStructureCount = structureIndicators.reduce((count, indicator) => {
    const matches = contentLower.match(indicator) || [];
    return count + matches.length;
  }, 0);
  
  // Check for question patterns that would indicate it's not a draft
  const questionPatterns = [
    /\?\s*$/m,  // Lines ending with question marks
    /what is/i,
    /what are/i,
    /do you/i,
    /can you/i,
    /would you/i,
    /please provide/i,
    /please answer/i
  ];
  
  // Count the number of question patterns found
  const questionCount = questionPatterns.reduce((count, pattern) => {
    const matches = contentLower.match(pattern) || [];
    return count + matches.length;
  }, 0);
  
  // If there are multiple questions, it's likely not a draft
  const hasMultipleQuestions = questionCount >= 2;
  
  // It's a legal draft if:
  // 1. It has a document title AND at least one legal structure indicator, AND
  // 2. It doesn't have multiple questions, AND
  // 3. It's not a conversational response
  return hasDocumentTitle && legalStructureCount >= 1 && !hasMultipleQuestions;
}

// Function to get the general AI system prompt
function getGeneralAIPrompt() {
  return `You are a helpful AI assistant that can answer questions on a wide range of topics.
  
  Provide informative, accurate, and helpful responses to the user's questions.
  
  Draw on your general knowledge to answer questions about:
  - Science, technology, and mathematics
  - History, geography, and current events
  - Arts, entertainment, and culture
  - Health, fitness, and wellness
  - And many other topics
  
  If you're unsure about something, acknowledge the limitations of your knowledge.
  
  Maintain a friendly, conversational tone while being informative and helpful.
  
  Do not mention that you are a legal assistant unless the user asks about legal topics.`;
}

// Function to get the conversational system prompt for legal topics
function getLegalConversationalPrompt() {
  return `You are a helpful legal assistant that can draft legal documents and answer questions.

  If the user's message is vague or unclear, ask follow-up questions to understand what they need.
  
  If they're asking for general information about legal topics, provide helpful responses based on your knowledge.
  
  If they're requesting a legal document, gather the necessary information to create it properly.
  
  Always maintain a professional but friendly tone. If greeting the user, briefly mention your capabilities
  as a legal document drafting assistant.
  
  When the user asks for a specific legal document, you should ask for the necessary details to create it properly.
  For example:
  - For contracts: Ask about the parties involved, the subject matter, key terms, etc.
  - For legal memos: Ask about the legal issue, relevant facts, etc.
  - For legal letters: Ask about the recipient, purpose, key points to address, etc.`;
}

// Function to get the system prompt for vague document requests
function getVagueDocumentPrompt() {
  return `You are a helpful legal assistant that specializes in drafting legal documents.

  The user has made a request that appears to be related to creating a legal document, but their request lacks
  specific details needed to create a proper document.
  
  Ask follow-up questions to gather the necessary information, such as:
  - What specific type of legal document they need
  - The purpose of the document
  - Key information that should be included
  - Any specific requirements or preferences they have
  
  Be helpful and guide them through the process of specifying what they need.`;
}

// Function to get the system prompt based on document type
function getDocumentPrompt(documentType) {
  const basePrompt = `You are a legal document drafting assistant specializing in creating professional ${documentType} documents.
  Create a well-structured legal document based on the user's request and the provided legal knowledge.
  Format your response with:
  1. Clear headings and sections
  2. Formal legal language and terminology
  3. Proper formatting appropriate for a ${documentType}`;
  
  // Add specific guidance based on document type
  switch (documentType) {
    case 'contract':
      return `${basePrompt}
      
      Include the following elements in your contract:
      - Title clearly identifying the type of contract
      - Parties involved with proper legal identification
      - Recitals/Whereas clauses explaining the background and purpose
      - Definitions of key terms used throughout the contract
      - Key terms and conditions with numbered sections
      - Representations and warranties from each party
      - Rights and obligations of each party
      - Term and termination clauses
      - Governing law and jurisdiction
      - Signature blocks for all parties
      
      Use precise, unambiguous language and define all important terms. Structure the contract with numbered sections and subsections for easy reference.`;
      
    case 'memo':
      return `${basePrompt}
      
      Structure your legal memorandum with:
      - TO/FROM/DATE/RE header block
      - Question Presented or Issue section
      - Brief Answer or Short Answer section
      - Facts section with relevant background information
      - Discussion section with legal analysis
      - Conclusion section with recommendations
      
      Include proper legal citations where appropriate and present arguments clearly and logically. Support assertions with legal principles from the knowledge base.`;
      
    case 'brief':
      return `${basePrompt}
      
      Structure your legal brief with:
      - Caption/header with appropriate court information
      - Table of contents and authorities (if extensive)
      - Introduction/Statement of the case
      - Statement of facts
      - Legal argument with headings for each major point
      - Conclusion with specific relief requested
      
      Use proper legal citations, present arguments persuasively, and support assertions with legal principles from the knowledge base.`;
      
    case 'letter':
      return `${basePrompt}
      
      Format your legal letter with:
      - Professional letterhead information
      - Date
      - Recipient's address block
      - Re: line indicating the subject matter
      - Formal salutation
      - Clear paragraphs presenting the purpose and content
      - Formal closing
      - Signature block
      
      Maintain a professional tone appropriate for legal correspondence while clearly communicating the legal position or request.`;
      
    case 'opinion':
      return `${basePrompt}
      
      Structure your legal opinion with:
      - Introduction stating the issues examined
      - Factual background section
      - Legal issues identified
      - Analysis of each issue with reference to relevant law
      - Conclusion with clear opinions on each issue
      - Any necessary qualifications or limitations to the opinion
      
      Provide balanced analysis supported by legal authorities and clear conclusions on the legal questions presented.`;
      
    case 'analysis':
      return `${basePrompt}
      
      Structure your legal analysis with:
      - Executive summary
      - Background/factual context
      - Legal issues identified
      - Analysis of each issue with reference to relevant law
      - Risk assessment where appropriate
      - Recommendations or conclusions
      
      Provide thorough analysis supported by legal authorities and clear practical guidance.`;
      
    case 'complaint':
      return `${basePrompt}
      
      Structure your legal complaint with:
      - Caption with court information
      - Introduction identifying parties
      - Jurisdiction and venue statements
      - Factual allegations
      - Causes of action with elements of each claim
      - Prayer for relief
      - Signature block
      
      Number each paragraph and present factual allegations clearly and concisely.`;
      
    case 'motion':
      return `${basePrompt}
      
      Structure your legal motion with:
      - Caption with court information
      - Title of the motion
      - Introduction stating the relief sought
      - Statement of facts
      - Legal argument supporting the motion
      - Conclusion with specific relief requested
      - Signature block
      
      Present arguments persuasively with appropriate legal citations and clear reasoning.`;
      
    default: // general
      return `${basePrompt}
      
      Based on the user's request, determine the most appropriate legal document format and include all necessary elements for that document type. Use formal legal language, proper structure, and appropriate formatting.
      
      If drafting a contract or agreement, include:
      - Title, parties, recitals, definitions, terms, warranties, termination clauses, governing law, and signature blocks
      
      If drafting a legal memo or brief:
      - Include proper legal citations, present arguments clearly, and support assertions with legal principles
      
      Base your draft on the legal knowledge provided and follow standard legal drafting conventions.`;
  }
}

router.post('/', async (req, res) => {
  try {
    const { message, patientName, chatHistoryId } = req.body;
    
    // Determine the type of message
    const isConversational = isConversationalMessage(message);
    const isGeneralQ = isGeneralQuestion(message);
    const isVagueDocument = !isConversational && !isGeneralQ && isVagueDocumentRequest(message);
    const documentType = detectDocumentType(message);
    const isValidLegal = isValidLegalRequest(message);
    
    console.log(`Message type: ${isGeneralQ ? 'General Question' : (isConversational ? 'Legal Conversational' : (isVagueDocument ? 'Vague Document Request' : 'Document Request'))}`);
    if (!isConversational && !isGeneralQ) {
      console.log(`Detected document type: ${documentType}`);
      console.log(`Is valid legal request: ${isValidLegal}`);
    }
    
    // Query the legal knowledge base for non-conversational, non-general messages
    let legalKnowledge = [];
    if (!isConversational && !isGeneralQ) {
      try {
        console.log('Querying legal knowledge base');
        const legalResult = await queryLegalKnowledge(message);
        if (legalResult.status === 'success') {
          legalKnowledge = legalResult.results;
        }
      } catch (error) {
        console.error('Error querying legal knowledge:', error);
      }
    }
    
    // Create the legal context from the knowledge base results
    let legalContext = '';
    if (legalKnowledge && legalKnowledge.length > 0) {
      legalContext = 'Legal Knowledge:\n' + legalKnowledge.map(item => 
        `[Relevance Score: ${(1 - item.score).toFixed(2)}]\n${item.content}`
      ).join('\n\n');
    }
    
    // Get the appropriate system prompt based on message type
    let systemPrompt;
    if (isGeneralQ) {
      systemPrompt = getGeneralAIPrompt();
    } else if (isConversational) {
      systemPrompt = getLegalConversationalPrompt();
    } else if (isVagueDocument) {
      systemPrompt = getVagueDocumentPrompt();
    } else {
      systemPrompt = getDocumentPrompt(documentType);
    }
    
    // Create the message content
    let userContent;
    if (isConversational || isGeneralQ) {
      userContent = message;
    } else {
      userContent = legalContext 
        ? `Context:\n${legalContext}\n\nRequest: ${message}`
        : `Request: ${message}`;
    }
    
    // Call Claude API
    const response = await anthropic.messages.create({
      model: "claude-3-7-sonnet-20250219",
      max_tokens: 4000, // Reduced from 8000 to improve response time
      temperature: 0,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userContent
        }
      ]
    });

    // Process the response
    const formattedContent = response.content[0].text;
    
    // Check if the response is actually a legal document draft
    const isResponseDraft = isResponseLegalDraft(formattedContent);
    
    // Create the response object with updated isLegalDraft logic
    const processedResponse = {
      content: formattedContent,
      isGeneralQuestion: isGeneralQ,
      isLegalConversational: isConversational && !isGeneralQ,
      isVagueRequest: isVagueDocument,
      documentType: isResponseDraft ? documentType : null,
      isLegalDraft: isResponseDraft
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
