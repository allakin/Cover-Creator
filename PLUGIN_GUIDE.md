# Cover Creator — Figma Plugin

## Что это
Плагин для Figma Desktop, позволяющий создавать обложки с фоновым изображением и текстом. Пользователь настраивает параметры в UI плагина, видит предпросмотр и скачивает результат как PNG.

## Структура проекта

| Файл | Назначение |
|------|-----------|
| `manifest.json` | Манифест плагина Figma (id, точки входа, тип редактора) |
| `code.js` | Sandbox-код — работает в изолированной среде Figma (создание фреймов, экспорт, работа с выделением). Здесь **нет** `atob`/`btoa`, `fetch`, DOM, `window`. |
| `ui.html` | Интерфейс плагина (HTML + CSS + JS в одном файле) — работает в iframe внутри Figma. Отвечает за все визуальные элементы, предпросмотр через Canvas и экспорт PNG. |

## Архитектура

- **UI → Sandbox**: общение через `parent.postMessage({ pluginMessage: {...} }, '*')` из ui.html и `figma.ui.onmessage` в code.js.
- **Sandbox → UI**: через `figma.ui.postMessage({...})` и `window.onmessage` в ui.html.
- **Экспорт PNG**: рендерится напрямую через offscreen Canvas в UI (функция `renderFullSize`), минуя sandbox. Sandbox используется только для создания фрейма в Figma (чекбокс «Оставить фрейм»).
- **Передача изображений**: из UI в sandbox передаётся base64-строка. В sandbox декодируется вручную (функция `base64ToUint8Array`), так как `atob` недоступен.
- **Предпросмотр**: фоновое изображение кэшируется в `_cachedBgImg` / `_cachedBgUrl`, перерисовка всегда синхронная (без race condition).

## Шаги интерфейса (UI)

1. **Фоновое изображение** — два режима: загрузка файла (PNG, JPG, GIF) или захват выделенного фрейма из Figma.
2. **Формат обложки** — 16:9 (1920×1080), 4:3 (1600×1200), «Как у фона» (размер фонового изображения, активируется при загрузке фона).
3. **Текст обложки** — textarea + параметры:
   - Размер шрифта (px) — range 24–200, дефолт 80
   - Интерлиньяж — range 0.8–3.0, дефолт 1.25
   - Толщина — Regular / Medium / Bold, дефолт Bold
   - Цвет текста — color picker + 7 быстрых свотчей, дефолт #ffffff
   - Тень текста — toggle, дефолт выключена
4. **Позиция текста** — сетка 3×3 (9 позиций), дефолт middle-center.
5. **Скругление углов** — range 0–100px, дефолт 0.
6. **Предпросмотр** — live Canvas, отражает все параметры в реальном времени.

## State (ui.html)

```javascript
state = {
  format: '16:9',           // '16:9' | '4:3' | 'original'
  imageBase64: null,         // base64-строка фона
  imageDataUrl: null,        // data: URL для canvas-превью
  text: '',
  fontSize: 80,
  lineHeight: 1.25,
  fontWeight: 'Bold',        // 'Regular' | 'Medium' | 'Bold'
  textColor: '#ffffff',
  textPosition: 'middle-center',
  textShadow: false,
  borderRadius: 0,
  busy: false
}
```

## Ключевые правила при изменении кода

### Sandbox (code.js)
- **Нет браузерных API**: `atob`, `btoa`, `fetch`, `document`, `window` — недоступны. Для base64 используй `base64ToUint8Array`.
- Шрифты нужно загружать через `figma.loadFontAsync({ family, style })` перед использованием.
- `figma.createImage(Uint8Array)` — синхронный, принимает байты PNG/JPG/GIF.

### UI (ui.html)
- Всё в одном файле: HTML, CSS, JS. Не разносить по отдельным файлам.
- Предпросмотр — Canvas. Фон кэшируется (`_cachedBgImg`), отрисовка синхронная.
- Скачивание PNG — через `renderFullSize()` (offscreen canvas полного разрешения), не через sandbox.
- Передача данных в sandbox — только через `parent.postMessage({ pluginMessage: {...} }, '*')`.
- range-инпуты синхронизированы с текстовыми полями (двусторонняя связь).

### Общее
- Плагин, не виджет. Импортируется через Plugins → Development → Import plugin from manifest.
- `manifest.json` не должен содержать `containsWidget`.
- Окно плагина: 520×950px.
- Интерфейс на русском языке.
- Тёмная тема (CSS-переменные в `:root`).
- Отступ между шагами: 32px. Отступ от заголовка шага до содержимого: 12px. Отступ между параметрами внутри шага 3: 16px.
- Label'ы параметров выровнены: `min-width: 120px`.
