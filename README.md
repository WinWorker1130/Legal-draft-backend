# Legal-draft Backend

This is the backend server for the Legal-draft application, which provides legal document drafting and assistance using AI.

## Features

- AI-powered legal document drafting
- Legal knowledge base with vector search
- Chat history management
- Document viewing and management
- AWS S3 integration for document storage

## Setup

1. Install dependencies:
   ```
   npm install
   ```

2. Configure environment variables in `.env` file:
   ```
   MONGODB_URI=your_mongodb_connection_string
   PORT=5001
   CLAUDE_API_KEY=your_claude_api_key
   OPENAI_API_KEY=your_openai_api_key
   ```

3. Start the server:
   ```
   node server.js
   ```

## AWS S3 Integration

The application supports fetching documents from AWS S3 in addition to local files. To configure AWS S3 integration:

1. Add AWS credentials to your `.env` file:
   ```
   AWS_ACCESS_KEY_ID=your_aws_access_key_id
   AWS_SECRET_ACCESS_KEY=your_aws_secret_access_key
   AWS_REGION=your_aws_region
   S3_BUCKET_NAME=your_s3_bucket_name
   ```

2. To fetch a document from S3, use the `/api/documents/:filename` endpoint with the `source=s3` query parameter:
   ```
   GET /api/documents/mydocument.pdf?source=s3
   ```

3. You can also specify a custom S3 key if the filename is different from the key:
   ```
   GET /api/documents/mydocument.pdf?source=s3&key=folder/custom-key.pdf
   ```

## API Endpoints

### Chat

- `POST /api/chat` - Send a message to the AI assistant
  - Request body: `{ "message": "Your message", "chatHistoryId": "optional-chat-history-id" }`
  - Response: AI assistant's response with document references

### Chat History

- `GET /api/chat-history` - Get all chat histories
- `GET /api/chat-history/conversation/:id` - Get a specific chat history
- `DELETE /api/chat-history/:id` - Delete a chat history

### Documents

- `GET /api/documents/:filename` - Get a document by filename
  - Query parameters:
    - `source` - Source of the document (`local` or `s3`), defaults to `local`
    - `key` - S3 key if different from filename (only used when `source=s3`)

## Vector Database

The application uses a FAISS vector database to store and search legal knowledge. The vector database is created using the `create_vector_database.py` script in the `python` directory.

To create or update the vector database:

1. Place your legal documents in the `data` directory
2. Run the script:
   ```
   cd python
   python create_vector_database.py
   ```

This will create `vector_database.faiss` and `vector_database.pkl` files in the root directory, which are used by the application to search for relevant legal knowledge.
