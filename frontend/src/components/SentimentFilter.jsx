import React from 'react';
import { Smile, Meh, Frown, LayoutGrid } from 'lucide-react';

const SentimentFilter = ({ selected, onSelect, counts = {} }) => {
  const filters = [
    { 
      id: 'all', 
      label: 'All Posts', 
      icon: LayoutGrid, 
      color: 'gray',
      count: (counts.positive || 0) + (counts.neutral || 0) + (counts.negative || 0)
    },
    { 
      id: 'positive', 
      label: 'Positive', 
      icon: Smile, 
      color: 'green',
      count: counts.positive || 0,
      range: '8-10'
    },
    { 
      id: 'neutral', 
      label: 'Neutral', 
      icon: Meh, 
      color: 'yellow',
      count: counts.neutral || 0,
      range: '4-7'
    },
    { 
      id: 'negative', 
      label: 'Negative', 
      icon: Frown, 
      color: 'red',
      count: counts.negative || 0,
      range: '1-3'
    },
  ];

  const getColorClasses = (color, isSelected) => {
    const baseClasses = 'flex-1 p-4 rounded-lg border-2 cursor-pointer transition-all';
    
    if (isSelected) {
      switch (color) {
        case 'green':
          return `${baseClasses} border-green-500 bg-green-50 shadow-md`;
        case 'yellow':
          return `${baseClasses} border-yellow-500 bg-yellow-50 shadow-md`;
        case 'red':
          return `${baseClasses} border-red-500 bg-red-50 shadow-md`;
        default:
          return `${baseClasses} border-gray-500 bg-gray-50 shadow-md`;
      }
    }
    
    return `${baseClasses} border-gray-200 bg-white hover:border-gray-300 hover:shadow`;
  };

  const getIconColor = (color, isSelected) => {
    if (!isSelected) return 'text-gray-400';
    
    switch (color) {
      case 'green': return 'text-green-600';
      case 'yellow': return 'text-yellow-600';
      case 'red': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-4 border border-gray-200 mb-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Filter by Sentiment</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {filters.map(filter => {
          const Icon = filter.icon;
          const isSelected = selected === filter.id;
          
          return (
            <button
              key={filter.id}
              onClick={() => onSelect(filter.id)}
              className={getColorClasses(filter.color, isSelected)}
            >
              <div className="flex items-center justify-between mb-2">
                <Icon className={`w-5 h-5 ${getIconColor(filter.color, isSelected)}`} />
                <span className={`text-2xl font-bold ${isSelected ? `text-${filter.color}-700` : 'text-gray-700'}`}>
                  {filter.count}
                </span>
              </div>
              <div className={`text-sm font-medium ${isSelected ? `text-${filter.color}-700` : 'text-gray-600'}`}>
                {filter.label}
              </div>
              {filter.range && (
                <div className="text-xs text-gray-500 mt-1">
                  Score: {filter.range}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default SentimentFilter;

