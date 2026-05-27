import React from 'react'

interface ImagePreviewProps {
  filePath: string
  dataUrl: string
}

const styles: Record<string, React.CSSProperties> = {
  wrapper: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: '100%',
    padding: '16px',
    overflow: 'auto',
    background: 'var(--bg-primary)',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
    objectFit: 'contain',
    userSelect: 'none',
  },
}

export function ImagePreview({ filePath, dataUrl }: ImagePreviewProps): React.JSX.Element {
  return (
    <div style={styles.wrapper}>
      <img src={dataUrl} alt={filePath} style={styles.image} draggable={false} />
    </div>
  )
}
