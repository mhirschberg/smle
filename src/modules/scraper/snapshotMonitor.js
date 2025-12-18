const logger = require('../../utils/logger');

class SnapshotMonitor {
  /**
   * Monitor a snapshot until it's ready
   * @param {string} snapshotId - Snapshot ID
   * @param {Function} checkStatusFn - Function to check status
   * @param {Object} options - Monitoring options
   * @returns {Promise<void>}
   */
  async waitForCompletion(snapshotId, checkStatusFn, options = {}) {
    const {
      pollInterval = 10000,      // 10 seconds
      timeout = 1800000,          // 30 minutes
      onProgress = null
    } = options;
    
    logger.info('Starting snapshot monitoring', { 
      snapshotId, 
      pollInterval: `${pollInterval/1000}s`,
      timeout: `${timeout/60000}min`
    });
    
    const startTime = Date.now();
    let lastStatus = null;
    
    while (true) {
      const elapsed = Date.now() - startTime;
      
      // Check timeout
      if (elapsed > timeout) {
        throw new Error(`Snapshot monitoring timeout after ${timeout/60000} minutes`);
      }
      
      try {
        // Check status
        const status = await checkStatusFn(snapshotId);
        
        // Log if status changed
        if (status.status !== lastStatus) {
          logger.info('Snapshot status update', { 
            snapshotId,
            status: status.status,
            progress: status.progress || 'N/A'
          });
          lastStatus = status.status;
        }
        
        // Call progress callback
        if (onProgress) {
          onProgress(status);
        }
        
        // Check if ready
        if (status.status === 'ready') {
          logger.info('Snapshot ready', { 
            snapshotId,
            elapsed: `${Math.round(elapsed/1000)}s`
          });
          return;
        }
        
        // Check if failed
        if (status.status === 'failed' || status.status === 'error') {
          throw new Error(`Snapshot failed: ${status.error || 'Unknown error'}`);
        }
        
        // Valid statuses: running, pending, ready
        if (!['running', 'pending', 'ready'].includes(status.status)) {
          logger.warn('Unknown snapshot status', { status: status.status });
        }
        
      } catch (error) {
        logger.error('Error checking snapshot status', { 
          snapshotId,
          error: error.message 
        });
        
        // If it's a fatal error, throw it
        if (error.message.includes('failed') || error.message.includes('timeout')) {
          throw error;
        }
        
        // Otherwise, continue polling (might be a transient error)
      }
      
      // Wait before next poll
      await this.sleep(pollInterval);
    }
  }
  
  /**
   * Monitor multiple snapshots in parallel
   * @param {Array} snapshotIds - Array of snapshot IDs
   * @param {Function} checkStatusFn - Function to check status
   * @param {Object} options - Monitoring options
   * @returns {Promise<Array>} Array of results
   */
  async waitForMultiple(snapshotIds, checkStatusFn, options = {}) {
    logger.info('Monitoring multiple snapshots', { count: snapshotIds.length });
    
    const promises = snapshotIds.map(id => 
      this.waitForCompletion(id, checkStatusFn, options)
    );
    
    return Promise.allSettled(promises);
  }
  
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = new SnapshotMonitor();

