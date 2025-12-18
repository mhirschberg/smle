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

        const statsPromises = platforms.map(async (platform) => {
            const collection = platformManager.getCollection(platform);

            const query = `
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

            try {
                const results = await db.query(query, { parameters: { id: campaignId } });
                return results[0] || {};
            } catch (err) {
                logger.warn(`Failed to query ${platform}`, { error: err.message });
                return {};
            }
        });

        return await Promise.all(statsPromises);
    }

    async deleteAll(campaignId) {
        const db = await this.getDB();
        const query = `
            DELETE FROM SMLE._default.analytics
            WHERE campaign_id = $campaignId
            RETURNING META().id
        `;
        return await db.query(query, { parameters: { campaignId } });
    }

    async deleteAllAnalytics() {
        const db = await this.getDB();
        const query = `
            DELETE FROM SMLE._default.analytics
            RETURNING META().id
        `;
        return await db.query(query);
    }
}

module.exports = new AnalyticsRepository();
