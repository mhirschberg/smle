const dbFactory = require('./src/modules/storage/dbFactory');
const config = require('./src/config');

async function debugTikTokRaw() {
    const campaignId = 'ee1e9118-7d2a-4efc-830e-61260acb3380';
    try {
        const db = await dbFactory.getDB();
        await db.connect();

        const campaignIdPath = db.getPropertyPath('doc', 'campaign_id');
        const analysisStatusPath = db.getPropertyPath('doc', 'analysis_status');
        const sentimentScorePath = db.getPropertyPath('doc', 'analysis', 'sentiment_score');
        const likesPath = db.getPropertyPath('doc', 'raw_data', 'engagement', 'likes');
        const numCommentsPath = db.getPropertyPath('doc', 'raw_data', 'engagement', 'num_comments');
        const commentsPath = db.getPropertyPath('doc', 'raw_data', 'engagement', 'comments');

        const query = `
            SELECT 
                COUNT(*) as total_posts,
                COUNT(CASE WHEN ${analysisStatusPath} = 'analyzed' THEN 1 END) as analyzed_posts,
                AVG((${sentimentScorePath})::float) as avg_sentiment,
                SUM((${likesPath})::int) as total_likes
            FROM doc.tiktok_posts p
            WHERE ${campaignIdPath} = $1
        `;

        console.log('Query:', query);
        const result = await db.query(query, { parameters: [campaignId] });
        console.log('Result:', JSON.stringify(result, null, 2));

        // Let's also check the actual values for one post to see why SUM might fail
        const sampleQuery = `SELECT ${campaignIdPath} as cid, ${analysisStatusPath} as status, ${sentimentScorePath} as score, ${likesPath} as likes FROM doc.tiktok_posts WHERE ${campaignIdPath} = $1 LIMIT 1`;
        const sample = await db.query(sampleQuery, { parameters: [campaignId] });
        console.log('Sample Post:', JSON.stringify(sample, null, 2));

        await db.disconnect();
    } catch (err) {
        console.error('Debug failed:', err);
    }
}

debugTikTokRaw();
