import React, { useMemo, useState, useEffect } from 'react';
import { usePresence } from '../../hooks/usePresence';
import { formatDistanceToNow } from 'date-fns';
import OnlineAgentsModal from './OnlineAgentsModal';
import { Users, Activity } from 'lucide-react';

const OnlineAgents: React.FC = () => {
  const { onlineUsers } = usePresence();
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Log whenever onlineUsers changes
  useEffect(() => {
    console.log('🔄 [ONLINE-AGENTS] Users updated:', onlineUsers);
  }, [onlineUsers]);

  const users = useMemo(() => {
    console.log('📊 [ONLINE-AGENTS] Processing online users:', onlineUsers);
    
    const allUsers = Object.entries(onlineUsers)
      .flatMap(([key, presences]) => {
        console.log(`  - Key: ${key}, Presences:`, presences);
        return presences.map(p => ({
          email: p.email,
          fullName: p.full_name,
          onlineAt: p.online_at,
          userId: p.user_id,
        }));
      });

    // Remove duplicates by email
    const uniqueUsers = allUsers.reduce((acc, user) => {
      const existing = acc.find(u => u.email === user.email);
      if (!existing) {
        acc.push(user);
      } else if (new Date(user.onlineAt) > new Date(existing.onlineAt)) {
        const index = acc.indexOf(existing);
        acc[index] = user;
      }
      return acc;
    }, [] as typeof allUsers);

    console.log('✅ [ONLINE-AGENTS] Final unique users:', uniqueUsers);
    return uniqueUsers;
  }, [onlineUsers]);

  return (
    <>
      <div 
        className="relative group cursor-pointer"
        onClick={() => setIsModalOpen(true)}
      >
        <div className="absolute -inset-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-2xl opacity-0 group-hover:opacity-30 blur transition duration-500" />
        
        <div className="relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-xl transition-all hover:border-emerald-500/30">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-500/10 rounded-lg">
                <Users className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Online Agents</h3>
                <p className="text-xs text-slate-400">Currently active</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-1 bg-emerald-500/10 rounded-full border border-emerald-500/20">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
              <span className="text-emerald-400 font-bold text-lg">{users.length}</span>
            </div>
          </div>

          <div className="space-y-2">
            {users.length === 0 ? (
              <div className="text-center py-4">
                <Activity className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-500">No agents online</p>
                <p className="text-xs text-slate-600 mt-1">Check console for debug info</p>
              </div>
            ) : (
              <>
                {users.slice(0, 3).map((user, index) => (
                  <div 
                    key={user.email}
                    className="flex items-center gap-3 p-2 bg-slate-800/30 rounded-lg border border-slate-700/50"
                  >
                    <div className="relative">
                      <div className="w-8 h-8 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                        {user.fullName?.charAt(0) || user.email.charAt(0).toUpperCase()}
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-slate-900" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">
                        {user.fullName || user.email}
                      </p>
                      <p className="text-xs text-slate-500">
                        {formatDistanceToNow(new Date(user.onlineAt), { addSuffix: true })}
                      </p>
                    </div>
                  </div>
                ))}
                
                {users.length > 3 && (
                  <div className="text-center pt-2">
                    <span className="text-xs text-slate-400 bg-slate-800/50 px-3 py-1 rounded-full">
                      +{users.length - 3} more online
                    </span>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="mt-4 text-center">
            <button className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              View All →
            </button>
          </div>
        </div>
      </div>

      <OnlineAgentsModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        users={users} 
      />
    </>
  );
};

export default OnlineAgents;