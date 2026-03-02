import { describe, expect, it } from 'vitest';
import { stripMarkdown } from './markdown';

describe('stripMarkdown', () => {
  it('strips **bold** markers', () => {
    expect(stripMarkdown('**Screenshot Made**')).toBe('Screenshot Made');
  });

  it('strips __italic__ markers', () => {
    expect(stripMarkdown('__italic text__')).toBe('italic text');
  });

  it('strips ~~strikethrough~~ markers', () => {
    expect(stripMarkdown('~~deleted~~')).toBe('deleted');
  });

  it('strips `code` markers', () => {
    expect(stripMarkdown('`code`')).toBe('code');
  });

  it('strips [text](url) links to just text', () => {
    expect(stripMarkdown('[click](https://example.com)')).toBe('click');
  });

  it('strips mixed markdown', () => {
    expect(stripMarkdown('**bold** and __italic__ and `code`')).toBe('bold and italic and code');
  });

  it('preserves plain text', () => {
    expect(stripMarkdown('hello world')).toBe('hello world');
  });

  it('preserves bare URLs', () => {
    expect(stripMarkdown('visit https://example.com')).toBe('visit https://example.com');
  });

  it('strips the bot message example from screenshot', () => {
    const input = '**Screenshot Made**\n=====\n**Account ID**\n 69834';
    const expected = 'Screenshot Made\n=====\nAccount ID\n 69834';
    expect(stripMarkdown(input)).toBe(expected);
  });

  it('strips multiple bold sections', () => {
    const input = '**Account ID**\n 69834\n**Extension ID**';
    expect(stripMarkdown(input)).toBe('Account ID\n 69834\nExtension ID');
  });

  it('returns empty for empty input', () => {
    expect(stripMarkdown('')).toBe('');
  });

  it('does not strip single asterisks', () => {
    expect(stripMarkdown('a * b * c')).toBe('a * b * c');
  });

  it('strips consecutive bold without gap', () => {
    expect(stripMarkdown('**a****b**')).toBe('ab');
  });
});
