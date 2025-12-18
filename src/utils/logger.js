const fs = require('fs');
const path = require('path');

// Create logs directory
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Create campaigns logs subdirectory
const campaignLogsDir = path.join(logsDir, 'campaigns');
if (!fs.existsSync(campaignLogsDir)) {
  fs.mkdirSync(campaignLogsDir, { recursive: true });
}

class Logger {
  constructor() {
    this.currentCampaignId = null;
    this.currentRunId = null;
    this.campaignLogFile = null;
  }
  
  /**
   * Set context for campaign/run logging
   */
  setContext(campaignId, runId = null) {
    this.currentCampaignId = campaignId;
    this.currentRunId = runId;
    
    if (campaignId) {
      const timestamp = new Date().toISOString().split('T')[0];
      const filename = runId 
        ? `${campaignId}_run${runId.substring(0, 8)}_${timestamp}.log`
        : `${campaignId}_${timestamp}.log`;
      
      this.campaignLogFile = path.join(campaignLogsDir, filename);
      
      this.info('=== Log Context Set ===', { campaignId, runId });
    }
  }
  
  /**
   * Clear context
   */
  clearContext() {
    this.currentCampaignId = null;
    this.currentRunId = null;
    this.campaignLogFile = null;
  }
  
  /**
   * Write to log file
   */
  writeToFile(level, message, meta = {}) {
    if (!this.campaignLogFile) return;
    
    try {
      const timestamp = new Date().toISOString();
      const metaStr = Object.keys(meta).length > 0 ? JSON.stringify(meta) : '';
      const logLine = `[${timestamp}] [${level}] ${message} ${metaStr}\n`;
      
      fs.appendFileSync(this.campaignLogFile, logLine);
    } catch (error) {
      // Don't throw on logging errors
      console.error('Failed to write to log file:', error.message);
    }
  }
  
  /**
   * Info level log
   */
  info(message, meta = {}) {
    const enrichedMeta = {
      ...meta,
      ...(this.currentCampaignId && { campaignId: this.currentCampaignId }),
      ...(this.currentRunId && { runId: this.currentRunId })
    };
    
    console.log(`[INFO] ${new Date().toISOString()} - ${message}`, enrichedMeta);
    this.writeToFile('INFO', message, enrichedMeta);
  }
  
  /**
   * Error level log
   */
  error(message, meta = {}) {
    const enrichedMeta = {
      ...meta,
      ...(this.currentCampaignId && { campaignId: this.currentCampaignId }),
      ...(this.currentRunId && { runId: this.currentRunId })
    };
    
    console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, enrichedMeta);
    this.writeToFile('ERROR', message, enrichedMeta);
  }
  
  /**
   * Warning level log
   */
  warn(message, meta = {}) {
    const enrichedMeta = {
      ...meta,
      ...(this.currentCampaignId && { campaignId: this.currentCampaignId }),
      ...(this.currentRunId && { runId: this.currentRunId })
    };
    
    console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, enrichedMeta);
    this.writeToFile('WARN', message, enrichedMeta);
  }
  
  /**
   * Debug level log
   */
  debug(message, meta = {}) {
    if (process.env.NODE_ENV === 'development') {
      const enrichedMeta = {
        ...meta,
        ...(this.currentCampaignId && { campaignId: this.currentCampaignId }),
        ...(this.currentRunId && { runId: this.currentRunId })
      };
      
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, enrichedMeta);
      this.writeToFile('DEBUG', message, enrichedMeta);
    }
  }
}

// Export singleton
const logger = new Logger();
module.exports = logger;

