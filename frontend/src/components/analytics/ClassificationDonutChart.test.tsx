import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ClassificationDonutChart, type LabelCount } from './ClassificationDonutChart';

vi.mock('recharts', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual as any,
    ResponsiveContainer: ({ children }: any) => <div style={{ width: '100%', height: '100%' }}>{children}</div>,
    PieChart: ({ children }: any) => <div data-testid="pie-chart">{children}</div>,
    Pie: () => <div data-testid="pie" />,
    Cell: () => null,
    Tooltip: () => null,
    Legend: ({ formatter }: any) => <div data-testid="legend">{formatter?.('Generic Question')}</div>,
  };
});

describe('ClassificationDonutChart', () => {
  it('shows a spinner while loading', () => {
    const { container } = render(
      <ClassificationDonutChart data={[]} isLoading={true} />
    );
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows empty state when no data and not loading', () => {
    render(<ClassificationDonutChart data={[]} isLoading={false} />);
    expect(screen.getByText(/No classified sessions yet/i)).toBeInTheDocument();
  });

  it('renders the pie chart when data is provided', () => {
    const data: LabelCount[] = [
      { label: 'Generic Question', count: 10 },
      { label: 'Bug / Troubleshooting', count: 5 },
    ];
    render(<ClassificationDonutChart data={data} isLoading={false} />);
    expect(screen.getByTestId('pie-chart')).toBeInTheDocument();
  });
});
