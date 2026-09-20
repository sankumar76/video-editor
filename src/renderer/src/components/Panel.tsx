import type { PropsWithChildren, ReactElement } from 'react'
import styles from './Panel.module.css'

interface PanelProps {
  title: string
  className?: string
}

export default function Panel({
  title,
  className,
  children
}: PropsWithChildren<PanelProps>): ReactElement {
  return (
    <section className={className ? `${styles.panel} ${className}` : styles.panel}>
      <div className={styles.header}>{title}</div>
      <div className={styles.body}>{children}</div>
    </section>
  )
}
