import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// --- THIS IS THE CORRECTED IMPORT SECTION ---
import { createUserWithRole, getAllUsers, deleteUser, updateUserProfile } from '@/services/authService';
import { logger } from '@/services/logger';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, UserPermissions, UserRole } from '@/types';
import { Check, X, Plus, UserPlus, Edit, Trash2, Key, AlertCircle } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import SpotlightCard from '@/components/ui/SpotlightCard';
import EmptyState from '@/components/ui/EmptyState';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/constants/queryKeys';

// Base defaults (all false to start clean)
const emptyPermissions: UserPermissions = {
  users_manage: false,
  orders_create: false,
  orders_view_all: false,
  orders_change_status: false,
  orders_edit_financials: false,
  orders_edit_production: false,
  orders_delete: false,
  reports_view_financials: false,
  shipping_view: false,
  attendance_clock_only: false,
};

type ModalMode = 'create' | 'edit' | 'delete' | 'password' | null;

const UserManagementPage: React.FC = () => {
  const { role, permissions } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // State for Create Modal
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USER);
  const [newUserPermissions, setNewUserPermissions] = useState<UserPermissions>(emptyPermissions);
  const [createdUserInfo, setCreatedUserInfo] = useState<{ email: string; } | null>(null);
  const [passwordCopied, setPasswordCopied] = useState(false);

  // State for Edit Modal
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>(UserRole.USER);
  const [editUserPermissions, setEditUserPermissions] = useState<UserPermissions>(emptyPermissions);

  // State for Password Modal
  const [resetPassword, setResetPassword] = useState('');

  // --- PRESET LOGIC (Matches your Screenshots) ---
  const applyPreset = (type: string, setPermissions: (p: UserPermissions) => void) => {
    if (type === 'sales') {
      // Manzoor's Configuration
      setPermissions({
        ...emptyPermissions,
        orders_create: true,
        orders_view_all: false, // Only sees own orders
        orders_change_status: true,
        orders_edit_financials: true,
        orders_delete: false,
        reports_view_financials: true, // Needs this for Dashboard
        shipping_view: true,
      });
    } else if (type === 'production') {
      // Hassan's Configuration
      setPermissions({
        ...emptyPermissions,
        orders_create: false,
        orders_view_all: true, // Must see production queue
        orders_change_status: false, // Matches screenshot (X)
        orders_edit_financials: false,
        orders_edit_production: true, // The critical permission
        reports_view_financials: false, // Hides Dashboard
        shipping_view: false,
      });
    } else if (type === 'clock_only') {
      setPermissions({
        ...emptyPermissions,
        attendance_clock_only: true,
      });
    } else if (type === 'admin_preset') {
      // Full Access
      const allTrue = Object.keys(emptyPermissions).reduce((acc, key) => {
        acc[key] = true;
        return acc;
      }, {} as any);
      setPermissions(allTrue);
    }
  };

  // --- MUTATIONS ---
  const createUserMutation = useMutation({
    mutationFn: () => createUserWithRole(newUserEmail, newUserRole, newUserPermissions, newUserName, newUserPassword),
    onSuccess: (data) => {
      if (data.error) {
        throw new Error(data.error); // Ensure error is thrown for onError to catch
      }
      if (data.user) {
        setCreatedUserInfo({ email: data.user.email! }); // This part might change based on new flow
      }
    },
    onError: (error: Error) => logger.error(error.message),
  });


  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      setModalMode(null);
      toast.success("User Deleted", `The user ${selectedUser?.email} has been removed.`);
    },
    onError: (error: Error) => toast.error("Deletion Failed", error.message),
  });

  const editUserMutation = useMutation({
    mutationFn: (data: { id: string; updates: any }) => updateUserProfile(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() }); // Refetch users after update
      setModalMode(null);
      toast.success("User Updated", "The user's profile has been saved.");
    },
    onError: (error: Error) => toast.error("Update Failed", error.message),
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: { id: string; updates: any }) => updateUserProfile(data.id, data.updates),
    onSuccess: () => {
      setModalMode(null);
      // Use a specific success message for password changes
      toast.success("Password Updated", `The password for ${selectedUser?.email} has been changed.`);
    },
    onError: (error: Error) => toast.error("Password Update Failed", error.message),
  });

  // --- EVENT HANDLERS ---
  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate();
  };

  const handleEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser) return;
    
    editUserMutation.mutate({
      id: selectedUser.id,
      updates: {
        full_name: editUserName,
        role: editUserRole,
        permissions: editUserPermissions
      }
    });
  };

  const handlePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || !resetPassword) return;
    changePasswordMutation.mutate({
      id: selectedUser.id,
      updates: { password: resetPassword }
    });
  };
  const handleDeleteUser = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  // --- MODAL CONTROLS ---
  const closeAllModals = () => {
    setModalMode(null);
    setSelectedUser(null);
    // Reset all form states
    setNewUserEmail('');
    setNewUserName('');
    setNewUserPassword('');
    setNewUserRole(UserRole.USER);
    setNewUserPermissions(emptyPermissions);
    setCreatedUserInfo(null);
    setEditUserName('');
    setEditUserRole(UserRole.USER);
    setEditUserPermissions(emptyPermissions);
    setResetPassword('');
    createUserMutation.reset();
    editUserMutation.reset();
    changePasswordMutation.reset();
    deleteUserMutation.reset();
  };


  const openCreateModal = () => {
    setModalMode('create');
    setSelectedUser(null);
    applyPreset('sales', setNewUserPermissions); // Default to Sales
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setEditUserName(user.full_name || '');
    setEditUserRole(user.role as UserRole);
    setEditUserPermissions(user.permissions || { ...emptyPermissions });
    setModalMode('edit');
  };

  const openDeleteModal = (user: UserProfile) => {
    setSelectedUser(user);
    setModalMode('delete');
  };

  const openPasswordModal = (user: UserProfile) => {
    setSelectedUser(user);
    setModalMode('password');
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(newUserPassword);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  const { data: users, isLoading, error } = useQuery<UserProfile[], Error>({
    queryKey: queryKeys.users.all(),
    queryFn: async () => getAllUsers(),
    enabled: role === UserRole.ADMIN || !!permissions?.users_manage,
  });

  if (role !== UserRole.ADMIN && !permissions?.users_manage) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 text-center">
          <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
          <p className="text-slate-300">You do not have permission to view this page.</p>
        </div>
      </div>
    );
  }

  // Helper to determine current preset for dropdown value
  const detectPreset = (perms: UserPermissions) => {
    if (perms.orders_edit_production && perms.orders_view_all && !perms.reports_view_financials) return 'production';
    if (perms.reports_view_financials && perms.orders_create && !perms.orders_view_all) return 'sales';
    if (perms.attendance_clock_only) return 'clock_only';
    return 'custom';
  };

  return (
    <div className="max-w-6xl mx-auto p-6 text-slate-200">
      <div className="flex justify-between items-center mb-6">
         <h1 className="text-3xl font-bold">User Management</h1>
         <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 text-sm font-semibold focus-ring">
           <Plus className="w-4 h-4" /> Create User
         </button>
       </div>
      
      {isLoading && <Spinner />}
      {error && <p className="text-red-400">Error: {error.message}</p>}

      {!users || users.length === 0 ? (
        <EmptyState 
          title="No users found"
          description="Get started by adding your first team member or sales agent."
          action={
            <button 
              onClick={openCreateModal}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 hover:bg-white/10 text-white rounded-lg border border-white/10 transition-all focus-ring"
            >
              <Plus className="w-4 h-4" />
              Create User
            </button>
          }
        />
      ) : (
        <SpotlightCard className="p-0 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  Full Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  Role
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  Permissions
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {users.map((user) => (
                <tr 
                  key={user.id} 
                  className="hover:bg-slate-800/40 focus-ring cursor-pointer group" 
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') openEditModal(user);
                  }}
                >
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.email}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.full_name || '-'}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'ADMIN' ? 'bg-indigo-600/30 text-indigo-300' : 'bg-cyan-600/30 text-cyan-300'}`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    <div className="flex flex-wrap gap-x-4 gap-y-2 max-w-xs">
                      {Object.entries(user.permissions || {}).map(([permission, hasAccess]) => {
                         // Only show relevant true permissions to keep UI clean
                         if (!hasAccess && permission !== 'users_manage') return null;
                         return (
                          <div key={permission} className="flex items-center gap-1">
                            {hasAccess ? <Check className="w-3 h-3 text-green-400" /> : <X className="w-3 h-3 text-red-400" />}
                            <span className="text-xs text-slate-400 capitalize">
                              {permission.replace('orders_', '').replace('reports_', '').replace(/_/g, ' ')}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditModal(user)} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 focus-ring rounded">
                              <Edit className="w-4 h-4" /> Edit
                            </button>
                            {/* --- CHANGE PASSWORD BUTTON --- */}
                            <button
                              onClick={() => openPasswordModal(user)}
                              className="text-amber-400 hover:text-amber-300 flex items-center gap-1 focus-ring rounded"
                            >
                              <Key className="w-4 h-4" /> Pass
                            </button>
                            {/* -------------------------------- */}
                            <button onClick={() => openDeleteModal(user)} className="text-red-400 hover:text-red-300 flex items-center gap-1 focus-ring rounded">
                              <Trash2 className="w-4 h-4" /> Delete
                            </button>
                      </div>
                    </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SpotlightCard>
      )}

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={modalMode === 'delete'}
        onClose={closeAllModals}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to delete ${selectedUser?.email}?`}
        isConfirming={deleteUserMutation.isPending}
      />

      {/* --- CREATE USER MODAL --- */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Create New User</h3>
              <button onClick={closeAllModals}><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleCreateUser} className="p-8 space-y-8">
              {createdUserInfo ? (
                /* ... Success View (Same as before) ... */
                <div className="bg-green-900/30 p-4 rounded-lg">
                   <p className="text-green-400">User Created!</p>
                   <button type="button" onClick={handleCopyPassword} className="mt-2 bg-amber-600 px-3 py-1 rounded text-white text-sm">
                     {passwordCopied ? 'Copied' : 'Copy Password'}
                   </button>
                   <button type="button" onClick={closeAllModals} className="mt-4 w-full bg-slate-700 py-2 rounded">Done</button>
                </div>) : (<>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-slate-400">Email Address</label>
                      <input
                        type="email"
                        required
                        value={newUserEmail}
                        onChange={(e) => setNewUserEmail(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white"
                        placeholder="agent@pandapatches.com"
                      />
                    </div>

                    {/* NEW PASSWORD INPUT */}
                     <div className="space-y-3">
                       <label className="text-sm font-medium text-slate-400">Assign Password</label>
                      <input
                        type="text" // Using "text" so you can see it and copy it easily
                        required
                        minLength={6}
                        value={newUserPassword}
                        onChange={(e) => setNewUserPassword(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white focus:border-brand-orange"
                        placeholder="e.g. Panda2025!"
                      />
                    </div>
                    
                    <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400">Full Name</label>
                      <input
                        type="text"
                        required
                        value={newUserName}
                        onChange={(e) => setNewUserName(e.target.value)}
                        className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white"
                        placeholder="Agent Name"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                     <label className="text-sm font-medium text-slate-400">Role</label>
                     <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
                    >
                      <option value={UserRole.USER}>Standard User</option>
                      <option value={UserRole.ADMIN}>Administrator</option>
                    </select>
                  </div>

                  {/* User Type Preset for Create Form */}
                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400">User Type (Preset)</label>
                    <select
                      onChange={(e) => applyPreset(e.target.value, setNewUserPermissions)}
                      className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
                      defaultValue="sales"
                    >
                      <option value="sales">Sales Agent</option>
                      <option value="production">Production User</option>
                      <option value="clock_only">Clock In/Out Only</option>
                    </select>
                  </div>

                  <div className="space-y-4">
                    <label className="text-sm font-medium text-slate-400 block">Permissions</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {Object.keys(emptyPermissions).map((key) => (
                        <label key={key} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors">
                          <input
                            type="checkbox"
                            checked={newUserPermissions[key as keyof UserPermissions]}
                            onChange={(e) => setNewUserPermissions(prev => ({
                              ...prev,
                              [key]: e.target.checked
                            }))}
                            className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-offset-slate-900"
                          />
                          <span className="text-sm text-slate-300 capitalize">
                            {key.replace('can_', '').replace(/_/g, ' ')}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-3 pt-8 border-t border-slate-700">
                    <button
                      type="button"
                      onClick={closeAllModals}
                      className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={createUserMutation.isPending}
                      className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50"
                    >
                      {createUserMutation.isPending ? <Spinner size="sm" /> : <UserPlus className="w-4 h-4" />}
                      Create User
                    </button>
                  </div></>
              )}
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT USER MODAL --- */}
      {modalMode === 'edit' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-8 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Edit {selectedUser.full_name}</h3>
              <button onClick={closeAllModals}><X className="w-6 h-6 text-slate-400" /></button>
            </div>

            <form onSubmit={handleEditUser} className="p-8 space-y-8">
              <input type="text" value={editUserName} onChange={e => setEditUserName(e.target.value)} className="w-full bg-slate-900/50 border border-slate-600 rounded p-2 text-white" />
              <select value={editUserRole} onChange={e => setEditUserRole(e.target.value as UserRole)} className="w-full bg-slate-900/50 border border-slate-600 rounded p-2 text-white">
                <option value={UserRole.USER}>User</option>
                <option value={UserRole.ADMIN}>Admin</option>
              </select>

              {/* EDIT PRESET SELECTOR */}
              <div>
                <label className="text-sm text-slate-400 mb-1 block">Quick Apply Preset</label>
                <select
                  onChange={(e) => applyPreset(e.target.value, setEditUserPermissions)} 
                  className="w-full bg-slate-900/50 border border-slate-600 rounded p-2 text-white"
                  value={detectPreset(editUserPermissions)}
                >
                  <option value="custom">Custom Configuration</option>
                  <option value="sales">Sales Agent</option>
                  <option value="production">Production User</option>
                  <option value="clock_only">Clock In/Out Only</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4 bg-slate-900/30 p-6 rounded-lg">
                {Object.keys(emptyPermissions).map((key) => (
                  <label key={key} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editUserPermissions[key as keyof UserPermissions]}
                      onChange={(e) => setEditUserPermissions(prev => ({ ...prev, [key]: e.target.checked }))}
                      className="rounded bg-slate-800 border-slate-600 text-blue-600"
                    />
                    <span className="text-sm text-slate-300 capitalize">{key.replace(/_/g, ' ')}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end gap-3 pt-6 border-t border-slate-700">
                <button type="button" onClick={closeAllModals} className="px-4 py-2 text-slate-300">
                  Cancel
                </button>
                <button type="submit" disabled={editUserMutation.isPending} className="px-4 py-2 bg-indigo-600 rounded text-white">
                  {editUserMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CHANGE PASSWORD MODAL --- */}
      {modalMode === 'password' && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-8 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-white font-bold">Change Password</h3>
            </div>

            <form onSubmit={handlePasswordReset} className="p-8 space-y-6">
              <input type="text" required minLength={6} value={resetPassword} onChange={e => setResetPassword(e.target.value)} placeholder="New Password" className="w-full bg-slate-900/50 border border-slate-600 rounded p-2 text-white" />
              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={closeAllModals}
                  className="text-slate-300 px-4 py-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="bg-amber-600 text-white px-4 py-2 rounded"
                >
                  Update
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;