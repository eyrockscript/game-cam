import { MathBackendWebGL } from '@tensorflow/tfjs-backend-webgl'
import '@tensorflow/tfjs-backend-cpu'
import * as tf from '@tensorflow/tfjs-core'
import * as poseDetection from '@tensorflow-models/pose-detection'
import type { Landmark } from './bodyColliders'

/**
 * Multi-person pose detection with MoveNet MultiPose Lightning (up to 6 people).
 * MediaPipe Pose was tried first but only detects 1-3 people reliably: with 5
 * people across a 16:9 frame each body is too small for its detector.
 */

const MAX_POSES = 5
const MIN_POSE_SCORE = 0.2
const INPUT_MAX_DIMENSION = 512

export type Backend = 'webgl' | 'cpu'

export interface PoseTracker {
  /**
   * Landmarks (COCO-17 layout, normalized 0..1) of every detected person.
   * Async: callers should not start a new detection until this resolves.
   */
  detect(video: HTMLVideoElement): Promise<readonly (readonly Landmark[])[]>
  /** Backend currently in use, or 'recovering' while the detector is being rebuilt. */
  status(): Backend | 'recovering'
}

async function useBackend(): Promise<Backend> {
  try {
    if (await tf.setBackend('webgl')) {
      await tf.ready()
      return 'webgl'
    }
  } catch (error: unknown) {
    console.warn('WebGL backend unavailable, falling back to CPU', error)
  }
  await tf.setBackend('cpu')
  await tf.ready()
  return 'cpu'
}

function createDetector(): Promise<poseDetection.PoseDetector> {
  return poseDetection.createDetector(poseDetection.SupportedModels.MoveNet, {
    modelType: poseDetection.movenet.modelType.MULTIPOSE_LIGHTNING,
    enableTracking: false, // players.ts does its own tracking with stable colors
    maxPoses: MAX_POSES,
    // Default 256 leaves each of 5 people ~50px wide and wrists land on the torso.
    // 512 places extended arms correctly (measured) at a modest speed cost.
    multiPoseMaxDimension: INPUT_MAX_DIMENSION,
    // Self-hosted so the app works fully offline (precached by the service worker).
    modelUrl: `${import.meta.env.BASE_URL}models/movenet-multipose-lightning/model.json`,
  } as poseDetection.MoveNetModelConfig)
}

/** Calls `onLost` if the WebGL context backing TensorFlow.js is lost (e.g. GPU switch on TV connect). */
function watchContextLoss(onLost: () => void): void {
  const backend = tf.backend()
  if (!(backend instanceof MathBackendWebGL)) return
  backend.gpgpu.gl.canvas.addEventListener('webglcontextlost', () => {
    console.warn('Pose detector lost its WebGL context; rebuilding')
    onLost()
  })
}

function normalize(pose: poseDetection.Pose, width: number, height: number): Landmark[] {
  return pose.keypoints.map((k) => ({ x: k.x / width, y: k.y / height, visibility: k.score ?? 0 }))
}

export async function createPoseTracker(): Promise<PoseTracker> {
  let backend = await useBackend()
  let detector = await createDetector()
  let lost = false
  watchContextLoss(() => (lost = true))

  // A lost context can't be reused: drop the backend so TF.js creates a fresh one.
  const rebuild = async (): Promise<void> => {
    detector.dispose()
    tf.removeBackend('webgl')
    tf.registerBackend('webgl', () => new MathBackendWebGL(), 2)
    backend = await useBackend()
    detector = await createDetector()
    watchContextLoss(() => (lost = true))
    lost = false
  }

  return {
    async detect(video) {
      if (lost) {
        await rebuild()
        return []
      }
      // No frame yet (camera warming up): nothing to detect, and not an error.
      if (video.videoWidth === 0 || video.videoHeight === 0) return []
      try {
        const poses = await detector.estimatePoses(video, { flipHorizontal: false })
        return poses
          .filter((p) => (p.score ?? 0) >= MIN_POSE_SCORE)
          .map((p) => normalize(p, video.videoWidth, video.videoHeight))
      } catch (error: unknown) {
        console.error('Pose detection failed; rebuilding detector', error)
        lost = true
        return []
      }
    },
    status() {
      return lost ? 'recovering' : backend
    },
  }
}
