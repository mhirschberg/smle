import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

// Add request interceptor to attach token
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const searchApi = {
  // Campaigns
  getAll: () => api.get('/searches'),
  getById: (id) => api.get(`/searches/${id}`),
  create: (data) => api.post('/searches', data),
  delete: (id) => api.delete(`/searches/${id}`),
  deleteAll: () => api.delete('/searches'),

  // Runs
  getRuns: (campaignId, params = {}) => api.get(`/searches/${campaignId}/runs`, { params }),
  triggerRun: (campaignId) => api.post(`/searches/${campaignId}/run`),
  resumeRun: (runId) => api.post(`/searches/runs/${runId}/resume`),
  generateRunSummaries: (campaignId, runId) => api.post(`/searches/${campaignId}/runs/${runId}/generate-summaries`),

  // Posts with filters (updated to support platform filter)
  getPosts: (campaignId, params = {}) => api.get(`/searches/${campaignId}/posts`, { params }),

  // Stats
  getStats: (campaignId) => api.get(`/searches/${campaignId}/stats`),

  // Trend
  getTrend: (campaignId) => api.get(`/searches/${campaignId}/trend`),

  // Sentiment Summary
  getSentimentSummary: (campaignId, sentiment) => api.get(`/searches/${campaignId}/sentiment-summary`, {
    params: { sentiment },
    timeout: 60000 // 60s timeout for LLM generation
  }),
  getPlatformSummary: (campaignId, platform) => api.get(`/searches/${campaignId}/platform-summary`, { params: { platform } }),

  // Status
  toggleStatus: (campaignId, status) => api.patch(`/searches/${campaignId}/status`, { status }),
};

export const analyticsApi = {
  getBySearchId: (searchId) => api.get(`/analytics/search/${searchId}`),
  getAll: () => api.get('/analytics'),
};

export const configApi = {
  getConfig: () => api.get('/config')
};

export const postApi = {
  analyzeVideo: (data) => api.post('/posts/analyze-video-batch', data),
};

export default api;
