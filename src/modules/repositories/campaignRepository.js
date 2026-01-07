const { v4: uuidv4 } = require('uuid');
const logger = require('../../utils/logger');
const dbFactory = require('../storage/dbFactory');

class CampaignRepository {
    constructor() {
        this.db = null;
    }

    async getDB() {
        if (!this.db) {
            this.db = await dbFactory.getDB();
        }
        return this.db;
    }

    async getAll(limit = 100) {
        const db = await this.getDB();
        try {
            return await db.findCampaigns(limit);
        } catch (err) {
            if (err.message.includes('not exist') || err.message.includes('not found')) {
                logger.warn('Searches table not found, returning empty array');
                return [];
            }
            throw err;
        }
    }

    async getById(id) {
        const db = await this.getDB();
        return await db.get('searches', id);
    }

    async create(campaignData) {
        const db = await this.getDB();
        return await db.upsert('searches', campaignData.id, campaignData);
    }

    async update(id, campaignData) {
        return this.create(campaignData);
    }

    async delete(id) {
        const db = await this.getDB();
        return await db.delete('searches', id);
    }

    // Run related methods

    async getActiveRunCount(campaignId) {
        const db = await this.getDB();
        const runs = await db.findRuns(campaignId, { latestOnly: false });
        return runs.filter(r => r.status === 'running').length;
    }

    async getTotalRunCount(campaignId) {
        const db = await this.getDB();
        const runs = await db.findRuns(campaignId, { latestOnly: false });
        return runs.length;
    }

    async getRunningCount(campaignId) {
        return this.getActiveRunCount(campaignId);
    }

    async getLatestRun(campaignId) {
        const db = await this.getDB();
        const runs = await db.findRuns(campaignId, { latestOnly: true });
        return runs[0] || null;
    }

    async getRuns(campaignId, limit = 50, offset = 0) {
        const db = await this.getDB();
        return await db.findRuns(campaignId, { limit, offset });
    }

    async getRunById(runId) {
        const db = await this.getDB();
        return await db.get('search_runs', runId);
    }

    async getRun(runId) {
        return this.getRunById(runId);
    }

    async createRun(runData) {
        const db = await this.getDB();
        return await db.upsert('search_runs', runData.id, runData);
    }

    async updateRun(runId, runData) {
        const db = await this.getDB();
        return await db.upsert('search_runs', runId, runData);
    }

    async deleteRunsByCampaignId(campaignId) {
        const db = await this.getDB();
        return await db.deleteRunsByCampaignId(campaignId);
    }

    async deleteAllRuns() {
        const db = await this.getDB();
        return await db.deleteAllCollection('search_runs');
    }

    async deleteAllCampaigns() {
        const db = await this.getDB();
        return await db.deleteAllCollection('searches');
    }

    async cleanupStuckRuns(cutoffMinutes = 60) {
        const db = await this.getDB();
        const cutoffTime = new Date(Date.now() - cutoffMinutes * 60 * 1000).toISOString();

        const stuckRuns = await db.findStuckRuns(cutoffTime);

        if (stuckRuns.length > 0) {
            logger.warn(`Found ${stuckRuns.length} stuck runs. Marking as failed.`);

            for (const run of stuckRuns) {
                run.status = 'failed';
                run.error = 'Run marked as failed by system cleanup (stuck in running state)';
                run.failed_at = new Date().toISOString();
                run.updated_at = new Date().toISOString();

                await this.updateRun(run.id, run);
            }
        }

        return stuckRuns.length;
    }
}

module.exports = new CampaignRepository();
