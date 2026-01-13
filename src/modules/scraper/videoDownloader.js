const axios = require('axios');
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const logger = require('../../utils/logger');
const config = require('../../config');

class VideoDownloader {
    constructor() {
        this.outputDir = path.join(process.cwd(), 'downloads');
        if (!fs.existsSync(this.outputDir)) {
            fs.mkdirSync(this.outputDir, { recursive: true });
        }

        // Scraping Browser Config
        this.sbrUsername = process.env.SBR_USERNAME;
        this.sbrPassword = process.env.SBR_PASSWORD;
        this.sbrBaseUrl = `brd.superproxy.io:9222`;

        // Unlocker Config - For YouTube
        this.unlockerUsername = process.env.UNLOCKER_USERNAME;
        this.unlockerPassword = process.env.UNLOCKER_PASSWORD;
        this.unlockerHost = 'brd.superproxy.io:33335';
    }

    /**
     * Download TikTok video using Scraping Browser
     * Based on working tmp/tt/tiktok_downloader.js
     */
    async downloadTikTok(url, postId) {
        logger.info(`Downloading TikTok video: ${url}`);
        let browser;
        try {
            const sessionId = `tt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const sbrUser = `${this.sbrUsername}-session-${sessionId}`;
            const endpoint = `wss://${sbrUser}:${this.sbrPassword}@${this.sbrBaseUrl}`;

            browser = await chromium.connectOverCDP(endpoint, { timeout: 60000 });
            const context = await browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ignoreHTTPSErrors: true
            });
            const page = await context.newPage();
            page.setDefaultTimeout(90000);

            // Navigate to TikTok page
            await page.goto(url, {
                timeout: 90000,
                waitUntil: 'domcontentloaded'
            });

            // Wait for dynamic content to load
            await page.waitForTimeout(5000);

            // Extract page content
            const htmlContent = await page.content();

            if (htmlContent.length < 10000) {
                throw new Error('Page content too small - possible blocking or loading issue');
            }

            // Extract video URL from JSON
            let videoUrl = null;
            try {
                const jsonStart = htmlContent.indexOf('<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"');
                if (jsonStart !== -1) {
                    const contentStart = htmlContent.indexOf('>', jsonStart) + 1;
                    const jsonEnd = htmlContent.indexOf('</script>', contentStart);

                    if (jsonEnd !== -1) {
                        const jsonString = htmlContent.substring(contentStart, jsonEnd);
                        const jsonData = JSON.parse(jsonString);

                        // Try different paths to itemStruct
                        let itemStruct = null;
                        if (jsonData['__DEFAULT_SCOPE__']) {
                            const videoDetail = jsonData['__DEFAULT_SCOPE__']['webapp.video-detail'];
                            if (videoDetail) {
                                itemStruct = videoDetail['itemInfo']?.['itemStruct'] || videoDetail['itemStruct'];
                            }
                        }

                        if (itemStruct && itemStruct.video) {
                            const videoData = itemStruct.video;
                            // Priority: downloadAddr > playAddr
                            if (videoData.downloadAddr) {
                                videoUrl = decodeURIComponent(videoData.downloadAddr);
                            } else if (videoData.playAddr) {
                                videoUrl = decodeURIComponent(videoData.playAddr);
                            }
                        }
                    }
                }
            } catch (e) {
                logger.debug(`TikTok JSON extraction error: ${e.message}`);
            }

            if (!videoUrl) {
                throw new Error('Could not find TikTok video URL');
            }

            logger.info(`Video URL found: ${videoUrl.substring(0, 100)}...`);

            // Create filename
            const videoIdMatch = url.match(/\/video\/(\d+)/);
            const videoId = videoIdMatch ? videoIdMatch[1] : `tt_${postId}`;
            const filepath = path.join(this.outputDir, `tiktok_${videoId}.mp4`);

            // Check if already exists
            if (fs.existsSync(filepath) && fs.statSync(filepath).size > 10000) {
                logger.info(`TikTok file already exists: ${filepath}`);
                return filepath;
            }

            // Download video using same browser context
            logger.info('Downloading video...');
            const response = await context.request.get(videoUrl, {
                headers: {
                    'Referer': url,
                    'Origin': 'https://www.tiktok.com',
                    'Accept': '*/*'
                },
                timeout: 60000
            });

            const statusCode = response.status();
            logger.info(`Video download response status: ${statusCode}`);

            if (statusCode === 200 || statusCode === 206) {
                const videoBuffer = await response.body();

                if (videoBuffer.length > 10000) {
                    fs.writeFileSync(filepath, videoBuffer);
                    const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
                    logger.info(`Successfully saved TikTok video: ${filepath} (${fileSizeMB}MB)`);
                    return filepath;
                } else {
                    throw new Error(`Video data too small: ${videoBuffer.length} bytes`);
                }
            } else {
                throw new Error(`Download failed with HTTP status: ${statusCode}`);
            }

        } catch (error) {
            logger.error('TikTok download failed', { url, error: error.message });
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }

    /**
     * Download Instagram Reel
     * Based on working tmp/ig/instagram_downloader.js
     */
    async downloadInstagram(url, postId) {
        logger.info(`Downloading Instagram video: ${url}`);
        let browser;
        try {
            const sessionId = `ig_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
            const sbrUser = `${this.sbrUsername}-session-${sessionId}`;
            const endpoint = `wss://${sbrUser}:${this.sbrPassword}@${this.sbrBaseUrl}`;

            browser = await chromium.connectOverCDP(endpoint, { timeout: 60000 });
            const context = await browser.newContext({
                viewport: { width: 1920, height: 1080 },
                userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                ignoreHTTPSErrors: true
            });
            const page = await context.newPage();
            page.setDefaultTimeout(90000);

            // Navigate to Instagram page
            await page.goto(url, {
                timeout: 90000,
                waitUntil: 'networkidle'
            });

            // Wait for dynamic content
            await page.waitForTimeout(8000);

            // Extract page content
            const htmlContent = await page.content();

            if (htmlContent.length < 10000) {
                throw new Error('Page content too small - possible blocking or loading issue');
            }

            // Extract video URL from JSON
            let videoUrl = this._extractInstagramVideoUrl(htmlContent);

            if (!videoUrl) {
                throw new Error('Could not find Instagram video URL');
            }

            logger.info(`Video URL found: ${videoUrl.substring(0, 100)}...`);

            // Create filename
            const shortcodeMatch = url.match(/\/(?:p|reel|reels)\/([^/]+)/);
            const shortcode = shortcodeMatch ? shortcodeMatch[1] : `ig_${postId}`;
            const filepath = path.join(this.outputDir, `instagram_${shortcode}.mp4`);

            // Check if already exists
            if (fs.existsSync(filepath) && fs.statSync(filepath).size > 10000) {
                logger.info(`Instagram file already exists: ${filepath}`);
                return filepath;
            }

            // Download video using same browser context
            logger.info('Downloading video...');
            const cleanVideoUrl = decodeURIComponent(videoUrl);
            const response = await context.request.get(cleanVideoUrl, {
                headers: {
                    'Referer': 'https://www.instagram.com/',
                    'Origin': 'https://www.instagram.com',
                    'Accept': '*/*',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                },
                timeout: 90000
            });

            const statusCode = response.status();
            logger.info(`Video download response status: ${statusCode}`);

            if (statusCode === 200 || statusCode === 206) {
                const videoBuffer = await response.body();

                if (videoBuffer.length > 10000) {
                    fs.writeFileSync(filepath, videoBuffer);
                    const fileSizeMB = (videoBuffer.length / (1024 * 1024)).toFixed(1);
                    logger.info(`Successfully saved Instagram video: ${filepath} (${fileSizeMB}MB)`);
                    return filepath;
                } else {
                    throw new Error(`Video data too small: ${videoBuffer.length} bytes`);
                }
            } else {
                throw new Error(`Download failed with HTTP status: ${statusCode}`);
            }

        } catch (error) {
            logger.error('Instagram download failed', { url, error: error.message });
            throw error;
        } finally {
            if (browser) await browser.close();
        }
    }

    _extractInstagramVideoUrl(htmlContent) {
        // Method 1: Look for xdt_api__v1__media__shortcode__web_info
        const jsonPattern = /"xdt_api__v1__media__shortcode__web_info":\s*(\{(?:[^{}]|\{(?:[^{}]|\{[^{}]*\})*\})*\})/;
        const match = htmlContent.match(jsonPattern);

        if (match) {
            try {
                let jsonStr = match[1];
                // Clean up JSON escaping
                jsonStr = jsonStr.replace(/\\u0026/g, '&').replace(/\\\//g, '/');

                const data = JSON.parse(jsonStr);
                const items = data.items || [];

                if (items.length > 0) {
                    const item = items[0];

                    // Try video_versions first (direct MP4 URLs)
                    const videoVersions = item.video_versions || [];
                    if (videoVersions.length > 0) {
                        const url = videoVersions[0].url;
                        logger.info('Found video URL via video_versions in JSON');
                        return url.replace(/&amp;/g, '&');
                    }

                    // Try DASH manifest
                    const dashManifest = item.video_dash_manifest || '';
                    if (dashManifest) {
                        logger.info('Found DASH manifest, extracting video URL...');

                        // Unescape the manifest
                        const manifest = dashManifest
                            .replace(/\\n/g, '\n')
                            .replace(/\\\//g, '/')
                            .replace(/&amp;/g, '&');

                        // Extract all BaseURL entries
                        const baseUrlPattern = /<BaseURL>([^<]+)<\/BaseURL>/g;
                        const urls = [];
                        let urlMatch;
                        while ((urlMatch = baseUrlPattern.exec(manifest)) !== null) {
                            urls.push(urlMatch[1]);
                        }

                        // Filter for video URLs (not audio)
                        const videoUrls = [];
                        for (const url of urls) {
                            const urlClean = url.replace(/&amp;/g, '&');

                            // Check if it's a video URL
                            if (['avc1', 'h264', 'video'].some(indicator =>
                                urlClean.toLowerCase().includes(indicator))) {
                                videoUrls.push(urlClean);
                            }
                            // Skip audio-only URLs
                            else if (urlClean.toLowerCase().includes('audio') &&
                                !urlClean.toLowerCase().includes('video')) {
                                continue;
                            }
                            // If no clear indicator, include .mp4 URLs
                            else if (urlClean.includes('.mp4')) {
                                videoUrls.push(urlClean);
                            }
                        }

                        if (videoUrls.length > 0) {
                            logger.info('Found video URL via DASH manifest');
                            return videoUrls[0];
                        }
                    }
                }
            } catch (error) {
                logger.debug(`Instagram JSON parsing error: ${error.message}`);
            }
        }

        // Method 2: Look for video_versions pattern directly in HTML
        const videoVersionsPatterns = [
            /"video_versions":\s*\[\s*\{\s*"[^"]*":\s*[^,]+,\s*"[^"]*":\s*[^,]+,\s*"url":\s*"([^"]+)"/,
            /"video_versions":\[{"[^"]*":[^,]*,"[^"]*":[^,]*,"url":"([^"]+)"/,
        ];

        for (const pattern of videoVersionsPatterns) {
            const matches = htmlContent.match(pattern);
            if (matches && matches[1]) {
                const url = matches[1]
                    .replace(/\\u0026/g, '&')
                    .replace(/\\\//g, '/')
                    .replace(/&amp;/g, '&');
                logger.info('Found video URL via video_versions pattern');
                return url;
            }
        }

        // Method 3: Look for video_url or playback_url
        const directUrlPatterns = [
            /"video_url":\s*"(https:\/\/[^"]+\.mp4[^"]*)"/,
            /"playback_url":\s*"(https:\/\/[^"]+\.mp4[^"]*)"/,
        ];

        for (const pattern of directUrlPatterns) {
            const matches = htmlContent.match(pattern);
            if (matches && matches[1]) {
                const url = matches[1]
                    .replace(/\\u0026/g, '&')
                    .replace(/\\\//g, '/')
                    .replace(/&amp;/g, '&');
                logger.info('Found video URL via direct pattern');
                return url;
            }
        }

        return null;
    }

    /**
     * Download YouTube video
     */
    async downloadYouTube(url, postId) {
        logger.info(`Downloading YouTube video: ${url}`);
        const binPath = path.join(__dirname, 'yt-dlp');
        const filepath = path.join(this.outputDir, `youtube_${postId}.mp4`);

        // Check if already exists
        if (fs.existsSync(filepath) && fs.statSync(filepath).size > 100000) {
            logger.info(`YouTube file already exists: ${filepath}`);
            return filepath;
        }

        const { spawn } = require('child_process');

        const sessionId = `yt_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
        const proxyUser = this.unlockerUsername;
        const proxyPass = this.unlockerPassword;
        const proxyHost = this.unlockerHost;

        if (!proxyUser || !proxyPass) {
            throw new Error('Unlocker credentials (UNLOCKER_USERNAME, UNLOCKER_PASSWORD) are required for YouTube downloads');
        }

        const proxyUrl = `http://${proxyUser}-session-${sessionId}:${proxyPass}@${proxyHost}`;

        const args = [
            '--proxy', proxyUrl,
            '-f', 'best[ext=mp4]/best',
            '-o', filepath,
            '--no-playlist',
            '--no-check-certificates',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            '--js-runtimes', 'node',
            '--concurrent-fragments', '1',
            '--no-part',
            '--http-chunk-size', '0', // No chunking!
            '--limit-rate', '200K', // Keep it slow!
            '--retries', '50',
            '--fragment-retries', '50',
            '--socket-timeout', '300',
            '--no-warnings',
            url
        ];

        // Secure logging
        const safeArgs = args.map(arg => {
            if (proxyPass && arg.includes(proxyPass)) {
                return arg.replace(proxyPass, '******');
            }
            return arg;
        });

        logger.debug('yt-dlp command', { args: safeArgs });

        return new Promise((resolve, reject) => {
            const process = spawn(binPath, args);

            let stderr = '';
            process.stderr.on('data', (data) => {
                stderr += data.toString();
                if (this.debug) {
                    logger.debug(`yt-dlp stderr: ${data}`);
                }
            });

            process.on('close', (code) => {
                if (code === 0) {
                    if (fs.existsSync(filepath) && fs.statSync(filepath).size > 1000) {
                        logger.info(`Successfully downloaded YouTube video: ${filepath}`);
                        resolve(filepath);
                    } else {
                        reject(new Error(`yt-dlp produced empty or missing file. Stderr: ${stderr}`));
                    }
                } else {
                    reject(new Error(`yt-dlp exited with code ${code}. Stderr: ${stderr}`));
                }
            });

            // Timeout after 15 minutes
            setTimeout(() => {
                try {
                    process.kill();
                } catch (e) { }
                reject(new Error('yt-dlp timed out'));
            }, 900000);
        });
    }
}

module.exports = new VideoDownloader();
