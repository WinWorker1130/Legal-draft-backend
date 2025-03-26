import sys
import os
import pickle
import json
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

def load_vector_database(pkl_path):
    """
    Load the vector database from a pickle file
    """
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
            "vector_store": vector_store
        }
    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }

def query_vector_database(vector_store, query, k=5):
    """
    Query the vector database for relevant information
    """
    try:
        # Perform similarity search
        docs = vector_store.similarity_search_with_score(query, k=k)
        
        # Format results
        results = []
        for doc, score in docs:
            results.append({
                "content": doc.page_content,
                "metadata": doc.metadata,
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

def main():
    """
    Main function to load and query the vector database
    """
    try:
        # Check arguments
        if len(sys.argv) < 3:
            print(json.dumps({
                "status": "error",
                "message": "Usage: python legal_knowledge.py <vector_database_path> <query>"
            }))
            return
        
        # Get arguments
        vector_database_path = sys.argv[1]
        query = sys.argv[2]
        
        # Load vector database
        load_result = load_vector_database(vector_database_path)
        if load_result["status"] == "error":
            print(json.dumps(load_result))
            return
        
        # Query vector database
        vector_store = load_result["vector_store"]
        query_result = query_vector_database(vector_store, query)
        
        # Print results
        print(json.dumps(query_result))
    except Exception as e:
        print(json.dumps({
            "status": "error",
            "message": str(e)
        }))

if __name__ == "__main__":
    main()
