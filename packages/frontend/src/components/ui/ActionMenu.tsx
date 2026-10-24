import { useState } from 'react'
import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import {
  MoreVertical,
  Eye,
  Edit2,
  Archive,
  RotateCcw,
  Trash2,
  ShieldAlert,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

export interface ActionMenuItem {
  key: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
  onClick: () => void
  variant?: 'default' | 'danger' | 'warning' | 'success'
  disabled?: boolean
  disabledReason?: string
  hidden?: boolean
}

export interface ActionMenuProps {
  onView?: () => void
  onEdit?: () => void
  onArchive?: () => void
  onRestore?: () => void
  onDelete?: () => void
  onPermanentDelete?: () => void
  isArchived?: boolean
  canDelete?: boolean
  canPermanentDelete?: boolean
  deleteBlockedReason?: string
  customItems?: ActionMenuItem[]
  align?: 'start' | 'end'
  triggerTestId?: string
}

export function ActionMenu({
  onView,
  onEdit,
  onArchive,
  onRestore,
  onDelete,
  onPermanentDelete,
  isArchived = false,
  canDelete = false,
  canPermanentDelete = false,
  deleteBlockedReason,
  customItems = [],
  align = 'end',
  triggerTestId = 'record-actions-trigger',
}: ActionMenuProps) {
  const { t, i18n } = useTranslation()
  const isAr = i18n.language === 'ar'
  const [open, setOpen] = useState(false)

  const items: ActionMenuItem[] = []

  // 1. View Details
  if (onView) {
    items.push({
      key: 'view',
      label: t('common.dataMgmt.viewDetails'),
      icon: Eye,
      onClick: () => {
        setOpen(false)
        onView()
      },
      variant: 'default',
    })
  }

  // 2. Edit
  if (onEdit) {
    items.push({
      key: 'edit',
      label: t('common.dataMgmt.edit'),
      icon: Edit2,
      onClick: () => {
        setOpen(false)
        onEdit()
      },
      variant: 'default',
    })
  }

  // 3. Archive (when active)
  if (onArchive && !isArchived) {
    items.push({
      key: 'archive',
      label: t('common.dataMgmt.archive'),
      icon: Archive,
      onClick: () => {
        setOpen(false)
        onArchive()
      },
      variant: 'warning',
    })
  }

  // 4. Restore (when archived)
  if (onRestore && isArchived) {
    items.push({
      key: 'restore',
      label: t('common.dataMgmt.restore'),
      icon: RotateCcw,
      onClick: () => {
        setOpen(false)
        onRestore()
      },
      variant: 'success',
    })
  }

  // 5. Delete (Safe delete)
  if (onDelete) {
    items.push({
      key: 'delete',
      label: t('common.dataMgmt.delete'),
      icon: Trash2,
      onClick: () => {
        setOpen(false)
        onDelete()
      },
      variant: 'danger',
      disabled: false,
      disabledReason: !canDelete ? deleteBlockedReason : undefined,
    })
  }

  // 6. Permanent Delete (Admin level, when safe or for permanent action)
  if (onPermanentDelete && canPermanentDelete) {
    items.push({
      key: 'permanent-delete',
      label: t('common.dataMgmt.permanentDelete'),
      icon: ShieldAlert,
      onClick: () => {
        setOpen(false)
        onPermanentDelete()
      },
      variant: 'danger',
    })
  }

  // Custom additional items
  for (const item of customItems) {
    if (!item.hidden) {
      items.push(item)
    }
  }

  if (items.length === 0) return null

  return (
    <DropdownMenu.Root open={open} onOpenChange={setOpen} dir={isAr ? 'rtl' : 'ltr'}>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          data-testid={triggerTestId}
          aria-label={t('common.actions')}
          className="p-1.5 text-gray-500 hover:text-[#18324B] hover:bg-[#EAF0F5] focus:outline-none focus:ring-2 focus:ring-[#18324B]/30 rounded-lg transition-colors"
        >
          <MoreVertical className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align={align}
          sideOffset={5}
          className="z-50 min-w-[190px] bg-white rounded-xl p-1.5 shadow-lg border border-[#E4E7EC] text-sm animate-in fade-in-80 select-none"
        >
          {items.map((item, idx) => {
            const Icon = item.icon
            let colorClasses =
              'text-[#1F2937] hover:bg-[#F5F7FA] focus:bg-[#EAF0F5] focus:text-[#18324B]'

            if (item.variant === 'danger') {
              colorClasses =
                'text-rose-600 hover:bg-rose-50 focus:bg-rose-50 focus:text-rose-700'
            } else if (item.variant === 'warning') {
              colorClasses =
                'text-amber-700 hover:bg-amber-50 focus:bg-amber-50 focus:text-amber-800'
            } else if (item.variant === 'success') {
              colorClasses =
                'text-emerald-700 hover:bg-emerald-50 focus:bg-emerald-50 focus:text-emerald-800'
            }

            return (
              <DropdownMenu.Item
                key={item.key || idx}
                disabled={item.disabled}
                onSelect={(e) => {
                  e.preventDefault()
                  item.onClick()
                }}
                className={`relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-semibold cursor-pointer outline-none transition-colors ${colorClasses} ${
                  item.disabled ? 'opacity-50 cursor-not-allowed' : ''
                }`}
              >
                {Icon && <Icon className="w-4 h-4 shrink-0" />}
                <span className="flex-1">{item.label}</span>
                {item.disabledReason && (
                  <span className="text-[10px] text-gray-400 font-normal">
                    ({item.disabledReason})
                  </span>
                )}
              </DropdownMenu.Item>
            )
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  )
}
