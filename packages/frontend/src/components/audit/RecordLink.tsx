import React from 'react'
import { useInRouterContext, Link } from 'react-router-dom'

interface RecordLinkProps {
  to: string
  className?: string
  title?: string
  onClick?: () => void
  children: React.ReactNode
}

/**
 * Safe navigation link that renders a React Router <Link> when inside a Router context,
 * or falls back safely to an HTML <a> tag when rendered outside a router (e.g. in tests or SSR).
 */
export function RecordLink({ to, className, title, onClick, children }: RecordLinkProps) {
  const inRouter = useInRouterContext()

  if (inRouter) {
    return (
      <Link to={to} className={className} title={title} onClick={onClick}>
        {children}
      </Link>
    )
  }

  return (
    <a href={to} className={className} title={title} onClick={onClick}>
      {children}
    </a>
  )
}
