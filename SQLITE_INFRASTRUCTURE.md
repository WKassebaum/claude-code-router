# SQLite Infrastructure Considerations for CCR Token Tracking

## 📊 Database Sizing & Growth

### Initial Setup
- **Database Location**: `~/.claude-code-router/usage.db`
- **Empty Size**: ~100KB
- **Per Request**: ~100 bytes
- **Monthly Growth** (by usage level):
  - Light (1K requests): ~100KB/month
  - Medium (10K requests): ~1MB/month
  - Heavy (100K requests): ~10MB/month
  - Power User (500K requests): ~50MB/month

### Storage Projections
```
Year 1 (Medium use): ~12MB
Year 1 (Heavy use): ~120MB
Year 1 (Power user): ~600MB
```

## 🚀 Performance Optimization

### SQLite Configuration
```sql
-- Essential performance settings
PRAGMA journal_mode = WAL;          -- Enable Write-Ahead Logging
PRAGMA busy_timeout = 5000;         -- 5 second timeout for locks
PRAGMA synchronous = NORMAL;        -- Balance durability/speed
PRAGMA cache_size = -64000;         -- 64MB cache in RAM
PRAGMA temp_store = MEMORY;         -- Temp tables in memory
PRAGMA mmap_size = 268435456;       -- 256MB memory-mapped I/O
PRAGMA page_size = 4096;            -- Optimal page size
```

### Index Strategy
```sql
-- Critical indexes for performance
CREATE INDEX idx_usage_timestamp ON usage_records(timestamp);
CREATE INDEX idx_usage_session ON usage_records(session_id);
CREATE INDEX idx_usage_provider_model ON usage_records(provider, model);
CREATE INDEX idx_usage_composite ON usage_records(session_id, timestamp);
```

## 💾 Backup & Recovery Strategy

### Automated Backup Implementation
```typescript
// src/utils/backup.ts
import { CronJob } from 'cron';
import { execSync } from 'child_process';

export function setupAutoBackup() {
  // Daily backup at 2 AM
  new CronJob('0 2 * * *', () => {
    const date = new Date().toISOString().split('T')[0];
    const backupPath = `${HOME_DIR}/backups/usage_${date}.db`;

    // Use SQLite's backup API
    execSync(`sqlite3 ${DB_PATH} ".backup '${backupPath}'"`);

    // Cleanup old backups (keep 30 days)
    cleanupOldBackups(30);
  }).start();
}
```

### Recovery Procedures
1. **Corruption Detection**
   ```sql
   PRAGMA integrity_check;  -- Run on startup
   ```

2. **Automatic Recovery**
   ```typescript
   if (integrityCheck !== 'ok') {
     restoreFromBackup();
     rebuildFromLogs();
   }
   ```

## 📈 Scaling Thresholds

### When SQLite is Perfect ✅
| Metric | Threshold | Reason |
|--------|-----------|--------|
| Users | 1-10 | Single writer limitation |
| Requests/day | <50K | Write performance |
| Database size | <1GB | File system efficiency |
| Deployment | Local only | No network access |
| Backup needs | Simple | Built-in backup |

### When to Migrate to PostgreSQL 🔄
| Trigger | Value | Action Required |
|---------|-------|-----------------|
| Concurrent users | >10 | Multi-writer needed |
| Database size | >1GB | Better large data handling |
| Remote access | Required | Network protocol support |
| Replication | Needed | Master-slave setup |
| Advanced queries | Complex | Better query planner |

## 🔧 Implementation Checklist

### Phase 1: Basic Setup (Day 1)
- [ ] Create database file with proper permissions (600)
- [ ] Initialize schema with tables and indexes
- [ ] Configure SQLite pragmas for performance
- [ ] Implement basic CRUD operations
- [ ] Add error handling for disk full/corruption

### Phase 2: Performance (Day 2)
- [ ] Implement connection pooling (1 writer, 5 readers)
- [ ] Add in-memory caching layer (LRU)
- [ ] Set up batch insert queue
- [ ] Create materialized views for dashboard
- [ ] Add query performance monitoring

### Phase 3: Maintenance (Day 3)
- [ ] Automated daily backups
- [ ] Weekly VACUUM schedule
- [ ] Data retention policy (90 days raw, 1 year aggregated)
- [ ] Disk space monitoring
- [ ] Corruption detection on startup

### Phase 4: Migration Ready (Day 4)
- [ ] Abstract database interface
- [ ] PostgreSQL compatibility layer
- [ ] Export/import tools
- [ ] Migration scripts
- [ ] Rollback procedures

## 🎯 Critical Design Decisions

### 1. **Write-Ahead Logging (WAL)**
**Decision**: Enable WAL mode
**Rationale**: Allows concurrent reads during writes, crucial for dashboard performance

### 2. **Batch Processing**
**Decision**: Queue writes, batch every 100ms
**Rationale**: Reduces write locks, improves throughput 10x

### 3. **Data Aggregation**
**Decision**: Hourly aggregation job
**Rationale**: Reduces query time for dashboard from 500ms to 50ms

### 4. **Archive Strategy**
**Decision**: Move to archive table after 90 days
**Rationale**: Keeps working set small, maintains performance

## 🚨 Risk Mitigation

### Disk Full Scenario
```typescript
function checkDiskSpace(): boolean {
  const stats = fs.statfsSync(HOME_DIR);
  const freePercent = (stats.bavail / stats.blocks) * 100;

  if (freePercent < 5) {
    // Switch to memory-only mode
    switchToMemoryMode();
    notifyUser('Disk full - tracking in memory only');
    return false;
  }
  return true;
}
```

### Corruption Recovery
```typescript
async function handleCorruption() {
  logger.error('Database corruption detected');

  // 1. Try to salvage data
  await exportReadableData();

  // 2. Restore from backup
  const restored = await restoreLatestBackup();

  // 3. Replay recent events from log
  if (restored) {
    await replayFromTransactionLog();
  }

  // 4. Alert user
  notifyUser('Database recovered from backup');
}
```

## 📊 Monitoring Dashboard

### Key Metrics to Track
```sql
-- Database health query
SELECT
  (SELECT COUNT(*) FROM usage_records) as total_records,
  (SELECT page_count * page_size FROM pragma_page_count(), pragma_page_size()) as db_size_bytes,
  (SELECT COUNT(*) FROM usage_records WHERE timestamp > datetime('now', '-1 hour')) as recent_records,
  (SELECT AVG(response_time_ms) FROM usage_records WHERE timestamp > datetime('now', '-1 hour')) as avg_response_time;
```

### Performance Alerts
- Database size > 80% of limit
- Query time > 1 second
- Write queue > 1000 items
- Backup failure
- Integrity check failure

## 🔄 Migration Path

### Current: SQLite (Months 1-6)
```javascript
const db = new Database(path.join(HOME_DIR, 'usage.db'));
```

### Growth: PostgreSQL (Months 6-12)
```javascript
const db = process.env.USE_POSTGRES
  ? new Pool({ connectionString: process.env.DATABASE_URL })
  : new Database(path.join(HOME_DIR, 'usage.db'));
```

### Scale: TimescaleDB (Year 2+)
```javascript
// Time-series optimized for millions of records
const db = new TimescaleDB({
  ...postgresConfig,
  hypertable: 'usage_records',
  chunk_time_interval: '1 day'
});
```

## 💡 Best Practices

1. **Always use transactions** for multi-statement operations
2. **Prepare statements** for repeated queries
3. **Use EXPLAIN QUERY PLAN** to optimize slow queries
4. **Monitor file system** where database resides
5. **Test backup restoration** monthly
6. **Keep SQLite version updated** for performance improvements
7. **Document schema changes** with migration scripts

---

## Quick Start Code

```typescript
// src/utils/database.ts
import Database from 'better-sqlite3';
import { join } from 'path';
import { HOME_DIR } from '../constants';

export class UsageDatabase {
  private db: Database.Database;
  private writeQueue: any[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor() {
    const dbPath = join(HOME_DIR, 'usage.db');
    this.db = new Database(dbPath);

    // Apply performance settings
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA busy_timeout = 5000;
      PRAGMA synchronous = NORMAL;
      PRAGMA cache_size = -64000;
      PRAGMA temp_store = MEMORY;
      PRAGMA mmap_size = 268435456;
    `);

    this.initSchema();
    this.setupMaintenance();
  }

  private initSchema() {
    // Create tables and indexes
    this.db.exec(SCHEMA_SQL);
  }

  private setupMaintenance() {
    // Weekly VACUUM
    setInterval(() => {
      this.db.exec('VACUUM;');
    }, 7 * 24 * 60 * 60 * 1000);
  }

  // Batched insert for performance
  async recordUsage(data: UsageData) {
    this.writeQueue.push(data);

    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushWrites();
      }, 100);
    }
  }

  private flushWrites() {
    const stmt = this.db.prepare(INSERT_USAGE_SQL);
    const insertMany = this.db.transaction((records) => {
      for (const record of records) {
        stmt.run(record);
      }
    });

    insertMany(this.writeQueue);
    this.writeQueue = [];
    this.batchTimer = null;
  }
}
```

---

*SQLite Infrastructure Guide v1.0 - Optimized for single-user to small team deployments*