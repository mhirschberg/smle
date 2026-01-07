const logger = require('../../utils/logger');
const dbFactory = require('../storage/dbFactory');
const platformManager = require('../platforms/platformManager');
const urlSanitizer = require('../../utils/urlSanitizer');
const postDeduplicator = require('../storage/postDeduplicator');
const { v4: uuidv4 } = require('uuid');

class PostRepository {
    constructor() {
        this.db = null;
    }

    async getDB() {
        if (!this.db) {
            this.db = await dbFactory.getDB();
        }
        return this.db;
    }

    async insert(platform, key, document) {
        const db = await this.getDB();
        const collection = platformManager.getCollection(platform);
        return await db.upsert(collection, key, document);
    }

    /**
     * Save a scraped post with normalization and deduplication
     * @param {string} platform - Platform name
     * @param {Object} rawPost - Raw post data from scraper
     * @param {string} campaignId - Campaign ID
     * @param {string} runId - Run ID
     * @param {number} runNumber - Run Number
     * @returns {Promise<Object>} Result with isNew flag and docId
     */
    async saveScrapedPost(platform, rawPost, campaignId, runId, runNumber) {
        try {
            const db = await this.getDB();
            const collection = platformManager.getCollection(platform);
            const now = new Date().toISOString();

            // 1. Normalize URL
            const originalUrl = rawPost.url || rawPost.platform_url;
            const cleanedUrl = urlSanitizer.cleanUrl(originalUrl, platform);
            rawPost.url = cleanedUrl;
            rawPost.platform_url = cleanedUrl;

            // 2. Check for existing post
            const existing = await postDeduplicator.findExistingPost(cleanedUrl, collection, campaignId);

            if (existing) {
                // Update existing post with new engagement data
                await postDeduplicator.updateExistingPost(
                    existing.docId,
                    existing.post,
                    rawPost,
                    runNumber,
                    runId,
                    collection
                );
                return { isNew: false, docId: existing.docId };
            }

            // 3. Create new post
            const postId = uuidv4();
            const postDocument = this._mapPostToPlatform(rawPost, platform, campaignId, runId, now, runNumber);
            postDocument.id = postId;

            await this.insert(platform, postId, postDocument);
            return { isNew: true, docId: postId };
        } catch (error) {
            logger.error('Failed to save scraped post', { platform, url: rawPost.url, error: error.message });
            throw error;
        }
    }

    /**
     * Map raw post data to platform-specific structure
     */
    _mapPostToPlatform(rawPost, platform, campaignId, runId, timestamp, runNumber) {
        // Ensure platform is clean
        platform = platform.trim().toLowerCase();

        const baseDocument = {
            id: null, // Set by caller
            campaign_id: campaignId,
            run_id: runId,
            platform: platform,
            platform_url: rawPost.url,
            post_id: rawPost.post_id || rawPost.id || rawPost.video_id,
            created_at: timestamp,
            scraped_at: rawPost.timestamp || timestamp,
            analysis_status: 'pending',
            first_seen_run: runNumber,
            last_seen_run: runNumber,
            total_appearances: 1,
            engagement_history: [],
            analysis: {
                sentiment_score: null,
                sentiment_label: null,
                key_topics: [],
                brand_mentioned: null,
                summary: null,
                language: null,
                embedding: null,
                analyzed_at: null,
                llm_model: null,
                error: null
            }
        };

        // Standardize engagement extraction
        const engagement = {
            likes: rawPost.likes || rawPost.num_upvotes || rawPost.digg_count || 0,
            comments: rawPost.comments || rawPost.num_comments || rawPost.comment_count || 0,
            shares: rawPost.shares || rawPost.num_shares || rawPost.share_count || 0,
            views: rawPost.views || rawPost.video_view_count || rawPost.play_count || 0
        };

        let platformData = {};
        switch (platform) {
            case 'instagram':
                platformData = {
                    shortcode: rawPost.shortcode,
                    content_type: (rawPost.url || '').includes('/reel/') ? 'reel' : 'post'
                };
                break;
            case 'tiktok':
                platformData = {
                    shortcode: rawPost.shortcode,
                    content_type: 'video'
                };
                break;
            case 'twitter':
                platformData = {
                    content_type: 'tweet'
                };
                break;
            case 'reddit':
                platformData = {
                    content_type: 'post'
                };
                break;
            case 'facebook':
                platformData = {
                    content_type: rawPost.post_type || 'post'
                };
                break;
            case 'youtube':
                platformData = {
                    content_type: 'video'
                };
                break;
            case 'linkedin':
                platformData = {
                    content_type: rawPost.post_type || 'post'
                };
                break;
            default:
                platformData = {
                    content_type: 'post'
                };
        }

        return {
            ...baseDocument,
            ...platformData,
            raw_data: {
                ...rawPost,
                engagement
            }
        };
    }

    async getPostsByStatus(campaignId, runId, platforms, status) {
        const db = await this.getDB();
        const collections = platforms.map(p => platformManager.getCollection(p));
        return await db.getPostsByStatus(campaignId, runId, collections, status);
    }

    async getPostsMissingEmbeddings(campaignId, runId, platforms) {
        const db = await this.getDB();
        const collections = platforms.map(p => platformManager.getCollection(p));
        return await db.getPostsMissingEmbeddings(campaignId, runId, collections);
    }

    async deleteAllByCampaignId(campaignId, platforms) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        let totalDeleted = 0;

        for (const platform of platforms) {
            try {
                const collection = platformManager.getCollection(platform);
                let query;
                let params;

                if (dbType === 'postgres' || dbType === 'cratedb') {
                    const collectionPath = db.getCollectionPath(collection);
                    const campaignIdPath = db.getPropertyPath('doc', 'campaign_id');
                    const returning = dbType === 'cratedb' ? '' : ' RETURNING id';
                    query = `DELETE FROM ${collectionPath} WHERE ${campaignIdPath} = $1${returning}`;
                    params = [campaignId];
                } else {
                    const collectionPath = db.getCollectionPath(collection);
                    query = `
                        DELETE FROM ${collectionPath}
                        WHERE campaign_id = $campaignId
                        RETURNING META().id
                    `;
                    params = { campaignId };
                }

                const result = await db.query(query, { parameters: params });
                totalDeleted += result.length;
            } catch (err) {
                logger.warn(`Failed to delete ${platform} posts`, { error: err.message });
            }
        }
        return totalDeleted;
    }

    async deleteAllPosts(platformCollections) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        let totalDeleted = 0;

        for (const collection of platformCollections) {
            try {
                let query;
                if (dbType === 'postgres' || dbType === 'cratedb') {
                    const collectionPath = db.getCollectionPath(collection);
                    const returning = dbType === 'cratedb' ? '' : ' RETURNING id';
                    query = `DELETE FROM ${collectionPath}${returning}`;
                } else {
                    const collectionPath = db.getCollectionPath(collection);
                    query = `
                        DELETE FROM ${collectionPath}
                        RETURNING META().id
                    `;
                }
                const result = await db.query(query);
                totalDeleted += result.length;
            } catch (err) {
                logger.warn(`No posts to delete from ${collection}`, { error: err.message });
            }
        }
        return totalDeleted;
    }

    async getPosts(campaignId, options = {}) {
        const { platformsToQuery } = options;
        const db = await this.getDB();
        const collections = platformsToQuery.map(plt => platformManager.getCollection(plt));
        return await db.getPosts(campaignId, collections, options);
    }

    async getTotalPostCount(campaignId) {
        const db = await this.getDB();
        const platforms = platformManager.getSupportedPlatforms();
        const collections = platforms.map(p => platformManager.getCollection(p));
        return await db.getTotalPostCount(campaignId, collections);
    }
}

module.exports = new PostRepository();
