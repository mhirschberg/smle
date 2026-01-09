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

    async getRunInsights(runIds) {
        if (!runIds || runIds.length === 0) return {};
        const db = await this.getDB();

        if (typeof db.getRunInsights === 'function') {
            return await db.getRunInsights(runIds);
        }

        // Fallback for adapters that don't implement optimized fetching (e.g. Postgres generic)
        // We shouldn't really fall back to SQL here if we want agnosticism, 
        // but for now let's assume if it's not Crate/Couchbase, we return empty or try a generic get.
        return {};
    }

    async getRunById(runId) {
        const db = await this.getDB();
        const run = await db.get('search_runs', runId);
        if (run) {
            try {
                const insights = await db.get('search_run_insights', runId);
                if (insights && insights.platform_summaries) {
                    // Check if 'platform_summaries' is already fully populated in main run? 
                    // No, main run is corrupt/limited. Sidecar is authority.
                    // Merge sidecar summaries ON TOP.
                    run.platform_summaries = {
                        ...(run.platform_summaries || {}), // In case old data exists
                        ...insights.platform_summaries
                    };
                }
            } catch (e) { /* ignore */ }
        }
        return run;
    }

    async getRun(runId) {
        return this.getRunById(runId);
    }

    async createRun(runData) {
        const db = await this.getDB();
        return await db.upsert('search_runs', runData.id, runData);
    }

    async updateRun(runId, runData) {
        // SIDECAR ARCHITECTURE:
        // We do NOT save 'platform_summaries' to the main 'search_runs' table anymore
        // because it hit the column limit.
        // Data is stored in 'search_run_insights' and merged on Read.

        if (runData.platform_summaries) {
            // Remove it from the payload destined for 'search_runs'
            delete runData.platform_summaries;
        }

        const db = await this.getDB();
        // Use direct update if available (CrateDB optimization), fallback to upsert
        if (typeof db.update === 'function') {
            return await db.update('search_runs', runId, runData);
        }
        return await db.upsert('search_runs', runId, runData);
    }

    async savePlatformSummary(runId, platform, summary) {
        const db = await this.getDB();

        // Fetch current insights for this run to merge
        let currentInsights = {};
        try {
            currentInsights = (await db.get('search_run_insights', runId)) || {};
        } catch (e) {
            // ignore if table missing
        }

        // We store it as a structured object here, because this is a NEW table 
        // and won't have the 1000 column limit issue yet.
        currentInsights.platform_summaries = currentInsights.platform_summaries || {};
        currentInsights.platform_summaries[platform] = summary;

        // We also duplicate it as 'platform_insights' just in case we switch names
        // But let's stick to platform_summaries

        return await db.upsert('search_run_insights', runId, currentInsights);
    }

    // Override getRun/Runs to merge sidecar data
    async getRuns(campaignId, limit = 50, offset = 0) {
        const db = await this.getDB();
        const runs = await db.findRuns(campaignId, { limit, offset });

        if (runs.length > 0) {
            const runIds = runs.map(r => r.id);
            const insightsMap = await this.getRunInsights(runIds);

            runs.forEach(run => {
                if (insightsMap[run.id] && insightsMap[run.id].platform_summaries) {
                    run.platform_summaries = {
                        ...(run.platform_summaries || {}),
                        ...insightsMap[run.id].platform_summaries
                    };
                }
            });
        }
        return runs;
    }

    async deleteRunsByCampaignId(campaignId) {
        const db = await this.getDB();
        // Should also delete insights but keeping it simple for now
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
