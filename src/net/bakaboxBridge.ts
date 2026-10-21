// BakaBox InAppWebView JSBridge helper
import { signal } from '@preact/signals';
import type { SimpleFriend } from '../ui/screens/Friends.tsx';

/** 标准 BakaBox 开放宿主接口声明 */
export interface BakaBoxHostAPI {
  isAvailable: boolean;
  gameId: string;
  gameTitle: string;
  getFriends: () => Promise<SimpleFriend[]>;
  getSelfProfile: () => Promise<{
    isLoggedIn: boolean;
    uid: string;
    businessUserId: string;
    username: string;
    avatar: string;
  }>;
  touchGame: (extra?: Record<string, any>) => Promise<boolean>;
}

declare global {
  interface Window {
    BakaBox?: BakaBoxHostAPI;
    flutter_inappwebview?: {
      callHandler: (handlerName: string, ...args: any[]) => Promise<any>;
    };
  }
}

/** 检查当前游戏是否运行于 BakaBox 宿主客户端内 */
export const isBakaBox = (): boolean =>
  typeof window !== 'undefined' && (!!window.BakaBox || !!window.flutter_inappwebview);

/** 宿主是否已连通的响应式状态 */
export const isHostConnected = signal(isBakaBox());

/** 等待 BakaBox 注入环境准备完毕 */
export async function waitForBakaBoxReady(timeoutMs = 2000): Promise<boolean> {
  if (isBakaBox()) {
    isHostConnected.value = true;
    return true;
  }
  if (typeof window === 'undefined') return false;

  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        const connected = isBakaBox();
        isHostConnected.value = connected;
        resolve(connected);
      }
    }, timeoutMs);

    const onReady = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        window.removeEventListener('bakabox:ready', onReady);
        window.removeEventListener('flutterInAppWebViewPlatformReady', onReady);
        isHostConnected.value = true;
        resolve(true);
      }
    };
    window.addEventListener('bakabox:ready', onReady);
    window.addEventListener('flutterInAppWebViewPlatformReady', onReady);
  });
}

/** 从 BakaBox 客户端拉取玩过此游戏的好友列表 */
export async function fetchFriendsFromHost(): Promise<SimpleFriend[] | null> {
  const ready = await waitForBakaBoxReady();
  if (!ready) return null;
  try {
    if (window.BakaBox?.getFriends) {
      const list = await window.BakaBox.getFriends();
      if (Array.isArray(list)) return list;
    }
    if (window.flutter_inappwebview?.callHandler) {
      const list = await window.flutter_inappwebview.callHandler('getGameFriends');
      if (Array.isArray(list)) return list as SimpleFriend[];
    }
  } catch (err) {
    console.warn('[BakaBoxBridge] getGameFriends failed:', err);
  }
  return null;
}


export interface SelfProfile {
  isLoggedIn?: boolean;
  uid?: string;
  businessUserId?: string;
  username?: string;
  avatar?: string;
}

/** 自身个人信息的响应式状态 */
export const selfProfile = signal<SelfProfile | null>(null);

function normalizeProfile(p: any): SelfProfile | null {
  if (!p || typeof p !== 'object') return null;
  const avatar = p.avatar || p.headImg || p.head_img || p.userAvatar || p.icon || p.photo || '';
  const username = p.username || p.nickname || p.name || '';
  const uid = String(p.uid || p.id || p.userId || '');
  if (!uid && !username && !avatar) return null;
  return {
    isLoggedIn: !!p.isLoggedIn,
    uid,
    businessUserId: p.businessUserId ? String(p.businessUserId) : undefined,
    username,
    avatar,
  };
}

/** 从 BakaBox 宿主拉取当前登录玩家信息 */
export async function fetchSelfProfileFromHost(): Promise<SelfProfile | null> {
  const ready = await waitForBakaBoxReady();
  if (!ready) return null;
  try {
    if (window.BakaBox?.getSelfProfile) {
      const p = await window.BakaBox.getSelfProfile();
      const norm = normalizeProfile(p);
      if (norm) {
        selfProfile.value = norm;
        return norm;
      }
    }
    if (window.flutter_inappwebview?.callHandler) {
      const p = await window.flutter_inappwebview.callHandler('getSelfProfile');
      const norm = normalizeProfile(p);
      if (norm) {
        selfProfile.value = norm;
        return norm;
      }
    }
  } catch (err) {
    console.warn('[BakaBoxBridge] getSelfProfile failed:', err);
  }
  return null;
}

if (typeof window !== 'undefined') {
  void waitForBakaBoxReady().then((ready) => {
    if (ready) void fetchSelfProfileFromHost();
  });
}

/** 向 BakaBox 宿主实时上报本游戏当前的游玩进度 */
export async function syncGameProgressToHost(extra: Record<string, any>): Promise<boolean> {
  const ready = await waitForBakaBoxReady(300);
  if (!ready) return false;

  try {
    if (window.BakaBox?.touchGame) {
      await window.BakaBox.touchGame(extra);
      return true;
    }
    if (window.flutter_inappwebview?.callHandler) {
      await window.flutter_inappwebview.callHandler('touchGame', extra);
      return true;
    }
  } catch (err) {
    console.warn('[BakaBoxBridge] touchGame failed:', err);
  }
  return false;
}
