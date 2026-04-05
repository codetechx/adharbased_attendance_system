@echo off
title AMS - Stopping Services
echo  Stopping AMS services...
docker compose down
echo  All services stopped.
pause
