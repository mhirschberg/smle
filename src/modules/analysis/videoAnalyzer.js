const ffmpeg = require('fluent-ffmpeg');
const ffmpegStatic = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const logger = require('../../utils/logger');
const llmProvider = require('./llmProvider');

// Set ffmpeg path
ffmpeg.setFfmpegPath(ffmpegStatic);

class VideoAnalyzer {
    constructor() {
        this.framesDir = path.join(process.cwd(), 'downloads', 'frames');
        if (!fs.existsSync(this.framesDir)) {
            fs.mkdirSync(this.framesDir, { recursive: true });
        }
    }

    /**
     * Analyze a video file
     * @param {string} videoPath - Path to the video file
     * @param {string} postId - ID of the post
     * @returns {Promise<Object>} Analysis results
     */
    async analyzeVideo(videoPath, postId) {
        logger.info(`Analyzing video: ${videoPath}`, { postId });

        try {
            // Step 1: Extract frames (1 per second)
            const postFramesDir = path.join(this.framesDir, postId);
            if (!fs.existsSync(postFramesDir)) {
                fs.mkdirSync(postFramesDir, { recursive: true });
            }

            const framePaths = await this._extractFrames(videoPath, postFramesDir);
            logger.info(`Extracted ${framePaths.length} frames`, { postId });

            // Step 2: Select representative frames (up to 5 to avoid overwhelming LLM)
            const selectedFrames = this._selectRepresentativeFrames(framePaths, 5);

            // Step 3: Analyze each frame with LLM
            const frameAnalyses = [];
            for (const framePath of selectedFrames) {
                const analysis = await this._analyzeFrame(framePath);
                frameAnalyses.push({
                    timestamp: this._getTimestampFromFrameName(framePath),
                    description: analysis
                });
            }

            // Step 4: Aggregate results and get final summary
            const finalAnalysis = await this._generateStrategicSummary(frameAnalyses);

            return {
                frames: frameAnalyses,
                summary: finalAnalysis.summary,
                sentiment: finalAnalysis.sentiment,
                product_insights: finalAnalysis.product_insights,
                visual_themes: finalAnalysis.visual_themes,
                analyzed_at: new Date().toISOString()
            };

        } catch (error) {
            logger.error('Video analysis failed', { videoPath, error: error.message });
            throw error;
        }
    }

    async _extractFrames(videoPath, outputDir) {
        return new Promise((resolve, reject) => {
            const framePaths = [];
            ffmpeg(videoPath)
                .fps(1) // 1 frame per second
                .output(path.join(outputDir, 'frame_%04d.jpg'))
                .on('end', () => {
                    const files = fs.readdirSync(outputDir)
                        .filter(f => f.endsWith('.jpg'))
                        .sort()
                        .map(f => path.join(outputDir, f));
                    resolve(files);
                })
                .on('error', (err) => {
                    reject(err);
                })
                .run();
        });
    }

    _selectRepresentativeFrames(frames, maxFrames) {
        if (frames.length <= maxFrames) return frames;

        const selected = [];
        const step = frames.length / maxFrames;
        for (let i = 0; i < maxFrames; i++) {
            selected.push(frames[Math.floor(i * step)]);
        }
        return selected;
    }

    async _analyzeFrame(framePath) {
        const base64Image = fs.readFileSync(framePath, { encoding: 'base64' });

        const prompt = `Describe what is happening in this video frame. Focus on the visual content, people, products, and the overall mood/setting.`;

        const response = await llmProvider.generate(prompt, {
            model: 'llava:latest', // Ensure we use the vision model
            images: [base64Image],
            maxTokens: 300
        });

        return response;
    }

    async _generateStrategicSummary(frameAnalyses) {
        const framesContext = frameAnalyses
            .map(f => `[Timestamp ${f.timestamp}s]: ${f.description}`)
            .join('\n\n');

        const prompt = `Based on the following frame-by-frame visual descriptions of a video, provide a strategic summary.

VIDEO DESCRIPTIONS:
${framesContext}

REQUIRED ANALYSIS (JSON format):
1. summary: A 2-3 sentence summary of the video content.
2. sentiment: Overall sentiment (positive, neutral, negative).
3. product_insights: What are the implications for product strategy? Mention any brand appearance or usage.
4. visual_themes: List 3-5 main visual themes or topics.

Response MUST be ONLY valid JSON:
{"summary": "...", "sentiment": "...", "product_insights": "...", "visual_themes": ["...", "..."]}`;

        const response = await llmProvider.generate(prompt, {
            temperature: 0.3,
            maxTokens: 1000
        });

        try {
            // Try to extract JSON - be more lenient with the regex
            let jsonStr = response.trim();

            // If response doesn't start with {, try to find the first {
            if (!jsonStr.startsWith('{')) {
                const startIdx = jsonStr.indexOf('{');
                if (startIdx !== -1) {
                    jsonStr = jsonStr.substring(startIdx);
                }
            }

            // Find the last } in the string
            const lastBraceIdx = jsonStr.lastIndexOf('}');
            if (lastBraceIdx !== -1) {
                jsonStr = jsonStr.substring(0, lastBraceIdx + 1);
            }

            // Attempt to repair common JSON issues
            // 1. Fix missing closing braces for objects
            const openBraces = (jsonStr.match(/\{/g) || []).length;
            const closeBraces = (jsonStr.match(/\}/g) || []).length;
            if (openBraces > closeBraces) {
                jsonStr += '}'.repeat(openBraces - closeBraces);
            }

            // 2. Fix missing closing brackets for arrays
            const openBrackets = (jsonStr.match(/\[/g) || []).length;
            const closeBrackets = (jsonStr.match(/\]/g) || []).length;
            if (openBrackets > closeBrackets) {
                // Insert closing bracket before the last }
                const lastBrace = jsonStr.lastIndexOf('}');
                if (lastBrace !== -1) {
                    jsonStr = jsonStr.substring(0, lastBrace) + ']'.repeat(openBrackets - closeBrackets) + jsonStr.substring(lastBrace);
                } else {
                    jsonStr += ']'.repeat(openBrackets - closeBrackets);
                }
            }

            const parsed = JSON.parse(jsonStr);

            // Normalize product_insights to always be an object
            let productInsights = parsed.product_insights;
            if (typeof productInsights === 'string') {
                productInsights = { summary: productInsights };
            } else if (typeof productInsights !== 'object' || productInsights === null) {
                productInsights = { summary: 'No specific insights' };
            }

            return {
                summary: parsed.summary || 'No summary generated',
                sentiment: parsed.sentiment || 'neutral',
                product_insights: productInsights,
                visual_themes: Array.isArray(parsed.visual_themes) ? parsed.visual_themes : []
            };
        } catch (e) {
            logger.warn('Failed to parse strategic summary JSON, falling back', { response, error: e.message });
            return {
                summary: response.substring(0, 500),
                sentiment: 'neutral',
                product_insights: { error: 'Insights extraction failed', raw: response.substring(0, 200) },
                visual_themes: []
            };
        }
    }

    _getTimestampFromFrameName(framePath) {
        const basename = path.basename(framePath);
        const match = basename.match(/frame_(\d+)\.jpg/);
        if (match) {
            return parseInt(match[1]); // Since we extract at 1fps, frame number is seconds
        }
        return 0;
    }
}

module.exports = new VideoAnalyzer();
