import React from 'react'
import { modalStyles } from '../SettingsModal.styles'

export function SectionHeader({ title, description }: { title: string; description: string }): React.JSX.Element {
  return (
    <div style={modalStyles.sectionHeader}>
      <div style={modalStyles.sectionHeading}>{title}</div>
      <div style={modalStyles.sectionDescription}>{description}</div>
    </div>
  )
}

export function SectionCard({
  title,
  description,
  children,
}: React.PropsWithChildren<{ title: string; description: string }>): React.JSX.Element {
  return (
    <section style={modalStyles.sectionCard}>
      <div style={modalStyles.cardHeader}>
        <div style={modalStyles.cardTitle}>{title}</div>
        <div style={modalStyles.cardDescription}>{description}</div>
      </div>
      {children}
    </section>
  )
}
