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

            const query = `
                INSERT INTO ${tableName} (id, doc)
                VALUES ($1, $2)
                ON CONFLICT (id) DO UPDATE SET doc = $2
            `;

            await this.pool.query(query, [key, document]);
            return true;
        } catch (error) {
            logger.error(`Failed to upsert document to ${collectionName}`, { key, error: error.message });
            throw error;
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

    _getTableName(collectionName) {
        // Map collection names to CrateDB/Postgres tables
        // Sanitize to prevent SQL injection if collectionName comes from user input (it shouldn't)

        if (this.config.db.type === 'postgres') {
            // Postgres logic: use public schema or default search_path
            return collectionName;
        }

        // CrateDB logic: use doc schema
        return `doc.${collectionName}`;
    }
}


module.exports = CrateDbAdapter;
