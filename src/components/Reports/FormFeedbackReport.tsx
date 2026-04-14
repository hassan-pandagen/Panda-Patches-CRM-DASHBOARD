import React, { useMemo, useState } from 'react';
import { useFormFeedback } from '../../hooks/useFormFeedback';
import { localMidnightISO, localNextDayISO } from '../../utils/dateFilters';
import { FormFeedback, FormFeedbackRating, FormFeedbackType } from '../../types';
import { DateRange } from '../ui/DateRangeFilter';
import SpotlightCard from '../ui/SpotlightCard';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, BarChart, Bar, XAxis, YAxis } from 'recharts';
import { motion, Variants } from 'framer-motion';
import { MessageCircle, SmilePlus, Meh, Frown, Filter, ExternalLink } from 'lucide-react';
import { TooltipProps } from 'recharts';
import { NameType, ValueType } from 'recharts/types/component/DefaultTooltipContent';

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 100, damping: 15 } },
};

const RATING_CONFIG: Record<FormFeedbackRating, { label: string; color: string; icon: React.ReactNode; bg: string }> = {
  easy: { label: 'Easy', color: '#10B981', icon: <SmilePlus className="w-5 h-5" />, bg: 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' },
  okay: { label: 'Okay', color: '#EAB308', icon: <Meh className="w-5 h-5" />, bg: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/20' },
  difficult: { label: 'Difficult', color: '#EF4444', icon: <Frown className="w-5 h-5" />, bg: 'bg-red-400/10 text-red-400 border-red-400/20' },
};

const FORM_TYPE_LABELS: Record<FormFeedbackType, string> = {
  hero_quote: 'Hero Quote',
  bulk_quote: 'Bulk Quote',
  calculator_quote: 'Calculator Quote',
};

const FORM_TYPE_COLORS: Record<string, string> = {
  hero_quote: '#3B82F6',
  bulk_quote: '#8B5CF6',
  calculator_quote: '#06B6D4',
};

const CustomTooltip: React.FC<TooltipProps<ValueType, NameType>> = ({ active, payload }) => {
  if (active && payload && payload.length > 0) {
    const item = payload[0];
    if (!item) return null;
    return (
      <div className="p-3 bg-slate-800/90 backdrop-blur-md border border-white/10 rounded-xl shadow-lg">
        <p className="text-sm font-semibold text-white">{item.name}</p>
        <p className="text-sm text-cyan-400">{typeof item.value === 'number' ? item.value : item.value} responses</p>
      </div>
    );
  }
  return null;
};

interface FormFeedbackReportProps {
  dateRange: DateRange;
}

const FormFeedbackReport: React.FC<FormFeedbackReportProps> = ({ dateRange }) => {
  const { data: feedback = [], isLoading } = useFormFeedback(
    localMidnightISO(dateRange.startDate),
    localNextDayISO(dateRange.endDate)
  );

  const [filterType, setFilterType] = useState<string>('all');
  const [filterRating, setFilterRating] = useState<string>('all');

  // Filter feedback
  const filtered = useMemo(() => {
    return feedback.filter(f => {
      if (filterType !== 'all' && f.formType !== filterType) return false;
      if (filterRating !== 'all' && f.rating !== filterRating) return false;
      return true;
    });
  }, [feedback, filterType, filterRating]);

  // Stats
  const stats = useMemo(() => {
    const total = feedback.length;
    const easy = feedback.filter(f => f.rating === 'easy').length;
    const okay = feedback.filter(f => f.rating === 'okay').length;
    const difficult = feedback.filter(f => f.rating === 'difficult').length;
    const withComments = feedback.filter(f => f.comment).length;

    return {
      total,
      easy,
      okay,
      difficult,
      withComments,
      easyPct: total > 0 ? Math.round((easy / total) * 100) : 0,
      okayPct: total > 0 ? Math.round((okay / total) * 100) : 0,
      difficultPct: total > 0 ? Math.round((difficult / total) * 100) : 0,
    };
  }, [feedback]);

  // Rating distribution for pie chart
  const ratingData = useMemo(() => {
    return [
      { name: 'Easy', value: stats.easy, color: RATING_CONFIG.easy.color },
      { name: 'Okay', value: stats.okay, color: RATING_CONFIG.okay.color },
      { name: 'Difficult', value: stats.difficult, color: RATING_CONFIG.difficult.color },
    ].filter(d => d.value > 0);
  }, [stats]);

  // Form type breakdown for bar chart
  const formTypeData = useMemo(() => {
    const counts: Record<string, { easy: number; okay: number; difficult: number }> = {};
    feedback.forEach(f => {
      if (!counts[f.formType]) counts[f.formType] = { easy: 0, okay: 0, difficult: 0 };
      counts[f.formType][f.rating]++;
    });
    return Object.entries(counts).map(([type, data]) => ({
      name: FORM_TYPE_LABELS[type as FormFeedbackType] || type,
      ...data,
    }));
  }, [feedback]);

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
                <p className="text-sm font-medium text-slate-400 mb-1">Total Responses</p>
                <p className="text-3xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-slate-500 mt-1">{stats.withComments} with comments</p>
              </div>
              <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl">
                <MessageCircle className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </SpotlightCard>
        </motion.div>

        {(['easy', 'okay', 'difficult'] as FormFeedbackRating[]).map(rating => {
          const config = RATING_CONFIG[rating];
          const count = stats[rating];
          const pct = stats[`${rating}Pct` as keyof typeof stats];
          return (
            <motion.div key={rating} variants={cardVariants}>
              <SpotlightCard className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-400 mb-1">{config.label}</p>
                    <p className="text-3xl font-bold" style={{ color: config.color }}>{count}</p>
                    <p className="text-xs text-slate-500 mt-1">{pct}% of total</p>
                  </div>
                  <div className="p-3 bg-gradient-to-br from-white/10 to-white/5 rounded-xl" style={{ color: config.color }}>
                    {config.icon}
                  </div>
                </div>
              </SpotlightCard>
            </motion.div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Rating Distribution Pie */}
        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <SmilePlus className="w-4 h-4 text-emerald-400" />
              Rating Distribution
            </h4>
            {ratingData.length === 0 ? (
              <div className="text-center py-10 text-slate-600 text-sm">No feedback yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie
                    data={ratingData}
                    cx="50%"
                    cy="50%"
                    innerRadius={70}
                    outerRadius={100}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {ratingData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
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

        {/* Form Type Breakdown Stacked Bar */}
        <motion.div variants={cardVariants}>
          <SpotlightCard className="p-6">
            <h4 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
              <Filter className="w-4 h-4 text-blue-400" />
              Feedback by Form Type
            </h4>
            {formTypeData.length === 0 ? (
              <div className="text-center py-10 text-slate-600 text-sm">No feedback yet</div>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={formTypeData} layout="vertical" margin={{ left: 10, right: 20 }}>
                  <XAxis type="number" stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                  <YAxis dataKey="name" type="category" width={120} stroke="#475569" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="easy" name="Easy" stackId="a" fill={RATING_CONFIG.easy.color} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="okay" name="Okay" stackId="a" fill={RATING_CONFIG.okay.color} />
                  <Bar dataKey="difficult" name="Difficult" stackId="a" fill={RATING_CONFIG.difficult.color} radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </SpotlightCard>
        </motion.div>
      </div>

      {/* Feedback Table with Filters */}
      <motion.div variants={cardVariants}>
        <SpotlightCard className="p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h4 className="text-base font-semibold text-white flex items-center gap-2">
              <MessageCircle className="w-4 h-4 text-cyan-400" />
              All Responses
            </h4>
            <div className="flex gap-2 flex-wrap">
              {/* Form Type Filter */}
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-orange/50"
              >
                <option value="all">All Forms</option>
                <option value="hero_quote">Hero Quote</option>
                <option value="bulk_quote">Bulk Quote</option>
                <option value="calculator_quote">Calculator Quote</option>
              </select>
              {/* Rating Filter */}
              <select
                value={filterRating}
                onChange={(e) => setFilterRating(e.target.value)}
                className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:ring-1 focus:ring-brand-orange/50"
              >
                <option value="all">All Ratings</option>
                <option value="easy">Easy</option>
                <option value="okay">Okay</option>
                <option value="difficult">Difficult</option>
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-10 text-slate-600 text-sm">
              {feedback.length === 0
                ? 'No form feedback recorded this period.'
                : 'No results match your filters.'}
            </div>
          ) : (
            <>
              {/* Desktop Table */}
              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-700/50">
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Date</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Form Type</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Rating</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Comment</th>
                      <th className="text-left py-2 px-3 text-slate-400 font-medium">Page</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(f => {
                      const ratingConfig = RATING_CONFIG[f.rating];
                      return (
                        <tr key={f.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                          <td className="py-2.5 px-3 text-slate-400 text-xs whitespace-nowrap">
                            {new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                            <br />
                            <span className="text-slate-600">
                              {new Date(f.createdAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span
                              className="text-xs px-2 py-0.5 rounded-md font-medium"
                              style={{
                                color: FORM_TYPE_COLORS[f.formType] || '#94A3B8',
                                backgroundColor: (FORM_TYPE_COLORS[f.formType] || '#94A3B8') + '15',
                              }}
                            >
                              {FORM_TYPE_LABELS[f.formType] || f.formType}
                            </span>
                          </td>
                          <td className="py-2.5 px-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${ratingConfig.bg}`}>
                              {ratingConfig.label}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-300 text-xs max-w-[300px]">
                            {f.comment || <span className="text-slate-600">—</span>}
                          </td>
                          <td className="py-2.5 px-3">
                            {f.pageUrl ? (
                              <a
                                href={f.pageUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-blue-400 hover:underline inline-flex items-center gap-1"
                              >
                                {f.pageUrl.replace(/https?:\/\/(www\.)?/, '').split('/').slice(1).join('/') || '/'}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            ) : (
                              <span className="text-slate-600 text-xs">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Mobile Cards */}
              <div className="md:hidden space-y-3">
                {filtered.map(f => {
                  const ratingConfig = RATING_CONFIG[f.rating];
                  return (
                    <div key={f.id} className="bg-slate-800/30 border border-slate-700/50 rounded-lg p-3">
                      <div className="flex items-center justify-between mb-2">
                        <span
                          className="text-xs px-2 py-0.5 rounded-md font-medium"
                          style={{
                            color: FORM_TYPE_COLORS[f.formType] || '#94A3B8',
                            backgroundColor: (FORM_TYPE_COLORS[f.formType] || '#94A3B8') + '15',
                          }}
                        >
                          {FORM_TYPE_LABELS[f.formType] || f.formType}
                        </span>
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border ${ratingConfig.bg}`}>
                          {ratingConfig.label}
                        </span>
                      </div>
                      {f.comment && <p className="text-sm text-slate-300 mb-2">{f.comment}</p>}
                      <div className="flex items-center justify-between text-xs text-slate-500">
                        <span>{new Date(f.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        {f.pageUrl && (
                          <a href={f.pageUrl} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline inline-flex items-center gap-1">
                            View Page <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </SpotlightCard>
      </motion.div>
    </motion.div>
  );
};

export default FormFeedbackReport;
