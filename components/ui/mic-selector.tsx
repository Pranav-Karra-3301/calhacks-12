"use client"
import { useEffect, useState } from 'react'
import { Button } from './button'

interface AudioDevice {
  deviceId: string
  label: string
  groupId: string
}

interface MicSelectorProps {
  value?: string
  onValueChange?: (deviceId: string) => void
  muted?: boolean
  onMutedChange?: (muted: boolean) => void
  disabled?: boolean
  className?: string
}

export function MicSelector({
  value,
  onValueChange,
  muted = false,
  onMutedChange,
  disabled = false,
  className = '',
}: MicSelectorProps) {
  const [devices, setDevices] = useState<AudioDevice[]>([])
  const [selectedDevice, setSelectedDevice] = useState(value || '')
  const [isMuted, setIsMuted] = useState(muted)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDevices()
    
    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadDevices)
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices)
    }
  }, [])

  useEffect(() => {
    if (value !== undefined) {
      setSelectedDevice(value)
    }
  }, [value])

  useEffect(() => {
    if (muted !== undefined) {
      setIsMuted(muted)
    }
  }, [muted])

  async function loadDevices() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(track => track.stop())
      
      const allDevices = await navigator.mediaDevices.enumerateDevices()
      const audioInputs = allDevices
        .filter(device => device.kind === 'audioinput')
        .map(device => ({
          deviceId: device.deviceId,
          label: cleanLabel(device.label),
          groupId: device.groupId,
        }))
      
      setDevices(audioInputs)
      
      if (audioInputs.length > 0 && !selectedDevice) {
        const defaultDevice = audioInputs[0].deviceId
        setSelectedDevice(defaultDevice)
        onValueChange?.(defaultDevice)
      }
      
      setLoading(false)
    } catch (error) {
      console.error('Failed to load audio devices:', error)
      setLoading(false)
    }
  }

  function cleanLabel(label: string): string {
    return label.replace(/\s*\([0-9a-f]{4}:[0-9a-f]{4}\)$/i, '').trim() || 'Microphone'
  }

  function handleDeviceChange(deviceId: string) {
    setSelectedDevice(deviceId)
    onValueChange?.(deviceId)
  }

  function handleMuteToggle() {
    const newMuted = !isMuted
    setIsMuted(newMuted)
    onMutedChange?.(newMuted)
  }

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading devices...</div>
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <select
        value={selectedDevice}
        onChange={(e) => handleDeviceChange(e.target.value)}
        disabled={disabled}
        className="w-full h-9 rounded-md border border-border bg-white px-3 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
      >
        {devices.map((device) => (
          <option key={device.deviceId} value={device.deviceId}>
            {device.label}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        size="sm"
        onClick={handleMuteToggle}
        disabled={disabled}
        className="w-full h-9"
      >
        {isMuted ? 'Unmute' : 'Mute'}
      </Button>
    </div>
  )
}

