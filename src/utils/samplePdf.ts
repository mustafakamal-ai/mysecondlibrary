// Deterministic valid PDF 1.4 generator for local starter books

export interface SampleBookPage {
  heading: string;
  body: string[];
}

export interface SampleBookSpec {
  id: string;
  title: string;
  author: string;
  description: string;
  categoryId: string;
  pages: SampleBookPage[];
}

function escapePdfText(input: string): string {
  return input
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/[^\x20-\x7e]/g, ' ');
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if (!current) {
      current = word;
    } else if (current.length + 1 + word.length <= maxChars) {
      current += ` ${word}`;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function buildPdfBytes(spec: SampleBookSpec): Uint8Array {
  const objects: string[] = [];
  const pageCount = spec.pages.length;

  // 1: Catalog, 2: Pages, 3: Serif Font, 4: Sans Font, 5: Info
  const pageObjIds: number[] = [];
  const contentObjIds: number[] = [];
  let nextId = 6;
  for (let i = 0; i < pageCount; i++) {
    pageObjIds.push(nextId++);
    contentObjIds.push(nextId++);
  }

  objects[1] = `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`;
  objects[2] = `2 0 obj\n<< /Type /Pages /Kids [${pageObjIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pageCount} >>\nendobj\n`;
  objects[3] = `3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Roman >>\nendobj\n`;
  objects[4] = `4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>\nendobj\n`;
  objects[5] = `5 0 obj\n<< /Title (${escapePdfText(spec.title)}) /Author (${escapePdfText(spec.author)}) /Producer (My Library Local Engine) >>\nendobj\n`;

  for (let i = 0; i < pageCount; i++) {
    const page = spec.pages[i];
    const pId = pageObjIds[i];
    const cId = contentObjIds[i];

    const commands: string[] = [];
    // Warm archival cream paper background
    commands.push('0.98 0.965 0.935 rg 0 0 595 842 re f');
    // Subtle decorative border frame
    commands.push('0.71 0.545 0.33 RG 0.8 w 42 42 511 758 re S');

    if (i === 0) {
      // Cover page layout
      commands.push('0.208 0.157 0.125 rg');
      commands.push('BT /F2 11 Tf 72 720 Td (PRIVATE EDITION) Tj ET');
      commands.push('0.71 0.545 0.33 RG 1.2 w 72 706 m 200 706 l S');

      const titleLines = wrapLine(spec.title, 28);
      let ty = 610;
      commands.push('0.16 0.14 0.13 rg');
      for (const line of titleLines) {
        commands.push(`BT /F2 28 Tf 72 ${ty} Td (${escapePdfText(line)}) Tj ET`);
        ty -= 36;
      }

      commands.push(`0.42 0.35 0.29 rg BT /F1 15 Tf 72 ${ty - 20} Td (By ${escapePdfText(spec.author)}) Tj ET`);

      const descLines = wrapLine(spec.description, 62);
      let dy = 340;
      commands.push('0.28 0.25 0.23 rg');
      for (const line of descLines) {
        commands.push(`BT /F1 12 Tf 72 ${dy} Td (${escapePdfText(line)}) Tj ET`);
        dy -= 20;
      }

      commands.push('0.50 0.43 0.37 rg BT /F1 10 Tf 72 72 Td (MY LIBRARY COLLECTION) Tj ET');
    } else {
      // Interior reading page
      commands.push(`0.55 0.46 0.38 rg BT /F1 9 Tf 72 770 Td (${escapePdfText(spec.title.toUpperCase())}) Tj ET`);
      commands.push('0.82 0.76 0.68 RG 0.5 w 72 758 m 523 758 l S');

      commands.push(`0.208 0.157 0.125 rg BT /F2 18 Tf 72 710 Td (${escapePdfText(page.heading)}) Tj ET`);

      let y = 665;
      commands.push('0.18 0.16 0.15 rg');
      for (const para of page.body) {
        const lines = wrapLine(para, 66);
        for (const line of lines) {
          if (y < 95) break;
          commands.push(`BT /F1 12.5 Tf 72 ${y} Td (${escapePdfText(line)}) Tj ET`);
          y -= 20;
        }
        y -= 12;
      }

      commands.push(`0.48 0.40 0.34 rg BT /F1 10 Tf 286 64 Td (${i + 1} / ${pageCount}) Tj ET`);
    }

    const streamStr = commands.join('\n');
    objects[pId] = `${pId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>\nendobj\n`;
    objects[cId] = `${cId} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream\nendobj\n`;
  }

  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [0];
  for (let i = 1; i < objects.length; i++) {
    offsets[i] = pdf.length;
    pdf += objects[i];
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length}\n`;
  pdf += '0000000000 65535 f \n';
  for (let i = 1; i < objects.length; i++) {
    pdf += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length} /Root 1 0 R /Info 5 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;

  const bytes = new Uint8Array(pdf.length);
  for (let i = 0; i < pdf.length; i++) {
    bytes[i] = pdf.charCodeAt(i) & 0xff;
  }
  return bytes;
}

export const STARTER_BOOKS: SampleBookSpec[] = [
  {
    id: 'starter-quiet-reading',
    title: 'The Craft of Quiet Reading',
    author: 'Eleanor Vance',
    description:
      'Reflections on building a personal sanctuary of printed and digital volumes, unhurried attention, and lifelong marginalia.',
    categoryId: 'cat-non-fiction',
    pages: [
      {
        heading: 'Cover',
        body: [],
      },
      {
        heading: 'Chapter I: The Private Shelf',
        body: [
          'A library is never merely an inventory of files or bindings; it is an external memory shaped by curiosity, patience, and return visits.',
          'When we keep our books close on our own device, free from algorithmic feeds and transient subscriptions, reading regains its stillness. Every margin note and saved page becomes part of an enduring dialogue across years.',
          'Take a moment to explore how pages turn smoothly in this reader: drag a corner, swipe across your phone screen, or use keyboard arrows to settle into a natural cadence.',
        ],
      },
      {
        heading: 'Chapter II: Memory & Marginalia',
        body: [
          'Human memory thrives on spatial landmarks. Even in a digital volume, remembering that an insight lived on the lower right of a leaf helps anchor the idea.',
          'Bookmarks serve as quiet brass ribbons tucked between leaves. Adding a brief note beside a page number captures why a passage mattered at the exact hour you read it.',
          'When you return tomorrow, your library remembers the precise leaf where you paused, ready to resume without friction.',
        ],
      },
      {
        heading: 'Chapter III: Stewardship of Archives',
        body: [
          'True ownership means your collection remains yours even without an internet connection. Keeping original PDFs locally ensures typography, diagrams, and proportions endure exactly as authored.',
          'Periodic offline backups guard against hardware loss. Exporting a single compressed archive preserves every volume, cover, category, and reading ribbon in one portable package.',
        ],
      },
      {
        heading: 'Chapter IV: Rhythm of Attention',
        body: [
          'Deep comprehension rarely arrives in fragments. By dedicating twenty uninterrupted minutes to a single chapter, complex arguments unfold with clarity.',
          'Adjust your reading zoom, switch between single-page intimacy on mobile and two-page spreads on wider screens, and let the interface recede behind the ink.',
        ],
      },
      {
        heading: 'Colophon',
        body: [
          'Prepared locally inside My Library as a starter demonstration volume. You can read, bookmark, edit its cover and category, or upload your own PDF books at any time.',
        ],
      },
    ],
  },
  {
    id: 'starter-archival-design',
    title: 'Principles of Archival Design',
    author: 'Julian Mercer',
    description:
      'A concise monograph on proportion, warm paper contrast, and tactile typography for digital reading rooms.',
    categoryId: 'cat-education',
    pages: [
      {
        heading: 'Cover',
        body: [],
      },
      {
        heading: '01. Warmth Over Glare',
        body: [
          'Harsh pure-white backgrounds strain the eye during evening study. Soft cream paper tones paired with deep walnut ink create comfortable contrast that invites prolonged focus.',
          'In low-light rooms, dark espresso surfaces reduce ambient glare while preserving gentle hierarchy across shelves and navigation.',
        ],
      },
      {
        heading: '02. Proportions of the Leaf',
        body: [
          'Classical bookmakers relied on harmonious page ratios so margins framed prose with breathing room. Preserving original document dimensions honors the craft of every imported PDF.',
          'Whether inspecting technical blueprints, novels, or scanned monographs, faithful aspect scaling keeps every line legible.',
        ],
      },
      {
        heading: '03. Organizing by Intent',
        body: [
          'Categories are living shelves. Grouping volumes into History, Science, Business, or custom collections lets you find the right reference in seconds.',
          'Marking cherished volumes as Favorites places them within immediate reach on your dashboard.',
        ],
      },
    ],
  },
];
