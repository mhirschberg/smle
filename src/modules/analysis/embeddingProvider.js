const axios = require('axios');
const logger = require('../../utils/logger');

class EmbeddingProvider {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'ollama';
    
    // Ollama config
    this.ollamaEndpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    this.ollamaModel = process.env.EMBEDDING_MODEL || 'nomic-embed-text';
    
    // Gemini config (uses text-embedding-004 model)
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiModel = 'text-embedding-004';
    
    // OpenAI config
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiModel = 'text-embedding-3-small';
    
    logger.info('Embedding Provider initialized', { provider: this.provider });
  }
  
  /**
   * Generate embedding vector
   * @param {string} text - Text to embed
   * @returns {Promise<Array>} Embedding vector
   */
  async generate(text) {
    if (!text || text.length === 0) {
      logger.warn('Empty text for embedding');
      return null;
    }
    
    switch (this.provider) {
      case 'gemini':
        return await this.generateGemini(text);
      
      case 'openai':
        return await this.generateOpenAI(text);
      
      case 'ollama':
      default:
        return await this.generateOllama(text);
    }
  }
  
  /**
   * Generate with Ollama
   */
  async generateOllama(text) {
    try {
      const response = await axios.post(`${this.ollamaEndpoint}/api/embeddings`, {
        model: this.ollamaModel,
        prompt: text
      }, {
        timeout: 30000
      });
      
      return response.data.embedding;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not running');
      }
      throw error;
    }
  }
  
  /**
   * Generate with Google Gemini
   */
  async generateGemini(text) {
    try {
      if (!this.geminiApiKey) {
        throw new Error('GEMINI_API_KEY not configured in .env');
      }
      
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.geminiApiKey);
      
      const model = genAI.getGenerativeModel({ model: this.geminiModel });
      
      const result = await model.embedContent(text);
      const embedding = result.embedding;
      
      return embedding.values;
      
    } catch (error) {
      logger.error('Gemini embedding error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generate with OpenAI
   */
  async generateOpenAI(text) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OPENAI_API_KEY not configured in .env');
      }
      
      const response = await axios.post(
        'https://api.openai.com/v1/embeddings',
        {
          model: this.openaiModel,
          input: text
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 30000
        }
      );
      
      return response.data.data[0].embedding;
      
    } catch (error) {
      logger.error('OpenAI embedding error', { error: error.message });
      throw error;
    }
  }
}

module.exports = new EmbeddingProvider();

