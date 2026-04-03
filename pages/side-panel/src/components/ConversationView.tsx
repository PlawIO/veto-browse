import { memo, useMemo } from 'react';
import type { Message } from '@extension/storage';
import { buildTurnsFromMessages } from '../transforms/buildTurns';
import UserTurnBlock from './UserTurnBlock';
import VetoTurnBlock from './VetoTurnBlock';
import SystemNote from './SystemNote';

interface ConversationViewProps {
  messages: Message[];
}

export default memo(function ConversationView({ messages }: ConversationViewProps) {
  const turns = useMemo(() => buildTurnsFromMessages(messages), [messages]);

  return (
    <div className="max-w-full">
      {turns.map(turn => {
        switch (turn.role) {
          case 'user':
            return <UserTurnBlock key={turn.id} turn={turn} />;
          case 'veto':
            return <VetoTurnBlock key={turn.id} turn={turn} />;
          case 'system':
            return <SystemNote key={turn.id} turn={turn} />;
        }
      })}
    </div>
  );
});
