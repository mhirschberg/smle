const logger = require('../../utils/logger');
const dbFactory = require('../storage/dbFactory');
const platformManager = require('../platforms/platformManager');

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
        return await db.insert(collection, key, document);
    }

    async deleteAllByCampaignId(campaignId, platforms) {
        const db = await this.getDB();
        let totalDeleted = 0;

        for (const platform of platforms) {
            try {
                const collection = platformManager.getCollection(platform);
                const query = `
                    DELETE FROM SMLE._default.${collection}
                    WHERE campaign_id = $campaignId
                    RETURNING META().id
                `;
                const result = await db.query(query, { parameters: { campaignId } });
                totalDeleted += result.length;
            } catch (err) {
                logger.warn(`Failed to delete ${platform} posts`, { error: err.message });
            }
        }
        return totalDeleted;
    }

    async deleteAllPosts(platformCollections) {
        const db = await this.getDB();
        let totalDeleted = 0;

        for (const collection of platformCollections) {
            try {
                const query = `
                    DELETE FROM SMLE._default.${collection}
                    RETURNING META().id
                `;
                const result = await db.query(query);
                totalDeleted += result.length;
            } catch (err) {
                logger.warn(`No posts to delete from ${collection}`, { error: err.message });
            }
        }
        return totalDeleted;
    }

    async getPosts(campaignId, options = {}) {
        const { limit = 50, offset = 0, sort = 'sentiment', sentiment = 'all', run_id = null, platform = null, platformsToQuery } = options;
        const db = await this.getDB();

        // Build WHERE clause
        let whereClause = `p.campaign_id = $id AND p.analysis_status = 'analyzed'`;

        // Filter by sentiment
        if (sentiment === 'positive') {
            whereClause += ' AND p.analysis.sentiment_score >= 8';
        } else if (sentiment === 'neutral') {
            whereClause += ' AND p.analysis.sentiment_score >= 4 AND p.analysis.sentiment_score < 8';
        } else if (sentiment === 'negative') {
            whereClause += ' AND p.analysis.sentiment_score < 4';
        }

        // Filter by run
        if (run_id) {
            whereClause += ' AND p.run_id = $runId';
        }

        // Build UNION query for multiple platforms
        const unionQueries = platformsToQuery.map(plt => {
            const collection = platformManager.getCollection(plt);
            return `
                SELECT p.*
                FROM SMLE._default.${collection} p
                WHERE ${whereClause}
            `;
        });

        // Determine ORDER BY field
        let orderByField = 'analysis.sentiment_score';
        if (sort === 'engagement') {
            orderByField = 'raw_data.engagement.likes';
        } else if (sort === 'date') {
            orderByField = 'raw_data.date_posted';
        }

        // Wrap UNION in subquery for ORDER BY to work
        const query = `
            SELECT * FROM (
                ${unionQueries.join(' UNION ALL ')}
            ) AS combined
            ORDER BY combined.${orderByField} DESC
            LIMIT $limit OFFSET $offset
        `;

        const parameters = {
            id: campaignId,
            limit: parseInt(limit),
            offset: parseInt(offset)
        };

        if (run_id) {
            parameters.runId = run_id;
        }

        const results = await db.query(query, { parameters });
        return results.map(r => r.combined || r);
    }
    async getTotalPostCount(campaignId) {
        const db = await this.getDB();
        const platforms = platformManager.getSupportedPlatforms();
        let total = 0;

        // We could run these in parallel, but for now let's be safe
        // Or better, construct a UNION ALL query?
        // UNION ALL for counts might be complex if we want a single scalar.
        // Easiest is to map promises.

        const countPromises = platforms.map(async (platform) => {
            try {
                const collection = platformManager.getCollection(platform);
                const query = `
                    SELECT COUNT(*) as count
                    FROM SMLE._default.${collection} p
                    WHERE p.campaign_id = $campaignId
                `;
                const result = await db.query(query, { parameters: { campaignId } });
                return result[0]?.count || 0;
            } catch (err) {
                logger.warn(`Failed to count posts for ${platform}`, { error: err.message });
                return 0;
            }
        });

        const counts = await Promise.all(countPromises);
        total = counts.reduce((sum, c) => sum + c, 0);

        return total;
    }
}

module.exports = new PostRepository();
