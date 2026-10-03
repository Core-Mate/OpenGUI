/** Transport contracts shared by independently installed host runtimes. */
export interface VideoDevice { readonly id: string; readonly serial: string }
export interface ScrcpyStreamSink {
  sendText(text: string): void
  sendBinary(data: Buffer): void
  bufferedBytes(): number
  close(code?: number, reason?: string): void
  onClose(listener: () => void): void
}
