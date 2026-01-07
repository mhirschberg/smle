const analyticsRepository = require('../../modules/repositories/analyticsRepository');
const logger = require('../../utils/logger');
const dbFactory = require('../../modules/storage/dbFactory');

class AnalyticsController {
  /**
   * Get analytics for a search
   */
  async getAnalytics(req, res) {
    try {
      const { searchId } = req.params;
      const db = await dbFactory.getDB();
      const dbType = require('../../config').db.type.toLowerCase();

      let query;
      let params;

      if (dbType === 'postgres' || dbType === 'cratedb') {
        query = `
          SELECT doc
          FROM analytics
          WHERE doc->>'search_id' = $1
          ORDER BY doc->>'created_at' DESC
          LIMIT 1
        `;
        params = [searchId];
      } else {
        query = `
          SELECT a.*
          FROM SMLE._default.analytics a
          WHERE a.search_id = $searchId
          ORDER BY a.created_at DESC
          LIMIT 1
        `;
        params = { searchId };
      }

      const results = await db.query(query, { parameters: params });

      if (results.length === 0) {
        return res.status(404).json({ error: 'Analytics not found' });
      }

      const analytics = dbType === 'postgres' || dbType === 'cratedb' ? results[0].doc : (results[0].a || results[0]);

      res.json({ analytics });
    } catch (error) {
      logger.error('Failed to get analytics', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get all analytics
   */
  async getAllAnalytics(req, res) {
    try {
      const db = await dbFactory.getDB();
      const dbType = require('../../config').db.type.toLowerCase();

      let query;

      if (dbType === 'postgres' || dbType === 'cratedb') {
        query = `
          SELECT id, doc
          FROM analytics
          ORDER BY doc->>'created_at' DESC
          LIMIT 50
        `;
      } else {
        query = `
          SELECT META().id as id, a.*
          FROM SMLE._default.analytics a
          ORDER BY a.created_at DESC
          LIMIT 50
        `;
      }

      const results = await db.query(query);
      const analytics = results.map(r => {
        if (dbType === 'postgres' || dbType === 'cratedb') {
          return { id: r.id, ...r.doc };
        }
        return { id: r.id, ...(r.a || r) };
      });

      res.json({ analytics });
    } catch (error) {
      logger.error('Failed to get all analytics', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AnalyticsController();

