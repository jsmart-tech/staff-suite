'use client';

import { useEffect, useRef, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { AlertCircle, CheckCheck, Loader2, Paperclip, RotateCcw } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { getRoleBadgeColor } from '@/lib/utils';
import { isImage, Message } from './types';

/**
 * Flicker-free image inside a chat bubble.
 *
 * When an optimistic message carries `_blobUrl` (the already-decoded local
 * preview) AND a CDN `attachment_url`, we display the blob immediately and
 * preload the CDN image in the background.  Once the CDN image fires onLoad
 * we swap the visible src and then—and only then—revoke the blob URL.
 * This means the user sees a smooth, instant preview with zero layout shift.
 */
function AttachImageWithBlobFallback({
  cdnUrl,
  blobUrl,
  alt,
}: {
  cdnUrl: string;
  blobUrl?: string | null;
  alt: string;
}) {
  const [displaySrc, setDisplaySrc] = useState<string>(blobUrl || cdnUrl);
  const blobRef = useRef(blobUrl);

  useEffect(() => {
    // If there is no blob fallback, nothing to do — CDN src is already set.
    if (!blobRef.current || displaySrc === cdnUrl) return;

    // Preload CDN in JS so we know exactly when it's ready.
    const img = new window.Image();
    img.onload = () => {
      setDisplaySrc(cdnUrl);
      if (blobRef.current) {
        URL.revokeObjectURL(blobRef.current);
        blobRef.current = null;
      }
    };
    img.onerror = () => {
      // CDN failed — keep the blob URL visible and don't revoke.
      setDisplaySrc(cdnUrl); // show broken-image indicator from CDN
    };
    img.src = cdnUrl;
    return () => { img.onload = null; img.onerror = null; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cdnUrl]);

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={displaySrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="max-h-64 max-w-[280px] object-contain sm:max-w-xs"
      onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }}
    />
  );
}

export function ChatBubble({
  message,
  own,
  onRetry,
}: {
  message: Message;
  own: boolean;
  onRetry?: (m: Message) => void;
}) {
  const hasText    = Boolean(message.content?.trim());
  const hasAttach  = Boolean(message.attachment_url);
  const showImage  = hasAttach && isImage(message.attachment_mime_type, message.attachment_name);
  const isPending  = message._status === 'sending';
  const isFailed   = message._status === 'failed';
  const isSent     = !isPending && !isFailed;
  const mime       = message.attachment_mime_type || '';
  // Verified video/audio plays inline (only once sent, so the URL is final).
  const showVideo  = hasAttach && isSent && mime.startsWith('video/');
  const showAudio  = hasAttach && isSent && mime.startsWith('audio/');

  return (
    <article className={`flex gap-3 ${own ? 'flex-row-reverse' : ''}`}>
      <Avatar
        src={message.profiles?.avatar_url}
        name={message.profiles?.full_name}
        size={32}
        className="mt-auto"
      />

      <div className={`flex max-w-[82%] flex-col sm:max-w-[72%] ${own ? 'items-end' : 'items-start'}`}>
        {/* Sender name + role + time */}
        <div className="mb-1 flex max-w-full items-center gap-2 text-xs">
          <span className="truncate font-semibold">
            {message.profiles?.full_name || 'Unknown'}
          </span>
          <span className={`badge shrink-0 px-1.5 py-0 text-[9px] ${getRoleBadgeColor(message.profiles?.role || 'employee')}`}>
            {message.profiles?.role}
          </span>
          {isSent && (
            <span className="hidden text-[var(--text-muted)] sm:inline">
              {formatDistanceToNow(new Date(message.created_at), { addSuffix: true })}
            </span>
          )}
        </div>

        {/* Text bubble */}
        {hasText && (
          <p className={`whitespace-pre-wrap break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
            own ? 'chat-bubble-own' : 'chat-bubble-other'
          } ${isPending ? 'opacity-60' : ''}`}>
            {message.content}
          </p>
        )}

        {/* Attachment */}
        {(showVideo || showAudio) && (
          <div className="mt-1 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--bg-hover)]">
            {showVideo
              ? <video src={message.attachment_url!} controls preload="metadata" className="max-h-72 max-w-[280px] sm:max-w-sm" aria-label={message.attachment_name || 'Video'} />
              : <audio src={message.attachment_url!} controls preload="metadata" className="w-64 max-w-full" aria-label={message.attachment_name || 'Audio'} />}
            <a href={message.attachment_url!} target="_blank" rel="noreferrer" className="flex items-center gap-2 px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:underline">
              <Paperclip size={12} /> {message.attachment_name || 'Download'}
            </a>
          </div>
        )}
        {hasAttach && !showVideo && !showAudio && (
          <a
            href={isFailed || isPending ? undefined : message.attachment_url!}
            target="_blank"
            rel="noreferrer"
            className={`mt-1 block overflow-hidden rounded-xl border border-[var(--border)] ${
              own ? 'bg-[rgba(255,255,255,0.12)]' : 'bg-[var(--bg-hover)]'
            } ${isPending ? 'opacity-60' : ''}`}
          >
            {showImage ? (
              <AttachImageWithBlobFallback
                cdnUrl={message.attachment_url!}
                blobUrl={message._blobUrl}
                alt={message.attachment_name || 'Attached image'}
              />
            ) : (
              <span className="flex items-center gap-2 px-3 py-2 text-sm">
                <Paperclip size={15} />
                {message.attachment_name || 'Open attachment'}
              </span>
            )}
          </a>
        )}

        {/* Message status row — only shown on own messages */}
        {own && (
          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
            {isPending && (
              <><Loader2 size={10} className="animate-spin" /><span>Sending…</span></>
            )}
            {isFailed && (
              <>
                <AlertCircle size={10} className="text-red-400" />
                <span className="text-red-400">Failed</span>
                {onRetry && (
                  <button
                    type="button"
                    onClick={() => onRetry(message)}
                    className="ml-1 flex items-center gap-0.5 text-[var(--accent-violet)] hover:underline"
                  >
                    <RotateCcw size={9} /> Retry
                  </button>
                )}
              </>
            )}
            {isSent && (
              <CheckCheck size={11} className="text-[var(--accent-violet)]" aria-label="Sent" />
            )}
          </div>
        )}
      </div>
    </article>
  );
}
