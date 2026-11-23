import { Toaster } from 'sonner'

import { useTheme } from '@/theme/ThemeProvider'

/** Toasts that follow the light/dark theme. */
export function ThemedToaster() {
  const { theme } = useTheme()
  return (
    <Toaster
      theme={theme}
      position="bottom-right"
      toastOptions={{ className: '!rounded-2xl !border-border !bg-surface !text-foreground' }}
    />
  )
}
