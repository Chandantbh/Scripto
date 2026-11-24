// src/lib/file-parser.ts
'use client';

import * as pdfjs from 'pdfjs-dist';
import mammoth from 'mammoth';

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_PDF_PAGES = 30;
export const MAX_EXTRACTED_CHARACTERS = 50_000;

export class DocumentLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DocumentLimitError';
  }
}
export const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

export function isAllowedDocumentFile(file: Pick<File, 'name' | 'type' | 'size'>): boolean {
  const extension = file.name.toLowerCase().split('.').pop();
  if (!['pdf', 'docx', 'txt'].includes(extension ?? '')) return false;
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return false;
  if (file.type) return ALLOWED_DOCUMENT_MIME_TYPES.has(file.type.toLowerCase());
  return true;
}

export async function verifyDocumentMagicBytes(file: File): Promise<boolean> {
  if (file.size <= 0 || file.size > MAX_UPLOAD_BYTES) return false;
  const bytes = new Uint8Array(await file.slice(0, 4).arrayBuffer());
  if (file.name.toLowerCase().endsWith('.pdf')) {
    return file.type === 'application/pdf'
      && String.fromCharCode(...bytes) === '%PDF';
  }
  if (file.name.toLowerCase().endsWith('.docx')) {
    return file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      && bytes[0] === 0x50 && bytes[1] === 0x4b
      && bytes[2] === 0x03 && bytes[3] === 0x04;
  }
  if (file.name.toLowerCase().endsWith('.txt')) {
    return file.type === 'text/plain';
  }
  return false;
}

// Set the workerSrc for pdfjs-dist. This is necessary for it to work in a browser environment.
// We are using a CDN for simplicity.
pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

/**
 * Extracts text from a given File object.
 * Supports PDF, DOCX, JSON, and plain text files.
 * @param file The File object to parse.
 * @returns A promise that resolves with the extracted text content.
 */
export async function extractTextFromFile(file: File): Promise<string> {
    if (file.size === 0) {
        throw new Error('The selected file is empty.');
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        throw new Error('Files must be 10 MB or smaller.');
    }
    if (!isAllowedDocumentFile(file)) {
        throw new Error('Unsupported file type. Choose a PDF, DOCX, or TXT file.');
    }
    if (!(await verifyDocumentMagicBytes(file))) {
        throw new Error('The file contents do not match an allowed PDF, DOCX, or TXT document.');
    }

    if (file.type === 'application/pdf') {
        return extractTextFromPdf(file);
    } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        return extractTextFromDocx(file);
    } else if (file.type.startsWith('text/')) {
        const text = await file.text();
        if (text.length > MAX_EXTRACTED_CHARACTERS) {
          throw new DocumentLimitError('File must be a PDF or DOCX under 10 MB (max 30 pages).');
        }
        return text;
    } else {
        throw new Error(`Unsupported file type: ${file.type}`);
    }
}

/**
 * Extracts text content from a PDF file.
 * @param file The PDF file.
 * @returns A promise that resolves to the text content of the PDF.
 */
async function extractTextFromPdf(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
        let text = '';
        
        if (pdf.numPages === 0) {
            throw new Error("The PDF file appears to be empty.");
        }
        if (pdf.numPages > MAX_PDF_PAGES) {
            throw new DocumentLimitError('File must be a PDF or DOCX under 10 MB (max 30 pages).');
        }

        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            // IMPROVED: Add newlines between items if they are far apart vertically?
            // For now, simply joining with space is standard for RAG/LLM input.
            // But we can filter out empty strings.
            const pageText = content.items
                .map(item => ('str' in item ? item.str : ''))
                .filter(str => str.trim().length > 0)
                .join(' ');
            
            text += pageText;
            if (text.length > MAX_EXTRACTED_CHARACTERS) {
                throw new DocumentLimitError('The document exceeds 50,000 extracted characters. Please use a shorter PDF or DOCX.');
            }
            if (i < pdf.numPages) {
            text += '\n\n'; // Add page breaks
            }
        }
        
        if (text.length > MAX_EXTRACTED_CHARACTERS) {
            throw new DocumentLimitError('The document exceeds 50,000 extracted characters. Please use a shorter PDF or DOCX.');
        }
        return text.slice(0, MAX_EXTRACTED_CHARACTERS);
    } catch (error) {
        if (error instanceof DocumentLimitError) throw error;
        console.error("PDF Parsing Error:", error);
        throw new Error("Failed to parse PDF. Please ensure the file is not corrupted.");
    }
}

/**
 * Extracts raw text from a DOCX file.
 * @param file The DOCX file.
 * @returns A promise that resolves to the raw text content of the document.
 */
async function extractTextFromDocx(file: File): Promise<string> {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    if (result.value.length > MAX_EXTRACTED_CHARACTERS) {
        throw new DocumentLimitError('The document exceeds 50,000 extracted characters. Please use a shorter PDF or DOCX.');
    }
    return result.value;
}