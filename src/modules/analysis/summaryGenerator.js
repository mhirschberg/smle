const axios = require('axios');
const logger = require('../../utils/logger');

class SummaryGenerator {
    constructor() {
        this.endpoint = process.env.LLM_ENDPOINT || 'http://localhost:11434';
        this.model = process.env.LLM_MODEL || 'llama3.2:1b';
    }

    async callOllama(prompt) {
        try {
            const response = await axios.post(`${this.endpoint}/api/generate`, {
                model: this.model,
                prompt: prompt,
                stream: false,
                options: {
                    temperature: 0.7,
                    num_ctx: 4096
                }
            });
            return response.data.response;
        } catch (error) {
            logger.error('LLM generation failed', { error: error.message });
            throw error;
        }
    }

    async generateSentimentSummary(posts, sentiment, keywords) {
        if (!posts || !Array.isArray(posts) || posts.length === 0) {
            return "No posts available to analyze.";
        }

        const postsContext = posts.slice(0, 30).map(p => {
            const text = p.analysis?.summary || p.raw_data?.description || p.raw_data?.caption || p.raw_data?.text || '';
            const platform = p.platform || 'social';
            return `[${platform}] ${text.substring(0, 300)}`;
        }).join('\n---\n');

        const platformCounts = posts.reduce((acc, p) => {
            const result = p.platform || 'social';
            acc[result] = (acc[result] || 0) + 1;
            return acc;
        }, {});

        const distribution = Object.entries(platformCounts)
            .map(([plat, count]) => `${count} from ${plat}`)
            .join(', ');

        const prompt = `
        You are a highly perceptive social media analyst. 
        Analyze the following ${posts.length} posts (${distribution}) which are classified as ${sentiment.toUpperCase()}.
        
        CAMPAIGN CONTEXT:
        The user is interested in: "${keywords || 'General Analysis'}".
        
        CONTEXT:
        ${postsContext}

        TASK:
        Write a creative, "no bullshit" summary of what people are actually saying and feeling, specifically relating to "${keywords || 'the topic'}".
        - Do NOT just list topics.
        - Dig into the *specific* emotions and specific complaints or praises.
        - Explain how these posts relate to the user's interest (${keywords}).
        - Use a professional but engaging tone.
        - Mention specific platforms if you notice platform-specific trends (e.g. "TikTok users are doing X, while Twitter is complaining about Y").
        - If there are specific recurring themes, highlight them.
        - Length: 2-3 paragraphs.
        
        SUMMARY:
        `;

        try {
            return await this.callOllama(prompt);
        } catch (err) {
            logger.error('Summary generation failed', { error: err.message, stack: err.stack });
            throw new Error(`Failed to generate summary: ${err.message}`);
        }
    }

    async generateRunSummary(run, stats, topPosts, keywords) {
        if (!topPosts || !Array.isArray(topPosts)) {
            logger.warn('No top posts available for run summary');
            topPosts = [];
        }

        const postsContext = topPosts.slice(0, 15).map(p => {
            return `- [${p.platform}] (${p.analysis?.sentiment_score}/10): ${p.analysis?.summary || p.raw_data?.text?.substring(0, 100)}`;
        }).join('\n');

        const prompt = `
        Write an Executive Summary for this social media analysis run.
        
        CAMPAIGN FOCUS:
        "${keywords || 'General Analysis'}"
        
        STATS:
        - Total Posts: ${stats.total_posts}
        - Avg Sentiment: ${stats.avg_sentiment?.toFixed(1)}/10
        - Positive: ${stats.positive_count}
        - Negative: ${stats.negative_count}
        
        TOP POSTS CONTEXT:
        ${postsContext}

        TASK:
        Write a concise Executive Summary (3-4 bullet points) highlighting the key takeaways regarding "${keywords}".
        Focus on:
        1. Overall sentiment trend and how it relates to the campaign focus.
        2. Drivers of positive/negative sentiment.
        3. Anything unusual or viral.
        
        EXECUTIVE SUMMARY:
        `;

        try {
            return await this.callOllama(prompt);
        } catch (err) {
            return "Failed to generate executive summary.";
        }
    }

    async generatePlatformSummary(posts, platform, keywords) {
        if (!posts || !Array.isArray(posts) || posts.length === 0) {
            return `No posts available for ${platform}.`;
        }

        const postsContext = posts.slice(0, 20).map(p => {
            const text = p.analysis?.summary || p.raw_data?.description || p.raw_data?.caption || p.raw_data?.text || '';
            const sentiment = p.analysis?.sentiment_label || 'neutral';
            return `- [${sentiment}] ${text.substring(0, 200)}`;
        }).join('\n');

        const prompt = `
        You are a social media expert specializing in ${platform}.
        Analyze the following ${posts.length} posts from ${platform}.

        CAMPAIGN CONTEXT:
        The user is interested in: "${keywords || 'General Analysis'}".

        CONTEXT:
        ${postsContext}

        TASK:
        Write a specialized summary of what is happening on ${platform} regarding "${keywords}".
        - Focus on the unique culture/vibe of ${platform} (e.g. visual trends for Instagram, viral takes for TikTok/Twitter).
        - What are the key talking points on THIS specific platform?
        - How does the sentiment compare to the general vibe?
        - Length: 2 short paragraphs.

        SUMMARY:
        `;

        try {
            return await this.callOllama(prompt);
        } catch (err) {
            logger.error(`Failed to generate ${platform} summary`, { error: err.message });
            return `Failed to generate summary for ${platform}.`;
        }
    }
}

module.exports = new SummaryGenerator();
