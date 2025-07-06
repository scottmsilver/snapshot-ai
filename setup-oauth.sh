#!/bin/bash

# Unified Google OAuth Setup Script for Image Markup App
# This single script handles all OAuth setup automatically

# Kill any hanging gcloud processes from previous runs
pkill -f "gcloud alpha iap oauth-brands" 2>/dev/null || true

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
MAGENTA='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

# Configuration
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR"

# Helper functions
print_header() {
    echo -e "\n${MAGENTA}${BOLD}$1${NC}"
    echo -e "${MAGENTA}$(printf '=%.0s' {1..60})${NC}"
}

print_step() {
    echo -e "\n${BLUE}▶ $1${NC}"
}

print_success() {
    echo -e "${GREEN}✓ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠ $1${NC}"
}

print_error() {
    echo -e "${RED}✗ $1${NC}"
}

print_info() {
    echo -e "${CYAN}ℹ $1${NC}"
}

# Check if gcloud auth is valid
check_gcloud_auth() {
    # Quick check if tokens are valid with timeout
    if timeout 5s gcloud auth print-access-token &>/dev/null 2>&1; then
        return 0
    else
        return 1
    fi
}

# Handle project creation errors
handle_project_creation_error() {
    local error_output="$1"
    local project_id="$2"
    
    echo ""
    
    # Parse specific errors
    if echo "$error_output" | grep -q "quota"; then
        echo "You've reached your project quota."
        echo "Free accounts can create up to 12 projects."
        echo ""
        echo "Options:"
        echo "1. Delete unused projects at: https://console.cloud.google.com/cloud-resource-manager"
        echo "2. Use an existing project"
        echo "3. Upgrade your account"
        
    elif echo "$error_output" | grep -q "already exists"; then
        echo "Project ID '$project_id' is already taken."
        echo "Project IDs must be globally unique."
        
    elif echo "$error_output" | grep -q "organization"; then
        echo "Your account is part of an organization that restricts project creation."
        echo "Contact your organization administrator for access."
        
    else
        echo "Error details: $error_output"
    fi
    
    echo ""
    echo "Please create a project manually at:"
    echo "https://console.cloud.google.com/projectcreate"
    echo ""
    read -p "Then enter the project ID: " MANUAL_PROJECT_ID
    PROJECT_ID="$MANUAL_PROJECT_ID"
    
    # Verify the manual project ID
    if ! gcloud projects describe "$PROJECT_ID" &>/dev/null; then
        print_error "Cannot access project: $PROJECT_ID"
        echo "Please ensure the project exists and you have access."
        exit 1
    fi
}

# Check for required tools
check_requirements() {
    local missing_tools=()
    
    if ! command -v python3 &> /dev/null; then
        missing_tools+=("python3")
    fi
    
    if ! command -v gcloud &> /dev/null; then
        missing_tools+=("gcloud")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    if [ ${#missing_tools[@]} -gt 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        echo ""
        echo "Installation instructions:"
        
        if [[ " ${missing_tools[@]} " =~ " gcloud " ]]; then
            echo "  • gcloud: https://cloud.google.com/sdk/docs/install"
            echo ""
            echo "    Quick install (Linux/Mac):"
            echo "    curl https://sdk.cloud.google.com | bash"
            echo "    exec -l \$SHELL"
        fi
        
        if [[ " ${missing_tools[@]} " =~ " jq " ]]; then
            echo "  • jq: JSON processor"
            echo "    Ubuntu/Debian: sudo apt-get install jq"
            echo "    Mac: brew install jq"
            echo "    Other: https://stedolan.github.io/jq/download/"
        fi
        
        if [[ " ${missing_tools[@]} " =~ " python3 " ]]; then
            echo "  • python3: https://www.python.org/downloads/"
        fi
        
        return 1
    fi
    
    # Check gcloud components
    if command -v gcloud &> /dev/null; then
        # Check if gcloud is properly initialized
        if ! gcloud info &>/dev/null 2>&1; then
            print_warning "gcloud is installed but not initialized"
            echo ""
            echo "Initializing gcloud..."
            gcloud init
        fi
        
        # Check for alpha component (needed for API keys)
        if ! gcloud components list --filter="id:alpha state.name:Installed" --format="value(id)" 2>/dev/null | grep -q "alpha"; then
            print_info "Installing gcloud alpha components..."
            gcloud components install alpha --quiet
        fi
    fi
    
    return 0
}

# Main setup flow
main() {
    clear
    echo -e "${CYAN}${BOLD}"
    echo "╔═══════════════════════════════════════════════════════════╗"
    echo "║          Image Markup App - OAuth Setup Wizard            ║"
    echo "╚═══════════════════════════════════════════════════════════╝"
    echo -e "${NC}"
    
    # Check requirements
    print_step "Checking system requirements..."
    if ! check_requirements; then
        exit 1
    fi
    print_success "All requirements met"
    
    # Check for existing .env files (including .env)
    ENV_FILE=""
    if [ -f ".env" ]; then
        ENV_FILE=".env"
    elif [ -f ".env.local" ]; then
        ENV_FILE=".env.local"
    elif [ -f ".env.production" ]; then
        ENV_FILE=".env.production"
    fi
    
    if [ ! -z "$ENV_FILE" ]; then
        print_info "Found existing environment file: $ENV_FILE"
        
        # Check if they're complete
        CLIENT_ID=$(grep "^VITE_GOOGLE_CLIENT_ID=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
        API_KEY=$(grep "^VITE_GOOGLE_API_KEY=" "$ENV_FILE" | cut -d'=' -f2 | tr -d ' ')
        
        if [ ! -z "$CLIENT_ID" ] && [ "$CLIENT_ID" != "YOUR_CLIENT_ID_HERE" ] && \
           [ ! -z "$API_KEY" ] && [ "$API_KEY" != "YOUR_API_KEY_HERE" ]; then
            print_success "OAuth setup appears to be complete!"
            echo ""
            echo "Found credentials:"
            echo "  Client ID: ${CLIENT_ID:0:30}..."
            echo "  API Key: ${API_KEY:0:20}..."
            echo ""
            echo "Options:"
            echo "  1) Deploy to Vercel with existing credentials"
            echo "  2) Reconfigure OAuth setup"
            echo "  3) Exit"
            echo ""
            read -p "Choose an option (1-3): " ENV_OPTION
            
            case $ENV_OPTION in
                1)
                    deploy_to_vercel "$ENV_FILE"
                    exit 0
                    ;;
                2)
                    # Continue with reconfiguration
                    ;;
                3)
                    print_info "Setup complete. Run 'npm run dev' to start the app."
                    exit 0
                    ;;
                *)
                    print_error "Invalid option"
                    exit 1
                    ;;
            esac
        fi
    fi
    
    # Determine setup method
    print_header "Setup Method Selection"
    echo ""
    echo "How would you like to set up Google OAuth?"
    echo ""
    echo "  1) Automatic setup (Recommended)"
    echo "     - Uses Google Cloud APIs"
    echo "     - Finds existing credentials"
    echo "     - Creates new resources as needed"
    echo ""
    echo "  2) Manual setup"
    echo "     - Step-by-step instructions"
    echo "     - For users who prefer manual configuration"
    echo ""
    echo "  3) I already have credentials"
    echo "     - Just need to create .env files"
    echo ""
    
    read -p "Choose an option (1-3): " SETUP_METHOD
    
    case $SETUP_METHOD in
        1)
            automatic_setup
            ;;
        2)
            manual_setup
            ;;
        3)
            credentials_only_setup
            ;;
        *)
            print_error "Invalid option"
            exit 1
            ;;
    esac
}

# Automatic setup using Python script
automatic_setup() {
    print_header "Automatic OAuth Setup"
    
    # First get the project ID
    get_project_id
    
    # Try to find existing OAuth clients first
    print_info "Checking for existing OAuth clients..."
    get_oauth_client_config
    OAUTH_RESULT=$?
    
    if [ $OAUTH_RESULT -eq 0 ] && [ ! -z "$OAUTH_CLIENT_ID" ]; then
        print_success "Found existing OAuth client!"
        
        # We have OAuth client, now just need API key
        print_step "Checking for API keys..."
        
        # Try to get existing API key
        API_KEY=""
        if command -v gcloud &> /dev/null && gcloud alpha 2>&1 | grep -q "Available command groups"; then
            EXISTING_KEYS=$(gcloud alpha services api-keys list --format=json 2>/dev/null || echo "[]")
            KEY_COUNT=$(echo "$EXISTING_KEYS" | jq '. | length' 2>/dev/null || echo "0")
            
            if [ "$KEY_COUNT" -eq 1 ]; then
                KEY_NAME=$(echo "$EXISTING_KEYS" | jq -r '.[0].name' 2>/dev/null)
                API_KEY=$(gcloud alpha services api-keys get-key-string "$KEY_NAME" --format="value(keyString)" 2>/dev/null || echo "")
                if [ ! -z "$API_KEY" ]; then
                    print_success "Using existing API key"
                fi
            elif [ "$KEY_COUNT" -gt 1 ]; then
                print_info "Multiple API keys found. Using Python script for selection..."
            fi
        fi
        
        # If we have both OAuth and API key, create env files
        if [ ! -z "$OAUTH_CLIENT_ID" ] && [ ! -z "$API_KEY" ]; then
            print_step "Creating environment files..."
            
            cat > .env.local << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=$OAUTH_CLIENT_ID
VITE_GOOGLE_API_KEY=$API_KEY
VITE_GOOGLE_DRIVE_APP_ID=

# Generated on $(date)
EOF
            
            cp .env.local .env.production
            
            print_success "Environment files created successfully!"
            deploy_prompt
            return
        fi
    fi
    
    # Fall back to Python script for more complex scenarios
    print_info "Running comprehensive setup..."
    
    # Check for Python dependencies
    print_step "Checking Python dependencies..."
    python3 -c "import google.auth" 2>/dev/null
    if [ $? -ne 0 ]; then
        print_info "Installing required Python packages..."
        pip3 install google-cloud-iam google-auth google-api-python-client google-auth-oauthlib google-auth-httplib2 --quiet
    fi
    
    # Create a temporary input file for the Python script
    cat > .oauth-setup-config << EOF
$PROJECT_ID
Image Markup App
image-markup-app
$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)

${OAUTH_CLIENT_ID:-}
EOF
    
    # Run the automation script with pre-filled inputs
    print_step "Running automated setup..."
    python3 scripts/automate-google-oauth.py < .oauth-setup-config
    
    # Clean up
    rm -f .oauth-setup-config
    
    # Check if setup was successful
    if [ -f ".env.production" ] && [ -f ".env.local" ]; then
        print_success "Environment files created successfully!"
        deploy_prompt
    else
        print_warning "Automatic setup incomplete. Trying alternative method..."
        bash_automatic_setup
    fi
}

# Bash-based automatic setup
bash_automatic_setup() {
    print_header "Alternative Automatic Setup"
    
    # If we don't have PROJECT_ID, get it
    if [ -z "$PROJECT_ID" ]; then
        if [ -f ".project-config" ]; then
            source .project-config
        else
            get_project_id
        fi
    fi
    
    # Create config for bash script
    cat > .gcloud-setup-config << EOF
$PROJECT_ID
Image Markup App
image-markup-app
$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)

EOF
    
    if [ -f "scripts/gcloud-oauth-setup.sh" ]; then
        # Run with pre-filled inputs
        bash scripts/gcloud-oauth-setup.sh < .gcloud-setup-config
        
        # Clean up
        rm -f .gcloud-setup-config
        
        # Check results
        if [ -f ".env.local" ] || [ -f ".env.template" ]; then
            if [ -f ".env.template" ] && [ ! -f ".env.local" ]; then
                cp .env.template .env.local
                cp .env.template .env.production
                print_info "Created .env files from template"
            fi
            deploy_prompt
        fi
    else
        print_error "Setup scripts not found"
        manual_setup
    fi
}

# Get Google Cloud project
get_project_id() {
    print_step "Checking Google Cloud authentication..."
    
    # Check if gcloud is authenticated and tokens are valid
    print_info "Checking authentication status..."
    
    # First do a quick token check
    if ! check_gcloud_auth; then
        NEEDS_AUTH=true
        AUTH_REASON="Token check failed"
    else
        NEEDS_AUTH=false
    fi
    
    # Get active account
    ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
    
    # If quick check passed but no active account, we still need auth
    if [ -z "$ACTIVE_ACCOUNT" ]; then
        NEEDS_AUTH=true
        AUTH_REASON="No active account"
    fi
    
    # If we think auth is OK, do a real API test to be sure
    if [ "$NEEDS_AUTH" = false ]; then
        AUTH_TEST=$(gcloud projects list --limit=1 2>&1)
        AUTH_TEST_CODE=$?
        
        if [ $AUTH_TEST_CODE -ne 0 ]; then
            NEEDS_AUTH=true
            AUTH_REASON="$AUTH_TEST"
        fi
    fi
    
    # Handle authentication if needed
    if [ "$NEEDS_AUTH" = true ]; then
        if echo "$AUTH_REASON" | grep -q "invalid_grant"; then
            print_warning "Authentication tokens have expired"
            echo ""
            echo "Your Google Cloud credentials need to be refreshed."
            
        elif echo "$AUTH_REASON" | grep -q "UNAUTHENTICATED"; then
            print_warning "Not authenticated with Google Cloud"
            echo ""
            echo "You need to login to Google Cloud."
            
        elif [ "$AUTH_REASON" = "No active account" ]; then
            print_warning "No active Google Cloud account found"
            echo ""
            echo "You need to authenticate with Google Cloud first."
            
        elif [ "$AUTH_REASON" = "Token check failed" ]; then
            print_warning "Google Cloud authentication needed"
            echo ""
            echo "Your credentials need to be refreshed."
            
        else
            print_warning "Authentication issue detected"
            echo "Error: $AUTH_REASON"
        fi
        
        echo ""
        read -p "Press Enter to login with gcloud..."
        
        # Check if we should revoke old tokens first
        if echo "$AUTH_REASON" | grep -q "invalid_grant"; then
            print_info "Revoking expired credentials..."
            gcloud auth revoke --all 2>/dev/null || true
        fi
        
        # Force fresh login
        print_info "Opening browser for authentication..."
        if ! gcloud auth login; then
            print_error "Authentication failed"
            echo ""
            echo "Please ensure you:"
            echo "1. Have a Google account"
            echo "2. Complete the browser authentication flow"
            echo "3. Have internet connectivity"
            echo ""
            echo "Try running: gcloud auth login"
            exit 1
        fi
        
        # Verify authentication worked
        ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
        if [ -z "$ACTIVE_ACCOUNT" ]; then
            print_error "Authentication verification failed"
            exit 1
        fi
        
        # Test again to make sure tokens work
        if ! gcloud projects list --limit=1 &>/dev/null; then
            print_error "Authentication succeeded but tokens are still invalid"
            echo ""
            echo "Try running these commands manually:"
            echo "  gcloud auth revoke --all"
            echo "  gcloud auth login"
            exit 1
        fi
    fi
    
    print_success "Authenticated as: $ACTIVE_ACCOUNT"
    
    # Check if user wants to switch accounts
    echo ""
    read -p "Continue with this account? (Y/n): " CONTINUE_ACCOUNT
    if [[ "$CONTINUE_ACCOUNT" =~ ^[Nn]$ ]]; then
        print_info "Switching Google account..."
        
        # List all authenticated accounts
        echo ""
        echo "Currently authenticated accounts:"
        gcloud auth list --format="table(account,status)"
        echo ""
        
        echo "Options:"
        echo "1. Login with a different account"
        echo "2. Switch to another authenticated account"
        echo ""
        read -p "Choose option (1-2): " ACCOUNT_OPTION
        
        if [ "$ACCOUNT_OPTION" = "1" ]; then
            gcloud auth login
        elif [ "$ACCOUNT_OPTION" = "2" ]; then
            read -p "Enter the email of the account to switch to: " SWITCH_ACCOUNT
            gcloud config set account "$SWITCH_ACCOUNT"
        fi
        
        # Verify new account
        ACTIVE_ACCOUNT=$(gcloud auth list --filter=status:ACTIVE --format="value(account)" 2>/dev/null)
        print_success "Now using: $ACTIVE_ACCOUNT"
    fi
    
    # Also ensure application-default credentials exist for APIs
    if ! gcloud auth application-default print-access-token &>/dev/null 2>&1; then
        print_info "Setting up application default credentials..."
        echo ""
        echo "This allows the setup scripts to use Google APIs."
        echo "A browser window will open for authentication."
        echo ""
        read -p "Press Enter to continue..."
        
        if ! gcloud auth application-default login; then
            print_warning "Application default credentials setup skipped"
            echo "Some automation features may not work."
        fi
    fi
    
    print_step "Selecting Google Cloud Project..."
    
    # Get current project
    CURRENT_PROJECT=$(gcloud config get-value project 2>/dev/null)
    
    # List all projects with better error handling
    print_info "Fetching your Google Cloud projects..."
    
    # Capture both stdout and stderr
    PROJECT_LIST_OUTPUT=$(gcloud projects list --format="value(projectId,name)" 2>&1)
    PROJECT_LIST_EXIT_CODE=$?
    
    if [ $PROJECT_LIST_EXIT_CODE -ne 0 ]; then
        # Check specific error conditions
        if echo "$PROJECT_LIST_OUTPUT" | grep -q "PERMISSION_DENIED"; then
            print_error "Permission denied accessing projects"
            echo ""
            echo "Your account ($ACTIVE_ACCOUNT) doesn't have permission to list projects."
            echo ""
            echo "Options:"
            echo "1. Ask your organization admin for 'Project Viewer' role"
            echo "2. Use a different Google account"
            echo "3. Create a project manually and enter its ID"
            echo ""
            
            read -p "Enter a project ID manually (or 'exit' to quit): " MANUAL_PROJECT_ID
            if [ "$MANUAL_PROJECT_ID" = "exit" ]; then
                exit 1
            fi
            
            PROJECT_ID="$MANUAL_PROJECT_ID"
            gcloud config set project "$PROJECT_ID"
            
            # Verify we can access this project
            if ! gcloud projects describe "$PROJECT_ID" &>/dev/null; then
                print_error "Cannot access project: $PROJECT_ID"
                echo "Please ensure the project exists and you have access."
                exit 1
            fi
            
            print_success "Using project: $PROJECT_ID"
            echo "PROJECT_ID=$PROJECT_ID" > .project-config
            return
            
        elif echo "$PROJECT_LIST_OUTPUT" | grep -q "UNAUTHENTICATED"; then
            print_error "Authentication issue"
            echo "Your credentials may have expired. Please run:"
            echo "  gcloud auth login"
            exit 1
            
        elif echo "$PROJECT_LIST_OUTPUT" | grep -q "invalid_grant"; then
            print_error "Token refresh failed"
            echo ""
            echo "Your authentication tokens could not be refreshed."
            echo "This usually happens when credentials are too old."
            echo ""
            echo "Please run:"
            echo "  gcloud auth revoke --all"
            echo "  gcloud auth login"
            exit 1
            
        else
            # Generic error
            print_error "Failed to list projects"
            echo "Error: $PROJECT_LIST_OUTPUT"
            echo ""
            echo "Try running: gcloud projects list"
            exit 1
        fi
    fi
    
    # Parse successful output
    PROJECTS="$PROJECT_LIST_OUTPUT"
    
    if [ -z "$PROJECTS" ]; then
        print_warning "No projects found in your account"
        echo ""
        echo "Let's create your first project!"
        echo ""
        read -p "Enter a name for your new project: " PROJECT_NAME
        
        # Generate a valid project ID
        PROJECT_ID=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr '_' '-' | sed 's/[^a-z0-9-]//g' | cut -c1-30)
        PROJECT_ID="${PROJECT_ID}-$(date +%s | tail -c 5)"
        
        print_info "Creating project: $PROJECT_ID"
        
        CREATE_OUTPUT=$(gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME" 2>&1)
        CREATE_EXIT_CODE=$?
        
        if [ $CREATE_EXIT_CODE -ne 0 ]; then
            print_error "Failed to create project"
            echo ""
            
            # Parse specific errors
            if echo "$CREATE_OUTPUT" | grep -q "quota"; then
                echo "You've reached your project quota."
                echo "Free accounts can create up to 12 projects."
                echo ""
                echo "Options:"
                echo "1. Delete unused projects at: https://console.cloud.google.com/cloud-resource-manager"
                echo "2. Use an existing project"
                echo "3. Upgrade your account"
                
            elif echo "$CREATE_OUTPUT" | grep -q "already exists"; then
                echo "Project ID '$PROJECT_ID' is already taken."
                echo "Project IDs must be globally unique."
                
            elif echo "$CREATE_OUTPUT" | grep -q "organization"; then
                echo "Your account is part of an organization that restricts project creation."
                echo "Contact your organization administrator for access."
                
            else
                echo "Error details: $CREATE_OUTPUT"
            fi
            
            echo ""
            echo "Please create a project manually at:"
            echo "https://console.cloud.google.com/projectcreate"
            echo ""
            read -p "Then enter the project ID: " MANUAL_PROJECT_ID
            PROJECT_ID="$MANUAL_PROJECT_ID"
            
            # Verify the manual project ID
            if ! gcloud projects describe "$PROJECT_ID" &>/dev/null; then
                print_error "Cannot access project: $PROJECT_ID"
                echo "Please ensure the project exists and you have access."
                exit 1
            fi
        fi
        
        # Set as active project
        gcloud config set project "$PROJECT_ID"
        
        print_success "Project created: $PROJECT_ID"
        echo "PROJECT_ID=$PROJECT_ID" > .project-config
        return
    fi
    
    # Try to intelligently select the best project
    print_info "Analyzing projects..."
    
    # Look for projects that might be for this app
    LIKELY_PROJECTS=()
    IMAGE_APP_PROJECT=""
    SNAPSHOT_PROJECT=""
    MARKUP_PROJECT=""
    
    # Create arrays for all projects
    PROJECT_IDS=()
    PROJECT_NAMES=()
    
    while IFS=$'\t' read -r proj_id proj_name; do
        PROJECT_IDS+=("$proj_id")
        PROJECT_NAMES+=("$proj_name")
        
        # Convert to lowercase for matching
        proj_id_lower=$(echo "$proj_id" | tr '[:upper:]' '[:lower:]')
        proj_name_lower=$(echo "$proj_name" | tr '[:upper:]' '[:lower:]')
        
        # Check for likely matches
        if [[ "$proj_id_lower" =~ (image|photo|picture|snapshot|markup|annotate) ]] || \
           [[ "$proj_name_lower" =~ (image|photo|picture|snapshot|markup|annotate) ]]; then
            LIKELY_PROJECTS+=("$proj_id")
            
            # More specific matches
            if [[ "$proj_id_lower" =~ image.*markup ]] || [[ "$proj_name_lower" =~ image.*markup ]]; then
                IMAGE_APP_PROJECT="$proj_id"
            elif [[ "$proj_id_lower" =~ snapshot ]] || [[ "$proj_name_lower" =~ snapshot ]]; then
                SNAPSHOT_PROJECT="$proj_id"
            elif [[ "$proj_id_lower" =~ markup ]] || [[ "$proj_name_lower" =~ markup ]]; then
                MARKUP_PROJECT="$proj_id"
            fi
        fi
    done <<< "$PROJECTS"
    
    # Determine the best default project
    SUGGESTED_PROJECT=""
    SUGGESTION_REASON=""
    
    if [ ! -z "$IMAGE_APP_PROJECT" ]; then
        SUGGESTED_PROJECT="$IMAGE_APP_PROJECT"
        SUGGESTION_REASON="Found 'image markup' project"
    elif [ ! -z "$SNAPSHOT_PROJECT" ]; then
        SUGGESTED_PROJECT="$SNAPSHOT_PROJECT"
        SUGGESTION_REASON="Found 'snapshot' project"
    elif [ ! -z "$MARKUP_PROJECT" ]; then
        SUGGESTED_PROJECT="$MARKUP_PROJECT"
        SUGGESTION_REASON="Found 'markup' project"
    elif [ ${#LIKELY_PROJECTS[@]} -eq 1 ]; then
        SUGGESTED_PROJECT="${LIKELY_PROJECTS[0]}"
        SUGGESTION_REASON="Found image-related project"
    elif [ ! -z "$CURRENT_PROJECT" ]; then
        # Check if current project has Drive API enabled
        if gcloud services list --enabled --filter="name:drive.googleapis.com" --project="$CURRENT_PROJECT" --format="value(name)" 2>/dev/null | grep -q "drive"; then
            SUGGESTED_PROJECT="$CURRENT_PROJECT"
            SUGGESTION_REASON="Current project has Drive API enabled"
        else
            SUGGESTED_PROJECT="$CURRENT_PROJECT"
            SUGGESTION_REASON="Currently active project"
        fi
    fi
    
    # Display smart selection
    echo ""
    if [ ! -z "$SUGGESTED_PROJECT" ]; then
        # Find project name for the suggested project
        SUGGESTED_NAME=""
        for i in "${!PROJECT_IDS[@]}"; do
            if [ "${PROJECT_IDS[$i]}" = "$SUGGESTED_PROJECT" ]; then
                SUGGESTED_NAME="${PROJECT_NAMES[$i]}"
                break
            fi
        done
        
        print_success "Recommended project: $SUGGESTED_PROJECT"
        if [ ! -z "$SUGGESTED_NAME" ]; then
            echo "  Name: $SUGGESTED_NAME"
        fi
        echo "  Reason: $SUGGESTION_REASON"
        echo ""
        
        read -p "Use this project? (Y/n): " USE_SUGGESTED
        if [[ ! "$USE_SUGGESTED" =~ ^[Nn]$ ]]; then
            PROJECT_ID="$SUGGESTED_PROJECT"
            complete_project_setup
        else
            # Show full list if user rejects suggestion
            show_project_list
            complete_project_setup
        fi
    else
        # No suggestion, show full list
        show_project_list
        complete_project_setup
    fi
}

# Function to show project list and handle selection
show_project_list() {
    echo ""
    echo "Your Google Cloud Projects:"
    echo ""
    
    INDEX=1
    for i in "${!PROJECT_IDS[@]}"; do
        proj_id="${PROJECT_IDS[$i]}"
        proj_name="${PROJECT_NAMES[$i]}"
        
        if [ "$proj_id" = "$CURRENT_PROJECT" ]; then
            echo "  $INDEX) $proj_id - $proj_name ${GREEN}(current)${NC}"
        elif [ "$proj_id" = "$SUGGESTED_PROJECT" ]; then
            echo "  $INDEX) $proj_id - $proj_name ${CYAN}(recommended)${NC}"
        else
            echo "  $INDEX) $proj_id - $proj_name"
        fi
        ((INDEX++))
    done
    
    echo "  $INDEX) Create a new project"
    echo ""
    
    # Get selection  
    if [ ! -z "$CURRENT_PROJECT" ]; then
        read -p "Select a project (Enter for current): " SELECTION
        if [ -z "$SELECTION" ]; then
            PROJECT_ID="$CURRENT_PROJECT"
        fi
    else
        read -p "Select a project (1-$INDEX): " SELECTION
    fi
    
    # Handle selection
    if [ "$SELECTION" = "$INDEX" ]; then
        # Create new project
        read -p "Enter a name for your new project: " PROJECT_NAME
        PROJECT_ID=$(echo "$PROJECT_NAME" | tr '[:upper:]' '[:lower:]' | tr ' ' '-' | tr '_' '-' | sed 's/[^a-z0-9-]//g' | cut -c1-30)
        PROJECT_ID="${PROJECT_ID}-$(date +%s | tail -c 5)"
        
        print_info "Creating project: $PROJECT_ID"
        
        CREATE_OUTPUT=$(gcloud projects create "$PROJECT_ID" --name="$PROJECT_NAME" 2>&1)
        CREATE_EXIT_CODE=$?
        
        if [ $CREATE_EXIT_CODE -ne 0 ]; then
            print_error "Failed to create project"
            handle_project_creation_error "$CREATE_OUTPUT" "$PROJECT_ID"
        fi
    else
        # Use selected project
        PROJ_INDEX=$((SELECTION - 1))
        if [ $PROJ_INDEX -ge 0 ] && [ $PROJ_INDEX -lt ${#PROJECT_IDS[@]} ]; then
            PROJECT_ID="${PROJECT_IDS[$PROJ_INDEX]}"
        else
            print_error "Invalid selection"
            show_project_list
            return
        fi
    fi
    
}

# Complete the project setup after selection
complete_project_setup() {
    # Set as active project
    gcloud config set project "$PROJECT_ID"
    print_success "Using project: $PROJECT_ID"
    
    # Check if project has billing enabled
    print_step "Checking billing status..."
    BILLING_ENABLED=$(gcloud beta billing projects describe "$PROJECT_ID" --format="value(billingEnabled)" 2>/dev/null)
    
    if [ "$BILLING_ENABLED" != "True" ]; then
        print_warning "Billing is not enabled for this project"
        echo ""
        echo "Google Cloud APIs require billing to be enabled."
        
        # List billing accounts
        BILLING_ACCOUNTS=$(gcloud beta billing accounts list --format="value(name,displayName)" 2>/dev/null)
        
        if [ ! -z "$BILLING_ACCOUNTS" ]; then
            echo ""
            echo "Available billing accounts:"
            echo ""
            
            ACCOUNT_IDS=()
            ACCOUNT_NAMES=()
            INDEX=1
            
            while IFS=$'\t' read -r account_id account_name; do
                ACCOUNT_IDS+=("$account_id")
                ACCOUNT_NAMES+=("$account_name")
                echo "  $INDEX) $account_name"
                ((INDEX++))
            done <<< "$BILLING_ACCOUNTS"
            
            echo "  $INDEX) Skip billing setup (manual setup required)"
            echo ""
            
            read -p "Select a billing account (1-$INDEX): " BILLING_SELECTION
            
            if [ "$BILLING_SELECTION" != "$INDEX" ] && [ "$BILLING_SELECTION" -ge 1 ] && [ "$BILLING_SELECTION" -lt "$INDEX" ]; then
                BILLING_INDEX=$((BILLING_SELECTION - 1))
                BILLING_ACCOUNT="${ACCOUNT_IDS[$BILLING_INDEX]}"
                
                print_info "Linking billing account..."
                gcloud beta billing projects link "$PROJECT_ID" --billing-account="$BILLING_ACCOUNT"
                print_success "Billing enabled"
            else
                print_warning "Billing setup skipped. You'll need to enable it manually."
                echo "Go to: https://console.cloud.google.com/billing/linkedaccount?project=$PROJECT_ID"
            fi
        else
            print_warning "No billing accounts found"
            echo ""
            echo "You need to:"
            echo "1. Create a billing account at: https://console.cloud.google.com/billing"
            echo "2. Link it to project: $PROJECT_ID"
            echo ""
            read -p "Press Enter to continue without billing (some features may not work)..."
        fi
    else
        print_success "Billing is enabled"
    fi
    
    # Save for later use
    echo "PROJECT_ID=$PROJECT_ID" > .project-config
    
    # Enable required APIs
    enable_required_apis
}

# Enable required Google Cloud APIs
enable_required_apis() {
    print_step "Enabling required Google Cloud APIs..."
    
    REQUIRED_APIS=(
        "drive.googleapis.com"
        "iamcredentials.googleapis.com"
        "apikeys.googleapis.com"
        "serviceusage.googleapis.com"
    )
    
    for API in "${REQUIRED_APIS[@]}"; do
        print_info "Checking $API..."
        
        # Check if already enabled
        if gcloud services list --enabled --filter="name:$API" --format="value(name)" 2>/dev/null | grep -q "$API"; then
            print_success "$API already enabled"
        else
            print_info "Enabling $API..."
            if gcloud services enable "$API" --quiet 2>/dev/null; then
                print_success "$API enabled"
            else
                print_warning "Failed to enable $API (may require billing)"
            fi
        fi
    done
}

# List and select OAuth clients
get_oauth_client_config() {
    print_step "Checking for existing OAuth 2.0 clients..."
    
    # Get project number for later use with timeout
    PROJECT_NUMBER=$(timeout 5s gcloud projects describe "$PROJECT_ID" --format="value(projectNumber)" 2>/dev/null || echo "")
    
    # Focus on the most important part - finding downloaded credentials files
    print_info "Searching for downloaded OAuth credential files..."
    
    FOUND_CLIENTS=()
    CLIENT_CONFIGS=()
    
    # Search in common locations
    SEARCH_PATHS=(
        "."
        "$HOME/Downloads"
        "$HOME/Desktop"
        "$HOME/Documents"
        "./credentials"
        "./.credentials"
    )
    
    for SEARCH_PATH in "${SEARCH_PATHS[@]}"; do
        if [ -d "$SEARCH_PATH" ]; then
            # Find credential files with timeout
            while IFS= read -r -d '' file; do
                if [ -f "$file" ]; then
                    # Check if it's a valid OAuth client file
                    if grep -q '"client_id"' "$file" 2>/dev/null && \
                       (grep -q '"web"' "$file" 2>/dev/null || grep -q '"installed"' "$file" 2>/dev/null); then
                        
                        CLIENT_ID=$(jq -r '.web.client_id // .installed.client_id // empty' "$file" 2>/dev/null)
                        if [ ! -z "$CLIENT_ID" ]; then
                            FOUND_CLIENTS+=("$file")
                            CLIENT_CONFIGS+=("$CLIENT_ID")
                            
                            # Extract project ID from client ID if possible
                            CLIENT_PROJECT=$(echo "$CLIENT_ID" | grep -oE '^[0-9]+-' | sed 's/-$//')
                            if [ "$CLIENT_PROJECT" = "$PROJECT_NUMBER" ]; then
                                print_success "Found OAuth client for current project: ${file##*/}"
                            else
                                print_info "Found OAuth client file: ${file##*/}"
                            fi
                        fi
                    fi
                fi
            done < <(timeout 10s find "$SEARCH_PATH" -maxdepth 2 \( -name "*client*.json" -o -name "*credentials*.json" -o -name "*oauth*.json" \) 2>/dev/null -print0)
        fi
    done
    
    # Note: Direct API access to OAuth clients is not available via public APIs
    # OAuth client management is only available through the Google Cloud Console
    
    # Present options to user
    echo ""
    if [ ${#FOUND_CLIENTS[@]} -gt 0 ]; then
        print_success "Found ${#FOUND_CLIENTS[@]} OAuth client configuration(s)"
        echo ""
        echo "Select an OAuth client to use:"
        echo ""
        
        INDEX=1
        for i in "${!FOUND_CLIENTS[@]}"; do
            file="${FOUND_CLIENTS[$i]}"
            client_id="${CLIENT_CONFIGS[$i]}"
            
            # Get more info from the file
            AUTH_URI=$(jq -r '.web.auth_uri // .installed.auth_uri // empty' "$file" 2>/dev/null)
            JS_ORIGINS=$(jq -r '.web.javascript_origins[]? // empty' "$file" 2>/dev/null | head -3 | tr '\n' ' ')
            
            echo "  $INDEX) ${file##*/}"
            echo "     Client ID: ${client_id:0:50}..."
            if [ ! -z "$JS_ORIGINS" ]; then
                echo "     Origins: $JS_ORIGINS"
            fi
            ((INDEX++))
        done
        
        echo "  $INDEX) Enter credentials manually"
        echo "  $((INDEX+1))) Create new OAuth client"
        echo ""
        
        read -p "Select option (1-$((INDEX+1))): " CLIENT_SELECTION
        
        if [ "$CLIENT_SELECTION" -ge 1 ] && [ "$CLIENT_SELECTION" -le "${#FOUND_CLIENTS[@]}" ]; then
            # Use selected client file
            SELECTED_FILE="${FOUND_CLIENTS[$((CLIENT_SELECTION-1))]}"
            print_success "Using OAuth client from: ${SELECTED_FILE##*/}"
            
            # Extract all needed information
            export OAUTH_CLIENT_ID=$(jq -r '.web.client_id // .installed.client_id // empty' "$SELECTED_FILE" 2>/dev/null)
            export OAUTH_CLIENT_SECRET=$(jq -r '.web.client_secret // .installed.client_secret // empty' "$SELECTED_FILE" 2>/dev/null)
            export OAUTH_AUTH_URI=$(jq -r '.web.auth_uri // .installed.auth_uri // empty' "$SELECTED_FILE" 2>/dev/null)
            export OAUTH_TOKEN_URI=$(jq -r '.web.token_uri // .installed.token_uri // empty' "$SELECTED_FILE" 2>/dev/null)
            export OAUTH_JS_ORIGINS=$(jq -r '.web.javascript_origins[]? // empty' "$SELECTED_FILE" 2>/dev/null)
            export OAUTH_REDIRECT_URIS=$(jq -r '.web.redirect_uris[]? // .installed.redirect_uris[]? // empty' "$SELECTED_FILE" 2>/dev/null)
            
            # Copy the file to project directory
            cp "$SELECTED_FILE" ./oauth-credentials.json
            print_success "OAuth configuration loaded"
            
            return 0
        elif [ "$CLIENT_SELECTION" = "$INDEX" ]; then
            # Manual entry
            return 1
        else
            # Create new
            return 2
        fi
    else
        print_warning "No existing OAuth clients found"
        echo ""
        echo "Options:"
        echo "  1) Enter credentials manually"
        echo "  2) Create new OAuth client in Google Cloud Console"
        echo ""
        
        read -p "Select option (1-2): " NO_CLIENT_OPTION
        
        if [ "$NO_CLIENT_OPTION" = "1" ]; then
            return 1
        else
            return 2
        fi
    fi
}

# Manual setup with instructions
manual_setup() {
    print_header "Manual OAuth Setup"
    
    # Get project using gcloud
    get_project_id
    
    read -p "Enter your Vercel app name (e.g., image-markup-app): " VERCEL_APP
    VERCEL_APP=${VERCEL_APP:-image-markup-app}
    
    # Generate configuration
    print_step "Generating configuration files..."
    
    cat > oauth-setup-guide.md << EOF
# Google OAuth Manual Setup Guide

## 1. Google Cloud Console Setup

### Step 1: Open Google Cloud Console
Go to: https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID

### Step 2: Enable Required APIs
1. Go to "APIs & Services" → "Library"
2. Search and enable:
   - Google Drive API
   - Identity and Access Management (IAM) API

### Step 3: Configure OAuth Consent Screen
1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" user type
3. Fill in:
   - App name: Image Markup App
   - User support email: Your email
   - Developer contact: Your email
4. Add scopes:
   - openid
   - email
   - profile
   - https://www.googleapis.com/auth/drive.file

### Step 4: Create OAuth 2.0 Client ID
1. Go to "APIs & Services" → "Credentials"
2. Click "+ CREATE CREDENTIALS" → "OAuth client ID"
3. Choose "Web application"
4. Name: "Image Markup App"
5. Add Authorized JavaScript origins:
   - http://localhost:5173
   - http://localhost:5174
   - http://localhost:4173
   - https://$VERCEL_APP.vercel.app
   - https://$VERCEL_APP-*.vercel.app
6. Add the same URLs as Authorized redirect URIs
7. Click "Create"
8. Download the credentials JSON file

### Step 5: Create API Key
1. Click "+ CREATE CREDENTIALS" → "API key"
2. Copy the API key
3. (Optional) Click "Restrict key" to add restrictions

## 2. Next Steps
Run this script again and choose option 3 to enter your credentials.
EOF
    
    print_success "Created oauth-setup-guide.md"
    echo ""
    print_info "Opening setup guide..."
    
    # Try to open the guide
    if command -v xdg-open &> /dev/null; then
        xdg-open oauth-setup-guide.md 2>/dev/null
    elif command -v open &> /dev/null; then
        open oauth-setup-guide.md 2>/dev/null
    fi
    
    echo ""
    echo "Follow the instructions in oauth-setup-guide.md"
    echo "Then run this script again and choose option 3."
    echo ""
    read -p "Press Enter to open Google Cloud Console..." 
    
    # Open browser
    URL="https://console.cloud.google.com/apis/credentials?project=$PROJECT_ID"
    if command -v xdg-open &> /dev/null; then
        xdg-open "$URL" 2>/dev/null
    elif command -v open &> /dev/null; then
        open "$URL" 2>/dev/null
    fi
}

# Setup for users with existing credentials
credentials_only_setup() {
    print_header "Configure Existing Credentials"
    
    # Get project ID first (might be embedded in credentials)
    get_project_id
    
    # Try to get OAuth client configuration
    get_oauth_client_config
    OAUTH_RESULT=$?
    
    if [ $OAUTH_RESULT -eq 0 ]; then
        # Successfully loaded OAuth config from existing client
        print_success "OAuth client configuration loaded"
        
        # The variables are already exported by get_oauth_client_config
        if [ -z "$OAUTH_CLIENT_ID" ]; then
            print_error "Failed to extract client ID"
            read -p "Enter OAuth Client ID manually: " OAUTH_CLIENT_ID
        fi
    elif [ $OAUTH_RESULT -eq 1 ]; then
        # Manual entry
        echo ""
        echo "Please enter your OAuth credentials:"
        read -p "OAuth Client ID: " OAUTH_CLIENT_ID
    else
        # Create new - show instructions
        print_info "Opening Google Cloud Console to create OAuth client..."
        echo ""
        echo "Please create an OAuth 2.0 client with these settings:"
        echo ""
        echo "1. Application type: Web application"
        echo "2. Name: Image Markup App"
        echo "3. Authorized JavaScript origins:"
        echo "   - http://localhost:5173"
        echo "   - http://localhost:5174"
        echo "   - http://localhost:4173"
        echo "   - https://your-app.vercel.app"
        echo "4. Authorized redirect URIs: (same as origins)"
        echo ""
        
        # Open browser
        URL="https://console.cloud.google.com/apis/credentials/oauthclient?project=$PROJECT_ID"
        if command -v xdg-open &> /dev/null; then
            xdg-open "$URL" 2>/dev/null &
        elif command -v open &> /dev/null; then
            open "$URL" 2>/dev/null &
        fi
        
        echo "After creating the OAuth client, download the JSON file and run this script again."
        exit 0
    fi
    
    # Try to get existing API key
    print_step "Checking for existing API keys..."
    API_KEY=""
    
    if command -v gcloud &> /dev/null && gcloud alpha 2>&1 | grep -q "Available command groups"; then
        # List existing API keys
        EXISTING_KEYS=$(gcloud alpha services api-keys list --format=json 2>/dev/null || echo "[]")
        KEY_COUNT=$(echo "$EXISTING_KEYS" | jq '. | length' 2>/dev/null || echo "0")
        
        if [ "$KEY_COUNT" -gt 0 ]; then
            print_success "Found $KEY_COUNT API key(s)"
            
            # If only one key, use it automatically
            if [ "$KEY_COUNT" -eq 1 ]; then
                KEY_NAME=$(echo "$EXISTING_KEYS" | jq -r '.[0].name' 2>/dev/null)
                API_KEY=$(gcloud alpha services api-keys get-key-string "$KEY_NAME" --format="value(keyString)" 2>/dev/null || echo "")
                if [ ! -z "$API_KEY" ]; then
                    print_success "Using existing API key: ${API_KEY:0:10}..."
                fi
            else
                # Multiple keys - let user choose
                echo ""
                echo "Multiple API keys found:"
                echo "$EXISTING_KEYS" | jq -r '. | to_entries | .[] | "  \(.key + 1). \(.value.displayName // "Unnamed")"' 2>/dev/null
                
                read -p "Select an API key (1-$KEY_COUNT): " KEY_SELECTION
                KEY_INDEX=$((KEY_SELECTION - 1))
                
                KEY_NAME=$(echo "$EXISTING_KEYS" | jq -r ".[$KEY_INDEX].name" 2>/dev/null)
                if [ ! -z "$KEY_NAME" ] && [ "$KEY_NAME" != "null" ]; then
                    API_KEY=$(gcloud alpha services api-keys get-key-string "$KEY_NAME" --format="value(keyString)" 2>/dev/null || echo "")
                    if [ ! -z "$API_KEY" ]; then
                        print_success "Using API key: ${API_KEY:0:10}..."
                    fi
                fi
            fi
        fi
    fi
    
    # If no API key found, ask for manual input
    if [ -z "$API_KEY" ]; then
        echo ""
        read -p "Google API Key: " API_KEY
    fi
    
    # Get optional Drive App ID
    read -p "Google Drive App ID (optional, press Enter to skip): " DRIVE_APP_ID
    
    # Create environment files
    print_step "Creating environment files..."
    
    cat > .env.local << EOF
# Google OAuth Configuration
VITE_GOOGLE_CLIENT_ID=$OAUTH_CLIENT_ID
VITE_GOOGLE_API_KEY=$API_KEY
VITE_GOOGLE_DRIVE_APP_ID=$DRIVE_APP_ID

# Generated on $(date)
EOF
    
    cp .env.local .env.production
    
    print_success "Created .env.local and .env.production"
    
    deploy_prompt
}

# Deployment prompt
deploy_prompt() {
    print_header "Setup Complete!"
    
    echo ""
    echo "Your OAuth setup is complete. Next steps:"
    echo ""
    echo "  1. Test locally:"
    echo "     ${CYAN}npm run dev${NC}"
    echo ""
    echo "  2. Deploy to Vercel:"
    echo "     ${CYAN}vercel --prod${NC}"
    echo ""
    
    read -p "Would you like to deploy to Vercel now? (y/N): " DEPLOY_NOW
    
    if [[ "$DEPLOY_NOW" =~ ^[Yy]$ ]]; then
        # Check which env file to use
        if [ -f ".env" ]; then
            deploy_to_vercel ".env"
        elif [ -f ".env.production" ]; then
            deploy_to_vercel ".env.production"
        elif [ -f ".env.local" ]; then
            deploy_to_vercel ".env.local"
        else
            print_error "No environment file found!"
        fi
    else
        print_info "You can deploy later with: vercel --prod"
    fi
}

# Vercel deployment
deploy_to_vercel() {
    print_header "Deploying to Vercel"
    
    # Use provided env file or default to .env.production
    local ENV_FILE="${1:-.env.production}"
    
    # If no env file exists, check for .env
    if [ ! -f "$ENV_FILE" ] && [ -f ".env" ]; then
        ENV_FILE=".env"
    fi
    
    if [ ! -f "$ENV_FILE" ]; then
        print_error "No environment file found!"
        return 1
    fi
    
    print_info "Using environment file: $ENV_FILE"
    
    # Check if Vercel CLI is installed
    if ! command -v vercel &> /dev/null; then
        print_info "Installing Vercel CLI..."
        npm i -g vercel
    fi
    
    # Check Vercel auth
    print_step "Checking Vercel authentication..."
    if ! vercel whoami &> /dev/null; then
        print_info "Please login to Vercel:"
        vercel login
    fi
    
    # Link project if not already linked
    if [ ! -f ".vercel/project.json" ]; then
        print_step "Linking to Vercel project..."
        vercel link
    fi
    
    # Extract environment variables
    print_step "Setting environment variables in Vercel..."
    
    # Function to safely extract env value
    get_env_value() {
        local key=$1
        local value=$(grep "^$key=" "$ENV_FILE" | cut -d'=' -f2- | tr -d '"' | tr -d "'")
        echo "$value"
    }
    
    # Get values
    CLIENT_ID=$(get_env_value "VITE_GOOGLE_CLIENT_ID")
    API_KEY=$(get_env_value "VITE_GOOGLE_API_KEY")
    DRIVE_APP_ID=$(get_env_value "VITE_GOOGLE_DRIVE_APP_ID")
    
    # Set environment variables for all environments
    if [ ! -z "$CLIENT_ID" ]; then
        print_info "Setting VITE_GOOGLE_CLIENT_ID..."
        echo "$CLIENT_ID" | vercel env add VITE_GOOGLE_CLIENT_ID production --force
        echo "$CLIENT_ID" | vercel env add VITE_GOOGLE_CLIENT_ID preview --force
        echo "$CLIENT_ID" | vercel env add VITE_GOOGLE_CLIENT_ID development --force
    fi
    
    if [ ! -z "$API_KEY" ]; then
        print_info "Setting VITE_GOOGLE_API_KEY..."
        echo "$API_KEY" | vercel env add VITE_GOOGLE_API_KEY production --force
        echo "$API_KEY" | vercel env add VITE_GOOGLE_API_KEY preview --force
        echo "$API_KEY" | vercel env add VITE_GOOGLE_API_KEY development --force
    fi
    
    if [ ! -z "$DRIVE_APP_ID" ]; then
        print_info "Setting VITE_GOOGLE_DRIVE_APP_ID..."
        echo "$DRIVE_APP_ID" | vercel env add VITE_GOOGLE_DRIVE_APP_ID production --force
        echo "$DRIVE_APP_ID" | vercel env add VITE_GOOGLE_DRIVE_APP_ID preview --force
        echo "$DRIVE_APP_ID" | vercel env add VITE_GOOGLE_DRIVE_APP_ID development --force
    fi
    
    print_success "Environment variables set!"
    
    # Deploy to production
    print_step "Deploying to production..."
    vercel --prod
    
    print_success "Deployment complete!"
    echo ""
    echo "Your app is now live on Vercel!"
    echo ""
    
    # Get the production URL
    PROD_URL=$(vercel ls --json 2>/dev/null | jq -r '.[0].url' 2>/dev/null || echo "your-app.vercel.app")
    
    print_warning "Remember to add your Vercel URLs to Google OAuth:"
    echo "  • https://$PROD_URL"
    echo "  • https://${PROD_URL%.vercel.app}-*.vercel.app"
    echo ""
    echo "Add these URLs to:"
    echo "https://console.cloud.google.com/apis/credentials?project=${PROJECT_ID:-your-project}"
}

# Run main function
main "$@"