require('dotenv').config();
const postRepository = require('../modules/repositories/postRepository');
const platformManager = require('../modules/platforms/platformManager');
const dbFactory = require('../modules/storage/dbFactory');

const CAMPAIGN_ID = 'ed0aecaa-a971-44af-a118-f2cd50a89c9c';

// Main execution
(async () => {
    let db;
    try {
        console.log('Initializing DB...');
        db = await dbFactory.getDB();

        const platforms = ['instagram', 'tiktok', 'youtube', 'facebook', 'twitter', 'linkedin'];
        let foundAny = false;

        for (const platform of platforms) {
            const collection = `doc.${platform}_posts`;
            console.log(`\nChecking ${collection} for Campaign: ${CAMPAIGN_ID}`);

            try {
                // Use parameterized query for safety and correctness
                // CrateDbAdapter uses .query(sql, { parameters: [] })
                // And accessing fields inside 'doc' column requires doc['field'] syntax if not promoted
                let posts = []; // Declare posts here to allow reassignment

                // FALLBACK DEBUGGING: Just get ANY post to see structure
                console.log(`Debug: fetching ANY post from ${collection} to check schema...`);
                const querySchemaCheck = `SELECT * FROM ${collection} LIMIT 1`;
                const resultSchemaCheck = await db.query(querySchemaCheck, { parameters: [] });
                const schemaCheckPosts = resultSchemaCheck?.rows || [];

                if (schemaCheckPosts.length > 0) {
                    console.log('--- SCHEMA CHECK ---');
                    console.log('Top level keys:', Object.keys(schemaCheckPosts[0]));
                    console.log('Doc content (partial):', JSON.stringify(schemaCheckPosts[0].doc).substring(0, 200));
                    if (schemaCheckPosts[0].doc) {
                        console.log('Campaign ID in doc:', schemaCheckPosts[0].doc.campaign_id);
                    }
                }

                // Now try specific campaign
                const query = `SELECT * FROM ${collection} WHERE doc['campaign_id'] = $1 LIMIT 50`;
                const result = await db.query(query, { parameters: [CAMPAIGN_ID] });
                posts = result?.rows || []; // Override for subsequent logic

                if (posts && posts.length > 0) {
                    console.log(`Found ${posts.length} posts in ${platform}.`);
                    foundAny = true;

                    const videoPosts = posts.filter(p =>
                        p.raw_data?.is_video ||
                        p.raw_data?.media_type === 2 ||
                        (p.url && (p.url.includes('/reel/') || p.url.includes('/video/'))) ||
                        p.raw_data?.product_type === 'clips'
                    );

                    console.log(`Found ${videoPosts.length} potential video posts in ${platform}.`);

                    if (videoPosts.length > 0) {
                        const samplePost = videoPosts[0];
                        console.log(`=== SAMPLE ${platform.toUpperCase()} VIDEO POST ===`);
                        console.log('Post ID:', samplePost.id);
                        console.log('URL:', samplePost.url);
                        console.log('Media Type:', samplePost.raw_data?.media_type);

                        console.log('--- Image Candidates ---');
                        console.log('display_url:', samplePost.raw_data?.display_url);
                        console.log('thumbnail_src:', samplePost.raw_data?.thumbnail_src);
                        console.log('image_versions2[0]:', samplePost.raw_data?.image_versions2?.candidates?.[0]?.url);
                        console.log('carousel_media[0].image_versions2:', samplePost.raw_data?.carousel_media?.[0]?.image_versions2?.candidates?.[0]?.url);
                        console.log('video_versions:', samplePost.raw_data?.video_versions ? 'Present' : 'Missing');

                        console.log('\n=== FULL RAW DATA START ===');
                        console.log(JSON.stringify(samplePost.raw_data, null, 2));
                        console.log('=== FULL RAW DATA END ===');
                    }
                } else {
                    console.log(`No posts found in ${collection}.`);
                }
            } catch (e) {
                console.log(`Error querying ${collection}: ${e.message}`);
            }
        }

        if (!foundAny) {
            console.log('\nWARNING: No posts found in ANY platform collection for this campaign ID.');
            console.log('Please verify the campaign ID is correct via the dashboard URL.');
        }

    } catch (error) {
        console.error('Debug script failed', error);
    }
})();
