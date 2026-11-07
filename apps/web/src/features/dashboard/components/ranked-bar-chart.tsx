import { BarChart3, Table2 } from 'lucide-react'
import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from 'recharts'
import { Button } from '@/components/ui/button'
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { ChartContainer, ChartTooltip, type ChartConfig } from '@/components/ui/chart'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface RankedDatum {
  key: string
  label: string
  value: number
}

interface RankedBarChartProps {
  title: string
  description?: string
  data: RankedDatum[]
  valueLabel: string
  format: (v: number) => string
  emptyText: string
}

/**
 * Ranked horizontal bars, one validated hue (dataviz: part-to-whole / magnitude comparison).
 * Thin bars, 4px rounded data-ends, recessive grid, per-bar hover tooltip, and a table view
 * so the data is never available through color/shape alone.
 */
export function RankedBarChart({ title, description, data, valueLabel, format, emptyText }: RankedBarChartProps) {
  const [view, setView] = useState<'chart' | 'table'>('chart')
  const config = { value: { label: valueLabel, color: 'var(--chart-bar)' } } satisfies ChartConfig
  const rows = data.slice(0, 10) // fold the tail: the table view lists everything
  const height = Math.max(120, rows.length * 34 + 24)

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {data.length > 0 && (
          <CardAction>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={view === 'chart' ? `Show ${title} as a table` : `Show ${title} as a chart`}
              onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
            >
              {view === 'chart' ? <Table2 /> : <BarChart3 />}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="text-muted-foreground py-8 text-center text-sm">{emptyText}</p>
        ) : view === 'table' ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead className="text-right">{valueLabel}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((d) => (
                <TableRow key={d.key}>
                  <TableCell>{d.label}</TableCell>
                  <TableCell className="text-right tabular-nums">{format(d.value)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <>
            <ChartContainer config={config} className="aspect-auto w-full" style={{ height }}>
              <BarChart data={rows} layout="vertical" margin={{ left: 4, right: 56, top: 4, bottom: 4 }} barCategoryGap={8}>
                <CartesianGrid horizontal={false} strokeDasharray="3 3" className="stroke-border" />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={132}
                  tickLine={false}
                  axisLine={false}
                  tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
                  tickFormatter={(v: string) => (v.length > 20 ? `${v.slice(0, 19)}…` : v)}
                />
                <ChartTooltip
                  cursor={{ fill: 'var(--muted)', opacity: 0.6 }}
                  content={({ active, payload }) =>
                    active && payload?.[0] ? (
                      <div className="bg-background rounded-md border px-2.5 py-1.5 text-xs shadow-md">
                        <p className="font-medium">{(payload[0].payload as RankedDatum).label}</p>
                        <p className="text-muted-foreground tabular-nums">
                          {valueLabel}: <span className="text-foreground font-medium">{format(Number(payload[0].value))}</span>
                        </p>
                      </div>
                    ) : null
                  }
                />
                <Bar
                  dataKey="value"
                  fill="var(--color-value)"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                  maxBarSize={16}
                  label={{ position: 'right', fontSize: 11, fill: 'var(--muted-foreground)', formatter: (v: unknown) => format(Number(v)) }}
                />
              </BarChart>
            </ChartContainer>
            {data.length > rows.length && (
              <p className="text-muted-foreground mt-2 text-xs">Top {rows.length} of {data.length}. Switch to the table for all.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
