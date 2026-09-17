/**
 * Media processing utility for Water Mitigation Documentation
 * Supports photo optimization and video keyframe extraction for Gemini Multimodal Analysis
 */

export interface ProcessedMediaResult {
  id: string;
  name: string;
  type: 'image' | 'video';
  url: string;
  thumbnailUrl: string;
  base64?: string; // Main image base64 or primary video frame
  extractedFrames?: string[]; // Multiple video keyframes for deep AI analysis
  videoDuration?: number;
  width?: number;
  height?: number;
  size: number;
}

/**
 * Converts a file to base64
 */
export const fileToBase64 = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = (error) => reject(error);
    reader.readAsDataURL(file);
  });
};

/**
 * Resizes an image base64 if it exceeds maxDimension to avoid excessive token/network overhead
 */
export const compressImageBase64 = (base64: string, maxDimension = 1600): Promise<string> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let width = img.width;
      let height = img.height;

      if (width > maxDimension || height > maxDimension) {
        if (width > height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(base64);
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => resolve(base64);
    img.src = base64;
  });
};

/**
 * Extracts multiple keyframes from a video file for AI visual inspection
 */
export const extractVideoKeyframes = async (
  videoFile: File,
  frameCount = 4,
  maxDimension = 1280
): Promise<{ frames: string[]; duration: number; thumbnail: string; width: number; height: number }> => {
  return new Promise((resolve) => {
    const videoUrl = URL.createObjectURL(videoFile);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;

    const frames: string[] = [];
    let duration = 0;
    let width = 640;
    let height = 360;

    video.onloadedmetadata = async () => {
      duration = video.duration || 5;
      width = video.videoWidth || 640;
      height = video.videoHeight || 360;

      // Calculate timestamps to sample across the video
      const timestamps: number[] = [];
      if (duration <= 2) {
        timestamps.push(0.5, Math.min(1.5, duration * 0.9));
      } else {
        const interval = duration / (frameCount + 1);
        for (let i = 1; i <= frameCount; i++) {
          timestamps.push(Math.min(duration - 0.2, Math.max(0.2, interval * i)));
        }
      }

      const canvas = document.createElement('canvas');
      let targetW = width;
      let targetH = height;

      if (targetW > maxDimension || targetH > maxDimension) {
        if (targetW > targetH) {
          targetH = Math.round((targetH * maxDimension) / targetW);
          targetW = maxDimension;
        } else {
          targetW = Math.round((targetW * maxDimension) / targetH);
          targetH = maxDimension;
        }
      }

      canvas.width = targetW;
      canvas.height = targetH;
      const ctx = canvas.getContext('2d');

      for (const time of timestamps) {
        await new Promise<void>((res) => {
          const seekHandler = () => {
            video.removeEventListener('seeked', seekHandler);
            if (ctx) {
              ctx.drawImage(video, 0, 0, targetW, targetH);
              const frameBase64 = canvas.toDataURL('image/jpeg', 0.85);
              frames.push(frameBase64);
            }
            res();
          };
          video.addEventListener('seeked', seekHandler);
          video.currentTime = time;
        });
      }

      URL.revokeObjectURL(videoUrl);
      const thumbnail = frames[0] || '';
      resolve({ frames, duration, thumbnail, width: targetW, height: targetH });
    };

    video.onerror = () => {
      URL.revokeObjectURL(videoUrl);
      resolve({ frames: [], duration: 0, thumbnail: '', width: 640, height: 360 });
    };
  });
};

/**
 * Process a technician uploaded file (either Image or Video)
 */
export const processTechnicianMedia = async (file: File): Promise<ProcessedMediaResult> => {
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|avi|mkv)$/i.test(file.name);
  const id = `media-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
  const url = URL.createObjectURL(file);

  if (isVideo) {
    const { frames, duration, thumbnail, width, height } = await extractVideoKeyframes(file, 4);
    return {
      id,
      name: file.name,
      type: 'video',
      url,
      thumbnailUrl: thumbnail || url,
      base64: thumbnail || undefined,
      extractedFrames: frames,
      videoDuration: duration,
      width,
      height,
      size: file.size,
    };
  } else {
    const rawBase64 = await fileToBase64(file);
    const optimizedBase64 = await compressImageBase64(rawBase64, 1600);
    return {
      id,
      name: file.name,
      type: 'image',
      url,
      thumbnailUrl: optimizedBase64,
      base64: optimizedBase64,
      size: file.size,
    };
  }
};
