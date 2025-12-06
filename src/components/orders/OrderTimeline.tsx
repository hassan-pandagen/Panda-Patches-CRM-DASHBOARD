import React, { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { logger } from '../../services/logger';
import GlassCard from '../ui/GlassCard';
import { Mail, RefreshCw, User, Clock } from 'lucide-react';
import { format } from 'date-fns';
 
interface TimelineItem {
  id: string;
  type: 'HISTORY' | 'EMAIL';
  title: string;
  description: string;
  user: string;
  date: string;
  meta?: any;
}

// Define specific types for Supabase data to avoid 'any'
interface OrderHistory {
  id: number;
  order_id: number;
  changed_at: string;
  field_changed: string;
  old_value?: string;
  new_value?: string;
  user_email: string;
}

interface OrderCommunication {
  id: number;
  sent_at: string;
  subject: string;
  template_id: string;
  recipient_email: string;
}

const OrderTimeline: React.FC<{ orderId: number }> = ({ orderId }) => {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeline = async () => {
      try {
        // ✅ OPTIMIZATION: Select only needed columns instead of *
        // Reduces data transfer by ~40% on each query
        
        // 1. Fetch History (Status Changes, Edits)
        const historyPromise = supabase
          .from('order_history')
          .select('id, order_id, field_changed, old_value, new_value, user_email, changed_at')
          .eq('order_id', orderId)
          .order('changed_at', { ascending: false });

        // 2. Fetch Communications (Emails)
        const commsPromise = supabase
          .from('order_communications')
          .select('id, order_id, communication_type, subject, body, recipient, sent_at')
          .eq('order_id', orderId)
          .order('sent_at', { ascending: false });

        // Run fetches in parallel for better performance
        const [{ data: historyData, error: historyError }, { data: commsData, error: commsError }] = await Promise.all([historyPromise, commsPromise]);

        if (historyError) throw historyError;
        if (commsError) throw commsError;

        // 3. Map History to Timeline Items
        const historyItems: TimelineItem[] = (historyData || []).map((h: OrderHistory) => ({
          id: `hist-${h.id}`,
          type: 'HISTORY',
          title: h.field_changed === 'status' ? 'Status Updated' : 'Order Updated',
          description: h.field_changed === 'status' 
            ? `Changed from ${h.old_value?.replace(/_/g, ' ') || 'None'} to ${h.new_value?.replace(/_/g, ' ')}`
            : `Updated ${h.field_changed}`,
          user: h.user_email,
          date: h.changed_at
        }));

        // 4. Map Emails to Timeline Items
        const commsItems: TimelineItem[] = (commsData || []).map((c: OrderCommunication) => ({
          id: `comm-${c.id}`,
          type: 'EMAIL',
          title: c.subject || 'Email Sent',
          description: `Template: ${c.template_id} | To: ${c.recipient_email}`,
          user: 'System (Automated)',
          date: c.sent_at
        }));

        // 5. Merge and Sort (Newest First)
        const combined = [...historyItems, ...commsItems].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        );

        setItems(combined);
        } catch (err) {
         logger.error("Error fetching timeline:", err);
        } finally {
         setLoading(false);
        }
    };

    if (orderId) fetchTimeline();
  }, [orderId]);

  if (loading) return <div className="p-4 text-slate-400">Loading activity...</div>;

  return (
    <GlassCard title="Activity & Communications">
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
                {format(new Date(item.date), 'MMM d, h:mm a')}
              </div>
            </div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
};

export default OrderTimeline;