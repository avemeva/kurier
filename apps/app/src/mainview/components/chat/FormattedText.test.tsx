import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { UITextEntity } from '@/data';

vi.mock('lottie-web/build/player/lottie_light', () => ({
  default: { loadAnimation: vi.fn(() => ({ destroy: vi.fn() })) },
}));

import { PureFormattedText } from './PureFormattedText';

function entity(
  offset: number,
  length: number,
  type: UITextEntity['type'],
  extra?: Partial<UITextEntity>,
): UITextEntity {
  return { offset, length, type, ...extra };
}

describe('PureFormattedText', () => {
  it('renders plain text when no entities', () => {
    const { container } = render(<PureFormattedText text="hello world" entities={[]} />);
    expect(container.textContent).toBe('hello world');
  });

  it('renders raw text as-is when no entities (no markdown parsing)', () => {
    const { container } = render(<PureFormattedText text="**Screenshot Made**" entities={[]} />);
    // No markdown parsing — ** should appear as-is
    expect(container.textContent).toBe('**Screenshot Made**');
    expect(container.querySelector('strong')).toBeNull();
  });

  it('renders entity-based bold', () => {
    const { container } = render(
      <PureFormattedText text="Screenshot Made" entities={[entity(0, 15, 'bold')]} />,
    );
    const strong = container.querySelector('strong');
    expect(strong?.textContent).toBe('Screenshot Made');
  });

  it('renders gap text as plain text between entities', () => {
    const text = 'Hello world\nhttps://example.com';
    const entities = [entity(12, 19, 'url')];
    const { container } = render(<PureFormattedText text={text} entities={entities} />);

    // Gap text is plain
    expect(container.textContent).toContain('Hello world');

    // The URL entity should be rendered as a link
    const link = container.querySelector('a');
    expect(link?.textContent).toBe('https://example.com');
  });

  it('renders trailing text as plain text after entities', () => {
    const text = 'https://example.com\nFooter text';
    const entities = [entity(0, 19, 'url')];
    const { container } = render(<PureFormattedText text={text} entities={entities} />);

    // Trailing text should be plain
    expect(container.textContent).toContain('Footer text');
  });

  it('does not duplicate text when entities overlap', () => {
    const text = 'Visit my.telegram.org for info';
    const entities = [
      entity(6, 15, 'textUrl', { url: 'https://my.telegram.org' }),
      entity(6, 15, 'bold'),
    ];
    const { container } = render(<PureFormattedText text={text} entities={entities} />);

    // The link text should appear exactly once
    const links = container.querySelectorAll('a');
    expect(links.length).toBe(1);
    expect(links[0].textContent).toBe('my.telegram.org');

    // No bold tag — it was skipped because it overlaps the link
    expect(container.querySelectorAll('strong').length).toBe(0);

    // Full text rendered once (no duplication)
    expect(container.textContent).toBe('Visit my.telegram.org for info');
  });

  it('renders the full bot message with entities correctly', () => {
    const text = 'Screenshot Made\n=====\nAccount ID\n 69834249152f0e8e0be38f7a\nVersion 2.1';
    const entities = [entity(0, 15, 'bold'), entity(22, 10, 'bold'), entity(59, 7, 'bold')];
    const { container } = render(<PureFormattedText text={text} entities={entities} />);

    const bolds = container.querySelectorAll('strong');
    expect(bolds.length).toBe(3);
    expect(bolds[0].textContent).toBe('Screenshot Made');
    expect(bolds[1].textContent).toBe('Account ID');
    expect(bolds[2].textContent).toBe('Version');
    // ===== should appear as plain text, not as markdown heading
    expect(container.textContent).toContain('=====');
  });
});
