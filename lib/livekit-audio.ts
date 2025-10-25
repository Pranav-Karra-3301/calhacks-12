import { Room, LocalAudioTrack, createLocalAudioTrack, Track } from 'livekit-client'

/**
 * Convert audio blob to AudioBuffer for processing
 */
async function blobToAudioBuffer(blob: Blob): Promise<AudioBuffer> {
  const arrayBuffer = await blob.arrayBuffer()
  const audioContext = new AudioContext()
  return await audioContext.decodeAudioData(arrayBuffer)
}

/**
 * Publish audio blob to LiveKit room as a new audio track
 * This is used for moderator voice and AI persona audio
 */
export async function publishAudioBlob(room: Room, audioBlob: Blob, trackName: string = 'audio'): Promise<void> {
  try {
    const audioBuffer = await blobToAudioBuffer(audioBlob)
    const audioContext = new AudioContext()
    
    // Create a MediaStreamDestination to capture audio
    const destination = audioContext.createMediaStreamDestination()
    const source = audioContext.createBufferSource()
    source.buffer = audioBuffer
    source.connect(destination)
    
    // Create LiveKit audio track from MediaStream
    const mediaStreamTrack = destination.stream.getAudioTracks()[0]
    const localTrack = new LocalAudioTrack(mediaStreamTrack)
    
    // Publish the track
    await room.localParticipant.publishTrack(localTrack)
    
    // Start playback
    source.start(0)
    
    // Unpublish when done playing
    setTimeout(async () => {
      try {
        await room.localParticipant.unpublishTrack(localTrack)
        localTrack.stop()
        audioContext.close()
      } catch (e) {
        console.error('Error cleaning up audio track:', e)
      }
    }, (audioBuffer.duration * 1000) + 500)
  } catch (error) {
    console.error('Error publishing audio blob:', error)
    throw error
  }
}

/**
 * Stream audio blob through an existing audio track (for AI persona takeover)
 * This replaces the user's microphone audio with AI-generated audio
 */
export async function streamAudioThroughTrack(
  audioBlob: Blob,
  onComplete?: () => void
): Promise<MediaStream> {
  const audioBuffer = await blobToAudioBuffer(audioBlob)
  const audioContext = new AudioContext()
  
  const destination = audioContext.createMediaStreamDestination()
  const source = audioContext.createBufferSource()
  source.buffer = audioBuffer
  source.connect(destination)
  
  source.onended = () => {
    audioContext.close()
    onComplete?.()
  }
  
  source.start(0)
  
  return destination.stream
}

/**
 * Create a MediaStream from audio element for playback and publishing
 */
export function createMediaStreamFromAudio(audioElement: HTMLAudioElement): MediaStream {
  const audioContext = new AudioContext()
  const source = audioContext.createMediaElementSource(audioElement)
  const destination = audioContext.createMediaStreamDestination()
  source.connect(destination)
  source.connect(audioContext.destination) // Also connect to speakers
  return destination.stream
}

/**
 * Mute/unmute local audio track
 */
export async function setLocalAudioEnabled(room: Room, enabled: boolean): Promise<void> {
  const localParticipant = room.localParticipant
  await localParticipant.setMicrophoneEnabled(enabled)
}

/**
 * Replace local audio track with a new MediaStream (for AI takeover)
 */
export async function replaceLocalAudioTrack(room: Room, newStream: MediaStream): Promise<LocalAudioTrack | null> {
  try {
    const localParticipant = room.localParticipant
    const existingTrack = localParticipant.getTrackPublication(Track.Source.Microphone)?.track as LocalAudioTrack
    
    const newTrack = newStream.getAudioTracks()[0]
    if (!newTrack) return null
    
    const localAudioTrack = new LocalAudioTrack(newTrack)
    
    if (existingTrack) {
      await localParticipant.unpublishTrack(existingTrack)
      existingTrack.stop()
    }
    
    await localParticipant.publishTrack(localAudioTrack)
    
    return localAudioTrack
  } catch (error) {
    console.error('Error replacing audio track:', error)
    return null
  }
}

