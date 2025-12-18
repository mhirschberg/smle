const couchbase = require('couchbase');
const config = require('../../config');
const logger = require('../../utils/logger');

class CouchbaseClient {
  constructor() {
    this.cluster = null;
    this.bucket = null;
    this.collections = {};
  }

  async connect() {
    try {
      logger.info('Connecting to Couchbase...', {
        connectionString: config.db.couchbase.connectionString,
        bucket: config.db.couchbase.bucketName
      });

      this.cluster = await couchbase.connect(
        config.db.couchbase.connectionString,
        {
          username: config.db.couchbase.username,
          password: config.db.couchbase.password,
          timeouts: {
            connectTimeout: 10000,
            kvTimeout: 10000,
            queryTimeout: 75000
          }
        }
      );

      this.bucket = this.cluster.bucket(config.db.couchbase.bucketName);

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
        analytics: scope.collection('analytics')
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

  async query(queryString, options = {}) {
    try {
      const result = await this.cluster.query(queryString, options);
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
}

module.exports = new CouchbaseClient();

