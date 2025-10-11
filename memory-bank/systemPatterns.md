# System Patterns - Claude Code Router

## Architecture Patterns

### Router Pattern
- Central routing logic in `src/utils/router.ts`
- Request forwarding and response handling
- Multiple provider support

### Database Layer Pattern
- Database utilities in `src/utils/database.ts`
- SQLite for persistent storage
- Analytics data storage and retrieval

### Cache Layer Pattern
- Caching utilities in `src/utils/cache.ts`
- Performance optimization for frequent queries
- Request/response caching

### Server Pattern
- Main server logic in `src/server.ts`
- API endpoint handling
- Request processing pipeline

## Analytics Patterns

### Cost Tracking
- Real-time cost calculation
- Provider-specific pricing models
- Historical cost analysis

### Token Analytics
- Token usage monitoring
- Optimization suggestions
- Usage pattern analysis

### Time-based Filtering
- Support for multiple time periods
- Date range queries
- Performance considerations for large datasets

## CLI Patterns
- Command-line interface for management
- Status monitoring (`ccr status`)
- Session management (`ccr code`)

## Error Handling Patterns
- Structured error logging
- Graceful degradation
- Recovery mechanisms

## Known Issues
- 30-day analytics view causing system crashes
- Log file location inconsistencies
- Need for better error handling in time-based queries