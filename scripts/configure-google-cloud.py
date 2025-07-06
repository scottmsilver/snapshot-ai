#!/usr/bin/env python3
"""
Google Cloud OAuth Configuration Helper

This script helps configure your Google Cloud project for the Image Markup App.
It provides commands to run using the gcloud CLI.
"""

import os
import json
import subprocess
import sys
from datetime import datetime

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_colored(text, color):
    print(f"{color}{text}{Colors.ENDC}")

def print_header(text):
    print_colored(f"\n{'='*60}", Colors.HEADER)
    print_colored(f"{text:^60}", Colors.HEADER)
    print_colored(f"{'='*60}\n", Colors.HEADER)

def check_gcloud():
    """Check if gcloud is installed"""
    try:
        subprocess.run(['gcloud', '--version'], capture_output=True, check=True)
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        return False

def get_current_project():
    """Get current gcloud project"""
    try:
        result = subprocess.run(['gcloud', 'config', 'get-value', 'project'], 
                              capture_output=True, text=True, check=True)
        return result.stdout.strip()
    except:
        return None

def load_env_file(filename='.env.production'):
    """Load environment variables from file"""
    env_vars = {}
    if os.path.exists(filename):
        with open(filename, 'r') as f:
            for line in f:
                line = line.strip()
                if line and not line.startswith('#') and '=' in line:
                    key, value = line.split('=', 1)
                    env_vars[key] = value
    return env_vars

def generate_oauth_config(app_name='image-markup-app', custom_domain=None):
    """Generate OAuth configuration"""
    origins = [
        'http://localhost:5173',
        'http://localhost:5174',
        'http://localhost:4173',
        f'https://{app_name}.vercel.app',
        f'https://{app_name}-*.vercel.app'
    ]
    
    if custom_domain:
        origins.extend([
            f'https://{custom_domain}',
            f'https://www.{custom_domain}'
        ])
    
    return {
        'origins': origins,
        'redirect_uris': origins  # Same as origins for SPAs
    }

def create_setup_commands(project_id, client_name='Image Markup App'):
    """Create gcloud commands for setup"""
    commands = []
    
    # Set project
    commands.append({
        'description': 'Set active project',
        'command': f'gcloud config set project {project_id}'
    })
    
    # Enable APIs
    apis = [
        'drive.googleapis.com',
        'iamcredentials.googleapis.com'
    ]
    
    for api in apis:
        commands.append({
            'description': f'Enable {api}',
            'command': f'gcloud services enable {api}'
        })
    
    # Create API key command
    commands.append({
        'description': 'Create API Key',
        'command': f'gcloud alpha services api-keys create --display-name="{client_name} API Key"'
    })
    
    return commands

def create_oauth_update_script():
    """Create a script to update OAuth client"""
    script_content = '''#!/bin/bash
# OAuth Client Update Script
# This script helps update your OAuth client configuration

PROJECT_ID=$(gcloud config get-value project)
echo "Current project: $PROJECT_ID"

# List OAuth clients
echo "\\nListing OAuth 2.0 clients..."
gcloud alpha iap oauth-clients list

echo "\\nTo update your OAuth client, you'll need to:"
echo "1. Go to https://console.cloud.google.com/apis/credentials"
echo "2. Click on your OAuth 2.0 Client ID"
echo "3. Add the authorized origins and redirect URIs from google-oauth-setup.md"
echo "4. Save the changes"

echo "\\nNote: Direct OAuth client updates via gcloud CLI are limited."
echo "The Google Cloud Console provides the most reliable way to update OAuth clients."
'''
    
    with open('scripts/update-oauth-client.sh', 'w') as f:
        f.write(script_content)
    os.chmod('scripts/update-oauth-client.sh', 0o755)

def main():
    print_header("Google Cloud OAuth Configuration Helper")
    
    # Check if gcloud is installed
    if not check_gcloud():
        print_colored("❌ gcloud CLI not found!", Colors.RED)
        print("\nPlease install the Google Cloud SDK:")
        print("https://cloud.google.com/sdk/docs/install")
        sys.exit(1)
    
    print_colored("✓ gcloud CLI found", Colors.GREEN)
    
    # Get current project
    current_project = get_current_project()
    if current_project:
        print_colored(f"✓ Current project: {current_project}", Colors.GREEN)
    else:
        print_colored("⚠ No project set", Colors.YELLOW)
        print("\nSet a project with:")
        print("  gcloud config set project YOUR_PROJECT_ID")
    
    # Load environment variables
    env_vars = load_env_file()
    if env_vars:
        print_colored("✓ Found .env.production file", Colors.GREEN)
    
    # Get configuration
    app_name = input("\nEnter your Vercel app name (default: image-markup-app): ").strip()
    if not app_name:
        app_name = 'image-markup-app'
    
    custom_domain = input("Enter custom domain (optional, press Enter to skip): ").strip()
    
    # Generate OAuth configuration
    oauth_config = generate_oauth_config(app_name, custom_domain)
    
    # Save OAuth configuration
    print_colored("\nGenerating OAuth configuration...", Colors.BLUE)
    
    config_file = 'oauth-config.json'
    with open(config_file, 'w') as f:
        json.dump(oauth_config, f, indent=2)
    
    print_colored(f"✓ Created {config_file}", Colors.GREEN)
    
    # Generate setup commands
    if current_project:
        commands = create_setup_commands(current_project)
        
        print_header("Google Cloud Setup Commands")
        print("Run these commands to set up your Google Cloud project:\n")
        
        for cmd in commands:
            print_colored(f"# {cmd['description']}", Colors.YELLOW)
            print(f"{cmd['command']}\n")
    
    # Create update script
    create_oauth_update_script()
    print_colored("✓ Created scripts/update-oauth-client.sh", Colors.GREEN)
    
    # Generate manual configuration guide
    print_header("Manual Configuration Steps")
    
    print("1. Go to Google Cloud Console:")
    print_colored("   https://console.cloud.google.com/", Colors.BLUE)
    
    print("\n2. Enable APIs:")
    print("   - APIs & Services → Library")
    print("   - Search and enable: Google Drive API")
    
    print("\n3. Configure OAuth consent screen:")
    print("   - APIs & Services → OAuth consent screen")
    print("   - Add required scopes:")
    print("     • openid")
    print("     • email") 
    print("     • profile")
    print("     • https://www.googleapis.com/auth/drive.file")
    
    print("\n4. Update OAuth 2.0 Client:")
    print("   - APIs & Services → Credentials")
    print("   - Click on your OAuth 2.0 Client ID")
    print("   - Add Authorized JavaScript origins:")
    for origin in oauth_config['origins']:
        print(f"     • {origin}")
    
    print("\n   - Add Authorized redirect URIs:")
    for uri in oauth_config['redirect_uris']:
        print(f"     • {uri}")
    
    print("\n5. Copy credentials to .env files:")
    print("   - Client ID → VITE_GOOGLE_CLIENT_ID")
    print("   - API Key → VITE_GOOGLE_API_KEY")
    
    print_colored("\n✓ Configuration guide complete!", Colors.GREEN)
    print("\nCheck these files for more details:")
    print("  - oauth-config.json (URLs to add)")
    print("  - google-oauth-setup.md (detailed instructions)")
    print("  - scripts/update-oauth-client.sh (helper script)")

if __name__ == "__main__":
    main()