import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { searchApi, analyticsApi } from '../services/api';
import { SentimentOverTimeChart, SentimentDistributionChart, TopHashtagsChart } from '../components/SentimentChart';
import PostCard from '../components/PostCard';
import ErrorBoundary from '../components/ErrorBoundary';
import RunHistoryCard from '../components/RunHistoryCard';
import SentimentFilter from '../components/SentimentFilter';
import NaturalLanguageSearch from '../components/NaturalLanguageSearch';
import { ArrowLeft, Loader, TrendingUp, Hash, MessageCircle, BarChart3, History, PlayCircle, Trash2, RefreshCw, Layers, Search, Eye, CheckSquare, Sparkles } from 'lucide-react';
import ConfirmDialog from '../components/ConfirmDialog';
import { postApi } from '../services/api';
import SmleVisionGallery from '../components/SmleVisionGallery';

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
  const [selectedPosts, setSelectedPosts] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);

  // Sentiment Summary State
  const [expandedSentiment, setExpandedSentiment] = useState(null);
  const [sentimentSummary, setSentimentSummary] = useState(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // Lifted state for AI Search
  const [nlQuery, setNlQuery] = useState('');
  const [nlResults, setNlResults] = useState(null);
  const [nlLoading, setNlLoading] = useState(false);
  const [nlError, setNlError] = useState(null);

  useEffect(() => {
    loadData();

    // Auto-refresh based on context
    // If viewing SMLE Vision tab, poll faster (3s) for progress logs
    const pollInterval = activeTab === 'smle-vision' ? 3000 : 15000;

    const interval = setInterval(loadData, pollInterval);
    return () => clearInterval(interval);
  }, [id, sentimentFilter, selectedRun, platformFilter, activeTab]);

  useEffect(() => {
    const handleResume = async (event) => {
      const { runId } = event.detail;
      try {
        setTriggering(true);
        await searchApi.resumeRun(runId);
        alert('Analysis resumed! The page will refresh as it progresses.');
        setTimeout(loadData, 2000);
      } catch (error) {
        console.error('Failed to resume run:', error);
        alert('Failed to resume analysis');
      } finally {
        setTriggering(false);
      }
    };

    window.addEventListener('resume-run', handleResume);
    return () => window.removeEventListener('resume-run', handleResume);
  }, []);

  const loadData = async () => {
    try {
      // Don't show loading on auto-refresh
      if (!campaign) {
        setLoading(true);
      }

      // When on SMLE Vision tab, ignore filters to show all analyzed posts
      const postsParams = activeTab === 'smle-vision'
        ? { limit: 100 }
        : {
          limit: 100,
          sentiment: sentimentFilter,
          run_id: selectedRun,
          platform: platformFilter !== 'all' ? platformFilter : null
        };

      const [campaignRes, runsRes, postsRes, statsRes, trendRes] = await Promise.all([
        searchApi.getById(id),
        searchApi.getRuns(id, { limit: 50 }),
        searchApi.getPosts(id, postsParams),
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

  const handleToggleSelect = (postId, platform) => {
    try {
      console.log('handleToggleSelect called with:', { postId, platform });

      if (!postId) {
        console.error('handleToggleSelect: postId is missing');
        return;
      }

      setSelectedPosts(prev => {
        const exists = prev.find(p => p.id === postId);
        if (exists) {
          return prev.filter(p => p.id !== postId);
        } else {
          return [...prev, { id: postId, platform: platform || 'unknown' }];
        }
      });
    } catch (error) {
      console.error('Error in handleToggleSelect:', error);
    }
  };

  const handleBatchAnalyze = async () => {
    if (selectedPosts.length === 0) return;

    try {
      setAnalyzing(true);
      console.log('Sending analysis request with:', {
        posts: selectedPosts.map(p => ({ id: p.id, platform: p.platform })),
        campaignId: id
      });

      const res = await postApi.analyzeVideo({
        posts: selectedPosts.map(p => ({ id: p.id, platform: p.platform })),
        campaignId: id
      });
      alert(res.data.message);
      setSelectedPosts([]);
      setActiveTab('smle-vision');
      await loadData();
    } catch (error) {
      console.error('Failed to start analysis:', error);
      const serverMsg = error.response?.data?.error || error.message;
      alert(`Failed: ${serverMsg}`);
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSentimentClick = async (sentiment) => {
    if (expandedSentiment === sentiment) {
      setExpandedSentiment(null);
      return;
    }

    setExpandedSentiment(sentiment);
    setPlatformFilter('all');

    // Check if we have a stored summary for the relevant run
    const relevantRun = selectedRun
      ? runs.find(r => r.id === selectedRun)
      : runs[0]; // default to latest

    if (relevantRun?.sentiment_summaries?.[sentiment]) {
      setSentimentSummary(relevantRun.sentiment_summaries[sentiment]);
      setSummaryLoading(false);
    } else {
      setSentimentSummary(null); // Will show "Generate" button
      setSummaryLoading(false);
    }

    // Always fetch posts for context
    try {
      setSentimentFilter(sentiment);
      const postsRes = await searchApi.getPosts(id, {
        limit: 12,
        sentiment: sentiment,
        sort: 'engagement'
      });
      setPosts(postsRes.data.posts);
    } catch (err) {
      console.error('Failed to fetch sentiment posts', err);
    }
  };

  const handleGenerateSummary = async (sentiment) => {
    try {
      setSummaryLoading(true);
      const relevantRun = selectedRun ? runs.find(r => r.id === selectedRun) : runs[0];

      if (!relevantRun) {
        alert('No run found to generate summary for.');
        setSummaryLoading(false);
        return;
      }

      // Trigger background generation
      await searchApi.generateRunSummaries(id, relevantRun.id);

      // Poll for completion (simple approach for now) or just show "Processing"
      // Since it's background, we can just say "Started" and reload data periodically
      // But user wants to see it. Let's fake a "wait" or just tell them it's processing.
      // BETTER: Just wait a few seconds and reload, or show "Generating..."

      // For this specific interaction (sentiment click), we want query-based if run summary is missing?
      // The user said: "if it's an older campaign, provide a button 'Generate summary' where applicable."
      // So let's use the new endpoint.

      alert('AI Summary generation started. Updates will appear shortly.');
      loadData(); // Trigger reload

      // In a real app we'd use a websocket or polling specific to this job

    } catch (err) {
      console.error('Failed to generate summary', err);
      alert('Failed to start generation');
    } finally {
      setSummaryLoading(false);
    }
  };



  const getPlatformSummary = (run, platform) => {
    if (!run || !run.platform_summaries) return null;
    return run.platform_summaries[platform];
  };

  const handleGeneratePlatformSummary = async (platform) => {
    try {
      console.log(`Generating summary for ${platform}...`);
      alert(`Generating summary for ${platform}...`);

      const res = await searchApi.getPlatformSummary(id, platform);

      if (res.data.summary) {
        console.log('Got summary from API:', res.data.summary.substring(0, 50) + '...');

        // Update local state to show result immediately
        setRuns(prevRuns => {
          const newRuns = [...prevRuns];
          // Use selected run or first run (latest)
          const runIndex = selectedRun
            ? newRuns.findIndex(r => r.id === selectedRun)
            : 0; // Default to first/latest

          console.log('Updating run at index:', runIndex, 'Total runs:', newRuns.length);

          if (runIndex !== -1 && newRuns[runIndex]) {
            const targetRun = { ...newRuns[runIndex] };
            targetRun.platform_insights = {
              ...(targetRun.platform_insights || {}),
              [platform]: res.data.summary
            };
            newRuns[runIndex] = targetRun;
          }
          return newRuns;
        });

        // Force a reload after a short delay to ensure we align with server state
        setTimeout(loadData, 1000);
      }

    } catch (err) {
      console.error('Failed to generate platform summary', err);
      alert('Failed to generate summary');
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
              <div className="text-sm text-purple-600 mb-1">Unique Posts</div>
              <div className="text-3xl font-bold text-purple-700">
                {stats?.total_posts || 0}
              </div>
              {stats?.analyzed_posts < stats?.total_posts && (
                <div className="text-xs text-purple-500 mt-1">
                  Analyzed: {stats.analyzed_posts}
                </div>
              )}
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
            onClick={() => setActiveTab('smle-vision')}
            className={`flex items-center space-x-2 px-6 py-4 font-medium whitespace-nowrap ${activeTab === 'smle-vision'
              ? 'text-indigo-600 border-b-2 border-indigo-600'
              : 'text-gray-600 hover:text-gray-800'
              }`}
          >
            <Eye className="w-4 h-4" />
            <span className="flex items-center">
              SMLE Vision
              <span className="ml-2 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[10px] rounded-full uppercase">Beta</span>
            </span>
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
        <ErrorBoundary>
          <NaturalLanguageSearch
            key="nl-search-component"
            campaignId={id}
            campaign={campaign}
            selectedPosts={selectedPosts}
            onToggleSelect={handleToggleSelect}
            // Pass lifted state
            query={nlQuery}
            setQuery={setNlQuery}
            results={nlResults}
            setResults={setNlResults}
            loading={nlLoading}
            setLoading={setNlLoading}
            error={nlError}
            setError={setNlError}
          />
        </ErrorBoundary>
      )}

      {activeTab === 'smle-vision' && (
        <ErrorBoundary>
          <SmleVisionGallery
            campaignId={id}
            posts={posts.filter(p => p.smle_vision && (
              p.smle_vision.status === 'completed' ||
              p.smle_vision.status === 'processing' ||
              p.smle_vision.status === 'analyzing' ||
              p.smle_vision.status === 'failed'
            ))}
            onRefresh={loadData}
          />
        </ErrorBoundary>
      )}

      {activeTab === 'overview' && (
        <div className="space-y-6">

          {/* Executive Summary Section */}
          {(runs[0]?.summary || selectedRun?.summary) && (
            <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
              <div className="flex items-center space-x-2 mb-4">
                <Sparkles className="w-5 h-5 text-purple-600" />
                <h3 className="text-xl font-semibold text-gray-800">Executive Summary</h3>
                <span className="text-xs text-gray-500 ml-2 border border-gray-200 px-2 py-0.5 rounded">
                  Generated by AI
                </span>
              </div>
              <div className="prose prose-purple max-w-none text-gray-700 whitespace-pre-line">
                {selectedRun ? runs.find(r => r.id === selectedRun)?.summary : runs[0]?.summary}
              </div>
            </div>
          )}

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
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-semibold text-gray-800">
                  Overall Sentiment Distribution
                </h3>
                {stats && stats.analyzed_posts < stats.total_posts && (
                  <div className="text-sm bg-blue-50 text-blue-700 px-3 py-1 rounded-full font-medium border border-blue-100">
                    Analysis in progress: {stats.analyzed_posts} / {stats.total_posts}
                  </div>
                )}
                {stats && stats.analyzed_posts >= stats.total_posts && stats.total_posts > 0 && (
                  <div className="text-sm bg-green-50 text-green-700 px-3 py-1 rounded-full font-medium border border-green-100">
                    All {stats.total_posts} posts analyzed
                  </div>
                )}
              </div>
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
                <div
                  onClick={() => handleSentimentClick('positive')}
                  className={`text-center p-3 rounded-lg cursor-pointer transition-all ${expandedSentiment === 'positive' ? 'bg-green-50 ring-2 ring-green-500' : 'hover:bg-gray-50'}`}
                >
                  <div className="text-3xl font-bold text-green-600">
                    {stats.positive_count || 0}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Positive (8-10)</div>
                  <div className="text-xs text-green-600 mt-1 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 mr-1" /> View Insights
                  </div>
                </div>
                <div
                  onClick={() => handleSentimentClick('neutral')}
                  className={`text-center p-3 rounded-lg cursor-pointer transition-all ${expandedSentiment === 'neutral' ? 'bg-yellow-50 ring-2 ring-yellow-500' : 'hover:bg-gray-50'}`}
                >
                  <div className="text-3xl font-bold text-yellow-600">
                    {stats.neutral_count || 0}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Neutral (4-7)</div>
                  <div className="text-xs text-yellow-600 mt-1 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 mr-1" /> View Insights
                  </div>
                </div>
                <div
                  onClick={() => handleSentimentClick('negative')}
                  className={`text-center p-3 rounded-lg cursor-pointer transition-all ${expandedSentiment === 'negative' ? 'bg-red-50 ring-2 ring-red-500' : 'hover:bg-gray-50'}`}
                >
                  <div className="text-3xl font-bold text-red-600">
                    {stats.negative_count || 0}
                  </div>
                  <div className="text-sm text-gray-600 font-medium">Negative (1-3)</div>
                  <div className="text-xs text-red-600 mt-1 flex items-center justify-center">
                    <Sparkles className="w-3 h-3 mr-1" /> View Insights
                  </div>
                </div>
              </div>

              {/* Expanded Sentiment Details */}
              {expandedSentiment && (
                <div className="mt-8 pt-6 border-t border-gray-100 animate-in fade-in slide-in-from-top-4 duration-300">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-lg font-semibold text-gray-800 capitalize flex items-center">
                      {expandedSentiment} Sentiment Analysis
                      {summaryLoading && <Loader className="w-4 h-4 ml-2 animate-spin text-blue-600" />}
                    </h4>
                    {sentimentSummary && !summaryLoading && (
                      <button
                        onClick={() => handleGenerateSummary(expandedSentiment)}
                        className="text-xs text-purple-600 hover:text-purple-800 flex items-center space-x-1 border border-purple-200 px-2 py-1 rounded-full hover:bg-purple-50 transition-colors"
                      >
                        <RefreshCw className="w-3 h-3" />
                        <span>Regenerate</span>
                      </button>
                    )}
                  </div>

                  <div className="bg-gray-50 rounded-xl p-6 mb-6 relative group">
                    {summaryLoading ? (
                      <div className="space-y-3">
                        <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse"></div>
                        <div className="h-4 bg-gray-200 rounded w-full animate-pulse"></div>
                        <div className="h-4 bg-gray-200 rounded w-2/3 animate-pulse"></div>
                      </div>
                    ) : sentimentSummary ? (
                      <p className="text-gray-700 leading-relaxed whitespace-pre-line">
                        {sentimentSummary}
                      </p>
                    ) : (
                      <div className="text-center py-4">
                        <p className="text-gray-600 mb-3">No AI summary generated for this sentiment yet.</p>
                        <button
                          onClick={() => handleGenerateSummary(expandedSentiment)}
                          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 flex items-center justify-center space-x-2 mx-auto transition-colors"
                        >
                          <Sparkles className="w-4 h-4" />
                          <span>Generate AI Summary</span>
                        </button>
                      </div>
                    )}
                  </div>

                  <h5 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-4">
                    Top {expandedSentiment} Posts
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {posts.slice(0, 4).map(post => (
                      <PostCard
                        key={post.id}
                        post={post}
                        isSelected={selectedPosts.some(p => p.id === post.id)}
                        onSelect={handleToggleSelect}
                        compact={true}
                      />
                    ))}
                  </div>
                  <button
                    onClick={() => {
                      setSentimentFilter(expandedSentiment);
                      setActiveTab('posts');
                    }}
                    className="w-full mt-4 py-2 text-center text-blue-600 hover:text-blue-800 font-medium text-sm border border-blue-200 rounded-lg hover:bg-blue-50 transition-colors"
                  >
                    View All {expandedSentiment} Posts
                  </button>
                </div>
              )}
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
            {stats?.by_platform && (
              <div className="space-y-4">
                {Object.entries(stats.by_platform)
                  .filter(([_, platformStats]) => platformStats.total_posts > 0)
                  .map(([platform, platformStats]) => (
                    <div
                      key={platform}
                      className="p-4 border border-gray-200 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between mb-3 cursor-pointer"
                        onClick={() => {
                          setPlatformFilter(platform);
                          setActiveTab('posts');
                        }}
                      >
                        <div className="flex items-center space-x-3">
                          <span className="text-3xl">{getPlatformIcon(platform)}</span>
                          <div>
                            <h4 className="font-semibold text-gray-800 capitalize">{platform}</h4>
                            <p className="text-sm text-gray-600">
                              {platformStats.analyzed_posts || 0} / {platformStats.total_posts || 0} posts analyzed
                            </p>
                          </div>
                        </div>
                        {platformStats.avg_sentiment > 0 && (
                          <div className="text-right">
                            <div className={`text-3xl font-bold ${getSentimentColor(platformStats.avg_sentiment)}`}>
                              {platformStats.avg_sentiment.toFixed(1)}
                            </div>
                            <div className="text-xs text-gray-500">avg sentiment</div>
                          </div>
                        )}
                      </div>

                      {/* Platform Summary Section */}
                      <div className="mt-4 pt-4 border-t border-gray-200 cursor-default">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center">
                            <Sparkles className="w-3 h-3 mr-1" /> AI Insights
                          </h5>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleGeneratePlatformSummary(platform);
                            }}
                            className="relative z-10 text-xs text-purple-600 hover:text-purple-800 flex items-center space-x-1 border border-purple-100 px-2 py-1 rounded-full hover:bg-purple-50 transition-colors"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>
                              {(selectedRun
                                ? getPlatformSummary(runs.find(r => r.id === selectedRun), platform)
                                : getPlatformSummary(runs[0], platform)
                              ) ? 'Regenerate' : 'Generate'}
                            </span>
                          </button>
                        </div>

                        {(selectedRun
                          ? getPlatformSummary(runs.find(r => r.id === selectedRun), platform)
                          : getPlatformSummary(runs[0], platform)
                        ) ? (
                          <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
                            {selectedRun
                              ? getPlatformSummary(runs.find(r => r.id === selectedRun), platform)
                              : getPlatformSummary(runs[0], platform)
                            }
                          </p>
                        ) : (
                          <p className="text-sm text-gray-400 italic">No summary generated yet.</p>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-3 text-center text-sm mt-4">
                        <div className="bg-white rounded p-2">
                          <div className="font-bold text-gray-800">
                            {platformStats.total_posts || 0}
                          </div>
                          <div className="text-xs text-gray-600">Total Scraped</div>
                        </div>
                        <div className="bg-white rounded p-2">
                          <div className="font-bold text-gray-800">
                            {platformStats.analyzed_posts || 0}
                          </div>
                          <div className="text-xs text-gray-600">Total Analyzed</div>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            )}

            {(!stats?.by_platform || Object.values(stats.by_platform).every(p => p.total_posts === 0)) && (
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
                  <PostCard
                    key={post.id}
                    post={post}
                    isSelected={selectedPosts.some(p => p.id === post.id)}
                    onSelect={handleToggleSelect}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Selection Bar overlay */}
      {selectedPosts.length > 0 && (
        <div className="fixed bottom-8 left-1/2 transform -translate-x-1/2 z-50 bg-indigo-600 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center space-x-8 animate-in slide-in-from-bottom duration-300">
          <div className="flex items-center space-x-3">
            <div className="bg-white/20 p-2 rounded-lg">
              <CheckSquare className="w-6 h-6" />
            </div>
            <div>
              <div className="text-sm font-bold leading-tight">{selectedPosts.length} Videos Selected</div>
              <div className="text-[10px] opacity-80 uppercase tracking-widest font-bold">smle vision queue</div>
            </div>
          </div>
          <div className="h-8 w-px bg-white/20"></div>
          <button
            onClick={handleBatchAnalyze}
            disabled={analyzing}
            className="bg-white text-indigo-600 px-6 py-2 rounded-xl font-bold hover:bg-indigo-50 transition-all shadow-lg active:scale-95 disabled:bg-gray-200 disabled:text-gray-400 flex items-center space-x-2"
          >
            {analyzing ? (
              <>
                <Loader className="w-4 h-4 animate-spin" />
                <span>Starting AI...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                <span>Analyze Now</span>
              </>
            )}
          </button>
          <button
            onClick={() => setSelectedPosts([])}
            className="text-white/60 hover:text-white text-xs font-medium"
          >
            Cancel
          </button>
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

