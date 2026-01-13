const neo4j = require('neo4j-driver');
const logger = require('../../../utils/logger');

class Neo4jAdapter {
    constructor(config) {
        this.config = config.db.neo4j;
        this.driver = null;
    }

    async connect() {
        if (this.driver) return;

        try {
            this.driver = neo4j.driver(
                this.config.uri,
                neo4j.auth.basic(this.config.username, this.config.password)
            );
            await this.driver.verifyConnectivity();
            logger.info('Connected to Neo4j');
        } catch (error) {
            logger.error(`Failed to connect to Neo4j: ${error.message}`);
            throw error;
        }
    }

    async close() {
        if (this.driver) {
            await this.driver.close();
            this.driver = null;
        }
    }

    async run(cypher, params = {}) {
        if (!this.driver) {
            await this.connect();
        }

        const session = this.driver.session();
        try {
            const result = await session.executeRead(tx => tx.run(cypher, params));
            return result.records;
        } catch (error) {
            logger.error(`Cypher execution failed: ${error.message}`, { cypher, params });
            throw error;
        } finally {
            await session.close();
        }
    }

    // Helper to run write transactions
    async write(cypher, params = {}) {
        if (!this.driver) {
            await this.connect();
        }

        const session = this.driver.session();
        try {
            return await session.executeWrite(tx => tx.run(cypher, params));
        } catch (error) {
            logger.error(`Cypher write failed: ${error.message}`, { cypher, params });
            throw error;
        } finally {
            await session.close();
        }
    }
}

module.exports = Neo4jAdapter;
