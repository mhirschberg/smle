const dbFactory = require('./src/modules/storage/dbFactory');
const config = require('./src/config');

async function checkRun() {
    const runId = 'd6790429-709a-4d87-9f80-4e0a53bd5e20';
    try {
        const db = await dbFactory.getDB();
        await db.connect();

        const query = `SELECT * FROM \`${config.db.couchbase.bucketName}\`._default.search_runs WHERE id = $1`;
        const result = await db.query(query, { parameters: [runId] });

        console.log('--- Run Metadata ---');
        console.log(JSON.stringify(result[0] || 'Run not found', null, 2));

        await db.disconnect();
    } catch (err) {
        console.error('Check failed:', err);
    }
}

checkRun();
