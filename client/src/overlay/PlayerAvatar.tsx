import React from 'react';

interface PlayerAvatarProps {
  playerKey: string;
  name: string;
  photoUrl: string;
  jerseyUrl: string;
  compact?: boolean;
  isOut?: boolean;
  className?: string;
}

export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  playerKey,
  name,
  photoUrl,
  jerseyUrl,
  compact = false,
  isOut = false,
  className = '',
}) => {
  return (
    <div
      key={playerKey}
      className={[
        'ov-avatar',
        compact ? 'ov-avatar--compact' : '',
        isOut ? 'ov-avatar--out' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <img
        src={jerseyUrl}
        alt=""
        width={compact ? 160 : 215}
        height={compact ? 110 : 140}
        className="ov-avatar-jersey"
        decoding="async"
      />
      <img
        src={photoUrl}
        alt={name}
        width={compact ? 160 : 215}
        height={compact ? 132 : 215}
        className="ov-avatar-face"
        decoding="async"
      />
    </div>
  );
};
