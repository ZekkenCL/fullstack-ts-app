#!/bin/bash

# Navigate to the frontend directory and start the development server
cd frontend
pnpm dev &

# Navigate to the backend directory and start the development server
cd ../backend
pnpm start &

# Wait for both servers to start
wait
