// src/components/customer/LoyaltyAdminPanel.tsx
// CL86F1 Task 2.4 — ADMIN-only manual override: grant/force a tier, revoke, or reissue a
// code. A reason is REQUIRED (enforced again server-side) and every action is audited in
// loyalty_admin_audit. Render this only for ADMIN (the parent gates on role).
import React, { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { grantLoyaltyTier, revokeLoyaltyTier, reissueLoyaltyCode } from '../../services/loyaltyService';
import { useToast } from '../../hooks/useToast';
import { ShieldAlert } from 'lucide-react';

const LoyaltyAdminPanel: React.FC<{ customerId: string; currentTier: string }> = ({ customerId, currentTier }) => {
  const queryClient = useQueryClient();
  const { success: showSuccess, error: showError } = useToast();
  const [reason, setReason] = useState('');
  const [tier, setTier] = useState<'bronze' | 'silver' | 'gold'>(
    currentTier === 'none' ? 'bronze' : (currentTier as 'bronze' | 'silver' | 'gold')
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['customer-account', customerId] });
    queryClient.invalidateQueries({ queryKey: ['loyalty-codes', customerId] });
    setReason('');
  };
  const fail = (e: any) => showError('Override failed', e?.message || 'Could not apply the override.');

  const grant = useMutation({
    mutationFn: () => grantLoyaltyTier(customerId, tier, reason),
    onSuccess: () => { showSuccess(`Granted ${tier}`); refresh(); }, onError: fail,
  });
  const revoke = useMutation({
    mutationFn: () => revokeLoyaltyTier(customerId, reason),
    onSuccess: () => { showSuccess('Tier revoked'); refresh(); }, onError: fail,
  });
  const reissue = useMutation({
    mutationFn: () => reissueLoyaltyCode(customerId, tier, reason),
    onSuccess: (code) => { showSuccess(`Reissued ${tier} code: ${code}`); refresh(); }, onError: fail,
  });

  const busy = grant.isPending || revoke.isPending || reissue.isPending;
  const noReason = reason.trim() === '';

  return (
    <div className="relative bg-slate-900/40 backdrop-blur-xl border border-amber-500/20 rounded-2xl p-6 shadow-xl">
      <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
        <ShieldAlert size={18} className="text-amber-400" /> Loyalty Admin Override
      </h3>
      <p className="text-xs text-slate-400 mb-4">Owner-only. A reason is required and every action is audited.</p>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-slate-400 mb-1">Reason (required)</label>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Goodwill after a shipping delay"
            className="w-full bg-slate-800 border border-slate-600 rounded-md text-white text-sm px-3 py-2"
          />
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Tier</label>
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as any)}
              className="bg-slate-800 border border-slate-600 rounded-md text-white text-sm px-3 py-2"
            >
              <option value="bronze">Bronze</option>
              <option value="silver">Silver</option>
              <option value="gold">Gold</option>
            </select>
          </div>

          <button
            type="button"
            disabled={busy || noReason}
            onClick={() => grant.mutate()}
            className="text-xs font-semibold px-3 py-2 rounded-md border bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25 disabled:opacity-40"
          >
            Grant tier
          </button>
          <button
            type="button"
            disabled={busy || noReason}
            onClick={() => reissue.mutate()}
            className="text-xs font-semibold px-3 py-2 rounded-md border bg-slate-700/40 border-slate-600 text-slate-200 hover:bg-slate-700/60 disabled:opacity-40"
          >
            Reissue code
          </button>
          <button
            type="button"
            disabled={busy || noReason}
            onClick={() => { if (confirm('Revoke this customer\'s tier and all active codes?')) revoke.mutate(); }}
            className="text-xs font-semibold px-3 py-2 rounded-md border bg-red-500/15 border-red-500/40 text-red-300 hover:bg-red-500/25 disabled:opacity-40"
          >
            Revoke tier
          </button>
        </div>
        {noReason && <p className="text-[11px] text-slate-500">Enter a reason to enable the actions.</p>}
      </div>
    </div>
  );
};

export default LoyaltyAdminPanel;
