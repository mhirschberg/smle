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
        const dbType = require('../../config').db.type.toLowerCase();
        let totalDeleted = 0;

        for (const platform of platforms) {
            try {
                const collection = platformManager.getCollection(platform);
                let query;
                let params;

                if (dbType === 'postgres' || dbType === 'cratedb') {
                    query = `DELETE FROM ${collection} WHERE doc->>'campaign_id' = $1 RETURNING id`;
                    params = [campaignId];
                } else {
                    query = `
                        DELETE FROM SMLE._default.${collection}
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
                    query = `DELETE FROM ${collection} RETURNING id`;
                } else {
                    query = `
                        DELETE FROM SMLE._default.${collection}
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
        const { limit = 50, offset = 0, sort = 'sentiment', sentiment = 'all', run_id = null, platform = null, platformsToQuery } = options;
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        let whereClause;
        let parameters;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            whereClause = `doc->>'campaign_id' = $1 AND doc->>'analysis_status' = 'analyzed'`;

            if (sentiment === 'positive') {
                whereClause += " AND (doc->'analysis'->>'sentiment_score')::float >= 8";
            } else if (sentiment === 'neutral') {
                whereClause += " AND (doc->'analysis'->>'sentiment_score')::float >= 4 AND (doc->'analysis'->>'sentiment_score')::float < 8";
            } else if (sentiment === 'negative') {
                whereClause += " AND (doc->'analysis'->>'sentiment_score')::float < 4";
            }

            if (run_id) {
                whereClause += " AND doc->>'run_id' = $2";
            }

            const unionQueries = platformsToQuery.map(plt => {
                const collection = platformManager.getCollection(plt);
                return `SELECT doc FROM ${collection} WHERE ${whereClause}`;
            });

            let orderByField = "(doc->'analysis'->>'sentiment_score')::float";
            if (sort === 'engagement') {
                orderByField = "(doc->'raw_data'->'engagement'->>'likes')::int";
            } else if (sort === 'date') {
                orderByField = "doc->'raw_data'->>'date_posted'";
            }

            const query = `
                SELECT doc FROM (
                    ${unionQueries.join(' UNION ALL ')}
                ) AS combined
                ORDER BY ${orderByField} DESC
                LIMIT $${run_id ? '3' : '2'} OFFSET $${run_id ? '4' : '3'}
            `;

            parameters = [campaignId];
            if (run_id) parameters.push(run_id);
            parameters.push(parseInt(limit));
            parameters.push(parseInt(offset));

            const results = await db.query(query, { parameters });
            return results.map(r => r.doc);

        } else {
            // Couchbase N1QL
            whereClause = `p.campaign_id = $id AND p.analysis_status = 'analyzed'`;
            if (sentiment === 'positive') {
                whereClause += ' AND p.analysis.sentiment_score >= 8';
            } else if (sentiment === 'neutral') {
                whereClause += ' AND p.analysis.sentiment_score >= 4 AND p.analysis.sentiment_score < 8';
            } else if (sentiment === 'negative') {
                whereClause += ' AND p.analysis.sentiment_score < 4';
            }

            if (run_id) {
                whereClause += ' AND p.run_id = $runId';
            }

            const unionQueries = platformsToQuery.map(plt => {
                const collection = platformManager.getCollection(plt);
                return `
                    SELECT p.*
                    FROM SMLE._default.${collection} p
                    WHERE ${whereClause}
                `;
            });

            let orderByField = 'analysis.sentiment_score';
            if (sort === 'engagement') {
                orderByField = 'raw_data.engagement.likes';
            } else if (sort === 'date') {
                orderByField = 'raw_data.date_posted';
            }

            const query = `
                SELECT * FROM (
                    ${unionQueries.join(' UNION ALL ')}
                ) AS combined
                ORDER BY combined.${orderByField} DESC
                LIMIT $limit OFFSET $offset
            `;

            parameters = {
                id: campaignId,
                limit: parseInt(limit),
                offset: parseInt(offset)
            };
            if (run_id) parameters.runId = run_id;

            const results = await db.query(query, { parameters });
            return results.map(r => r.combined || r);
        }
    }

    async getTotalPostCount(campaignId) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        const platforms = platformManager.getSupportedPlatforms();

        const countPromises = platforms.map(async (platform) => {
            try {
                const collection = platformManager.getCollection(platform);
                let query;
                let params;

                if (dbType === 'postgres' || dbType === 'cratedb') {
                    query = `SELECT COUNT(*) as count FROM ${collection} WHERE doc->>'campaign_id' = $1`;
                    params = [campaignId];
                } else {
                    query = `
                        SELECT COUNT(*) as count
                        FROM SMLE._default.${collection} p
                        WHERE p.campaign_id = $campaignId
                    `;
                    params = { campaignId };
                }

                const result = await db.query(query, { parameters: params });
                return parseInt(result[0]?.count || 0);
            } catch (err) {
                logger.warn(`Failed to count posts for ${platform}`, { error: err.message });
                return 0;
            }
        });

        const counts = await Promise.all(countPromises);
        return counts.reduce((sum, c) => sum + c, 0);
    }
}

module.exports = new PostRepository();
