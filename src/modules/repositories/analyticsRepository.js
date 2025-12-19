const logger = require('../../utils/logger');
const dbFactory = require('../storage/dbFactory');
const platformManager = require('../platforms/platformManager');

class AnalyticsRepository {
    constructor() {
        this.db = null;
    }

    async getDB() {
        if (!this.db) {
            this.db = await dbFactory.getDB();
        }
        return this.db;
    }

    async getAggregatedStats(campaignId, platforms) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        const statsPromises = platforms.map(async (platform) => {
            const collection = platformManager.getCollection(platform);
            let query;
            let params;

            if (dbType === 'postgres' || dbType === 'cratedb') {
                query = `
                    SELECT 
                        COUNT(*) as total_posts,
                        AVG((p.doc->'analysis'->>'sentiment_score')::float) as avg_sentiment,
                        SUM((p.doc->'raw_data'->'engagement'->>'likes')::int) as total_likes,
                        SUM(CASE 
                            WHEN p.doc->'raw_data'->'engagement'->>'num_comments' IS NOT NULL THEN (p.doc->'raw_data'->'engagement'->>'num_comments')::int
                            WHEN p.doc->'raw_data'->'engagement'->>'comments' IS NOT NULL THEN (p.doc->'raw_data'->'engagement'->>'comments')::int
                            ELSE 0 
                        END) as total_comments,
                        SUM(CASE WHEN (p.doc->'analysis'->>'sentiment_score')::float >= 8 THEN 1 ELSE 0 END) as positive_count,
                        SUM(CASE WHEN (p.doc->'analysis'->>'sentiment_score')::float >= 4 AND (p.doc->'analysis'->>'sentiment_score')::float < 8 THEN 1 ELSE 0 END) as neutral_count,
                        SUM(CASE WHEN (p.doc->'analysis'->>'sentiment_score')::float < 4 THEN 1 ELSE 0 END) as negative_count
                    FROM ${collection} p
                    WHERE p.doc->>'campaign_id' = $1
                    AND p.doc->>'analysis_status' = 'analyzed'
                `;
                params = [campaignId];
            } else {
                query = `
                    SELECT 
                        COUNT(*) as total_posts,
                        AVG(p.analysis.sentiment_score) as avg_sentiment,
                        SUM(p.raw_data.engagement.likes) as total_likes,
                        SUM(CASE 
                            WHEN p.raw_data.engagement.num_comments IS NOT NULL THEN p.raw_data.engagement.num_comments 
                            WHEN p.raw_data.engagement.comments IS NOT NULL THEN p.raw_data.engagement.comments 
                            ELSE 0 
                        END) as total_comments,
                        SUM(CASE WHEN p.analysis.sentiment_score >= 8 THEN 1 ELSE 0 END) as positive_count,
                        SUM(CASE WHEN p.analysis.sentiment_score >= 4 AND p.analysis.sentiment_score < 8 THEN 1 ELSE 0 END) as neutral_count,
                        SUM(CASE WHEN p.analysis.sentiment_score < 4 THEN 1 ELSE 0 END) as negative_count
                    FROM SMLE._default.${collection} p
                    WHERE p.campaign_id = $id
                    AND p.analysis_status = 'analyzed'
                `;
                params = { id: campaignId };
            }

            try {
                const results = await db.query(query, { parameters: params });
                const stats = results[0] || {};

                // Ensure all numeric values are actually Numbers (Postgres returns them as strings)
                return {
                    total_posts: Number(stats.total_posts || 0),
                    avg_sentiment: stats.avg_sentiment ? parseFloat(stats.avg_sentiment) : 0,
                    total_likes: Number(stats.total_likes || 0),
                    total_comments: Number(stats.total_comments || 0),
                    positive_count: Number(stats.positive_count || 0),
                    neutral_count: Number(stats.neutral_count || 0),
                    negative_count: Number(stats.negative_count || 0)
                };
            } catch (err) {
                logger.warn(`Failed to query ${platform}`, { error: err.message });
                return {};
            }
        });

        return await Promise.all(statsPromises);
    }

    async deleteAll(campaignId) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `DELETE FROM analytics WHERE doc->>'campaign_id' = $1 RETURNING id`;
            params = [campaignId];
        } else {
            query = `
                DELETE FROM SMLE._default.analytics
                WHERE campaign_id = $campaignId
                RETURNING META().id
            `;
            params = { campaignId };
        }

        return await db.query(query, { parameters: params });
    }

    async deleteAllAnalytics() {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        let query;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `DELETE FROM analytics RETURNING id`;
        } else {
            query = `
                DELETE FROM SMLE._default.analytics
                RETURNING META().id
            `;
        }
        return await db.query(query);
    }
}

module.exports = new AnalyticsRepository();
