import jsPDF from 'jspdf';

interface ExportNotesPdfOptions {
  topic: string;
  markdown: string;
}

interface TextRun {
  text: string;
  bold: boolean;
}

type NotesBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list-item'; ordered: boolean; number?: string; indent: number; text: string };

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const FOOTER_TOP = 278;

export function exportNotesPdf({ topic, markdown }: ExportNotesPdfOptions): void {
  const cleanTopic = topic.trim().slice(0, 200) || 'Study Notes';
  const cleanMarkdown = markdown.trim();

  if (!cleanMarkdown) {
    throw new Error('There are no notes to export.');
  }

  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
    compress: true,
  });
  const contentWidth = PAGE_WIDTH - MARGIN * 2;
  const layout = { y: 0 };

  paintWhitePage(pdf);
  pdf.setProperties({ title: `Scripto - Study Notes: ${cleanTopic}`, subject: cleanTopic });
  pdf.setTextColor(24, 24, 27);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(17);
  pdf.text('Scripto — Study Notes', MARGIN, 22);

  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(10);
  const topicLines = pdf.splitTextToSize(`Topic: ${cleanTopic}`, contentWidth) as string[];
  pdf.text(topicLines, MARGIN, 32);

  const metadataY = 32 + topicLines.length * 5;
  pdf.setFontSize(9);
  pdf.setTextColor(82, 82, 91);
  pdf.text(`Generated: ${new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })}`, MARGIN, metadataY);
  pdf.setDrawColor(212, 212, 216);
  pdf.setLineWidth(0.35);
  pdf.line(MARGIN, metadataY + 5, PAGE_WIDTH - MARGIN, metadataY + 5);
  layout.y = metadataY + 13;

  for (const block of parseMarkdown(cleanMarkdown)) {
    if (block.type === 'heading') {
      layout.y += 3;
      ensureSpace(pdf, layout, 8, cleanTopic);
      const fontSize = block.level === 1 ? 15 : block.level === 2 ? 13 : 11;
      drawRuns(pdf, layout, parseInlineMarkdown(block.text, true), MARGIN, contentWidth, fontSize, fontSize * 0.48, cleanTopic);
      layout.y += 2;
      continue;
    }

    if (block.type === 'list-item') {
      ensureSpace(pdf, layout, 5, cleanTopic);
      const indent = Math.min(block.indent, 4) * 4;
      const textX = MARGIN + 5 + indent;

      if (block.ordered) {
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(10);
        pdf.setTextColor(24, 24, 27);
        pdf.text(`${block.number}.`, MARGIN + indent, layout.y);
      } else {
        pdf.setFillColor(39, 39, 42);
        pdf.circle(MARGIN + indent + 1.2, layout.y - 1, 0.65, 'F');
      }

      drawRuns(pdf, layout, parseInlineMarkdown(block.text), textX, contentWidth - indent - 5, 10, 4.8, cleanTopic);
      layout.y += 1.5;
      continue;
    }

    drawRuns(pdf, layout, parseInlineMarkdown(block.text), MARGIN, contentWidth, 10, 4.8, cleanTopic);
    layout.y += 2;
  }

  addPageFooters(pdf);
  pdf.save(`scripto-notes-${slugify(cleanTopic)}.pdf`);
}

function parseMarkdown(markdown: string): NotesBlock[] {
  const blocks: NotesBlock[] = [];
  let paragraphLines: string[] = [];

  const flushParagraph = () => {
    const text = paragraphLines.join(' ').trim();
    if (text) blocks.push({ type: 'paragraph', text });
    paragraphLines = [];
  };

  for (const rawLine of markdown.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: 'heading', level: heading[1].length, text: heading[2].trim() });
      continue;
    }

    if (/^\s{0,3}(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line) || /^\s*\|?[-:| ]+\|?\s*$/.test(line)) {
      flushParagraph();
      continue;
    }

    const listItem = line.match(/^(\s*)([-*+]|\d+[.)])\s+(.+)$/);
    if (listItem) {
      flushParagraph();
      const ordered = /^\d/.test(listItem[2]);
      blocks.push({
        type: 'list-item',
        ordered,
        number: ordered ? listItem[2].replace(/[.)]$/, '') : undefined,
        indent: Math.floor(listItem[1].length / 2),
        text: listItem[3].trim(),
      });
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  return blocks;
}

function parseInlineMarkdown(text: string, bold = false): TextRun[] {
  const runs: TextRun[] = [];
  const pattern = /(\*\*.+?\*\*|__.+?__|\[[^\]]+\]\([^)]+\)|`[^`]+`)/g;
  let lastIndex = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) {
      runs.push({ text: cleanInlineText(text.slice(lastIndex, index)), bold });
    }

    const token = match[0];
    if (token.startsWith('**') || token.startsWith('__')) {
      runs.push({ text: cleanInlineText(token.slice(2, -2)), bold: true });
    } else if (token.startsWith('[')) {
      runs.push({ text: token.slice(1, token.indexOf(']')), bold });
    } else {
      runs.push({ text: cleanInlineText(token.slice(1, -1)), bold });
    }
    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: cleanInlineText(text.slice(lastIndex)), bold });
  }

  return runs.filter(run => run.text.length > 0);
}

function cleanInlineText(text: string): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/[*_~`]/g, '');
}

function drawRuns(
  pdf: jsPDF,
  layout: { y: number },
  runs: TextRun[],
  x: number,
  maxWidth: number,
  fontSize: number,
  lineHeight: number,
  topic: string
): void {
  let cursorX = x;
  const rightEdge = x + maxWidth;

  const nextLine = () => {
    layout.y += lineHeight;
    ensureSpace(pdf, layout, lineHeight, topic);
    cursorX = x;
  };

  ensureSpace(pdf, layout, lineHeight, topic);

  for (const run of runs) {
    const tokens = run.text.match(/\s+|\S+/g) ?? [];
    for (const token of tokens) {
      pdf.setFont('helvetica', run.bold ? 'bold' : 'normal');
      pdf.setFontSize(fontSize);

      if (/^\s+$/.test(token)) {
        if (cursorX === x) continue;
        const spaceWidth = pdf.getTextWidth(token);
        if (cursorX + spaceWidth > rightEdge) {
          nextLine();
        } else {
          cursorX += spaceWidth;
        }
        continue;
      }

      const pieces = pdf.splitTextToSize(token, maxWidth) as string[];
      for (let index = 0; index < pieces.length; index++) {
        const piece = pieces[index];
        const textWidth = pdf.getTextWidth(piece);
        if (cursorX > x && cursorX + textWidth > rightEdge) nextLine();
        pdf.setTextColor(24, 24, 27);
        pdf.text(piece, cursorX, layout.y);
        cursorX += textWidth;
        if (index < pieces.length - 1) nextLine();
      }
    }
  }

  layout.y += lineHeight;
}

function ensureSpace(pdf: jsPDF, layout: { y: number }, height: number, topic: string): void {
  if (layout.y + height <= FOOTER_TOP) return;

  pdf.addPage();
  paintWhitePage(pdf);
  pdf.setTextColor(39, 39, 42);
  pdf.setFont('helvetica', 'bold');
  pdf.setFontSize(10);
  pdf.text('Scripto — Study Notes', MARGIN, 15);
  pdf.setFont('helvetica', 'normal');
  pdf.setFontSize(8);
  pdf.setTextColor(82, 82, 91);
  const topicLines = pdf.splitTextToSize(`Topic: ${topic}`, PAGE_WIDTH - MARGIN * 2) as string[];
  pdf.text(topicLines, MARGIN, 20);
  const dividerY = 20 + topicLines.length * 4;
  pdf.setDrawColor(212, 212, 216);
  pdf.setLineWidth(0.3);
  pdf.line(MARGIN, dividerY, PAGE_WIDTH - MARGIN, dividerY);
  layout.y = dividerY + 8;
}

function paintWhitePage(pdf: jsPDF): void {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(0, 0, PAGE_WIDTH, PAGE_HEIGHT, 'F');
}

function addPageFooters(pdf: jsPDF): void {
  const pageCount = pdf.getNumberOfPages();
  for (let page = 1; page <= pageCount; page++) {
    pdf.setPage(page);
    pdf.setDrawColor(212, 212, 216);
    pdf.setLineWidth(0.3);
    pdf.line(MARGIN, FOOTER_TOP, PAGE_WIDTH - MARGIN, FOOTER_TOP);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(8);
    pdf.setTextColor(113, 113, 122);
    pdf.text(`Page ${page} of ${pageCount}`, PAGE_WIDTH - MARGIN, 285, { align: 'right' });
  }
}

function slugify(value: string): string {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return slug || 'study-notes';
}
