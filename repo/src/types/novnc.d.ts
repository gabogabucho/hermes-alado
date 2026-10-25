declare module '@novnc/novnc' {
  /** Structural surface of noVNC's RFB used by the Computadora live viewer
   *  (the package ships no types; the real class is `core/rfb.js`). */
  export default class RFB {
    constructor(target: HTMLElement, urlOrSocket: WebSocket | string, options?: Record<string, unknown>)
    viewOnly: boolean
    scaleViewport: boolean
    resizeSession: boolean
    focusOnClick: boolean
    background: string
    qualityLevel: number
    addEventListener(type: string, handler: (event: { detail?: { clean?: boolean; reason?: string } }) => void): void
    disconnect(): void
    focus(): void
    sendKey(keysym: number, code: string, down?: boolean): void
  }
}
