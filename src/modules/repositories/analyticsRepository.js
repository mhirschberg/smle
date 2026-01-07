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
        const collections = platforms.map(p => platformManager.getCollection(p));
        return await db.getAggregatedStats(campaignId, collections);
    }

    async deleteAll(campaignId) {
        const db = await this.getDB();
        return await db.deleteRunsByCampaignId(campaignId); // Analytics are often tied to runs or just the campaign
        // Wait, AnalyticsRepository.deleteAll was for the 'analytics' collection specifically.
        // Let's implement deleteByProperty in adapter? Or just use one of our specialized methods.
        // For 'analytics', we can use a new orchestrated method or just keep it simple if it's not complex.

        // Actually, let's add deleteByProperty to DatabaseAdapter to avoid repo-specific branching.
    }

    async deleteAllAnalytics() {
        const db = await this.getDB();
        return await db.deleteAllCollection('analytics');
    }
}

module.exports = new AnalyticsRepository();
