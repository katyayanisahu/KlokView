@echo off
REM TrackFlow dev launcher — opens backend + frontend in their own windows.
REM Postgres service auto-starts on boot, so it's already running.

echo Starting TrackFlow dev servers...

start "TrackFlow Backend" cmd /k "cd /d %~dp0backend && venv\Scripts\activate && python manage.py runserver 8000"
start "TrackFlow Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"

echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Two terminal windows just opened. Close them to stop the servers.
pause
