# Git Workflow Documentation

## Branch Structure

This repository maintains a structured git workflow to manage both upstream synchronization and feature development. The branch structure is:

```
upstream/main (musistudio/claude-code-router)
    ↓
origin/main (synced with upstream)
    ↓
integration/* (integration branches for testing merged changes)
    ↓
feature/* (active development branches)
    ↓
backup/* (safety backups before major operations)
```

## Current Branch Status (as of 2025-01-10)

- **upstream/main**: v1.0.59 (latest release from musistudio/claude-code-router)
- **origin/main**: v1.0.59 (synced with upstream)
- **integration/analytics-v2**: v1.1.0 (merged feature + upstream at commit c003218)
- **feature/analytics-cost-token-tracking**: v1.1.0 (active development with analytics features)
- **backup/analytics-v1.1.0-20250110**: v1.1.0 (safety backup at commit fd9bdf7)

## Branching Strategy

### 1. Feature Branches (`feature/*`)

These are active development branches where new features are implemented:

- **Purpose**: Isolate feature development from main branch
- **Naming**: `feature/<feature-name>`
- **Base**: Created from `main` or previous feature branches
- **Merge Target**: Integration branches (not directly to main)

**Current Feature Branch:**
- `feature/analytics-cost-token-tracking` - Contains:
  - Usage tracking with SQLite database
  - Cost analytics and token tracking
  - UsageDashboard UI component
  - Tool schema filtering improvements
  - Grok transformer plugins
  - Statusline integration

### 2. Integration Branches (`integration/*`)

These branches are used to test the integration of feature branches with upstream updates:

- **Purpose**: Safely merge and test feature changes with latest upstream
- **Naming**: `integration/<feature-name>-v<version>`
- **Base**: Created from synced `main` branch
- **Testing**: Build, test, and validate integrated changes here

**Current Integration Branch:**
- `integration/analytics-v2` - Merged `feature/analytics-cost-token-tracking` with upstream v1.0.59

### 3. Backup Branches (`backup/*`)

Safety backups created before major git operations:

- **Purpose**: Preserve working state before risky operations
- **Naming**: `backup/<feature-name>-v<version>-<date>`
- **Retention**: Keep until no longer needed (can be deleted after successful integration)

## Upstream Synchronization Workflow

### Step 1: Sync Main with Upstream

\`\`\`bash
# Ensure you have upstream remote configured
git remote add upstream https://github.com/musistudio/claude-code-router.git

# Fetch latest upstream changes
git fetch upstream

# Switch to main and fast-forward merge
git checkout main
git pull upstream main --no-edit

# Push updated main to origin
git push origin main
\`\`\`

### Step 2: Create Integration Branch

\`\`\`bash
# Create integration branch from updated main
git checkout -b integration/<feature-name>-v2 main

# The integration branch now has all upstream changes
\`\`\`

### Step 3: Create Safety Backup

\`\`\`bash
# Before merging, backup your feature branch
git checkout feature/<feature-name>
git branch backup/<feature-name>-v<version>-$(date +%Y%m%d)
git push origin backup/<feature-name>-v<version>-$(date +%Y%m%d)
\`\`\`

### Step 4: Merge Feature into Integration

\`\`\`bash
# Switch to integration branch
git checkout integration/<feature-name>-v2

# Merge feature branch (expect conflicts)
git merge --no-ff feature/<feature-name>

# Resolve conflicts as described in the next section
\`\`\`

### Step 5: Build and Test

\`\`\`bash
# Install dependencies (if package.json changed)
npm install
cd ui && npm install && cd ..

# Build the project
npm run build

# Test basic functionality
ccr status
\`\`\`

## Resolving Merge Conflicts

When merging feature branches with upstream updates, conflicts are common in these files:

### Common Conflict Files

1. **package.json**
   - **Strategy**: Merge dependencies from both branches, use newer version numbers
   - **Example**: Take newer `@musistudio/llms` version, include all dependencies

2. **src/index.ts**
   - **Strategy**: Preserve feature improvements while including upstream additions
   - **Common**: Error handling improvements, new API endpoints

3. **src/server.ts**
   - **Strategy**: Merge imports, include both feature APIs and upstream APIs
   - **Example**: Include both usage tracking and count_tokens endpoint

4. **src/middleware/auth.ts**
   - **Strategy**: Preserve granular access control from features
   - **Keep**: Feature branch authentication enhancements

5. **src/utils/codeCommand.ts**
   - **Strategy**: Merge environment variables and auth logic
   - **Include**: Both subscription and API key authentication

6. **ui/tsconfig.tsbuildinfo**
   - **Strategy**: Merge file lists from both branches
   - **Note**: Auto-generated, can be regenerated after build

### Conflict Resolution Process

For each conflicted file:

1. **Read both versions** to understand changes
2. **Identify intent** of each change
3. **Merge strategically**:
   - Feature enhancements take precedence for new features
   - Upstream fixes take precedence for bug fixes
   - Combine when both add different functionality
4. **Mark as resolved**: `git add <file>`
5. **Test changes** after resolution

## Preparing Pull Requests for Upstream

To contribute features back to upstream, create focused topic branches:

### High-Priority Features for PR

1. **Tool Schema Filtering** (`pr/tool-schema-filter`)
   \`\`\`bash
   git checkout -b pr/tool-schema-filter main
   # Cherry-pick only tool schema filtering commits
   git cherry-pick <relevant-commits>
   \`\`\`

2. **Usage Tracking & Analytics** (`pr/usage-analytics`)
   \`\`\`bash
   git checkout -b pr/usage-analytics main
   # Include database, API endpoints, UI dashboard
   \`\`\`

### PR Submission Guidelines

- **One feature per PR**: Don't mix unrelated features
- **Clean commit history**: Squash or rewrite commits if needed
- **Update documentation**: Include README updates
- **Test thoroughly**: Ensure feature works standalone
- **Follow upstream conventions**: Match their code style

## Maintenance Workflow

### Regular Upstream Sync (Weekly/Monthly)

\`\`\`bash
# 1. Backup current feature branch
git checkout feature/<current-feature>
git branch backup/<feature>-$(date +%Y%m%d)

# 2. Sync main with upstream
git checkout main
git pull upstream main --no-edit
git push origin main

# 3. Create new integration branch
git checkout -b integration/<feature>-v<next> main

# 4. Merge and resolve conflicts
git merge --no-ff feature/<current-feature>
# ... resolve conflicts ...
git commit

# 5. Build and test
npm install && cd ui && npm install && cd ..
npm run build

# 6. If successful, update feature branch (optional)
git checkout feature/<current-feature>
git merge integration/<feature>-v<next>
\`\`\`

### Cleanup Old Branches

\`\`\`bash
# List all branches
git branch -a

# Delete merged integration branches (after verification)
git branch -d integration/analytics-v1
git push origin --delete integration/analytics-v1

# Delete old backup branches (after major milestone)
git branch -d backup/analytics-v1.0.0-20241201
git push origin --delete backup/analytics-v1.0.0-20241201
\`\`\`

## Best Practices

1. **Always backup before major operations** - Create backup branches before risky git operations
2. **Test integration branches** - Never merge integration directly back to feature without testing
3. **Keep feature branches small** - Easier to merge and less conflicts
4. **Sync regularly** - Don't let feature branches drift too far from upstream
5. **Document conflicts** - Keep notes on how you resolved complex conflicts
6. **Use descriptive commits** - Make it easy to cherry-pick for PRs

## Troubleshooting

### Build Failures After Merge

If build fails after merging:

\`\`\`bash
# Clean node_modules and rebuild
rm -rf node_modules ui/node_modules package-lock.json
npm install
cd ui && npm install && cd ..
npm run build
\`\`\`

### Resolving Complex Conflicts

If you're unsure how to resolve a conflict:

1. Check the git history: `git log --oneline --graph --all`
2. View the conflicting changes: `git show <commit>`
3. Test both versions separately if needed
4. Ask for review before finalizing

### Reverting a Bad Merge

If the merge causes problems:

\`\`\`bash
# If not yet pushed
git reset --hard ORIG_HEAD

# If already pushed (creates revert commit)
git revert -m 1 HEAD
\`\`\`

## Summary

This workflow balances:
- **Safety**: Backup branches protect working code
- **Testing**: Integration branches allow validation before affecting main development
- **Maintainability**: Clear structure makes it easy to sync with upstream
- **Contribution**: Organized approach facilitates PR submissions

The key principle: **Keep main synced with upstream, develop in feature branches, test in integration branches, and preserve backups for safety.**
