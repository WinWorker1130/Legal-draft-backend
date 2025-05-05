import os
import sys
import json
import pickle
from flask import Flask, request, jsonify
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = Flask(__name__)

# Global variable to store the vector database
vector_store = None

def load_vector_database(pkl_path):
    """
    Load the vector database from a pickle file
    """
    global vector_store
    
    try:
        # Initialize embeddings
        embeddings = OpenAIEmbeddings()
        
        # Check if the file exists
        if not os.path.exists(pkl_path):
            return {
                "status": "error",
                "message": f"File not found: {pkl_path}"
            }
        
        # Load the vector store
        vector_store = FAISS.load_local(
            folder_path=os.path.dirname(pkl_path),
            embeddings=embeddings,
            index_name=os.path.basename(pkl_path).replace('.pkl', ''),
            allow_dangerous_deserialization=True
        )
        
        return {
            "status": "success",
            "message": "Vector database loaded successfully"
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

def query_vector_database(query, k=3):  # Reduced from 5 to 3 for faster responses
    """
    Query the vector database for relevant information
    """
    global vector_store
    
    try:
        if vector_store is None:
            return {
                "status": "error",
                "message": "Vector database not loaded"
            }
            
        # Perform similarity search
        docs = vector_store.similarity_search_with_score(query, k=k)
        
        # Format results
        results = []
        for doc, score in docs:
            # Ensure metadata is properly formatted for S3 sources
            metadata = doc.metadata.copy() if doc.metadata else {}
            
            # Normalize metadata keys for consistency
            if 'source_type' in metadata and metadata['source_type'] == 's3' and 's3_key' in metadata:
                # Ensure S3 metadata is properly formatted
                metadata['s3_key'] = metadata['s3_key']
                metadata['file_name'] = metadata.get('file_name', metadata['s3_key'].split('/')[-1])
            
            results.append({
                "content": doc.page_content,
                "metadata": metadata,
                "score": float(score)
            })
        
        return {
            "status": "success",
            "results": results
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

@app.route('/load', methods=['POST'])
def load_database():
    """
    Endpoint to load the vector database
    """
    data = request.json
    vector_database_path = data.get('path')
    
    if not vector_database_path:
        return jsonify({
            "status": "error",
            "message": "Vector database path not provided"
        })
    
    result = load_vector_database(vector_database_path)
    return jsonify(result)

@app.route('/query', methods=['POST'])
def query():
    """
    Endpoint to query the vector database
    """
    data = request.json
    query_text = data.get('query')
    k = data.get('k', 5)
    
    if not query_text:
        return jsonify({
            "status": "error",
            "message": "Query not provided"
        })
    
    result = query_vector_database(query_text, k)
    return jsonify(result)

@app.route('/status', methods=['GET'])
def status():
    """
    Endpoint to check if the vector database is loaded
    """
    return jsonify({
        "status": "success",
        "loaded": vector_store is not None
    })

if __name__ == "__main__":
    # Get the port from command line arguments or use default
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    
    # Start the Flask app
    app.run(host='127.0.0.1', port=port)
