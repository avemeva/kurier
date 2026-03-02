// Strip markdown markers for plain-text previews (dialog list).

const MD_RE = /\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*(.+?)\*\*|__(.+?)__|~~(.+?)~~|`([^`]+)`/g;

/** Strip markdown markers, returning plain text. */
export function stripMarkdown(input: string): string {
  return input.replace(MD_RE, (_match, linkText, _href, bold, italic, strike, code) => {
    return linkText ?? bold ?? italic ?? strike ?? code ?? '';
  });
}
