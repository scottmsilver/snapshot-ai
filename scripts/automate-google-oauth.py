#!/usr/bin/env python3
"""
Automated Google Cloud OAuth Setup

This script uses Google Cloud APIs to automatically configure OAuth settings.
Requirements: pip install google-cloud-iam google-auth google-api-python-client
"""

import os
import sys
import json
import time
import subprocess
from typing import List, Dict, Optional, Tuple

try:
    from google.oauth2 import service_account
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    from google_auth_oauthlib.flow import InstalledAppFlow
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("Installing required dependencies...")
    os.system("pip install google-cloud-iam google-auth google-api-python-client google-auth-oauthlib google-auth-httplib2")
    print("\nPlease run the script again after installation completes.")
    sys.exit(1)

# Colors for output
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

def print_step(step_num, text):
    print_colored(f"\nStep {step_num}: {text}", Colors.BLUE)

class GoogleOAuthAutomation:
    def __init__(self, project_id: str):
        self.project_id = project_id
        self.credentials = None
        self.services = {}
        self.oauth_clients = []
        
    def authenticate(self):
        """Authenticate with Google Cloud"""
        print_step(1, "Authenticating with Google Cloud")
        
        # Try different authentication methods
        creds = None
        
        # Method 1: Use existing gcloud credentials
        try:
            from google.auth import default
            creds, project = default(scopes=[
                'https://www.googleapis.com/auth/cloud-platform',
                'https://www.googleapis.com/auth/cloudplatformprojects',
                'https://www.googleapis.com/auth/service.management',
                'https://www.googleapis.com/auth/servicecontrol',
                'https://www.googleapis.com/auth/serviceusage',
                'https://www.googleapis.com/auth/cloud-identity'
            ])
            if creds:
                print_colored("✓ Using existing gcloud credentials", Colors.GREEN)
                self.credentials = creds
                return True
        except Exception as e:
            print(f"Could not use default credentials: {e}")
        
        # Method 2: Use service account key
        if os.path.exists('service-account-key.json'):
            try:
                creds = service_account.Credentials.from_service_account_file(
                    'service-account-key.json',
                    scopes=[
                        'https://www.googleapis.com/auth/cloud-platform',
                        'https://www.googleapis.com/auth/cloudplatformprojects',
                        'https://www.googleapis.com/auth/service.management',
                        'https://www.googleapis.com/auth/servicecontrol',
                        'https://www.googleapis.com/auth/serviceusage',
                        'https://www.googleapis.com/auth/cloud-identity'
                    ]
                )
                print_colored("✓ Using service account credentials", Colors.GREEN)
                self.credentials = creds
                return True
            except Exception as e:
                print(f"Could not use service account: {e}")
        
        # Method 3: OAuth flow
        print_colored("No existing credentials found. Starting OAuth flow...", Colors.YELLOW)
        return self.oauth_flow()
    
    def oauth_flow(self):
        """Perform OAuth flow for user authentication"""
        SCOPES = [
            'https://www.googleapis.com/auth/cloud-platform',
            'https://www.googleapis.com/auth/cloudplatformprojects',
            'https://www.googleapis.com/auth/service.management',
            'https://www.googleapis.com/auth/servicecontrol',
            'https://www.googleapis.com/auth/serviceusage',
            'https://www.googleapis.com/auth/cloud-identity'
        ]
        
        # Check if we have stored credentials
        if os.path.exists('token.json'):
            try:
                creds = Credentials.from_authorized_user_file('token.json', SCOPES)
                if creds and creds.valid:
                    self.credentials = creds
                    return True
                elif creds and creds.expired and creds.refresh_token:
                    creds.refresh(Request())
                    self.credentials = creds
                    with open('token.json', 'w') as token:
                        token.write(creds.to_json())
                    return True
            except Exception as e:
                print(f"Could not use stored credentials: {e}")
        
        # Try to initiate gcloud auth if not authenticated
        print_colored("Initiating gcloud authentication...", Colors.YELLOW)
        try:
            subprocess.run(['gcloud', 'auth', 'application-default', 'login'], check=True)
            # Try default credentials again
            from google.auth import default
            creds, project = default(scopes=SCOPES)
            if creds:
                self.credentials = creds
                return True
        except Exception as e:
            print(f"gcloud auth failed: {e}")
            
        return False
    
    def initialize_services(self):
        """Initialize Google API services"""
        print_step(2, "Initializing Google API services")
        
        try:
            # Service Usage API for enabling services
            self.services['serviceusage'] = build(
                'serviceusage', 'v1', 
                credentials=self.credentials,
                cache_discovery=False
            )
            
            # IAM Credentials API
            self.services['iamcredentials'] = build(
                'iamcredentials', 'v1',
                credentials=self.credentials,
                cache_discovery=False
            )
            
            # Cloud Resource Manager for project management
            self.services['cloudresourcemanager'] = build(
                'cloudresourcemanager', 'v3',
                credentials=self.credentials,
                cache_discovery=False
            )
            
            # API Keys API
            self.services['apikeys'] = build(
                'apikeys', 'v2',
                credentials=self.credentials,
                cache_discovery=False
            )
            
            # Identity Toolkit API for OAuth configuration
            self.services['identitytoolkit'] = build(
                'identitytoolkit', 'v3',
                credentials=self.credentials,
                cache_discovery=False
            )
            
            print_colored("✓ Services initialized", Colors.GREEN)
            return True
            
        except Exception as e:
            print_colored(f"✗ Failed to initialize services: {e}", Colors.RED)
            return False
    
    def enable_apis(self, apis: List[str]):
        """Enable required APIs"""
        print_step(3, "Enabling required APIs")
        
        service = self.services['serviceusage']
        parent = f'projects/{self.project_id}'
        
        # First, list currently enabled services
        enabled_services = set()
        try:
            request = service.services().list(
                parent=parent,
                filter='state:ENABLED',
                pageSize=200
            )
            while request is not None:
                response = request.execute()
                for svc in response.get('services', []):
                    enabled_services.add(svc['config']['name'])
                request = service.services().list_next(request, response)
        except HttpError as e:
            print(f"  Warning: Could not list services: {e}")
        
        for api in apis:
            if api in enabled_services:
                print(f"  ✓ {api} is already enabled")
                continue
                
            try:
                # Enable the API
                print(f"  Enabling {api}...")
                service_name = f'{parent}/services/{api}'
                operation = service.services().enable(
                    name=service_name,
                    body={}
                ).execute()
                
                # Wait for operation to complete
                self._wait_for_service_operation(operation)
                print_colored(f"  ✓ {api} enabled", Colors.GREEN)
                
            except HttpError as e:
                if 'already enabled' in str(e).lower():
                    print(f"  ✓ {api} is already enabled")
                else:
                    print_colored(f"  ✗ Failed to enable {api}: {e}", Colors.RED)
    
    def list_oauth_clients(self) -> Optional[str]:
        """Try to list existing OAuth clients and extract client ID"""
        print("  Checking for existing OAuth clients...")
        
        # Try using gcloud to list OAuth clients
        try:
            result = subprocess.run(
                ['gcloud', 'alpha', 'iap', 'oauth-clients', 'list', 
                 '--project', self.project_id, '--format=json'],
                capture_output=True, text=True
            )
            
            if result.returncode == 0 and result.stdout:
                clients = json.loads(result.stdout)
                if clients:
                    print(f"  Found {len(clients)} OAuth client(s)")
                    return None
        except Exception as e:
            print(f"  Could not list OAuth clients via gcloud: {e}")
        
        # Check for existing credentials file
        cred_files = [
            'credentials.json',
            'client_secret.json',
            'oauth2_credentials.json',
            os.path.expanduser('~/Downloads/client_secret*.json')
        ]
        
        for pattern in cred_files:
            import glob
            for file in glob.glob(pattern):
                if os.path.exists(file):
                    print(f"  Found credentials file: {file}")
                    try:
                        with open(file, 'r') as f:
                            creds = json.load(f)
                            if 'web' in creds and 'client_id' in creds['web']:
                                client_id = creds['web']['client_id']
                                print_colored(f"  ✓ Found existing OAuth Client ID: {client_id[:30]}...", Colors.GREEN)
                                return client_id
                    except Exception as e:
                        print(f"  Could not read {file}: {e}")
        
        return None
    
    def create_oauth_client(self, name: str, authorized_origins: List[str], redirect_uris: List[str]) -> Tuple[Dict, Optional[str]]:
        """Create or update OAuth 2.0 client"""
        print_step(4, "Managing OAuth 2.0 Configuration")
        
        # First check for existing OAuth clients
        existing_client_id = self.list_oauth_clients()
        
        # Create OAuth consent screen configuration
        consent_config = {
            "displayName": name,
            "supportEmail": "",  # Will be filled by user
            "privacyPolicyUri": "",
            "termsOfServiceUri": "",
            "authorizedDomains": self._extract_domains(authorized_origins)
        }
        
        # Try to configure OAuth consent screen via API
        print("  Checking OAuth consent screen configuration...")
        consent_configured = self._configure_consent_screen(consent_config)
        
        # Generate OAuth client configuration
        oauth_config = {
            "web": {
                "client_id": existing_client_id or "TO_BE_GENERATED",
                "project_id": self.project_id,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
                "client_secret": "TO_BE_GENERATED",
                "redirect_uris": redirect_uris,
                "javascript_origins": authorized_origins
            }
        }
        
        # Save configuration
        with open('oauth-client-config.json', 'w') as f:
            json.dump(oauth_config, f, indent=2)
        
        # Generate gcloud commands for OAuth client creation
        self._generate_oauth_commands(name, authorized_origins, redirect_uris)
        
        if existing_client_id:
            print_colored("✓ Found existing OAuth client", Colors.GREEN)
            print("\n  Note: You may need to update the authorized origins and redirect URIs")
            print(f"  Go to: https://console.cloud.google.com/apis/credentials?project={self.project_id}")
        else:
            print_colored("✓ OAuth configuration prepared", Colors.GREEN)
            
        return oauth_config, existing_client_id
    
    def _extract_domains(self, urls: List[str]) -> List[str]:
        """Extract unique domains from URLs"""
        domains = set()
        for url in urls:
            if url.startswith('http'):
                # Extract domain from URL
                parts = url.split('/')
                if len(parts) >= 3:
                    domain = parts[2]
                    # Remove port if present
                    domain = domain.split(':')[0]
                    # Skip localhost
                    if domain != 'localhost':
                        domains.add(domain)
        return list(domains)
    
    def _configure_consent_screen(self, config: Dict) -> bool:
        """Try to configure OAuth consent screen"""
        try:
            # Note: Direct API configuration is limited
            # Generate configuration file instead
            with open('consent-screen-config.json', 'w') as f:
                json.dump(config, f, indent=2)
            print("  ✓ Consent screen configuration saved")
            return True
        except Exception as e:
            print(f"  Warning: {e}")
            return False
    
    def _generate_oauth_commands(self, name: str, origins: List[str], uris: List[str]):
        """Generate gcloud commands for OAuth setup"""
        commands = []
        
        # Command to create OAuth client
        commands.append(f"# Create OAuth 2.0 Client")
        commands.append(f"# Note: This must be done via Google Cloud Console")
        commands.append(f"# Go to: https://console.cloud.google.com/apis/credentials?project={self.project_id}")
        
        # Save commands to file
        with open('oauth-setup-commands.sh', 'w') as f:
            f.write("#!/bin/bash\n\n")
            f.write(f"# OAuth Setup Commands for {name}\n\n")
            f.write(f"PROJECT_ID={self.project_id}\n\n")
            for cmd in commands:
                f.write(f"{cmd}\n")
            f.write("\n# Authorized JavaScript Origins:\n")
            for origin in origins:
                f.write(f"# - {origin}\n")
            f.write("\n# Authorized Redirect URIs:\n")
            for uri in uris:
                f.write(f"# - {uri}\n")
        
        os.chmod('oauth-setup-commands.sh', 0o755)
    
    def list_existing_api_keys(self) -> List[Dict]:
        """List all existing API keys in the project"""
        try:
            service = self.services['apikeys']
            parent = f"projects/{self.project_id}/locations/global"
            
            request = service.projects().locations().keys().list(parent=parent)
            response = request.execute()
            return response.get('keys', [])
        except Exception as e:
            print(f"  Warning: Could not list API keys: {e}")
            return []
    
    def create_api_key(self, name: str, restrictions: Optional[Dict] = None):
        """Create API key with restrictions"""
        print_step(5, "Managing API Keys")
        
        try:
            service = self.services['apikeys']
            parent = f"projects/{self.project_id}/locations/global"
            
            # First check if we already have API keys
            existing_keys = self.list_existing_api_keys()
                
            if existing_keys:
                print(f"  Found {len(existing_keys)} existing API key(s):")
                for i, key in enumerate(existing_keys):
                    display_name = key.get('displayName', 'Unnamed')
                    key_id = key['name'].split('/')[-1]
                    print(f"    {i+1}. {display_name} (ID: {key_id})")
                
                # Ask user which key to use
                use_existing = input("\n  Use an existing API key? Enter number (or press Enter to create new): ").strip()
                
                if use_existing and use_existing.isdigit():
                    key_index = int(use_existing) - 1
                    if 0 <= key_index < len(existing_keys):
                        selected_key = existing_keys[key_index]
                        key_name = selected_key['name']
                        
                        # Get the key string
                        get_request = service.projects().locations().keys().getKeyString(
                            name=key_name
                        )
                        key_response = get_request.execute()
                        api_key = key_response.get('keyString', '')
                        print_colored(f"  ✓ Using existing API Key: {api_key[:10]}...", Colors.GREEN)
                        return api_key
            
            # Create new API key
            print(f"  Creating new API key...")
            key_body = {
                "displayName": name,
                "restrictions": restrictions or {}
            }
            
            request = service.projects().locations().keys().create(
                parent=parent,
                body=key_body
            )
            
            operation = request.execute()
            
            # Wait for operation to complete
            operation_name = operation.get('name')
            if operation_name:
                final_op = self._wait_for_api_key_operation(operation_name)
                
                if final_op and final_op.get('response'):
                    # Extract key name from operation response
                    key_name = final_op['response'].get('name')
                    if key_name:
                        # Get the key string
                        get_request = service.projects().locations().keys().getKeyString(
                            name=key_name
                        )
                        key_response = get_request.execute()
                        
                        api_key = key_response.get('keyString', '')
                        print_colored(f"  ✓ API Key created: {api_key[:10]}...", Colors.GREEN)
                        return api_key
                
        except HttpError as e:
            error_details = json.loads(e.content.decode()) if e.content else {}
            error_message = error_details.get('error', {}).get('message', str(e))
            
            if 'apikeys.googleapis.com' in error_message:
                print_colored("  ✗ API Keys API not enabled", Colors.YELLOW)
                print("  Enabling apikeys.googleapis.com...")
                self.enable_apis(['apikeys.googleapis.com'])
                print("  Please run the script again")
            else:
                print_colored(f"  ✗ Failed to create API key: {error_message}", Colors.RED)
                print("\n  You can create an API key manually in the Google Cloud Console")
                print(f"  Go to: https://console.cloud.google.com/apis/credentials?project={self.project_id}")
            
        return None
    
    def _wait_for_api_key_operation(self, operation_name: str, timeout: int = 60) -> Optional[Dict]:
        """Wait for API key operation to complete"""
        service = self.services['apikeys']
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                operation = service.operations().get(name=operation_name).execute()
                
                if operation.get('done'):
                    return operation
                
                time.sleep(2)
            except Exception as e:
                print(f"  Warning: Could not check operation status: {e}")
                break
        
        return None
    
    def configure_oauth_consent_screen(self, app_name: str, user_email: str):
        """Configure OAuth consent screen"""
        print_step(6, "Configuring OAuth Consent Screen")
        
        # Note: OAuth consent screen configuration has limited API support
        # We'll generate the configuration
        
        consent_config = {
            "displayName": app_name,
            "supportEmail": user_email,
            "developerEmail": user_email,
            "scopes": [
                "openid",
                "email",
                "profile",
                "https://www.googleapis.com/auth/drive.file"
            ],
            "type": "EXTERNAL"
        }
        
        with open('consent-screen-config.json', 'w') as f:
            json.dump(consent_config, f, indent=2)
        
        print_colored("✓ Consent screen configuration created", Colors.GREEN)
        print("Please configure the consent screen manually in the Google Cloud Console")
        
        return consent_config
    
    def _wait_for_service_operation(self, operation: Dict, timeout: int = 60) -> Optional[Dict]:
        """Wait for a service operation to complete"""
        if not operation.get('name'):
            return operation
            
        service = self.services['serviceusage']
        start_time = time.time()
        
        while time.time() - start_time < timeout:
            try:
                op = service.operations().get(name=operation['name']).execute()
                
                if op.get('done'):
                    if op.get('error'):
                        print(f"  Operation error: {op['error']}")
                    return op
                
                time.sleep(2)
            except Exception as e:
                print(f"  Warning: Could not check operation status: {e}")
                break
        
        return None
    
    def generate_env_files(self, client_id: str, api_key: str, drive_app_id: str = ""):
        """Generate .env files for the application"""
        print_step(7, "Generating Environment Files")
        
        # Create .env.local
        env_local_content = f"""# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID={client_id}
VITE_GOOGLE_API_KEY={api_key}
VITE_GOOGLE_DRIVE_APP_ID={drive_app_id}

# Generated by automate-google-oauth.py on {datetime.now().isoformat()}
"""
        
        with open('.env.local', 'w') as f:
            f.write(env_local_content)
        print("  ✓ Created .env.local")
        
        # Create .env.production
        with open('.env.production', 'w') as f:
            f.write(env_local_content)
        print("  ✓ Created .env.production")
    
    def create_vercel_env_script(self):
        """Create script to set Vercel environment variables"""
        script_content = '''#!/bin/bash
# Vercel Environment Setup Script

echo "Setting up Vercel environment variables..."

# Check if logged in to Vercel
if ! npx vercel whoami &> /dev/null; then
    echo "Please login to Vercel first:"
    npx vercel login
fi

# Load variables from .env.production
if [ -f ".env.production" ]; then
    export $(cat .env.production | grep -v '^#' | xargs)
    
    echo "Setting VITE_GOOGLE_CLIENT_ID..."
    echo "$VITE_GOOGLE_CLIENT_ID" | npx vercel env add VITE_GOOGLE_CLIENT_ID production
    
    echo "Setting VITE_GOOGLE_API_KEY..."
    echo "$VITE_GOOGLE_API_KEY" | npx vercel env add VITE_GOOGLE_API_KEY production
    
    if [ ! -z "$VITE_GOOGLE_DRIVE_APP_ID" ]; then
        echo "Setting VITE_GOOGLE_DRIVE_APP_ID..."
        echo "$VITE_GOOGLE_DRIVE_APP_ID" | npx vercel env add VITE_GOOGLE_DRIVE_APP_ID production
    fi
    
    echo "✓ Environment variables set in Vercel"
else
    echo "Error: .env.production not found"
    exit 1
fi
'''
        
        os.makedirs('scripts', exist_ok=True)
        with open('scripts/setup-vercel-env.sh', 'w') as f:
            f.write(script_content)
        os.chmod('scripts/setup-vercel-env.sh', 0o755)
        print("  ✓ Created scripts/setup-vercel-env.sh")

def main():
    print_colored("=== Google Cloud OAuth Automated Setup ===\n", Colors.HEADER)
    
    # Check for existing project ID
    try:
        result = subprocess.run(['gcloud', 'config', 'get-value', 'project'], 
                              capture_output=True, text=True, check=True)
        default_project = result.stdout.strip()
    except:
        default_project = None
    
    # Get project ID
    if default_project:
        project_id = input(f"Enter your Google Cloud Project ID (default: {default_project}): ").strip()
        if not project_id:
            project_id = default_project
    else:
        project_id = input("Enter your Google Cloud Project ID: ").strip()
        if not project_id:
            print_colored("Project ID is required!", Colors.RED)
            sys.exit(1)
    
    # Get app configuration
    app_name = input("Enter your app name (default: Image Markup App): ").strip() or "Image Markup App"
    vercel_app = input("Enter your Vercel app name (e.g., image-markup-app): ").strip()
    if not vercel_app:
        vercel_app = "image-markup-app"
    
    user_email = input("Enter your email address: ").strip()
    
    # Ask about custom domain
    custom_domain = input("Enter custom domain (optional, press Enter to skip): ").strip()
    
    # Initialize automation
    automation = GoogleOAuthAutomation(project_id)
    
    # Authenticate
    if not automation.authenticate():
        print_colored("Authentication failed!", Colors.RED)
        print("\nPlease ensure you have:")
        print("1. Google Cloud SDK installed")
        print("2. Run 'gcloud auth login' to authenticate")
        print("3. Have necessary permissions in the project")
        sys.exit(1)
    
    # Initialize services
    if not automation.initialize_services():
        print_colored("Failed to initialize services!", Colors.RED)
        sys.exit(1)
    
    # Enable required APIs
    apis_to_enable = [
        'drive.googleapis.com',
        'iamcredentials.googleapis.com',
        'apikeys.googleapis.com',
        'serviceusage.googleapis.com'
    ]
    automation.enable_apis(apis_to_enable)
    
    # Configure OAuth
    authorized_origins = [
        'http://localhost:5173',
        'http://localhost:5174', 
        'http://localhost:4173',
        f'https://{vercel_app}.vercel.app',
        f'https://{vercel_app}-*.vercel.app'
    ]
    
    if custom_domain:
        authorized_origins.extend([
            f'https://{custom_domain}',
            f'https://www.{custom_domain}'
        ])
    
    redirect_uris = authorized_origins.copy()
    
    # Create OAuth client configuration
    oauth_config, existing_client_id = automation.create_oauth_client(
        name=app_name,
        authorized_origins=authorized_origins,
        redirect_uris=redirect_uris
    )
    
    # Create API key
    api_key = automation.create_api_key(
        name=f"{app_name} API Key",
        restrictions={
            "browserKeyRestrictions": {
                "allowedReferrers": authorized_origins
            }
        }
    )
    
    # Configure consent screen
    consent_config = automation.configure_oauth_consent_screen(
        app_name=app_name,
        user_email=user_email
    )
    
    # Check if we have found existing client ID or need user input
    client_id = existing_client_id
    if not client_id:
        client_id = input("\nEnter your OAuth Client ID (if you created it manually): ").strip()
    
    if client_id and api_key:
        # Generate environment files
        automation.generate_env_files(client_id, api_key)
        automation.create_vercel_env_script()
        
        print_colored("\n✓ Environment files created!", Colors.GREEN)
        print("  • .env.local")
        print("  • .env.production")
        print("  • scripts/setup-vercel-env.sh")
    
    # Generate summary
    print_colored("\n=== Setup Summary ===", Colors.HEADER)
    print(f"\nProject ID: {project_id}")
    print(f"App Name: {app_name}")
    print(f"Vercel App: {vercel_app}")
    if custom_domain:
        print(f"Custom Domain: {custom_domain}")
    
    print(f"\nAuthorized Origins:")
    for origin in authorized_origins:
        print(f"  • {origin}")
    
    if api_key:
        print_colored(f"\n✓ API Key created: {api_key}", Colors.GREEN)
    
    # Manual steps guide
    print_colored("\n=== Next Steps ===", Colors.YELLOW)
    
    if not client_id:
        print("\n1. Create OAuth 2.0 Client ID:")
        print(f"   Go to: https://console.cloud.google.com/apis/credentials?project={project_id}")
        print("   • Click '+ CREATE CREDENTIALS' → 'OAuth client ID'")
        print("   • Application type: Web application")
        print(f"   • Name: {app_name}")
        print("   • Add ALL the authorized origins listed above")
        print("   • Add ALL the redirect URIs (same as origins)")
        print("   • Save and copy the Client ID")
        
        print("\n2. After creating the OAuth client, run this script again")
        print("   Or manually create .env files with:")
        print(f"   VITE_GOOGLE_CLIENT_ID=<your-client-id>")
        print(f"   VITE_GOOGLE_API_KEY={api_key}")
    else:
        print("\n1. Deploy to Vercel:")
        print("   npx vercel")
        
        print("\n2. Set Vercel environment variables:")
        print("   ./scripts/setup-vercel-env.sh")
        
        print("\n3. Deploy to production:")
        print("   npx vercel --prod")
    
    print_colored("\n✓ Automated setup complete!", Colors.GREEN)
    print("\nConfiguration files created:")
    print("  • oauth-client-config.json (OAuth configuration)")
    print("  • consent-screen-config.json (consent screen settings)")
    print("  • oauth-setup-commands.sh (manual setup commands)")
    
    if api_key and not client_id:
        print("\nIMPORTANT: Save your API key!")
        print(f"API Key: {api_key}")

if __name__ == "__main__":
    main()