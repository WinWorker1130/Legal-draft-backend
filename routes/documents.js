// routes/documents.js
const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const mammoth = require('mammoth');
const pdf = require('pdf-parse');
const AWS = require('aws-sdk');

// Configure AWS SDK with environment variables
// These should be set in the .env file
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'YOUR_ACCESS_KEY_ID',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'YOUR_SECRET_ACCESS_KEY',
  region: process.env.AWS_REGION || 'us-east-1'
});

// S3 bucket name
const S3_BUCKET = process.env.S3_BUCKET_NAME || 'your-bucket-name';

// Base directory for document files
const DATA_DIR = path.join(__dirname, '..', 'data');

/**
 * Convert a document to HTML based on its file type
 * @param {string} filePath - Path to the document file
 * @param {Buffer} fileBuffer - Optional buffer containing file data (for S3 files)
 * @returns {Promise<string>} - HTML content of the document
 */
async function convertDocumentToHtml(filePath, fileBuffer = null) {
  const fileExtension = path.extname(filePath).toLowerCase();
  
  try {
    if (fileExtension === '.docx') {
      // Convert DOCX to HTML
      if (fileBuffer) {
        const result = await mammoth.convertToHtml({ buffer: fileBuffer });
        return result.value;
      } else {
        const result = await mammoth.convertToHtml({ path: filePath });
        return result.value;
      }
    } else if (fileExtension === '.pdf') {
      // Convert PDF to text
      const dataBuffer = fileBuffer || await fs.readFile(filePath);
      const data = await pdf(dataBuffer);
      // Wrap text in HTML paragraphs
      return data.text.split('\n\n')
        .filter(paragraph => paragraph.trim().length > 0)
        .map(paragraph => `<p>${paragraph}</p>`)
        .join('');
    } else {
      // For other file types, just read as text
      const content = fileBuffer ? fileBuffer.toString('utf8') : await fs.readFile(filePath, 'utf8');
      return `<pre>${content}</pre>`;
    }
  } catch (error) {
    console.error(`Error converting document to HTML: ${error.message}`);
    throw error;
  }
}

/**
 * Find a document in the data directory by its filename
 * @param {string} filename - Name of the file to find
 * @returns {Promise<string|null>} - Full path to the file or null if not found
 */
async function findDocumentPath(filename) {
  // Function to recursively search for a file
  async function searchDirectory(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively search subdirectories
        const result = await searchDirectory(fullPath);
        if (result) return result;
      } else if (entry.name === filename) {
        // Found the file
        return fullPath;
      }
    }
    
    return null;
  }
  
  return searchDirectory(DATA_DIR);
}

/**
 * Get a document from AWS S3
 * @param {string} key - S3 object key
 * @returns {Promise<{buffer: Buffer, contentType: string}>} - Document buffer and content type
 */
async function getDocumentFromS3(key) {
  try {
    // Use the key as is, since it should already include the correct path
    console.log(`Fetching from S3: ${key}`);
    
    const params = {
      Bucket: S3_BUCKET,
      Key: key
    };
    
    const data = await s3.getObject(params).promise();
    
    return {
      buffer: data.Body,
      contentType: data.ContentType
    };
  } catch (error) {
    console.error(`Error getting document from S3: ${error.message}`);
    throw error;
  }
}

// Route to get document content by filename
router.get('/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    const source = req.query.source || 'local'; // 'local' or 's3'
    
    if (source === 's3') {
      // Get document from S3
      try {
        const s3Key = req.query.key || filename;
        const { buffer, contentType } = await getDocumentFromS3(s3Key);
        
        // Convert document to HTML
        const fileExtension = path.extname(filename).toLowerCase();
        const htmlContent = await convertDocumentToHtml(filename, buffer);
        
        // Return document content
        res.json({
          status: 'success',
          filename,
          source: 's3',
          path: s3Key,
          content: htmlContent
        });
      } catch (s3Error) {
        console.error(`Error retrieving document from S3: ${s3Error.message}`);
        
        // If S3 retrieval fails, try local as fallback
        const documentPath = await findDocumentPath(filename);
        
        if (!documentPath) {
          return res.status(404).json({ 
            status: 'error', 
            message: `Document '${filename}' not found in S3 or locally` 
          });
        }
        
        // Convert document to HTML
        const htmlContent = await convertDocumentToHtml(documentPath);
        
        // Return document content
        res.json({
          status: 'success',
          filename,
          source: 'local',
          path: documentPath.replace(DATA_DIR, ''),
          content: htmlContent
        });
      }
    } else {
      // Find the document path locally
      const documentPath = await findDocumentPath(filename);
      
      if (!documentPath) {
        return res.status(404).json({ 
          status: 'error', 
          message: `Document '${filename}' not found` 
        });
      }
      
      // Convert document to HTML
      const htmlContent = await convertDocumentToHtml(documentPath);
      
      // Return document content
      res.json({
        status: 'success',
        filename,
        source: 'local',
        path: documentPath.replace(DATA_DIR, ''),
        content: htmlContent
      });
    }
  } catch (error) {
    console.error(`Error retrieving document: ${error.message}`);
    res.status(500).json({ 
      status: 'error', 
      message: `Error retrieving document: ${error.message}` 
    });
  }
});

const multer = require('multer');
const { spawn } = require('child_process');

// Configure multer for file uploads with memory storage
const storage = multer.memoryStorage();

// File filter to only accept PDF and DOCX files
const fileFilter = (req, file, cb) => {
  // Check file mimetype
  if (
    file.mimetype === 'application/pdf' || 
    file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only PDF and DOCX files are allowed'), false);
  }
};

const upload = multer({ 
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

/**
 * Upload a file to AWS S3
 * @param {Object} file - Multer file object
 * @returns {Promise<Object>} - Upload result with file metadata
 */
async function uploadFileToS3(file) {
  try {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const filename = path.basename(file.originalname, ext) + '-' + uniqueSuffix + ext;
    const key = `data/${filename}`;
    
    const params = {
      Bucket: S3_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype
    };
    
    console.log(`Uploading file to S3: ${key}`);
    await s3.upload(params).promise();
    console.log(`Successfully uploaded file to S3: ${key}`);
    
    return {
      originalName: file.originalname,
      filename: filename,
      s3Key: key,
      size: file.size,
      mimetype: file.mimetype,
      source: 's3'
    };
  } catch (error) {
    console.error(`Error uploading file to S3: ${error.message}`);
    throw error;
  }
}

// Error handler middleware for multer errors
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        status: 'error',
        message: 'File too large. Maximum file size is 10MB.'
      });
    }
    return res.status(400).json({
      status: 'error',
      message: `Upload error: ${err.message}`
    });
  } else if (err) {
    // An unknown error occurred
    return res.status(400).json({
      status: 'error',
      message: err.message
    });
  }
  // If no error, continue
  next();
};

// Route to upload documents to S3 and update vector DB
router.post('/upload', upload.array('files', 10), handleMulterError, async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'No files uploaded'
      });
    }

    // Upload files to S3
    const uploadedFiles = [];
    for (const file of req.files) {
      try {
        const uploadResult = await uploadFileToS3(file);
        uploadedFiles.push(uploadResult);
      } catch (uploadError) {
        console.error(`Error uploading file ${file.originalname} to S3: ${uploadError.message}`);
        // Continue with other files even if one fails
      }
    }

    if (uploadedFiles.length === 0) {
      return res.status(500).json({
        status: 'error',
        message: 'Failed to upload any files to S3'
      });
    }

    // Log the uploaded files
    console.log(`Uploaded ${uploadedFiles.length} files to S3:`);
    uploadedFiles.forEach(file => {
      console.log(`- ${file.originalName} (${file.filename}, S3 key: ${file.s3Key})`);
    });

    try {
      // Update the vector database with S3 file information
      await updateVectorDatabase();
      
      res.json({
        status: 'success',
        message: `${uploadedFiles.length} files uploaded to S3 and vector database updated`,
        files: uploadedFiles
      });
    } catch (dbError) {
      console.error(`Error updating vector database: ${dbError.message}`);
      // Still return success for the upload but with a warning
      res.status(207).json({
        status: 'partial_success',
        message: `Files uploaded to S3 but there was an error updating the vector database: ${dbError.message}`,
        files: uploadedFiles
      });
    }
  } catch (error) {
    console.error(`Error uploading files: ${error.message}`);
    res.status(500).json({
      status: 'error',
      message: `Error uploading files: ${error.message}`
    });
  }
});

// Function to update the vector database by running the Python script
function updateVectorDatabase() {
  return new Promise((resolve, reject) => {
    const pythonScriptPath = path.join(__dirname, '..', 'python', 'create_vector_database.py');
    const process = spawn('python', [pythonScriptPath]);

    process.stdout.on('data', (data) => {
      console.log(`Vector Database Update: ${data.toString().trim()}`);
    });

    process.stderr.on('data', (data) => {
      console.error(`Vector Database Update Error: ${data.toString().trim()}`);
    });

    process.on('close', (code) => {
      console.log(`Vector database update process exited with code ${code}`);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });
  });
}

module.exports = router;
