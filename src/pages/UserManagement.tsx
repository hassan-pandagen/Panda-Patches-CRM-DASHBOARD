import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { UserRole } from '../types/index';

// --- Mock Data & Types ---
interface UserAccess {
  dashboard: boolean;
  orders: boolean;
  revenue: boolean;
  reports: boolean;
  settings: boolean;
}

interface MockUser {
  id: number;
  name: string;
  email: string;
  role: UserRole;
  access: UserAccess;
}

const mockUsersData: MockUser[] = [
  { id: 1, name: 'Panda Admin', email: 'hello@pandapatches.com', role: UserRole.ADMIN, access: { dashboard: true, orders: true, revenue: true, reports: true, settings: true } },
  { id: 2, name: 'Brenda Smith (Sales)', email: 'brenda@pandacrm.io', role: UserRole.AGENT, access: { dashboard: true, orders: true, revenue: true, reports: false, settings: false } },
  { id: 3, name: 'Charles Lee (Production)', email: 'charles@pandacrm.io', role: UserRole.PRODUCTION, access: { dashboard: true, orders: true, revenue: false, reports: false, settings: false } },
];

const accessModules: (keyof UserAccess)[] = ['dashboard', 'orders', 'revenue', 'reports', 'settings'];

// --- Reusable Checkbox Component ---
const AccessCheckbox: React.FC<{ label: string; isChecked: boolean; onChange: (checked: boolean) => void }> = ({ label, isChecked, onChange }) => (
  <label className="flex items-center space-x-2 cursor-pointer text-slate-300 hover:text-blue-400 transition-colors duration-200">
    <input
      type="checkbox"
      checked={isChecked}
      onChange={(e) => onChange(e.target.checked)}
      className="form-checkbox h-5 w-5 bg-slate-700 border-slate-600 rounded text-blue-500 focus:ring-2 focus:ring-blue-500/50"
    />
    <span className="capitalize">{label}</span>
  </label>
);

const UserManagementPage: React.FC = () => {
    const [users, setUsers] = useState<MockUser[]>(mockUsersData);
    const [changedUsers, setChangedUsers] = useState<Set<number>>(new Set());

    const handleRoleChange = (userId: number, newRole: UserRole) => {
        setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
        setChangedUsers(prev => new Set(prev).add(userId));
    };

    const handleAccessChange = (userId: number, module: keyof UserAccess, isChecked: boolean) => {
        setUsers(users.map(u => u.id === userId ? { ...u, access: { ...u.access, [module]: isChecked } } : u));
        setChangedUsers(prev => new Set(prev).add(userId));
    };

    const handleSaveChanges = () => {
        const changesToSave = users.filter(u => changedUsers.has(u.id));
        console.log("Saving changes for these users:", changesToSave);
        // In a real app, you would call your Supabase service here.
        setChangedUsers(new Set()); // Reset changes after saving
    };

    const cardVariants = {
        hidden: { opacity: 0, y: 20 },
        visible: { opacity: 1, y: 0 },
    };

    return (
        <div className="max-w-7xl mx-auto space-y-6">
            <div className="flex justify-between items-center">
                <h2 className="text-3xl font-bold text-slate-100">User Management & Role Access</h2>
                <button
                    onClick={handleSaveChanges}
                    disabled={changedUsers.size === 0}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 focus:ring-2 focus:ring-blue-500/50 shadow-lg shadow-black/10 transition-all duration-300 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Save Changes {changedUsers.size > 0 && `(${changedUsers.size})`}
                </button>
            </div>

            <motion.div 
                className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6"
                initial="hidden"
                animate="visible"
                variants={{ visible: { transition: { staggerChildren: 0.05 } } }}
            >
                {users.map(user => (
                    <motion.div 
                        key={user.id} 
                        variants={cardVariants}
                        className="bg-slate-800/30 backdrop-blur-sm border border-slate-700/50 text-slate-200 rounded-xl p-4"
                    >
                        {/* User Info & Role */}
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <h3 className="font-semibold text-lg text-slate-100">{user.name}</h3>
                                <p className="text-sm text-slate-400">{user.email}</p>
                            </div>
                            <select
                                value={user.role}
                                onChange={(e) => handleRoleChange(user.id, e.target.value as UserRole)}
                                className="bg-slate-800 border border-slate-700 text-slate-300 rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                            >
                                <option value={UserRole.ADMIN}>Admin</option>
                                <option value={UserRole.AGENT}>Sales Agent</option>
                                <option value={UserRole.PRODUCTION}>Production</option>
                            </select>
                        </div>

                        {/* Access Controls */}
                        <div>
                            <h4 className="text-sm font-medium text-slate-400 mb-3">Module Access</h4>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
                                {accessModules.map(module => (
                                    <AccessCheckbox
                                        key={module}
                                        label={module}
                                        isChecked={user.access[module]}
                                        onChange={(isChecked) => handleAccessChange(user.id, module, isChecked)}
                                    />
                                ))}
                            </div>
                        </div>
                    </motion.div>
                ))}
            </motion.div>
        </div>
    );
};

export default UserManagementPage;
