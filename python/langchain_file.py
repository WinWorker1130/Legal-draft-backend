from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.docstore.document import Document
from langchain_openai import OpenAIEmbeddings
from langchain_community.vectorstores import FAISS
import os
import json
from datetime import datetime
from pymongo import MongoClient
from dotenv import load_dotenv

load_dotenv()

# MongoDB setup
client = MongoClient(os.getenv('MONGODB_URI'))
db = client.medical_data
vector_collection = db.vector_store

class DocumentProcessor:
    def __init__(self):
        self.embeddings = OpenAIEmbeddings()
        self.text_splitter = RecursiveCharacterTextSplitter(
            chunk_size=1000,  # Smaller chunks for more precise retrieval
            chunk_overlap=200,
            length_function=len,
            separators=["\n\n", "\n", ".", " ", ""]
        )
        
    def process_text_with_langchain(self, text_file_path, patient_name, file_name, original_pdf_path):
        try:
            with open(text_file_path, 'r', encoding='utf-8') as file:
                text = file.read()

            # Extract page markers and content
            page_contents = []
            current_page = 1
            current_content = []
            
            for line in text.split('\n'):
                if line.startswith('<<<PAGE_'):
                    if current_content:
                        page_contents.append({
                            'page': current_page,
                            'content': '\n'.join(current_content)
                        })
                    current_content = []
                    current_page = int(line.replace('<<<PAGE_', '').replace('>>>', ''))
                elif not line.startswith('<<<END_PAGE_'):
                    current_content.append(line)
            
            if current_content:
                page_contents.append({
                    'page': current_page,
                    'content': '\n'.join(current_content)
                })

            # Create documents with proper page numbers
            documents = []
            for page_content in page_contents:
                chunks = self.text_splitter.split_text(page_content['content'])
                for chunk in chunks:
                    doc = Document(
                        page_content=chunk,
                        metadata={
                            "fileName": os.path.splitext(file_name)[0],
                            "patientName": patient_name,
                            "pageNumber": page_content['page'],
                            "source": original_pdf_path
                        }
                    )
                    documents.append(doc)

            # Create vector store
            vectorstore = FAISS.from_documents(documents, self.embeddings)
            
            # Save vector store
            vector_store_path = os.path.join(os.path.dirname(text_file_path), 'vectors')
            os.makedirs(vector_store_path, exist_ok=True)
            vectorstore.save_local(vector_store_path, 'patient_vectors')

            return {
                "status": "success",
                "documents": [{
                    "pageContent": doc.page_content,
                    "metadata": doc.metadata
                } for doc in documents],
                "vector_store_path": vector_store_path
            }

        except Exception as e:
            print(f"Error processing file with Langchain: {str(e)}")
            return {
                "status": "error",
                "error": str(e)
            }

    def _extract_page_number(self, text, position):
        """Extract page number from OCR markers near the chunk position"""
        try:
            # Look for page markers in nearby text
            context = text[max(0, position - 100):position + 100]
            # Match patterns like "=== PAGE X ===" or "Page X" etc.
            import re
            page_matches = re.findall(r'(?:===\s*PAGE\s*(\d+)|Page\s*(\d+))', context)
            if page_matches:
                # Return the first found page number
                return int(next(num for match in page_matches for num in match if num))
            return None
        except:
            return None
        
    def search_documents(self, query, patient_name=None, k=3):
        """Search across vector stores with enhanced metadata retrieval"""
        try:
            results = []
            # Build query for MongoDB
            mongo_query = {}
            if patient_name:
                mongo_query["patientName"] = patient_name
                
            vector_stores = vector_collection.find(mongo_query)
            
            for store_info in vector_stores:
                vector_store_path = store_info["vector_store_path"]
                if os.path.exists(vector_store_path):
                    try:
                        vectorstore = FAISS.load_local(
                            vector_store_path,
                            self.embeddings,
                            allow_dangerous_deserialization=True
                        )
                        docs = vectorstore.similarity_search_with_score(query, k=k)
                        # Add similarity score to metadata
                        for doc, score in docs:
                            doc.metadata["similarity_score"] = float(score)
                            results.append(doc)
                    except Exception as e:
                        print(f"Error loading vector store {vector_store_path}: {str(e)}")
                        continue
            
            # Sort results by similarity score
            sorted_results = sorted(
                results,
                key=lambda x: x.metadata.get('similarity_score', float('inf'))
            )[:k]

            return {
                "status": "success",
                "results": [{
                    "pageContent": doc.page_content,
                    "metadata": doc.metadata
                } for doc in sorted_results]
            }
            
        except Exception as e:
            print(f"Error searching documents: {str(e)}")
            return {
                "status": "error",
                "error": str(e)
            }

# Create a global instance of the document processor
document_processor = DocumentProcessor()

def process_ocr_result(text_file_path, patient_name, file_name, original_pdf_path):
    """Process OCR results with Langchain"""
    return document_processor.process_text_with_langchain(
        text_file_path,
        patient_name,
        file_name,
        original_pdf_path
    )

def search_documents(query, patient_name=None, k=3):
    """Search documents with enhanced metadata"""
    return document_processor.search_documents(query, patient_name, k)