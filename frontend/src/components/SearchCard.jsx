import React, { useState } from 'react';
import { Calendar, Hash, TrendingUp, Play, BarChart3, Trash2, PlayCircle, Pause } from 'lucide-react';
import ConfirmDialog from './ConfirmDialog';
import { searchApi } from '../services/api';

const SearchCard = ({ search, onClick, onDelete, onStatusChange }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return 'bg-green-100 text-green-800';
      case 'running': return 'bg-blue-100 text-blue-800 animate-pulse';
      case 'paused': return 'bg-yellow-100 text-yellow-800';
      case 'failed': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getSentimentColor = (score) => {
    if (!score) return 'text-gray-600';
    if (score >= 8) return 'text-green-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getPlatformName = (platformId) => {
    const names = {
      instagram: 'Instagram',
      tiktok: 'TikTok',
      twitter: 'Twitter',
      reddit: 'Reddit',
      facebook: 'Facebook',
      youtube: 'YouTube',
      linkedin: 'LinkedIn'
    };
    return names[platformId] || platformId;
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    setShowDeleteConfirm(true);
  };

  const confirmDelete = async () => {
    try {
      setDeleting(true);
      await searchApi.delete(search.id);
      if (onDelete) onDelete(search.id);
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      alert('Failed to delete campaign');
    } finally {
      setDeleting(false);
    }
  };

  const handleToggleStatus = async (e) => {
    e.stopPropagation();
    const newStatus = search.status === 'active' ? 'paused' : 'active';

    try {
      await searchApi.toggleStatus(search.id, newStatus);
      if (onStatusChange) onStatusChange();
    } catch (error) {
      console.error('Failed to toggle status:', error);
    }
  };

  const handleRunNow = async (e) => {
    e.stopPropagation();

    try {
      await searchApi.triggerRun(search.id);
      alert('Campaign run started! Check back in a few minutes.');
      if (onStatusChange) onStatusChange();
    } catch (error) {
      console.error('Failed to trigger run:', error);
      alert('Failed to start campaign run');
    }
  };

  const searchQuery = search.search_query || search.s?.search_query || 'Unknown';
  const platforms = search.platforms || [search.platform] || [];
  const status = search.status || search.s?.status || 'pending';
  const createdAt = search.created_at || search.s?.created_at;

  const totalRuns = search.total_runs || 0;
  const latestRun = search.latest_run;
  const avgSentiment = latestRun?.stats?.avg_sentiment;
  const scheduledConfig = search.scheduled_config || {};

  const isMultiPlatform = platforms.length > 1;

  // Calculate total posts across all runs (from stats if available)
  const totalPosts = search.total_posts || search.posts_count || search.stats?.total_posts_found || 0;
  const latestRunPosts = latestRun?.stats?.posts_analyzed || 0;

  return (
    <>
      <div
        className="bg-white rounded-lg shadow-md hover:shadow-xl transition-all p-6 border border-gray-200 transform hover:-translate-y-1 relative group"
      >
        {/* Action Buttons - Show on Hover */}
        <div className="absolute top-3 right-3 flex space-x-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={handleRunNow}
            className="p-2 bg-blue-100 hover:bg-blue-200 rounded-lg transition-colors"
            title="Run Now"
          >
            <PlayCircle className="w-4 h-4 text-blue-600" />
          </button>
          {scheduledConfig.enabled && (
            <button
              onClick={handleToggleStatus}
              className="p-2 bg-yellow-100 hover:bg-yellow-200 rounded-lg transition-colors"
              title={status === 'active' ? 'Pause' : 'Resume'}
            >
              {status === 'active' ? (
                <Pause className="w-4 h-4 text-yellow-600" />
              ) : (
                <Play className="w-4 h-4 text-yellow-600" />
              )}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2 bg-red-100 hover:bg-red-200 rounded-lg transition-colors disabled:opacity-50"
            title="Delete Campaign"
          >
            <Trash2 className="w-4 h-4 text-red-600" />
          </button>
        </div>

        {/* Card Content - Clickable */}
        <div onClick={onClick} className="cursor-pointer">
          <div className="flex items-start justify-between mb-4 pr-32">
            <div className="flex-1">
              <h3 className="text-xl font-semibold text-gray-800 mb-2">
                {searchQuery}
              </h3>
              <div className="flex items-center space-x-3 text-sm text-gray-500">
                {/* Platform Names */}
                <div className="flex items-center space-x-2 flex-wrap gap-y-1">
                  {platforms.map(p => (
                    <span
                      key={p}
                      className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs font-medium border border-gray-200"
                      title={p}
                    >
                      {getPlatformName(p)}
                    </span>
                  ))}
                </div>
                {scheduledConfig.enabled && (
                  <div className="flex items-center space-x-1 text-blue-600">
                    <Play className="w-4 h-4" />
                    <span>Every {scheduledConfig.interval_minutes}min</span>
                  </div>
                )}
              </div>
            </div>
            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${getStatusColor(status)}`}>
              {status}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-3">
              <div className="text-xs text-blue-600 mb-1 flex items-center">
                <BarChart3 className="w-3 h-3 mr-1" />
                Total Runs
              </div>
              <div className="text-2xl font-bold text-blue-700">
                {totalRuns}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-3">
              <div className="text-xs text-purple-600 mb-1">
                {totalRuns > 1 ? 'All Posts' : 'Posts'}
              </div>
              <div className="text-2xl font-bold text-purple-700">
                {totalPosts || latestRunPosts || 0}
              </div>
              {totalRuns > 1 && latestRunPosts > 0 && (
                <div className="text-xs text-purple-500 mt-1">
                  Latest: {latestRunPosts}
                </div>
              )}
            </div>
          </div>

          {avgSentiment && (
            <div className="flex items-center justify-between mb-3 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center space-x-2">
                <TrendingUp className="w-4 h-4 text-gray-500" />
                <span className="text-sm text-gray-600 font-medium">Latest Sentiment:</span>
              </div>
              <span className={`text-lg font-bold ${getSentimentColor(avgSentiment)}`}>
                {avgSentiment.toFixed(1)} / 10
              </span>
            </div>
          )}

          <div className="flex items-center justify-between text-xs text-gray-500 pt-3 border-t border-gray-200">
            <div className="flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              {createdAt ? new Date(createdAt).toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric'
              }) : 'N/A'}
            </div>
            {latestRun?.run_at && (
              <div className="text-gray-400">
                Last run: {new Date(latestRun.run_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric'
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={confirmDelete}
        title="Delete Campaign"
        message={`Are you sure you want to delete "${searchQuery}"? This will permanently delete all runs, posts, and analytics for this campaign across ${isMultiPlatform ? `${platforms.length} platforms` : platforms[0]}. This action cannot be undone.`}
        confirmText="Delete Campaign"
        cancelText="Cancel"
        variant="danger"
      />
    </>
  );
};

export default SearchCard;

