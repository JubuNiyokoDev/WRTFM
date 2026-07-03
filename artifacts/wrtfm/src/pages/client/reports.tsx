import { useGetTaskTypeBreakdown, useGetAutomationStats, useListCampaigns } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, Legend, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function ClientReports() {
  const { data: typeData, isLoading: isTypeLoading } = useGetTaskTypeBreakdown();
  const { data: autoStats, isLoading: isAutoLoading } = useGetAutomationStats();
  const { data: campaigns, isLoading: isCampLoading } = useListCampaigns({ limit: 100 });

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const pieData = typeData?.map(d => ({
    name: d.taskType.replace('_', ' ').toUpperCase(),
    value: d.count
  })) || [];

  const spendData = campaigns?.items?.map(c => ({
    name: c.title.substring(0, 15) + '...',
    spent: c.spent,
    budget: c.budget
  })).slice(0, 10) || [];

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-display font-bold tracking-tight">Reports</h1>
          <p className="text-muted-foreground">Analytics and exports for your campaigns.</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Download className="w-4 h-4" /> Export CSV
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Task Distribution</CardTitle>
            <CardDescription>Breakdown by action type</CardDescription>
          </CardHeader>
          <CardContent>
            {isTypeLoading ? <Skeleton className="h-[300px] w-full" /> : (
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Automation Efficiency</CardTitle>
            <CardDescription>Engine performance metrics</CardDescription>
          </CardHeader>
          <CardContent>
            {isAutoLoading ? <Skeleton className="h-[300px] w-full" /> : (
              <div className="space-y-8 mt-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="font-medium text-muted-foreground">Overall Automation Rate</span>
                    <span className="font-mono font-bold">{autoStats?.overallRate || 0}%</span>
                  </div>
                  <div className="h-4 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-primary" style={{ width: `${autoStats?.overallRate || 0}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 border border-border rounded-lg bg-card text-center">
                    <div className="text-3xl font-mono font-bold text-chart-2 mb-1">{autoStats?.autoApproved || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase">Auto Approved</div>
                  </div>
                  <div className="p-4 border border-border rounded-lg bg-card text-center">
                    <div className="text-3xl font-mono font-bold text-destructive mb-1">{autoStats?.autoRejected || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase">Auto Rejected</div>
                  </div>
                  <div className="p-4 border border-border rounded-lg bg-card text-center col-span-2">
                    <div className="text-xl font-mono font-bold text-chart-4 mb-1">{autoStats?.manualReview || 0}</div>
                    <div className="text-xs font-medium text-muted-foreground uppercase">Routed to Manual Review</div>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Spend vs Budget</CardTitle>
          <CardDescription>Recent campaign financial status</CardDescription>
        </CardHeader>
        <CardContent>
          {isCampLoading ? <Skeleton className="h-[300px] w-full" /> : (
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={spendData} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                  <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(val) => `$${val}`} />
                  <RechartsTooltip 
                    cursor={{ fill: 'hsl(var(--muted))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    formatter={(value) => [`$${value}`, undefined]}
                  />
                  <Legend />
                  <Bar dataKey="spent" name="Spent" fill="hsl(var(--chart-1))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="budget" name="Total Budget" fill="hsl(var(--muted))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
