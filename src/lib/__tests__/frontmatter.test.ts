import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../frontmatter';

describe('parseFrontmatter', () => {
  it('returns the whole source as content when there is no frontmatter', () => {
    const result = parseFrontmatter('# Just markdown\n\nBody.');
    expect(result.data).toEqual({});
    expect(result.content).toBe('# Just markdown\n\nBody.');
  });

  it('parses quoted and bare strings, dates, arrays, booleans, and numbers', () => {
    const source = [
      '---',
      'title: "Harvest day: with a colon"',
      "author: 'Single quoted'",
      'bare: NeuroCann Team',
      'date: 2026-09-24',
      'tags: [harvest, "voice", trim ]',
      'empty: []',
      'draft: false',
      'order: 3',
      '# a comment line',
      '---',
      '',
      'Body text.',
    ].join('\n');

    const { data, content } = parseFrontmatter(source);
    expect(data.title).toBe('Harvest day: with a colon');
    expect(data.author).toBe('Single quoted');
    expect(data.bare).toBe('NeuroCann Team');
    expect(data.date).toBe('2026-09-24');
    expect(data.tags).toEqual(['harvest', 'voice', 'trim']);
    expect(data.empty).toEqual([]);
    expect(data.draft).toBe(false);
    expect(data.order).toBe(3);
    expect(content).toBe('\nBody text.');
  });

  it('handles CRLF line endings', () => {
    const { data, content } = parseFrontmatter('---\r\ntitle: Hi\r\n---\r\nBody');
    expect(data.title).toBe('Hi');
    expect(content).toBe('Body');
  });
});
