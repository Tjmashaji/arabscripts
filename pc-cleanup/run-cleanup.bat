@echo off
:: يطلب صلاحيات المسؤول ثم يشغل سكربت التنظيف
net session >nul 2>&1
if %errorlevel% neq 0 (
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0clean-c-drive.ps1"
