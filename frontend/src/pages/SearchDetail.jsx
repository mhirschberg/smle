import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { searchApi, analyticsApi } from '../services/api';
import { SentimentOverTimeChart, SentimentDistributionChart, TopHashtagsChart } from '../components/SentimentChart';
import PostCard from '../components/PostCard';
import RunHistoryCard from '../components/RunHistoryCard';
import SentimentFilter from '../components/SentimentFilter';
import NaturalLanguageSearch from '../components/NaturalLanguageSearch';
import { ArrowLeft, Loader, TrendingUp, Hash, MessageCircle, BarChart3, History, PlayCircle, Trash2, RefreshCw, Layers, Search } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';

const SearchDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState(null);
  const [runs, setRuns] = useState([]);
  const [posts, setPosts] = useState([]);
  const [stats, setStats] = useState(null);
  const [trend, setTrend] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [sentimentFilter, setSentimentFilter] = useState('all');
  const [platformFilter, setPlatformFilter] = useState('all');
  const [selectedRun, setSelectedRun] = useState(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [triggering, setTriggering] = useState(false);

  useEffect(() => {
    loadData();

    // Auto-refresh every 15 seconds
    const interval = setInterval(loadData, 15000);
    return () => clearInterval(interval);
  }, [id, sentimentFilter, selectedRun, platformFilter]);

  const loadData = async () => {
    try {
      // Don't show loading on auto-refresh
      if (!campaign) {
        setLoading(true);
      }

      const [campaignRes, runsRes, postsRes, statsRes, trendRes] = await Promise.all([
        searchApi.getById(id),
        searchApi.getRuns(id, { limit: 50 }),
        searchApi.getPosts(id, {
          limit: 100,
          sentiment: sentimentFilter,
          run_id: selectedRun,
          platform: platformFilter !== 'all' ? platformFilter : null
        }),
        searchApi.getStats(id),
        searchApi.getTrend(id).catch(() => ({ data: { trend: [] } }))
      ]);

      setCampaign(campaignRes.data.search);
      setRuns(runsRes.data.runs);
      setPosts(postsRes.data.posts);
      setStats(statsRes.data.stats);
      setTrend(trendRes.data.trend);
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRunNow = async () => {
    try {
      setTriggering(true);
      await searchApi.triggerRun(id);

      alert('Campaign run started! The page will refresh automatically as it progresses.');

      setTimeout(() => {
        loadData();
        setTriggering(false);
      }, 2000);

    } catch (error) {
      console.error('Failed to trigger run:', error);
      alert('Failed to start campaign run');
      setTriggering(false);
    }
  };

  const handleDelete = async () => {
    try {
      await searchApi.delete(id);
      navigate('/');
    } catch (error) {
      console.error('Failed to delete campaign:', error);
      alert('Failed to delete campaign');
    }
  };

  const getPlatformIcon = (platformId) => {
    const icons = {
      instagram: '📷',
      tiktok: '🎵',
      twitter: '🐦',
      reddit: '🔴',
      facebook: '📘',
      youtube: '📺',
      linkedin: '💼'
    };
    return icons[platformId] || '📱';
  };

  if (loading && !campaign) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
        Campaign not found
      </div>
    );
  }

  const getSentimentColor = (score) => {
    if (!score) return 'text-gray-600';
    if (score >= 8) return 'text-green-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const platforms = campaign.platforms || [campaign.platform] || [];
  const isMultiPlatform = platforms.length > 1;

  // Check if there's a running run
  const hasRunningRun = runs.some(r => r.status === 'running');

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-gray-800 mb-2">
                {campaign.search_query}
              </h1>
              {campaign.description && (
                <p className="text-gray-600 mb-4 italic max-w-3xl border-l-4 border-blue-200 pl-4 py-1">
                  {campaign.description}
                </p>
              )}
              <div className="flex items-center space-x-4 text-sm text-gray-600 flex-wrap">
                <div className="flex items-center space-x-1">
                  {platforms.map(p => (
                    <span key={p} className="text-xl" title={p}>
                      {getPlatformIcon(p)}
                    </span>
                  ))}
                  {isMultiPlatform && (
                    <span className="ml-1 font-semibold text-blue-600">
                      {platforms.length} platforms
                    </span>
                  )}
                </div>
                <span>📅 Created {new Date(campaign.created_at).toLocaleDateString()}</span>
                {campaign.scheduled_config?.enabled && (
                  <span className="text-blue-600">🔄 Scheduled every {campaign.scheduled_config.interval_minutes} min</span>
                )}
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRunNow}
                disabled={triggering || hasRunningRun}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-md"
              >
                {triggering || hasRunningRun ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    <span>Running...</span>
                  </>
                ) : (
                  <>
                    <PlayCircle className="w-5 h-5" />
                    <span>Run Now</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium border border-red-200"
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete</span>
              </button>
            </div>
          </div>

          {/* Stats Overview */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
            <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-lg p-4">
              <div className="text-sm text-blue-600 mb-1">Total Runs</div>
              <div className="text-3xl font-bold text-blue-700">
                {campaign.total_runs || 0}
              </div>
            </div>
            <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-lg p-4">
              <div className="text-sm text-purple-600 mb-1">Total Posts</div>
              <div className="text-3xl font-bold text-purple-700">
                {stats?.total_posts || 0}
              </div>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-lg p-4">
              <div className="text-sm text-green-600 mb-1">Avg Sentiment</div>
              <div className={`text-3xl font-bold ${getSentimentColor(stats?.avg_sentiment || 0)}`}>
                {stats?.avg_sentiment?.toFixed(1) || 'N/A'}
              </div>
            </div>
            <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-lg p-4">
              <div className="text-sm text-orange-600 mb-1">Total Likes</div>
              <div className="text-3xl font-bold text-orange-700">
                {stats?.total_likes?.toLocaleString() || 0}
              </div>
            </div>
          </div>

          {/* Running Status Banner */}
          {hasRunningRun && (
            <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center space-x-3">
              <Loader className="w-5 h-5 text-blue-600 animate-spin flex-shrink-0" />
              <div>
                <div className="font-semibold text-blue-800">Run in Progress</div>
                <div className="text-sm text-blue-600">
                  A campaign run is currently executing across {isMultiPlatform ? `${platforms.length} platforms` : platforms[0]}. The page will auto-refresh with updates.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow-md border border-gray-200 mb-6">
        <div className="flex border-b border-gray-200 overflow-x-auto">
          <button
            onClick={() => setActiveTab('search')}
            className={`flex items-center space-x-2 px-6 py-4 font-medium whitespace-nowrap ${activeTab === 'search'
                ? 'text-purple-600 border-b-2 border-purple-600'
                : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <Search className="w-4 h-4" />
            <span>AI Search</span>
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`flex items-center space-x-2 px-6 py-4 font-medium whitespace-nowrap ${activeTab === 'overview'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <BarChart3 className="w-4 h-4" />
            <span>Overview</span>
          </button>
          {isMultiPlatform && (
            <button
              onClick={() => setActiveTab('platforms')}
              className={`flex items-center space-x-2 px-6 py-4 font-medium whitespace-nowrap ${activeTab === 'platforms'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-600 hover:text-gray-800'
                }`}
            >
              <Layers className="w-4 h-4" />
              <span>By Platform</span>
            </button>
          )}
          <button
            onClick={() => setActiveTab('runs')}
            className={`flex items-center space-x-2 px-6 py-4 font-medium whitespace-nowrap ${activeTab === 'runs'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <History className="w-4 h-4" />
            <span>Run History ({runs.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('posts')}
            className={`flex items-center space-x-2 px-6 py-4 font-medium whitespace-nowrap ${activeTab === 'posts'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span>All Posts ({stats?.total_posts || 0})</span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'search' && (
        <NaturalLanguageSearch campaignId={id} campaign={campaign} />
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Sentiment Trend Over Runs */}
          {trend.length > 0 && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">
                  Sentiment Trend Across Runs
                </h3>
                <button
                  onClick={loadData}
                  className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-800"
                >
                  <RefreshCw className="w-4 h-4" />
                  <span>Refresh</span>
                </button>
              </div>
              <SentimentOverTimeChart
                data={trend.map(t => ({
                  date: `Run #${t.run_number}`,
                  avg_sentiment: t.avg_sentiment
                }))}
              />
            </div>
          )}

          {/* Sentiment Distribution */}
          {stats && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <h3 className="text-xl font-semibold text-gray-800 mb-4">
                Overall Sentiment Distribution
              </h3>
              <SentimentDistributionChart
                data={{
                  counts: {
                    positive: stats.positive_count || 0,
                    neutral: stats.neutral_count || 0,
                    negative: stats.negative_count || 0
                  }
                }}
              />

              <div className="grid grid-cols-3 gap-4 mt-6">
                <div className="text-center">
                  <div className="text-3xl font-bold text-green-600">
                    {stats.positive_count || 0}
                  </div>
                  <div className="text-sm text-gray-600">Positive (8-10)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-yellow-600">
                    {stats.neutral_count || 0}
                  </div>
                  <div className="text-sm text-gray-600">Neutral (4-7)</div>
                </div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-red-600">
                    {stats.negative_count || 0}
                  </div>
                  <div className="text-sm text-gray-600">Negative (1-3)</div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'platforms' && isMultiPlatform && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
            <h3 className="text-xl font-semibold text-gray-800 mb-4">
              Performance by Platform
            </h3>

            {/* Platform Breakdown */}
            {runs.length > 0 && runs[0].stats?.by_platform && (
              <div className="space-y-4">
                {Object.entries(runs[0].stats.by_platform).map(([platform, platformStats]) => (
                  <div
                    key={platform}
                    onClick={() => {
                      setPlatformFilter(platform);
                      setActiveTab('posts');
                    }}
                    className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition-shadow cursor-pointer bg-gray-50 hover:bg-gray-100"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center space-x-3">
                        <span className="text-3xl">{getPlatformIcon(platform)}</span>
                        <div>
                          <h4 className="font-semibold text-gray-800 capitalize">{platform}</h4>
                          <p className="text-sm text-gray-600">
                            {platformStats.posts_analyzed || 0} posts analyzed
                          </p>
                        </div>
                      </div>
                      {platformStats.avg_sentiment && (
                        <div className="text-right">
                          <div className={`text-3xl font-bold ${getSentimentColor(platformStats.avg_sentiment)}`}>
                            {platformStats.avg_sentiment.toFixed(1)}
                          </div>
                          <div className="text-xs text-gray-500">avg sentiment</div>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-3 text-center text-sm">
                      <div className="bg-white rounded p-2">
                        <div className="font-bold text-gray-800">
                          {platformStats.posts_scraped || 0}
                        </div>
                        <div className="text-xs text-gray-600">Scraped</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="font-bold text-gray-800">
                          {platformStats.posts_analyzed || 0}
                        </div>
                        <div className="text-xs text-gray-600">Analyzed</div>
                      </div>
                      <div className="bg-white rounded p-2">
                        <div className="font-bold text-gray-800">
                          {platformStats.posts_failed || 0}
                        </div>
                        <div className="text-xs text-gray-600">Failed</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(!runs.length || !runs[0].stats?.by_platform) && (
              <div className="text-center py-8 text-gray-500">
                <Layers className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No platform data available yet. Run the campaign to see breakdown.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'runs' && (
        <div>
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Run History ({runs.length} total)
              </h3>
              <p className="text-sm text-gray-600">
                View details and sentiment for each search execution
              </p>
            </div>
            <button
              onClick={handleRunNow}
              disabled={triggering || hasRunningRun}
              className="flex items-center space-x-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors font-medium shadow-md"
            >
              {triggering || hasRunningRun ? (
                <>
                  <Loader className="w-5 h-5 animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5" />
                  <span>New Run</span>
                </>
              )}
            </button>
          </div>

          {runs.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow-md">
              <History className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No runs yet</p>
              <button
                onClick={handleRunNow}
                className="inline-flex items-center space-x-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <PlayCircle className="w-5 h-5" />
                <span>Start First Run</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {runs.map(run => (
                <RunHistoryCard
                  key={run.id}
                  run={run}
                  onClick={() => {
                    setSelectedRun(run.id);
                    setActiveTab('posts');
                  }}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {activeTab === 'posts' && (
        <div>
          {/* Sentiment Filter */}
          <SentimentFilter
            selected={sentimentFilter}
            onSelect={setSentimentFilter}
            counts={{
              positive: stats?.positive_count || 0,
              neutral: stats?.neutral_count || 0,
              negative: stats?.negative_count || 0
            }}
          />

          {/* Platform Filter (for multi-platform campaigns) */}
          {isMultiPlatform && (
            <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mb-6">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Platform</h3>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setPlatformFilter('all')}
                  className={`px-4 py-2 rounded-lg border-2 transition-all ${platformFilter === 'all'
                      ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                      : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                    }`}
                >
                  All Platforms
                </button>
                {platforms.map(platform => (
                  <button
                    key={platform}
                    onClick={() => setPlatformFilter(platform)}
                    className={`flex items-center space-x-2 px-4 py-2 rounded-lg border-2 transition-all ${platformFilter === platform
                        ? 'border-blue-500 bg-blue-50 text-blue-700 font-semibold'
                        : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                      }`}
                  >
                    <span className="text-lg">{getPlatformIcon(platform)}</span>
                    <span className="capitalize">{platform}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Run Filter */}
          {selectedRun && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 flex items-center justify-between">
              <div>
                <span className="text-sm text-blue-800">
                  Showing posts from Run #{runs.find(r => r.id === selectedRun)?.run_number}
                </span>
              </div>
              <button
                onClick={() => setSelectedRun(null)}
                className="text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                Show All Runs
              </button>
            </div>
          )}

          {/* Posts Grid */}
          {posts.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-lg shadow-md">
              <MessageCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No posts found with selected filters</p>
              {(selectedRun || platformFilter !== 'all' || sentimentFilter !== 'all') && (
                <button
                  onClick={() => {
                    setSelectedRun(null);
                    setPlatformFilter('all');
                    setSentimentFilter('all');
                  }}
                  className="mt-4 text-blue-600 hover:text-blue-800"
                >
                  Clear all filters
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="mb-4 text-sm text-gray-600">
                Showing {posts.length} post{posts.length === 1 ? '' : 's'}
                {sentimentFilter !== 'all' && ` (${sentimentFilter})`}
                {platformFilter !== 'all' && ` from ${platformFilter}`}
                {selectedRun && ` from Run #${runs.find(r => r.id === selectedRun)?.run_number}`}
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {posts.map(post => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDelete}
        title="Delete Campaign"
        message={`Are you sure you want to delete "${campaign.search_query}"? This will permanently delete all ${campaign.total_runs || 0} run(s) and all associated posts from ${isMultiPlatform ? `${platforms.length} platforms` : platforms[0]}. This action cannot be undone.`}
        confirmText="Delete Campaign"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default SearchDetail;

