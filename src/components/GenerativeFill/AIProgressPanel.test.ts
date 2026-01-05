import { describe, it, expect } from 'vitest';
import { wrapCoordinatesInHtml } from './aiProgressMarkup';

describe('wrapCoordinatesInHtml', () => {
  it('wraps decimal region coordinates', () => {
    const input = 'Region from (1.2, 134.4) to (200.5, 300.75)';
    const output = wrapCoordinatesInHtml(input);

    expect(output).toContain('class="region-highlight"');
    expect(output).toContain('data-x1="1.2"');
    expect(output).toContain('data-y1="134.4"');
    expect(output).toContain('data-x2="200.5"');
    expect(output).toContain('data-y2="300.75"');
  });

  it('wraps decimal point coordinates', () => {
    const input = 'Target coordinate: (368.00132821229124, 172.80727524548377)';
    const output = wrapCoordinatesInHtml(input);

    expect(output).toContain('class="coord-highlight"');
    expect(output).toContain('data-x="368.00132821229124"');
    expect(output).toContain('data-y="172.80727524548377"');
  });

  it('wraps integer point coordinates', () => {
    const input = 'Move to (150, 200) and then to (50,300).';
    const output = wrapCoordinatesInHtml(input);

    expect(output.match(/class="coord-highlight"/g)?.length).toBe(2);
    expect(output).toContain('data-x="150"');
    expect(output).toContain('data-y="200"');
    expect(output).toContain('data-x="50"');
    expect(output).toContain('data-y="300"');
  });
});
