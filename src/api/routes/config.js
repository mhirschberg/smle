const express = require('express');
const router = express.Router();
const config = require('../../config');

/**
 * Public configuration endpoint
 */
router.get('/', (req, res) => {
    res.json({
        db_type: (process.env.DB_TYPE || config.db.type).toLowerCase(),
        llm_provider: process.env.LLM_PROVIDER || 'ollama'
    });
});

module.exports = router;
