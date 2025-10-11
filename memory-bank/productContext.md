# Claude Code Router - Product Context

## Project Overview
Claude Code Router is a sophisticated routing and analytics system for Claude API requests. It provides intelligent request routing, cost tracking, and usage analytics for Claude AI API interactions.

## Core Features
- **Request Routing**: Intelligent routing of Claude API requests across different endpoints
- **Cost Analytics**: Real-time cost tracking and reporting for API usage
- **Token Analytics**: Token usage monitoring and optimization
- **UI Dashboard**: Web interface for viewing analytics and managing configuration
- **Multi-timeframe Analytics**: Support for different time periods (7 days, 30 days, etc.)

## Recent Development Focus
- Added comprehensive analytics support for cost and token tracking
- Implemented UI dashboard with time-based filtering
- Database integration for persistent analytics storage

## Technical Stack
- **Backend**: TypeScript/Node.js
- **Database**: SQLite (based on visible database.ts file)
- **Frontend**: Web UI with time-based filtering
- **CLI**: Command-line interface (ccr)

## Key Components
- Router service for request handling
- Database layer for analytics storage
- Cache layer for performance optimization
- Server component for API endpoints
- CLI for management operations

## Current Status
- Analytics feature recently completed and working
- System experiencing crashes when selecting 30-day analytics view
- Requires investigation and debugging