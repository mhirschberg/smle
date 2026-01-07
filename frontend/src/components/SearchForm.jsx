import React, { useState } from 'react';
import { Search, Loader, Calendar, Clock, RefreshCw, CheckCircle, Settings } from 'lucide-react';

const SearchForm = ({ onSubmit, loading }) => {
  const [formData, setFormData] = useState({
    search_query: '',
    platforms: ['instagram'],
    google_domain: 'google.com',
    scheduled: false,
    interval_minutes: 10,
    duration_days: 7,
    tiktok_post_limit: 100,
    reddit_post_limit: 100,
    youtube_post_limit: 100,
    reddit_use_dual_search: true,
    enable_relevance_filter: false,
    relevance_threshold: 0.7,
    description: ''
  });

  const platforms = [
    { id: 'instagram', name: 'Instagram', icon: '📷', available: true },
    { id: 'tiktok', name: 'TikTok', icon: '🎵', available: true },
    { id: 'twitter', name: 'Twitter/X', icon: '🐦', available: true },
    { id: 'reddit', name: 'Reddit', icon: '🔴', available: true },
    { id: 'facebook', name: 'Facebook', icon: '📘', available: true },
    { id: 'youtube', name: 'YouTube', icon: '📺', available: true },
    { id: 'linkedin', name: 'LinkedIn', icon: '💼', available: true }
  ];

  const googleDomains = [
    { value: 'google.com', label: 'Google.com (Global)' },
    { value: 'google.co.uk', label: 'Google.co.uk (UK)' },
    { value: 'google.de', label: 'Google.de (Germany)' },
    { value: 'google.fr', label: 'Google.fr (France)' },
    { value: 'google.ca', label: 'Google.ca (Canada)' },
    { value: 'google.com.au', label: 'Google.com.au (Australia)' },
  ];

  const handleSubmit = (e) => {
    e.preventDefault();
    onSubmit(formData);
  };

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const togglePlatform = (platformId) => {
    setFormData(prev => {
      const currentPlatforms = prev.platforms;
      if (currentPlatforms.includes(platformId)) {
        if (currentPlatforms.length > 1) {
          return { ...prev, platforms: currentPlatforms.filter(p => p !== platformId) };
        }
        return prev;
      } else {
        return { ...prev, platforms: [...currentPlatforms, platformId] };
      }
    });
  };

  const selectAllPlatforms = () => {
    const availablePlatforms = platforms.filter(p => p.available).map(p => p.id);
    setFormData(prev => ({ ...prev, platforms: availablePlatforms }));
  };

  const deselectAllPlatforms = () => {
    setFormData(prev => ({ ...prev, platforms: [platforms[0].id] }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Search Query */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Search Keywords *
        </label>
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            required
            value={formData.search_query}
            onChange={(e) => handleChange('search_query', e.target.value)}
            placeholder="e.g., AI news, climate change, tech trends"
            className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          This search will run across all selected platforms simultaneously
        </p>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Campaign Description (Optional)
        </label>
        <textarea
          value={formData.description}
          onChange={(e) => handleChange('description', e.target.value)}
          placeholder="Add context or notes about this campaign..."
          rows="3"
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
        />
        <p className="mt-1 text-xs text-gray-500">
          This will be displayed on the campaign card to help you identify it
        </p>
      </div>

      {/* Platform Multi-Selection */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="block text-sm font-medium text-gray-700">
            Platforms * ({formData.platforms.length} selected)
          </label>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={selectAllPlatforms}
              className="text-xs text-blue-600 hover:text-blue-800 font-medium"
            >
              Select All
            </button>
            <span className="text-gray-400">|</span>
            <button
              type="button"
              onClick={deselectAllPlatforms}
              className="text-xs text-gray-600 hover:text-gray-800 font-medium"
            >
              Clear
            </button>
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          {platforms.map(platform => {
            const isSelected = formData.platforms.includes(platform.id);

            return (
              <button
                key={platform.id}
                type="button"
                disabled={!platform.available}
                onClick={() => platform.available && togglePlatform(platform.id)}
                className={`
                  relative p-4 rounded-lg border-2 transition-all
                  ${isSelected
                    ? 'border-blue-500 bg-blue-50 shadow-md ring-2 ring-blue-200'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                  }
                  ${!platform.available ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                `}
              >
                {isSelected && (
                  <div className="absolute top-2 right-2">
                    <CheckCircle className="w-5 h-5 text-blue-600" fill="currentColor" />
                  </div>
                )}

                <div className="text-3xl mb-2">{platform.icon}</div>
                <div className="text-sm font-medium text-gray-800">{platform.name}</div>

                {!platform.available && (
                  <div className="absolute top-2 left-2">
                    <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                      Soon
                    </span>
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <p className="mt-2 text-xs text-gray-500">
          💡 Select multiple platforms to search them all simultaneously
        </p>
      </div>

      {/* Google Domain */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Google Domain
        </label>
        <select
          value={formData.google_domain}
          onChange={(e) => handleChange('google_domain', e.target.value)}
          className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {googleDomains.map(domain => (
            <option key={domain.value} value={domain.value}>
              {domain.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          Choose the Google domain to search (affects language and region)
        </p>
      </div>

      {/* Advanced Settings */}
      {(formData.platforms.includes('tiktok') || formData.platforms.includes('reddit') || formData.platforms.includes('youtube') || formData.platforms.length > 0) && (
        <div className="border-t border-gray-200 pt-6">
          <div className="flex items-center space-x-2 mb-4">
            <Settings className="w-5 h-5 text-gray-600" />
            <h3 className="text-sm font-semibold text-gray-700">
              Advanced Settings
            </h3>
          </div>

          {/* Post Limits */}
          {(formData.platforms.includes('tiktok') || formData.platforms.includes('reddit') || formData.platforms.includes('youtube')) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              {formData.platforms.includes('tiktok') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🎵 TikTok Post Limit
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={formData.tiktok_post_limit}
                    onChange={(e) => handleChange('tiktok_post_limit', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {formData.platforms.includes('reddit') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    🔴 Reddit Post Limit
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={formData.reddit_post_limit}
                    onChange={(e) => handleChange('reddit_post_limit', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              {formData.platforms.includes('youtube') && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    📺 YouTube Video Limit
                  </label>
                  <input
                    type="number"
                    min="10"
                    max="500"
                    value={formData.youtube_post_limit}
                    onChange={(e) => handleChange('youtube_post_limit', parseInt(e.target.value) || 100)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}
            </div>
          )}

          {/* Reddit Dual Search Toggle */}
          {formData.platforms.includes('reddit') && (
            <div className="mb-4 p-4 bg-orange-50 rounded-lg border border-orange-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-semibold text-gray-700">
                    🔴 Reddit Dual Search
                  </h4>
                  <p className="text-xs text-gray-600 mt-1">
                    Use both Google SERP and Reddit keyword search for comprehensive coverage
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleChange('reddit_use_dual_search', !formData.reddit_use_dual_search)}
                  className={`
                    relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                    ${formData.reddit_use_dual_search ? 'bg-orange-600' : 'bg-gray-200'}
                  `}
                >
                  <span
                    className={`
                      inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                      ${formData.reddit_use_dual_search ? 'translate-x-6' : 'translate-x-1'}
                    `}
                  />
                </button>
              </div>
            </div>
          )}

          {/* Relevance Filter */}
          <div className="p-4 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h4 className="text-sm font-semibold text-gray-700">
                  🎯 AI Relevance Filter (Experimental)
                </h4>
                <p className="text-xs text-gray-600 mt-1">
                  Use AI to filter out irrelevant posts before storing
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleChange('enable_relevance_filter', !formData.enable_relevance_filter)}
                className={`
                  relative inline-flex h-6 w-11 items-center rounded-full transition-colors
                  ${formData.enable_relevance_filter ? 'bg-purple-600' : 'bg-gray-200'}
                `}
              >
                <span
                  className={`
                    inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                    ${formData.enable_relevance_filter ? 'translate-x-6' : 'translate-x-1'}
                  `}
                />
              </button>
            </div>

            {formData.enable_relevance_filter && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Relevance Threshold
                </label>
                <input
                  type="range"
                  min="0.3"
                  max="0.9"
                  step="0.1"
                  value={formData.relevance_threshold}
                  onChange={(e) => handleChange('relevance_threshold', parseFloat(e.target.value))}
                  className="w-full"
                />
                <div className="flex justify-between text-xs text-gray-600 mt-1">
                  <span>Permissive (0.3)</span>
                  <span className="font-semibold text-purple-700">
                    {formData.relevance_threshold}
                  </span>
                  <span>Strict (0.9)</span>
                </div>
                <p className="mt-2 text-xs text-gray-500">
                  Higher threshold = stricter filtering. Posts below this score will be excluded.
                </p>
              </div>
            )}
          </div>

          <p className="mt-3 text-xs text-gray-500 italic">
            💡 Lower limits = faster execution. Higher limits = more comprehensive data.
          </p>
        </div>
      )}

      {/* Scheduling */}
      <div className="border-t border-gray-200 pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <label className="text-sm font-medium text-gray-700">
              Enable Scheduling
            </label>
            <p className="text-xs text-gray-500">
              Automatically re-run this search at regular intervals
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleChange('scheduled', !formData.scheduled)}
            className={`
              relative inline-flex h-6 w-11 items-center rounded-full transition-colors
              ${formData.scheduled ? 'bg-blue-600' : 'bg-gray-200'}
            `}
          >
            <span
              className={`
                inline-block h-4 w-4 transform rounded-full bg-white transition-transform
                ${formData.scheduled ? 'translate-x-6' : 'translate-x-1'}
              `}
            />
          </button>
        </div>

        {formData.scheduled && (
          <div className="bg-blue-50 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Clock className="inline w-4 h-4 mr-1" />
                  Run Every (minutes)
                </label>
                <input
                  type="number"
                  min="5"
                  max="1440"
                  value={formData.interval_minutes}
                  onChange={(e) => handleChange('interval_minutes', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Minimum: 5 minutes, Maximum: 1440 minutes (24 hours)
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="inline w-4 h-4 mr-1" />
                  Duration (days)
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={formData.duration_days}
                  onChange={(e) => handleChange('duration_days', parseInt(e.target.value))}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  How long to keep running this search
                </p>
              </div>
            </div>

            <div className="bg-white rounded-lg p-3 border border-blue-200">
              <div className="flex items-start space-x-2">
                <RefreshCw className="w-4 h-4 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-gray-700">
                  <strong>Schedule Summary:</strong> This search will run every{' '}
                  <strong>{formData.interval_minutes} minutes</strong> for the next{' '}
                  <strong>{formData.duration_days} days</strong> across{' '}
                  <strong>{formData.platforms.length} platform(s)</strong>, collecting approximately{' '}
                  <strong>{Math.floor((formData.duration_days * 24 * 60) / formData.interval_minutes)} snapshots</strong>.
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Submit Button */}
      <div className="flex items-center justify-end space-x-4">
        <button
          type="submit"
          disabled={loading || formData.platforms.length === 0}
          className="flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium"
        >
          {loading ? (
            <>
              <Loader className="w-5 h-5 animate-spin" />
              <span>Starting Campaign...</span>
            </>
          ) : (
            <>
              <Search className="w-5 h-5" />
              <span>Start Multi-Platform Campaign</span>
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default SearchForm;

