# Start Backend
Start-Process -NoNewWindow -FilePath "py" -ArgumentList "server\main.py"

# Wait a second for backend to spin up
Start-Sleep -Seconds 2

# Start Frontend
npm run dev
