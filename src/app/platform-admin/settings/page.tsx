'use client'

import { useState, useEffect } from 'react'

interface SettingsData {
  providers?: Record<string, string>
  email?: Record<string, string>
  integrations?: Record<string, string>
  general?: Record<string, string>
}

const PROVIDER_FIELDS = [
  { key: 'indeed_api_key', label: 'Indeed API Key', category: 'providers', placeholder: 'Enter Indeed API key' },
  { key: 'indeed_employer_id', label: 'Indeed Employer ID', category: 'providers', placeholder: 'Enter Employer ID' },
  { key: 'sendgrid_api_key', label: 'SendGrid API Key', category: 'email', placeholder: 'SG.xxxxx (set via env var)', note: 'Usually set via SENDGRID_API_KEY env var' },
  { key: 'sendgrid_from_email', label: 'SendGrid From Email', category: 'email', placeholder: 'hello@hirefunnel.app' },
  { key: 'sendgrid_from_name', label: 'SendGrid From Name', category: 'email', placeholder: 'HireFunnel' },
  { key: 'elevenlabs_api_key', label: 'ElevenLabs API Key', category: 'integrations', placeholder: 'sk_xxxxxxxxxxxxxxxx', note: 'Required for AI Calls — fetches conversations and evaluations' },
  { key: 'calendly_api_key', label: 'Calendly API Key (future)', category: 'integrations', placeholder: 'For future Calendly API integration' },
  { key: 'platform_name', label: 'Platform Name', category: 'general', placeholder: 'HireFunnel' },
  { key: 'support_email', label: 'Support Email', category: 'general', placeholder: 'support@hirefunnel.app' },
]

export default function PlatformSettingsPage() {
  const [settings, setSettings] = useState<SettingsData>({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [values, setValues] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/platform/settings').then(r => r.json()).then(d => {
      setSettings(d)
      const flat: Record<string, string> = {}
      for (const cat of Object.values(d) as Record<string, string>[]) {
        for (const [k, v] of Object.entries(cat)) flat[k] = v
      }
      setValues(flat)
      setLoading(false)
    })
  }, [])

  const save = async () => {
    setSaving(true)
    const grouped: Record<string, Record<string, string>> = {}
    for (const field of PROVIDER_FIELDS) {
      if (!grouped[field.category]) grouped[field.category] = {}
      grouped[field.category][field.key] = values[field.key] || ''
    }
    await fetch('/api/platform/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(grouped),
    })
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div className="text-center py-12 text-[#94a3b8]">Loading...</div>

  const categories = [
    { key: 'general', label: 'General', icon: 'cog' },
    { key: 'email', label: 'Email / SendGrid', icon: 'mail' },
    { key: 'providers', label: 'Job Boards (Indeed)', icon: 'link' },
    { key: 'integrations', label: 'Integrations', icon: 'puzzle' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Platform Settings</h1>
        <button onClick={save} disabled={saving} className={`px-5 py-2 text-sm font-medium rounded-md ${saved ? 'bg-green-600 text-white' : 'bg-amber-500 text-black hover:bg-amber-400'} disabled:opacity-50`}>
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save All'}
        </button>
      </div>

      <div className="space-y-6">
        {categories.map(cat => {
          const fields = PROVIDER_FIELDS.filter(f => f.category === cat.key)
          if (fields.length === 0) return null
          return (
            <div key={cat.key} className="bg-[#1e293b] rounded-lg border border-[#334155] p-6">
              <h2 className="text-lg font-semibold text-white mb-4">{cat.label}</h2>
              <div className="space-y-4">
                {fields.map(field => (
                  <div key={field.key}>
                    <label className="block text-sm text-[#94a3b8] mb-1.5">{field.label}</label>
                    <input
                      type={field.key.includes('api_key') || field.key.includes('secret') ? 'password' : 'text'}
                      value={values[field.key] || ''}
                      onChange={(e) => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                      placeholder={field.placeholder}
                      className="w-full px-4 py-2.5 bg-[#0f172a] border border-[#334155] rounded-md text-[#e2e8f0] text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 placeholder-[#475569]"
                    />
                    {field.note && <p className="text-xs text-[#475569] mt-1">{field.note}</p>}
                  </div>
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
