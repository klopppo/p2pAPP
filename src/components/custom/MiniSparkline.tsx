import { LineChart, Line, ResponsiveContainer } from 'recharts'

interface MiniSparklineProps {
  data: number[]
  color?: string
}

export function MiniSparkline({ data, color = 'var(--success)' }: MiniSparklineProps) {
  const chartData = data.map((value) => ({ value }))

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
