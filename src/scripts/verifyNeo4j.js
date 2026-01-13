const graphRepository = require('../modules/repositories/graphRepository');
const dbFactory = require('../modules/storage/dbFactory');
const logger = require('../utils/logger');

async function verifyNeo4j() {
    console.log('=== Neo4j Integration Verification ===');

    try {
        console.log('\n1. Testing Connection...');
        const graphDB = await dbFactory.getGraphDB();

        if (!graphDB) {
            console.error('❌ Could not initialize Neo4j adapter. Is Neo4j running?');
            console.log('Check your .env settings (NEO4J_URI, NEO4J_USERNAME, NEO4J_PASSWORD)');
            return;
        }

        console.log('✅ Connection initialized.');

        console.log('\n2. Syncing Test Post...');
        const testPost = {
            id: 'test-node-' + Date.now(),
            platform: 'instagram',
            platform_url: 'https://instagram.com/p/test',
            campaign_id: 'test-campaign',
            run_id: 'test-run',
            analysis: {
                sentiment_score: 8,
                sentiment_label: 'positive',
                key_topics: ['testing', 'neo4j', 'graph'],
                brand_mentioned: true,
                summary: 'A test post for verifying graph integration.'
            },
            raw_data: {
                user_posted: 'test_user',
                author_handle: 'test_user_handle'
            }
        };

        await graphRepository.syncPost(testPost);
        console.log('✅ Post synced successfully.');

        console.log('\n3. Verifying Node Creation (Cypher Run)...');
        const records = await graphDB.run('MATCH (p:Post {id: $id}) RETURN p', { id: testPost.id });

        if (records.length > 0) {
            console.log('✅ Post node found in database.');
        } else {
            console.error('❌ Post node not found after sync.');
        }

        console.log('\n4. Verifying Relationships...');
        const relRecords = await graphDB.run(
            'MATCH (a:Author)-[:POSTED]->(p:Post {id: $id}) RETURN a.handle as handle',
            { id: testPost.id }
        );

        if (relRecords.length > 0) {
            console.log(`✅ Relationship found. Author: ${relRecords[0].get('handle')}`);
        } else {
            console.error('❌ Relationship not found.');
        }

        console.log('\n5. Testing Similarity Query...');
        const similar = await graphRepository.findSimilarPosts(testPost.id);
        console.log(`✅ Similarity query executed. Found ${similar.length} related posts.`);

        console.log('\n=== Verification Finished ===');

    } catch (error) {
        console.error('❌ Verification failed with error:', error.message);
    } finally {
        const graphDB = await dbFactory.getGraphDB();
        if (graphDB) await graphDB.close();
        process.exit(0);
    }
}

verifyNeo4j();
