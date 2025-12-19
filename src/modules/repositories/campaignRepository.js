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
        const dbType = require('../../config').db.type.toLowerCase();

        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `
                SELECT doc FROM searches
                WHERE doc->>'type' IN ('campaign', 'search_parent')
                ORDER BY created_at DESC
                LIMIT $1
            `;
            params = [limit];
        } else {
            query = `
                SELECT s.*
                FROM SMLE._default.searches s
                WHERE s.type IN ['campaign', 'search_parent']
                ORDER BY s.created_at DESC
                LIMIT $limit
            `;
            params = { limit };
        }

        const results = await db.query(query, { parameters: params });

        if (dbType === 'postgres' || dbType === 'cratedb') {
            return results.map(r => r.doc);
        }
        return results.map(r => r.s || r);
    }

    async getById(id) {
        const db = await this.getDB();
        return await db.get('searches', id);
    }

    async create(campaignData) {
        const db = await this.getDB();
        // Repository pattern: use upsert which handles doc structure via adapter
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

    async getRunningCount(campaignId) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `SELECT COUNT(*) as count FROM search_runs WHERE doc->>'campaign_id' = $1`;
            params = [campaignId];
        } else {
            query = `
                SELECT COUNT(*) as count
                FROM SMLE._default.search_runs r
                WHERE r.campaign_id = $campaignId
            `;
            params = { campaignId };
        }

        const result = await db.query(query, { parameters: params });
        return parseInt(result[0]?.count || 0);
    }

    async getLatestRun(campaignId) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `
                SELECT doc FROM search_runs 
                WHERE doc->>'campaign_id' = $1 
                ORDER BY doc->>'run_at' DESC 
                LIMIT 1
            `;
            params = [campaignId];
        } else {
            query = `
                SELECT r.*
                FROM SMLE._default.search_runs r
                WHERE r.campaign_id = $campaignId
                ORDER BY r.run_at DESC
                LIMIT 1
            `;
            params = { campaignId };
        }

        const result = await db.query(query, { parameters: params });

        if (dbType === 'postgres' || dbType === 'cratedb') {
            return result[0]?.doc || null;
        }
        return result[0]?.r || result[0] || null;
    }

    async getRuns(campaignId, limit = 50, offset = 0) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `
                SELECT doc FROM search_runs 
                WHERE doc->>'campaign_id' = $1 
                ORDER BY doc->>'run_at' DESC 
                LIMIT $2 OFFSET $3
            `;
            params = [campaignId, limit, offset];
        } else {
            query = `
                SELECT r.*
                FROM SMLE._default.search_runs r
                WHERE r.campaign_id = $campaignId
                ORDER BY r.run_at DESC
                LIMIT $limit OFFSET $offset
            `;
            params = { campaignId, limit, offset };
        }

        const results = await db.query(query, { parameters: params });

        if (dbType === 'postgres' || dbType === 'cratedb') {
            return results.map(r => r.doc);
        }
        return results.map(r => r.r || r);
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
        const dbType = require('../../config').db.type.toLowerCase();

        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `DELETE FROM search_runs WHERE doc->>'campaign_id' = $1 RETURNING id`;
            params = [campaignId];
        } else {
            query = `
                DELETE FROM SMLE._default.search_runs
                WHERE campaign_id = $campaignId
                RETURNING META().id
            `;
            params = { campaignId };
        }

        return await db.query(query, { parameters: params });
    }

    async deleteAllRuns() {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        if (dbType === 'postgres' || dbType === 'cratedb') {
            return await db.query(`DELETE FROM search_runs RETURNING id`);
        }

        const query = `
            DELETE FROM SMLE._default.search_runs
            RETURNING META().id
        `;
        return await db.query(query);
    }

    async deleteAllCampaigns() {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();

        if (dbType === 'postgres' || dbType === 'cratedb') {
            return await db.query(`DELETE FROM searches RETURNING id`);
        }

        const query = `
            DELETE FROM SMLE._default.searches
            RETURNING META().id
        `;
        return await db.query(query);
    }

    async cleanupStuckRuns(cutoffMinutes = 60) {
        const db = await this.getDB();
        const dbType = require('../../config').db.type.toLowerCase();
        const cutoffTime = new Date(Date.now() - cutoffMinutes * 60 * 1000).toISOString();

        let query;
        let params;

        if (dbType === 'postgres' || dbType === 'cratedb') {
            query = `
                SELECT doc FROM search_runs 
                WHERE doc->>'status' = 'running' 
                AND doc->>'run_at' < $1
            `;
            params = [cutoffTime];
        } else {
            query = `
                SELECT META().id as id, r.*
                FROM SMLE._default.search_runs r
                WHERE r.status = 'running'
                AND r.run_at < $cutoffTime
            `;
            params = { cutoffTime };
        }

        const result = await db.query(query, { parameters: params });

        let stuckRuns;
        if (dbType === 'postgres' || dbType === 'cratedb') {
            stuckRuns = result.map(r => r.doc);
        } else {
            stuckRuns = result.map(r => r.r || r);
        }

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
