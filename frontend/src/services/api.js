import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

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
  
  // Posts with filters (updated to support platform filter)
  getPosts: (campaignId, params = {}) => api.get(`/searches/${campaignId}/posts`, { params }),
  
  // Stats
  getStats: (campaignId) => api.get(`/searches/${campaignId}/stats`),
  
  // Trend
  getTrend: (campaignId) => api.get(`/searches/${campaignId}/trend`),
  
  // Status
  toggleStatus: (campaignId, status) => api.patch(`/searches/${campaignId}/status`, { status }),
};

export const analyticsApi = {
  getBySearchId: (searchId) => api.get(`/analytics/search/${searchId}`),
  getAll: () => api.get('/analytics'),
};

export default api;
