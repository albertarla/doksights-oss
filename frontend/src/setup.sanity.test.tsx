import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

/**
 * Sanity check: verifies that Vitest + jsdom + @testing-library/react
 * are correctly wired up. This is NOT a test of the App component.
 */
describe('Test Environment Sanity', () => {
  it('vitest and jsdom are configured correctly', () => {
    const { container } = render(<div>Test Environment Active</div>);
    expect(container).toHaveTextContent('Test Environment Active');
  });
});
