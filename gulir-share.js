const WIDTH = 1080;
const HEIGHT = 1920;
const BODY_TOP = 356;
const BODY_HEIGHT = 1220;
const THEMES = {
  forest: { bg: '#10241e', bg2: '#1c4032', panel: '#17362b', ink: '#f5f0e3', muted: '#b8c8ba', accent: '#d4b879', border: '#52705d' },
  paper: { bg: '#f4efe4', bg2: '#e5eadf', panel: '#fffdf7', ink: '#233c31', muted: '#68786e', accent: '#9b7045', border: '#d2d7ca' },
  dusk: { bg: '#1d2033', bg2: '#35304a', panel: '#292a41', ink: '#f6eee1', muted: '#c4bbcd', accent: '#e0bb91', border: '#5f5870' },
};

function setFont(ctx, size, family, weight = 400) {
  ctx.font = `${weight} ${size}px ${family}`;
}

function breakLongWord(ctx, word, width) {
  const pieces = [];
  let piece = '';
  for (const char of Array.from(word)) {
    const next = piece + char;
    if (piece && ctx.measureText(next).width > width) {
      pieces.push(piece);
      piece = char;
    } else piece = next;
  }
  if (piece) pieces.push(piece);
  return pieces;
}

function wrapText(ctx, text, width) {
  const words = String(text || '').trim().split(/\s+/u).filter(Boolean);
  if (!words.length) return [''];
  const lines = [];
  let line = '';
  for (const raw of words) {
    const pieces = ctx.measureText(raw).width > width ? breakLongWord(ctx, raw, width) : [raw];
    for (const word of pieces) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function makeSections(ctx, verse, includeLatin, sizes) {
  const sections = [
    { key: 'arabic', label: 'AYAT AL-QUR’AN', text: verse.arabic, size: sizes.arabic, lineHeight: sizes.arabic * 1.78, family: '"Amiri Quran", "Noto Naskh Arabic", serif', direction: 'rtl', color: 'ink', weight: 400 },
  ];
  if (includeLatin && verse.latin) sections.push({ key: 'latin', label: 'TRANSLITERASI', text: verse.latin, size: sizes.latin, lineHeight: sizes.latin * 1.52, family: 'system-ui, sans-serif', direction: 'ltr', color: 'muted', weight: 400 });
  sections.push({ key: 'translation', label: 'TERJEMAHAN INDONESIA', text: verse.translation, size: sizes.translation, lineHeight: sizes.translation * 1.56, family: 'Georgia, "Times New Roman", serif', direction: 'ltr', color: 'ink', weight: 400 });
  for (const section of sections) {
    setFont(ctx, section.size, section.family, section.weight);
    section.lines = wrapText(ctx, section.text, 850);
    section.labelHeight = 34;
    section.gap = 22;
  }
  return sections;
}

function contentHeight(sections) {
  return sections.reduce((sum, section, i) => sum + section.labelHeight + section.lines.length * section.lineHeight + (i ? section.gap : 0), 0);
}

function paginate(sections) {
  const pages = [];
  let page = { sections: [], height: 0 };
  const newPage = () => {
    if (page.sections.length) pages.push(page);
    page = { sections: [], height: 0 };
  };
  for (const section of sections) {
    let offset = 0;
    while (offset < section.lines.length) {
      const gap = page.sections.length ? section.gap : 0;
      const labelHeight = section.labelHeight;
      const firstLineHeight = section.lineHeight;
      if (page.height + gap + labelHeight + firstLineHeight > BODY_HEIGHT && page.sections.length) newPage();
      const localGap = page.sections.length ? section.gap : 0;
      const room = BODY_HEIGHT - page.height - localGap - labelHeight;
      const count = Math.min(section.lines.length - offset, Math.floor(room / section.lineHeight));
      if (count < 1) {
        newPage();
        continue;
      }
      const lines = section.lines.slice(offset, offset + count);
      page.sections.push({ ...section, lines, gapBefore: localGap });
      page.height += localGap + labelHeight + lines.length * section.lineHeight;
      offset += count;
      if (offset < section.lines.length) newPage();
    }
  }
  if (page.sections.length) pages.push(page);
  return pages;
}

function drawBackground(ctx, palette, pageNo, pageCount, reference, surahName) {
  const gradient = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  gradient.addColorStop(0, palette.bg);
  gradient.addColorStop(1, palette.bg2);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  ctx.globalAlpha = 0.08;
  ctx.fillStyle = palette.accent;
  ctx.beginPath(); ctx.arc(940, 110, 210, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(110, 1780, 245, 0, Math.PI * 2); ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = `${palette.accent}66`;
  ctx.lineWidth = 2;
  roundedRect(ctx, 38, 38, WIDTH - 76, HEIGHT - 76, 38);
  ctx.stroke();

  ctx.fillStyle = palette.accent;
  ctx.fillRect(92, 112, 44, 4);
  ctx.fillRect(WIDTH - 136, 112, 44, 4);
  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  setFont(ctx, 23, 'system-ui, sans-serif', 700);
  ctx.fillStyle = palette.ink;
  ctx.fillText('QURAN OYEN', WIDTH / 2, 125);
  setFont(ctx, 15, 'system-ui, sans-serif', 600);
  ctx.fillStyle = palette.muted;
  ctx.fillText('GULIR AYAT  ·  SATU AYAT, SATU JEDA', WIDTH / 2, 166);

  roundedRect(ctx, 88, 218, WIDTH - 176, 66, 33);
  ctx.fillStyle = palette.panel;
  ctx.fill();
  ctx.strokeStyle = `${palette.accent}55`;
  ctx.stroke();
  setFont(ctx, 20, 'system-ui, sans-serif', 650);
  ctx.fillStyle = palette.accent;
  const label = pageCount > 1 ? `${surahName.toUpperCase()}  ·  ${reference}  ·  BAGIAN ${pageNo}/${pageCount}` : `${surahName.toUpperCase()}  ·  ${reference}`;
  ctx.fillText(label, WIDTH / 2, 260, WIDTH - 230);
}

function drawPage(ctx, verse, page, pageNo, pageCount, palette, reference, surahName, includeLatin) {
  drawBackground(ctx, palette, pageNo, pageCount, reference, surahName);
  roundedRect(ctx, 58, 316, WIDTH - 116, 1320, 34);
  ctx.fillStyle = palette.panel;
  ctx.fill();
  ctx.strokeStyle = `${palette.border}aa`;
  ctx.lineWidth = 2;
  ctx.stroke();

  const top = BODY_TOP;
  const total = page.height;
  let y = top + Math.max(0, (BODY_HEIGHT - total) / 2);
  for (const section of page.sections) {
    y += section.gapBefore;
    setFont(ctx, 15, 'system-ui, sans-serif', 700);
    ctx.fillStyle = palette.accent;
    ctx.textAlign = 'center';
    ctx.direction = 'ltr';
    ctx.fillText(section.label, WIDTH / 2, y + 18);
    y += section.labelHeight;

    setFont(ctx, section.size, section.family, section.weight);
    ctx.fillStyle = palette[section.color];
    ctx.textAlign = 'center';
    ctx.direction = section.direction;
    for (const line of section.lines) {
      y += section.lineHeight;
      ctx.fillText(line, WIDTH / 2, y - section.lineHeight * 0.18, 850);
    }
  }

  ctx.textAlign = 'center';
  ctx.direction = 'ltr';
  setFont(ctx, 17, 'system-ui, sans-serif', 600);
  ctx.fillStyle = palette.ink;
  ctx.fillText('alquran.bangundwir.my.id', WIDTH / 2, 1712);
  setFont(ctx, 14, 'system-ui, sans-serif', 400);
  ctx.fillStyle = palette.muted;
  ctx.fillText(includeLatin ? 'Teks: Tanzil  ·  Terjemahan: Kemenag RI  ·  Latin: Quranic Arabic Corpus/EQuran.id' : 'Teks: Tanzil  ·  Terjemahan Kemenag RI (non-komersial)', WIDTH / 2, 1745, 870);
  setFont(ctx, 13, 'system-ui, sans-serif', 500);
  ctx.fillText('Buka tautan ayat pada keterangan/caption untuk membaca konteks lengkapnya.', WIDTH / 2, 1780, 860);
  ctx.fillStyle = palette.accent;
  ctx.fillRect(WIDTH / 2 - 28, 1820, 56, 3);
}

function toBlob(canvas) {
  return new Promise((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Gambar Story tidak dapat dibuat.')), 'image/png'));
}

export async function renderStoryCards(verse, { includeLatin = false, theme = 'forest' } = {}) {
  if (!verse?.arabic || !verse?.translation) throw new Error('Teks ayat belum lengkap.');
  const palette = THEMES[theme] || THEMES.forest;
  if (document.fonts?.load) {
    try { await document.fonts.load('400 72px "Amiri Quran"', verse.arabic); } catch { /* use installed Arabic fallback */ }
  }

  const measurement = document.createElement('canvas').getContext('2d');
  const sizes = { arabic: 72, latin: 29, translation: 42 };
  const minimum = { arabic: 36, latin: 20, translation: 26 };
  let sections = makeSections(measurement, verse, includeLatin, sizes);
  for (let guard = 0; contentHeight(sections) > BODY_HEIGHT && guard < 180; guard++) {
    const candidates = sections.filter(section => sizes[section.key] > minimum[section.key]);
    if (!candidates.length) break;
    candidates.sort((a, b) => b.lines.length * b.lineHeight - a.lines.length * a.lineHeight);
    const key = candidates[0].key;
    sizes[key] = Math.max(minimum[key], sizes[key] - (key === 'latin' ? 1 : 2));
    sections = makeSections(measurement, verse, includeLatin, sizes);
  }

  const pages = paginate(sections);
  const reference = `${verse.s}:${verse.a}`;
  const blobs = [];
  for (let i = 0; i < pages.length; i++) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas belum tersedia pada browser ini.');
    drawPage(ctx, verse, pages[i], i + 1, pages.length, palette, reference, verse.name, includeLatin);
    blobs.push(await toBlob(canvas));
  }
  return blobs;
}

export const STORY_THEMES = Object.freeze(Object.keys(THEMES));
