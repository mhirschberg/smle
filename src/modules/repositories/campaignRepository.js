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
        const query = `
            SELECT s.*
            FROM SMLE._default.searches s
            WHERE s.type IN ['campaign', 'search_parent']
            ORDER BY s.created_at DESC
            LIMIT $limit
        `;
        const results = await db.query(query, { parameters: { limit } });
        return results.map(r => r.s || r);
    }

    async getById(id) {
        const db = await this.getDB();
        return await db.get('searches', id);
    }

    async create(campaignData) {
        const db = await this.getDB();
        return await db.upsert('searches', campaignData.id, campaignData);
    }

    async delete(id) {
        const db = await this.getDB();
        return await db.delete('searches', id);
    }

    // Run related methods

    async getRunningCount(campaignId) {
        const db = await this.getDB();
        const query = `
            SELECT COUNT(*) as count
            FROM SMLE._default.search_runs r
            WHERE r.campaign_id = $campaignId
        `;
        const result = await db.query(query, { parameters: { campaignId } });
        return result[0]?.count || 0;
    }

    async getLatestRun(campaignId) {
        const db = await this.getDB();
        const query = `
            SELECT r.*
            FROM SMLE._default.search_runs r
            WHERE r.campaign_id = $campaignId
            ORDER BY r.run_at DESC
            LIMIT 1
        `;
        const result = await db.query(query, { parameters: { campaignId } });
        return result[0]?.r || result[0] || null;
    }

    async getRuns(campaignId, limit = 50, offset = 0) {
        const db = await this.getDB();
        const query = `
            SELECT r.*
            FROM SMLE._default.search_runs r
            WHERE r.campaign_id = $campaignId
            ORDER BY r.run_at DESC
            LIMIT $limit OFFSET $offset
        `;
        const results = await db.query(query, {
            parameters: { campaignId, limit, offset }
        });
        return results.map(r => r.r || r);
    }

    async getRunById(runId) {
        const db = await this.getDB();
        return await db.get('search_runs', runId);
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
        const query = `
            DELETE FROM SMLE._default.search_runs
            WHERE campaign_id = $campaignId
            RETURNING META().id
        `;
        const result = await db.query(query, { parameters: { campaignId } });
        return result;
    }

    async deleteAllRuns() {
        const db = await this.getDB();
        const query = `
            DELETE FROM SMLE._default.search_runs
            RETURNING META().id
        `;
        return await db.query(query);
    }

    async deleteAllCampaigns() {
        const db = await this.getDB();
        const query = `
            DELETE FROM SMLE._default.searches
            RETURNING META().id
        `;
        return await db.query(query);
    }

    async cleanupStuckRuns(cutoffMinutes = 60) {
        const db = await this.getDB();
        const cutoffTime = new Date(Date.now() - cutoffMinutes * 60 * 1000).toISOString();

        // Find runs that are 'running' and started before cutoffTime
        // We use run_at as the primary time indicator since updated_at might not always be present
        const query = `
            SELECT META().id as id, r.*
            FROM SMLE._default.search_runs r
            WHERE r.status = 'running'
            AND r.run_at < $cutoffTime
        `;

        const result = await db.query(query, { parameters: { cutoffTime } });
        const stuckRuns = result.map(r => r.r || r); // Handle possible wrapping

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
