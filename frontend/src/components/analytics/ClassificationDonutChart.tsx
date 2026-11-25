import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Tag } from 'lucide-react';

export const LABEL_COLORS: Record<string, string> = {
  'Missing Functionality': 'hsl(220, 70%, 50%)',
  'Change Request':        'hsl(270, 65%, 55%)',
  'Usability Issue':       'hsl(38, 92%, 50%)',
  'Bug / Troubleshooting': 'hsl(0, 72%, 51%)',
  'Generic Question':      'hsl(142, 76%, 36%)',
  'Out of Scope':          'hsl(220, 10%, 55%)',
};

export interface LabelCount {
  label: string;
  count: number;
}

interface Props {
  data: LabelCount[];
  isLoading: boolean;
}

export const ClassificationDonutChart = ({ data, isLoading }: Props) => {
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
        <Tag className="h-8 w-8 mb-2 opacity-50" />
        <p className="text-sm">No classified sessions yet. Run the classification pipeline to see results.</p>
      </div>
    );
  }

  const chartData = data.map((d) => ({
    name: d.label,
    value: d.count,
    fill: LABEL_COLORS[d.label] ?? 'hsl(220, 10%, 55%)',
  }));

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie
          data={chartData}
          cx="50%"
          cy="50%"
          innerRadius={55}
          outerRadius={95}
          paddingAngle={3}
          dataKey="value"
          label={({ percent }) => percent > 0 ? `${(percent * 100).toFixed(0)}%` : ''}
          labelLine={false}
        >
          {chartData.map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.fill} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--background))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px',
          }}
          formatter={(value: number, name: string) => [`${value} sessions`, name]}
        />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          wrapperStyle={{ paddingLeft: '16px', fontSize: '12px' }}
          formatter={(value: string) => (
            <span className="text-sm text-foreground">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
};
