import { useState, useRef, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Users,
  Plus,
  Shield,
  MoreVertical,
  Pencil,
  Key,
  UserX,
  UserCheck,
  Trash2,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  X,
  Lock,
} from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/authStore'

export const ALL_PERMISSIONS_LIST = [
  { key: 'VIEW_DATA', ar: 'عرض البيانات', en: 'View Data' },
  { key: 'CREATE_WORK', ar: 'تسجيل الأعمال', en: 'Register Works' },
  { key: 'APPROVE_WORK', ar: 'اعتماد الأعمال', en: 'Approve Works' },
  { key: 'CREATE_STATEMENTS', ar: 'إنشاء المستخلصات', en: 'Create Statements' },
  { key: 'ISSUE_INVOICES', ar: 'إصدار الفواتير', en: 'Issue Invoices' },
  { key: 'RECORD_PAYMENTS', ar: 'تسجيل المدفوعات', en: 'Record Payments' },
  { key: 'MANAGE_SETTINGS', ar: 'إدارة الإعدادات والمستخدمين', en: 'Manage Settings & Users' },
]

interface UsersManagementTabProps {
  isAr: boolean
  canManage: boolean
}

export function UsersManagementTab({ isAr, canManage }: UsersManagementTabProps) {
  const { t } = useTranslation()
  const { user } = useAuth()
  const queryClient = useQueryClient()

  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [activeMenuUserId, setActiveMenuUserId] = useState<string | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  // Modals state
  const [editingUser, setEditingUser] = useState<any | null>(null)
  const [editFormData, setEditFormData] = useState({
    nameAr: '',
    nameEn: '',
    email: '',
    role: 'ORG_STAFF',
    permissions: [] as string[],
    isActive: true,
  })

  const [resettingUser, setResettingUser] = useState<any | null>(null)
  const [resetPasswordData, setResetPasswordData] = useState({
    newPassword: '',
    confirmPassword: '',
  })
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)

  // New User Modal & Form State (Starts 100% empty on open)
  const getInitialNewUserState = () => ({
    nameAr: '',
    nameEn: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '', // Neutral placeholder initially
    permissions: [] as string[],
  })

  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [newUser, setNewUser] = useState(getInitialNewUserState())
  const [showNewUserPassword, setShowNewUserPassword] = useState(false)
  const [showNewUserConfirmPassword, setShowNewUserConfirmPassword] = useState(false)
  const [newUserValidationError, setNewUserValidationError] = useState<string | null>(null)

  const openAddModal = () => {
    setNewUser(getInitialNewUserState())
    setShowNewUserPassword(false)
    setShowNewUserConfirmPassword(false)
    setNewUserValidationError(null)
    setStatusMsg(null)
    setIsAddModalOpen(true)
  }

  const closeAddModal = () => {
    setIsAddModalOpen(false)
    setNewUser(getInitialNewUserState())
    setShowNewUserPassword(false)
    setShowNewUserConfirmPassword(false)
    setNewUserValidationError(null)
  }

  const handleNewUserRoleChange = (selectedRole: string) => {
    let perms: string[] = []
    if (selectedRole === 'ORG_ADMIN') {
      perms = ALL_PERMISSIONS_LIST.map((p) => p.key)
    } else if (selectedRole === 'ORG_MANAGER') {
      perms = [
        'VIEW_DATA',
        'CREATE_WORK',
        'APPROVE_WORK',
        'CREATE_STATEMENTS',
        'ISSUE_INVOICES',
        'RECORD_PAYMENTS',
      ]
    } else if (selectedRole === 'ORG_STAFF') {
      perms = ['VIEW_DATA', 'CREATE_WORK']
    }
    setNewUser((prev) => ({
      ...prev,
      role: selectedRole,
      permissions: perms,
    }))
  }

  // Close actions menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuUserId(null)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Queries
  const { data: usersList, isLoading: loadingUsers } = useQuery({
    queryKey: ['orgUsers'],
    queryFn: async () => {
      const res = await api.get('/organizations/users')
      return res.data?.data || res.data
    },
  })

  // Mutations
  const createUserMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/organizations/users', payload)
      return res.data?.data || res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      closeAddModal()
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تمت إضافة المستخدم بنجاح' : 'User added successfully',
      })
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.error?.message || t('errors.serverError')
      setNewUserValidationError(msg)
      setStatusMsg({
        type: 'error',
        text: msg,
      })
    },
  })

  const updateUserMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const res = await api.put(`/organizations/users/${id}`, payload)
      return res.data?.data || res.data
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      setEditingUser(null)
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تم تحديث بيانات المستخدم بنجاح' : 'User details updated successfully',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text: err?.response?.data?.error?.message || t('errors.serverError'),
      })
    },
  })

  const resetPasswordMutation = useMutation({
    mutationFn: async ({ id, newPassword, confirmPassword }: { id: string; newPassword: string; confirmPassword?: string }) => {
      const res = await api.post(`/organizations/users/${id}/reset-password`, {
        newPassword,
        confirmPassword,
      })
      return res.data
    },
    onSuccess: () => {
      setResettingUser(null)
      setResetPasswordData({ newPassword: '', confirmPassword: '' })
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تم إعادة تعيين كلمة المرور بنجاح' : 'Password reset successfully',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text: err?.response?.data?.error?.message || t('errors.serverError'),
      })
    },
  })

  const activateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/organizations/users/${userId}/activate`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تم تفعيل حساب المستخدم بنجاح' : 'User account activated successfully',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text: err?.response?.data?.error?.message || t('errors.serverError'),
      })
    },
  })

  const deactivateUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.post(`/organizations/users/${userId}/deactivate`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تم تعطيل حساب المستخدم بنجاح' : 'User account deactivated successfully',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text: err?.response?.data?.error?.message || t('errors.serverError'),
      })
    },
  })

  const deleteUserPermanentMutation = useMutation({
    mutationFn: async (userId: string) => {
      await api.delete(`/organizations/users/${userId}?permanent=true`)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orgUsers'] })
      setStatusMsg({
        type: 'success',
        text: isAr ? 'تم حذف المستخدم نهائياً بنجاح' : 'User deleted permanently',
      })
    },
    onError: (err: any) => {
      setStatusMsg({
        type: 'error',
        text:
          err?.response?.data?.error?.message ||
          (isAr ? 'تعذر حذف المستخدم' : 'Failed to delete user'),
      })
    },
  })

  // Handlers
  const openEditModal = (u: any) => {
    setActiveMenuUserId(null)
    setEditingUser(u)
    setEditFormData({
      nameAr: u.nameAr || '',
      nameEn: u.nameEn || '',
      email: u.email || '',
      role: u.role || 'ORG_STAFF',
      permissions: Array.isArray(u.permissions) ? [...u.permissions] : [],
      isActive: u.isActive ?? true,
    })
  }

  const handleEditSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingUser) return
    setStatusMsg(null)

    const payload: any = {
      nameAr: editFormData.nameAr.trim(),
      nameEn: editFormData.nameEn.trim() || null,
      email: editFormData.email.trim().toLowerCase(),
    }

    // Only administrators updating other users (or keeping role identical) can submit role/permissions
    if (canManage) {
      payload.role = editFormData.role
      payload.permissions = editFormData.permissions
      payload.isActive = editFormData.isActive
    }

    updateUserMutation.mutate({
      id: editingUser.id,
      payload,
    })
  }

  const openResetPasswordModal = (u: any) => {
    setActiveMenuUserId(null)
    setResettingUser(u)
    setResetPasswordData({
      newPassword: '',
      confirmPassword: '',
    })
    setShowNewPassword(false)
    setShowConfirmPassword(false)
  }

  const handleResetPasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!resettingUser) return

    if (resetPasswordData.newPassword.length < 8) {
      setStatusMsg({
        type: 'error',
        text: isAr ? 'يجب أن تتكون كلمة المرور من 8 أحرف على الأقل' : 'Password must be at least 8 characters',
      })
      return
    }

    if (resetPasswordData.newPassword !== resetPasswordData.confirmPassword) {
      setStatusMsg({
        type: 'error',
        text: isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match',
      })
      return
    }

    resetPasswordMutation.mutate({
      id: resettingUser.id,
      newPassword: resetPasswordData.newPassword,
      confirmPassword: resetPasswordData.confirmPassword,
    })
  }

  const toggleEditPerm = (perm: string) => {
    setEditFormData((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  const toggleNewUserPerm = (perm: string) => {
    setNewUser((prev) => ({
      ...prev,
      permissions: prev.permissions.includes(perm)
        ? prev.permissions.filter((p) => p !== perm)
        : [...prev.permissions, perm],
    }))
  }

  const handleCreateUserSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setNewUserValidationError(null)
    setStatusMsg(null)

    if (!newUser.nameAr.trim()) {
      setNewUserValidationError(isAr ? 'الاسم باللغة العربية مطلوب' : 'Arabic Name is required')
      return
    }
    if (!newUser.email.trim()) {
      setNewUserValidationError(isAr ? 'البريد الإلكتروني مطلوب' : 'Email address is required')
      return
    }
    if (!newUser.role) {
      setNewUserValidationError(isAr ? 'يرجى اختيار الدور الوظيفي للمستخدم' : 'Please select a user role')
      return
    }
    if (!newUser.password) {
      setNewUserValidationError(isAr ? 'كلمة المرور مطلوبة' : 'Password is required')
      return
    }
    if (newUser.password.length < 8) {
      setNewUserValidationError(
        isAr
          ? 'يجب ألا تقل كلمة المرور عن 8 أحرف'
          : 'Password must be at least 8 characters'
      )
      return
    }
    if (newUser.password !== newUser.confirmPassword) {
      setNewUserValidationError(
        isAr
          ? 'كلمة المرور وتأكيد كلمة المرور غير متطابقتين'
          : 'Password and Confirm Password do not match'
      )
      return
    }

    createUserMutation.mutate({
      nameAr: newUser.nameAr.trim(),
      nameEn: newUser.nameEn.trim() || undefined,
      email: newUser.email.trim().toLowerCase(),
      password: newUser.password,
      role: newUser.role,
      permissions: newUser.permissions.length > 0 ? newUser.permissions : undefined,
    })
  }

  return (
    <div className="space-y-6">
      {statusMsg && (
        <div
          role="status"
          className={`p-4 rounded-xl border flex items-center justify-between text-sm ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-red-50 border-red-200 text-red-700'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusMsg.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 shrink-0" />
            )}
            <span>{statusMsg.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Users Table Card */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-visible">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-blue-600" />
            <h2 className="text-base font-semibold text-gray-900">{t('settings.users')}</h2>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-500 font-medium">
              {isAr ? `إجمالي المستخدمين: ${(usersList || []).length}` : `Total Users: ${(usersList || []).length}`}
            </span>
            {canManage && (
              <button
                type="button"
                data-testid="add-user-btn"
                onClick={openAddModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors shrink-0"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>{t('settings.addUser')}</span>
              </button>
            )}
          </div>
        </div>

        {loadingUsers ? (
          <div className="p-8 text-center text-sm text-gray-500">{t('common.loading')}</div>
        ) : (
          <div className="overflow-x-visible">
            <table className="w-full text-sm text-start">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-start">{t('common.name')}</th>
                  <th className="px-6 py-3 text-start">{t('common.email')}</th>
                  <th className="px-6 py-3 text-start">{t('settings.userRole')}</th>
                  <th className="px-6 py-3 text-start">{t('common.status')}</th>
                  {canManage && <th className="px-6 py-3 text-end">{isAr ? 'الإجراءات' : 'Actions'}</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(usersList || []).map((u: any) => {
                  const isSelf = u.id === user?.id
                  const isMenuOpen = activeMenuUserId === u.id

                  return (
                    <tr key={u.id} className="hover:bg-gray-50/80 transition-colors">
                      <td className="px-6 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-xs uppercase shrink-0">
                            {u.nameAr ? u.nameAr.slice(0, 1) : u.email.slice(0, 1)}
                          </div>
                          <div>
                            <div className="font-medium text-gray-900 flex items-center gap-1.5">
                              <span>{u.nameAr}</span>
                              {isSelf && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                                  {isAr ? 'حسابك' : 'You'}
                                </span>
                              )}
                            </div>
                            {u.nameEn && <div className="text-xs text-gray-400">{u.nameEn}</div>}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-3.5 text-gray-600" dir="ltr">
                        {u.email}
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium ${
                            u.role === 'ORG_ADMIN'
                              ? 'bg-purple-50 text-purple-700 border border-purple-200'
                              : u.role === 'ORG_MANAGER'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-gray-100 text-gray-700 border border-gray-200'
                          }`}
                        >
                          {u.role === 'ORG_ADMIN'
                            ? t('settings.orgAdmin')
                            : u.role === 'ORG_MANAGER'
                            ? t('settings.manager')
                            : t('settings.user')}
                        </span>
                      </td>
                      <td className="px-6 py-3.5">
                        <span
                          className={`px-2.5 py-1 rounded-full text-xs font-medium inline-flex items-center gap-1 ${
                            u.isActive
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              u.isActive ? 'bg-emerald-500' : 'bg-red-500'
                            }`}
                          />
                          <span>{u.isActive ? t('common.active') : t('common.inactive')}</span>
                        </span>
                      </td>
                      {canManage && (
                        <td className="px-6 py-3.5 text-end relative">
                          <div className="inline-block text-start">
                            <button
                              type="button"
                              data-testid={`user-actions-btn-${u.id}`}
                              onClick={() =>
                                setActiveMenuUserId(isMenuOpen ? null : u.id)
                              }
                              className="p-1.5 rounded-lg border border-gray-200 text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                              title={isAr ? 'قائمة الإجراءات' : 'Actions Menu'}
                            >
                              <MoreVertical className="w-4 h-4" />
                            </button>

                            {isMenuOpen && (
                              <div
                                ref={menuRef}
                                className={`absolute ${
                                  isAr ? 'left-6' : 'right-6'
                                } mt-1 w-52 bg-white rounded-xl shadow-lg border border-gray-200 py-1.5 z-50 text-xs font-medium`}
                              >
                                {/* 1. Edit User Action */}
                                <button
                                  type="button"
                                  data-testid={`action-edit-user-${u.id}`}
                                  onClick={() => openEditModal(u)}
                                  className="w-full flex items-center gap-2 px-3.5 py-2 text-gray-700 hover:bg-blue-50 hover:text-blue-700 transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5 text-blue-600" />
                                  <span>{isAr ? 'تعديل المستخدم' : 'Edit User'}</span>
                                </button>

                                {/* 2. Reset Password Action */}
                                <button
                                  type="button"
                                  data-testid={`action-reset-password-${u.id}`}
                                  onClick={() => openResetPasswordModal(u)}
                                  className="w-full flex items-center gap-2 px-3.5 py-2 text-gray-700 hover:bg-amber-50 hover:text-amber-700 transition-colors"
                                >
                                  <Key className="w-3.5 h-3.5 text-amber-600" />
                                  <span>{isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}</span>
                                </button>

                                {/* 3. Activate / Deactivate Action */}
                                {u.isActive ? (
                                  <button
                                    type="button"
                                    data-testid={`action-deactivate-user-${u.id}`}
                                    disabled={isSelf}
                                    onClick={() => {
                                      setActiveMenuUserId(null)
                                      if (
                                        window.confirm(
                                          isAr
                                            ? `هل أنت متأكد من تعطيل حساب المستخدم ${u.email}؟ سيتم إنهاء كافة جلساته النشطة.`
                                            : `Are you sure you want to deactivate ${u.email}? All active sessions will be terminated.`
                                        )
                                      ) {
                                        deactivateUserMutation.mutate(u.id)
                                      }
                                    }}
                                    className={`w-full flex items-center gap-2 px-3.5 py-2 text-amber-700 hover:bg-amber-50 transition-colors ${
                                      isSelf ? 'opacity-40 cursor-not-allowed' : ''
                                    }`}
                                  >
                                    <UserX className="w-3.5 h-3.5" />
                                    <span>{isAr ? 'تعطيل الحساب' : 'Deactivate Account'}</span>
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    data-testid={`action-activate-user-${u.id}`}
                                    onClick={() => {
                                      setActiveMenuUserId(null)
                                      if (
                                        window.confirm(
                                          isAr
                                            ? `هل تريد تفعيل حساب المستخدم ${u.email}؟`
                                            : `Do you want to re-activate ${u.email}?`
                                        )
                                      ) {
                                        activateUserMutation.mutate(u.id)
                                      }
                                    }}
                                    className="w-full flex items-center gap-2 px-3.5 py-2 text-emerald-700 hover:bg-emerald-50 transition-colors"
                                  >
                                    <UserCheck className="w-3.5 h-3.5" />
                                    <span>{isAr ? 'تفعيل الحساب' : 'Activate Account'}</span>
                                  </button>
                                )}

                                {/* 4. Permanent Delete (for inactive users only) */}
                                {!u.isActive && !isSelf && (
                                  <div className="border-t border-gray-100 my-1">
                                    <button
                                      type="button"
                                      data-testid={`action-delete-user-${u.id}`}
                                      onClick={() => {
                                        setActiveMenuUserId(null)
                                        if (
                                          window.confirm(
                                            isAr
                                              ? `هل أنت متأكد من الحذف النهائي للمستخدم ${u.email}؟ لا يمكن حذف المستخدم إلا إذا لم يكن له أي سجلات نشاط سابقة في النظام.`
                                              : `Are you sure you want to permanently delete user ${u.email}? Permitted only if zero historical activity exists.`
                                          )
                                        ) {
                                          deleteUserPermanentMutation.mutate(u.id)
                                        }
                                      }}
                                      className="w-full flex items-center gap-2 px-3.5 py-2 text-red-600 hover:bg-red-50 transition-colors"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                      <span>{isAr ? 'حذف نهائي' : 'Delete Permanently'}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          Add New User Modal
      ────────────────────────────────────────────────────────────── */}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm ${
          isAddModalOpen ? 'block' : 'hidden'
        }`}
      >
        <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-xl max-h-[90vh] overflow-y-auto animate-in fade-in zoom-in duration-150">
          {/* Modal Header */}
          <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                <Plus className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-gray-900">{t('settings.addUser')}</h3>
                <p className="text-xs text-gray-500">
                  {isAr
                    ? 'تسجيل مستخدم جديد ومنحه الصلاحيات المناسبة'
                    : 'Register a new user and assign appropriate permissions'}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={closeAddModal}
              className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Validation Error Banner */}
          {newUserValidationError && (
            <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{newUserValidationError}</span>
            </div>
          )}

          {/* Modal Form */}
          <form
            autoComplete="off"
            onSubmit={handleCreateUserSubmit}
            className="p-6 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Arabic Name */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('settings.nameAr')} *
                </label>
                <input
                  type="text"
                  required
                  value={newUser.nameAr}
                  onChange={(e) => setNewUser({ ...newUser, nameAr: e.target.value })}
                  placeholder={isAr ? 'الاسم الثلاثي أو الرباعي' : 'Arabic Name'}
                  autoComplete="off"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {/* English Name (Optional) */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'الاسم بالإنجليزية (اختياري)' : 'Full Name (English)'}
                </label>
                <input
                  type="text"
                  dir="ltr"
                  value={newUser.nameEn}
                  onChange={(e) => setNewUser({ ...newUser, nameEn: e.target.value })}
                  placeholder="Full Name in English"
                  autoComplete="off"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {/* Email Address */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.email')} *
                </label>
                <input
                  type="email"
                  required
                  dir="ltr"
                  value={newUser.email}
                  onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                  placeholder="name@example.com"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('auth.password')} *
                </label>
                <div className="relative">
                  <input
                    type={showNewUserPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={newUser.password}
                    onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full ps-3.5 pe-10 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewUserPassword(!showNewUserPassword)}
                    className="absolute top-2.5 end-3 text-gray-400 hover:text-gray-600"
                  >
                    {showNewUserPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Confirm Password */}
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'تأكيد كلمة المرور *' : 'Confirm Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showNewUserConfirmPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={newUser.confirmPassword}
                    onChange={(e) =>
                      setNewUser({ ...newUser, confirmPassword: e.target.value })
                    }
                    placeholder="••••••••"
                    autoComplete="new-password"
                    className="w-full ps-3.5 pe-10 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setShowNewUserConfirmPassword(!showNewUserConfirmPassword)
                    }
                    className="absolute top-2.5 end-3 text-gray-400 hover:text-gray-600"
                  >
                    {showNewUserConfirmPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              {/* Role Dropdown with Neutral Placeholder */}
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {t('settings.userRole')} *
                </label>
                <select
                  required
                  value={newUser.role}
                  onChange={(e) => handleNewUserRoleChange(e.target.value)}
                  className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white"
                >
                  <option value="">{isAr ? '-- اختر الدور الوظيفي --' : '-- Select User Role --'}</option>
                  <option value="ORG_STAFF">{t('settings.user')}</option>
                  <option value="ORG_MANAGER">{t('settings.manager')}</option>
                  <option value="ORG_ADMIN">{t('settings.orgAdmin')}</option>
                </select>
              </div>
            </div>

            {/* Granular Permissions Selection */}
            <div className="pt-2">
              <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-blue-600" />
                <span>{isAr ? 'الصلاحيات المخصصة للمستخدم' : 'Customizable User Permissions'}</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                {ALL_PERMISSIONS_LIST.map((perm) => (
                  <label
                    key={perm.key}
                    className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer text-xs font-medium text-gray-700"
                  >
                    <input
                      type="checkbox"
                      checked={
                        newUser.role === 'ORG_ADMIN' || newUser.permissions.includes(perm.key)
                      }
                      disabled={newUser.role === 'ORG_ADMIN'}
                      onChange={() => toggleNewUserPerm(perm.key)}
                      className="rounded text-blue-600"
                    />
                    <span>{isAr ? perm.ar : perm.en}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
              <button
                type="button"
                onClick={closeAddModal}
                className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium transition-colors"
              >
                {isAr ? 'إلغاء' : 'Cancel'}
              </button>
              <button
                type="submit"
                disabled={createUserMutation.isPending}
                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50 transition-colors"
              >
                {createUserMutation.isPending ? t('common.loading') : t('settings.addUser')}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          Edit User Modal
      ────────────────────────────────────────────────────────────── */}
      {editingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-xl overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center">
                  <Pencil className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {isAr ? 'تعديل بيانات المستخدم' : 'Edit User Profile'}
                  </h3>
                  <p className="text-xs text-gray-500" dir="ltr">
                    {editingUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <form onSubmit={handleEditSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الاسم الكامل (بالعربية) *' : 'Full Name (Arabic) *'}
                  </label>
                  <input
                    type="text"
                    required
                    value={editFormData.nameAr}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, nameAr: e.target.value })
                    }
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'الاسم بالإنجليزية' : 'Full Name (English)'}
                  </label>
                  <input
                    type="text"
                    dir="ltr"
                    value={editFormData.nameEn}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, nameEn: e.target.value })
                    }
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'البريد الإلكتروني *' : 'Email Address *'}
                  </label>
                  <input
                    type="email"
                    required
                    dir="ltr"
                    value={editFormData.email}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, email: e.target.value })
                    }
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'دور المستخدم' : 'User Role'}
                  </label>
                  <select
                    value={editFormData.role}
                    disabled={editingUser.id === user?.id}
                    onChange={(e) =>
                      setEditFormData({ ...editFormData, role: e.target.value })
                    }
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
                  >
                    <option value="ORG_STAFF">{t('settings.user')}</option>
                    <option value="ORG_MANAGER">{t('settings.manager')}</option>
                    <option value="ORG_ADMIN">{t('settings.orgAdmin')}</option>
                  </select>
                  {editingUser.id === user?.id && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      {isAr
                        ? 'لا يمكنك تغيير دورك الإداري بنفسك للحفاظ على استقرار النظام'
                        : 'You cannot change your own admin role'}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">
                    {isAr ? 'حالة الحساب' : 'Account Status'}
                  </label>
                  <select
                    value={editFormData.isActive ? 'true' : 'false'}
                    disabled={editingUser.id === user?.id}
                    onChange={(e) =>
                      setEditFormData({
                        ...editFormData,
                        isActive: e.target.value === 'true',
                      })
                    }
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm bg-white disabled:bg-gray-100"
                  >
                    <option value="true">{t('common.active')}</option>
                    <option value="false">{t('common.inactive')}</option>
                  </select>
                  {editingUser.id === user?.id && (
                    <p className="text-[11px] text-amber-700 mt-1">
                      {isAr ? 'لا يمكنك تعطيل حسابك بنفسك' : 'You cannot deactivate yourself'}
                    </p>
                  )}
                </div>
              </div>

              {/* Granular Permissions */}
              <div className="pt-2">
                <label className="block text-xs font-semibold text-gray-700 mb-2 flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <span>{isAr ? 'الصلاحيات الممنوحة للمستخدم' : 'Assigned Permissions'}</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {ALL_PERMISSIONS_LIST.map((perm) => (
                    <label
                      key={perm.key}
                      className="flex items-center gap-2 p-2 rounded-lg border border-gray-200 hover:bg-gray-50 cursor-pointer text-xs font-medium text-gray-700"
                    >
                      <input
                        type="checkbox"
                        checked={
                          editFormData.role === 'ORG_ADMIN' ||
                          editFormData.permissions.includes(perm.key)
                        }
                        disabled={editFormData.role === 'ORG_ADMIN'}
                        onChange={() => toggleEditPerm(perm.key)}
                        className="rounded text-blue-600"
                      />
                      <span>{isAr ? perm.ar : perm.en}</span>
                    </label>
                  ))}
                </div>
                {editFormData.role === 'ORG_ADMIN' && (
                  <p className="text-[11px] text-gray-500 mt-1">
                    {isAr
                      ? 'مدير النظام يتمتع بكافة الصلاحيات تلقائياً'
                      : 'Organization Admin automatically receives all permissions'}
                  </p>
                )}
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={updateUserMutation.isPending}
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {updateUserMutation.isPending ? t('common.loading') : isAr ? 'حفظ التغييرات' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          Reset Password Modal
      ────────────────────────────────────────────────────────────── */}
      {resettingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-xl border border-gray-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-150">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-amber-100 text-amber-600 flex items-center justify-center">
                  <Key className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-900">
                    {isAr ? 'إعادة تعيين كلمة المرور' : 'Reset User Password'}
                  </h3>
                  <p className="text-xs text-gray-500" dir="ltr">
                    {resettingUser.email}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResettingUser(null)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleResetPasswordSubmit} className="p-6 space-y-4">
              <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-start gap-2">
                <Lock className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  {isAr
                    ? 'سيتم تشفير كلمة المرور وتحديثها في قاعدة البيانات فوراً، مع إلغاء كافة الجلسات النشطة للمستخدم وإلزامه بتسجيل الدخول مجدداً.'
                    : 'The new password will be hashed and updated immediately. All active user sessions will be invalidated.'}
                </span>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'كلمة المرور الجديدة *' : 'New Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={resetPasswordData.newPassword}
                    onChange={(e) =>
                      setResetPasswordData({
                        ...resetPasswordData,
                        newPassword: e.target.value,
                      })
                    }
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-gray-500 mt-1">
                  {isAr ? '8 أحرف على الأقل' : 'Minimum 8 characters'}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">
                  {isAr ? 'تأكيد كلمة المرور الجديدة *' : 'Confirm New Password *'}
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    dir="ltr"
                    value={resetPasswordData.confirmPassword}
                    onChange={(e) =>
                      setResetPasswordData({
                        ...resetPasswordData,
                        confirmPassword: e.target.value,
                      })
                    }
                    placeholder="••••••••"
                    className="w-full px-3.5 py-2 border border-gray-300 rounded-lg text-sm pe-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute inset-y-0 end-0 pe-3 flex items-center text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* Password Match Status */}
              {resetPasswordData.confirmPassword && (
                <div className="text-xs font-medium">
                  {resetPasswordData.newPassword === resetPasswordData.confirmPassword ? (
                    <span className="text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isAr ? 'كلمتا المرور متطابقتان' : 'Passwords match'}</span>
                    </span>
                  ) : (
                    <span className="text-red-600 flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>{isAr ? 'كلمتا المرور غير متطابقتين' : 'Passwords do not match'}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setResettingUser(null)}
                  className="px-4 py-2 border border-gray-300 text-gray-700 hover:bg-gray-50 rounded-lg text-sm font-medium"
                >
                  {isAr ? 'إلغاء' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={
                    resetPasswordMutation.isPending ||
                    resetPasswordData.newPassword.length < 8 ||
                    resetPasswordData.newPassword !== resetPasswordData.confirmPassword
                  }
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-sm font-semibold shadow-sm disabled:opacity-50"
                >
                  {resetPasswordMutation.isPending
                    ? t('common.loading')
                    : isAr
                    ? 'حفظ كلمة المرور'
                    : 'Save Password'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
