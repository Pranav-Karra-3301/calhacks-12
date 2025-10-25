#!/bin/bash

# Deploy all Supabase Edge Functions
# Usage: ./deploy-functions.sh

echo "Deploying Supabase Edge Functions..."

# List of functions to deploy
functions=(
  "create-room"
  "join-room"
  "assign-roles"
  "activate-ai"
  "detector-guess"
  "start-clone-jobs"
  "end-room-if-timeout"
  "transcribe-chunk"
)

# Deploy each function
for func in "${functions[@]}"; do
  echo "Deploying $func..."
  supabase functions deploy "$func"
  if [ $? -eq 0 ]; then
    echo "✓ $func deployed successfully"
  else
    echo "✗ Failed to deploy $func"
  fi
  echo ""
done

echo "Deployment complete!"

