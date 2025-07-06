#!/bin/bash

# OAuth Setup Commands for Image Markup App

PROJECT_ID=checks-263811

# Create OAuth 2.0 Client
# Note: This must be done via Google Cloud Console
# Go to: https://console.cloud.google.com/apis/credentials?project=checks-263811

# Authorized JavaScript Origins:
# - http://localhost:5173
# - http://localhost:5174
# - http://localhost:4173
# - https://image-markup-app.vercel.app
# - https://image-markup-app-*.vercel.app

# Authorized Redirect URIs:
# - http://localhost:5173
# - http://localhost:5174
# - http://localhost:4173
# - https://image-markup-app.vercel.app
# - https://image-markup-app-*.vercel.app
