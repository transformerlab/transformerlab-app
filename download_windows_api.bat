@echo off

@rem Determine if WSL is installed and set WSL_HOMEDIR
set WSL_CMD=wsl wslpath -w ~
for /F %%G In ('%WSL_CMD%') do set "WSL_HOMEDIR=%%G"
if %ERRORLEVEL%==1 (
  echo Error accessing WSL home directory.
  echo TransformerLab requires Windows 10 or later with WSL installed.
  EXIT /B 1
)

echo Downloading windows API installer using WSL.
set INSTALLER_URL=https://raw.githubusercontent.com/transformerlab/transformerlab-api/main/install.sh
set INSTALLER_FILENAME=install.sh
call wsl curl %INSTALLER_URL% -o %INSTALLER_FILENAME%
call wsl ./%INSTALLER_FILENAME% download_transformer_lab
echo TransformerLab API download complete. Errorlevel=%ERRORLEVEL%
call wsl rm ./%INSTALLER_FILENAME%
