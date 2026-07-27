import { PageHeader } from '@/components/common/PageHeader'

interface HeaderProps {
  title: string
  subtitle?: string
}

/** @deprecated Prefer PageHeader from @/components/common/PageHeader */
export function Header({ title, subtitle }: HeaderProps) {
  return <PageHeader title={title} description={subtitle} />
}
