/**
 * Interface that all database adapters must implement
 */
class DatabaseAdapter {
    constructor(config) {
        if (this.constructor === DatabaseAdapter) {
            throw new Error("Abstract class 'DatabaseAdapter' cannot be instantiated directly.");
        }
        this.config = config;
    }

    async connect() {
        throw new Error("Method 'connect()' must be implemented.");
    }

    async disconnect() {
        throw new Error("Method 'disconnect()' must be implemented.");
    }

    async get(collectionName, key) {
        throw new Error("Method 'get(collectionName, key)' must be implemented.");
    }

    async insert(collectionName, key, document) {
        throw new Error("Method 'insert(collectionName, key, document)' must be implemented.");
    }

    async upsert(collectionName, key, document) {
        throw new Error("Method 'upsert(collectionName, key, document)' must be implemented.");
    }

    async delete(collectionName, key) {
        throw new Error("Method 'delete(collectionName, key)' must be implemented.");
    }

    async query(queryString, options = {}) {
        throw new Error("Method 'query(queryString, options)' must be implemented.");
    }

    getCollectionPath(collectionName) {
        throw new Error("Method 'getCollectionPath(collectionName)' must be implemented.");
    }

    getPropertyPath(root, ...path) {
        throw new Error("Method 'getPropertyPath(root, ...path)' must be implemented.");
    }

    /**
     * Domain-specific query methods (Query Orchestration)
     */
    async getPostsByStatus(campaignId, runId, platforms, status) {
        throw new Error("Method 'getPostsByStatus()' must be implemented.");
    }

    async getPostsMissingEmbeddings(campaignId, runId, platforms) {
        throw new Error("Method 'getPostsMissingEmbeddings()' must be implemented.");
    }

    async getPosts(campaignId, platformCollections, options) {
        throw new Error("Method 'getPosts()' must be implemented.");
    }

    async getTotalPostCount(campaignId, platformCollections) {
        throw new Error("Method 'getTotalPostCount()' must be implemented.");
    }

    async findCampaigns(limit) {
        throw new Error("Method 'findCampaigns()' must be implemented.");
    }

    async findRuns(campaignId, options) {
        throw new Error("Method 'findRuns()' must be implemented.");
    }

    async findStuckRuns(cutoffTime) {
        throw new Error("Method 'findStuckRuns()' must be implemented.");
    }

    async deleteRunsByCampaignId(campaignId) {
        throw new Error("Method 'deleteRunsByCampaignId()' must be implemented.");
    }

    async deleteAllCollection(collectionName) {
        throw new Error("Method 'deleteAllCollection()' must be implemented.");
    }

    async getAggregatedStats(campaignId, platformCollections) {
        throw new Error("Method 'getAggregatedStats()' must be implemented.");
    }

    async getPostsWithEmbeddings(campaignId, platformCollections, sentiment = null) {
        throw new Error("Method 'getPostsWithEmbeddings()' must be implemented.");
    }
}

module.exports = DatabaseAdapter;
