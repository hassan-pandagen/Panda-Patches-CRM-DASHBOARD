// src/pages/UserManagementPage.tsx
// PRODUCTION-READY: Proper error handling, validation, and state management

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createUserWithRole, getAllUsers, deleteUser, updateUserProfile } from '@/services/authService';
import { logger } from '@/services/logger';
import { useAuth } from '../contexts/AuthContext';
import { UserProfile, UserPermissions, UserRole } from '@/types';
import { Check, X, Plus, Edit, Trash2, Key, AlertCircle, Copy, CheckCircle } from 'lucide-react';
import Spinner from '@/components/ui/Spinner';
import ConfirmationModal from '@/components/ui/ConfirmationModal';
import Button from '@/components/ui/Button';
import { useToast } from '@/hooks/useToast';
import { queryKeys } from '@/constants/queryKeys';

// ============================================
// CONSTANTS & TYPES
// ============================================

const EMPTY_PERMISSIONS: UserPermissions = {
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

type ModalMode = 'create' | 'edit' | 'delete' | 'password' | 'viewPermissions' | null;

interface UserFormData {
  email: string;
  name: string;
  password: string;
  role: UserRole;
  permissions: UserPermissions;
}

// ============================================
// PERMISSION PRESETS
// ============================================

const PERMISSION_PRESETS = {
  sales: {
    ...EMPTY_PERMISSIONS,
    orders_create: true,
    orders_view_own_only: true,
    orders_change_status: true,
    orders_edit_financials: true,
    orders_edit_production: true,
    reports_view_financials: true,
    shipping_view: true,
  },
  production: {
    ...EMPTY_PERMISSIONS,
    orders_view_all: true,
    orders_edit_production: true,
  },
  clock_only: {
    ...EMPTY_PERMISSIONS,
    attendance_clock_only: true,
  },
  admin: Object.keys(EMPTY_PERMISSIONS).reduce((acc, key) => {
    acc[key as keyof UserPermissions] = true;
    return acc;
  }, {} as UserPermissions),
};

// ============================================
// PERMISSION LABELS
// ============================================

const PERMISSION_LABELS: Record<keyof UserPermissions, string> = {
  users_manage: 'Manage Users',
  orders_create: 'Create Orders',
  orders_view_all: 'View All Orders',
  orders_view_own_only: 'View Own Orders Only',
  orders_change_status: 'Change Status',
  orders_edit_financials: 'Edit Financials',
  orders_edit_production: 'Edit Production',
  orders_delete: 'Delete Orders',
  reports_view_financials: 'View Reports',
  shipping_view: 'View Shipping',
  attendance_clock_only: 'Clock Only',
};

// ============================================
// VALIDATION FUNCTIONS
// ============================================

const validateEmail = (email: string): string | null => {
  if (!email) return 'Email is required';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Invalid email format';
  return null;
};

const validatePassword = (password: string): string | null => {
  if (!password) return 'Password is required';
  if (password.length < 6) return 'Password must be at least 6 characters';
  return null;
};

const validateName = (name: string): string | null => {
  if (!name) return 'Name is required';
  if (name.length < 2) return 'Name must be at least 2 characters';
  return null;
};

// ============================================
// MAIN COMPONENT
// ============================================

const UserManagementPage: React.FC = () => {
  const { role, permissions } = useAuth();
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  
  // Modal state
  const [modalMode, setModalMode] = useState<ModalMode>(null);
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null);
  
  // Form state
  const [formData, setFormData] = useState<UserFormData>({
    email: '',
    name: '',
    password: '',
    role: UserRole.USER,
    permissions: PERMISSION_PRESETS.sales,
  });
  
  // UI state
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [passwordCopied, setPasswordCopied] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // Prevent double-clicks

  // ============================================
  // QUERIES & MUTATIONS
  // ============================================

  const { data: users, isLoading, error: queryError } = useQuery<UserProfile[], Error>({
    queryKey: queryKeys.users.all(),
    queryFn: getAllUsers,
    enabled: role === UserRole.ADMIN || !!permissions?.users_manage,
  });

  const createUserMutation = useMutation({
    mutationFn: async () => {
      const errors: Record<string, string> = {};
      const emailError = validateEmail(formData.email);
      const passwordError = validatePassword(formData.password);
      const nameError = validateName(formData.name);
      
      if (emailError) errors.email = emailError;
      if (passwordError) errors.password = passwordError;
      if (nameError) errors.name = nameError;
      
      if (Object.keys(errors).length > 0) {
        setValidationErrors(errors);
        throw new Error('Validation failed');
      }
      
      return createUserWithRole(
        formData.email,
        formData.role,
        formData.permissions,
        formData.name,
        formData.password
      );
    },
    onSuccess: (data) => {
      setIsSubmitting(false);
      if (data.error) {
        showError('Creation Failed', data.error);
        return;
      }
      
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      success('User Created', `${formData.email} has been added successfully.`);
      closeAllModals();
    },
    onError: (error: Error) => {
      setIsSubmitting(false);
      if (error.message !== 'Validation failed') {
        showError('Creation Failed', error.message);
      }
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async (data: { id: string; updates: any }) => {
      return updateUserProfile(data.id, data.updates);
    },
    onSuccess: () => {
      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      success('User Updated', 'Changes have been saved successfully.');
      closeAllModals();
    },
    onError: (error: Error) => {
      setIsSubmitting(false);
      showError('Update Failed', error.message);
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      setIsSubmitting(false);
      queryClient.invalidateQueries({ queryKey: queryKeys.users.all() });
      success('User Deleted', `${selectedUser?.email} has been removed.`);
      closeAllModals();
    },
    onError: (error: Error) => {
      setIsSubmitting(false);
      showError('Deletion Failed', error.message);
    },
  });

  // ============================================
  // EVENT HANDLERS
  // ============================================

  const resetForm = () => {
    setFormData({
      email: '',
      name: '',
      password: '',
      role: UserRole.USER,
      permissions: PERMISSION_PRESETS.sales,
    });
    setValidationErrors({});
    setPasswordCopied(false);
  };

  const closeAllModals = () => {
    setModalMode(null);
    setSelectedUser(null);
    resetForm();
  };

  const openCreateModal = () => {
    resetForm();
    setModalMode('create');
  };

  const openEditModal = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.full_name || '',
      password: '',
      role: user.role as UserRole,
      permissions: user.permissions || EMPTY_PERMISSIONS,
    });
    setModalMode('edit');
  };

  const openDeleteModal = (user: UserProfile) => {
    setSelectedUser(user);
    setModalMode('delete');
  };

  const openPasswordModal = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({ ...formData, password: '' });
    setModalMode('password');
  };

  const openPermissionsModal = (user: UserProfile) => {
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.full_name || '',
      password: '',
      role: user.role as UserRole,
      permissions: user.permissions || EMPTY_PERMISSIONS,
    });
    setModalMode('viewPermissions');
  };

  const handleCreateUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return; // Prevent double-submit
    setIsSubmitting(true);
    createUserMutation.mutate();
  };

  const handleEditUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || isSubmitting) return; // Prevent double-submit
    
    setIsSubmitting(true);
    updateUserMutation.mutate({
      id: selectedUser.id,
      updates: {
        full_name: formData.name,
        role: formData.role,
        permissions: formData.permissions,
      },
    });
  };

  const handlePasswordReset = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUser || isSubmitting) return; // Prevent double-submit
    
    const passwordError = validatePassword(formData.password);
    if (passwordError) {
      setValidationErrors({ password: passwordError });
      return;
    }
    
    setIsSubmitting(true);
    updateUserMutation.mutate({
      id: selectedUser.id,
      updates: { password: formData.password },
    });
  };

  const handleDeleteUser = () => {
    if (selectedUser) {
      deleteUserMutation.mutate(selectedUser.id);
    }
  };

  const applyPreset = (presetName: keyof typeof PERMISSION_PRESETS) => {
    setFormData(prev => ({
      ...prev,
      permissions: PERMISSION_PRESETS[presetName],
    }));
  };

  const handleCopyPassword = () => {
    navigator.clipboard.writeText(formData.password);
    setPasswordCopied(true);
    setTimeout(() => setPasswordCopied(false), 2000);
  };

  // ============================================
  // PERMISSION CHECK
  // ============================================

  if (role !== UserRole.ADMIN && !permissions?.users_manage) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-red-400 mb-2">Access Denied</h2>
          <p className="text-slate-300">You do not have permission to manage users.</p>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER
  // ============================================

  return (
    <div className="max-w-7xl mx-auto p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-4xl font-bold text-white">User Management</h1>
            <p className="text-slate-400 mt-2">Manage team members and their permissions</p>
          </div>
          <Button 
            onClick={openCreateModal}
            className="flex items-center gap-2"
          >
            <Plus className="w-5 h-5" />
            Create User
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      )}
      
      {/* Error State */}
      {queryError && (
        <div className="bg-red-900/20 border border-red-500/50 rounded-xl p-4 mb-6">
          <p className="text-red-400">Error loading users: {queryError.message}</p>
        </div>
      )}

      {/* Users Table */}
      {!isLoading && !queryError && (!users || users.length === 0) ? (
        <div className="text-center py-12 rounded-xl border border-white/10 bg-slate-900/40">
          <Plus className="w-12 h-12 text-slate-500 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No users found</h3>
          <p className="text-slate-500 mb-6">Get started by creating your first team member</p>
          <Button onClick={openCreateModal} variant="secondary">
            Create User
          </Button>
        </div>
      ) : users && users.length > 0 && (
        <div className="group relative bg-slate-900/40 backdrop-blur-xl border border-white/10 rounded-2xl shadow-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10 bg-slate-900/50">
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Role</th>
                  <th className="px-6 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">Permissions</th>
                  <th className="px-6 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {users.map((user) => (
                  <tr 
                    key={user.id} 
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-6 py-4 text-sm text-slate-200 font-medium">{user.email}</td>
                    <td className="px-6 py-4 text-sm text-slate-300">{user.full_name || '-'}</td>
                    <td className="px-6 py-4 text-sm">
                      <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                        user.role === 'ADMIN' 
                          ? 'bg-brand-orange/20 text-brand-orange' 
                          : 'bg-brand-green/20 text-brand-green'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-sm">
                      <div className="flex flex-wrap gap-2">
                        {Object.entries(user.permissions || {})
                          .filter(([_, hasAccess]) => hasAccess)
                          .slice(0, 2)
                          .map(([permission]) => (
                            <span 
                              key={permission} 
                              className="px-2 py-1 bg-brand-green/10 text-brand-green text-xs rounded-md border border-brand-green/20"
                            >
                              ✓ {PERMISSION_LABELS[permission as keyof UserPermissions]}
                            </span>
                          ))}
                        {Object.values(user.permissions || {}).filter(Boolean).length > 2 && (
                          <button
                            onClick={() => openPermissionsModal(user)}
                            className="text-xs text-slate-300 px-2 py-1 hover:bg-slate-700 rounded-md transition-colors cursor-pointer"
                          >
                            +{Object.values(user.permissions || {}).filter(Boolean).length - 2}
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button 
                          onClick={() => openEditModal(user)} 
                          className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-brand-orange"
                          title="Edit User"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openPasswordModal(user)}
                          className="p-2 hover:bg-slate-700 rounded-lg transition-colors text-slate-400 hover:text-slate-200"
                          title="Change Password"
                        >
                          <Key className="w-4 h-4" />
                        </button>
                        <button 
                          onClick={() => openDeleteModal(user)} 
                          className="p-2 hover:bg-red-900/20 rounded-lg transition-colors text-slate-400 hover:text-red-400"
                          title="Delete User"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={modalMode === 'delete'}
        onClose={closeAllModals}
        onConfirm={handleDeleteUser}
        title="Delete User"
        message={`Are you sure you want to delete ${selectedUser?.email}? This action cannot be undone.`}
        isConfirming={deleteUserMutation.isPending}
      />

      {/* Create User Modal */}
      {modalMode === 'create' && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleCreateUser} className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Create User</h2>
                <p className="text-slate-400 text-sm mt-1">Add a new team member</p>
              </div>

              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange transition-colors"
                  placeholder="user@example.com"
                />
                {validationErrors.email && <p className="text-red-400 text-xs mt-1">{validationErrors.email}</p>}
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange transition-colors"
                  placeholder="John Doe"
                />
                {validationErrors.name && <p className="text-red-400 text-xs mt-1">{validationErrors.name}</p>}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange transition-colors"
                  placeholder="••••••"
                />
                {validationErrors.password && <p className="text-red-400 text-xs mt-1">{validationErrors.password}</p>}
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-brand-orange transition-colors"
                >
                  <option value={UserRole.USER}>User (Sales Agent)</option>
                  <option value={UserRole.AGENT}>Agent</option>
                  <option value={UserRole.PRODUCTION}>Production</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>

              {/* Permissions Presets */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Permission Preset</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => applyPreset('sales')}
                    className="px-3 py-2 bg-slate-800 border border-white/10 hover:border-brand-orange rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Sales
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('production')}
                    className="px-3 py-2 bg-slate-800 border border-white/10 hover:border-brand-orange rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Production
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('clock_only')}
                    className="px-3 py-2 bg-slate-800 border border-white/10 hover:border-brand-orange rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Clock Only
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPreset('admin')}
                    className="px-3 py-2 bg-slate-800 border border-white/10 hover:border-brand-orange rounded-lg text-sm text-slate-300 hover:text-white transition-colors"
                  >
                    Admin
                  </button>
                </div>
              </div>

              {/* Permissions Grid */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Permissions</label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-3 bg-slate-800/30 rounded-lg border border-white/5">
                  {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.permissions[key as keyof UserPermissions]}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            [key]: e.target.checked,
                          },
                        }))}
                        className="w-4 h-4 rounded bg-slate-700 border-white/20 text-brand-orange focus:ring-brand-orange cursor-pointer"
                      />
                      <span className="text-sm text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeAllModals}
                  className="flex-1 px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={createUserMutation.isPending}
                  className="flex-1"
                >
                  {createUserMutation.isPending ? 'Creating...' : 'Create User'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {modalMode === 'edit' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl max-w-xl w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleEditUser} className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Edit User</h2>
                <p className="text-slate-400 text-sm mt-1">{selectedUser.email}</p>
              </div>

              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Full Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-brand-orange transition-colors"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">Role</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData({...formData, role: e.target.value as UserRole})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white focus:outline-none focus:border-brand-orange transition-colors"
                >
                  <option value={UserRole.USER}>User (Sales Agent)</option>
                  <option value={UserRole.AGENT}>Agent</option>
                  <option value={UserRole.PRODUCTION}>Production</option>
                  <option value={UserRole.ADMIN}>Admin</option>
                </select>
              </div>

              {/* Permissions Grid */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-3">Permissions</label>
                <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto p-3 bg-slate-800/30 rounded-lg border border-white/5">
                  {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors">
                      <input
                        type="checkbox"
                        checked={formData.permissions[key as keyof UserPermissions]}
                        onChange={(e) => setFormData(prev => ({
                          ...prev,
                          permissions: {
                            ...prev.permissions,
                            [key]: e.target.checked,
                          },
                        }))}
                        className="w-4 h-4 rounded bg-slate-700 border-white/20 text-brand-orange focus:ring-brand-orange cursor-pointer"
                      />
                      <span className="text-sm text-slate-300">{label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeAllModals}
                  className="flex-1 px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="flex-1"
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Password Reset Modal */}
      {modalMode === 'password' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl max-w-md w-full">
            <form onSubmit={handlePasswordReset} className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">Reset Password</h2>
                <p className="text-slate-400 text-sm mt-1">{selectedUser.email}</p>
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-2">New Password</label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-brand-orange transition-colors"
                  placeholder="••••••"
                />
                {validationErrors.password && <p className="text-red-400 text-xs mt-1">{validationErrors.password}</p>}
              </div>

              {/* Copy Button */}
              {formData.password && (
                <button
                  type="button"
                  onClick={handleCopyPassword}
                  className="w-full px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 text-sm"
                >
                  {passwordCopied ? (
                    <>
                      <CheckCircle className="w-4 h-4 text-brand-green" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      Copy Password
                    </>
                  )}
                </button>
              )}

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeAllModals}
                  className="flex-1 px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending || !formData.password}
                  className="flex-1"
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Reset Password'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* View All Permissions Modal */}
      {modalMode === 'viewPermissions' && selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900/95 border border-white/10 rounded-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <form onSubmit={handleEditUser} className="p-8 space-y-6">
              <div>
                <h2 className="text-2xl font-bold text-white">All Permissions</h2>
                <p className="text-slate-400 text-sm mt-1">{selectedUser.email}</p>
              </div>

              {/* Permissions Grid */}
              <div className="space-y-2">
                {Object.entries(PERMISSION_LABELS).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-3 cursor-pointer hover:bg-white/5 p-2 rounded transition-colors">
                    <input
                      type="checkbox"
                      checked={formData.permissions[key as keyof UserPermissions]}
                      onChange={(e) => setFormData(prev => ({
                        ...prev,
                        permissions: {
                          ...prev.permissions,
                          [key]: e.target.checked,
                        },
                      }))}
                      className="w-4 h-4 rounded bg-slate-700 border-white/20 text-brand-orange focus:ring-brand-orange cursor-pointer"
                    />
                    <span className="text-sm text-slate-300">{label}</span>
                  </label>
                ))}
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={closeAllModals}
                  className="flex-1 px-4 py-2 bg-slate-800 border border-white/10 rounded-lg text-white hover:bg-slate-700 transition-colors"
                >
                  Cancel
                </button>
                <Button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="flex-1"
                >
                  {updateUserMutation.isPending ? 'Saving...' : 'Save Changes'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserManagementPage;
