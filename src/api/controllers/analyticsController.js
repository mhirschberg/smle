const couchbaseClient = require('../../modules/storage/couchbaseClient');
const logger = require('../../utils/logger');

class AnalyticsController {
  /**
   * Get analytics for a search
   */
  async getAnalytics(req, res) {
    try {
      const { searchId } = req.params;
      
      const query = `
        SELECT a.*
        FROM SMLE._default.analytics a
        WHERE a.search_id = $searchId
        ORDER BY a.created_at DESC
        LIMIT 1
      `;
      
      const results = await couchbaseClient.query(query, { 
        parameters: { searchId } 
      });
      
      if (results.length === 0) {
        return res.status(404).json({ error: 'Analytics not found' });
      }
      
      const analytics = results[0].a || results[0];
      
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
      const query = `
        SELECT META().id as id, a.*
        FROM SMLE._default.analytics a
        ORDER BY a.created_at DESC
        LIMIT 50
      `;
      
      const results = await couchbaseClient.query(query);
      const analytics = results.map(r => ({ id: r.id, ...(r.a || r) }));
      
      res.json({ analytics });
    } catch (error) {
      logger.error('Failed to get all analytics', { error: error.message });
      res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new AnalyticsController();

