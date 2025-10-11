#!/bin/bash

# Quick installer for Grok Transformers
# One-command installation script

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}🚀 Installing Grok Transformers for Claude Code Router...${NC}"
echo

# Run the main management script
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$SCRIPT_DIR/scripts/grok-transformers.sh" install

echo
echo -e "${GREEN}✅ Installation complete!${NC}"
echo
echo "What happens next:"
echo "1. Restart Claude Code Router: ccr restart"
echo "2. Your Grok models will now have enhanced interactive behavior"
echo "3. Check status anytime with: $SCRIPT_DIR/scripts/grok-transformers.sh status"
echo
echo "To disable specific transformers:"
echo "  $SCRIPT_DIR/scripts/grok-transformers.sh disable [transformer-name]"
echo
echo "Available transformers:"
echo "  - grok-status-updates (progress tracking)"
echo "  - grok-interactive (Claude-like behavior)"
echo "  - grok-heartbeat (timeout prevention)"
echo "  - grok-auto-router (intelligent model selection)"
echo