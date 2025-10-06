declare module 'shiki' {
  export interface HighlighterOptions { theme: string; };
  export interface Highlighter { codeToHtml(code: string, opts: { lang: string }): string; }
  export function getHighlighter(opts: HighlighterOptions): Promise<Highlighter>;
}