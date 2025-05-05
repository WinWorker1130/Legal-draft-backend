// utils/vectorDatabaseUtils.js
const axios = require('axios');
const path = require('path');

// Vector service configuration
const VECTOR_SERVICE_PORT = 5050;
const VECTOR_SERVICE_URL = `http://localhost:${VECTOR_SERVICE_PORT}`;

/**
 * Load the vector database
 * @returns {Promise<boolean>} True if the database was loaded successfully, false otherwise
 */
async function loadVectorDatabase() {
  // Path to the vector database
  const vectorDatabasePath = path.join(__dirname, '..', 'vector_database.pkl');
  
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

/**
 * Query the legal knowledge base using the vector service
 * @param {string} query - The query to search for
 * @returns {Promise<Object>} The query results with source document information
 */
async function queryLegalKnowledge(query) {
  try {
    console.log('Querying legal knowledge base with:', query);
    
    // Check if the vector service is running
    const statusResponse = await axios.get(`${VECTOR_SERVICE_URL}/status`);
    
    // If the database is not loaded, try to load it
    if (!statusResponse.data.loaded) {
      console.log('Vector database not loaded, attempting to load it now...');
      
      try {
        // Use the loadVectorDatabase function
        const loaded = await loadVectorDatabase();
        
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
    
      // Extract source document information from the results
      if (response.data.status === 'success' && response.data.results) {
        // Process source files for both local and S3 sources
        const sourceFiles = response.data.results
          .filter(item => item.metadata && (item.metadata.source || item.metadata.s3_key))
          .map(item => {
            const metadata = item.metadata;
            
            // Handle S3 sources
            if (metadata.source_type === 's3' && metadata.s3_key) {
              // For S3 sources, use the s3_key directly
              return {
                path: metadata.s3_key,
                filename: metadata.file_name || metadata.s3_key.split('/').pop(),
                source: 's3'
              };
            } else {
              // Handle local sources
              const source = metadata.source || '';
              
              // Extract the relative path from the data directory
              let relativePath = '';
              
              // Check if the path contains 'data/'
              const dataIndex = source.indexOf('data');
              if (dataIndex !== -1) {
                // Extract everything after 'data/'
                const pathParts = source.substring(dataIndex).split(/[\/\\]/);
                // Skip the 'data' part and join the rest
                relativePath = pathParts.slice(1).join('/');
              } else {
                // Fallback to just the filename
                relativePath = source.split('\\').pop().split('/').pop();
              }
              
              return {
                path: relativePath,
                filename: metadata.file_name || relativePath,
                source: 'local'
              };
            }
          })
          // Remove duplicates based on path and source
          .filter((file, index, self) => 
            index === self.findIndex(f => 
              f.path === file.path && f.source === file.source
            )
          );
        
        // Add source files to the response (for backward compatibility)
        response.data.sourceFiles = sourceFiles.map(file => file.path);
        
        // Add detailed source file information
        response.data.sourceFileDetails = sourceFiles;
      }
    
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

module.exports = {
  loadVectorDatabase,
  queryLegalKnowledge,
  VECTOR_SERVICE_URL,
  VECTOR_SERVICE_PORT
};
