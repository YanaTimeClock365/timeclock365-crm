@echo off
cd /d D:\timeclock365-marketing\email-server
pm2 delete timeclock-email 2>nul
pm2 start server.js --name timeclock-email
pm2 save
