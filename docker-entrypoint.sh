#!/bin/bash
set -e

# Run drizzle migrations/push
npm run db:push -- --config drizzle.config.ts

# Execute the main command
exec "$@"
