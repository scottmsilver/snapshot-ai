#!/bin/bash

# Replace YOUR_USERNAME with your GitHub username
# Replace REPO_NAME with your repository name if different from image-markup-app

echo "Setting up GitHub remote..."

# Add the remote origin
git remote add origin https://github.com/YOUR_USERNAME/image-markup-app.git

# Rename branch to main if needed
git branch -M main

# Push to GitHub
echo "Pushing to GitHub..."
git push -u origin main

echo "Done! Your repository is now on GitHub."
echo "Visit: https://github.com/YOUR_USERNAME/image-markup-app"