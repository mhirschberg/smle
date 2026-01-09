// src/scripts/setupCouchbase.js
// ------------------------------------------------------------
// This script prepares a Couchbase (Capella) environment for SMLE.
// It creates the bucket (if it does not exist), the required
// collections, primary and deduplication indexes, and seeds an
// admin user (root / password from env or default).
// ------------------------------------------------------------
require('dotenv').config({ path: process.env.DOTENV_CONFIG_PATH });
const couchbase = require('couchbase');
const bcrypt = require('bcryptjs');

// ------------------------------------------------------------------
// Configuration – pulled from environment variables (same keys used
// throughout the app).  Defaults match the local development setup.
// ------------------------------------------------------------------
const connectionString = process.env.CB_CONNECTION_STRING;
const username = process.env.CB_USERNAME;
const password = process.env.CB_PASSWORD;
const bucketName = process.env.CB_BUCKET;

if (!connectionString || !username || !password || !bucketName) {
    console.error('ERROR: CB_CONNECTION_STRING, CB_USERNAME, CB_PASSWORD, and CB_BUCKET environment variables are required.');
    process.exit(1);
}

// Admin credentials – must be provided via environment variables.
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;

if (!adminUsername || !adminPassword) {
    console.error('ERROR: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required.');
    process.exit(1);
}

// ------------------------------------------------------------------
// Helper – log with a consistent prefix.
// ------------------------------------------------------------------
function log(...args) {
    console.log('[setupCouchbase]', ...args);
}

(async () => {
    let cluster;
    try {
        log('Connecting to Couchbase cluster...');
        cluster = await couchbase.connect(connectionString, {
            username,
            password,
            timeouts: {
                connectTimeout: 10000,
                kvTimeout: 10000,
                queryTimeout: 75000
            }
        });

        // ------------------------------------------------------------
        // Bucket handling – create if missing (Capella may already have it).
        // ------------------------------------------------------------
        const bucketMgr = cluster.buckets();
        const existingBuckets = await bucketMgr.getAllBuckets();
        // getAllBuckets returns an array of BucketSettings objects.
        const bucketExists = existingBuckets.some(b => b.name === bucketName);

        if (!bucketExists) {
            log(`Bucket "${bucketName}" not found – attempting to create it...`);
            try {
                await bucketMgr.createBucket({
                    name: bucketName,
                    ramQuotaMB: 200, // Minimum usually depends on the cluster tier
                    flushEnabled: false, // Often restricted on Capella
                    numReplicas: 1,      // Capella requires at least 1 replica for most tiers
                    bucketType: 'couchbase'
                });
                log('Bucket creation requested. Waiting for ready status...');
                await new Promise(r => setTimeout(r, 5000));
            } catch (e) {
                log(`Warning: Failed to create bucket "${bucketName}". If you are on Capella, please create it manually.`);
                log(`Error detail: ${e.message}`);
            }
        } else {
            log(`Bucket "${bucketName}" already exists.`);
        }

        const bucket = cluster.bucket(bucketName);
        const collMgr = bucket.collections();

        // ------------------------------------------------------------
        // Ensure required collections exist in the default scope.
        // ------------------------------------------------------------
        const scopes = await collMgr.getAllScopes();
        const defaultScope = scopes.find(s => s.name === '_default');
        const existingCollNames = (defaultScope?.collections || []).map(c => c.name);

        // List of collections to create (not including _default which always exists)
        const collectionsToCreate = [
            'searches',
            'search_runs',
            'instagram_posts',
            'tiktok_posts',
            'twitter_posts',
            'reddit_posts',
            'facebook_posts',
            'youtube_posts',
            'linkedin_posts',
            'analytics',
            'search_run_insights'
        ];

        for (const collName of collectionsToCreate) {
            if (!existingCollNames.includes(collName)) {
                log(`Creating collection "${collName}"...`);
                try {
                    await collMgr.createCollection({ name: collName, scopeName: '_default' });
                } catch (e) {
                    if (!e.message.includes('already exists')) {
                        throw e;
                    }
                }
            } else {
                log(`Collection "${collName}" already present.`);
            }
        }

        // ------------------------------------------------------------
        // Primary indexes – required for N1QL queries.
        // We create one for _default and one for each named collection.
        // ------------------------------------------------------------
        const allCollections = ['_default', ...collectionsToCreate];
        for (const coll of allCollections) {
            const q = `CREATE PRIMARY INDEX IF NOT EXISTS ON \`${bucketName}\`._default.\`${coll}\``;
            try {
                await cluster.query(q);
                log(`Primary index ensured on "${coll}".`);
            } catch (e) {
                if (!e.message.includes('already exists')) {
                    log(`Warning: Could not create primary index on "${coll}" – ${e.message}`);
                }
            }
        }

        // ------------------------------------------------------------
        // Deduplication indexes – same logic as createDeduplicationIndexes.js.
        // ------------------------------------------------------------
        const platforms = [
            'instagram_posts',
            'tiktok_posts',
            'twitter_posts',
            'reddit_posts',
            'facebook_posts',
            'youtube_posts',
            'linkedin_posts'
        ];

        for (const collection of platforms) {
            const idx1 = `idx_${collection}_url_dedup`;
            const q1 = `CREATE INDEX \`${idx1}\` IF NOT EXISTS ON \`${bucketName}\`._default.\`${collection}\`(platform_url)`;

            const idx2 = `idx_${collection}_appearances`;
            const q2 = `CREATE INDEX \`${idx2}\` IF NOT EXISTS ON \`${bucketName}\`._default.\`${collection}\`(total_appearances DESC, last_seen_run DESC)`;

            try {
                await cluster.query(q1);
                log(`Index ${idx1} ensured.`);
            } catch (e) {
                if (!e.message.includes('already exists')) log(`Warning: ${idx1} failed: ${e.message}`);
            }

            try {
                await cluster.query(q2);
                log(`Index ${idx2} ensured.`);
            } catch (e) {
                if (!e.message.includes('already exists')) log(`Warning: ${idx2} failed: ${e.message}`);
            }
        }

        // ------------------------------------------------------------
        // Seed admin user into the "_default" collection.
        // (The app maps "users" repository to "_default" collection).
        // ------------------------------------------------------------
        const defaultColl = bucket.scope('_default').collection('_default');
        const adminId = '7cf1fa74-f7b9-42fc-a054-774f9ee55c4a';
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(adminPassword, salt);
        const adminDoc = {
            id: adminId,
            type: 'user',
            username: adminUsername,
            password_hash: hash,
            created_at: new Date().toISOString()
        };
        await defaultColl.upsert(adminId, adminDoc);
        log(`Admin user seeded in _default (username: ${adminUsername}).`);

        log('Couchbase setup completed successfully.');
    } catch (err) {
        console.error('Couchbase setup failed:', err);
        process.exit(1);
    } finally {
        if (cluster) {
            await cluster.close();
        }
    }
})();
