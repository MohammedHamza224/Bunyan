// Centralized React Query key factory
export const queryKeys = {
  dashboard: () => ['dashboard'] as const,
  clients: {
    all: (filters?: Record<string, unknown>) => ['clients', filters] as const,
    detail: (id: string) => ['clients', id] as const,
  },
  sites: {
    all: (filters?: Record<string, unknown>) => ['sites', filters] as const,
    detail: (id: string) => ['sites', id] as const,
  },
  workItems: {
    all: (filters?: Record<string, unknown>) => ['workItems', filters] as const,
  },
  workEntries: {
    all: (filters?: Record<string, unknown>) => ['workEntries', filters] as const,
    detail: (id: string) => ['workEntries', id] as const,
  },
  statements: {
    all: (filters?: Record<string, unknown>) => ['statements', filters] as const,
    detail: (id: string) => ['statements', id] as const,
  },
  invoices: {
    all: (filters?: Record<string, unknown>) => ['invoices', filters] as const,
    detail: (id: string) => ['invoices', id] as const,
  },
  payments: {
    all: (filters?: Record<string, unknown>) => ['payments', filters] as const,
  },
  settings: {
    organization: () => ['settings', 'organization'] as const,
    users: () => ['settings', 'users'] as const,
  },
}
