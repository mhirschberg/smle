import React from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const SentimentOverTimeChart = ({ data }) => {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis dataKey="date" />
        <YAxis domain={[0, 10]} />
        <Tooltip />
        <Legend />
        <Line 
          type="monotone" 
          dataKey="avg_sentiment" 
          stroke="#8884d8" 
          strokeWidth={2}
          name="Average Sentiment"
        />
      </LineChart>
    </ResponsiveContainer>
  );
};

export const SentimentDistributionChart = ({ data }) => {
  const COLORS = {
    positive: '#10b981',
    neutral: '#fbbf24',
    negative: '#ef4444'
  };

  const pieData = [
    { name: 'Positive (8-10)', value: data.counts.positive, color: COLORS.positive },
    { name: 'Neutral (4-7)', value: data.counts.neutral, color: COLORS.neutral },
    { name: 'Negative (1-3)', value: data.counts.negative, color: COLORS.negative },
  ];

  return (
    <ResponsiveContainer width="100%" height={300}>
      <PieChart>
        <Pie
          data={pieData}
          cx="50%"
          cy="50%"
          labelLine={false}
          label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
          outerRadius={100}
          fill="#8884d8"
          dataKey="value"
        >
          {pieData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip />
      </PieChart>
    </ResponsiveContainer>
  );
};

export const TopHashtagsChart = ({ data }) => {
  const top10 = data.slice(0, 10);

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={top10} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="tag" type="category" width={100} />
        <Tooltip />
        <Legend />
        <Bar dataKey="count" fill="#8b5cf6" name="Post Count" />
      </BarChart>
    </ResponsiveContainer>
  );
};

