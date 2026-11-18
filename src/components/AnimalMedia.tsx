import { useState, useRef, useEffect, memo } from "react";
import { getEmojiForNumber } from "@/lib/animals";
import { cleanImageUrl, preloadImageOnce, isRealAnimalMediaUrl } from "@/lib/official-animals";

export function isVideoMedia(url?: string | null): boolean {
  if (!url) return false;
  const clean = url.trim().toLowerCase();
  if (clean.startsWith("data:video/")) return true;
  return (
    clean.includes(".mp4") ||
    clean.includes(".webm") ||
    clean.includes(".ogg") ||
    clean.includes(".ogv") ||
    clean.includes(".mov") ||
    clean.includes(".m4v")
  );
}

interface AnimalMediaProps {
  mediaUrl?: string | null;
  name: string;
  number: number;
  className?: string;
  emojiClassName?: string;
  loading?: "lazy" | "eager";
  decoding?: "async" | "sync" | "auto";
  fetchPriority?: "high" | "low" | "auto";
}

const AnimalMedia = memo(function AnimalMedia({
  mediaUrl,
  name,
  number,
  className = "w-full h-full object-contain",
  emojiClassName = "text-2xl",
  loading = "eager",
  decoding = "async",
  fetchPriority = "auto",
}: AnimalMediaProps) {
  const sanitizedUrl = cleanImageUrl(mediaUrl);

  // Retain the last known valid image URL so the <img> src never blanks out or downgrades to a placeholder between renders
  const lastValidUrlRef = useRef<string>(sanitizedUrl);
  const lastNumberRef = useRef<number>(number);

  if (lastNumberRef.current !== number) {
    lastNumberRef.current = number;
    lastValidUrlRef.current = sanitizedUrl;
  } else if (sanitizedUrl && sanitizedUrl !== lastValidUrlRef.current) {
    const prevIsReal = isRealAnimalMediaUrl(lastValidUrlRef.current);
    const nextIsReal = isRealAnimalMediaUrl(sanitizedUrl);
    if (nextIsReal || !prevIsReal) {
      lastValidUrlRef.current = sanitizedUrl;
    }
  }
  const activeUrl = isRealAnimalMediaUrl(sanitizedUrl)
    ? sanitizedUrl
    : lastValidUrlRef.current || sanitizedUrl;
  const isVideo = isVideoMedia(activeUrl);

  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const hasError = Boolean(activeUrl && failedUrl === activeUrl);
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (activeUrl && !isVideo) {
      preloadImageOnce(activeUrl);
    }
  }, [activeUrl, isVideo]);

  // Ensure video autoplays safely when mounted
  useEffect(() => {
    if (isVideo && videoRef.current && !hasError) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback: muted video usually autoplays without issues
      });
    }
  }, [isVideo, activeUrl, hasError]);

  if (!activeUrl || hasError) {
    return (
      <span className={emojiClassName} role="img" aria-label={name}>
        {getEmojiForNumber(number, name)}
      </span>
    );
  }

  if (isVideo) {
    return (
      <video
        ref={videoRef}
        src={activeUrl}
        autoPlay
        loop
        muted
        playsInline
        preload="auto"
        onLoadedData={() => {
          if (videoRef.current) {
            videoRef.current.defaultMuted = true;
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
        }}
        onCanPlay={() => {
          if (videoRef.current) {
            videoRef.current.defaultMuted = true;
            videoRef.current.muted = true;
            videoRef.current.play().catch(() => {});
          }
        }}
        onError={() => setFailedUrl(activeUrl)}
        className={className}
        title={`Video animado de ${name}`}
      />
    );
  }

  return (
    <img
      src={activeUrl}
      alt=""
      aria-label={name}
      loading={loading}
      decoding={decoding}
      draggable={false}
      fetchPriority={fetchPriority !== "auto" ? fetchPriority : undefined}
      onError={() => setFailedUrl(activeUrl)}
      className={className}
    />
  );
});

export default AnimalMedia;
