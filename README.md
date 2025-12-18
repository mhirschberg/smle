# SMLE - Social Media Listening Engine

A powerful, unified dashboard for tracking and analyzing social media campaigns across multiple platforms (Instagram, TikTok, Reddit, YouTube, etc.) using Couchbase and BrightData.

## Features
- **Multi-Platform Tracking**: Monitor campaigns on Instagram, TikTok, Reddit, YouTube, and more.
- **Sentiment Analysis**: Automated sentiment scoring for posts.
- **Real-time Dashboard**: Visualize campaign performance and trends.
- **Self-Healing**: Automatic cleanup of stuck jobs.
- **Secure Authentication**: JWT-based auth with protected routes.

## Prerequisites

- **Node.js**: v18+
- **Couchbase Server**: Local or Cloud instance (Bucket: `SMLE`)
- **BrightData Account**: For SERP and scraping capabilities.

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
    - **Default Admin User**: `root` / `Sobaka!123`

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
