import React from 'react';
import { Calendar, TrendingUp, CheckCircle, XCircle, Loader } from 'lucide-react';

const RunHistoryCard = ({ run, onClick }) => {
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-5 h-5 text-green-600" />;
      case 'failed':
        return <XCircle className="w-5 h-5 text-red-600" />;
      case 'running':
        return <Loader className="w-5 h-5 text-blue-600 animate-spin" />;
      default:
        return <Loader className="w-5 h-5 text-gray-400" />;
    }
  };

  const getSentimentColor = (score) => {
    if (!score) return 'text-gray-600';
    if (score >= 8) return 'text-green-600';
    if (score >= 4) return 'text-yellow-600';
    return 'text-red-600';
  };

  const avgSentiment = run.stats?.avg_sentiment;

  return (
    <div 
      onClick={onClick}
      className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow cursor-pointer"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          {getStatusIcon(run.status)}
          <div>
            <div className="font-semibold text-gray-800">
              Run #{run.run_number}
            </div>
            <div className="text-xs text-gray-500 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              {new Date(run.run_at).toLocaleString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
          </div>
        </div>
        {avgSentiment && (
          <div className="text-right">
            <div className={`text-2xl font-bold ${getSentimentColor(avgSentiment)}`}>
              {avgSentiment.toFixed(1)}
            </div>
            <div className="text-xs text-gray-500">sentiment</div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-bold text-gray-800">
            {run.stats?.urls_found || 0}
          </div>
          <div className="text-xs text-gray-600">URLs</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-bold text-gray-800">
            {run.stats?.posts_scraped || 0}
          </div>
          <div className="text-xs text-gray-600">Scraped</div>
        </div>
        <div className="bg-gray-50 rounded p-2">
          <div className="text-lg font-bold text-gray-800">
            {run.stats?.posts_analyzed || 0}
          </div>
          <div className="text-xs text-gray-600">Analyzed</div>
        </div>
      </div>
    </div>
  );
};

export default RunHistoryCard;

