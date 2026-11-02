# Aedolia — app (React + Vite + Capacitor)

O mesmo código vira o APK (pasta `android/`, pelo Capacitor) e roda no navegador do PC para testes.
Visão geral, comandos e estrutura no [README da raiz](../README.md).

| Comando | O que faz |
|---|---|
| `npm run build` | Compila em `dist/` (usado pelo `Aedolia-PC.bat` e pelo APK) |
| `npm run build:android` | Compila e copia para o projeto Android (o `deploy\build-apk.ps1` chama este) |
| `npm run dev` | Servidor de desenvolvimento com recarga automática (`/local-tts` vai para o ajudante de voz do PC, porta 5180) |
| `npm run lint` | Oxlint |
