import { useState, useRef, useEffect } from "react";
import { getEmojiForNumber } from "@/lib/animals";

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
}

export default function AnimalMedia({
  mediaUrl,
  name,
  number,
  className = "w-full h-full object-contain",
  emojiClassName = "text-2xl",
}: AnimalMediaProps) {
  const [hasError, setHasError] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const isVideo = isVideoMedia(mediaUrl);

  // Reset error when URL changes
  useEffect(() => {
    setHasError(false);
  }, [mediaUrl]);

  // Ensure video autoplays safely when mounted
  useEffect(() => {
    if (isVideo && videoRef.current && !hasError) {
      videoRef.current.defaultMuted = true;
      videoRef.current.muted = true;
      videoRef.current.play().catch(() => {
        // Autoplay policy fallback: muted video usually autoplays without issues
      });
    }
  }, [isVideo, mediaUrl, hasError]);

  if (!mediaUrl || hasError) {
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
        src={mediaUrl}
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
        onError={() => setHasError(true)}
        className={className}
        title={`Video animado de ${name}`}
      />
    );
  }

  return <img src={mediaUrl} alt={name} onError={() => setHasError(true)} className={className} />;
}
