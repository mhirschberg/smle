require('dotenv').config();

const config = {
  db: {
    type: process.env.DB_TYPE || 'couchbase',
    couchbase: {
      connectionString: process.env.CB_CONNECTION_STRING || 'couchbase://localhost',
      username: process.env.CB_USERNAME,
      password: process.env.CB_PASSWORD,
      bucketName: process.env.CB_BUCKET || 'SMLE'
    },
    cratedb: {
      connectionString: process.env.CRATE_CONNECTION_STRING || 'postgres://crate@localhost:5432/doc',
      username: process.env.CRATE_USERNAME || 'crate',
      password: process.env.CRATE_PASSWORD || ''
    },
    postgres: {
      connectionString: process.env.POSTGRES_CONNECTION_STRING || 'postgres://postgres:postgres@localhost:5432/smle',
      username: process.env.POSTGRES_USERNAME || 'postgres',
      password: process.env.POSTGRES_PASSWORD || 'postgres'
    }
  },

  brightData: {
    apiKey: process.env.BD_API_KEY,
    serpZone: process.env.BD_SERP_ZONE || 'serp_api1',
    apiUrl: 'https://api.brightdata.com/request'
  },

  serp: {
    maxResults: parseInt(process.env.MAX_SERP_RESULTS) || 100,
    resultsPerPage: 10,
    googleDomain: process.env.GOOGLE_DOMAIN || 'google.com',
    retryAttempts: 3,
    retryDelay: 2000
  },

  platforms: {
    instagram: {
      domains: ['instagram.com'],
      patterns: [
        /https?:\/\/(www\.)?instagram\.com\/p\/[\w-]+/,
        /https?:\/\/(www\.)?instagram\.com\/reel\/[\w-]+/
      ]
    },
    tiktok: {
      domains: ['tiktok.com'],
      patterns: [
        /https?:\/\/(www\.)?tiktok\.com\/@[\w.-]+\/video\/\d+/,
        /https?:\/\/(www\.)?tiktok\.com\/.*video\/\d+/
      ]
    },
    twitter: {
      domains: ['twitter.com', 'x.com'],
      patterns: [
        /https?:\/\/(www\.)?(twitter\.com|x\.com)\/\w+\/status\/\d+/
      ]
    },
    reddit: {
      domains: ['reddit.com'],
      patterns: [
        /https?:\/\/(www\.)?reddit\.com\/r\/[\w-]+\/comments\/[\w-]+/
      ]
    },
    facebook: {
      domains: ['facebook.com'],
      patterns: [
        /https?:\/\/(www\.)?facebook\.com\/[\w.-]+\/posts\/[\w-]+/,
        /https?:\/\/(www\.)?facebook\.com\/watch\/\?v=\d+/,
        /https?:\/\/(www\.)?facebook\.com\/share\/p\/[\w-]+/
      ]
    },
    youtube: {
      domains: ['youtube.com'],
      patterns: [
        /https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]+/
      ]
    },
    linkedin: {
      domains: ['linkedin.com'],
      patterns: [
        /https?:\/\/(www\.)?linkedin\.com\/posts\/[\w-]+/,
        /https?:\/\/(www\.)?linkedin\.com\/pulse\/[\w-]+/,
        /https?:\/\/[\w]+\.linkedin\.com\/[\w/]+-activity-\d+/
      ]
    }
  },

  env: process.env.NODE_ENV || 'development'
};

// Validate required config
function validateConfig() {
  const commonRequired = [
    'brightData.apiKey'
  ];

  const dbType = config.db.type.toLowerCase();

  if (dbType === 'couchbase') {
    commonRequired.push('db.couchbase.username');
    commonRequired.push('db.couchbase.password');
  } else if (dbType === 'cratedb' || dbType === 'postgres') {
    // For CrateDB/Postgres, we mainly need the connection string
    commonRequired.push('db.cratedb.connectionString');
  }

  const missing = [];

  commonRequired.forEach(path => {
    const keys = path.split('.');
    let value = config;
    keys.forEach(key => {
      value = value?.[key];
    });
    if (!value) missing.push(path);
  });

  if (missing.length > 0) {
    throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  }
}


validateConfig();

module.exports = config;
