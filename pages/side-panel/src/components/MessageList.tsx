import type { Message } from '@extension/storage';
import { ACTOR_PROFILES } from '../types/message';
import { memo } from 'react';
import { formatTimestamp } from '../utils';

interface MessageListProps {
  messages: Message[];
}

export default memo(function MessageList({ messages }: MessageListProps) {
  return (
    <div className="max-w-full space-y-4">
      {messages.map((message, index) => (
        <MessageBlock
          key={`${message.actor}-${message.timestamp}-${index}`}
          message={message}
          isSameActor={index > 0 ? messages[index - 1].actor === message.actor : false}
        />
      ))}
    </div>
  );
});

interface MessageBlockProps {
  message: Message;
  isSameActor: boolean;
}

function MessageBlock({ message, isSameActor }: MessageBlockProps) {
  if (!message.actor) {
    console.error('No actor found');
    return <div />;
  }
  const actor = ACTOR_PROFILES[message.actor as keyof typeof ACTOR_PROFILES];
  const isProgress = message.content === 'Showing progress...';
  const isUser = message.actor === 'user';

  return (
    <div
      className={`flex max-w-full gap-3 ${
        !isSameActor ? 'mt-4 border-t border-[var(--border-subtle)] pt-4 first:mt-0 first:border-t-0 first:pt-0' : ''
      }`}>
      {!isSameActor && (
        <div
          className="flex size-7 shrink-0 items-center justify-center"
          style={{ backgroundColor: actor.iconBackground }}>
          <img src={actor.icon} alt={actor.name} className="size-6" />
        </div>
      )}
      {isSameActor && <div className="w-7" />}

      <div className="min-w-0 flex-1">
        {!isSameActor && (
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
            {actor.name}
          </div>
        )}

        <div className="group space-y-0.5">
          <div
            className={`whitespace-pre-wrap break-words text-sm ${isUser ? 'px-3 py-2' : ''}`}
            style={{
              color: isUser ? 'var(--text-secondary)' : 'var(--text-primary)',
              ...(isUser ? { backgroundColor: 'var(--bg-user)' } : {}),
            }}>
            {isProgress ? (
              <div className="h-0.5 overflow-hidden" style={{ backgroundColor: 'var(--bg-elevated)' }}>
                <div className="h-full animate-progress rounded-full" style={{ backgroundColor: 'var(--accent)' }} />
              </div>
            ) : (
              message.content
            )}
          </div>
          {!isProgress && (
            <div
              className="text-right text-xs opacity-0 transition-opacity group-hover:opacity-100"
              style={{ color: 'var(--text-muted)' }}>
              {formatTimestamp(message.timestamp)}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
