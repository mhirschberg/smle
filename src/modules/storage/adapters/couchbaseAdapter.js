const couchbase = require('couchbase');
const logger = require('../../../utils/logger');
const DatabaseAdapter = require('../interfaces/databaseAdapter');

class CouchbaseAdapter extends DatabaseAdapter {
    constructor(config) {
        super(config);
        this.cluster = null;
        this.bucket = null;
        this.collections = {};
    }

    async connect() {
        try {
            logger.info('Connecting to Couchbase...', {
                connectionString: this.config.db.couchbase.connectionString,
                bucket: this.config.db.couchbase.bucketName
            });

            this.cluster = await couchbase.connect(
                this.config.db.couchbase.connectionString,
                {
                    username: this.config.db.couchbase.username,
                    password: this.config.db.couchbase.password,
                    timeouts: {
                        connectTimeout: 10000,
                        kvTimeout: 10000,
                        queryTimeout: 75000
                    }
                }
            );

            this.bucket = this.cluster.bucket(this.config.db.couchbase.bucketName);

            // Initialize collections
            const scope = this.bucket.scope('_default');

            this.collections = {
                searches: scope.collection('searches'),
                search_runs: scope.collection('search_runs'),
                instagram_posts: scope.collection('instagram_posts'),
                tiktok_posts: scope.collection('tiktok_posts'),
                twitter_posts: scope.collection('twitter_posts'),
                reddit_posts: scope.collection('reddit_posts'),
                facebook_posts: scope.collection('facebook_posts'),
                youtube_posts: scope.collection('youtube_posts'),
                linkedin_posts: scope.collection('linkedin_posts'),
                analytics: scope.collection('analytics'),
                search_run_insights: scope.collection('search_run_insights'),
                users: scope.collection('_default')
            };

            logger.info('Connected to Couchbase successfully');

            return this;
        } catch (error) {
            logger.error('Failed to connect to Couchbase', { error: error.message });
            throw error;
        }
    }

    async insert(collectionName, key, document) {
        try {
            const collection = this.collections[collectionName];
            if (!collection) {
                throw new Error(`Collection '${collectionName}' not found`);
            }

            const result = await collection.insert(key, document);
            logger.debug(`Document inserted to ${collectionName}`, { key });
            return result;
        } catch (error) {
            logger.error(`Failed to insert document to ${collectionName}`, {
                key,
                error: error.message
            });
            throw error;
        }
    }

    async upsert(collectionName, key, document) {
        try {
            const collection = this.collections[collectionName];
            if (!collection) {
                throw new Error(`Collection '${collectionName}' not found`);
            }

            const result = await collection.upsert(key, document);
            logger.debug(`Document upserted to ${collectionName}`, { key });
            return result;
        } catch (error) {
            logger.error(`Failed to upsert document to ${collectionName}`, {
                key,
                error: error.message
            });
            throw error;
        }
    }

    async get(collectionName, key) {
        try {
            const collection = this.collections[collectionName];
            if (!collection) {
                throw new Error(`Collection '${collectionName}' not found`);
            }

            const result = await collection.get(key);
            return result.content;
        } catch (error) {
            if (error.name === 'DocumentNotFoundError') {
                return null;
            }
            logger.error(`Failed to get document from ${collectionName}`, {
                key,
                error: error.message
            });
            throw error;
        }
    }

    async delete(collectionName, key) {
        try {
            const collection = this.collections[collectionName];
            if (!collection) {
                throw new Error(`Collection '${collectionName}' not found`);
            }

            await collection.remove(key);
            logger.debug(`Document deleted from ${collectionName}`, { key });
            return true;
        } catch (error) {
            if (error.name === 'DocumentNotFoundError') {
                return false;
            }
            logger.error(`Failed to delete document from ${collectionName}`, {
                key,
                error: error.message
            });
            throw error;
        }
    }

    async query(queryString, options = {}) {
        try {
            // Force RequestPlus consistency ensuring the index is up-to-date with KV operations
            // This is critical for the UI to show 'processing' state immediately after 'upsert'
            const queryOptions = {
                scanConsistency: couchbase.QueryScanConsistency.RequestPlus,
                ...options
            };
            const result = await this.cluster.query(queryString, queryOptions);
            return result.rows;
        } catch (error) {
            logger.error('Query failed', { queryString, error: error.message });
            throw error;
        }
    }

    async disconnect() {
        if (this.cluster) {
            await this.cluster.close();
            logger.info('Disconnected from Couchbase');
        }
    }

    getCollectionPath(collectionName) {
        const bucket = this.config.db.couchbase.bucketName;
        // The 'users' collection is mapped to '_default' in our setup
        const actualCollection = collectionName === 'users' ? '_default' : collectionName;
        return `\`${bucket}\`._default.${actualCollection}`;
    }

    getPropertyPath(root, ...path) {
        if (path.length === 0) return root;
        return `${root}.${path.join('.')}`;
    }

    async getPostsByStatus(campaignId, runId, platformCollections, status) {
        let whereClause = `p.analysis_status = $status`;
        let params = { status };

        if (campaignId && runId) {
            whereClause = `p.campaign_id = $campaignId AND p.run_id = $runId AND ${whereClause}`;
            params.campaignId = campaignId;
            params.runId = runId;
        } else if (campaignId) {
            whereClause = `p.campaign_id = $campaignId AND ${whereClause}`;
            params.campaignId = campaignId;
        }

        const unionQueries = platformCollections.map(collection => {
            const collectionPath = this.getCollectionPath(collection);
            return `
                SELECT META().id as docId, p.*, '${collection}' as source_collection
                FROM ${collectionPath} p
                WHERE ${whereClause}
            `;
        });

        const query = unionQueries.join(' UNION ALL ');
        return await this.query(query, { parameters: params });
    }

    async getPostsMissingEmbeddings(campaignId, runId, platformCollections) {
        let whereClause = `p.analysis_status = 'analyzed' AND (p.analysis.embedding IS NULL OR p.analysis.embedding IS MISSING)`;
        let params = {};

        if (campaignId && runId) {
            whereClause = `p.campaign_id = $campaignId AND p.run_id = $runId AND ${whereClause}`;
            params.campaignId = campaignId;
            params.runId = runId;
        } else if (campaignId) {
            whereClause = `p.campaign_id = $campaignId AND ${whereClause}`;
            params.campaignId = campaignId;
        }

        const unionQueries = platformCollections.map(collection => {
            const collectionPath = this.getCollectionPath(collection);
            return `
                SELECT META().id as docId, p.*, '${collection}' as source_collection
                FROM ${collectionPath} p
                WHERE ${whereClause}
            `;
        });

        const query = unionQueries.join(' UNION ALL ');
        return await this.query(query, { parameters: params });
    }

    async getPosts(campaignId, platformCollections, options = {}) {
        const { limit = 50, offset = 0, sort = 'sentiment', sentiment = 'all', run_id = null } = options;

        // Show posts that are either:
        // 1. Fully text-analyzed (analysis_status = 'analyzed')
        // 2. Have ANY smle_vision status
        let whereClause = `p.campaign_id = $id AND (p.analysis_status = 'analyzed' OR p.smle_vision.status IS NOT MISSING)`;
        let params = { id: campaignId, limit: parseInt(limit), offset: parseInt(offset) };

        if (sentiment === 'positive') {
            whereClause += ' AND p.analysis.sentiment_score >= 8';
        } else if (sentiment === 'neutral') {
            whereClause += ' AND p.analysis.sentiment_score >= 4 AND p.analysis.sentiment_score < 8';
        } else if (sentiment === 'negative') {
            whereClause += ' AND p.analysis.sentiment_score < 4';
        }

        if (run_id) {
            whereClause += ' AND p.run_id = $runId';
            params.runId = run_id;
        }

        const unionQueries = platformCollections.map(collection => {
            const collectionPath = this.getCollectionPath(collection);
            return `SELECT p.* FROM ${collectionPath} p WHERE ${whereClause}`;
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
            ORDER BY 
                CASE WHEN combined.smle_vision.status IS NOT MISSING THEN 1 ELSE 0 END DESC,
                combined.${orderByField} DESC,
                combined.id ASC
            LIMIT $limit OFFSET $offset
        `;

        const results = await this.query(query, { parameters: params });
        return results.map(r => r.combined || r);
    }

    async getTotalPostCount(campaignId, platformCollections) {
        const countPromises = platformCollections.map(async (collection) => {
            const collectionPath = this.getCollectionPath(collection);
            const query = `SELECT COUNT(*) as count FROM ${collectionPath} p WHERE p.campaign_id = $campaignId`;
            try {
                const result = await this.query(query, { parameters: { campaignId } });
                return parseInt(result[0]?.count || 0);
            } catch (err) {
                logger.warn(`Failed to count posts for ${collection}`, { error: err.message });
                return 0;
            }
        });

        const counts = await Promise.all(countPromises);
        return counts.reduce((sum, c) => sum + c, 0);
    }

    async findCampaigns(limit = 100) {
        const collectionPath = this.getCollectionPath('searches');
        const query = `
            SELECT s.*
            FROM ${collectionPath} s
            WHERE s.type IN ['campaign', 'search_parent']
            ORDER BY s.created_at DESC
            LIMIT $limit
        `;
        const results = await this.query(query, { parameters: { limit } });
        return results.map(r => r.s || r);
    }

    async findRuns(campaignId, options = {}) {
        const { limit = 50, offset = 0, latestOnly = false } = options;
        const collectionPath = this.getCollectionPath('search_runs');

        let query = `
            SELECT r.*
            FROM ${collectionPath} r
            WHERE r.campaign_id = $campaignId
            ORDER BY r.run_at DESC
        `;

        let params = { campaignId };
        if (latestOnly) {
            query += ' LIMIT 1';
        } else {
            query += ' LIMIT $limit OFFSET $offset';
            params.limit = limit;
            params.offset = offset;
        }

        const results = await this.query(query, { parameters: params });
        return results.map(r => r.r || r);
    }

    async findStuckRuns(cutoffTime) {
        const collectionPath = this.getCollectionPath('search_runs');
        const query = `
            SELECT META().id as id, r.*
            FROM ${collectionPath} r
            WHERE r.status = 'running'
            AND (r.updated_at < $cutoffTime OR (r.updated_at IS MISSING AND r.run_at < $cutoffTime))
        `;
        const results = await this.query(query, { parameters: { cutoffTime } });
        return results.map(r => r.r || r);
    }

    async deleteRunsByCampaignId(campaignId) {
        const collectionPath = this.getCollectionPath('search_runs');
        const query = `
            DELETE FROM ${collectionPath}
            WHERE campaign_id = $campaignId
            RETURNING META().id
        `;
        return await this.query(query, { parameters: { campaignId } });
    }

    async deleteAllCollection(collectionName) {
        const collectionPath = this.getCollectionPath(collectionName);
        const query = `
            DELETE FROM ${collectionPath}
            RETURNING META().id
        `;
        return await this.query(query);
    }

    async getAggregatedStats(campaignId, platformCollections) {
        // ... (existing implementation)
        const statsPromises = platformCollections.map(async (collection) => {
            const collectionPath = this.getCollectionPath(collection);
            const query = `
                SELECT 
                    COUNT(*) as total_posts,
                    COUNT(CASE WHEN p.analysis_status = 'analyzed' THEN 1 END) as analyzed_posts,
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
                FROM ${collectionPath} p
                WHERE p.campaign_id = $id
            `;

            try {
                const results = await this.query(query, { parameters: { id: campaignId } });
                const stats = results[0] || {};
                return {
                    total_posts: Number(stats.total_posts || 0),
                    analyzed_posts: Number(stats.analyzed_posts || 0),
                    avg_sentiment: stats.avg_sentiment ? parseFloat(stats.avg_sentiment) : 0,
                    total_likes: Number(stats.total_likes || 0),
                    total_comments: Number(stats.total_comments || 0),
                    positive_count: Number(stats.positive_count || 0),
                    neutral_count: Number(stats.neutral_count || 0),
                    negative_count: Number(stats.negative_count || 0)
                };
            } catch (err) {
                logger.warn(`Failed to query ${collection}`, { error: err.message });
                return {};
            }
        });

        return await Promise.all(statsPromises);
    }

    async getPostsWithEmbeddings(campaignId, platformCollections, sentiment = null, contentTypes = null) {
        let params = { campaignId };
        if (contentTypes && contentTypes.length > 0) {
            params.contentTypes = contentTypes;
        }

        const unionQueries = platformCollections.map(collection => {
            const collectionPath = this.getCollectionPath(collection);
            let whereClause = `p.campaign_id = $campaignId AND p.analysis_status = 'analyzed' AND p.analysis.embedding IS NOT MISSING AND p.analysis.embedding IS NOT NULL`;

            if (sentiment === 'positive') {
                whereClause += ' AND p.analysis.sentiment_score >= 8';
            } else if (sentiment === 'neutral') {
                whereClause += ' AND p.analysis.sentiment_score >= 4 AND p.analysis.sentiment_score < 8';
            } else if (sentiment === 'negative') {
                whereClause += ' AND p.analysis.sentiment_score < 4';
            }

            if (contentTypes && contentTypes.length > 0) {
                whereClause += ' AND p.content_type IN $contentTypes';
            }

            return `
                SELECT META().id as docId, p.*, '${collection}' as source_collection
                FROM ${collectionPath} p
                WHERE ${whereClause}
                LIMIT 500
            `;
        });

        const query = unionQueries.join(' UNION ALL ');
        const results = await this.query(query, { parameters: params });
        return results.map(r => ({
            id: r.docId,
            ...(r.p || r),
            source_collection: r.source_collection
        }));
    }

    async getRunInsights(runIds) {
        if (!runIds || runIds.length === 0) return {};

        // Use KV Multi-Get for efficiency (faster than N1QL)
        const collection = this.collections['search_run_insights'];
        if (!collection) return {};

        const insightsMap = {};
        const timestamp = Date.now(); // For logging/stats if needed

        // Parallel fetch
        await Promise.all(runIds.map(async (id) => {
            try {
                const result = await collection.get(id);
                // Couchbase stores content directly, not wrapped in 'doc' usually.
                // But CampaignRepository falling back to upsert saves { platform_summaries: ... }
                // So result.content IS the object.
                if (result && result.content) {
                    insightsMap[id] = result.content;
                }
            } catch (err) {
                // Ignore missing content
            }
        }));

        return insightsMap;
    }

    async updatePlatformSummary(collectionName, runId, platform, summary) {
        // Use Couchbase Sub-Document API for atomic updates
        // This is extremely efficient and race-condition free
        try {
            const collection = this.collections[collectionName] || this.collections['search_run_insights'];
            if (!collection) throw new Error(`Collection ${collectionName} not found`);

            // Check if we are targeting validity of collection?
            // "search_runs" was passed by repo, but we redirect to "search_run_insights" internally?
            // Repo calls: db.updatePlatformSummary('search_runs', ...)
            // BUT Repo logic says: "We do NOT save 'platform_summaries' to main... Data is stored in 'search_run_insights'"
            // So we should INTERCEPT 'search_runs' and redirect to 'search_run_insights'.

            const targetCollection = this.collections['search_run_insights'];

            // MutateIn performs atomic partial updates
            await targetCollection.mutateIn(runId, [
                couchbase.MutateInSpec.upsert(`platform_summaries.${platform}`, summary)
            ], {
                // Create document if it doesn't exist (Store Semantics)
                storeSemantics: couchbase.StoreSemantics.Upsert
            });

            return true;
        } catch (error) {
            logger.error(`Failed to atomic update platform summary in couchbase`, { runId, platform, error: error.message });
            throw error;
        }
    }
}

module.exports = CouchbaseAdapter;
