@echo off
rem Abre o Aedolia no navegador deste PC, com as mesmas vozes do celular (para testar).
rem Feche esta janela para parar. Detalhes em deploy\rodar-no-pc.ps1 e doc\memoria\pc.md.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "deploy\rodar-no-pc.ps1" %*
pause
