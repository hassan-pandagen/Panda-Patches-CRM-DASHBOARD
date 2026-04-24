import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../contexts/AuthContext';
import { UserRole } from '../../types';
import { Users, CheckCircle, AlertCircle } from 'lucide-react';
import { useToast } from '../../hooks/useToast';

interface AssignOrderSectionProps {
  orderId: number;
  orderNumber: string;
  currentAgent: string | null;
  assignedBy?: string;
  assignedAt?: string;
  onAssignmentChange?: () => void;
}

interface AgentWithWorkload {
  email: string;
  name: string;
  activeOrders: number;
}

const CLOSED_STATUSES = ['SHIPPED', 'DELIVERED', 'COMPLETED', 'CANCELLED', 'REFUNDED'];

const AssignOrderSection: React.FC<AssignOrderSectionProps> = ({
  orderId,
  orderNumber,
  currentAgent,
  assignedBy,
  assignedAt,
  onAssignmentChange,
}) => {
  const { user, role } = useAuth();
  const toast = useToast();
  const [agents, setAgents] = useState<AgentWithWorkload[]>([]);
  const [selectedAgent, setSelectedAgent] = useState<string>(currentAgent || '');
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingAgents, setIsLoadingAgents] = useState(true);
  // Synchronous re-entry guard — state updates are async so `isLoading` can't
  // block a rapid second click before React commits. A ref flips instantly.
  const inFlightRef = useRef(false);

  // Only admins can assign orders
  const canAssign = role === UserRole.ADMIN;

  // Fetch sales agents and their workload
  useEffect(() => {
    const fetchAgentsWithWorkload = async () => {
      try {
        setIsLoadingAgents(true);

        // Fetch only sales agents (exclude production team)
        const { data: users, error: usersError } = await supabase
          .from('user_profiles')
          .select('email, full_name, role')
          .in('role', ['ADMIN', 'AGENT', 'USER']) // Only sales agents, not PRODUCTION
          .order('full_name');

        if (usersError) throw usersError;

        // Fetch active order counts for each agent
        const { data: orders, error: ordersError } = await supabase
          .from('orders')
          .select('sales_agent')
          .not('sales_agent', 'is', null)
          .not('status', 'in', `(${CLOSED_STATUSES.join(',')})`);

        if (ordersError) throw ordersError;

        // Count orders per agent
        const workloadMap = new Map<string, number>();
        orders?.forEach(order => {
          const agent = order.sales_agent;
          workloadMap.set(agent, (workloadMap.get(agent) || 0) + 1);
        });

        // Combine users with their workload
        const agentsWithWorkload: AgentWithWorkload[] = (users || []).map(u => ({
          email: u.email,
          name: u.full_name || u.email,
          activeOrders: workloadMap.get(u.email) || 0,
        }));

        // Sort by workload (lowest first) to suggest best candidate
        agentsWithWorkload.sort((a, b) => a.activeOrders - b.activeOrders);

        console.log(`✅ Loaded ${agentsWithWorkload.length} sales agents (excluding production team):`, agentsWithWorkload);
        setAgents(agentsWithWorkload);
      } catch (error) {
        console.error('Error fetching agents:', error);
        toast.error('Failed to load sales agents');
      } finally {
        setIsLoadingAgents(false);
      }
    };

    if (canAssign) {
      fetchAgentsWithWorkload();
    }
  }, [canAssign]); // Removed toast from dependencies to prevent infinite loop

  const handleAssign = async () => {
    // Guard against double-invocation (click race before isLoading commits)
    if (inFlightRef.current) return;

    if (!selectedAgent || !user?.email) {
      toast.error('Please select a sales agent');
      return;
    }

    if (selectedAgent === currentAgent) {
      toast.info('This order is already assigned to this agent');
      return;
    }

    inFlightRef.current = true;
    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('orders')
        .update({
          sales_agent: selectedAgent,
          assigned_by: user.email,
          assigned_at: new Date().toISOString(),
        })
        .eq('id', orderId);

      if (error) throw error;

      toast.success(`Order ${orderNumber} assigned to ${agents.find(a => a.email === selectedAgent)?.name || selectedAgent}`);

      // Trigger callback to refresh parent component
      if (onAssignmentChange) {
        onAssignmentChange();
      }
    } catch (err) {
      console.error('Error assigning order:', err);
      toast.error('Failed to assign order');
    } finally {
      inFlightRef.current = false;
      setIsLoading(false);
    }
  };

  if (!canAssign) {
    // Show read-only assignment info for non-admins
    return (
      <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="p-2 bg-blue-500/20 rounded-lg">
            <Users className="w-5 h-5 text-blue-400" />
          </div>
          <h3 className="text-lg font-semibold text-white">Sales Agent</h3>
        </div>
        <div className="space-y-2">
          {currentAgent ? (
            <>
              <p className="text-sm text-slate-300">
                Assigned to: <span className="font-semibold text-white">{currentAgent}</span>
              </p>
              {assignedBy && (
                <p className="text-xs text-slate-400">
                  Assigned by: {assignedBy} {assignedAt && `on ${new Date(assignedAt).toLocaleString()}`}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Unassigned - Waiting for admin assignment
            </p>
          )}
        </div>
      </div>
    );
  }

  // Admin view - can assign/reassign
  return (
    <div className="bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-blue-500/20 rounded-lg">
          <Users className="w-5 h-5 text-blue-400" />
        </div>
        <h3 className="text-lg font-semibold text-white">Assign Sales Agent</h3>
      </div>

      <div className="space-y-4">
        {/* Current Assignment Status */}
        {currentAgent ? (
          <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-lg p-3">
            <p className="text-sm text-emerald-400 flex items-center gap-2">
              <CheckCircle className="w-4 h-4" />
              Currently assigned to: <span className="font-semibold">{currentAgent}</span>
            </p>
            {assignedBy && assignedAt && (
              <p className="text-xs text-slate-400 mt-1">
                By {assignedBy} • {new Date(assignedAt).toLocaleString()}
              </p>
            )}
          </div>
        ) : (
          <div className="bg-amber-500/10 border border-amber-500/30 rounded-lg p-3">
            <p className="text-sm text-amber-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Unassigned - Please assign to a sales agent
            </p>
          </div>
        )}

        {/* Agent Selection Dropdown */}
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            {currentAgent ? 'Reassign to:' : 'Assign to:'}
          </label>

          {isLoadingAgents ? (
            <div className="w-full bg-slate-800 border border-slate-600 rounded-lg px-4 py-2.5 flex items-center justify-center gap-2 text-slate-400">
              <div className="w-4 h-4 border-2 border-slate-600 border-t-brand-orange rounded-full animate-spin" />
              Loading agents...
            </div>
          ) : agents.length === 0 ? (
            <div className="w-full bg-red-500/10 border border-red-500/30 rounded-lg px-4 py-2.5 text-red-400 text-sm">
              ⚠️ No sales agents found. Please add users in User Management.
            </div>
          ) : (
            <>
              <select
                value={selectedAgent}
                onChange={(e) => setSelectedAgent(e.target.value)}
                disabled={isLoading}
                className="w-full bg-slate-800 border border-slate-600 text-white rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-brand-orange focus:border-brand-orange disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <option value="">-- Select Sales Agent ({agents.length} available) --</option>
                {agents.map((agent) => (
                  <option key={agent.email} value={agent.email}>
                    {agent.name} ({agent.activeOrders} active {agent.activeOrders === 1 ? 'order' : 'orders'})
                    {agent.activeOrders === Math.min(...agents.map(a => a.activeOrders)) && agents.length > 1 ? ' ⭐ Best Choice' : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">
                💡 Agents with fewer active orders are shown first
              </p>
            </>
          )}
        </div>

        {/* Assign Button */}
        <button
          onClick={handleAssign}
          disabled={!selectedAgent || isLoading || selectedAgent === currentAgent}
          className="w-full py-2.5 px-4 bg-brand-orange hover:bg-orange-600 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
        >
          {isLoading ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Assigning...
            </>
          ) : (
            <>
              <Users className="w-4 h-4" />
              {currentAgent ? 'Reassign Order' : 'Assign Order'}
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default AssignOrderSection;
