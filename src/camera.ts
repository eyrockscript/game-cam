/** `zoom` is in the Image Capture spec but not yet in TypeScript's DOM types. */
type ZoomCapabilities = MediaTrackCapabilities & { zoom?: { min: number; max: number } }

/** Widest field of view the camera allows, so players fit in small rooms. Best effort. */
async function zoomOut(stream: MediaStream): Promise<void> {
  const [track] = stream.getVideoTracks()
  const capabilities = track?.getCapabilities?.() as ZoomCapabilities | undefined
  if (!track || !capabilities?.zoom) return
  try {
    await track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min } as MediaTrackConstraintSet] })
  } catch (error: unknown) {
    console.warn('Camera zoom-out rejected; keeping the default zoom', error)
  }
}

export async function startCamera(video: HTMLVideoElement): Promise<void> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
  })
  await zoomOut(stream)
  video.srcObject = stream
  await video.play()
}
