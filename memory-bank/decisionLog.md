# Decision Log - Claude Code Router

## Analytics Implementation Decisions

### [2025-09-26] Cost and Token Analytics Feature
**Decision**: Implemented comprehensive analytics dashboard with real-time cost tracking and token usage monitoring.

**Rationale**: 
- Need for visibility into API usage costs across multiple providers
- Token optimization for better resource management
- Historical analysis for usage patterns

**Implementation**:
- Added database layer for persistent analytics storage
- Created web UI with time-based filtering (7 days, 30 days, etc.)
- Real-time cost calculation based on provider pricing models

**Implications**:
- Database schema changes for analytics storage
- Performance considerations for large dataset queries
- UI complexity increased with interactive dashboards

### [2025-09-26] SQLite Database Choice
**Decision**: Used SQLite for analytics data persistence.

**Rationale**:
- Lightweight and embedded solution
- No external database dependencies
- Sufficient for current usage patterns

**Trade-offs**:
- May need migration to PostgreSQL for high-volume usage
- Limited concurrent write performance
- Good for development and small-to-medium deployments

### [2025-09-26] Time-based Query Architecture
**Decision**: Implemented client-side time period selection with server-side filtering.

**Rationale**:
- Better user experience with immediate UI response
- Flexible time range selection
- Server-side optimization for large datasets

**Known Issues**:
- 30-day queries causing performance problems
- Potential memory issues with large result sets
- Need for query optimization and pagination

## Technical Architecture Decisions

### [2025-09-26] Multi-Provider Support
**Decision**: Abstract router pattern to support multiple AI providers.

**Rationale**:
- Flexibility to switch between providers
- Cost optimization through provider selection
- Redundancy and reliability

### [2025-09-26] Cache Layer Implementation
**Decision**: Added caching layer for performance optimization.

**Rationale**:
- Reduce API calls for repeated requests
- Improve response times
- Cost reduction through cache hits

## Current Critical Issues

### [2025-09-27] 30-Day Analytics Crash
**Status**: CRITICAL - System down
**Issue**: Selecting 30-day time period in analytics UI causes complete system crash
**Impact**: Service unavailable, `ccr status` shows stopped/crashed
**Investigation**: Log analysis required - `/Users/wrk/.claude-code-router/logs/ccr.log`