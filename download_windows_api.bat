@echo off

echo Downloading windows API installer
set INSTALLER_URL=https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/install_windows.bat
call curl %INSTALLER_URL% -o install_windows.bat
call install_windows.bat download_transformer_lab
echo TransformerLab API download complete. Errorlevel=%ERRORLEVEL%

@rem Clean up
del install_windows.bat
