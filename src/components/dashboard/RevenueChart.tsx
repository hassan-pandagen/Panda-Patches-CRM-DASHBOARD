import React from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from 'recharts';
import { useNavigate } from 'react-router-dom';
import { TrendingUp } from 'lucide-react';

interface RevenueChartProps {
  data: { date: string; revenue: number }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
  // ✅ DAY 3 FIX: Add array bounds check
  if (active && payload && payload.length > 0) {
    const firstItem = payload[0];
    if (!firstItem || typeof firstItem.value !== 'number') return null;
    
    return (
      <div className="bg-slate-800 border border-slate-700 p-3 rounded-lg shadow-xl">
        <p className="text-slate-300 text-xs mb-1">{label || 'Date'}</p>
        <p className="text-brand-orange font-bold text-lg">
          ${firstItem.value.toLocaleString()}
        </p>
        <p className="text-xs text-slate-500 mt-1">Click to view orders</p>
      </div>
    );
  }
  return null;
};

const RevenueChart = ({ data }: RevenueChartProps) => {
  const navigate = useNavigate();

  // Handler for clicking a data point
  const handleChartClick = (data: any) => {
    // ✅ DAY 3 FIX: Add array bounds check
    if (data && data.activePayload && data.activePayload.length > 0) {
      const firstItem = data.activePayload[0];
      if (!firstItem || !firstItem.payload) return;
      
      const clickedDateStr = firstItem.payload.date; // This is likely "Nov 14" or similar from your data formatting
      
      // We need to convert "Nov 14" back to a real date string for the filter "2025-11-14"
      // Assuming the chart data comes from current year:
      const currentYear = new Date().getFullYear();
      const dateObj = new Date(`${clickedDateStr}, ${currentYear}`);
      
      // Format to YYYY-MM-DD for the URL
      // Note: using CA/SE locale usually gives YYYY-MM-DD
      const isoDate = dateObj.toLocaleDateString('en-CA'); 
      
      navigate(`/orders?date=${isoDate}`);
    }
  };

  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl h-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-brand-orange/10 rounded-lg">
          <TrendingUp className="w-5 h-5 text-brand-orange" />
        </div>
        <h3 className="text-lg font-semibold text-white">Revenue Trend (Last 7 days)</h3>
      </div>

      <div className="h-[300px] w-full cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data}
            margin={{ top: 10, right: 10, left: 0, bottom: 0 }}
            onClick={handleChartClick} // <--- THIS MAKES IT CLICKABLE
          >
            <defs>
              <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#FB6E1D" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#FB6E1D" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis 
              dataKey="date" 
              stroke="#94A3B8" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false} 
            />
            <YAxis 
              stroke="#94A3B8" 
              fontSize={12} 
              tickLine={false} 
              axisLine={false}
              tickFormatter={(value) => `$${value}`} 
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#FB6E1D', strokeWidth: 1, strokeDasharray: '5 5' }} />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="#FB6E1D"
              strokeWidth={3}
              fillOpacity={1}
              fill="url(#colorRevenue)"
              activeDot={{ r: 6, strokeWidth: 0, fill: '#fff' }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};

export default RevenueChart;
