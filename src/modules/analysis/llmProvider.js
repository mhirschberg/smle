const axios = require('axios');
const logger = require('../../utils/logger');

class LLMProvider {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'ollama';
    
    // Ollama config
    this.ollamaEndpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
    this.ollamaModel = process.env.LLM_MODEL || 'llama3.2:1b';
    
    // Gemini config
    this.geminiApiKey = process.env.GEMINI_API_KEY;
    this.geminiModel = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
    
    // OpenAI config
    this.openaiApiKey = process.env.OPENAI_API_KEY;
    this.openaiModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
    
    logger.info('LLM Provider initialized', { provider: this.provider });
  }
  
  /**
   * Generate text completion
   * @param {string} prompt - The prompt
   * @param {Object} options - Generation options
   * @returns {Promise<string>} Generated text
   */
  async generate(prompt, options = {}) {
    const { temperature = 0.3, maxTokens = 500 } = options;
    
    switch (this.provider) {
      case 'gemini':
        return await this.generateGemini(prompt, temperature, maxTokens);
      
      case 'openai':
        return await this.generateOpenAI(prompt, temperature, maxTokens);
      
      case 'ollama':
      default:
        return await this.generateOllama(prompt, temperature, maxTokens);
    }
  }
  
  /**
   * Generate with Ollama (local)
   */
  async generateOllama(prompt, temperature, maxTokens) {
    try {
      const response = await axios.post(`${this.ollamaEndpoint}/api/generate`, {
        model: this.ollamaModel,
        prompt: prompt,
        stream: false,
        options: {
          temperature: temperature,
          num_predict: maxTokens
        }
      }, {
        timeout: 60000
      });
      
      return response.data.response;
    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        throw new Error('Ollama service is not running. Start it with: ollama serve');
      }
      throw error;
    }
  }
  
  /**
   * Generate with Google Gemini
   */
  async generateGemini(prompt, temperature, maxTokens) {
    try {
      if (!this.geminiApiKey) {
        throw new Error('GEMINI_API_KEY not configured in .env');
      }
      
      const { GoogleGenerativeAI } = require('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(this.geminiApiKey);
      
      const model = genAI.getGenerativeModel({ 
        model: this.geminiModel,
        generationConfig: {
          temperature: temperature,
          maxOutputTokens: maxTokens
        }
      });
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      const text = response.text();
      
      return text;
      
    } catch (error) {
      logger.error('Gemini API error', { error: error.message });
      throw error;
    }
  }
  
  /**
   * Generate with OpenAI
   */
  async generateOpenAI(prompt, temperature, maxTokens) {
    try {
      if (!this.openaiApiKey) {
        throw new Error('OPENAI_API_KEY not configured in .env');
      }
      
      const response = await axios.post(
        'https://api.openai.com/v1/chat/completions',
        {
          model: this.openaiModel,
          messages: [
            { role: 'user', content: prompt }
          ],
          temperature: temperature,
          max_tokens: maxTokens
        },
        {
          headers: {
            'Authorization': `Bearer ${this.openaiApiKey}`,
            'Content-Type': 'application/json'
          },
          timeout: 60000
        }
      );
      
      return response.data.choices[0].message.content;
      
    } catch (error) {
      logger.error('OpenAI API error', { error: error.message });
      throw error;
    }
  }
}

module.exports = new LLMProvider();

