// src/components/orders/AssignDigitizerSection.tsx
// Task 1.4 — the supervisor's "Assign Digitizer" panel. Used on both the order detail
// page and the quote detail page, because digitizing starts at quote stage (the free
// mockup precedes payment).
//
// Assignment is the moment the digitizer's window OPENS: the RPC sets the item to
// DIGITIZING / MOCKUP_ASSIGNED, and that state is what the window rule tests. Reassigning
// releases the previous digitizer in the same statement, so there is never an instant
// where both — or neither — can see the item.

import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { PenTool, Clock, AlertCircle } from 'lucide-react';
import Button from '../ui/Button';
import SpotlightCard from '../ui/SpotlightCard';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '@/hooks/useToast';
import { roleCan, ROLES_CAN_ASSIGN_DIGITIZER } from '../../utils/roleAccess';
import {
  getActiveDigitizers, assignDigitizer, getLiveAssignment,
} from '../../services/digitizerService';

interface Props {
  orderId?: number;
  quoteId?: number;
  /** Order status or quote mockup_state — shown so the supervisor can see the window. */
  currentState?: string;
  onAssigned?: () => void;
}

const AssignDigitizerSection: React.FC<Props> = ({ orderId, quoteId, currentState, onAssigned }) => {
  const { roles } = useAuth();
  const { success, error: showError } = useToast();
  const queryClient = useQueryClient();

  const canAssign = roleCan(roles, ROLES_CAN_ASSIGN_DIGITIZER);

  const [digitizerId, setDigitizerId] = React.useState('');
  const [dueAt, setDueAt] = React.useState('');

  const { data: digitizers } = useQuery({
    queryKey: ['active-digitizers'],
    queryFn: getActiveDigitizers,
    enabled: canAssign,
    staleTime: 1000 * 60 * 10,
  });

  const { data: live } = useQuery({
    queryKey: ['live-assignment', orderId ?? null, quoteId ?? null],
    queryFn: () => getLiveAssignment({ orderId, quoteId }),
    enabled: canAssign && (!!orderId || !!quoteId),
  });

  const assignMutation = useMutation({
    mutationFn: () => assignDigitizer({
      orderId: orderId ?? null,
      quoteId: quoteId ?? null,
      digitizerId,
      // A date input gives a local calendar day; send end-of-day so "due Friday" does not
      // silently mean "due 00:00 Friday", i.e. Thursday night.
      dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : null,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['live-assignment', orderId ?? null, quoteId ?? null] });
      success('Digitizer assigned', 'They can see this item now; it appears in their queue.');
      setDigitizerId('');
      setDueAt('');
      onAssigned?.();
    },
    onError: (err: any) => showError('Could not assign', err?.message || 'Try again.'),
  });

  if (!canAssign) return null;

  const assignedName = live
    ? digitizers?.find(d => d.id === live.digitizer_id)?.full_name
      ?? digitizers?.find(d => d.id === live.digitizer_id)?.email
      ?? 'a digitizer no longer active'
    : null;

  const noDigitizers = digitizers && digitizers.length === 0;

  return (
    <SpotlightCard className="p-6">
      <div className="flex items-center gap-2 mb-4">
        <PenTool className="w-5 h-5 text-violet-400" />
        <h3 className="text-lg font-bold text-white">Digitizing</h3>
      </div>

      {live ? (
        <div className="mb-4 p-3 rounded-lg bg-violet-500/10 border border-violet-500/30">
          <p className="text-sm text-white">
            Assigned to <strong>{assignedName}</strong>
          </p>
          <p className="text-xs text-slate-400 mt-1">
            Since {new Date(live.assigned_at).toLocaleDateString()}
            {live.due_at && <> · due {new Date(live.due_at).toLocaleDateString()}</>}
            {currentState && <> · state {currentState}</>}
          </p>
          <p className="text-xs text-slate-400 mt-2">
            Assigning someone else releases them immediately — they lose access on their next
            request, and their uploads and history stay on the item.
          </p>
        </div>
      ) : (
        <p className="text-sm text-slate-400 mb-4">
          Not assigned. Assigning moves this to <strong className="text-violet-300">
          {orderId ? 'Digitizing' : 'Mockup Assigned'}</strong>, which is what lets the
          digitizer see it.
        </p>
      )}

      {noDigitizers ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200">
            No active digitizer accounts yet. Create one in User Management — tick the
            <strong> Digitizer</strong> role — and it will appear here.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">
              {live ? 'Reassign to' : 'Assign to'}
            </label>
            <select
              value={digitizerId}
              onChange={(e) => setDigitizerId(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-violet-500/60 focus:border-violet-500"
            >
              <option value="">Choose a digitizer…</option>
              {(digitizers ?? []).map(d => (
                <option key={d.id} value={d.id}>{d.full_name || d.email}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs uppercase tracking-wider text-slate-400 font-bold mb-1.5">
              <Clock className="w-3 h-3 inline mr-1" />Due date <span className="font-normal normal-case">(optional)</span>
            </label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => setDueAt(e.target.value)}
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white focus:ring-2 focus:ring-violet-500/60 focus:border-violet-500"
            />
          </div>

          <Button
            variant="primary"
            className="w-full"
            disabled={!digitizerId || assignMutation.isPending}
            onClick={() => assignMutation.mutate()}
          >
            {live ? 'Reassign' : 'Assign Digitizer'}
          </Button>
        </div>
      )}
    </SpotlightCard>
  );
};

export default AssignDigitizerSection;
