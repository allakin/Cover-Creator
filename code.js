figma.showUI(__html__, {
  width: 520,
  height: 950,
  title: 'Cover Creator'
});

figma.ui.onmessage = async (msg) => {
  if (msg.type === 'create-cover') {
    try {
      const { format, imageBase64, text, textPosition, fontSize, fontWeight, textColor, textShadow, keepFrame } = msg;

      const dimensions = {
        '16:9': { width: 1920, height: 1080 },
        '4:3':  { width: 1600, height: 1200 }
      };

      const { width, height } = dimensions[format] || dimensions['16:9'];

      // Create frame
      const frame = figma.createFrame();
      frame.resize(width, height);
      frame.name = `Cover ${format}`;
      frame.clipsContent = true;
      frame.x = figma.viewport.center.x - width / 2;
      frame.y = figma.viewport.center.y - height / 2;

      // Background image — декодируем base64 → Uint8Array (atob недоступен в Figma sandbox)
      if (imageBase64) {
        const bytes = base64ToUint8Array(imageBase64);
        const image = figma.createImage(bytes);
        frame.fills = [{
          type: 'IMAGE',
          imageHash: image.hash,
          scaleMode: 'FILL'
        }];
      } else {
        frame.fills = [{ type: 'SOLID', color: { r: 0.08, g: 0.08, b: 0.1 } }];
      }

      // Text layer
      if (text && text.trim().length > 0) {
        await addTextToFrame(frame, text, textPosition, fontSize, fontWeight, textColor, textShadow);
      }

      figma.currentPage.appendChild(frame);

      // Export PNG
      const exportBytes = await frame.exportAsync({
        format: 'PNG',
        constraint: { type: 'SCALE', value: 1 }
      });

      if (!keepFrame) {
        frame.remove();
      } else {
        figma.viewport.scrollAndZoomIntoView([frame]);
        figma.currentPage.selection = [frame];
      }

      figma.ui.postMessage({
        type: 'export-result',
        bytes: Array.from(exportBytes),
        format
      });

    } catch (err) {
      figma.ui.postMessage({ type: 'error', message: err.message });
    }
  }

  if (msg.type === 'get-selection') {
    try {
      const sel = figma.currentPage.selection;
      if (!sel || sel.length === 0) {
        figma.ui.postMessage({ type: 'selection-error', message: 'Выделите фрейм на холсте' });
        return;
      }
      const node = sel[0];
      if (!('exportAsync' in node)) {
        figma.ui.postMessage({ type: 'selection-error', message: 'Выделенный элемент нельзя экспортировать' });
        return;
      }

      const bytes = await node.exportAsync({ format: 'PNG', constraint: { type: 'SCALE', value: 2 } });

      // Кодируем в base64 вручную (atob/btoa недоступны в sandbox)
      const CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
      let result = '';
      const len = bytes.length;
      for (let i = 0; i < len; i += 3) {
        const a = bytes[i];
        const b = i + 1 < len ? bytes[i + 1] : 0;
        const c = i + 2 < len ? bytes[i + 2] : 0;
        result += CHARS[a >> 2];
        result += CHARS[((a & 3) << 4) | (b >> 4)];
        result += i + 1 < len ? CHARS[((b & 0xf) << 2) | (c >> 6)] : '=';
        result += i + 2 < len ? CHARS[c & 0x3f] : '=';
      }

      figma.ui.postMessage({
        type: 'selection-result',
        base64: result,
        name: node.name,
        width: Math.round(node.width),
        height: Math.round(node.height)
      });
    } catch (err) {
      figma.ui.postMessage({ type: 'selection-error', message: err.message });
    }
  }

  if (msg.type === 'cancel') {
    figma.closePlugin();
  }
};

async function addTextToFrame(frame, text, position, fontSize, fontWeight, textColor, textShadow) {
  const style = fontWeight || 'Bold'; // Regular | Medium | Bold
  try {
    await figma.loadFontAsync({ family: 'Inter', style });
  } catch (e) {
    await figma.loadFontAsync({ family: 'Roboto', style });
  }

  const textNode = figma.createText();
  textNode.fontName = { family: 'Inter', style };
  textNode.fontSize = fontSize;
  textNode.fills = [{ type: 'SOLID', color: hexToRgb(textColor) }];

  // Optional drop shadow for readability
  if (textShadow) {
    textNode.effects = [{
      type: 'DROP_SHADOW',
      color: { r: 0, g: 0, b: 0, a: 0.75 },
      offset: { x: 0, y: 2 },
      radius: 12,
      spread: 0,
      visible: true,
      blendMode: 'NORMAL'
    }];
  }

  // Padding relative to frame size
  const padding = Math.round(frame.width * 0.06);
  const textWidth = frame.width - padding * 2;

  textNode.textAutoResize = 'HEIGHT';
  textNode.resize(textWidth, 100);
  textNode.characters = text;

  // Horizontal alignment from position string (e.g. "top-left" → "left")
  const parts = position.split('-');
  const vPos = parts[0]; // top | middle | bottom
  const hPos = parts[1] || 'center'; // left | center | right

  const hAlignMap = { left: 'LEFT', center: 'CENTER', right: 'RIGHT' };
  textNode.textAlignHorizontal = hAlignMap[hPos] || 'CENTER';

  frame.appendChild(textNode);

  // X is always padding; alignment handles horizontal placement within the text box
  textNode.x = padding;

  const textHeight = textNode.height;

  if (vPos === 'top') {
    textNode.y = padding;
  } else if (vPos === 'middle') {
    textNode.y = Math.round((frame.height - textHeight) / 2);
  } else {
    textNode.y = frame.height - textHeight - padding;
  }
}

function hexToRgb(hex) {
  const clean = (hex || '#ffffff').replace('#', '');
  const n = parseInt(clean, 16);
  return {
    r: ((n >> 16) & 255) / 255,
    g: ((n >> 8)  & 255) / 255,
    b: (n & 255) / 255
  };
}

// atob() недоступен в Figma sandbox — ручное декодирование base64
function base64ToUint8Array(base64) {
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const lookup = new Uint8Array(256);
  for (let i = 0; i < table.length; i++) lookup[table.charCodeAt(i)] = i;

  const s = base64.replace(/=+$/, '');
  const len = s.length;
  const outLen = Math.floor(len * 3 / 4);
  const out = new Uint8Array(outLen);
  let pos = 0;

  for (let i = 0; i < len; i += 4) {
    const a = lookup[s.charCodeAt(i)];
    const b = lookup[s.charCodeAt(i + 1)];
    const c = lookup[s.charCodeAt(i + 2)];
    const d = lookup[s.charCodeAt(i + 3)];
    out[pos++] = (a << 2) | (b >> 4);
    if (pos < outLen) out[pos++] = ((b & 0xf) << 4) | (c >> 2);
    if (pos < outLen) out[pos++] = ((c & 0x3) << 6) | d;
  }

  return out;
}
