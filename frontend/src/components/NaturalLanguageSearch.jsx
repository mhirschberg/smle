import React, { useState } from 'react';
import { Search, Loader, Sparkles, X, Lightbulb } from 'lucide-react';
import PostCard from './PostCard';

const NaturalLanguageSearch = ({ campaignId, campaign }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  // Generate dynamic examples based on campaign
  const generateExamples = () => {
    const searchQuery = campaign?.search_query || 'your topic';
    const platforms = campaign?.platforms || [];
    
    const examples = [
      `find posts about ${searchQuery}`,
      'show negative posts',
      'posts with high engagement'
    ];
    
    // Add platform-specific examples if multi-platform
    if (platforms.length > 1) {
      const platform1 = platforms[0];
      const platform2 = platforms[1];
      examples.push(`compare ${platform1} vs ${platform2} sentiment`);
      examples.push(`show ${platform1} posts only`);
    } else if (platforms.length === 1) {
      examples.push(`trending posts from ${platforms[0]}`);
    }
    
    // Add query-specific examples
    examples.push(`posts mentioning ${searchQuery.split(' ')[0]}`);
    
    return examples.slice(0, 6);
  };

  const exampleQueries = generateExamples();

  const handleSearch = async (searchQuery = query) => {
    if (!searchQuery.trim()) return;

    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`http://localhost:3001/api/search/${campaignId}/nl-search`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: searchQuery, limit: 50 })
      });

      if (!response.ok) {
        throw new Error('Search failed');
      }

      const data = await response.json();
      setResults(data);

    } catch (err) {
      console.error('Search error:', err);
      setError('Search failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      handleSearch();
    }
  };

  const handleExampleClick = (example) => {
    setQuery(example);
    handleSearch(example);
  };

  const clearSearch = () => {
    setQuery('');
    setResults(null);
    setError(null);
  };

  return (
    <div className="space-y-6">
      {/* Search Box */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-200">
        <div className="flex items-center space-x-2 mb-4">
          <Sparkles className="w-6 h-6 text-purple-600" />
          <h3 className="text-xl font-semibold text-gray-800">AI-Powered Search</h3>
        </div>
        
        <div className="relative">
          <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyPress={handleKeyPress}
            placeholder={`Ask anything about "${campaign?.search_query || 'your data'}"...`}
            className="w-full pl-12 pr-24 py-4 border-2 border-purple-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent text-lg"
          />
          {query && (
            <button
              onClick={clearSearch}
              className="absolute right-20 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
          <button
            onClick={() => handleSearch()}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? (
              <Loader className="w-5 h-5 animate-spin" />
            ) : (
              <span>Search</span>
            )}
          </button>
        </div>

        {/* Example Queries */}
        <div className="mt-4">
          <div className="flex items-center space-x-2 mb-2">
            <Lightbulb className="w-4 h-4 text-purple-600" />
            <span className="text-sm font-medium text-gray-700">Try these examples:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {exampleQueries.map((example, idx) => (
              <button
                key={idx}
                onClick={() => handleExampleClick(example)}
                className="text-sm px-3 py-1 bg-white border border-purple-200 rounded-full text-purple-700 hover:bg-purple-50 hover:border-purple-300 transition-colors"
              >
                {example}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-800">
          {error}
        </div>
      )}

      {/* Results */}
      {results && (
        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-semibold text-gray-800">
                Search Results
              </h3>
              <p className="text-sm text-gray-600">
                Found {results.count} post{results.count === 1 ? '' : 's'} matching "{query}"
              </p>
            </div>
            <button
              onClick={clearSearch}
              className="text-gray-600 hover:text-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {results.count === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Search className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No posts found matching your query.</p>
              <p className="text-sm mt-2">Try adjusting your search terms or use different keywords.</p>
            </div>
          ) : (
            <>
              {/* Relevance Info */}
              <div className="mb-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <div className="text-sm text-blue-800">
                  <strong>Top match:</strong> {Math.round(results.results[0].similarity_score * 100)}% relevant
                </div>
              </div>

              {/* Results Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {results.results.map(post => (
                  <div key={post.id} className="relative">
                    {/* Relevance Badge */}
                    <div className="absolute top-2 right-2 z-10">
                      <span className="px-2 py-1 bg-purple-600 text-white text-xs font-bold rounded-full shadow-md">
                        {Math.round(post.similarity_score * 100)}% match
                      </span>
                    </div>
                    <PostCard post={post} />
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default NaturalLanguageSearch;

