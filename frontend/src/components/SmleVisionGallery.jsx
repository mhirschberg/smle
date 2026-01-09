import React, { useState } from 'react';
import { Eye, TrendingUp, ShieldCheck, Sparkles, LayoutGrid, List, ChevronLeft, ChevronRight, Info, Loader, ExternalLink, PlayCircle } from 'lucide-react';
import PostCard from './PostCard';

const SmleVisionGallery = ({ posts, onRefresh }) => {
    const [viewMode, setViewMode] = useState('grid');

    // Calculate sentiment statistics from completed posts
    const completedPosts = posts.filter(p => p.smle_vision?.status === 'completed');
    const sentimentCounts = { positive: 0, neutral: 0, negative: 0 };

    completedPosts.forEach(post => {
        const sentiment = post.smle_vision?.sentiment?.toLowerCase();
        if (sentiment === 'positive') sentimentCounts.positive++;
        else if (sentiment === 'negative') sentimentCounts.negative++;
        else sentimentCounts.neutral++;
    });

    const totalCompleted = completedPosts.length;
    const avgSentiment = totalCompleted > 0
        ? sentimentCounts.positive > sentimentCounts.negative
            ? 'Positive'
            : sentimentCounts.negative > sentimentCounts.positive
                ? 'Negative'
                : 'Neutral'
        : 'N/A';

    if (posts.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-lg border border-indigo-100 p-12 text-center">
                <div className="w-20 h-20 bg-indigo-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Sparkles className="w-10 h-10 text-indigo-400" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">Welcome to SMLE Vision</h3>
                <p className="text-gray-600 max-w-md mx-auto mb-8">
                    Deep AI video analysis has not been performed for any posts in this campaign yet.
                    Select videos from the "All Posts" tab to unlock strategic visual insights.
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header / Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 rounded-2xl p-6 text-white shadow-xl flex items-center space-x-4">
                    <div className="bg-white/20 p-3 rounded-xl backdrop-blur-sm">
                        <Eye className="w-8 h-8" />
                    </div>
                    <div>
                        <div className="text-sm opacity-80 uppercase tracking-wider font-semibold">Total Analyzed</div>
                        <div className="text-4xl font-bold">{totalCompleted}</div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-indigo-100 shadow-lg flex items-center space-x-4">
                    <div className={`p-3 rounded-xl ${avgSentiment === 'Positive' ? 'bg-green-50' :
                            avgSentiment === 'Negative' ? 'bg-red-50' : 'bg-yellow-50'
                        }`}>
                        <TrendingUp className={`w-8 h-8 ${avgSentiment === 'Positive' ? 'text-green-600' :
                                avgSentiment === 'Negative' ? 'text-red-600' : 'text-yellow-600'
                            }`} />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Avg Sentiment</div>
                        <div className={`text-3xl font-bold ${avgSentiment === 'Positive' ? 'text-green-700' :
                                avgSentiment === 'Negative' ? 'text-red-700' : 'text-yellow-700'
                            }`}>{avgSentiment}</div>
                    </div>
                </div>
                <div className="bg-white rounded-2xl p-6 border border-indigo-100 shadow-lg flex items-center space-x-4">
                    <div className="bg-purple-50 p-3 rounded-xl">
                        <ShieldCheck className="w-8 h-8 text-purple-600" />
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Intelligence Grade</div>
                        <div className="text-3xl font-bold text-purple-700">Enterprise</div>
                    </div>
                </div>
            </div>

            {/* Controls */}
            <div className="flex items-center justify-between">
                <h2 className="text-2xl font-bold text-gray-800 flex items-center">
                    <Sparkles className="w-6 h-6 mr-2 text-indigo-500" />
                    Intelligence Gallery
                </h2>
                <div className="flex bg-gray-100 p-1 rounded-xl">
                    <button
                        onClick={() => setViewMode('grid')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
                    >
                        <LayoutGrid className="w-5 h-5" />
                    </button>
                    <button
                        onClick={() => setViewMode('list')}
                        className={`p-2 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500'}`}
                    >
                        <List className="w-5 h-5" />
                    </button>
                </div>
            </div>

            {/* Gallery Grid */}
            <div className={`grid gap-8 ${viewMode === 'grid' ? 'grid-cols-1' : 'grid-cols-1'}`}>
                {posts.map(post => (
                    <VisionReportCard key={post.id} post={post} />
                ))}
            </div>
        </div>
    );
};

const VisionReportCard = ({ post }) => {
    const vision = post.smle_vision;

    // Loading / Progress State
    if (!vision || vision.status === 'processing' || vision.status === 'analyzing') {
        const logs = vision?.logs || [];
        const latestLog = logs[logs.length - 1]?.message || 'Initializing analysis...';

        return (
            <div className="bg-white rounded-3xl shadow-md p-8 border border-gray-100 flex flex-col h-96 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-white z-0" />

                <div className="z-10 flex flex-col h-full">
                    <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center space-x-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                                <Loader className="w-5 h-5 text-indigo-600 animate-spin" />
                            </div>
                            <div>
                                <h3 className="text-sm font-bold text-gray-800 uppercase tracking-widest">
                                    Analyzing Video
                                </h3>
                                <p className="text-xs text-gray-500">
                                    Compiling standard post card & AI insights...
                                </p>
                            </div>
                        </div>
                        <span className="text-xs font-mono text-indigo-400">ID: {post.id.slice(0, 8)}</span>
                    </div>

                    {/* Progress Log Terminal */}
                    <div className="flex-1 bg-gray-900 rounded-xl p-4 font-mono text-xs text-gray-300 overflow-y-auto border border-gray-800 shadow-inner">
                        <div className="space-y-2">
                            {logs.length === 0 && (
                                <div className="flex items-center animate-pulse">
                                    <span className="text-green-500 mr-2">➜</span>
                                    <span>Waiting for worker...</span>
                                </div>
                            )}
                            {logs.map((log, idx) => (
                                <div key={idx} className="flex items-start animate-in fade-in slide-in-from-left-2 duration-300">
                                    <span className="text-green-500 mr-2 mt-0.5">➜</span>
                                    <span className={idx === logs.length - 1 ? 'text-white font-bold' : 'opacity-70'}>
                                        {log.message}
                                    </span>
                                    <span className="ml-auto text-gray-600 text-[10px]">
                                        {new Date(log.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                                    </span>
                                </div>
                            ))}
                            <div className="animate-pulse text-indigo-400 mt-2">_</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    if (vision.status === 'failed') {
        return (
            <div className="bg-white rounded-3xl shadow-md p-8 border border-red-100 flex flex-col items-center justify-center text-center h-64">
                <div className="w-16 h-16 bg-red-50 rounded-full flex items-center justify-center mb-4">
                    <Info className="w-8 h-8 text-red-500" />
                </div>
                <h3 className="text-lg font-semibold text-gray-800 mb-2">Analysis Failed</h3>
                <p className="text-sm text-red-600 max-w-xs">{vision.error || 'Unknown error occurred.'}</p>
                <div className="mt-4 text-xs text-gray-400 font-mono text-left bg-gray-50 p-3 rounded w-full max-w-md overflow-x-auto">
                    {vision.logs?.map((l, i) => <div key={i}>{l.timestamp}: {l.message}</div>)}
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-indigo-50 flex flex-col transform transition-transform hover:scale-[1.01]">
            {/* Standard Post Card Header */}
            <div className="border-b border-gray-100 bg-gray-50/50">
                <PostCard post={post} isSelected={false} onSelect={() => { }} />
            </div>

            {/* AI Vision Content */}
            <div className="flex flex-col lg:flex-row">
                {/* Left: Video & Visual Themes */}
                <div className="w-full lg:w-2/5 p-6 bg-gray-900 text-white flex flex-col border-r border-gray-100">
                    <div className="mb-6 bg-gray-800/50 rounded-xl p-4 border border-white/5 h-64 overflow-y-auto custom-scrollbar">
                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-3 flex items-center sticky top-0 bg-gray-900/90 py-1 backdrop-blur-sm z-10">
                            <List className="w-3 h-3 mr-1" />
                            Video Narrative
                        </div>
                        <div className="space-y-4 text-xs text-gray-300 leading-relaxed">
                            {vision.frames?.map((frame, idx) => (
                                <div key={idx} className="border-l-2 border-indigo-500/30 pl-3">
                                    <span className="text-indigo-400 font-mono text-[10px] font-bold block mb-1">@{frame.timestamp}s</span>
                                    {frame.description}
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="flex-1 space-y-4">
                        <div>
                            <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-2 flex items-center">
                                <Sparkles className="w-3 h-3 mr-1 text-indigo-400" />
                                Visual Themes
                            </div>
                            <div className="flex flex-wrap gap-2">
                                {Array.isArray(vision.visual_themes) && vision.visual_themes.map((theme, i) => {
                                    const label = typeof theme === 'string' ? theme : (
                                        theme.brandappearance || theme.brand_appearance ||
                                        theme['Brand Appearance'] || theme['Visual Themes'] ||
                                        Object.values(theme)[0] || 'Theme'
                                    );
                                    return (
                                        <span key={i} className="bg-white/10 px-3 py-1.5 rounded-lg text-xs text-indigo-200 border border-white/5">
                                            {label}
                                        </span>
                                    );
                                })}
                            </div>
                        </div>

                        <div className="pt-4 border-t border-white/10">
                            <h4 className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-3">Frame Snapshots ({vision.frames?.length || 0})</h4>
                            <div className="grid grid-cols-4 gap-2">
                                {Array.isArray(vision.frames) && vision.frames.slice(0, 8).map((frame, i) => (
                                    <div key={i} className="aspect-video rounded-lg bg-gray-800 overflow-hidden relative group cursor-help border border-white/10" title={frame.description}>
                                        {(frame.url || frame.image) ? (
                                            <img
                                                src={frame.url || frame.image}
                                                alt={`Frame at ${frame.timestamp}s`}
                                                className="w-full h-full object-cover"
                                                referrerPolicy="no-referrer"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center text-[8px] text-indigo-400">
                                                {frame.timestamp}s
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Insights */}
                <div className="w-full lg:w-3/5 p-8 flex flex-col bg-white">
                    {/* Sentiment Scan */}
                    <div className="mb-6 pb-6 border-b border-gray-100">
                        <div className="text-[10px] text-gray-400 uppercase font-bold tracking-widest mb-2">Sentiment Scan</div>
                        <div className="flex items-start space-x-3">
                            <div className={`mt-1 p-2 rounded-lg ${vision.sentiment === 'positive' ? 'bg-green-100' : vision.sentiment === 'negative' ? 'bg-red-100' : 'bg-yellow-100'}`}>
                                {vision.sentiment === 'positive' ? <TrendingUp className="w-5 h-5 text-green-600" /> :
                                    vision.sentiment === 'negative' ? <TrendingUp className="w-5 h-5 text-red-600 rotate-180" /> :
                                        <div className="w-5 h-5 text-yellow-600 font-bold flex items-center justify-center">~</div>}
                            </div>
                            <div>
                                <h4 className={`text-lg font-bold mb-1 ${vision.sentiment === 'positive' ? 'text-green-700' : vision.sentiment === 'negative' ? 'text-red-700' : 'text-yellow-700'}`}>
                                    {vision.sentiment === 'positive' ? 'High Favorability' : vision.sentiment === 'negative' ? 'Content Risk' : 'Neutral Impact'}
                                </h4>
                                <p className="text-gray-600 text-sm leading-snug">
                                    {vision.sentiment_explanation || "AI analysis of tone, visual emotion, and brand impact indicates " + (vision.sentiment || 'neutral') + " sentiment."}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-6">
                        <div className="bg-indigo-50/50 rounded-2xl p-5 border border-indigo-100/50">
                            <h4 className="text-[10px] text-indigo-500 uppercase font-bold tracking-widest mb-2 flex items-center">
                                <Info className="w-3 h-3 mr-1" />
                                Executive Summary
                            </h4>
                            <p className="text-gray-800 leading-relaxed font-medium text-sm">
                                {typeof vision.summary === 'object' ? JSON.stringify(vision.summary) : vision.summary}
                            </p>
                        </div>

                        <div>
                            <h4 className="text-[10px] text-indigo-600 uppercase font-bold tracking-widest mb-3 flex items-center">
                                <Sparkles className="w-3 h-3 mr-1" />
                                Insights
                            </h4>
                            <div className="text-gray-700 text-sm leading-relaxed space-y-3 pl-3 border-l-2 border-indigo-100">
                                {(() => {
                                    let insights = vision.product_insights;
                                    // Try parsing if string looks like JSON
                                    if (typeof insights === 'string' && insights.trim().startsWith('{')) {
                                        try { insights = JSON.parse(insights); } catch (e) { }
                                    }

                                    if (typeof insights === 'object' && insights !== null) {
                                        // Normalize keys (lowercase, remove spaces) for easier matching
                                        const normalizedKeys = {};
                                        Object.keys(insights).forEach(k => {
                                            normalizedKeys[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = insights[k];
                                        });

                                        const brandText = normalizedKeys['brandappearance'] || normalizedKeys['brandappearanceorusage'] || normalizedKeys['brandusage'];
                                        const usageText = normalizedKeys['productusage'] || normalizedKeys['usage'] || normalizedKeys['productdemonstration'];

                                        return (
                                            <div className="space-y-4">
                                                {brandText && (
                                                    <div>
                                                        <span className="font-bold text-indigo-700 uppercase text-[10px] tracking-wider block mb-1">Brand Appearance</span>
                                                        {brandText}
                                                    </div>
                                                )}
                                                {usageText && (
                                                    <div>
                                                        <span className="font-bold text-indigo-700 uppercase text-[10px] tracking-wider block mb-1">Product Usage</span>
                                                        {usageText}
                                                    </div>
                                                )}
                                                {!brandText && !usageText && (
                                                    // Fallback: render all keys
                                                    Object.entries(insights).map(([key, val]) => (
                                                        <div key={key}>
                                                            <span className="font-bold text-indigo-700 uppercase text-[10px] tracking-wider block mb-1">{key}</span>
                                                            {typeof val === 'object' ? JSON.stringify(val) : val}
                                                        </div>
                                                    ))
                                                )}
                                            </div>
                                        );
                                    }
                                    return insights;
                                })()}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SmleVisionGallery;
