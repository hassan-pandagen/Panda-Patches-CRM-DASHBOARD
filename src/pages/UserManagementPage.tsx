import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// --- THIS IS THE CORRECTED IMPORT SECTION ---
import { createUserWithRole, getAllUsers, deleteUser, updateUserProfile } from '@/services/authService';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, UserPermissions, UserRole } from '@/types'; // 1. Add 'Key' to imports
import { Check, X, Plus, UserPlus, Edit, Trash2, Key } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import { useToast } from '@/hooks/useToast';

const defaultPermissions: UserPermissions = {
  users_manage: false,
  orders_create: true,
  orders_view_all: false,
  orders_change_status: true,
  orders_edit_financials: false,
  orders_edit_production: false,
  orders_delete: false,
  reports_view_financials: false,
  shipping_view: true,
};

const UserManagementPage: React.FC = () => {
  const { role, permissions } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);
  const [isPasswordModalOpen, setPasswordModalOpen] = useState(false);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // State for Create Modal
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.USER);
  const [newUserPermissions, setNewUserPermissions] = useState<UserPermissions>(defaultPermissions);
  const [createdUserInfo, setCreatedUserInfo] = useState<{ email: string; } | null>(null);

  // State for Edit Modal
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>(UserRole.USER);
  const [editUserPermissions, setEditUserPermissions] = useState<UserPermissions>(defaultPermissions);

  // 2. Add this new state for the password modal
  const [resetPassword, setResetPassword] = useState('');

  // State for Change Password Modal
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordChangeMessage, setPasswordChangeMessage] = useState<{ type: 'success' | 'error', text: string } | null>(null);

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
    onError: (error: Error) => {
      console.error(error);
    },
  });

  // --- REAL MUTATIONS ---

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      setDeleteModalOpen(false);
      toast.success("User Deleted", `The user ${selectedUser?.email} has been removed.`);
    },
    onError: (error: Error) => toast.error("Deletion Failed", error.message),
  });

  const editUserMutation = useMutation({
    mutationFn: (data: { id: string; updates: any }) => updateUserProfile(data.id, data.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] }); // Refetch users after update
      closeEditModal(); // Use the dedicated close function to reset state
      closePasswordModal();
      toast.success("User Updated", "The user's profile has been saved.");
    },
    onError: (error: Error) => toast.error("Update Failed", error.message),
  });

  const changePasswordMutation = { isPending: false };

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

    // We reuse the existing mutation but only send the password field
    editUserMutation.mutate({
      id: selectedUser.id,
      updates: {
        password: resetPassword
      }
    });

    // Close and cleanup
    setPasswordModalOpen(false);
    setResetPassword('');
  };
  const handleDeleteUser = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  // --- MODAL CONTROLS ---
  const closeAndResetModal = () => {
    setCreateModalOpen(false);
    setNewUserEmail('');
    setNewUserName('');
    setNewUserPassword(''); // Reset password field
    setNewUserRole(UserRole.USER);
    setCreatedUserInfo(null);
    createUserMutation.reset();
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setEditUserName(user.full_name || '');
    setEditUserRole(user.role as UserRole);
    setEditUserPermissions(user.permissions || { ...defaultPermissions });
    setEditModalOpen(true);
  };

  const closeEditModal = () => {
    setEditModalOpen(false);
    setSelectedUser(null);
    editUserMutation.reset();
  };

  const openDeleteModal = (user: UserProfile) => {
    setSelectedUser(user);
    setDeleteModalOpen(true);
  };

  const closeDeleteModal = () => {
    setDeleteModalOpen(false);
    setSelectedUser(null);
    deleteUserMutation.reset();
  };

  const openPasswordModalForUser = (user: UserProfile) => {
    setSelectedUser(user);
    setPasswordModalOpen(true);
  };

  const closePasswordModal = () => {
    setPasswordModalOpen(false);
    setSelectedUser(null);
    setNewPassword('');
    setConfirmPassword('');
    setPasswordChangeMessage(null);
    changePasswordMutation.reset();
  };

  const { data: users, isLoading, error } = useQuery<UserProfile[], Error>({
    queryKey: ['allUsers'],
    queryFn: async () => {
      return await getAllUsers();
    },
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

  return (
    <div className="max-w-6xl mx-auto p-6 text-slate-200">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">User Management</h1>
        <button onClick={() => setCreateModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 rounded-lg text-white hover:bg-blue-700 text-sm font-semibold">
          <Plus className="w-4 h-4" /> Create User
        </button>
      </div>
      
      {isLoading && <p>Loading users...</p>}
      {error && <p className="text-red-400">Error: {error.message}</p>}

      {users && (
        <div className="bg-slate-800/50 border border-slate-700 rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-slate-700">
            <thead className="bg-slate-900/70">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Email
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Full Name
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Role
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Access Permissions
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-slate-300 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {!users || users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-16 text-slate-400">
                    No users found. Create one to get started.
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.id} className="hover:bg-slate-800/40">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">{user.full_name || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${user.role === 'ADMIN' ? 'bg-indigo-600/30 text-indigo-300' : 'bg-cyan-600/30 text-cyan-300'}`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      <div className="flex flex-wrap gap-x-4 gap-y-2">
                        {Object.entries(user.permissions || {}).map(([permission, hasAccess]) => (
                          <div key={permission} className="flex items-center gap-1.5">
                            {hasAccess ? (
                              <Check className="w-4 h-4 text-green-400" />
                            ) : (
                              <X className="w-4 h-4 text-slate-500" />
                            )}
                            <span className="text-xs capitalize">
                              {permission.replace('CAN_', '').replace(/_/g, ' ').toLowerCase()}
                            </span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        <button onClick={() => openEditModal(user)} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                          <Edit className="w-4 h-4" /> Edit
                        </button>
                        {/* --- NEW CHANGE PASSWORD BUTTON --- */}
                        <button
                          onClick={() => { setSelectedUser(user); setPasswordModalOpen(true); }}
                          className="text-amber-400 hover:text-amber-300 flex items-center gap-1"
                        >
                          <Key className="w-4 h-4" /> Pass
                        </button>
                        {/* -------------------------------- */}
                        <button onClick={() => openDeleteModal(user)} className="text-red-400 hover:text-red-300 flex items-center gap-1">
                          <Trash2 className="w-4 h-4" /> Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={isDeleteModalOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to permanently delete the user ${selectedUser?.email}? This action cannot be undone.`}
        isConfirming={deleteUserMutation.isPending}
      />

      {/* --- CREATE USER MODAL --- */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Create New User</h3>
              <button onClick={closeAndResetModal} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="p-6 space-y-6">
              {/* Success Message with Temp Password */}
              {createdUserInfo && (
                <div className="bg-green-900/30 border border-green-500/50 rounded-lg p-4 mb-4">
                  <div className="flex items-center gap-2 text-green-400 font-semibold mb-2">
                    <Check className="w-5 h-5" /> User Created & Activated
                  </div>
                  <p className="text-sm text-slate-300">
                    The account for <strong className="text-white">{createdUserInfo.email}</strong> is ready.
                  </p>
                  <p className="text-sm text-slate-300 mt-2 bg-black/20 p-2 rounded">
                    Password: <strong className="text-brand-orange">{newUserPassword}</strong>
                  </p>
                  <p className="text-xs text-slate-400 mt-2">
                    Please copy these credentials and send them to the agent via WhatsApp/Slack. They can log in immediately.
                  </p>
                  
                  <button 
                    type="button" 
                    onClick={closeAndResetModal}
                    className="mt-3 w-full py-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-sm transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}

              {!createdUserInfo && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
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
                    <div className="space-y-2">
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
                    
                    <div className="space-y-2">
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

                  <div className="space-y-2">
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

                  <div className="space-y-3">
                    <label className="text-sm font-medium text-slate-400 block">Permissions</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {Object.keys(defaultPermissions).map((key) => (
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

                  <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                    <button
                      type="button"
                      onClick={closeAndResetModal}
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
                  </div>
                </>
              )}
            </form>
          </div>
        </div>
      )}

      {/* --- EDIT USER MODAL --- */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Edit User: {selectedUser.full_name}</h3>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleEditUser} className="p-6 space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Full Name</label>
                <input
                  type="text"
                  value={editUserName}
                  onChange={(e) => setEditUserName(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">Role</label>
                <select
                  value={editUserRole}
                  onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
                >
                  <option value={UserRole.USER}>Standard User</option>
                  <option value={UserRole.ADMIN}>Administrator</option>
                </select>
              </div>

              {/* --- NEW: User Type Selector for easier permission management --- */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">User Type (Preset)</label>
                <select
                  onChange={(e) => {
                    if (e.target.value === 'production') {
                      setEditUserPermissions({ // Use a dedicated Production preset
                        ...defaultPermissions,
                        orders_create: false,
                        orders_view_all: true,
                        orders_change_status: true, // Allow status changes
                        orders_edit_financials: false,
                        orders_edit_production: true,
                      });
                    } else { // 'sales'
                      setEditUserPermissions(defaultPermissions);
                    }
                  }}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 text-white"
                  // Determine current type based on permissions
                  value={editUserPermissions.orders_edit_production ? 'production' : 'sales'}
                >
                  <option value="sales">Sales Agent</option>
                  <option value="production">Production User</option>
                </select>
              </div>

              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-400 block">Permissions</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Object.keys(defaultPermissions).map((key) => (
                    <label key={key} className="flex items-center gap-3 p-3 bg-slate-900/30 rounded-lg border border-slate-700 cursor-pointer hover:border-slate-500 transition-colors">
                      <input
                        type="checkbox"
                        checked={editUserPermissions[key as keyof UserPermissions]}
                        onChange={(e) => setEditUserPermissions(prev => ({
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

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-700">
                <button type="button" onClick={closeEditModal} className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={editUserMutation.isPending} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50">
                  {editUserMutation.isPending ? <Spinner size="sm" /> : <Edit className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- CHANGE PASSWORD MODAL --- */}
      {isPasswordModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="bg-slate-800 border border-slate-700 rounded-xl shadow-2xl max-w-md w-full">
            <div className="p-6 border-b border-slate-700 flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">Change Password</h3>
              <button onClick={() => setPasswordModalOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handlePasswordReset} className="p-6 space-y-6">
              <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-sm">
                Changing password for: <strong>{selectedUser.email}</strong>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-400">New Password</label>
                <input
                  type="text"
                  required
                  minLength={6}
                  placeholder="Enter new password..."
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full px-4 py-2 bg-slate-900/50 border border-slate-600 rounded-lg focus:ring-2 focus:ring-amber-500 text-white"
                />
                <p className="text-xs text-slate-500">Must be at least 6 characters.</p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setPasswordModalOpen(false)}
                  className="px-4 py-2 text-slate-300 hover:bg-slate-700 rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editUserMutation.isPending}
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors flex items-center gap-2"
                >
                  {editUserMutation.isPending ? <Spinner size="sm" /> : <Key className="w-4 h-4" />}
                  Update Password
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