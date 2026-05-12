import { redirect } from 'next/navigation'

// Legacy URL — the SMS-only page was merged into the unified /templates
// page with Email/SMS tabs. Anyone with a bookmark to this path lands on
// the SMS tab directly. Remove this file once we're confident no shared
// links point here.
export default function SmsTemplatesRedirect() {
  redirect('/dashboard/automations/templates?tab=sms')
}
