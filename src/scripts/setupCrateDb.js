const { Pool } = require('pg');
const config = require('../config');
const bcrypt = require('bcryptjs');

const connectionString = process.env.CRATE_CONNECTION_STRING;

if (!connectionString) {
    console.error('ERROR: CRATE_CONNECTION_STRING environment variable is required.');
    process.exit(1);
}

console.log(`Connecting to CrateDB: ${connectionString}`);

const pool = new Pool({
    connectionString: connectionString,
});

const tables = [
    'searches',
    'search_runs',
    'users',
    'analytics',
    'instagram_posts',
    'tiktok_posts',
    'twitter_posts',
    'reddit_posts',
    'facebook_posts',
    'youtube_posts',
    'linkedin_posts'
];

// Subcolumns to ensure in "doc" OBJECT(DYNAMIC)
const requiredSubcolumns = [
    { name: 'campaign_id', type: 'STRING' },
    { name: 'type', type: 'STRING' },
    { name: 'status', type: 'STRING' },
    { name: 'run_id', type: 'STRING' },
    { name: 'analysis_status', type: 'STRING' },
    { name: 'run_at', type: 'STRING' },
    { name: 'analysis', type: 'OBJECT(DYNAMIC)' },
    { name: 'analysis\'][\'sentiment_score', type: 'FLOAT' },
    { name: 'raw_data', type: 'OBJECT(DYNAMIC)' },
    { name: 'raw_data\'][\'engagement', type: 'OBJECT(DYNAMIC)' },
    { name: 'raw_data\'][\'engagement\'][\'likes', type: 'INTEGER' },
    { name: 'raw_data\'][\'engagement\'][\'num_comments', type: 'INTEGER' },
    { name: 'raw_data\'][\'engagement\'][\'comments', type: 'INTEGER' }
];

async function setupCrateDb() {
    let client;
    const shouldDrop = process.argv.includes('--drop');

    try {
        client = await pool.connect();
        console.log('Connected to CrateDB.');

        // Verify we can access information_schema
        const schemaCheck = await client.query("SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'doc'");
        if (schemaCheck.rows.length === 0) {
            console.log("Creating 'doc' schema...");
            await client.query("CREATE SCHEMA IF NOT EXISTS doc");
        }

        for (const table of tables) {
            const fullTableName = `doc.${table}`;

            if (shouldDrop) {
                console.log(`Dropping table: ${fullTableName}...`);
                await client.query(`DROP TABLE IF EXISTS ${fullTableName}`);
            }

            console.log(`Creating/Updating table: ${fullTableName}...`);

            // 1. Create table if not exists
            const createTableQuery = `
                CREATE TABLE IF NOT EXISTS ${fullTableName} (
                    id STRING PRIMARY KEY,
                    doc OBJECT(DYNAMIC) AS (
                        campaign_id STRING,
                        type STRING,
                        status STRING,
                        run_id STRING,
                        analysis_status STRING,
                        run_at STRING,
                        analysis OBJECT(DYNAMIC) AS (
                            sentiment_score FLOAT
                        ),
                        raw_data OBJECT(DYNAMIC) AS (
                            engagement OBJECT(DYNAMIC) AS (
                                likes INTEGER,
                                num_comments INTEGER,
                                comments INTEGER
                            )
                        )
                    ),
                    created_at TIMESTAMP GENERATED ALWAYS AS CURRENT_TIMESTAMP
                )
            `;
            await client.query(createTableQuery);

            // 2. Ensure subcolumns exist via ALTER TABLE (for evolution)
            // Note: CrateDB allows adding subcolumns TO OBJECT columns
            for (const col of requiredSubcolumns) {
                try {
                    const alterQuery = `ALTER TABLE ${fullTableName} ADD COLUMN "doc"['${col.name}'] ${col.type}`;
                    await client.query(alterQuery);
                    console.log(`  Added subcolumn doc['${col.name}'] to ${table}`);
                } catch (e) {
                    // Ignore "Column already exists" errors
                    if (!e.message.includes('already exists') && !e.message.includes('DuplicateColumnException')) {
                        console.warn(`  Note: Could not add subcolumn doc['${col.name}']: ${e.message}`);
                    }
                }
            }
        }

        console.log('Tables setup successfully.');

        // Setup Admin User
        console.log('Seeding admin user...');
        const adminId = '7cf1fa74-f7b9-42fc-a054-774f9ee55c4a';
        const adminUsername = process.env.ADMIN_USERNAME;
        const adminPassword = process.env.ADMIN_PASSWORD;

        if (!adminUsername || !adminPassword) {
            console.error('ERROR: ADMIN_USERNAME and ADMIN_PASSWORD environment variables are required.');
            return;
        }

        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(adminPassword, salt);

        const adminUser = {
            id: adminId,
            type: 'user',
            username: adminUsername,
            password_hash: hash,
            created_at: new Date().toISOString()
        };

        const upsertUser = `
            INSERT INTO doc.users (id, doc)
            VALUES ($1, $2)
            ON CONFLICT (id) DO UPDATE SET doc = $2
        `;

        await client.query(upsertUser, [adminId, adminUser]);
        console.log(`Admin user seeded (${adminUsername}).`);

    } catch (err) {
        console.error('Setup failed:', err);
        process.exit(1);
    } finally {
        if (client) client.release();
        await pool.end();
    }
}

setupCrateDb();
