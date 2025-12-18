const llmProvider = require('./llmProvider');
const config = require('../../config');
const logger = require('../../utils/logger');

class LLMAnalyzer {
  /**
   * Analyze an Instagram post
   * @param {Object} post - Post document from Couchbase
   * @returns {Promise<Object>} Analysis result
   */
  async analyzePost(post) {
    try {
      logger.debug('Analyzing post', { postId: post.id, shortcode: post.shortcode || post.post_id });
      
      const rawData = post.raw_data;
      
      // Build context from post data based on platform
      let postText = '';
      let hashtags = '';
      let commentTexts = '';
      
      switch (post.platform) {
        case 'instagram':
        case 'tiktok':
          postText = rawData.description || '';
          hashtags = (rawData.hashtags || []).join(' ');
          commentTexts = (rawData.top_comments || [])
            .slice(0, 10)
            .map(c => c.comment)
            .join(' | ');
          break;
          
        case 'twitter':
          postText = rawData.description || '';
          hashtags = (rawData.hashtags || []).join(' ');
          break;
          
        case 'reddit':
          postText = `${rawData.title || ''} ${rawData.description || ''}`.trim();
          break;
          
        case 'facebook':
          postText = rawData.content || '';
          hashtags = (rawData.hashtags || []).join(' ');
          break;
          
        case 'youtube':
          postText = `${rawData.title || ''} ${(rawData.description || '').substring(0, 500)}`.trim();
          hashtags = (rawData.tags || []).slice(0, 10).join(' ');
          break;
          
        case 'linkedin':
          postText = rawData.post_text || rawData.headline || '';
          hashtags = (rawData.hashtags || []).join(' ');
          commentTexts = (rawData.top_visible_comments || [])
            .slice(0, 5)
            .map(c => c.comment)
            .join(' | ');
          break;
          
        default:
          postText = '';
      }
      
      const engagement = rawData.engagement || {};
      const likes = engagement.likes || engagement.upvotes || 0;
      const comments = engagement.num_comments || engagement.comments || 0;
      
      // Build prompt
      const prompt = this.buildAnalysisPrompt({
        postText,
        hashtags,
        commentTexts,
        likes,
        comments,
        username: rawData.user_posted || rawData.youtuber || 'Unknown'
      });
      
      // Call LLM via provider
      const response = await llmProvider.generate(prompt, {
        temperature: 0.3,
        maxTokens: 500
      });
      
      // Parse response
      const analysis = this.parseAnalysisResponse(response);
      
      logger.debug('Analysis completed', { postId: post.id, sentiment: analysis.sentiment_score });
      
      return analysis;
      
    } catch (error) {
      logger.error('Failed to analyze post', { 
        postId: post.id, 
        error: error.message 
      });
      
      return {
        sentiment_score: null,
        sentiment_label: 'error',
        key_topics: [],
        brand_mentioned: false,
        summary: null,
        language: 'unknown',
        error: error.message
      };
    }
  }
  
  /**
   * Build analysis prompt
   */
  buildAnalysisPrompt({ postText, hashtags, commentTexts, likes, comments, username }) {
    return `You are a social media analyst. Analyze the following post and provide a structured JSON response.

POST DETAILS:
- User: ${username}
- Description: ${postText || 'No description'}
- Hashtags: ${hashtags || 'None'}
- Engagement: ${likes} likes, ${comments} comments
- Top Comments: ${commentTexts || 'No comments'}

ANALYSIS REQUIRED:
1. Sentiment Score: Rate from 1 (very negative) to 10 (very positive) based on the ACTUAL content above
2. Sentiment Label: Choose from: "negative", "neutral", "positive"
3. Key Topics: Extract 3-5 main topics/themes from the ACTUAL post content (lowercase, single words or short phrases)
4. Brand Mentioned: true if any brand/product is mentioned in the post, false otherwise
5. Summary: One sentence summary of the ACTUAL post content (max 100 chars)
6. Language: Detect the language used in the post (e.g., "en", "es", "fr", "de")

SENTIMENT LABEL RULES:
- Score 1-3 = "negative"
- Score 4-7 = "neutral"
- Score 8-10 = "positive"

IMPORTANT: Analyze the ACTUAL post content above, do NOT use placeholder or example data.

Response must be ONLY valid JSON in this exact format (no markdown, no code blocks, no additional text):
{"sentiment_score": <number 1-10>, "sentiment_label": "<negative|neutral|positive>", "key_topics": ["topic1", "topic2", "topic3"], "brand_mentioned": <true|false>, "summary": "<summary text>", "language": "<language code>"}`;
  }
  
  /**
   * Parse LLM response
   */
  parseAnalysisResponse(response) {
    try {
      // Remove markdown code blocks if present
      let cleaned = response.trim();
      cleaned = cleaned.replace(/```json\n?/g, '');
      cleaned = cleaned.replace(/```\n?/g, '');
      cleaned = cleaned.trim();
      
      // Try to find JSON in the response
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        cleaned = jsonMatch[0];
      }
      
      const parsed = JSON.parse(cleaned);
      
      // Validate and normalize
      const sentimentScore = this.clampScore(parsed.sentiment_score);
      const sentimentLabel = this.deriveSentimentLabel(sentimentScore, parsed.sentiment_label);
      
      return {
        sentiment_score: sentimentScore,
        sentiment_label: sentimentLabel,
        key_topics: Array.isArray(parsed.key_topics) ? parsed.key_topics.slice(0, 10) : [],
        brand_mentioned: Boolean(parsed.brand_mentioned),
        summary: (parsed.summary || '').substring(0, 150),
        language: parsed.language || 'en'
      };
      
    } catch (error) {
      logger.error('Failed to parse LLM response', { 
        response: response.substring(0, 200),
        error: error.message 
      });
      
      // Fallback to basic sentiment
      return this.fallbackAnalysis(response);
    }
  }
  
  /**
   * Derive sentiment label from score (override LLM if inconsistent)
   */
  deriveSentimentLabel(score, llmLabel) {
    // Always derive from score to ensure consistency
    if (score >= 8) return 'positive';
    if (score >= 4) return 'neutral';
    return 'negative';
  }
  
  /**
   * Fallback analysis when JSON parsing fails
   */
  fallbackAnalysis(response) {
    const lower = response.toLowerCase();
    
    let sentiment_score = 5;
    let sentiment_label = 'neutral';
    
    // Simple keyword-based sentiment
    if (lower.includes('positive') || lower.includes('happy') || lower.includes('love')) {
      sentiment_score = 7;
      sentiment_label = 'positive';
    } else if (lower.includes('negative') || lower.includes('sad') || lower.includes('angry')) {
      sentiment_score = 3;
      sentiment_label = 'negative';
    }
    
    return {
      sentiment_score,
      sentiment_label,
      key_topics: [],
      brand_mentioned: false,
      summary: response.substring(0, 100),
      language: 'en'
    };
  }
  
  /**
   * Clamp sentiment score to 1-10
   */
  clampScore(score) {
    const num = parseInt(score);
    if (isNaN(num)) return 5;
    return Math.max(1, Math.min(10, num));
  }
}

module.exports = new LLMAnalyzer();

