import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { NavLink } from './NavLink';

const renderNavLink = (to: string, currentPath: string, props: Record<string, any> = {}) =>
  render(
    <MemoryRouter initialEntries={[currentPath]}>
      <Routes>
        <Route
          path="*"
          element={
            <NavLink
              to={to}
              className="base-class"
              activeClassName="active-class"
              {...props}
            >
              Link Text
            </NavLink>
          }
        />
      </Routes>
    </MemoryRouter>
  );

describe('NavLink', () => {
  it('renders a link with the correct href', () => {
    renderNavLink('/dashboard', '/home');
    const link = screen.getByRole('link', { name: 'Link Text' });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/dashboard');
  });

  it('applies base className regardless of active state', () => {
    renderNavLink('/dashboard', '/home');
    expect(screen.getByRole('link')).toHaveClass('base-class');
  });

  it('applies activeClassName when route matches', () => {
    renderNavLink('/dashboard', '/dashboard');
    expect(screen.getByRole('link')).toHaveClass('active-class');
  });

  it('does not apply activeClassName when route does not match', () => {
    renderNavLink('/dashboard', '/home');
    expect(screen.getByRole('link')).not.toHaveClass('active-class');
  });

  it('renders children correctly', () => {
    renderNavLink('/about', '/home');
    expect(screen.getByText('Link Text')).toBeInTheDocument();
  });
});
