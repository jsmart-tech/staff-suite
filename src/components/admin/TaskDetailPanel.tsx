'use client';

/**
 * TaskDetailPanel
 * Slide-in modal that shows task description + comment thread.
 * Extracted from admin/tasks/page.tsx to keep that file readable.
 */

import { motion } from 'framer-motion';
import { X, MessageSquare, Loader2 } from 'lucide-react';
import { FocusTrap } from '@/components/ui/FocusTrap';

type Comment = {
  id: string;
  body: string;
  created_at: string;
  profiles?: { full_name: string | null };
};

interface TaskDetailPanelProps {
  task: {
    id: string;
    title: string;
    description?: string | null;
  };
  comments: Comment[];
  comment: string;
  commentSaving: boolean;
  onCommentChange: (value: string) => void;
  onAddComment: () => void;
  onClose: () => void;
}

export function TaskDetailPanel({
  task,
  comments,
  comment,
  commentSaving,
  onCommentChange,
  onAddComment,
  onClose,
}: TaskDetailPanelProps) {
  return (
    <motion.div
      role="dialog"
      aria-modal="true"
      aria-labelledby="task-detail-title"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 16 }}
        className="w-full max-w-2xl"
      >
        <FocusTrap onEscape={onClose} className="max-h-[90vh] overflow-y-auto rounded-2xl border border-[var(--border-bright)] bg-[var(--bg-card)] p-6">

          {/* Header */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-widest text-[var(--text-muted)]">
                Task details
              </p>
              <h2 id="task-detail-title" className="mt-1 text-xl font-bold">
                {task.title}
              </h2>
            </div>
            <button
              type="button"
              aria-label="Close task detail"
              onClick={onClose}
              className="flex h-8 w-8 items-center justify-center rounded-lg transition-colors hover:opacity-70"
              style={{ background: 'var(--bg-hover)' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Description */}
          <p className="mt-4 whitespace-pre-wrap text-sm text-[var(--text-secondary)]">
            {task.description || 'No description provided.'}
          </p>

          {/* Comments */}
          <div className="mt-6 border-t border-[var(--border)] pt-5">
            <h3 className="flex items-center gap-2 font-semibold">
              <MessageSquare size={16} />
              Comments
            </h3>

            <div className="mt-3 space-y-3">
              {comments.length > 0 ? (
                comments.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-xl bg-[var(--bg-hover)] p-3"
                  >
                    <p className="text-xs font-semibold">
                      {item.profiles?.full_name || 'Admin'}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{item.body}</p>
                    <p className="mt-1 text-[11px] text-[var(--text-muted)]">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-[var(--text-muted)]">No comments yet.</p>
              )}
            </div>

            {/* Add comment */}
            <div className="mt-4 flex gap-2">
              <textarea
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    onAddComment();
                  }
                }}
                placeholder="Write a comment… (Ctrl+Enter to send)"
                aria-label="Add a comment"
                className="input-field min-h-[80px] flex-1 resize-y"
              />
              <button
                type="button"
                onClick={onAddComment}
                disabled={commentSaving || !comment.trim()}
                aria-label="Submit comment"
                className="btn-primary self-end"
              >
                {commentSaving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  'Comment'
                )}
              </button>
            </div>
          </div>

        </FocusTrap>
      </motion.div>
    </motion.div>
  );
}
