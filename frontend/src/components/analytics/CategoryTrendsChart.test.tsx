import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { CategoryTrendsChart, type DailyLabelData } from './CategoryTrendsChart';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    ResponsiveContainer: ({ children }: any) => <div style={{ width: '100%', height: '100%' }}>{children}</div>,
    BarChart: ({ children }: any) => <div data-testid="bar-chart">{children}</div>,
    Bar: () => <div data-testid="bar" />,
    XAxis: () => null,
    YAxis: () => null,
    CartesianGrid: () => null,
    Tooltip: () => null,
    Legend: () => null,
  };
});

describe('CategoryTrendsChart', () => {
  it('shows a spinner while loading', () => {
    const { container } = render(
      <CategoryTrendsChart data={[]} isLoading={true} />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no data and not loading', () => {
    render(<CategoryTrendsChart data={[]} isLoading={false} />);
    expect(screen.getByText(/No trend data/i)).toBeInTheDocument();
  });

  it('renders the bar chart when data is provided', () => {
    const data: DailyLabelData[] = [
      { date: 'Mar 29', 'Generic Question': 3, 'Bug / Troubleshooting': 1 },
    ];
    render(<CategoryTrendsChart data={data} isLoading={false} />);
    expect(screen.getByTestId('bar-chart')).toBeInTheDocument();
  });
});
