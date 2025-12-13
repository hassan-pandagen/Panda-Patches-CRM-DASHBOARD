import React, { useMemo } from 'react';
import { logger } from '../../services/logger';
import SpotlightCard from '../ui/SpotlightCard';
import { Mail, RefreshCw, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { useOrderHistory } from '../../hooks/useOrderHistory';
import { useOrderCommunications } from '../../hooks/useOrderCommunications';
import { OrderHistoryEntry, OrderCommunication } from '../../types';
 
interface TimelineItem {
  id: string;
  type: 'HISTORY' | 'EMAIL';
  title: string;
  description: string;
  user: string;
  date: string;
  meta?: any;
}

const OrderTimeline: React.FC<{ orderId: number }> = ({ orderId }) => {
  // Use our new hooks to fetch data. TanStack Query handles loading, errors, and caching.
  const { data: historyData, isLoading: isHistoryLoading, isError: isHistoryError } = useOrderHistory(orderId);
  const { data: commsData, isLoading: isCommsLoading, isError: isCommsError } = useOrderCommunications(orderId);

  // Combine and sort the data only when the source data changes.
  const items = useMemo(() => {
    if (!historyData && !commsData) {
      return [];
    }

    // Map History to Timeline Items
    const historyItems: TimelineItem[] = (historyData || []).map((h: OrderHistoryEntry) => ({
      id: `hist-${h.id}`,
      type: 'HISTORY',
      title: h.field_changed === 'status' ? 'Status Updated' : `Field Updated: ${h.field_changed}`,
      description: h.field_changed === 'status' 
        ? `Changed from "${h.old_value?.replace(/_/g, ' ') || 'None'}" to "${h.new_value?.replace(/_/g, ' ')}"`
        : `Changed from "${h.old_value || 'empty'}" to "${h.new_value || 'empty'}"`,
      user: h.user_email,
      date: h.changed_at
    }));

    // Map Emails to Timeline Items
    const commsItems: TimelineItem[] = (commsData || []).map((c: OrderCommunication) => ({
      id: `comm-${c.id}`,
      type: 'EMAIL',
      title: c.subject || 'Email Sent',
      description: `To: ${c.recipient_email}${c.template_id ? ` | Template: ${c.template_id}` : ''}`,
      user: c.user_email || 'System (Automated)',
      date: c.sent_at
    }));

    // Merge and Sort (Newest First)
    return [...historyItems, ...commsItems].sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
    );
  }, [historyData, commsData]);

  if (isHistoryLoading || isCommsLoading) {
    return <div className="p-4 text-slate-400">Loading activity...</div>;
  }

  if (isHistoryError || isCommsError) {
    logger.error("Error fetching timeline data", { isHistoryError, isCommsError });
    return <div className="p-4 text-red-400">Failed to load activity.</div>;
  }

  return (
    <SpotlightCard className="p-6">
      <h3 className="text-lg font-semibold text-white mb-6">Activity & Communications</h3>
      <div className="relative border-l border-white/10 ml-3 space-y-8 py-2">
        
        {items.length === 0 && (
            <div className="ml-6 text-slate-500 text-sm">No activity recorded yet.</div>
        )}

        {items.map((item) => (
          <div key={item.id} className="relative ml-6 group">
            {/* Icon Bubble */}
            <span className={`absolute -left-[37px] top-0 flex h-8 w-8 items-center justify-center rounded-full ring-4 ring-[#0f172a] ${
              item.type === 'EMAIL' ? 'bg-blue-500/20 text-blue-400' : 'bg-brand-orange/20 text-brand-orange'
            }`}>
              {item.type === 'EMAIL' ? <Mail className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
            </span>

            {/* Content Card */}
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
              <div>
                <h4 className="text-sm font-bold text-white">{item.title}</h4>
                <p className="text-sm text-slate-400 mt-1">{item.description}</p>
                
                {/* User Info */}
                <div className="flex items-center gap-2 mt-2">
                    <div className="w-5 h-5 rounded-full bg-white/10 flex items-center justify-center">
                        <User className="w-3 h-3 text-slate-400" />
                    </div>
                    <span className="text-xs text-slate-500">{item.user}</span>
                </div>
              </div>

              {/* Date */}
              <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white/5 px-2 py-1 rounded-md whitespace-nowrap">
                <Clock className="w-3 h-3" />
                {item.date ? format(new Date(item.date), 'MMM d, h:mm a') : 'No date'}
              </div>
            </div>
          </div>
        ))}
      </div>
    </SpotlightCard>
  );
};

export default OrderTimeline;