const express = require('express');
const router = express.Router();
const config = require('../../config');

/**
 * Public configuration endpoint
 */
router.get('/', (req, res) => {
    const dbType = (process.env.DB_TYPE || config.db.type).toLowerCase();

    let dbName = 'Cloud';
    if (dbType === 'couchbase') dbName = 'Couchbase Capella';
    else if (dbType === 'cratedb') dbName = 'CrateDB Cloud';
    else if (dbType === 'postgres') dbName = 'PostgreSQL';

    res.json({
        db_type: dbType,
        db_name: dbName,
        llm_provider: process.env.LLM_PROVIDER || 'ollama'
    });
});

module.exports = router;
