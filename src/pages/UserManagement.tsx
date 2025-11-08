import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAllUsers, createUserWithRole, updateUserProfile, deleteUser } from '../services/authService';
import { useAuth } from '../contexts/AuthContext';
import { UserAccess, UserRole, UserProfile } from '../types';
import { Check, X, Plus, UserPlus, Edit, Trash2 } from 'lucide-react';
import Spinner from '../components/ui/Spinner';
import ConfirmationModal from '../components/ui/ConfirmationModal';

const accessPermissions: (keyof UserAccess)[] = [
  'dashboard', 'orders', 'revenue', 'sales_reports', 'production_reports', 'settings'
];

const UserManagementPage: React.FC = () => {
  const { role } = useAuth();
  const queryClient = useQueryClient();
  const [isCreateModalOpen, setCreateModalOpen] = useState(false);
  const [isEditModalOpen, setEditModalOpen] = useState(false);
  const [isDeleteModalOpen, setDeleteModalOpen] = useState(false);

  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);

  // State for Create Modal
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<UserRole>(UserRole.AGENT);
  const [newUserAccess, setNewUserAccess] = useState<Record<string, boolean>>({
    dashboard: true,
    orders: true,
    revenue: false,
    sales_reports: false,
    production_reports: false,
    settings: false,
  });
  const [createdUserInfo, setCreatedUserInfo] = useState<{ email: string; tempPass: string } | null>(null);

  // State for Edit Modal
  const [editUserName, setEditUserName] = useState('');
  const [editUserRole, setEditUserRole] = useState<UserRole>(UserRole.AGENT);
  const [editUserAccess, setEditUserAccess] = useState<Record<string, boolean>>({
    ...newUserAccess, // Use same default
  });

  // --- MUTATIONS ---

  const createUserMutation = useMutation({
    mutationFn: () => createUserWithRole(newUserEmail, newUserRole, newUserAccess, newUserName),
    onSuccess: (data) => {
      if (data.error) {
        throw new Error(data.error);
      }
      if (data.user && data.temporaryPassword) {
        setCreatedUserInfo({ email: data.user.email!, tempPass: data.temporaryPassword });
      }
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      // Don't close modal immediately, show password first
    },
    onError: (error: Error) => {
      // Error will be displayed in the modal
      console.error(error);
    },
  });

  const editUserMutation = useMutation({
    mutationFn: (userId: string) => updateUserProfile(userId, {
      full_name: editUserName,
      role: editUserRole,
      access: editUserAccess,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      closeEditModal();
    },
    onError: (error: Error) => console.error(error),
  });

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) => deleteUser(userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allUsers'] });
      closeDeleteModal();
    },
    onError: (error: Error) => console.error(error),
  });

  // --- EVENT HANDLERS ---

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    createUserMutation.mutate();
  };

  const handleEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUser) {
      editUserMutation.mutate(selectedUser.id);
    }
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
    setNewUserRole(UserRole.AGENT);
    setCreatedUserInfo(null);
    createUserMutation.reset();
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setEditUserName(user.full_name || '');
    setEditUserRole(user.role as UserRole);
    setEditUserAccess((user.access as unknown as Record<string, boolean>) || { ...newUserAccess });
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

  // Fetch all users using the new admin-only function
  const { data: users, isLoading, error } = useQuery({
    queryKey: ['allUsers'],
    queryFn: async () => {
      const { data, error } = await getAllUsers();
      if (error) {
        throw new Error(typeof error === 'string' ? error : 'Failed to fetch users');
      }
      return data;
    },
    // This query should only run if the user is an ADMIN
    enabled: role === 'ADMIN',
  });

  if (role !== 'ADMIN') {
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
              {users.map((user) => (
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
                      {accessPermissions.map((permission) => (
                        <div key={permission} className="flex items-center gap-1.5">
                          {user.access && user.access[permission] ? (
                            <Check className="w-4 h-4 text-green-400" />
                          ) : (
                            <X className="w-4 h-4 text-red-400" />
                          )}
                          <span className="text-xs capitalize">{permission.replace('_', ' ')}</span>
                        </div>
                      ))}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-300">
                    <div className="flex items-center gap-4">
                      <button onClick={() => openEditModal(user)} className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1">
                        <Edit className="w-4 h-4" /> Edit
                      </button>
                      <button onClick={() => openDeleteModal(user)} className="text-red-400 hover:text-red-300 flex items-center gap-1">
                        <Trash2 className="w-4 h-4" /> Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
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

      {/* Create User Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl p-6 bg-slate-800 border border-slate-700 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-slate-100">
                {createdUserInfo ? 'User Created Successfully' : 'Create New User'}
              </h3>
              <button onClick={closeAndResetModal} className="text-slate-400 hover:text-white">&times;</button>
            </div>

            {createdUserInfo ? (
              <div className="space-y-4 text-center p-8 bg-slate-900/50 rounded-lg">
                <UserPlus className="w-12 h-12 text-green-400 mx-auto" />
                <p className="text-slate-300">User <strong className="text-white">{createdUserInfo.email}</strong> has been created.</p>
                <p className="text-slate-400 text-sm">Please provide them with their temporary password:</p>
                <div className="bg-slate-950 p-3 rounded-lg border border-slate-700">
                  <code className="text-lg font-mono text-cyan-300">{createdUserInfo.tempPass}</code>
                </div>
                <button onClick={closeAndResetModal} className="mt-4 px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700">
                  Done
                </button>
              </div>
            ) : (
              <form onSubmit={handleCreateUser} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Email Address</label>
                    <input
                      type="email"
                      value={newUserEmail}
                      onChange={(e) => setNewUserEmail(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Full Name</label>
                    <input
                      type="text"
                      value={newUserName}
                      onChange={(e) => setNewUserName(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-400 mb-1">Role</label>
                    <select
                      value={newUserRole}
                      onChange={(e) => setNewUserRole(e.target.value as UserRole)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value={UserRole.AGENT}>Agent</option>
                      <option value={UserRole.PRODUCTION}>Production</option>
                      <option value={UserRole.ADMIN}>Admin</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-2">Access Permissions</label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                    {accessPermissions.map((permission) => (
                      <label key={permission} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                          checked={newUserAccess[permission]}
                          onChange={(e) =>
                            setNewUserAccess((prev) => ({ ...prev, [permission]: e.target.checked }))
                          }
                        />
                        <span className="text-sm capitalize">{permission.replace('_', ' ')}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {createUserMutation.isError && (
                  <p className="text-sm text-red-400">Error: {createUserMutation.error.message}</p>
                )}

                <div className="flex justify-end gap-4 pt-4">
                  <button type="button" onClick={closeAndResetModal} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                    Cancel
                  </button>
                  <button type="submit" disabled={createUserMutation.isPending} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                    {createUserMutation.isPending && <Spinner small />}
                    Create User
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {isEditModalOpen && selectedUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl p-6 bg-slate-800 border border-slate-700 rounded-xl shadow-lg">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-semibold text-slate-100">Edit User: {selectedUser.email}</h3>
              <button onClick={closeEditModal} className="text-slate-400 hover:text-white">&times;</button>
            </div>

            <form onSubmit={handleEditUser} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Full Name</label>
                  <input
                    type="text"
                    value={editUserName}
                    onChange={(e) => setEditUserName(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-400 mb-1">Role</label>
                  <select
                    value={editUserRole}
                    onChange={(e) => setEditUserRole(e.target.value as UserRole)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                  >
                    <option value={UserRole.AGENT}>Agent</option>
                    <option value={UserRole.PRODUCTION}>Production</option>
                    <option value={UserRole.ADMIN}>Admin</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-400 mb-2">Access Permissions</label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-700">
                  {accessPermissions.map((permission) => (
                    <label key={permission} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded bg-slate-700 border-slate-600 text-blue-500 focus:ring-blue-500"
                        checked={editUserAccess[permission]}
                        onChange={(e) =>
                          setEditUserAccess((prev) => ({ ...prev, [permission]: e.target.checked }))
                        }
                      />
                      <span className="text-sm capitalize">{permission.replace('_', ' ')}</span>
                    </label>
                  ))}
                </div>
              </div>

              {editUserMutation.isError && (
                <p className="text-sm text-red-400">Error: {editUserMutation.error.message}</p>
              )}

              <div className="flex justify-end gap-4 pt-4">
                <button type="button" onClick={closeEditModal} className="px-4 py-2 rounded-lg bg-slate-700 text-slate-300 hover:bg-slate-600 transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={editUserMutation.isPending} className="px-4 py-2 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2">
                  {editUserMutation.isPending && <Spinner small />}
                  Save Changes
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