@echo off
setlocal
rem Antoine launcher. Lives on PATH so `antoine` works from any directory.
rem Override the checkout location with:  set ANTOINE_REPO=D:\path\to\antoine
if not defined ANTOINE_REPO set "ANTOINE_REPO=C:\Users\iamva\dexter"
if not defined ANTOINE_VPS  set "ANTOINE_VPS=openclaw@100.107.141.83"

if not exist "%ANTOINE_REPO%\package.json" (
  echo [antoine] No checkout at "%ANTOINE_REPO%".
  echo [antoine] Set ANTOINE_REPO to the repository path and try again.
  exit /b 1
)

rem Pin the state directory to the checkout so memory, portfolio, scores and
rem cron jobs are the same set no matter which directory you launch from.
if not defined ANTOINE_HOME set "ANTOINE_HOME=%ANTOINE_REPO%\.antoine"

pushd "%ANTOINE_REPO%"

if /i "%~1"=="gateway" (
  rem Telegram + scheduled reviews. Normally the VPS owns this; running it here
  rem too would make two processes poll the same bot token and fight over updates.
  shift
  call bun run gateway %1 %2 %3 %4 %5 %6 %7 %8 %9
  goto :done
)
if /i "%~1"=="health" (
  call bun run health
  goto :done
)
if /i "%~1"=="test" (
  call bun test
  goto :done
)
if /i "%~1"=="pull" (
  rem The VPS is authoritative: Telegram conversations and the scheduled reviews
  rem all write there. This copies its memory and score ledger down so the local
  rem CLI sees the same history instead of a second, diverging brain.
  echo [antoine] pulling memory + scores from %ANTOINE_VPS%
  scp -q "%ANTOINE_VPS%:~/.antoine/memory/MEMORY.md" "%ANTOINE_HOME%\memory\MEMORY.md"
  rem No trailing backslash before the closing quote - cmd treats it as an escape
  rem and scp receives a mangled destination path.
  scp -qr "%ANTOINE_VPS%:~/.antoine/scores" "%ANTOINE_HOME%"
  echo [antoine] done
  goto :done
)
if /i "%~1"=="push" (
  echo [antoine] pushing local memory to %ANTOINE_VPS%
  scp -q "%ANTOINE_HOME%\memory\MEMORY.md" "%ANTOINE_VPS%:~/.antoine/memory/MEMORY.md"
  echo [antoine] done - restart the gateway there if it should pick it up now
  goto :done
)
if /i "%~1"=="vps" (
  rem Service control on the box that actually runs 24/7.
  ssh %ANTOINE_VPS% "systemctl --user %2 antoine-gateway; systemctl --user is-active antoine-gateway"
  goto :done
)
if /i "%~1"=="logs" (
  ssh %ANTOINE_VPS% "tail -n 40 ~/.antoine/gateway.log"
  goto :done
)

call bun run src/index.tsx %*

:done
set "EXITCODE=%ERRORLEVEL%"
popd
exit /b %EXITCODE%
