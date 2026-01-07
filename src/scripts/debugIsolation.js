const postRepository = require('../modules/repositories/postRepository');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');

async function testIsolation() {
    try {
        const url = 'https://www.testing-isolation.com/post/1';
        const campaign1 = uuidv4();
        const campaign2 = uuidv4();
        const runId1 = uuidv4();
        const runId2 = uuidv4();

        console.log('Testing Campaign Isolation...');
        console.log(`URL: ${url}`);

        // 1. Save to Campaign 1
        console.log(`Saving to Campaign 1 (${campaign1})...`);
        const res1 = await postRepository.saveScrapedPost(
            'instagram',
            { url: url, shortcode: 'test1', timestamp: new Date().toISOString() },
            campaign1,
            runId1,
            1
        );
        console.log(`Campaign 1 Result: isNew=${res1.isNew}, docId=${res1.docId}`);

        // 2. Save to Campaign 2 (Should be NEW if isolated, OLD if global)
        console.log(`Saving to Campaign 2 (${campaign2})...`);
        const res2 = await postRepository.saveScrapedPost(
            'instagram',
            { url: url, shortcode: 'test1', timestamp: new Date().toISOString() },
            campaign2,
            runId2,
            1
        );
        console.log(`Campaign 2 Result: isNew=${res2.isNew}, docId=${res2.docId}`);

        if (res1.isNew && res2.isNew && res1.docId !== res2.docId) {
            console.log('✅ SUCCESS: Campaigns have isolated posts.');
        } else {
            console.log('❌ FAILURE: Campaigns are sharing/stealing posts.');
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

testIsolation();
