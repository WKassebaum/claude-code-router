#!/bin/bash

# Grok Transformers Management Script
# This script helps install, uninstall, and manage Grok transformers for Claude Code Router

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default directories
CCR_CONFIG_DIR="$HOME/.claude-code-router"
PLUGINS_DIR="$CCR_CONFIG_DIR/plugins"
CONFIG_FILE="$CCR_CONFIG_DIR/config.json"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_PLUGINS_DIR="$(dirname "$SCRIPT_DIR")/plugins"

# Transformer names
TRANSFORMERS=("grok-status-updates" "grok-interactive" "grok-heartbeat" "grok-auto-router")

# Functions
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  Grok Transformers Management Script${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo
}

print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_prerequisites() {
    print_status "Checking prerequisites..."

    # Check if jq is available
    if ! command -v jq &> /dev/null; then
        print_warning "jq is not installed. Some features may not work properly."
        echo "To install jq:"
        echo "  macOS: brew install jq"
        echo "  Ubuntu/Debian: sudo apt-get install jq"
        echo "  CentOS/RHEL: sudo yum install jq"
        echo
    fi

    # Check if CCR config directory exists
    if [ ! -d "$CCR_CONFIG_DIR" ]; then
        print_status "Creating CCR config directory: $CCR_CONFIG_DIR"
        mkdir -p "$CCR_CONFIG_DIR"
    fi

    # Check if plugins directory exists
    if [ ! -d "$PLUGINS_DIR" ]; then
        print_status "Creating plugins directory: $PLUGINS_DIR"
        mkdir -p "$PLUGINS_DIR"
    fi
}

backup_config() {
    if [ -f "$CONFIG_FILE" ]; then
        local backup_file="$CONFIG_FILE.backup.$(date +%Y%m%d_%H%M%S)"
        print_status "Backing up config to: $backup_file"
        cp "$CONFIG_FILE" "$backup_file"
    fi
}

install_transformers() {
    print_status "Installing Grok transformers..."

    check_prerequisites
    backup_config

    # Copy transformer files
    for transformer in "${TRANSFORMERS[@]}"; do
        local src_file="$REPO_PLUGINS_DIR/${transformer}.js"
        local dest_file="$PLUGINS_DIR/${transformer}.js"

        if [ -f "$src_file" ]; then
            print_status "Installing $transformer..."
            cp "$src_file" "$dest_file"
            chmod 644 "$dest_file"
        else
            print_error "Source file not found: $src_file"
            return 1
        fi
    done

    # Update or create config file
    update_config

    print_status "✅ Installation complete!"
    print_status "Restart Claude Code Router with: ccr restart"
}

uninstall_transformers() {
    print_status "Uninstalling Grok transformers..."

    backup_config

    # Remove transformer files
    for transformer in "${TRANSFORMERS[@]}"; do
        local file="$PLUGINS_DIR/${transformer}.js"
        if [ -f "$file" ]; then
            print_status "Removing $transformer..."
            rm "$file"
        fi
    done

    # Remove from config
    remove_from_config

    print_status "✅ Uninstallation complete!"
    print_status "Restart Claude Code Router with: ccr restart"
}

update_config() {
    print_status "Updating configuration file..."

    if [ ! -f "$CONFIG_FILE" ]; then
        print_status "Creating new config file..."
        cat > "$CONFIG_FILE" << EOF
{
  "transformers": [],
  "Providers": [],
  "Router": {},
  "APIKEY": null,
  "HOST": "127.0.0.1",
  "PORT": 8181
}
EOF
    fi

    # Add transformers configuration
    if command -v jq &> /dev/null; then
        update_config_with_jq
    else
        update_config_manual
    fi
}

update_config_with_jq() {
    local temp_file=$(mktemp)

    # Create transformer configurations
    local transformers_config='[
  {
    "path": "'$PLUGINS_DIR'/grok-status-updates.js",
    "options": {
      "enabled": true,
      "statusInterval": 15000,
      "enableProgressTracking": true,
      "enableTaskBreakdown": true,
      "statusFormat": "markdown"
    }
  },
  {
    "path": "'$PLUGINS_DIR'/grok-interactive.js",
    "options": {
      "enabled": true,
      "enableStepByStep": true,
      "enableQuestions": true,
      "enableConfirmations": true,
      "conversationalStyle": "friendly",
      "verbosityLevel": "detailed"
    }
  },
  {
    "path": "'$PLUGINS_DIR'/grok-heartbeat.js",
    "options": {
      "enabled": true,
      "heartbeatInterval": 30000,
      "maxOperationTime": 300000,
      "enableKeepAlive": true,
      "enableTimeoutPrevention": true,
      "heartbeatFormat": "minimal"
    }
  },
  {
    "path": "'$PLUGINS_DIR'/grok-auto-router.js",
    "options": {
      "enabled": true,
      "enableAutoRouting": true,
      "enableComplexityAnalysis": true,
      "enablePerformanceOptimization": true,
      "routingStrategy": "balanced"
    }
  }
]'

    # Update config with new transformers
    jq ".transformers = $transformers_config" "$CONFIG_FILE" > "$temp_file"
    mv "$temp_file" "$CONFIG_FILE"

    # Update xAI provider if it exists
    if jq -e '.Providers[] | select(.name == "xai")' "$CONFIG_FILE" > /dev/null; then
        jq '(.Providers[] | select(.name == "xai") | .transformer.use) = [
          "grok-status-updates",
          "grok-interactive",
          "grok-heartbeat",
          "grok-auto-router"
        ]' "$CONFIG_FILE" > "$temp_file"
        mv "$temp_file" "$CONFIG_FILE"
        print_status "Updated existing xAI provider configuration"
    else
        print_warning "No xAI provider found in config. You'll need to add transformer configuration manually."
    fi
}

update_config_manual() {
    print_warning "jq not available. Please manually add the transformer configuration."
    print_status "Add this to your config.json transformers section:"
    cat << 'EOF'
"transformers": [
  {
    "path": "/path/to/plugins/grok-status-updates.js",
    "options": {
      "enabled": true,
      "statusInterval": 15000,
      "enableProgressTracking": true,
      "enableTaskBreakdown": true,
      "statusFormat": "markdown"
    }
  },
  {
    "path": "/path/to/plugins/grok-interactive.js",
    "options": {
      "enabled": true,
      "enableStepByStep": true,
      "enableQuestions": true,
      "enableConfirmations": true,
      "conversationalStyle": "friendly",
      "verbosityLevel": "detailed"
    }
  },
  {
    "path": "/path/to/plugins/grok-heartbeat.js",
    "options": {
      "enabled": true,
      "heartbeatInterval": 30000,
      "maxOperationTime": 300000,
      "enableKeepAlive": true,
      "enableTimeoutPrevention": true,
      "heartbeatFormat": "minimal"
    }
  },
  {
    "path": "/path/to/plugins/grok-auto-router.js",
    "options": {
      "enabled": true,
      "enableAutoRouting": true,
      "enableComplexityAnalysis": true,
      "enablePerformanceOptimization": true,
      "routingStrategy": "balanced"
    }
  }
]
EOF
}

remove_from_config() {
    if [ ! -f "$CONFIG_FILE" ]; then
        return
    fi

    if command -v jq &> /dev/null; then
        local temp_file=$(mktemp)

        # Remove grok transformers from config
        jq 'del(.transformers[] | select(.path | contains("grok-")))' "$CONFIG_FILE" > "$temp_file"
        mv "$temp_file" "$CONFIG_FILE"

        # Remove from xAI provider
        jq '(.Providers[] | select(.name == "xai") | .transformer.use) |= map(select(. | contains("grok-") | not))' "$CONFIG_FILE" > "$temp_file"
        mv "$temp_file" "$CONFIG_FILE"

        print_status "Removed transformer configuration from config.json"
    else
        print_warning "jq not available. Please manually remove transformer configuration from config.json"
    fi
}

list_status() {
    print_status "Checking Grok transformers status..."
    echo

    # Check if files exist
    echo "📁 Transformer Files:"
    for transformer in "${TRANSFORMERS[@]}"; do
        local file="$PLUGINS_DIR/${transformer}.js"
        if [ -f "$file" ]; then
            echo -e "  ✅ ${transformer}.js"
        else
            echo -e "  ❌ ${transformer}.js (not found)"
        fi
    done
    echo

    # Check config
    echo "⚙️  Configuration:"
    if [ -f "$CONFIG_FILE" ]; then
        if command -v jq &> /dev/null; then
            local transformer_count=$(jq '.transformers | length' "$CONFIG_FILE" 2>/dev/null || echo "0")
            echo "  Transformers in config: $transformer_count"

            # Check xAI provider
            if jq -e '.Providers[] | select(.name == "xai")' "$CONFIG_FILE" > /dev/null 2>&1; then
                echo "  ✅ xAI provider found"
                local grok_transformers=$(jq -r '.Providers[] | select(.name == "xai") | .transformer.use[]? | select(contains("grok"))' "$CONFIG_FILE" 2>/dev/null | wc -l)
                echo "  Grok transformers configured: $grok_transformers"
            else
                echo "  ❌ xAI provider not found"
            fi
        else
            echo "  ❓ Cannot check config (jq not available)"
        fi
    else
        echo "  ❌ Config file not found"
    fi
    echo

    # Check CCR status
    echo "🚀 Claude Code Router:"
    if command -v ccr &> /dev/null; then
        if ccr status | grep -q "Running"; then
            echo "  ✅ CCR is running"
        else
            echo "  ❌ CCR is not running"
        fi
    else
        echo "  ❓ CCR command not found"
    fi
}

enable_transformer() {
    local transformer="$1"
    if [ -z "$transformer" ]; then
        print_error "Please specify a transformer name"
        return 1
    fi

    if command -v jq &> /dev/null && [ -f "$CONFIG_FILE" ]; then
        local temp_file=$(mktemp)
        jq "(.transformers[] | select(.path | contains(\"$transformer\")) | .options.enabled) = true" "$CONFIG_FILE" > "$temp_file"
        mv "$temp_file" "$CONFIG_FILE"
        print_status "✅ Enabled $transformer"
        print_status "Restart CCR to apply changes: ccr restart"
    else
        print_error "Cannot enable transformer (jq not available or config not found)"
    fi
}

disable_transformer() {
    local transformer="$1"
    if [ -z "$transformer" ]; then
        print_error "Please specify a transformer name"
        return 1
    fi

    if command -v jq &> /dev/null && [ -f "$CONFIG_FILE" ]; then
        local temp_file=$(mktemp)
        jq "(.transformers[] | select(.path | contains(\"$transformer\")) | .options.enabled) = false" "$CONFIG_FILE" > "$temp_file"
        mv "$temp_file" "$CONFIG_FILE"
        print_status "✅ Disabled $transformer"
        print_status "Restart CCR to apply changes: ccr restart"
    else
        print_error "Cannot disable transformer (jq not available or config not found)"
    fi
}

show_help() {
    print_header
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  install     Install all Grok transformers"
    echo "  uninstall   Remove all Grok transformers"
    echo "  status      Show installation status"
    echo "  enable      Enable a specific transformer"
    echo "  disable     Disable a specific transformer"
    echo "  help        Show this help message"
    echo
    echo "Examples:"
    echo "  $0 install                           # Install all transformers"
    echo "  $0 uninstall                         # Remove all transformers"
    echo "  $0 status                            # Check status"
    echo "  $0 enable grok-status-updates        # Enable specific transformer"
    echo "  $0 disable grok-heartbeat            # Disable specific transformer"
    echo
    echo "Available transformers:"
    for transformer in "${TRANSFORMERS[@]}"; do
        echo "  - $transformer"
    done
    echo
}

# Main script
case "${1:-help}" in
    install)
        print_header
        install_transformers
        ;;
    uninstall)
        print_header
        uninstall_transformers
        ;;
    status)
        print_header
        list_status
        ;;
    enable)
        print_header
        enable_transformer "$2"
        ;;
    disable)
        print_header
        disable_transformer "$2"
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo
        show_help
        exit 1
        ;;
esac