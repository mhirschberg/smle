import React from 'react';
import { Heart, MessageCircle, ExternalLink, TrendingUp, Share2, Eye } from 'lucide-react';

const PostCard = ({ post }) => {
  const getSentimentColor = (score) => {
    if (score >= 8) return 'bg-green-100 text-green-800 border-green-300';
    if (score >= 4) return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    return 'bg-red-100 text-red-800 border-red-300';
  };

  const getSentimentEmoji = (score) => {
    if (score >= 8) return '😊';
    if (score >= 6) return '🙂';
    if (score >= 4) return '😐';
    return '😞';
  };

  const getPlatformIcon = (platform) => {
    const icons = {
      instagram: '📷',
      tiktok: '🎵',
      twitter: '🐦',
      reddit: '🔴',
      facebook: '📘',
      youtube: '📺',
      linkedin: '💼'
    };
    return icons[platform] || '📱';
  };

  const getPlatformColor = (platform) => {
    const colors = {
      instagram: 'bg-pink-100 text-pink-700 border-pink-200',
      tiktok: 'bg-purple-100 text-purple-700 border-purple-200',
      twitter: 'bg-blue-100 text-blue-700 border-blue-200',
      reddit: 'bg-orange-100 text-orange-700 border-orange-200',
      facebook: 'bg-indigo-100 text-indigo-700 border-indigo-200',
      youtube: 'bg-red-100 text-red-700 border-red-200',
      linkedin: 'bg-cyan-100 text-cyan-700 border-cyan-200'
    };
    return colors[platform] || 'bg-gray-100 text-gray-700 border-gray-200';
  };

  const getContent = () => {
    const platform = post.platform;
    const rawData = post.raw_data;
    
    if (!rawData) return 'No content';
    
    switch (platform) {
      case 'instagram':
      case 'tiktok':
        return rawData.description || 'No description';
      case 'twitter':
        return rawData.description || 'No content';
      case 'reddit':
        return rawData.title || 'No title';
      case 'facebook':
        return rawData.content || 'No content';
      case 'youtube':
        return rawData.title || 'No title';
      case 'linkedin':
        return rawData.post_text || rawData.headline || 'No content';
      default:
        return 'No content';
    }
  };

  const getHashtags = () => {
    const hashtags = post.raw_data?.hashtags || [];
    
    // Ensure hashtags are strings (handle both string[] and object[])
    return hashtags
      .map(tag => {
        if (typeof tag === 'string') {
          return tag;
        } else if (tag && typeof tag === 'object') {
          return tag.hashtag || tag.tag || tag.name || '';
        }
        return '';
      })
      .filter(Boolean);
  };

  const getEngagement = () => {
    const platform = post.platform;
    const engagement = post.raw_data?.engagement || {};
    
    return {
      likes: engagement.likes || engagement.upvotes || 0,
      comments: engagement.num_comments || engagement.comments || 0,
      shares: engagement.shares || engagement.reposts || 0,
      views: engagement.views || engagement.play_count || 0
    };
  };

  const content = getContent();
  const hashtags = getHashtags();
  const engagement = getEngagement();

  return (
    <div className="bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow p-4 border border-gray-200">
      {/* Platform Badge */}
      <div className="mb-3">
        <span className={`inline-flex items-center space-x-1 px-2 py-1 rounded border ${getPlatformColor(post.platform)}`}>
          <span>{getPlatformIcon(post.platform)}</span>
          <span className="capitalize text-xs font-semibold">{post.platform}</span>
        </span>
      </div>

      {/* Thumbnail */}
      {(post.raw_data?.media?.thumbnail || post.raw_data?.media?.preview_image || post.raw_data?.media?.post_image) && (
        <div className="mb-3 rounded-lg overflow-hidden">
          <img 
            src={post.raw_data.media.thumbnail || post.raw_data.media.preview_image || post.raw_data.media.post_image} 
            alt="Post thumbnail"
            className="w-full h-48 object-cover"
            onError={(e) => { e.target.style.display = 'none'; }}
          />
        </div>
      )}

      {/* User Info */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-2">
          {(post.raw_data?.profile_image_link || post.raw_data?.avatar_img_channel || post.raw_data?.author_profile_pic) && (
            <img 
              src={post.raw_data.profile_image_link || post.raw_data.avatar_img_channel || post.raw_data.author_profile_pic} 
              alt={post.raw_data.user_posted}
              className="w-8 h-8 rounded-full"
              onError={(e) => { e.target.style.display = 'none'; }}
            />
          )}
          <div>
            <div className="font-semibold text-sm">
              @{post.raw_data?.user_posted || post.raw_data?.name || post.raw_data?.youtuber || 'Unknown'}
            </div>
            <div className="text-xs text-gray-500">
              {post.content_type === 'reel' && '🎥 Reel'}
              {post.content_type === 'post' && post.platform === 'instagram' && '📷 Post'}
              {post.content_type === 'video' && post.platform !== 'instagram' && '🎬 Video'}
              {post.content_type === 'tweet' && '💬 Tweet'}
              {post.platform === 'reddit' && `r/${post.raw_data?.community_name || 'unknown'}`}
              {post.platform === 'youtube' && `📺 ${post.raw_data?.handle_name || 'YouTube'}`}
              {post.platform === 'linkedin' && `💼 ${post.raw_data?.user_title || 'LinkedIn'}`}
            </div>
          </div>
        </div>
        <a 
          href={post.platform_url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-600"
        >
          <ExternalLink className="w-5 h-5" />
        </a>
      </div>

      {/* Content */}
      <p className="text-sm text-gray-700 mb-3 line-clamp-3">
        {content}
      </p>

      {/* Hashtags - FIXED: Ensure strings only */}
      {hashtags && hashtags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {hashtags.slice(0, 3).map((tag, idx) => (
            <span key={idx} className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
              {String(tag)}
            </span>
          ))}
        </div>
      )}

      {/* Sentiment Score */}
      {post.analysis?.sentiment_score && (
        <div className={`flex items-center justify-between p-2 rounded-lg border mb-3 ${getSentimentColor(post.analysis.sentiment_score)}`}>
          <div className="flex items-center space-x-2">
            <span className="text-2xl">{getSentimentEmoji(post.analysis.sentiment_score)}</span>
            <div>
              <div className="text-xs font-semibold">Sentiment</div>
              <div className="text-xs capitalize">{post.analysis.sentiment_label}</div>
            </div>
          </div>
          <div className="text-2xl font-bold">
            {post.analysis.sentiment_score}
          </div>
        </div>
      )}

      {/* Engagement - Platform-specific */}
      <div className="flex items-center justify-around text-sm text-gray-600">
        {engagement.likes > 0 && (
          <div className="flex items-center space-x-1">
            <Heart className="w-4 h-4" />
            <span>{engagement.likes.toLocaleString()}</span>
          </div>
        )}
        {engagement.comments > 0 && (
          <div className="flex items-center space-x-1">
            <MessageCircle className="w-4 h-4" />
            <span>{engagement.comments.toLocaleString()}</span>
          </div>
        )}
        {engagement.shares > 0 && (
          <div className="flex items-center space-x-1">
            <Share2 className="w-4 h-4" />
            <span>{engagement.shares.toLocaleString()}</span>
          </div>
        )}
        {engagement.views > 0 && (
          <div className="flex items-center space-x-1">
            <Eye className="w-4 h-4" />
            <span>{engagement.views.toLocaleString()}</span>
          </div>
        )}
      </div>

      {/* Topics */}
      {post.analysis?.key_topics && post.analysis.key_topics.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-200">
          <div className="text-xs text-gray-500 mb-1">Topics:</div>
          <div className="flex flex-wrap gap-1">
            {post.analysis.key_topics.slice(0, 4).map((topic, idx) => (
              <span key={idx} className="text-xs bg-blue-50 text-blue-600 px-2 py-1 rounded">
                {String(topic)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default PostCard;

