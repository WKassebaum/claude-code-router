# Active Context - Claude Code Router

## Current Focus
**Issue**: System crash when selecting 30-day analytics view in UI
**Status**: Investigation needed - crash logs to be analyzed
**Priority**: High - system is currently down/crashed

## Recent Changes
- Analytics for cost and tokens feature completed
- System was working initially after implementation
- Started 'ccr code' session in separate terminal
- Crash occurred when selecting "30 days" in UI
- `ccr status` shows service stopped/crashed

## Open Questions/Issues
1. Where are the actual log files stored? (Expected location /Users/wrk/.claude-code-router/logs/ccr.log not found)
2. What specific error caused the crash when selecting 30-day analytics?
3. Is this a data volume issue, query timeout, or code bug?
4. Are there alternative log locations to check?

## Investigation Steps Needed
1. Locate actual log files for the crashed CCR service
2. Analyze error messages and stack traces
3. Identify root cause of 30-day analytics crash
4. Implement fix and test with different time periods
5. Ensure system stability for analytics features

## Files Being Reviewed
- Multiple TypeScript files in src/ directory
- Database utilities and routing components
- Test files for cost calculation and pricing