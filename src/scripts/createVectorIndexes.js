const axios = require('axios');
const config = require('../config');
const logger = require('../utils/logger');

async function createVectorIndexes() {
  try {
    logger.info('=== Creating Vector Search Indexes via REST API ===');
    
    const platforms = [
      { collection: 'instagram_posts', type: '_default.instagram_posts' },
      { collection: 'tiktok_posts', type: '_default.tiktok_posts' },
      { collection: 'twitter_posts', type: '_default.twitter_posts' },
      { collection: 'reddit_posts', type: '_default.reddit_posts' },
      { collection: 'facebook_posts', type: '_default.facebook_posts' },
      { collection: 'youtube_posts', type: '_default.youtube_posts' },
      { collection: 'linkedin_posts', type: '_default.linkedin_posts' }
    ];
    
    // Couchbase REST API endpoint
    const couchbaseHost = process.env.CB_REST_HOST || 'localhost';
    const couchbasePort = process.env.CB_REST_PORT || '8094';
    const baseUrl = `http://${couchbaseHost}:${couchbasePort}/api/index`;
    
    const auth = {
      username: config.couchbase.username,
      password: config.couchbase.password
    };
    
    let created = 0;
    let skipped = 0;
    let failed = 0;
    
    for (const platform of platforms) {
      const indexName = `${platform.collection}_vector_idx`;
      
      try {
        logger.info(`Creating vector index for ${platform.collection}...`);
        
        const indexDefinition = {
          type: 'fulltext-index',
          name: indexName,
          sourceType: 'gocbcore',
          sourceName: 'SMLE',
          planParams: {
            maxPartitionsPerPIndex: 128,
            indexPartitions: 1
          },
          params: {
            doc_config: {
              docid_prefix_delim: '',
              docid_regexp: '',
              mode: 'scope.collection.type_field',
              type_field: 'type'
            },
            mapping: {
              analysis: {},
              default_analyzer: 'standard',
              default_datetime_parser: 'dateTimeOptional',
              default_field: '_all',
              default_mapping: {
                dynamic: false,
                enabled: false
              },
              default_type: '_default',
              docvalues_dynamic: false,
              index_dynamic: false,
              scoring_model: 'tf-idf',
              store_dynamic: false,
              type_field: '_type',
              types: {
                [platform.type]: {
                  dynamic: false,
                  enabled: true,
                  properties: {
                    analysis: {
                      dynamic: false,
                      enabled: true,
                      properties: {
                        embedding: {
                          dynamic: false,
                          enabled: true,
                          fields: [
                            {
                              dims: 768,
                              index: true,
                              name: 'embedding',
                              similarity: 'dot_product',
                              type: 'vector',
                              vector_index_optimized_for: 'recall'
                            }
                          ]
                        },
                        sentiment_score: {
                          dynamic: false,
                          enabled: true,
                          fields: [
                            {
                              index: true,
                              name: 'sentiment_score',
                              type: 'number'
                            }
                          ]
                        }
                      }
                    },
                    campaign_id: {
                      dynamic: false,
                      enabled: true,
                      fields: [
                        {
                          analyzer: 'en',
                          index: true,
                          name: 'campaign_id',
                          type: 'text'
                        }
                      ]
                    },
                    platform: {
                      dynamic: false,
                      enabled: true,
                      fields: [
                        {
                          analyzer: 'keyword',
                          index: true,
                          name: 'platform',
                          type: 'text'
                        }
                      ]
                    }
                  }
                }
              }
            },
            store: {
              indexType: 'scorch',
              scorchMergePlanOptions: {
                floorSegmentFileSize: 139810133
              },
              scorchPersisterOptions: {
                maxSizeInMemoryMergePerWorker: 419430400,
                numPersisterWorkers: 4
              },
              segmentVersion: 16
            }
          },
          sourceParams: {
            // ADDED: Proper scoping configuration
            scopeName: '_default',
            collectionName: platform.collection
          }
        };
        
        // Create the index via REST API
        const response = await axios.put(
          `${baseUrl}/${indexName}`,
          indexDefinition,
          {
            auth: auth,
            headers: {
              'Content-Type': 'application/json',
              'Cache-Control': 'no-cache'
            },
            timeout: 30000
          }
        );
        
        if (response.status === 200) {
          logger.info(`✅ Created vector index: ${indexName}`);
          created++;
        }
        
      } catch (error) {
        if (error.response?.status === 400 && error.response?.data?.error?.includes('already exists')) {
          logger.warn(`⚠️  Index already exists: ${indexName}`);
          skipped++;
        } else {
          logger.error(`❌ Failed to create index: ${indexName}`, { 
            error: error.message,
            status: error.response?.status,
            data: error.response?.data
          });
          failed++;
        }
      }
    }
    
    logger.info('=== Vector Index Creation Complete ===', {
      created,
      skipped,
      failed,
      total: platforms.length
    });
    
    console.log(`\n📊 Vector Index Creation Summary:`);
    console.log(`  ✅ Created: ${created}`);
    console.log(`  ⚠️  Skipped (already exist): ${skipped}`);
    console.log(`  ❌ Failed: ${failed}`);
    console.log(`  📝 Total: ${platforms.length}\n`);
    
    if (created > 0) {
      console.log(`🎉 Successfully created ${created} vector index(es)!`);
      console.log(`\nVector search is now enabled for AI-powered semantic search across:`);
      platforms.forEach(p => {
        console.log(`  💼 ${p.collection}`);
      });
      console.log('');
    }
    
  } catch (error) {
    logger.error('Failed to create vector indexes', { 
      error: error.message,
      stack: error.stack
    });
    throw error;
  }
}

createVectorIndexes()
  .then(() => {
    logger.info('Script finished successfully');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Script failed', { error: error.message });
    process.exit(1);
  });

