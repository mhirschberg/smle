require('dotenv').config();
const videoDownloader = require('../modules/scraper/videoDownloader');
const videoAnalyzer = require('../modules/analysis/videoAnalyzer');
const logger = require('../utils/logger');
const path = require('path');
const fs = require('fs');

async function testVideo(url, platform) {
    logger.info(`--- Testing smle vision for ${platform} ---`);
    logger.info(`URL: ${url}`);

    try {
        // 1. Download
        let videoPath;
        if (platform === 'tiktok') {
            videoPath = await videoDownloader.downloadTikTok(url, 'test_post');
        } else if (platform === 'instagram') {
            videoPath = await videoDownloader.downloadInstagram(url, 'test_post');
        } else if (platform === 'youtube') {
            videoPath = await videoDownloader.downloadYouTube(url, 'test_post');
        }

        logger.info(`Download success: ${videoPath}`);

        // 2. Analyze
        const analysis = await videoAnalyzer.analyzeVideo(videoPath, 'test_post');

        logger.info('--- Analysis Results ---');
        logger.info(JSON.stringify(analysis, null, 2));

        return analysis;

    } catch (error) {
        logger.error(`Test failed for ${platform}`, { error: error.message, stack: error.stack });
        throw error;
    }
}

async function runTests() {
    const tests = [
        // You can add sample URLs here to test
        // { url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', platform: 'youtube' },
        // { url: 'https://www.tiktok.com/@user/video/123456789', platform: 'tiktok' },
    ];

    if (tests.length === 0) {
        logger.warn('No test URLs provided. Add some to testSmleVision.js to run full E2E.');
        return;
    }

    for (const test of tests) {
        await testVideo(test.url, test.platform);
    }
}

// If run directly
if (require.main === module) {
    runTests();
}

module.exports = { testVideo };
