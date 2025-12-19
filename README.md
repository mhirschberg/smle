# SMLE - Unified Social Media Listening Engine 

In the world of social media analytics, "fragmentation" is the enemy. Data lives in silos. If you want to track a brand’s reputation, you’re usually toggling between a Twitter dashboard, a LinkedIn search, and a Reddit scraper, trying to mentally merge three different data formats into one coherent picture.

We decided to solve this engineering challenge by building **SMLE (Social Media Listening Engine)**.

The goal was ambitious but clear: Create a single, unified pipeline that can listen, aggregate, and analyze conversations across **Instagram, TikTok, Twitter/X, Reddit, Facebook, YouTube, and LinkedIn** simultaneously.

Here’s a look at how we architected the solution and the tech stack that powers it.

## The Architecture: A Unified Pipeline

The core philosophy behind SMLE is **"One Campaign, Any Platform."**

Instead of building seven distinct tools, we built a modular pipeline. When you initiate a search for "Generative AI," the engine spins up parallel processes. Whether the data comes from a TikTok viral video or a LinkedIn thought leadership article, it flows through the same normalization and analysis funnel.

### 1. Hybrid Data Collection Strategy
One of the biggest hurdles in social scraping is that every platform behaves differently. A "one size fits all" approach doesn't work. We implemented a hybrid strategy using **Bright Data’s infrastructure**:

*   **SERP-Based Discovery:** For platforms that are notoriously hard to search directly (like Instagram, Facebook, and LinkedIn), we leverage advanced Google SERP scraping. We construct complex search operators (e.g., `site:linkedin.com "keyword"`) to find relevant post URLs first, and then target those specific URLs for extraction.
*   **Direct Keyword Discovery:** For platforms with more open discovery mechanics (like TikTok, Reddit, and YouTube), we hit the discovery APIs directly. This is faster and yields richer initial metadata.

### 2. The Brain: Local & Cloud LLMs
Raw social data is messy. Hashtags are spammy, descriptions are full of emojis, and sentiment is hard to parse with traditional regex.

We integrated **Ollama (Local)** and **Google Gemini (Cloud)** directly into the ingestion pipeline. Every single post passes through an LLM analysis layer that:
*   **Scores Sentiment (1-10):** Not just "positive/negative," but a nuanced score based on the narrative.
*   **Extracts Topics:** It reads comments and captions to generate semantic tags (e.g., categorizing a post about "broken screens" under "hardware quality" automatically).
*   **Sanitizes Data:** It cleans up the noise, leaving us with structured, queryable JSON.

### 3. Smart Deduplication & Engagement Tracking
Social media isn't static. A post scraped today might have 10 likes; tomorrow it might have 10,000.

We built a smart deduplication system on top of **Couchbase**. Instead of ignoring duplicate URLs, the system recognizes them. If a campaign runs and finds a post we’ve already seen:
1.  It skips the heavy re-analysis (saving compute costs).
2.  It **updates the engagement metrics** (likes, shares, comments).
3.  It logs a history of that post’s growth.

This allows users to track *velocity*—not just seeing what’s popular, but what’s *becoming* popular right now.

## The "Killer Feature": Semantic Search

This is where the tech stack really shines. Because we generate vector embeddings for every post during the analysis phase, we aren't limited to keyword searching.

We built a **Natural Language Search** interface.

Users don't have to search for "customer support" AND "fail" AND "angry." They can simply type: *“Find posts where people are complaining about shipping delays.”*

The engine performs a vector similarity search against the stored embeddings across all 7 platforms. It returns posts that match the *intent* of the query, even if they don't share a single keyword.

## Why This Matters

Most tools force you to choose between depth (deep analytics on one platform) or breadth (shallow metrics on many). SMLE proves that with the right architecture—combining SERP discovery, targeted scraping, and LLM processing—you can have both.

We can now spin up a campaign in seconds, walk away for coffee, and return to a comprehensive, AI-analyzed report on exactly what the world is saying, everywhere at once.


## Features
- **Multi-Platform Tracking**: Monitor campaigns on Instagram, TikTok, Reddit, YouTube, and more.
- **Sentiment Analysis**: Automated sentiment scoring for posts.
- **Real-time Dashboard**: Visualize campaign performance and trends.
- **Self-Healing**: Automatic cleanup of stuck jobs.
- **Secure Authentication**: JWT-based auth with protected routes.

## Prerequisites

- **Node.js**: v18+
- **Couchbase Server**: Local or Cloud instance (Bucket: `SMLE`)
- **Docker**: Optional, for running databases easily.
- **BrightData Account**: For SERP and scraping capabilities.

## Quick Start (Docker)

To start Postgres (with pgvector support) using Docker:

```bash
docker-compose up -d
```

> **Note**: Couchbase is no longer included in the Docker configuration. If you need Couchbase, please install it separately or use a cloud instance.

## Installation

1.  **Clone the repository**
    ```bash
    git clone <repository_url>
    cd smle
    ```

2.  **Install Backend Dependencies**
    ```bash
    npm install
    ```

3.  **Install Frontend Dependencies**
    ```bash
    cd frontend
    npm install
    cd ..
    ```

## Configuration

1.  **Environment Variables**
    Copy the example file and update it with your credentials:
    ```bash
    cp .env.example .env
    ```
    
    Update `.env` with your:
    - Couchbase credentials
    - BrightData API Key
    - JWT Secret

## Database Setup

Before running the application, you must initialize the database (create collections, indexes, and admin user).

1.  **Run the setup script:**
    ```bash
    npm run setup:auth
    ```
    
    This will:
    - Create the necessary database indexes.
    - Create a default admin user if one doesn't exist.

## Running the Application

### 1. Start the Backend API
In the root directory:
```bash
npm run dev
```
Server will start on `http://localhost:3001`.

### 2. Start the Frontend Dashboard
In a new terminal, navigate to `frontend`:
```bash
cd frontend
npm run dev
```
Access the dashboard at `http://localhost:5173`.

## Usage

1.  **Login** using the credentials created during setup (or register a new user).
2.  **Create a Campaign**: Enter keywords and select platforms.
3.  **View Results**: The dashboard will update as data is fetched and analyzed.

## Architecture

- **Backend**: Node.js/Express with a Repository Pattern.
- **Database**: Couchbase (using `_default` collection scope for compatibility).
- **Frontend**: React + Vite + TailwindCSS.
