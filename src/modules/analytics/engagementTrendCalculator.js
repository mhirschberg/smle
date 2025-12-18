const logger = require('../../utils/logger');

class EngagementTrendCalculator {
  /**
   * Find trending posts (high engagement growth)
   */
  findTrendingPosts(posts, limit = 10) {
    const trendingPosts = posts
      .filter(p => p.engagement_history && p.engagement_history.length >= 2)
      .map(post => {
        const history = post.engagement_history;
        const first = history[0];
        const last = history[history.length - 1];
        
        const likesGrowth = last.likes - first.likes;
        const commentsGrowth = last.comments - first.comments;
        const totalGrowth = likesGrowth + (commentsGrowth * 5); // Weight comments higher
        
        const growthRate = first.likes > 0 
          ? ((last.likes - first.likes) / first.likes) * 100 
          : 0;
        
        return {
          post_id: post.id,
          platform: post.platform,
          platform_url: post.platform_url,
          user: post.raw_data?.user_posted,
          description: this.getPostContent(post).substring(0, 100),
          appearances: post.total_appearances,
          first_seen: history[0].date,
          last_seen: history[history.length - 1].date,
          engagement_growth: {
            likes: likesGrowth,
            comments: commentsGrowth,
            total: totalGrowth
          },
          growth_rate: Math.round(growthRate),
          current_engagement: {
            likes: last.likes,
            comments: last.comments
          }
        };
      })
      .filter(p => p.engagement_growth.total > 0)
      .sort((a, b) => b.engagement_growth.total - a.engagement_growth.total)
      .slice(0, limit);
    
    return trendingPosts;
  }
  
  /**
   * Find viral posts (posts that appeared multiple times with high engagement)
   */
  findViralPosts(posts, limit = 10) {
    return posts
      .filter(p => p.total_appearances >= 2 && p.engagement_history?.length >= 2)
      .map(post => {
        const history = post.engagement_history;
        const latest = history[history.length - 1];
        const avgGrowth = history.length > 1 
          ? (latest.likes - history[0].likes) / (history.length - 1)
          : 0;
        
        return {
          post_id: post.id,
          platform: post.platform,
          platform_url: post.platform_url,
          user: post.raw_data?.user_posted,
          description: this.getPostContent(post).substring(0, 100),
          appearances: post.total_appearances,
          total_likes: latest.likes,
          avg_growth_per_run: Math.round(avgGrowth),
          sentiment_score: post.analysis?.sentiment_score
        };
      })
      .sort((a, b) => b.total_likes - a.total_likes)
      .slice(0, limit);
  }
  
  /**
   * Calculate engagement velocity (how fast posts are gaining engagement)
   */
  calculateEngagementVelocity(posts) {
    const postsWithVelocity = posts
      .filter(p => p.engagement_history && p.engagement_history.length >= 2)
      .map(post => {
        const history = post.engagement_history.sort((a, b) => 
          new Date(a.date) - new Date(b.date)
        );
        
        // Calculate velocity between last two data points
        if (history.length >= 2) {
          const prev = history[history.length - 2];
          const current = history[history.length - 1];
          
          const timeDiff = (new Date(current.date) - new Date(prev.date)) / (1000 * 60 * 60); // hours
          const likesDiff = current.likes - prev.likes;
          
          const velocity = timeDiff > 0 ? likesDiff / timeDiff : 0;
          
          return {
            post: post,
            velocity: velocity, // likes per hour
            current_likes: current.likes
          };
        }
        
        return null;
      })
      .filter(p => p !== null && p.velocity > 0)
      .sort((a, b) => b.velocity - a.velocity);
    
    return postsWithVelocity;
  }
  
  /**
   * Get post content based on platform
   */
  getPostContent(post) {
    const platform = post.platform;
    const rawData = post.raw_data;
    
    switch (platform) {
      case 'instagram':
      case 'tiktok':
        return rawData?.description || '';
      case 'twitter':
        return rawData?.description || '';
      case 'reddit':
        return rawData?.title || '';
      case 'facebook':
        return rawData?.content || '';
      default:
        return '';
    }
  }
}

module.exports = new EngagementTrendCalculator();

