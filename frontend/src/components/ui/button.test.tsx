import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { Button } from './button';

describe('Button Component', () => {
  it('renders correctly with default props', () => {
    render(<Button>Click Me</Button>);
    const buttonElement = screen.getByRole('button', { name: /click me/i });
    
    expect(buttonElement).toBeInTheDocument();
    // Default variant has specific background class
    expect(buttonElement).toHaveClass('bg-primary');
  });

  it('handles click events', async () => {
    const handleClick = vi.fn();
    render(<Button onClick={handleClick}>Action</Button>);
    
    const buttonElement = screen.getByRole('button', { name: /action/i });
    await userEvent.click(buttonElement);
    
    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  it('renders correctly as a disabled button', () => {
    render(<Button disabled>Disabled</Button>);
    const buttonElement = screen.getByRole('button', { name: /disabled/i });
    
    expect(buttonElement).toBeDisabled();
    expect(buttonElement).toHaveClass('disabled:opacity-50');
  });

  it('applies variant and size classes correctly', () => {
    render(<Button variant="destructive" size="lg">Delete</Button>);
    const buttonElement = screen.getByRole('button', { name: /delete/i });
    
    expect(buttonElement).toHaveClass('bg-destructive');
    expect(buttonElement).toHaveClass('h-11');
  });

  it('can render as a child custom element via asChild', () => {
    // Testing the Radix Slot functionality
    render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>
    );
    
    // It should render as a link, not a button element
    const linkElement = screen.getByRole('link', { name: /link button/i });
    expect(linkElement).toBeInTheDocument();
    expect(linkElement).toHaveAttribute('href', '/test');
  });
});
