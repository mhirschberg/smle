import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { searchApi } from '../services/api';
import SearchCard from '../components/SearchCard';
import ConfirmDialog from '../components/ConfirmDialog';
import { Search, Loader, Plus, Trash2, AlertCircle } from 'lucide-react';

const Dashboard = () => {
  const [searches, setSearches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    loadSearches();
    
    // Auto-refresh every 10 seconds to catch updates
    const interval = setInterval(loadSearches, 10000);
    return () => clearInterval(interval);
  }, []);

  const loadSearches = async () => {
    try {
      // Don't show loading spinner on auto-refresh
      if (searches.length === 0) {
        setLoading(true);
      }
      
      const response = await searchApi.getAll();
      
      console.log('API Response:', response.data);
      
      const searchesData = response.data.searches || [];
      setSearches(searchesData);
      setError(null);
      
      console.log('Loaded searches:', searchesData.length);
    } catch (err) {
      console.error('Failed to load searches:', err);
      setError(err.response?.data?.error || 'Failed to load campaigns');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAll = async () => {
    try {
      setDeleting(true);
      await searchApi.deleteAll();
      setSearches([]);
      setError(null);
    } catch (err) {
      console.error('Failed to delete all campaigns:', err);
      setError('Failed to delete campaigns');
    } finally {
      setDeleting(false);
    }
  };

  const handleCampaignDeleted = (campaignId) => {
    setSearches(prev => prev.filter(s => s.id !== campaignId));
  };

  if (loading && searches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader className="w-8 h-8 animate-spin text-blue-600 mb-4" />
        <p className="text-gray-600">Loading campaigns...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <h3 className="font-semibold text-red-800 mb-1">Error Loading Campaigns</h3>
              <p className="text-sm text-red-700">{error}</p>
            </div>
          </div>
        </div>
        <button
          onClick={loadSearches}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-3xl font-bold text-gray-800 mb-2">Your Campaigns</h2>
            <p className="text-gray-600">
              {searches.length === 0 
                ? 'No campaigns yet. Create your first social media listening campaign!'
                : `Managing ${searches.length} campaign${searches.length === 1 ? '' : 's'}`
              }
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {searches.length > 0 && (
              <button
                onClick={() => setShowDeleteAllConfirm(true)}
                disabled={deleting}
                className="flex items-center space-x-2 px-4 py-3 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors font-medium border border-red-200 disabled:opacity-50"
              >
                <Trash2 className="w-5 h-5" />
                <span>Delete All</span>
              </button>
            )}
            <button
              onClick={() => navigate('/new')}
              className="flex items-center space-x-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-lg hover:from-blue-700 hover:to-purple-700 transition-all font-medium shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
            >
              <Plus className="w-5 h-5" />
              <span>New Campaign</span>
            </button>
          </div>
        </div>
      </div>

      {searches.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-lg shadow-md border border-gray-200">
          <Search className="w-20 h-20 text-gray-300 mx-auto mb-6" />
          <h3 className="text-2xl font-semibold text-gray-600 mb-3">No campaigns yet</h3>
          <p className="text-gray-500 mb-6 max-w-md mx-auto">
            Start your first social media listening campaign to discover insights about your keywords across platforms
          </p>
          <button
            onClick={() => navigate('/new')}
            className="inline-flex items-center space-x-2 px-8 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium shadow-md"
          >
            <Plus className="w-5 h-5" />
            <span>Create Your First Campaign</span>
          </button>
        </div>
      ) : (
        <>
          {loading && (
            <div className="mb-4 text-center text-sm text-gray-500">
              <Loader className="w-4 h-4 animate-spin inline mr-2" />
              Refreshing...
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {searches.map(search => (
              <SearchCard 
                key={search.id} 
                search={search}
                onClick={() => navigate(`/search/${search.id}`)}
                onDelete={handleCampaignDeleted}
                onStatusChange={loadSearches}
              />
            ))}
          </div>
        </>
      )}

      {/* Delete All Confirmation */}
      <ConfirmDialog
        isOpen={showDeleteAllConfirm}
        onClose={() => setShowDeleteAllConfirm(false)}
        onConfirm={handleDeleteAll}
        title="Delete All Campaigns"
        message="Are you sure you want to delete ALL campaigns? This will permanently delete all runs, posts, and analytics. This action cannot be undone."
        confirmText="Delete Everything"
        cancelText="Cancel"
        variant="danger"
      />
    </div>
  );
};

export default Dashboard;

