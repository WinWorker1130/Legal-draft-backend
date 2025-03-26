require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const chatRoutes = require('./routes/chat');
const chatHistoryRoutes = require('./routes/chatHistory');
const path = require('path');
const fs = require("fs");
const { spawn } = require('child_process');
const axios = require('axios');

// Initialize Express app
const app = express();

// Set the port, either from the environment variable or default to 5001
const port = process.env.PORT || 5001;

// Vector service configuration
const VECTOR_SERVICE_PORT = 5050;
const VECTOR_SERVICE_URL = `http://localhost:${VECTOR_SERVICE_PORT}`;
let vectorServiceProcess = null;

// Function to start the vector service
async function startVectorService() {
  // Start the vector service process
  const pythonScriptPath = path.join(__dirname, 'python', 'vector_service.py');
  vectorServiceProcess = spawn('python', [pythonScriptPath, VECTOR_SERVICE_PORT.toString()]);
  
  // Log output from the vector service
  vectorServiceProcess.stdout.on('data', (data) => {
    console.log(`Vector Service: ${data.toString().trim()}`);
  });
  
  vectorServiceProcess.stderr.on('data', (data) => {
    console.error(`Vector Service Error: ${data.toString().trim()}`);
  });
  
  vectorServiceProcess.on('close', (code) => {
    console.log(`Vector service process exited with code ${code}`);
    vectorServiceProcess = null;
  });
  
  // Wait for the service to start
  console.log('Waiting for vector service to start...');
  await new Promise(resolve => setTimeout(resolve, 2000)); // Reduced from 3000ms to 2000ms
  
  console.log('Vector service started. Database will be loaded on first query.');
}

// Function to load the vector database (called on first query)
async function loadVectorDatabase() {
  // Path to the vector database
  const vectorDatabasePath = path.join(__dirname, 'vector_database.pkl');
  
  try {
    // Check if the database is already loaded
    const statusResponse = await axios.get(`${VECTOR_SERVICE_URL}/status`);
    
    if (statusResponse.data.loaded) {
      console.log('Vector database already loaded');
      return true;
    }
    
    console.log('Loading vector database...');
    const response = await axios.post(`${VECTOR_SERVICE_URL}/load`, {
      path: vectorDatabasePath
    });
    
    if (response.data.status === 'success') {
      console.log('Vector database loaded successfully');
      return true;
    } else {
      console.error('Failed to load vector database:', response.data.message);
      return false;
    }
  } catch (error) {
    console.error('Error loading vector database:', error.message);
    return false;
  }
}

// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Create uploads directory if it doesn't exist
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/chat-history', chatHistoryRoutes);


// Start the server on the specified port
app.listen(port, async () => {
  console.log(`Server running on port ${port}`);
  
  // Start the vector service
  await startVectorService();
});

// Handle server shutdown
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  
  // Kill the vector service process if it exists
  if (vectorServiceProcess) {
    console.log('Terminating vector service...');
    vectorServiceProcess.kill();
  }
  
  process.exit(0);
});

// Export the app and loadVectorDatabase function
module.exports = {
  app,
  loadVectorDatabase
};
