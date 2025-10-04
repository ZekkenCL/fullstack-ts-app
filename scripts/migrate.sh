#!/bin/bash

# This script is used to run database migrations using Prisma.

# Navigate to the backend directory
cd ../backend

# Run the Prisma migrate command
npx prisma migrate deploy

# Optionally, you can add additional commands here to seed the database or perform other tasks
# npx prisma db seed

echo "Database migrations completed."