const postRepository = require('../../modules/repositories/postRepository');
const videoDownloader = require('../../modules/scraper/videoDownloader');
const videoAnalyzer = require('../../modules/analysis/videoAnalyzer');
const logger = require('../../utils/logger');

class PostController {
    /**
     * Batch analyze video posts with smle vision
     */
    async analyzeVideoBatch(req, res) {
        const { posts, postIds, campaignId, platform } = req.body;

        // Support both old format (postIds + platform) and new format (posts array of objects)
        let itemsToAnalyze = [];
        if (posts && Array.isArray(posts)) {
            itemsToAnalyze = posts;
        } else if (postIds && Array.isArray(postIds) && platform) {
            itemsToAnalyze = postIds.map(id => ({ id, platform }));
        } else {
            return res.status(400).json({ error: 'posts array (with id and platform) or postIds + platform is required' });
        }

        logger.info(`Starting smle vision batch analysis for ${itemsToAnalyze.length} posts`, { count: itemsToAnalyze.length, campaignId });

        // Run in background but return acknowledgment
        this._runBatchAnalysis(itemsToAnalyze).catch(err => {
            logger.error('Batch analysis feedback loop failed', { error: err.message });
        });

        res.json({
            success: true,
            message: `Started smle vision analysis for ${itemsToAnalyze.length} posts. Results will appear in the smle vision tab shortly.`
        });
    }

    async _runBatchAnalysis(postsToAnalyze) {
        for (const item of postsToAnalyze) {
            const postId = item.id || item;
            const platform = item.platform || 'unknown'; // Fallback if passed as simple ID (should be avoided)

            try {
                // 1. Get post data
                const post = await postRepository.getById(postId, platform);
                if (!post) {
                    logger.warn(`Post not found for analysis: ${postId}`, { platform });
                    continue;
                }

                // Helper to update progress logs
                const updateProgress = async (message) => {
                    const logEntry = { message, timestamp: new Date().toISOString() };
                    // Re-fetch post to get current logs or initialize
                    const currentPost = await postRepository.getById(postId, platform);
                    const logs = currentPost.smle_vision?.logs || [];
                    logs.push(logEntry);

                    const visionUpdate = {
                        ...(currentPost.smle_vision || {}),
                        status: 'analyzing',
                        logs
                    };
                    await postRepository.updateSmleVision(postId, platform, visionUpdate);
                };

                // Skip if already analyzed (optional check)
                if (post.smle_vision && post.smle_vision.status === 'completed') {
                    logger.info(`Post already analyzed by smle vision: ${postId}`);
                    continue;
                }

                // 2. Mark as processing
                const initialVision = { status: 'processing', started_at: new Date().toISOString(), logs: [] };
                await postRepository.updateSmleVision(postId, platform, initialVision);
                await updateProgress('Starting analysis...');

                // 3. Download video
                const videoUrl = post.url || post.raw_data?.url;
                if (!videoUrl) throw new Error('No video URL found in post');

                await updateProgress(`Downloading video from ${platform}...`);
                let videoPath;
                if (platform === 'tiktok') {
                    videoPath = await videoDownloader.downloadTikTok(videoUrl, postId);
                } else if (platform === 'instagram') {
                    videoPath = await videoDownloader.downloadInstagram(videoUrl, postId);
                } else if (platform === 'youtube') {
                    videoPath = await videoDownloader.downloadYouTube(videoUrl, postId);
                } else {
                    throw new Error(`Unsupported platform for video analysis: ${platform}`);
                }
                await updateProgress('Video downloaded successfully.');

                // 4. Analyze video
                await updateProgress('Extracting frames and running AI vision model...');
                const analysisResults = await videoAnalyzer.analyzeVideo(videoPath, postId);

                // 5. Save results
                await updateProgress('Analysis complete. Saving results...');
                const finalLogs = [...(await postRepository.getById(postId, platform)).smle_vision.logs, { message: 'Completed successfully.', timestamp: new Date().toISOString() }];

                post.smle_vision = {
                    ...analysisResults,
                    status: 'completed',
                    logs: finalLogs
                };
                post.analysis_status = 'analyzed'; // Ensure it's visible to getPosts query

                // Use updateSmleVision which does an upsert of the whole doc
                // We pass the new smle_vision, but we also need to persist the analysis_status change.
                // Since updateSmleVision in repo fetches-then-updates, we should probably just use insert/upsert directly
                // or modify updateSmleVision.
                // Actually, let's just use the repo's generic insert which is an upsert in our logic.
                await postRepository.insert(platform, postId, post);

                logger.info(`smle vision analysis completed for post: ${postId}`);

            } catch (error) {
                logger.error(`smle vision analysis failed for post: ${postId}`, { error: error.message });
                try {
                    // Try to fetch existing logs to append error
                    const failedPost = await postRepository.getById(postId, platform);
                    const logs = failedPost?.smle_vision?.logs || [];
                    logs.push({ message: `Error: ${error.message}`, timestamp: new Date().toISOString() });

                    await postRepository.updateSmleVision(postId, platform, {
                        status: 'failed',
                        error: error.message,
                        failed_at: new Date().toISOString(),
                        logs
                    });
                } catch (updateErr) {
                    logger.error('Failed to update error status on post', { postId, error: updateErr.message });
                }
            }
        }
    }
}

module.exports = new PostController();
