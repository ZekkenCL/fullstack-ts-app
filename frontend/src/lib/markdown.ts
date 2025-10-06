import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { Highlighter } from 'shiki';
let shikiHighlighter: Highlighter | null = null;
let loadingHighlighter: Promise<Highlighter> | null = null;

async function getHighlighter(): Promise<Highlighter> {
  if (shikiHighlighter) return shikiHighlighter;
  if (!loadingHighlighter) {
    loadingHighlighter = import('shiki').then(async (mod) => {
      const highlighter = await mod.getHighlighter({ theme: 'github-dark-default' });
      shikiHighlighter = highlighter;
      return highlighter;
    });
  }
  return loadingHighlighter;
}

// Configure marked (lightweight features only)
marked.setOptions({
  breaks: true,
  gfm: true,
});

// Versión síncrona rápida (sin highlight aún)
export function renderMarkdown(raw: string): string {
  if (!raw) return '';
  const html = marked.parse(raw) as string;
  // Resaltar menciones (@usuario). Patrón simple: @ seguido de letras/números/guión-bajo/guión, no dentro de código inline/backticks (simplificación).
  // Realizamos el reemplazo ANTES de sanitizar para que DOMPurify filtre cualquier cosa inesperada.
  const mentionRegex = /(^|[^`\w])@([a-zA-Z0-9_\-]{2,32})/g; // evita capturar dentro de una palabra y tamaño razonable
  const withMentions = html.replace(mentionRegex, (full, prefix, user) => {
    return `${prefix}<span class="mention text-discord-primary font-semibold">@${user}</span>`;
  });
  return DOMPurify.sanitize(withMentions, { USE_PROFILES: { html: true } });
}

// Versión asíncrona que intenta aplicar syntax highlighting a bloques ```lang
export async function renderMarkdownAsync(raw: string): Promise<string> {
  if (!raw) return '';
  const highlighter = await getHighlighter().catch(()=>null);
  const lexer = marked.lexer(raw);
  const transformed = await Promise.all(
    lexer.map(async (token: any) => {
      if (token.type === 'code' && highlighter) {
        const lang = token.lang || 'txt';
        try {
          const html = highlighter.codeToHtml(token.text, { lang });
          return { ...token, text: html, _shiki: true };
        } catch { return token; }
      }
      return token;
    })
  );
  const renderer = new marked.Renderer();
  const originalCode = renderer.code.bind(renderer);
  renderer.code = (code, infostring, escaped) => {
    if ((code as any).includes('<pre class="shiki"')) {
      return code; // ya viene con HTML de Shiki
    }
    return originalCode(code, infostring, escaped);
  };
  const html = marked.parser(transformed as any, { renderer });
  const mentionRegex = /(^|[^`\w])@([a-zA-Z0-9_\-]{2,32})/g;
  const withMentions = html.replace(mentionRegex, (full, prefix, user) => `${prefix}<span class="mention text-discord-primary font-semibold">@${user}</span>`);
  return DOMPurify.sanitize(withMentions, { USE_PROFILES: { html: true } });
}

// Utility to quickly strip potentially heavy markdown for previews if needed
export function plainTextFromMarkdown(raw: string): string {
  return raw.replace(/[`*_>#~\-\[\]\(\)\!]/g, '');
}