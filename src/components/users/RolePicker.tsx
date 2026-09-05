// src/components/users/RolePicker.tsx
// Multi-role selector for staff accounts (CEO decision, 6 Sept).
//
// An account can hold several roles — Zahid is DIGITIZER + PRODUCTION_SUPERVISOR — and
// capabilities are the UNION of what each grants. Union can only ever ADD access, which
// is why this component exists as its own thing rather than a second <select>: the one
// combination that quietly matters needs to be said out loud.
//
// DIGITIZER + anything hands an outside freelancer capabilities the blind-vendor model
// says they must never have (customer identity, the Inbox, sending email). It is a valid
// choice for trusted interim staff and a serious mistake for a freelancer, and nothing in
// the data can tell those apart — so the UI warns and lets a human decide.

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { UserRole } from '@/types';
import { primaryRole, isRiskyRoleCombination } from '@/utils/roleAccess';

const ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: 'Admin',
  [UserRole.PRODUCTION_SUPERVISOR]: 'Production Supervisor',
  [UserRole.SALES_AGENT]: 'Sales Agent',
  [UserRole.SHIPPING]: 'Shipping',
  [UserRole.PRODUCTION]: 'Production',
  [UserRole.DIGITIZER]: 'Digitizer',
};

const ROLE_HINTS: Partial<Record<UserRole, string>> = {
  [UserRole.ADMIN]: 'Everything, including user management and financials.',
  [UserRole.PRODUCTION_SUPERVISOR]: 'Assigns digitizers, sends mockups, confirms colour matches.',
  [UserRole.DIGITIZER]: 'Assigned work only. Never sees customer identity or the conversation.',
  [UserRole.SHIPPING]: 'Shipping view and status changes.',
  [UserRole.PRODUCTION]: 'Production queue. No sales or payment information.',
  [UserRole.SALES_AGENT]: 'Own orders, quotes, customer conversation.',
};

// Display order, most privileged first — matches the precedence that decides the primary role.
const ORDER: UserRole[] = [
  UserRole.ADMIN,
  UserRole.PRODUCTION_SUPERVISOR,
  UserRole.SALES_AGENT,
  UserRole.SHIPPING,
  UserRole.PRODUCTION,
  UserRole.DIGITIZER,
];

interface Props {
  value: UserRole[];
  onChange: (roles: UserRole[]) => void;
  disabled?: boolean;
}

const RolePicker: React.FC<Props> = ({ value, onChange, disabled }) => {
  const toggle = (role: UserRole) => {
    if (disabled) return;
    const next = value.includes(role) ? value.filter(r => r !== role) : [...value, role];
    // An account with no roles cannot exist — the database rejects it, and "no roles" is
    // not how you switch someone off. Refuse the last removal here so the admin gets a
    // clear UI state instead of a constraint error from the server.
    if (next.length === 0) return;
    onChange(next);
  };

  const primary = primaryRole(value);
  const risky = isRiskyRoleCombination(value);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-2">
        Roles <span className="text-slate-500 font-normal">— an account can hold more than one</span>
      </label>

      <div className="space-y-1.5">
        {ORDER.map(role => {
          const checked = value.includes(role);
          const isPrimary = primary === role;
          return (
            <label
              key={role}
              className={`flex items-start gap-3 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                checked
                  ? 'bg-brand-orange/10 border-brand-orange/50'
                  : 'bg-slate-800/50 border-white/10 hover:border-white/25'
              } ${disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
            >
              <input
                type="checkbox"
                checked={checked}
                disabled={disabled}
                onChange={() => toggle(role)}
                className="mt-0.5 w-4 h-4 accent-brand-orange shrink-0"
              />
              <span className="min-w-0">
                <span className="text-sm font-medium text-white">
                  {ROLE_LABELS[role]}
                  {isPrimary && value.length > 1 && (
                    <span
                      className="ml-2 text-[10px] uppercase tracking-wider text-brand-orange font-bold"
                      title="Shown as this person's role wherever a single role is displayed"
                    >
                      primary
                    </span>
                  )}
                </span>
                {ROLE_HINTS[role] && (
                  <span className="block text-xs text-slate-400 mt-0.5">{ROLE_HINTS[role]}</span>
                )}
              </span>
            </label>
          );
        })}
      </div>

      {risky && (
        <div className="mt-3 flex items-start gap-2 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-200 leading-relaxed">
            <strong>Digitizer plus another role.</strong> Roles combine, so this account gets
            everything both roles allow — including customer names, emails and the conversation
            a digitizer is normally never shown. Correct for in-house staff covering two jobs
            (Zahid), wrong for an outside freelancer.
          </p>
        </div>
      )}
    </div>
  );
};

export default RolePicker;
