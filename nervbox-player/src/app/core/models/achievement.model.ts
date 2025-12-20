export type AchievementCategory =
  | 'General'
  | 'SoundPlayback'
  | 'SoundCreation'
  | 'MiniGames'
  | 'Gambling'
  | 'Chat'
  | 'Social'
  | 'Wealth';

export interface Achievement {
  id: string;
  name: string;
  description: string;
  icon: string;
  category: AchievementCategory;
  tier: number;
  threshold: number;
  sortOrder: number;
  rewardCredits: number;
}

export interface UserAchievement {
  achievementId: string;
  earnedAt: string;
  progressValue: number;
}

export interface UserAchievementInfo extends Achievement {
  earned: boolean;
  earnedAt?: string;
}

export interface UserAchievementsResponse {
  userId: number;
  username: string;
  totalEarned: number;
  totalAvailable: number;
  achievements: UserAchievementInfo[];
}

export interface AchievementEarnedEvent {
  userId: number;
  achievement: {
    id: string;
    name: string;
    description: string;
    icon: string;
    category: string; // Backend sends as string
    rewardCredits: number;
  };
  timestamp: string;
}

export interface AchievementCategoryInfo {
  id: string;
  name: string;
}

export const CATEGORY_DISPLAY_NAMES: Record<AchievementCategory, string> = {
  General: 'Allgemein',
  SoundPlayback: 'Sound-Wiedergabe',
  SoundCreation: 'Sound-Erstellung',
  MiniGames: 'Minispiele',
  Gambling: 'Glücksspiel',
  Chat: 'Chat',
  Social: 'Sozial',
  Wealth: 'Vermögen',
};

export const CATEGORY_ICONS: Record<AchievementCategory, string> = {
  General: 'stars',
  SoundPlayback: 'play_circle',
  SoundCreation: 'add_circle',
  MiniGames: 'sports_esports',
  Gambling: 'casino',
  Chat: 'chat',
  Social: 'people',
  Wealth: 'account_balance',
};
