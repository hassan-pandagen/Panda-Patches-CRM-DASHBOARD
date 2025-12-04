import React from 'react';
import { X } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface UserPresence {
  email: string;
  fullName: string;
  onlineAt: string;
}

interface OnlineAgentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserPresence[];
}

const OnlineAgentsModal: React.FC<OnlineAgentsModalProps> = ({ isOpen, onClose, users }) => {
  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div 
        className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-4 border-b border-slate-700 flex justify-between items-center">
          <h3 className="text-lg font-bold text-white">Online Agents ({users.length})</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 max-h-[60vh] overflow-y-auto">
          <ul className="space-y-3">
            {users.map(user => (
              <li key={user.email} className="flex items-center justify-between p-2 rounded-lg hover:bg-slate-700/50">
                <div className="flex items-center gap-3">
                  <div className="relative flex items-center">
                    <span className="absolute -inset-0.5 bg-green-400 rounded-full blur-sm opacity-75"></span>
                    <span className="relative w-2 h-2 bg-green-400 rounded-full"></span>
                  </div>
                  <div>
                    <p className="font-semibold text-white">{user.fullName || 'Unknown Name'}</p>
                    <p className="text-xs text-slate-400">{user.email}</p>
                  </div>
                </div>
                <p className="text-xs text-slate-500">
                  {formatDistanceToNow(new Date(user.onlineAt), { addSuffix: true })}
                </p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default OnlineAgentsModal;