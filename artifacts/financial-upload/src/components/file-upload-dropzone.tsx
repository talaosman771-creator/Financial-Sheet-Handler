import * as React from "react"
import { useFormContext } from "react-hook-form"
import { motion, AnimatePresence } from "framer-motion"
import { UploadCloud, File as FileIcon, X } from "lucide-react"
import { cn } from "@/lib/utils"

interface FileUploadDropzoneProps {
  name: string
  accept?: string
  maxSizeMB?: number
}

export function FileUploadDropzone({ name, accept = ".pdf,.xlsx,.xls", maxSizeMB = 50 }: FileUploadDropzoneProps) {
  const { setValue, watch, formState: { errors } } = useFormContext()
  const [isDragging, setIsDragging] = React.useState(false)
  const file = watch(name) as File | null
  
  const error = errors[name]?.message as string | undefined

  const handleDragOver = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }, [])

  const handleDragLeave = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }, [])

  const processFile = React.useCallback((selectedFile: File) => {
    // Validate file type
    const validExtensions = accept.split(',').map(ext => ext.trim().toLowerCase())
    const fileExtension = '.' + selectedFile.name.split('.').pop()?.toLowerCase()
    
    if (!validExtensions.includes(fileExtension)) {
      alert(`Invalid file type. Please upload one of: ${accept}`)
      return
    }

    // Validate size
    if (selectedFile.size > maxSizeMB * 1024 * 1024) {
      alert(`File is too large. Maximum size is ${maxSizeMB}MB`)
      return
    }

    setValue(name, selectedFile, { shouldValidate: true })
  }, [accept, maxSizeMB, name, setValue])

  const handleDrop = React.useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0])
      e.dataTransfer.clearData()
    }
  }, [processFile])

  const handleFileInput = React.useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFile(e.target.files[0])
    }
  }, [processFile])

  const handleRemove = React.useCallback(() => {
    setValue(name, null, { shouldValidate: true })
  }, [name, setValue])

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  return (
    <div className="w-full">
      <AnimatePresence mode="wait">
        {!file ? (
          <motion.div
            key="dropzone"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "relative flex flex-col items-center justify-center w-full h-48 rounded-xl border-2 border-dashed transition-colors",
              isDragging 
                ? "border-primary bg-primary/5" 
                : error 
                  ? "border-destructive/50 bg-destructive/5"
                  : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <input
              type="file"
              accept={accept}
              onChange={handleFileInput}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              data-testid="input-file-upload"
            />
            <div className="flex flex-col items-center justify-center pt-5 pb-6 text-center px-4">
              <div className={cn(
                "p-3 rounded-full mb-3",
                isDragging ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground"
              )}>
                <UploadCloud className="w-6 h-6" />
              </div>
              <p className="mb-1 text-sm font-semibold text-foreground">
                Click to upload or drag and drop
              </p>
              <p className="text-xs text-muted-foreground">
                PDF or Excel files only (Max {maxSizeMB}MB)
              </p>
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="file-preview"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="relative flex items-center p-4 rounded-xl border bg-card text-card-foreground shadow-sm"
          >
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10 text-primary shrink-0">
              <FileIcon className="w-5 h-5" />
            </div>
            <div className="ml-4 flex-1 min-w-0">
              <p className="text-sm font-medium truncate" title={file.name}>
                {file.name}
              </p>
              <p className="text-xs text-muted-foreground">
                {formatFileSize(file.size)}
              </p>
            </div>
            <button
              type="button"
              onClick={handleRemove}
              className="ml-4 p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-ring"
              data-testid="button-remove-file"
              aria-label="Remove file"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {error && (
        <motion.p
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="text-[0.8rem] font-medium text-destructive mt-2"
        >
          {error}
        </motion.p>
      )}
    </div>
  )
}
