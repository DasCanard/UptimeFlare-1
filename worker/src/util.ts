import { MonitorTarget, NotificationConfig, AppriseNotification, WebhookNotification } from '../../uptime.types';
import { notifications } from '../../uptime.config';

async function getWorkerLocation() {
  const res = await fetch('https://cloudflare.com/cdn-cgi/trace')
  const text = await res.text()

  const colo = /^colo=(.*)$/m.exec(text)?.[1]
  return colo
}

const fetchTimeout = (
  url: string,
  ms: number,
  { signal, ...options }: RequestInit<RequestInitCfProperties> | undefined = {}
): Promise<Response> => {
  const controller = new AbortController()
  const promise = fetch(url, { signal: controller.signal, ...options })
  if (signal) signal.addEventListener('abort', () => controller.abort())
  const timeout = setTimeout(() => controller.abort(), ms)
  return promise.finally(() => clearTimeout(timeout))
}

function withTimeout<T>(millis: number, promise: Promise<T>): Promise<T> {
  const timeout = new Promise<T>((resolve, reject) =>
    setTimeout(() => reject(new Error(`Promise timed out after ${millis}ms`)), millis)
  )

  return Promise.race([promise, timeout])
}

function formatStatusChangeNotification(
  monitor: any,
  isUp: boolean,
  timeIncidentStart: number,
  timeNow: number,
  reason: string,
  timeZone: string
) {
  const dateFormatter = new Intl.DateTimeFormat('en-US', {
    month: 'numeric',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: timeZone,
  })

  let downtimeDuration = Math.round((timeNow - timeIncidentStart) / 60);
  const timeNowFormatted = dateFormatter.format(new Date(timeNow * 1000))
  const timeIncidentStartFormatted = dateFormatter.format(new Date(timeIncidentStart * 1000))

  if (isUp) {
    return {
      title: `✅ ${monitor.name} is up!`,
      body: `The service is up again after being down for ${downtimeDuration} minutes.`,
    }
  } else if (timeNow == timeIncidentStart) {
    return {
      title: `🔴 ${monitor.name} is currently down.`,
      body: `Service is unavailable at ${timeNowFormatted}. Issue: ${reason || 'unspecified'}`,
    }
  } else {
    return {
      title: `🔴 ${monitor.name} is still down.`,
      body: `Service is unavailable since ${timeIncidentStartFormatted} (${downtimeDuration} minutes). Issue: ${reason || 'unspecified'}`,
    }
  }
}

async function notifyWithApprise(
  appriseApiServer: string,
  recipientUrl: string,
  title: string,
  body: string
) {
  console.log('Sending Apprise notification: ' + title + '-' + body + ' to ' + recipientUrl + ' via ' + appriseApiServer)
  try {
    const resp = await fetchTimeout(appriseApiServer, 5000, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        urls: recipientUrl,
        title,
        body,
        type: 'warning',
        format: 'text'
      }),
    })

    if (!resp.ok) {
      console.log('Error calling apprise server, code: ' + resp.status + ', response: ' + await resp.text())
    } else {
      console.log('Apprise notification sent successfully, code: ' + resp.status)
    }
  } catch (e) {
    console.log('Error calling apprise server: ' + e)
  }
}

async function notifyWithWebhook(
  url: string,
  method: string,
  headers: Record<string, string>,
  title: string,
  body: string
) {
  console.log(`Sending Webhook notification: ${title} - ${body} to ${url}`)
  try {
    const resp = await fetchTimeout(url, 5000, {
      method: method || 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      },
      body: JSON.stringify({
        title,
        body,
        timestamp: Date.now(),
      }),
    })

    if (!resp.ok) {
      console.log(`Error calling webhook, code: ${resp.status}, response: ${await resp.text()}`)
    } else {
      console.log(`Webhook notification sent successfully, code: ${resp.status}`)
    }
  } catch (e) {
    console.log(`Error calling webhook: ${e}`)
  }
}

// New function to handle multiple notification types
async function sendNotifications(
  monitor: MonitorTarget,
  isUp: boolean,
  timeIncidentStart: number,
  timeNow: number,
  reason: string
) {
  // Get notification configurations for this monitor
  const notificationIds = monitor.notifications || notifications.map(n => n.id);

  if (notificationIds.length === 0) {
    console.log(`No notifications configured for monitor ${monitor.name}`)
    return;
  }

  // Process each notification
  for (const notificationId of notificationIds) {
    const notificationConfig = notifications.find(n => n.id === notificationId);

    if (!notificationConfig) {
      console.log(`Notification configuration with ID ${notificationId} not found for monitor ${monitor.name}`)
      continue;
    }

    // Check grace period
    const gracePeriod = notificationConfig.gracePeriod;
    const downtime = timeNow - timeIncidentStart;

    // Skip notification if grace period is set and not met for DOWN notifications
    // For UP notifications, only send if we previously sent a DOWN notification
    if (!isUp && gracePeriod !== undefined && downtime < gracePeriod * 60 - 30) {
      console.log(`Grace period (${gracePeriod}m) not met for ${monitor.name} with notification ${notificationId}, skipping`)
      continue;
    }

    if (isUp && gracePeriod !== undefined && downtime < (gracePeriod + 1) * 60 - 30) {
      console.log(`Grace period for UP notification not met for ${monitor.name} with notification ${notificationId}, skipping`)
      continue;
    }

    // Format notification message
    const notification = formatStatusChangeNotification(
      monitor,
      isUp,
      timeIncidentStart,
      timeNow,
      reason,
      notificationConfig.timeZone || 'Etc/GMT'
    );

    // Send notification based on type
    if (notificationConfig.type === 'apprise') {
      const appriseConfig = notificationConfig as AppriseNotification;
      await notifyWithApprise(
        appriseConfig.appriseApiServer,
        appriseConfig.recipientUrl,
        notification.title,
        notification.body
      );
    } else if (notificationConfig.type === 'webhook') {
      const webhookConfig = notificationConfig as WebhookNotification;
      await notifyWithWebhook(
        webhookConfig.url,
        webhookConfig.method || 'POST',
        webhookConfig.headers || {},
        notification.title,
        notification.body
      );
    }
  }
}

export {
  getWorkerLocation,
  fetchTimeout,
  withTimeout,
  notifyWithApprise,
  notifyWithWebhook,
  formatStatusChangeNotification,
  sendNotifications
}
