import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend } from 'recharts';
import { Order, OrderNote, NoteType } from '../../types';
import { fetchNotesForReport } from '../../hooks/useOrderNotes';
import { queryKeys } from '../../constants/queryKeys';
import { localMidnightISO, localNextDayISO } from '../../utils/dateFilters';
import SpotlightCard from '../ui/SpotlightCard';
import { Star, ThumbsUp, ThumbsDown, MessageSquare, AlertTriangle, Phone, FileText, TrendingUp } from 'lucide-react';
import { motion, Variants } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { DateRange } from '../ui/DateRangeFilter';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } },
};

const RATING_COLORS: Record<number, string> = {
  1: '#EF4444', // Red
  2: '#F97316', // Orange
  3: '#EAB308', // Yellow
  4: '#22C55E', // Green
  5: '#10B981', // Emerald
};

const RATING_LABELS: Record<number, string> = {
  1: 'Terrible',
  2: 'Poor',
  3: 'Average',
  4: 'Good',
  5: 'Excellent',
};

const NOTE_TYPE_COLORS: Record<string, string> = {
  quality_feedback: '#EAB308',
  customer_call: '#3B82F6',
  complaint: '#EF4444',
  general: '#94A3B8',
};

const NOTE_TYPE_LABELS: Record<string, string> = {
  quality_feedback: 'Quality Feedback',
  customer_call: 'Customer Call',
  complaint: 'Complaint',
  general: 'General',
};

const CustomTooltip: React.FC<TooltipProps<ValueType, NameType>> = ({ active, payload, label }) => {
  if (active && payload && payload.length > 0) {
    const firstItem = payload[0];
    if (!firstItem) return null;
    return (
      <div className="p-3 bg-slate-800/90 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
        <p className="text-sm font-semibold text-white">{label || firstItem.name}</p>
        <p className="text-sm text-cyan-400">
          {firstItem.name || 'Count'}: {typeof firstItem.value === 'number' ? firstItem.value.toLocaleString() : firstItem.value}
        </p>
      </div>
    );
  }
  return null;
};

interface CustomerFeedbackReportProps {
  orders: Order[];
  dateRange: DateRange;
}

const CustomerFeedbackReport: React.FC<CustomerFeedbackReportProps> = ({ orders, dateRange }) => {
  const navigate = useNavigate();

  // Fetch notes for the date range
  const { data: notes = [], isLoading } = useQuery({
    queryKey: queryKeys.orderNotes.report(dateRange.startDate, dateRange.endDate),
    queryFn: () => fetchNotesForReport(
      localMidnightISO(dateRange.startDate),
      localNextDayISO(dateRange.endDate)
    ),
    enabled: !!dateRange.startDate && !!dateRange.endDate,
  });

  // Computed stats
  const stats = useMemo(() => {
    const qualityNotes = notes.filter(n => n.noteType === 'quality_feedback' && n.rating);
    const complaints = notes.filter(n => n.noteType === 'complaint');
    const totalRated = qualityNotes.length;
    const avgRating = totalRated > 0
      ? qualityNotes.reduce((sum, n) => sum + (n.rating || 0), 0) / totalRated
      : 0;
    const goodReviews = qualityNotes.filter(n => (n.rating || 0) >= 4).length;
    const badReviews = qualityNotes.filter(n => (n.rating || 0) <= 2).length;
    const neutralReviews = qualityNotes.filter(n => (n.rating || 0) === 3).length;

    return { totalNotes: notes.length, totalRated, avgRating, goodReviews, badReviews, neutralReviews, complaints: complaints.length };
  }, [notes]);

  // Rating distribution data for bar chart
  const ratingDistribution = useMemo(() => {
    const dist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    notes.forEach(n => {
      if (n.noteType === 'quality_feedback' && n.rating) {
        dist[n.rating] = (dist[n.rating] || 0) + 1;
      }
    });
    return [1, 2, 3, 4, 5].map(r => ({
      name: `${r} Star${r > 1 ? 's' : ''} - ${RATING_LABELS[r]}`,
      count: dist[r],
      rating: r,
    }));
  }, [notes]);

  // Note type distribution for pie chart
  const typeDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    notes.forEach(n => {
      dist[n.noteType] = (dist[n.noteType] || 0) + 1;
    });
    return Object.entries(dist).map(([type, count]) => ({
      name: NOTE_TYPE_LABELS[type] || type,
      value: count,
      type,
    }));
  }, [notes]);

  // Orders with feedback vs without
  const feedbackCoverage = useMemo(() => {
    const ordersWithFeedback = new Set(notes.map(n => n.orderId));
    return {
      withFeedback: ordersWithFeedback.size,
      totalOrders: orders.length,
      percentage: orders.length > 0 ? Math.round((ordersWithFeedback.size / orders.length) * 100) : 0,
    };
  }, [notes, orders]);

  // Monthly trend (group by week)
  const weeklyTrend = useMemo(() => {
    const weeks: Record<string, { good: number; bad: number; total: number }> = {};
    notes.forEach(n => {
      if (n.noteType !== 'quality_feedback' || !n.rating) return;
      const d = new Date(n.createdAt);
      // Get week start (Monday)
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const weekStart = new Date(d.setDate(diff));
      const key = weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      if (!weeks[key]) weeks[key] = { good: 0, bad: 0, total: 0 };
      weeks[key].total++;
      if (n.rating >= 4) weeks[key].good++;
      if (n.rating <= 2) weeks[key].bad++;
    });
    return Object.entries(weeks).map(([week, data]) => ({
      week,
      ...data,
    }));
  }, [notes]);

  // Top issues (complaints content analysis)
  const recentFeedback = useMemo(() => {
    return notes.slice(0, 15); // Most recent 15 notes
  }, [notes]);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-orange" />
      </div>
    );
  }

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.1 } } }}
      className="space-y-6"
    >
      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 mb-1">Total Feedback</p>
                <p className="text-3xl font-bold text-white">{stats.totalNotes}</p>
                <p className="text-xs text-slate-500 mt-1">
                  {feedbackCoverage.percentage}% of orders covered
                </p>
              </div>
              <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                <MessageSquare className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 mb-1">Avg Rating</p>
                <p className="text-3xl font-bold text-white">
                  {stats.avgRating > 0 ? stats.avgRating.toFixed(1) : '—'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{stats.totalRated} rated reviews</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                <Star className="w-6 h-6 text-yellow-400" />
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 mb-1">Good Reviews</p>
                <p className="text-3xl font-bold text-emerald-400">{stats.goodReviews}</p>
                <p className="text-xs text-slate-500 mt-1">4-5 stars ({stats.totalRated > 0 ? Math.round((stats.goodReviews / stats.totalRated) * 100) : 0}%)</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                <ThumbsUp className="w-6 h-6 text-emerald-400" />
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-slate-400 mb-1">Bad Reviews</p>
                <p className="text-3xl font-bold text-red-400">{stats.badReviews}</p>
                <p className="text-xs text-slate-500 mt-1">1-2 stars ({stats.totalRated > 0 ? Math.round((stats.badReviews / stats.totalRated) * 100) : 0}%)</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                <ThumbsDown className="w-6 h-6 text-red-400" />
              </div>
            </div>
          </SpotlightCard>
        </motion.div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rating Distribution */}
        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Star className="w-4 h-4 text-yellow-400" />
              Rating Distribution
            </h4>
            {stats.totalRated === 0 ? (
              <div className="text-center py-10 text-slate-600 text-sm">No rated feedback yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={ratingDistribution} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={130} stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="count" name="Reviews" radius={[0, 6, 6, 0]}>
                    {ratingDistribution.map((entry) => (
                      <Cell key={entry.rating} fill={RATING_COLORS[entry.rating]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </SpotlightCard>
        </motion.div>

        {/* Note Type Breakdown */}
        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <FileText className="w-4 h-4 text-blue-400" />
              Feedback by Type
            </h4>
            {typeDistribution.length === 0 ? (
              <div className="text-center py-10 text-slate-600 text-sm">No feedback yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={typeDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {typeDistribution.map((entry) => (
                      <Cell key={entry.type} fill={NOTE_TYPE_COLORS[entry.type] || '#94A3B8'} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="bottom"
                    formatter={(value: string) => <span className="text-xs text-slate-300">{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </SpotlightCard>
        </motion.div>
      </div>

      {/* Complaints Summary */}
      {stats.complaints > 0 && (
        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-400" />
              Complaints ({stats.complaints})
            </h4>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notes.filter(n => n.noteType === 'complaint').map(note => (
                <div key={note.id} className="bg-red-500/5 border border-red-500/10 rounded-lg p-3 flex items-start gap-3">
                  <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-300">{note.content}</p>
                    <div className="flex items-center gap-3 mt-1.5">
                      {(note as any).orderNumber && (
                        <button
                          onClick={() => navigate(`/orders/${(note as any).orderNumber}`)}
                          className="text-xs text-brand-orange hover:underline"
                        >
                          {(note as any).orderNumber}
                        </button>
                      )}
                      {(note as any).customerName && (
                        <span className="text-xs text-slate-500">{(note as any).customerName}</span>
                      )}
                      <span className="text-xs text-slate-600">
                        {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-xs text-slate-600">by {note.userName || note.userEmail.split('@')[0]}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </SpotlightCard>
        </motion.div>
      )}

      {/* Recent Feedback Table */}
      <motion.div variants={cardVariants}>
        <SpotlightCard className="p-6">
          <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-cyan-400" />
            Recent Feedback
          </h4>
          {recentFeedback.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-sm">
              No feedback recorded this period. Sales team can add notes from any order's detail page.
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Date</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Order</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Customer</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Type</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Rating</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Note</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentFeedback.map(note => (
                      <tr key={note.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-400 text-xs whitespace-nowrap">
                          {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-2.5 px-3">
                          {(note as any).orderNumber ? (
                            <button
                              onClick={() => navigate(`/orders/${(note as any).orderNumber}`)}
                              className="text-brand-orange hover:underline text-xs font-medium"
                            >
                              {(note as any).orderNumber}
                            </button>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 text-xs max-w-[120px] truncate">
                          {(note as any).customerName || '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className="text-xs px-2 py-0.5 rounded-md font-medium"
                            style={{
                              color: NOTE_TYPE_COLORS[note.noteType] || '#94A3B8',
                              backgroundColor: (NOTE_TYPE_COLORS[note.noteType] || '#94A3B8') + '15',
                            }}
                          >
                            {NOTE_TYPE_LABELS[note.noteType] || note.noteType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {note.rating ? (
                            <div className="flex gap-0.5">
                              {[1, 2, 3, 4, 5].map(s => (
                                <Star
                                  key={s}
                                  className={`w-3 h-3 ${s <= note.rating! ? 'text-yellow-400' : 'text-slate-700'}`}
                                  fill={s <= note.rating! ? 'currentColor' : 'none'}
                                />
                              ))}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-xs">—</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-slate-300 text-xs max-w-[250px] truncate">
                          {note.content}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500 text-xs whitespace-nowrap">
                          {note.userName || note.userEmail.split('@')[0]}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {recentFeedback.map(note => (
                  <div key={note.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="text-xs px-2 py-0.5 rounded-md font-medium"
                        style={{
                          color: NOTE_TYPE_COLORS[note.noteType] || '#94A3B8',
                          backgroundColor: (NOTE_TYPE_COLORS[note.noteType] || '#94A3B8') + '15',
                        }}
                      >
                        {NOTE_TYPE_LABELS[note.noteType] || note.noteType}
                      </span>
                      {note.rating && (
                        <div className="flex gap-0.5">
                          {[1, 2, 3, 4, 5].map(s => (
                            <Star
                              key={s}
                              className={`w-3 h-3 ${s <= note.rating! ? 'text-yellow-400' : 'text-slate-700'}`}
                              fill={s <= note.rating! ? 'currentColor' : 'none'}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                    <p className="text-sm text-slate-300 mb-2">{note.content}</p>
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>
                        {(note as any).orderNumber && (
                          <button
                            onClick={() => navigate(`/orders/${(note as any).orderNumber}`)}
                            className="text-brand-orange hover:underline mr-2"
                          >
                            {(note as any).orderNumber}
                          </button>
                        )}
                        {(note as any).customerName || ''}
                      </span>
                      <span>
                        {new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                        {' · '}
                        {note.userName || note.userEmail.split('@')[0]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
};

export default CustomerFeedbackReport;
