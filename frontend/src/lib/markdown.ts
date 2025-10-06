import { marked } from 'marked';
import DOMPurify from 'dompurify';

// Configure marked (lightweight features only)
marked.setOptions({
  breaks: true,
  gfm: true,
});

export function renderMarkdown(raw: string): string {
  if (!raw) return '';
  const html = marked.parse(raw) as string;
  // Sanitize
  return DOMPurify.sanitize(html, { USE_PROFILES: { html: true } });
}

// Utility to quickly strip potentially heavy markdown for previews if needed
export function plainTextFromMarkdown(raw: string): string {
  return raw.replace(/[`*_>#~\-\[\]\(\)\!]/g, '');
}