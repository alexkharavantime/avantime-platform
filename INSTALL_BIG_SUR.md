# Установка на macOS Big Sur 11

Версия 1.5 закрепляет `esbuild` на версии `0.26.0`. Начиная с esbuild 0.27 требуется macOS 12 или новее, поэтому более новые версии не запускаются на macOS Big Sur 11.

## Чистая установка

Откройте Терминал и выполните:

```bash
cd /Users/AlexKhar/avantime-platform
rm -rf node_modules package-lock.json
npm cache clean --force
npm install --no-audit --no-fund
npm run dev
```

После запуска откройте:

```text
http://localhost:3000
```

## Проверка совместимости

```bash
npm ls esbuild
```

В дереве зависимостей должна использоваться версия `esbuild@0.26.0`.
