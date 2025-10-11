import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { api } from '@/lib/api';
import {
  Download,
  RefreshCw,
  TrendingUp,
  DollarSign,
  Zap,
  Calendar,
  FileText
} from 'lucide-react';

interface UsageData {
  provider: string;
  model: string;
  request_count: number;
  total_input_tokens: number;
  total_output_tokens: number;
  total_cost: number;
  avg_response_time: number;
}

export function UsageDashboard() {
  const { t } = useTranslation();
  const [summary, setSummary] = useState<UsageData[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    end: new Date()
  });
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchUsageData();
  }, [dateRange]);

  const fetchUsageData = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString()
      });
      const data = await api.get<UsageData[]>(`/usage/summary?${params}`);
      setSummary(data || []);
    } catch (error) {
      console.error('Failed to fetch usage data:', error);
      setSummary([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchUsageData();
    setRefreshing(false);
  };

  const handleExport = async (format: 'json' | 'csv') => {
    try {
      const params = new URLSearchParams({
        format,
        startDate: dateRange.start.toISOString(),
        endDate: dateRange.end.toISOString()
      });
      const response = await api.get(`/usage/export?${params}`);

      if (format === 'csv') {
        const blob = new Blob([response as string], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `usage_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Failed to export data:', error);
    }
  };

  const totalCost = summary.reduce((acc, item) => acc + (item.total_cost || 0), 0);
  const totalTokens = summary.reduce((acc, item) =>
    acc + (item.total_input_tokens || 0) + (item.total_output_tokens || 0), 0
  );
  const totalRequests = summary.reduce((acc, item) => acc + (item.request_count || 0), 0);
  const avgResponseTime = summary.length > 0
    ? summary.reduce((acc, item) => acc + (item.avg_response_time || 0), 0) / summary.length
    : 0;

  const formatNumber = (num: number) => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toFixed(0);
  };

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">{t('usage.dashboard_title', 'Usage Analytics')}</h2>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {t('usage.refresh', 'Refresh')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('csv')}
          >
            <Download className="h-4 w-4 mr-1" />
            CSV
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleExport('json')}
          >
            <FileText className="h-4 w-4 mr-1" />
            JSON
          </Button>
        </div>
      </div>

      {/* Date Range Selector */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center text-sm">
            <Calendar className="h-4 w-4 mr-2" />
            {t('usage.date_range', 'Date Range')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 items-center">
            <input
              type="date"
              value={dateRange.start.toISOString().split('T')[0]}
              onChange={(e) => setDateRange(prev => ({ ...prev, start: new Date(e.target.value) }))}
              className="px-3 py-1 border rounded"
            />
            <span>{t('usage.to', 'to')}</span>
            <input
              type="date"
              value={dateRange.end.toISOString().split('T')[0]}
              onChange={(e) => setDateRange(prev => ({ ...prev, end: new Date(e.target.value) }))}
              className="px-3 py-1 border rounded"
            />
            <div className="flex gap-2 ml-auto">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateRange({
                  start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
                  end: new Date()
                })}
              >
                {t('usage.last_7_days', '7 Days')}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setDateRange({
                  start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                  end: new Date()
                })}
              >
                {t('usage.last_30_days', '30 Days')}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('usage.total_cost', 'Total Cost')}</span>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${totalCost.toFixed(4)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('usage.cost_period', 'For selected period')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('usage.total_tokens', 'Total Tokens')}</span>
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(totalTokens)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('usage.tokens_processed', 'Tokens processed')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('usage.total_requests', 'Total Requests')}</span>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatNumber(totalRequests)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('usage.api_calls', 'API calls made')}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between">
              <span className="text-sm font-medium">{t('usage.avg_response', 'Avg Response')}</span>
              <Zap className="h-4 w-4 text-muted-foreground" />
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {avgResponseTime.toFixed(0)}ms
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {t('usage.response_time', 'Response time')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Usage Table */}
      <Card>
        <CardHeader>
          <CardTitle>{t('usage.model_breakdown', 'Usage by Model')}</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : summary.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {t('usage.no_data', 'No usage data for selected period')}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-2">{t('usage.provider', 'Provider')}</th>
                    <th className="text-left p-2">{t('usage.model', 'Model')}</th>
                    <th className="text-right p-2">{t('usage.requests', 'Requests')}</th>
                    <th className="text-right p-2">{t('usage.input_tokens', 'Input')}</th>
                    <th className="text-right p-2">{t('usage.output_tokens', 'Output')}</th>
                    <th className="text-right p-2">{t('usage.cost', 'Cost')}</th>
                    <th className="text-right p-2">{t('usage.avg_time', 'Avg Time')}</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.map((item, idx) => (
                    <tr key={idx} className="border-b hover:bg-muted/50">
                      <td className="p-2">
                        <span className="font-medium">{item.provider}</span>
                      </td>
                      <td className="p-2">
                        <span className="text-xs bg-muted px-2 py-1 rounded">
                          {item.model}
                        </span>
                      </td>
                      <td className="text-right p-2">
                        {formatNumber(item.request_count)}
                      </td>
                      <td className="text-right p-2 text-muted-foreground">
                        {formatNumber(item.total_input_tokens)}
                      </td>
                      <td className="text-right p-2 text-muted-foreground">
                        {formatNumber(item.total_output_tokens)}
                      </td>
                      <td className="text-right p-2 font-medium">
                        ${item.total_cost.toFixed(4)}
                      </td>
                      <td className="text-right p-2 text-muted-foreground">
                        {item.avg_response_time.toFixed(0)}ms
                      </td>
                    </tr>
                  ))}
                  {/* Total Row */}
                  <tr className="font-bold bg-muted/30">
                    <td className="p-2" colSpan={2}>
                      {t('usage.total', 'Total')}
                    </td>
                    <td className="text-right p-2">
                      {formatNumber(totalRequests)}
                    </td>
                    <td className="text-right p-2">
                      {formatNumber(summary.reduce((acc, item) => acc + item.total_input_tokens, 0))}
                    </td>
                    <td className="text-right p-2">
                      {formatNumber(summary.reduce((acc, item) => acc + item.total_output_tokens, 0))}
                    </td>
                    <td className="text-right p-2">
                      ${totalCost.toFixed(4)}
                    </td>
                    <td className="text-right p-2">
                      {avgResponseTime.toFixed(0)}ms
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cost Breakdown Pie Chart (simplified representation) */}
      {!loading && summary.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('usage.cost_distribution', 'Cost Distribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {summary
                .sort((a, b) => b.total_cost - a.total_cost)
                .slice(0, 5)
                .map((item, idx) => {
                  const percentage = (item.total_cost / totalCost) * 100;
                  return (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="w-32 text-sm truncate">
                        {item.provider}/{item.model}
                      </div>
                      <div className="flex-1 bg-muted rounded-full h-6 relative overflow-hidden">
                        <div
                          className="absolute inset-y-0 left-0 bg-primary/80 rounded-full transition-all"
                          style={{ width: `${percentage}%` }}
                        />
                        <span className="absolute inset-0 flex items-center justify-center text-xs">
                          {percentage.toFixed(1)}%
                        </span>
                      </div>
                      <div className="text-sm w-20 text-right">
                        ${item.total_cost.toFixed(2)}
                      </div>
                    </div>
                  );
                })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}