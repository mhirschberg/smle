const { Pool } = require('pg');
const logger = require('../../../utils/logger');
const DatabaseAdapter = require('../interfaces/databaseAdapter');

class CrateDbAdapter extends DatabaseAdapter {
    constructor(config) {
        super(config);
        this.pool = null;
    }

    async connect() {
        try {
            const dbType = this.config.db.type;
            const dbConfig = dbType === 'postgres' ? this.config.db.postgres : this.config.db.cratedb;

            // Sanitize connection string for logging (hide password)
            const sanitizedUrl = dbConfig.connectionString.replace(/:([^:@/]+)@/, ':****@');

            logger.info(`Connecting to ${dbType}...`, {
                connectionString: sanitizedUrl
            });

            this.pool = new Pool({
                connectionString: dbConfig.connectionString,
                user: dbConfig.username,
                password: dbConfig.password,
                max: 20,
                idleTimeoutMillis: 30000,
                connectionTimeoutMillis: 2000,
            });

            // Verify connection
            const client = await this.pool.connect();
            try {
                if (dbType === 'postgres') {
                    await client.query('SELECT 1');
                    logger.info('Connected to Postgres successfully');
                } else {
                    const res = await client.query('SELECT name FROM sys.cluster');
                    logger.info('Connected to CrateDB successfully', { cluster: res.rows[0].name });
                }
            } finally {
                client.release();
            }

            return this;
        } catch (error) {
            logger.error('Failed to connect to Database', { error: error.message });
            throw error;
        }
    }

    async disconnect() {
        if (this.pool) {
            await this.pool.end();
            logger.info('Disconnected from Database');
        }
    }

    // CrateDB/SQL helper to format keys/values
    // Note: CrateDB caches specific schemas, usually we strictly define tables.
    // However, for this adapter to mimic document store behaviors (get/upsert), 
    // we assume tables exist with 'id' column and 'doc' object column (JSONB equivalent)
    // OR we map fields.
    // For a robust implementation, we'd map 'collectionName' to table name
    // and assume schemas:
    // TABLE searches (id TEXT PRIMARY KEY, type TEXT, doc OBJECT(DYNAMIC), ...)
    // But for simplicity/compatibility we often use a single 'doc' column for the JSON body
    // and extract 'id', 'type' etc as top level columns for indexing.

    // Simplest approach for "drop-in":
    // All tables have: id (TEXT PRIMARY KEY), doc (OBJECT(DYNAMIC))

    async get(collectionName, key) {
        try {
            // Safe table name (should be validated/sanitized in real app)
            const tableName = this._getTableName(collectionName);
            const query = `SELECT doc FROM ${tableName} WHERE id = $1`;

            const result = await this.pool.query(query, [key]);

            if (result.rows.length === 0) return null;
            return result.rows[0].doc;
        } catch (error) {
            logger.error(`Failed to get document from ${collectionName}`, { key, error: error.message });
            throw error;
        }
    }

    async insert(collectionName, key, document) {
        return this.upsert(collectionName, key, document);
    }

    async upsert(collectionName, key, document) {
        try {
            const tableName = this._getTableName(collectionName);

            // CrateDB UPSERT syntax: INSERT INTO ... ON CONFLICT (id) DO UPDATE SET ...
            // Assuming 'doc' is the column storing the full JSON
            // We also extract 'type' if present for faster filtering if we had a type column,
            // but for now let's just use the doc object.

            // CrateDB/pg driver compatibility fix:
            // Explicitly stringify the document to ensure CrateDB receives a JSON string
            // and parses it correctly into the OBJECT column, avoiding "Cannot cast..." map format errors.
            const docParam = JSON.stringify(document);

            // CrateDB UPSERT syntax: INSERT INTO ... ON CONFLICT (id) DO UPDATE SET ...
            // Explicit cast ::OBJECT is required regarding of driver behavior to force parsing of JSON string
            const query = `
                INSERT INTO ${tableName} (id, doc)
                VALUES ($1, $2::OBJECT)
                ON CONFLICT (id) DO UPDATE SET doc = $2::OBJECT
            `;

            await this.pool.query(query, [key, docParam]);
            return true;
        } catch (error) {
            logger.error(`Failed to upsert document to ${collectionName}`, { key, error: error.message });
            throw error;
        }
    }

    async update(collectionName, key, document) {
        try {
            const tableName = this._getTableName(collectionName);
            const docParam = JSON.stringify(document);

            const query = `
                UPDATE ${tableName} 
                SET doc = $2::OBJECT 
                WHERE id = $1
            `;

            const result = await this.pool.query(query, [key, docParam]);
            return result.rowCount > 0;
        } catch (error) {
            logger.error(`Failed to update document in ${collectionName}`, { key, error: error.message });
            throw error;
        }
    }

    async updatePlatformSummary(collectionName, runId, platform, summary) {
        try {
            const tableName = this._getTableName(collectionName);
            // Sanitize platform key strictly to prevent SQL injection since we interpolate it
            if (!/^[a-z0-9_]+$/i.test(platform)) {
                throw new Error('Invalid platform key');
            }

            // CrateDB Atomic Update: UPDATE doc.search_runs SET doc['platform_summaries']['instagram'] = '...'
            const query = `
                UPDATE ${tableName}
                SET doc['platform_summaries']['${platform}'] = $2
                WHERE id = $1
            `;

            const result = await this.pool.query(query, [runId, summary]);
            return result.rowCount > 0;
        } catch (error) {
            logger.error(`Failed to atomic update platform summary in ${collectionName}`, { runId, platform, error: error.message });
            throw error;
        }
    }

    async getRunInsights(runIds) {
        if (!runIds || runIds.length === 0) return {};
        try {
            const runIdList = runIds.map(id => `'${id}'`).join(',');
            const tableName = this._getTableName('search_run_insights');
            const query = `SELECT id, doc FROM ${tableName} WHERE id IN (${runIdList})`;

            const results = await this.pool.query(query);
            const insightsMap = {};
            if (results && results.rows) {
                results.rows.forEach(row => {
                    if (row.doc) {
                        insightsMap[row.id] = row.doc;
                    }
                });
            }
            return insightsMap;
        } catch (error) {
            logger.warn('Failed to fetch run insights from CrateDB', { error: error.message });
            return {};
        }
    }

    async delete(collectionName, key) {
        try {
            const tableName = this._getTableName(collectionName);
            const query = `DELETE FROM ${tableName} WHERE id = $1`;
            await this.pool.query(query, [key]);
            return true;
        } catch (error) {
            logger.error(`Failed to delete document from ${collectionName}`, { key, error: error.message });
            throw error;
        }
    }

    async query(queryString, options = {}) {
        try {
            // This is the tricky part. 
            // If the repository sends N1QL, it won't work here.
            // The repository needs to send SQL.
            // We assume queryString is valid SQL for CrateDB here.

            const params = options.parameters || [];
            // Handle named parameters if passed as object (convert to $1, $2...)
            // This basic adapter assumes standard pg param arrays for now 
            // or we implement a named-to-positional converter.

            let finalQuery = queryString;
            let finalParams = [];

            if (!Array.isArray(params) && typeof params === 'object') {
                // simple named param replacement: $param -> $1
                let i = 1;
                finalParams = [];
                for (const [key, value] of Object.entries(params)) {
                    // Replace all occurrences of $key with $i
                    // Regex needed for safety
                    const regex = new RegExp(`\\$${key}\\b`, 'g');
                    if (finalQuery.match(regex)) {
                        finalQuery = finalQuery.replace(regex, `$${i}`);
                        finalParams.push(value);
                        i++;
                    }
                }
            } else {
                finalParams = params;
            }

            const result = await this.pool.query(finalQuery, finalParams);
            return result.rows;
        } catch (error) {
            logger.error('Query failed', { queryString, error: error.message });
            throw error;
        }
    }

    getCollectionPath(collectionName) {
        // Map collection names to CrateDB/Postgres tables
        // Sanitize to prevent SQL injection if collectionName comes from user input (it shouldn't)

        if (this.config.db.type === 'postgres') {
            // Postgres logic: use public schema or default search_path
            return collectionName;
        }

        // CrateDB logic: use doc schema
        return `doc.${collectionName}`;
    }

    _getTableName(collectionName) {
        return this.getCollectionPath(collectionName);
    }

    getPropertyPath(root, ...path) {
        if (path.length === 0) return root;

        if (this.config.db.type === 'postgres') {
            // Postgres JSONB: root->'p1'->>'p2'
            if (path.length === 1) {
                return `${root}->>'${path[0]}'`;
            }
            const mid = path.slice(0, -1).map(p => `->'${p}'`).join('');
            const last = `->>'${path[path.length - 1]}'`;
            return `${root}${mid}${last}`;
        }

        // CrateDB OBJECT: root['p1']['p2']
        return `${root}${path.map(p => `['${p}']`).join('')}`;
    }

    async getPostsByStatus(campaignId, runId, platformCollections, status) {
        const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
        const runIdPath = this.getPropertyPath('doc', 'run_id');
        const analysisStatusPath = this.getPropertyPath('doc', 'analysis_status');

        let whereClause = `${analysisStatusPath} = $1`;
        let params = [status];

        if (campaignId && runId) {
            whereClause += ` AND ${campaignIdPath} = $2 AND ${runIdPath} = $3`;
            params.push(campaignId, runId);
        } else if (campaignId) {
            whereClause += ` AND ${campaignIdPath} = $2`;
            params.push(campaignId);
        }

        const queryPromises = platformCollections.map(async (collection) => {
            const collectionPath = this.getCollectionPath(collection);
            const query = `
                SELECT id as docid, doc, '${collection}' as source_collection
                FROM ${collectionPath}
                WHERE ${whereClause}
            `;
            try {
                return await this.query(query, { parameters: params });
            } catch (err) {
                logger.warn(`Failed to fetch posts by status for ${collection}`, { error: err.message });
                return [];
            }
        });

        const results = await Promise.all(queryPromises);
        return results.flat();
    }

    async getPostsMissingEmbeddings(campaignId, runId, platformCollections) {
        const analysisStatusPath = this.getPropertyPath('doc', 'analysis_status');
        const embeddingPath = this.getPropertyPath('doc', 'analysis', 'embedding');
        const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
        const runIdPath = this.getPropertyPath('doc', 'run_id');

        let whereClause = `${analysisStatusPath} = 'analyzed' AND (${embeddingPath} IS NULL)`;
        let params = [];

        if (campaignId && runId) {
            whereClause += ` AND ${campaignIdPath} = $1 AND ${runIdPath} = $2`;
            params = [campaignId, runId];
        } else if (campaignId) {
            whereClause += ` AND ${campaignIdPath} = $1`;
            params = [campaignId];
        }

        const queryPromises = platformCollections.map(async (collection) => {
            const collectionPath = this.getCollectionPath(collection);
            const query = `SELECT id as docid, doc, '${collection}' as source_collection FROM ${collectionPath} WHERE ${whereClause}`;
            try {
                return await this.query(query, { parameters: params });
            } catch (err) {
                logger.warn(`Failed to fetch posts missing embeddings for ${collection}`, { error: err.message });
                return [];
            }
        });

        const results = await Promise.all(queryPromises);
        return results.flat();
    }

    async getPosts(campaignId, platformCollections, options = {}) {
        const { limit = 50, offset = 0, sort = 'sentiment', sentiment = 'all', run_id = null } = options;

        const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
        const statusPath = this.getPropertyPath('doc', 'analysis_status');
        const visionStatusPath = this.getPropertyPath('doc', 'smle_vision', 'status');

        // Allow posts that are either fully analyzed OR have an active smle_vision process
        // This ensures the "Analyzing..." cards appear in the UI even if the post isn't fully scraped/text-analyzed yet.
        let whereClause = `${campaignIdPath} = $1 AND (${statusPath} = 'analyzed' OR ${visionStatusPath} IN ('processing', 'analyzing', 'completed', 'failed'))`;
        let params = [campaignId];

        if (sentiment === 'positive') {
            const scorePath = this.getPropertyPath('doc', 'analysis', 'sentiment_score');
            whereClause += ` AND (${scorePath})::float >= 8`;
        } else if (sentiment === 'neutral') {
            const scorePath = this.getPropertyPath('doc', 'analysis', 'sentiment_score');
            whereClause += ` AND (${scorePath})::float >= 4 AND (${scorePath})::float < 8`;
        } else if (sentiment === 'negative') {
            const scorePath = this.getPropertyPath('doc', 'analysis', 'sentiment_score');
            whereClause += ` AND (${scorePath})::float < 4`;
        }

        if (run_id) {
            const runIdPath = this.getPropertyPath('doc', 'run_id');
            whereClause += ` AND ${runIdPath} = $2`;
            params.push(run_id);
        }

        // For large datasets, fetching everything and sorting in memory might be problematic, 
        // but since we need cross-table sort/limit on slightly different objects, 
        // and CrateDB UNION ALL is failing on object casting, this is the most robust way.
        // We fetch with a higher limit from each table and then merge/sort/limit.
        const queryPromises = platformCollections.map(async (collection) => {
            const collectionPath = this.getCollectionPath(collection);
            const createdAtPath = this.getPropertyPath('doc', 'created_at');
            // Add ORDER BY created_at DESC to ensure we get the most recent posts first
            const query = `SELECT doc FROM ${collectionPath} WHERE ${whereClause} ORDER BY ${createdAtPath} DESC LIMIT ${limit + offset}`;
            try {
                return await this.query(query, { parameters: params });
            } catch (err) {
                logger.warn(`Failed to fetch posts for ${collection}`, { error: err.message });
                return [];
            }
        });

        const allPlatformResults = await Promise.all(queryPromises);
        const results = allPlatformResults.flat().map(r => r.doc);

        // Sort in memory
        results.sort((a, b) => {
            // Prioritize posts with smle_vision data (active or completed)
            const aVision = a?.smle_vision?.status ? 1 : 0;
            const bVision = b?.smle_vision?.status ? 1 : 0;
            if (aVision !== bVision) {
                return bVision - aVision; // Vision posts first
            }

            let valA, valB;
            if (sort === 'engagement') {
                valA = parseInt(a?.raw_data?.engagement?.likes || 0);
                valB = parseInt(b?.raw_data?.engagement?.likes || 0);
            } else if (sort === 'date') {
                valA = new Date(a?.raw_data?.date_posted || 0).getTime();
                valB = new Date(b?.raw_data?.date_posted || 0).getTime();
            } else {
                valA = parseFloat(a?.analysis?.sentiment_score || 0);
                valB = parseFloat(b?.analysis?.sentiment_score || 0);
            }
            return valB - valA; // Descending
        });

        return results.slice(offset, offset + limit);
    }

    async getTotalPostCount(campaignId, platformCollections) {
        const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');

        const countPromises = platformCollections.map(async (collection) => {
            const collectionPath = this.getCollectionPath(collection);
            const query = `SELECT COUNT(*) as count FROM ${collectionPath} WHERE ${campaignIdPath} = $1`;
            try {
                const result = await this.query(query, { parameters: [campaignId] });
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
        const typePath = this.getPropertyPath('doc', 'type');
        const query = `
            SELECT doc FROM ${collectionPath}
            WHERE ${typePath} IN ('campaign', 'search_parent')
            ORDER BY doc['created_at'] DESC
            LIMIT $1
        `;
        const results = await this.query(query, { parameters: [limit] });
        return results.map(r => r.doc);
    }

    async findRuns(campaignId, options = {}) {
        const { limit = 50, offset = 0, latestOnly = false } = options;
        const collectionPath = this.getCollectionPath('search_runs');
        const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
        const runAtPath = this.getPropertyPath('doc', 'run_at');

        let query = `
            SELECT doc FROM ${collectionPath} 
            WHERE ${campaignIdPath} = $1 
            ORDER BY ${runAtPath} DESC 
        `;

        let params = [campaignId];
        if (latestOnly) {
            query += ' LIMIT 1';
        } else {
            query += ' LIMIT $2 OFFSET $3';
            params.push(limit, offset);
        }

        const results = await this.query(query, { parameters: params });
        return results.map(r => r.doc);
    }

    async findStuckRuns(cutoffTime) {
        const collectionPath = this.getCollectionPath('search_runs');
        const statusPath = this.getPropertyPath('doc', 'status');
        const runAtPath = this.getPropertyPath('doc', 'run_at');
        const query = `
            SELECT doc FROM ${collectionPath} 
            WHERE ${statusPath} = 'running' 
            AND ${runAtPath} < $1
        `;
        const results = await this.query(query, { parameters: [cutoffTime] });
        return results.map(r => r.doc);
    }

    async deleteRunsByCampaignId(campaignId) {
        const collectionPath = this.getCollectionPath('search_runs');
        const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
        const returning = this.config.db.type === 'cratedb' ? '' : ' RETURNING id';
        const query = `DELETE FROM ${collectionPath} WHERE ${campaignIdPath} = $1${returning}`;
        return await this.query(query, { parameters: [campaignId] });
    }

    async deleteAllCollection(collectionName) {
        const collectionPath = this.getCollectionPath(collectionName);
        const returning = this.config.db.type === 'cratedb' ? '' : ' RETURNING id';
        return await this.query(`DELETE FROM ${collectionPath}${returning}`);
    }

    async getAggregatedStats(campaignId, platformCollections) {
        // ... (existing implementation)
        const statsPromises = platformCollections.map(async (collection) => {
            const sentimentScorePath = this.getPropertyPath('doc', 'analysis', 'sentiment_score');
            const likesPath = this.getPropertyPath('doc', 'raw_data', 'engagement', 'likes');
            const numCommentsPath = this.getPropertyPath('doc', 'raw_data', 'engagement', 'num_comments');
            const commentsPath = this.getPropertyPath('doc', 'raw_data', 'engagement', 'comments');
            const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
            const analysisStatusPath = this.getPropertyPath('doc', 'analysis_status');

            const collectionPath = this.getCollectionPath(collection);
            const query = `
                SELECT 
                    COUNT(*) as total_posts,
                    COUNT(CASE WHEN ${analysisStatusPath} = 'analyzed' THEN 1 END) as analyzed_posts,
                    AVG(NULLIF((${sentimentScorePath})::float, 0)) as avg_sentiment,
                    SUM(COALESCE((${likesPath})::int, 0)) as total_likes,
                    SUM(CASE 
                        WHEN ${numCommentsPath} IS NOT NULL AND (${numCommentsPath})::text ~ '^[0-9]+$' THEN (${numCommentsPath})::int
                        WHEN ${commentsPath} IS NOT NULL AND (${commentsPath})::text ~ '^[0-9]+$' THEN (${commentsPath})::int
                        ELSE 0 
                    END) as total_comments,
                    SUM(CASE WHEN (${sentimentScorePath})::float >= 8 THEN 1 ELSE 0 END) as positive_count,
                    SUM(CASE WHEN (${sentimentScorePath})::float >= 4 AND (${sentimentScorePath})::float < 8 THEN 1 ELSE 0 END) as neutral_count,
                    SUM(CASE WHEN (${sentimentScorePath})::float > 0 AND (${sentimentScorePath})::float < 4 THEN 1 ELSE 0 END) as negative_count
                FROM ${collectionPath} p
                WHERE ${campaignIdPath} = $1
            `;

            try {
                const results = await this.query(query, { parameters: [campaignId] });
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
        const fetchPromises = platformCollections.map(async (collection) => {
            const tableName = this._getTableName(collection);
            const campaignIdPath = this.getPropertyPath('doc', 'campaign_id');
            const statusPath = this.getPropertyPath('doc', 'analysis_status');
            const embeddingPath = this.getPropertyPath('doc', 'analysis', 'embedding');
            const sentimentPath = this.getPropertyPath('doc', 'analysis', 'sentiment_score');
            const contentTypePath = this.getPropertyPath('doc', 'content_type');

            let whereClause = `${campaignIdPath} = $1 AND ${statusPath} = 'analyzed' AND ${embeddingPath} IS NOT NULL`;
            let params = [campaignId];

            if (sentiment === 'positive') {
                whereClause += ` AND (${sentimentPath})::float >= 8`;
            } else if (sentiment === 'neutral') {
                whereClause += ` AND (${sentimentPath})::float >= 4 AND (${sentimentPath})::float < 8`;
            } else if (sentiment === 'negative') {
                whereClause += ` AND (${sentimentPath})::float < 4`;
            }

            if (contentTypes && contentTypes.length > 0) {
                // Construct IN clause for content types
                // e.g. AND doc['content_type'] IN ('reel', 'video')
                const typeList = contentTypes.map(t => `'${t}'`).join(', ');
                whereClause += ` AND ${contentTypePath} IN (${typeList})`;
            }

            const query = `
                SELECT id, doc, '${collection}' as source_collection
                FROM ${tableName}
                WHERE ${whereClause}
                LIMIT 500
            `;

            try {
                const results = await this.pool.query(query, params);
                return results.rows;
            } catch (err) {
                logger.warn(`Failed to fetch posts with embeddings from ${collection}`, { error: err.message });
                return [];
            }
        });

        const allResults = await Promise.all(fetchPromises);
        return allResults.flat();
    }
}


module.exports = CrateDbAdapter;
