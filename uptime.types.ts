type MonitorState = {
  lastUpdate: number
  overallUp: number
  overallDown: number
  incident: Record<
    string,
    {
      start: number[]
      end: number | undefined // undefined if it's still open
      error: string[]
    }[]
  >

  latency: Record<
    string,
    {
      recent: {
        loc: string
        ping: number
        time: number
      }[] // recent 12 hour data, 2 min interval
      all: {
        loc: string
        ping: number
        time: number
      }[] // all data in 90 days, 1 hour interval
    }
  >
}

type MonitorTarget = {
  id: string
  name: string
  method: string // "TCP_PING" or Http Method (e.g. GET, POST, OPTIONS, etc.)
  target: string // url for http, hostname:port for tcp
  tooltip?: string
  statusPageLink?: string
  checkLocationWorkerRoute?: string
  hideLatencyChart?: boolean

  // HTTP Code
  expectedCodes?: number[]
  timeout?: number
  headers?: Record<string, string | undefined>
  body?: BodyInit
  responseKeyword?: string
  responseForbiddenKeyword?: string

  // Monitor-specific notifications
  notifications?: string[] // IDs of notification configurations to use for this monitor
}

// Notification types
type BaseNotification = {
  id: string // Unique identifier for this notification configuration
  type: string // Type of notification (e.g., "apprise", "webhook", etc.)
  timeZone?: string // Timezone used in notification messages, default to "Etc/GMT"
  gracePeriod?: number // Grace period in minutes before sending a notification
}

type AppriseNotification = BaseNotification & {
  type: "apprise"
  appriseApiServer: string // Apprise API server URL
  recipientUrl: string // Recipient URL for apprise
}

type WebhookNotification = BaseNotification & {
  type: "webhook"
  url: string // Webhook URL
  headers?: Record<string, string> // Optional headers
  method?: string // HTTP method, defaults to POST
}

type NotificationConfig = AppriseNotification | WebhookNotification

// Page configuration
type PageConfig = {
  title: string
  links: Array<{
    link: string
    label: string
    highlight?: boolean
  }>
  group?: Record<string, string[]>
}

// Worker configuration
type WorkerConfig = {
  kvWriteCooldownMinutes: number
  passwordProtection?: string
  monitors: MonitorTarget[]
}

// Callbacks configuration
type CallbacksConfig = {
  onStatusChange?: (env: any, monitor: any, isUp: boolean, timeIncidentStart: number, timeNow: number, reason: string) => Promise<void>
  onIncident?: (env: any, monitor: any, timeIncidentStart: number, timeNow: number, reason: string) => Promise<void>
}

export type {
  MonitorState,
  MonitorTarget,
  NotificationConfig,
  AppriseNotification,
  WebhookNotification,
  PageConfig,
  WorkerConfig,
  CallbacksConfig
}
