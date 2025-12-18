import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, AlertCircle, CheckCircle } from 'lucide-react';
import SearchForm from '../../components/SearchForm';
import { searchApi } from '../../services/api';

const NewSearch = () => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleSubmit = async (formData) => {
    try {
      setLoading(true);
      setError(null);
      setSuccess(null);

      // Create new search
      const response = await searchApi.create(formData);
      
      setSuccess('Search started successfully! Redirecting to dashboard...');
      
      // Wait 2 seconds then redirect
      setTimeout(() => {
        navigate('/');
      }, 2000);

    } catch (err) {
      console.error('Failed to create search:', err);
      setError(err.response?.data?.error || 'Failed to start search. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/')}
          className="flex items-center text-gray-600 hover:text-gray-800 mb-4"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Dashboard
        </button>

        <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            New Social Media Search
          </h1>
          <p className="text-gray-600">
            Configure your social media listening campaign. We'll search, scrape, and analyze posts for you.
          </p>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start space-x-3">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-800 mb-1">Error</h3>
            <p className="text-sm text-red-700">{error}</p>
          </div>
        </div>
      )}

      {/* Success Alert */}
      {success && (
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4 flex items-start space-x-3">
          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-green-800 mb-1">Success!</h3>
            <p className="text-sm text-green-700">{success}</p>
          </div>
        </div>
      )}

      {/* Search Form */}
      <div className="bg-white rounded-lg shadow-md p-6 border border-gray-200">
        <SearchForm onSubmit={handleSubmit} loading={loading} />
      </div>

      {/* Info Box */}
      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-800 mb-2">What happens next?</h3>
        <ol className="space-y-2 text-sm text-blue-700">
          <li className="flex items-start">
            <span className="font-bold mr-2">1.</span>
            <span>We'll search Google for your keywords on the selected platform</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">2.</span>
            <span>Extract up to 100 relevant URLs from search results</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">3.</span>
            <span>Scrape detailed data from each post (content, engagement, comments)</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">4.</span>
            <span>Analyze sentiment and extract topics using AI</span>
          </li>
          <li className="flex items-start">
            <span className="font-bold mr-2">5.</span>
            <span>Generate comprehensive analytics and insights</span>
          </li>
        </ol>
        <p className="mt-3 text-xs text-blue-600">
          ⏱️ Estimated time: 15-20 minutes for ~100-150 posts
        </p>
      </div>
    </div>
  );
};

export default NewSearch;

