require("dotenv").config();
const express = require("express");
const cors = require("cors");
const connectDB = require("./config/db");
const chatRoutes = require('./routes/chat');
const chatHistoryRoutes = require('./routes/chatHistory');
const path = require('path');
const fs = require("fs");
const { spawn } = require('child_process');
const AWS = require('aws-sdk');
const { VECTOR_SERVICE_PORT } = require('./utils/vectorDatabaseUtils');

// Configure AWS SDK
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION || 'us-east-1'
});

// Initialize S3
const s3 = new AWS.S3();

// Verify S3 bucket exists
const S3_BUCKET = process.env.S3_BUCKET_NAME;
if (S3_BUCKET) {
  s3.headBucket({ Bucket: S3_BUCKET }, (err, data) => {
    if (err) {
      console.error(`Error accessing S3 bucket ${S3_BUCKET}:`, err.message);
    } else {
      console.log(`Successfully connected to S3 bucket: ${S3_BUCKET}`);
    }
  });
} else {
  console.warn('S3_BUCKET_NAME not set in environment variables');
}

// Initialize Express app
const app = express();

// Set the port, either from the environment variable or default to 5001
const port = process.env.PORT || 5001;

// Vector service process
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


// Connect to MongoDB
connectDB();

// Middleware
app.use(cors());
app.use(express.json());

// Create required directories if they don't exist
if (!fs.existsSync("./uploads")) {
  fs.mkdirSync("./uploads");
}

if (!fs.existsSync("./data")) {
  fs.mkdirSync("./data");
  console.log("Created data directory for document storage");
}

// Import document routes
const documentRoutes = require('./routes/documents');

// Routes
app.use('/api/chat', chatRoutes);
app.use('/api/chat-history', chatHistoryRoutes);
app.use('/api/documents', documentRoutes);


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

// Export the app
module.exports = {
  app
};
