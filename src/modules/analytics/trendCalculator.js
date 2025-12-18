const logger = require('../../utils/logger');

class TrendCalculator {
  /**
   * Calculate sentiment distribution
   */
  calculateSentimentDistribution(posts) {
    const distribution = {
      negative: 0,
      neutral: 0,
      positive: 0
    };
    
    posts.forEach(post => {
      const score = post.analysis?.sentiment_score;
      if (!score) return;
      
      if (score <= 3) distribution.negative++;
      else if (score <= 7) distribution.neutral++;
      else distribution.positive++;
    });
    
    const total = distribution.negative + distribution.neutral + distribution.positive;
    
    return {
      counts: distribution,
      percentages: {
        negative: total > 0 ? Math.round((distribution.negative / total) * 100) : 0,
        neutral: total > 0 ? Math.round((distribution.neutral / total) * 100) : 0,
        positive: total > 0 ? Math.round((distribution.positive / total) * 100) : 0
      },
      total
    };
  }
  
  /**
   * Calculate sentiment over time
   */
  calculateSentimentOverTime(posts) {
    const byDate = {};
    
    posts.forEach(post => {
      const score = post.analysis?.sentiment_score;
      const datePosted = post.raw_data?.date_posted;
      
      if (!score || !datePosted) return;
      
      const date = datePosted.split('T')[0];
      
      if (!byDate[date]) {
        byDate[date] = {
          date,
          scores: [],
          post_count: 0
        };
      }
      
      byDate[date].scores.push(score);
      byDate[date].post_count++;
    });
    
    const timeline = Object.values(byDate).map(day => ({
      date: day.date,
      avg_sentiment: Math.round((day.scores.reduce((a, b) => a + b, 0) / day.scores.length) * 10) / 10,
      post_count: day.post_count
    }));
    
    timeline.sort((a, b) => a.date.localeCompare(b.date));
    
    return timeline;
  }
  
  /**
   * Calculate top hashtags by sentiment (FIXED)
   */
  calculateTopHashtags(posts, limit = 20) {
    const hashtagStats = {};
    
    posts.forEach(post => {
      const hashtags = post.raw_data?.hashtags || [];
      const score = post.analysis?.sentiment_score;
      
      if (!score) return;
      
      hashtags.forEach(tag => {
        // FIXED: Handle both string and object hashtags
        let cleanTag = '';
        
        if (typeof tag === 'string') {
          cleanTag = tag.toLowerCase().replace(/^#/, '');
        } else if (tag && typeof tag === 'object') {
          cleanTag = (tag.hashtag || tag.tag || tag.name || '').toString().toLowerCase().replace(/^#/, '');
        }
        
        if (!cleanTag) return;
        
        if (!hashtagStats[cleanTag]) {
          hashtagStats[cleanTag] = {
            tag: cleanTag,
            count: 0,
            total_sentiment: 0,
            scores: []
          };
        }
        
        hashtagStats[cleanTag].count++;
        hashtagStats[cleanTag].total_sentiment += score;
        hashtagStats[cleanTag].scores.push(score);
      });
    });
    
    const hashtags = Object.values(hashtagStats)
      .map(h => ({
        tag: h.tag,
        count: h.count,
        avg_sentiment: Math.round((h.total_sentiment / h.count) * 10) / 10
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return hashtags;
  }
  
  /**
   * Calculate top topics
   */
  calculateTopTopics(posts, limit = 20) {
    const topicStats = {};
    
    posts.forEach(post => {
      const topics = post.analysis?.key_topics || [];
      const score = post.analysis?.sentiment_score;
      
      topics.forEach(topic => {
        // FIXED: Ensure topic is a string
        const cleanTopic = String(topic).toLowerCase();
        
        if (!cleanTopic) return;
        
        if (!topicStats[cleanTopic]) {
          topicStats[cleanTopic] = {
            topic: cleanTopic,
            count: 0,
            total_sentiment: 0
          };
        }
        
        topicStats[cleanTopic].count++;
        if (score) {
          topicStats[cleanTopic].total_sentiment += score;
        }
      });
    });
    
    const topics = Object.values(topicStats)
      .map(t => ({
        topic: t.topic,
        count: t.count,
        avg_sentiment: t.count > 0 ? Math.round((t.total_sentiment / t.count) * 10) / 10 : null
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
    
    return topics;
  }
  
  /**
   * Calculate engagement vs sentiment correlation
   */
  calculateEngagementCorrelation(posts) {
    const data = posts
      .filter(p => p.analysis?.sentiment_score && p.raw_data?.engagement)
      .map(post => {
        const engagement = post.raw_data.engagement;
        return {
          sentiment: post.analysis.sentiment_score,
          likes: engagement.likes || engagement.upvotes || 0,
          comments: engagement.num_comments || engagement.comments || 0,
          views: engagement.views || engagement.play_count || 0,
          total_engagement: (engagement.likes || engagement.upvotes || 0) + 
                           (engagement.num_comments || engagement.comments || 0)
        };
      });
    
    if (data.length === 0) return null;
    
    const ranges = {
      negative: { range: '1-3', posts: [], avg_engagement: 0 },
      neutral: { range: '4-7', posts: [], avg_engagement: 0 },
      positive: { range: '8-10', posts: [], avg_engagement: 0 }
    };
    
    data.forEach(d => {
      if (d.sentiment <= 3) ranges.negative.posts.push(d);
      else if (d.sentiment <= 7) ranges.neutral.posts.push(d);
      else ranges.positive.posts.push(d);
    });
    
    Object.keys(ranges).forEach(key => {
      const posts = ranges[key].posts;
      if (posts.length > 0) {
        ranges[key].avg_engagement = Math.round(
          posts.reduce((sum, p) => sum + p.total_engagement, 0) / posts.length
        );
        ranges[key].post_count = posts.length;
      }
    });
    
    return ranges;
  }
  
  /**
   * Get top posts by criteria
   */
  getTopPosts(posts, criteria = 'sentiment', limit = 10) {
    let sorted;
    
    switch (criteria) {
      case 'sentiment':
        sorted = posts
          .filter(p => p.analysis?.sentiment_score)
          .sort((a, b) => b.analysis.sentiment_score - a.analysis.sentiment_score);
        break;
        
      case 'engagement':
        sorted = posts
          .filter(p => p.raw_data?.engagement)
          .sort((a, b) => {
            const getTotal = (p) => {
              const e = p.raw_data.engagement;
              return (e.likes || e.upvotes || 0) + (e.num_comments || e.comments || 0);
            };
            return getTotal(b) - getTotal(a);
          });
        break;
        
      case 'negative':
        sorted = posts
          .filter(p => p.analysis?.sentiment_score)
          .sort((a, b) => a.analysis.sentiment_score - b.analysis.sentiment_score);
        break;
        
      default:
        sorted = posts;
    }
    
    return sorted.slice(0, limit).map(post => {
      const engagement = post.raw_data?.engagement || {};
      
      return {
        post_id: post.id,
        platform: post.platform,
        platform_url: post.platform_url,
        shortcode: post.shortcode,
        user: post.raw_data?.user_posted || post.raw_data?.youtuber,
        description: this.getPostContent(post).substring(0, 100),
        sentiment_score: post.analysis?.sentiment_score,
        sentiment_label: post.analysis?.sentiment_label,
        likes: engagement.likes || engagement.upvotes || 0,
        comments: engagement.num_comments || engagement.comments || 0,
        date_posted: post.raw_data?.date_posted
      };
    });
  }
  
  /**
   * Calculate content type performance
   */
  calculateContentTypePerformance(posts) {
    const types = {};
    
    posts.forEach(post => {
      const type = post.content_type || 'post';
      const score = post.analysis?.sentiment_score;
      const engagement = post.raw_data?.engagement || {};
      const totalEngagement = (engagement.likes || engagement.upvotes || 0) + 
                             (engagement.num_comments || engagement.comments || 0);
      
      if (!types[type]) {
        types[type] = { count: 0, total_sentiment: 0, total_engagement: 0 };
      }
      
      types[type].count++;
      if (score) types[type].total_sentiment += score;
      types[type].total_engagement += totalEngagement;
    });
    
    Object.keys(types).forEach(type => {
      const data = types[type];
      types[type] = {
        count: data.count,
        avg_sentiment: data.count > 0 ? Math.round((data.total_sentiment / data.count) * 10) / 10 : null,
        avg_engagement: data.count > 0 ? Math.round(data.total_engagement / data.count) : 0
      };
    });
    
    return types;
  }
  
  /**
   * Get post content helper
   */
  getPostContent(post) {
    const platform = post.platform;
    const rawData = post.raw_data;
    
    if (!rawData) return '';
    
    switch (platform) {
      case 'instagram':
      case 'tiktok':
        return rawData.description || '';
      case 'twitter':
        return rawData.description || '';
      case 'reddit':
        return rawData.title || '';
      case 'facebook':
        return rawData.content || '';
      case 'youtube':
        return rawData.title || '';
      case 'linkedin':
        return rawData.post_text || rawData.headline || '';
      default:
        return '';
    }
  }
}

module.exports = new TrendCalculator();

