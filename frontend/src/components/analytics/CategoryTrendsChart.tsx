import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { TrendingUp } from 'lucide-react';
import { LABEL_COLORS } from './ClassificationDonutChart';

export interface DailyLabelData {
  date: string;
  [label: string]: string | number;
}

interface Props {
  data: DailyLabelData[];
  isLoading: boolean;
}

const LABELS = [
  'Missing Functionality',
  'Change Request',
  'Usability Issue',
  'Bug / Troubleshooting',
  'Generic Question',
  'Out of Scope',
];

export const CategoryTrendsChart = ({ data, isLoading }: Props) => {
  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-primary border-t-transparent" />
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
        <TrendingUp className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No trend data available yet.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
        <YAxis allowDecimals={false} tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
            fontSize: '12px',
          }}
        />
        <Legend wrapperStyle={{ paddingTop: '12px', fontSize: '11px' }} />
        {LABELS.map((label) => (
          <Bar
            key={label}
            dataKey={label}
            stackId="a"
            fill={LABEL_COLORS[label] ?? 'hsl(220,10%,55%)'}
            name={label}
          />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
};
