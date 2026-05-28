import React, { useCallback, useEffect, useRef, useState } from 'react'

export const MAX_PASTED_IMAGES = 3
const MAX_PASTED_IMAGE_BYTES = 10 * 1024 * 1024
const ACCEPTED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp'])

export interface PastedImage {
  id: string
  dataUrl: string
  mime: string
}

function collectImageFiles(
  items: DataTransferItemList | null | undefined,
  fileList: FileList | null | undefined,
): File[] {
  const collected: File[] = []
  const seenKeys = new Set<string>()
  const fileKey = (f: File): string => `${f.name}|${f.size}|${f.type}|${f.lastModified}`
  const tryAdd = (file: File | null | undefined): void => {
    if (!file) return
    if (!file.type.startsWith('image/')) return
    const key = fileKey(file)
    if (seenKeys.has(key)) return
    seenKeys.add(key)
    collected.push(file)
  }
  if (items) {
    for (const item of Array.from(items)) {
      if (item.kind !== 'file') continue
      if (item.type && !item.type.startsWith('image/')) continue
      tryAdd(item.getAsFile())
    }
  }
  if (fileList) {
    for (const file of Array.from(fileList)) tryAdd(file)
  }
  return collected.filter((f) => ACCEPTED_IMAGE_MIME.has(f.type))
}

export interface ChatImagePaste {
  images: PastedImage[]
  isDraggingOver: boolean
  pasteNotice: string | null
  removeImage: (id: string) => void
  clearImages: () => void
  dragHandlers: {
    onDragEnter: (e: React.DragEvent<HTMLDivElement>) => void
    onDragOver: (e: React.DragEvent<HTMLDivElement>) => void
    onDragLeave: (e: React.DragEvent<HTMLDivElement>) => void
    onDrop: (e: React.DragEvent<HTMLDivElement>) => void
  }
}

/**
 * Manages pasted/dropped image attachments for the chat input: clipboard and
 * drag-and-drop ingestion, dedupe, size/count limits, and transient notices.
 */
export function useChatImagePaste(
  acceptImages: boolean,
  inputRef: React.RefObject<HTMLTextAreaElement | null>,
): ChatImagePaste {
  const [images, setImages] = useState<PastedImage[]>([])
  const [pasteNotice, setPasteNotice] = useState<string | null>(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const dragDepthRef = useRef(0)
  const imageCountRef = useRef(0)
  const loadedDataUrlsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    imageCountRef.current = images.length
  }, [images])

  const showPasteNotice = (text: string): void => {
    setPasteNotice(text)
    window.setTimeout(() => setPasteNotice((current) => (current === text ? null : current)), 2500)
  }

  const ingestImageFiles = useCallback((files: File[]): void => {
    if (files.length === 0) return
    const remaining = MAX_PASTED_IMAGES - imageCountRef.current
    if (remaining <= 0) {
      showPasteNotice(`You can attach at most ${MAX_PASTED_IMAGES} images.`)
      return
    }
    if (files.length > remaining) {
      showPasteNotice(`Only the first ${remaining} image${remaining === 1 ? '' : 's'} were added.`)
    }
    const accepted = files.slice(0, remaining)
    for (const file of accepted) {
      if (file.size > MAX_PASTED_IMAGE_BYTES) {
        showPasteNotice('Image too large (max 10MB).')
        continue
      }
      imageCountRef.current += 1
      const id = `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const reader = new FileReader()
      reader.onload = (): void => {
        const result = reader.result
        if (typeof result !== 'string') return
        if (loadedDataUrlsRef.current.has(result)) {
          imageCountRef.current = Math.max(0, imageCountRef.current - 1)
          return
        }
        loadedDataUrlsRef.current.add(result)
        setImages((current) => {
          if (current.some((img) => img.id === id)) return current
          if (current.length >= MAX_PASTED_IMAGES) return current
          return [...current, { id, dataUrl: result, mime: file.type }]
        })
      }
      reader.readAsDataURL(file)
    }
  }, [])

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('Files')) return
    e.preventDefault()
    dragDepthRef.current += 1
    setIsDraggingOver(true)
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    const types = e.dataTransfer?.types
    if (!types || !Array.from(types).includes('Files')) return
    e.preventDefault()
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    e.preventDefault()
    dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
    if (dragDepthRef.current === 0) setIsDraggingOver(false)
  }

  const handleDrop = (e: React.DragEvent<HTMLDivElement>): void => {
    if (!acceptImages) return
    e.preventDefault()
    dragDepthRef.current = 0
    setIsDraggingOver(false)
    const imageFiles = collectImageFiles(e.dataTransfer?.items, e.dataTransfer?.files)
    if (imageFiles.length === 0) {
      showPasteNotice('Only PNG, JPEG, GIF, or WebP images are supported.')
      return
    }
    ingestImageFiles(imageFiles)
  }

  useEffect(() => {
    if (!acceptImages) return
    const swallow = (e: DragEvent): void => {
      if (!e.dataTransfer) return
      if (!Array.from(e.dataTransfer.types).includes('Files')) return
      e.preventDefault()
    }
    window.addEventListener('dragover', swallow)
    window.addEventListener('drop', swallow)
    return () => {
      window.removeEventListener('dragover', swallow)
      window.removeEventListener('drop', swallow)
    }
  }, [acceptImages])

  useEffect(() => {
    if (!acceptImages) return
    const onPaste = (e: ClipboardEvent): void => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || (tag === 'TEXTAREA' && target !== inputRef.current)) return
      if (target?.isContentEditable && target !== inputRef.current) return
      const imageFiles = collectImageFiles(e.clipboardData?.items, e.clipboardData?.files)
      if (imageFiles.length === 0) return
      e.preventDefault()
      ingestImageFiles(imageFiles)
      inputRef.current?.focus()
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [acceptImages, ingestImageFiles, inputRef])

  const removeImage = (id: string): void => {
    setImages((prev) => {
      const removed = prev.find((img) => img.id === id)
      if (removed) loadedDataUrlsRef.current.delete(removed.dataUrl)
      const next = prev.filter((img) => img.id !== id)
      imageCountRef.current = next.length
      return next
    })
  }

  const clearImages = (): void => {
    setImages([])
    imageCountRef.current = 0
    loadedDataUrlsRef.current.clear()
    setPasteNotice(null)
  }

  return {
    images,
    isDraggingOver,
    pasteNotice,
    removeImage,
    clearImages,
    dragHandlers: {
      onDragEnter: handleDragEnter,
      onDragOver: handleDragOver,
      onDragLeave: handleDragLeave,
      onDrop: handleDrop,
    },
  }
}
