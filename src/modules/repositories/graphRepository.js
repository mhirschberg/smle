const neo4j = require('neo4j-driver');
const dbFactory = require('../storage/dbFactory');
const logger = require('../../utils/logger');

class GraphRepository {
    async getDB() {
        return await dbFactory.getGraphDB();
    }

    /**
     * Sync a post and its relationships to Neo4j
     * @param {Object} post - Regular post document
     */
    async syncPost(post) {
        const db = await this.getDB();
        if (!db) return;

        const { id, platform, platform_url, campaign_id, run_id, analysis } = post;
        const raw_data = post.raw_data || {};
        const authorName = raw_data.user_posted || raw_data.youtuber || raw_data.author || 'Unknown';
        const authorHandle = raw_data.author_handle || raw_data.unique_id || authorName;

        const cypher = `
            // 1. Create/Update Post node
            MERGE (p:Post {id: $id})
            SET p.platform = $platform,
                p.url = $url,
                p.campaign_id = $campaign_id,
                p.run_id = $run_id,
                p.sentiment = $sentiment,
                p.summary = $summary

            // 2. Create/Merge Author
            MERGE (a:Author {handle: $authorHandle})
            ON CREATE SET a.name = $authorName
            
            // 3. Link Author to Post
            MERGE (a)-[:POSTED {platform: $platform}]->(p)

            // 4. Handle Topics
            WITH p, a
            UNWIND $topics as topicName
            MERGE (t:Topic {name: toLower(topicName)})
            MERGE (p)-[:MENTIONS]->(t)
            
            // 5. Handle Brand if mentioned
            WITH p, a
            WHERE $brandMentioned = true AND $brandName IS NOT NULL
            MERGE (b:Brand {name: $brandName})
            MERGE (p)-[:MENTIONS_BRAND]->(b)
        `;

        const params = {
            id,
            platform,
            url: platform_url,
            campaign_id,
            run_id: run_id,
            sentiment: analysis?.sentiment_score || null,
            summary: analysis?.summary || null,
            authorName,
            authorHandle: authorHandle.toLowerCase(),
            topics: analysis?.key_topics || [],
            brandMentioned: analysis?.brand_mentioned || false,
            brandName: analysis?.brand_mentioned ? 'SMLE_TARGET' : null // Placeholder for actual brand detection
        };

        try {
            await db.write(cypher, params);
            logger.debug(`Synced post to graph: ${id}`);
        } catch (error) {
            logger.warn(`Failed to sync post to graph: ${error.message}`);
        }
    }

    /**
     * Find similar posts based on shared topics or authors
     */
    async findSimilarPosts(postId, limit = 5) {
        const db = await this.getDB();
        if (!db) return [];

        const cypher = `
            MATCH (p1:Post {id: $postId})-[:MENTIONS]->(t:Topic)<-[:MENTIONS]-(p2:Post)
            WHERE p1 <> p2
            RETURN p2.id as id, p2.url as url, count(t) as commonTopics
            ORDER BY commonTopics DESC
            LIMIT $limit
        `;

        try {
            const records = await db.run(cypher, { postId, limit: neo4j.int(limit) });
            return records.map(record => ({
                id: record.get('id'),
                url: record.get('url'),
                commonTopics: record.get('commonTopics').toNumber()
            }));
        } catch (error) {
            logger.error(`Error finding similar posts: ${error.message}`);
            return [];
        }
    }

    /**
     * Get influence map for a campaign (Authors and their reach)
     */
    async getInfluenceMap(campaignId) {
        const db = await this.getDB();
        if (!db) return { nodes: [], edges: [] };

        const cypher = `
            MATCH (a:Author)-[r:POSTED]->(p:Post)
            WHERE p.campaign_id = $campaignId 
            AND a.handle <> 'Unknown' AND a.handle <> 'unknown'
            OPTIONAL MATCH (p)-[:MENTIONS]->(t:Topic)
            RETURN a.handle as handle, 
                   a.name as name, 
                   count(DISTINCT p) as postCount, 
                   count(DISTINCT t) as topicDiversity,
                   collect(DISTINCT p.id) as posts
        `;

        try {
            const records = await db.run(cypher, { campaignId });
            const nodes = records.map(record => {
                const postCount = record.get('postCount').toNumber();
                const topicDiversity = record.get('topicDiversity').toNumber();
                // Simple score: posts * (1 + unique topics/10)
                const influenceScore = Math.round(postCount * (1 + topicDiversity / 10) * 10) / 10;

                const name = record.get('name');
                const handle = record.get('handle');
                const label = (name && name !== 'Unknown' && name !== 'unknown') ? name : handle;

                return {
                    id: handle,
                    label: label,
                    type: 'Author',
                    postCount,
                    topicDiversity,
                    influenceScore
                };
            });

            // Discover links between authors who share topics in this campaign
            const linkCypher = `
                MATCH (a1:Author)-[:POSTED]->(p1:Post)-[:MENTIONS]->(t:Topic)
                MATCH (a2:Author)-[:POSTED]->(p2:Post)-[:MENTIONS]->(t)
                WHERE p1.campaign_id = $campaignId AND p2.campaign_id = $campaignId
                AND a1.handle < a2.handle
                AND a1.handle <> 'Unknown' AND a2.handle <> 'Unknown'
                AND a1.handle <> 'unknown' AND a2.handle <> 'unknown'
                RETURN a1.handle as source, a2.handle as target, count(distinct t) as strength
                ORDER BY strength DESC
                LIMIT 500
            `;
            const linkRecords = await db.run(linkCypher, { campaignId });
            const edges = linkRecords.map(r => ({
                source: r.get('source'),
                target: r.get('target'),
                value: r.get('strength').toNumber()
            }));

            return { nodes, edges };
        } catch (error) {
            logger.error(`Error getting influence map: ${error.message}`);
            return { nodes: [], edges: [] };
        }
    }

    /**
     * Get topic co-occurrence map
     */
    async getTopicMap(campaignId) {
        const db = await this.getDB();
        if (!db) return { nodes: [], edges: [] };

        const cypher = `
            MATCH (t1:Topic)<-[:MENTIONS]-(p:Post)-[:MENTIONS]->(t2:Topic)
            WHERE p.campaign_id = $campaignId AND t1.name < t2.name
            RETURN t1.name as topicA, t2.name as topicB, count(p) as strength
            ORDER BY strength DESC
            LIMIT 200
        `;

        try {
            const records = await db.run(cypher, { campaignId });
            const nodesSet = new Set();
            const edges = [];

            records.forEach(record => {
                const a = record.get('topicA');
                const b = record.get('topicB');
                const strength = record.get('strength').toNumber();

                nodesSet.add(a);
                nodesSet.add(b);
                edges.push({ source: a, target: b, value: strength });
            });

            const nodes = Array.from(nodesSet).map(name => ({ id: name, label: name, type: 'Topic' }));
            return { nodes, edges };
        } catch (error) {
            logger.error(`Error getting topic map: ${error.message}`);
            return { nodes: [], edges: [] };
        }
    }

    /**
     * Get communities (Lite version using connected components / shared topic clusters)
     */
    async getCommunities(campaignId) {
        const db = await this.getDB();
        if (!db) return { nodes: [], edges: [] };

        // For this 'lite' version, we'll cluster authors based on their shared topics.
        const cypher = `
            MATCH (a:Author)-[:POSTED]->(p:Post)-[:MENTIONS]->(t:Topic)
            WHERE p.campaign_id = $campaignId
            AND a.handle <> 'Unknown' AND a.handle <> 'unknown'
            WITH a, count(distinct t) as topicCount, collect(distinct t.name) as topics
            RETURN a.handle as handle, a.name as name, topicCount, topics
            ORDER BY topicCount DESC
        `;

        try {
            const records = await db.run(cypher, { campaignId });
            const nodes = records.map(record => {
                const name = record.get('name');
                const handle = record.get('handle');
                const label = (name && name !== 'Unknown' && name !== 'unknown') ? name : handle;

                return {
                    id: handle,
                    label: label,
                    type: 'Author',
                    topics: record.get('topics'),
                    topicCount: record.get('topicCount').toNumber(),
                    community: record.get('topics').length > 0 ? record.get('topics')[0] : 'None'
                };
            });

            // Also discover links between these authors to show the cohesive network in the tribe view
            const linkCypher = `
                MATCH (a1:Author)-[:POSTED]->(p1:Post)-[:MENTIONS]->(t:Topic)
                MATCH (a2:Author)-[:POSTED]->(p2:Post)-[:MENTIONS]->(t)
                WHERE p1.campaign_id = $campaignId AND p2.campaign_id = $campaignId
                AND a1.handle < a2.handle
                AND a1.handle <> 'Unknown' AND a2.handle <> 'Unknown'
                AND a1.handle <> 'unknown' AND a2.handle <> 'unknown'
                RETURN a1.handle as source, a2.handle as target, count(distinct t) as strength
                ORDER BY strength DESC
                LIMIT 500
            `;
            const linkRecords = await db.run(linkCypher, { campaignId });
            const edges = linkRecords.map(r => ({
                source: r.get('source'),
                target: r.get('target'),
                value: r.get('strength').toNumber()
            }));

            return { nodes, edges };
        } catch (error) {
            logger.error(`Error getting communities: ${error.message}`);
            return { nodes: [], edges: [] };
        }
    }

    /**
     * Find shortest path between two entities
     */
    async getPathBetween(startId, endId) {
        const db = await this.getDB();
        if (!db) return { nodes: [], edges: [] };

        const cypher = `
            MATCH (n1), (n2)
            WHERE (n1.handle = $startId OR n1.name = $startId)
              AND (n2.handle = $endId OR n2.name = $endId)
            MATCH p = shortestPath((n1)-[*..10]-(n2))
            RETURN p
        `;

        try {
            const records = await db.run(cypher, { startId, endId });
            if (records.length === 0) return { nodes: [], edges: [] };

            const path = records[0].get('p');
            const nodes = [];
            const edges = [];

            path.segments.forEach(s => {
                const sProps = s.start.properties;
                const sName = sProps.name;
                const sHandle = sProps.handle || sProps.id;
                const sLabel = (sName && sName !== 'Unknown' && sName !== 'unknown') ? sName : (sHandle || sName);

                const eProps = s.end.properties;
                const eName = eProps.name;
                const eHandle = eProps.handle || eProps.id;
                const eLabel = (eName && eName !== 'Unknown' && eName !== 'unknown') ? eName : (eHandle || eName);

                const sNode = {
                    id: sHandle || sName,
                    label: sLabel,
                    type: s.start.labels[0]
                };
                const eNode = {
                    id: eHandle || eName,
                    label: eLabel,
                    type: s.end.labels[0]
                };
                nodes.push(sNode);
                nodes.push(eNode);
                edges.push({
                    source: sNode.id,
                    target: eNode.id,
                    type: s.relationship.type
                });
            });

            // Deduplicate nodes
            const uniqueNodes = Array.from(new Map(nodes.map(n => [n.id, n])).values());

            return { nodes: uniqueNodes, edges };
        } catch (error) {
            logger.error(`Error finding path: ${error.message}`);
            return { nodes: [], edges: [] };
        }
    }

    /**
     * Get a random connected pair of authors to demonstrate pathfinding
     */
    async getSuggestedPath(campaignId) {
        const db = await this.getDB();
        if (!db) return null;

        const cypher = `
            MATCH p = (a1:Author)-[*2..4]-(a2:Author)
            WHERE a1 <> a2 
            AND a1.handle IS NOT NULL AND a2.handle IS NOT NULL
            RETURN a1.handle as start, a2.handle as end
            LIMIT 1
        `;

        try {
            const records = await db.run(cypher);
            if (records.length === 0) return null;
            return {
                start: records[0].get('start'),
                end: records[0].get('end')
            };
        } catch (error) {
            logger.error(`Error getting suggested path: ${error.message}`);
            return null;
        }
    }
}

module.exports = new GraphRepository();
