import { useState, useMemo, useEffect } from 'preact/hooks';
import { signal } from '@preact/signals';
import { url } from '../assets.ts';
import { friendsDrawerOpen, toggleFriendsDrawer, myCurrentProgress, profile } from '../store.ts';
import { sfx } from '../../audio/audio.ts';
import { isHostConnected, fetchFriendsFromHost, selfProfile, fetchSelfProfileFromHost, syncGameProgressToHost } from '../../net/bakaboxBridge.ts';

export type FriendStatus = 'online' | 'in_run' | 'classic' | 'offline';

export interface SimpleFriend {
  id: string;
  name: string;
  tag?: string;
  avatar: string;
  isCommander?: boolean;
  status: FriendStatus | string;
  statusLabel?: string;
  act?: number; // 1: 第一幕, 2: 第二幕, 3: 第三幕, 4+: 筛界无尽
  floor?: number; // 第几小关 / 层
  floorNote?: string; // 如：决战末影龙、精英战、商店营地
  omen?: number; // 不祥之兆等级
  detailText?: string;
  extra?: Record<string, any>;
}

const ROMAN = ['', 'I', 'II', 'III', 'IV', 'V'];
const ACT_NAMES = ['', '第一幕', '第二幕', '第三幕', '第四幕'];

// 动态好友列表信号
export const friendsList = signal<SimpleFriend[]>([]);

/** 解析与规范化好友的实时进度与状态（兼容宿主顶层属性与 extra 嵌套格式） */
export function resolveFriendProgress(f: SimpleFriend) {
  const extra = f.extra ?? {};

  // 1. 昵称与编号
  const name = f.name || extra.name || extra.username || extra.nickname || '冒险家';
  const tag = f.tag || extra.tag || (f.id ? `#${String(f.id).slice(-4)}` : '');
  const avatar =
    f.avatar ||
    (f as any).headImg ||
    (f as any).head_img ||
    (f as any).userAvatar ||
    (f as any).photo ||
    extra.avatar ||
    extra.headImg ||
    extra.head_img ||
    extra.userAvatar ||
    extra.commander ||
    'steve';
  const isCommander =
    f.isCommander ?? extra.isCommander ?? (['steve', 'alex', 'villager', 'witch'].includes(avatar));

  // 2. 关卡进度解析
  let rawAct = f.act ?? extra.act ?? extra.currentAct;
  let rawFloor = f.floor ?? extra.floor ?? extra.currentFloor ?? extra.level;
  const omen = Number(f.omen ?? extra.omen ?? extra.difficulty ?? 0) || 0;
  let floorNote = f.floorNote ?? extra.floorNote ?? extra.nodeName ?? extra.note ?? '';
  const detailText = f.detailText ?? extra.detailText ?? extra.progress ?? '';

  let act: number | undefined =
    typeof rawAct === 'number' ? rawAct : typeof rawAct === 'string' ? parseInt(rawAct, 10) : undefined;
  let floor: number | undefined =
    typeof rawFloor === 'number' ? rawFloor : typeof rawFloor === 'string' ? parseInt(rawFloor, 10) : undefined;

  // 自动从累计层数推导幕数与当前幕层数
  if (floor !== undefined && floor > 0) {
    if (act === undefined) {
      if (floor <= 14) act = 1;
      else if (floor <= 28) act = 2;
      else if (floor <= 42) act = 3;
      else act = 4;
    }
    // 归一化为当前幕内的层数 (1..14)
    if (act <= 3 && floor > 14) {
      floor = ((floor - 1) % 14) + 1;
    } else if (act >= 4 && floor > 42) {
      floor = floor - 42;
    }
  }

  // 3. 状态归一化
  const rawStatus = String(f.status || extra.status || '').toLowerCase();
  let status: FriendStatus = 'offline';
  if (['in_run', 'playing', 'run', 'gaming', 'spire', 'battle', 'game'].includes(rawStatus)) {
    status = 'in_run';
  } else if (['classic', 'arena', 'pvp', 'match'].includes(rawStatus)) {
    status = 'classic';
  } else if (['online', 'lobby', 'idle', 'ready'].includes(rawStatus)) {
    status = 'online';
  } else if (rawStatus === 'offline') {
    status = 'offline';
  } else if (act && floor && rawStatus !== 'offline') {
    status = 'in_run';
  }

  // 4. 首领关自动补充关卡特征说明
  if (act && floor === 14 && !floorNote) {
    floorNote = act === 1 ? '首领战' : act === 2 ? '决战凋灵' : act === 3 ? '决战末影龙' : '凋灵风暴';
  }

  // 5. 状态标签
  let statusLabel = f.statusLabel || extra.statusLabel;
  if (!statusLabel) {
    if (status === 'in_run') statusLabel = act && act >= 4 ? '筛界中' : '爬塔中';
    else if (status === 'classic') statusLabel = '竞技场';
    else if (status === 'online') statusLabel = '在线';
    else statusLabel = '离线';
  }

  const hasRunProgress = !!(act && floor && floor > 0);
  const actName = act ? (act >= 4 ? '筛界' : ACT_NAMES[act] ?? `第${act}幕`) : '';

  return {
    name,
    tag,
    avatar,
    isCommander,
    status,
    statusLabel,
    hasRunProgress,
    act,
    actName,
    floor,
    floorNote,
    omen,
    detailText,
  };
}

export function FriendsDrawer() {
  // 游客模式（未连通 BakaBox 宿主）：直接隐藏好友功能与把手
  if (!isHostConnected.value) {
    return null;
  }
  const open = friendsDrawerOpen.value;
  const [filter, setFilter] = useState<'all' | 'online'>('all');
  const [search, setSearch] = useState('');

  // 展开抽屉时，每 5 秒自动轮询拉取玩过此游戏的好友列表
  useEffect(() => {
    if (open) {
      void fetchSelfProfileFromHost();
      const load = () => {
        fetchFriendsFromHost().then((list) => {
          if (list && list.length > 0) {
            friendsList.value = list;
          }
        });
      };
      load();
      const timer = setInterval(load, 5000);
      return () => clearInterval(timer);
    }
  }, [open]);

  useEffect(() => {
    void fetchSelfProfileFromHost();
    fetchFriendsFromHost().then((list) => {
      if (list && list.length > 0) {
        friendsList.value = list;
      }
    });

    // 静默心跳保活：游戏打开期间每 45 秒向宿主上报一次当前状态，保持活跃打卡时间戳新鲜
    const heartbeat = setInterval(() => {
      if (myCurrentProgress.value) {
        void syncGameProgressToHost(myCurrentProgress.value);
      }
    }, 45000);
    return () => clearInterval(heartbeat);
  }, []);

  // 过滤判定：排除当前玩家自身（精确比对 ID，杜绝误杀默认同名玩家）
  const isSelfFriend = (f: SimpleFriend) => {
    const me = selfProfile.value;
    if ((f as any).isSelf === true || f.extra?.isSelf === true) return true;
    if (me?.uid && (String(f.id) === String(me.uid) || String(f.extra?.uid) === String(me.uid))) return true;
    if (me?.businessUserId && (String(f.id) === String(me.businessUserId) || String(f.extra?.businessUserId) === String(me.businessUserId))) return true;
    // 只有当自己已登录且有非通用默认昵称时，才比对 username；绝不能把通用昵称“冒险家/史蒂夫”同名玩家误当成自己吃掉
    if (me?.isLoggedIn && me?.username && me.username !== '冒险家' && me.username !== '史蒂夫') {
      const fName = String(f.name || f.extra?.username || '');
      if (fName === String(me.username)) return true;
    }
    return false;
  };

  const rawFriends = friendsList.value;

  // 严格过滤掉自己（自己单独置顶展示，好友列表仅展示他人）
  const sourceFriends = useMemo(() => {
    return rawFriends.filter((f) => !isSelfFriend(f));
  }, [rawFriends, selfProfile.value]);

  const myProgress = myCurrentProgress.value;
  const me = selfProfile.value;
  const myAvatar = me?.avatar || (myProgress.commander ? url.cmd(myProgress.commander) : url.cmd('steve'));
  const myName = me?.username || profile.value.nickname || '史蒂夫';
  const myTag =
    me?.username && me.username.includes('#')
      ? `#${me.username.split('#')[1]}`
      : me?.uid
      ? `#${String(me.uid).slice(-4)}`
      : '#我';
  const myAct = myProgress.act;
  const myActName = myAct ? (myAct >= 4 ? '筛界' : ACT_NAMES[myAct] ?? `第${myAct}幕`) : '';
  const myHasRunProgress = !!(myProgress.status === 'in_run' && myProgress.floor && myProgress.floor > 0);

  const onlineCount = useMemo(
    () => sourceFriends.filter((f) => {
      const p = resolveFriendProgress(f);
      return p.status !== 'offline';
    }).length,
    [sourceFriends],
  );

  const displayedFriends = useMemo(() => {
    return sourceFriends.filter((f) => {
      const p = resolveFriendProgress(f);
      if (filter === 'online' && p.status === 'offline') return false;
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        return (
          p.name.toLowerCase().includes(q) || p.tag.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sourceFriends, filter, search]);

  const COMMANDER_SET = new Set(['steve', 'alex', 'villager', 'witch']);

  const getAvatarUrl = (avatar: string, isCommander: boolean = false) => {
    if (!avatar) return url.cmd('steve');
    if (avatar.startsWith('//')) {
      return 'https:' + avatar;
    }
    if (
      avatar.startsWith('http://') ||
      avatar.startsWith('https://') ||
      avatar.startsWith('data:') ||
      avatar.startsWith('blob:') ||
      avatar.startsWith('/') ||
      avatar.startsWith('./') ||
      avatar.includes('assets/')
    ) {
      return avatar;
    }
    if (isCommander || COMMANDER_SET.has(avatar)) {
      return url.cmd(avatar);
    }
    return url.mob(avatar);
  };

  const handleToggle = () => {
    sfx('page');
    toggleFriendsDrawer();
  };

  const handleClose = () => {
    sfx('page');
    toggleFriendsDrawer(false);
  };

  return (
    <>
      {/* Click-away backdrop when drawer is open */}
      <div
        class={`friends-drawer-backdrop ${open ? 'active' : ''}`}
        onClick={handleClose}
      />

      {/* Drawer Wrapper with slide-out animation */}
      <div class={`friends-drawer-wrap ${open ? 'open' : 'closed'}`}>
        {/* The Handle on the left edge of drawer that brings it out */}
        <button
          class="friends-drawer-handle"
          onClick={handleToggle}
          title={open ? '收起好友列表' : '展开好友列表'}
          onMouseEnter={() => sfx('hover', { vol: 0.25 })}
        >
          <span class="handle-arrow">{open ? '▶' : '◀'}</span>
          <div class="handle-text">
            <span>好</span>
            <span>友</span>
          </div>
          <span class="handle-count" title={`${onlineCount} 人在线`}>
            {onlineCount}
          </span>
        </button>

        {/* Drawer Body Panel */}
        <div class="panel friends-drawer-body">
          {/* Header */}
          <div class="row between friends-drawer-header">
            <div class="row gap8" style={{ alignItems: 'baseline' }}>
              <div class="panel-title" style={{ fontSize: 20, marginBottom: 0 }}>
                好友
              </div>
              <span class="drawer-header-count">
                <b class="gold-t">{onlineCount}</b>
                <span class="faint">/{sourceFriends.length}</span>
              </span>
            </div>
            <button class="drawer-close-btn" onClick={handleClose} title="收起">
              ✕
            </button>
          </div>

          {/* 置顶「我的状态」实时卡片 */}
          <div class="my-status-card">
            <div class="friend-avatar-wrap">
              <img
                src={getAvatarUrl(myAvatar, true)}
                class="friend-avatar"
                alt={myName}
                onError={(e) => {
                  const el = e.currentTarget as HTMLImageElement;
                  el.onerror = null;
                  el.src = url.cmd('steve');
                }}
              />
              <span class={`status-dot ${myProgress.status || 'online'}`} />
            </div>

            <div class="friend-drawer-info">
              {/* 第一行：昵称 + 金色「我」角标 + #ID + 状态徽章 */}
              <div class="friend-drawer-top">
                <span class="friend-drawer-name">{myName}</span>
                <span class="my-tag-pill">我</span>
                {myTag && <span class="faint friend-drawer-tag">{myTag}</span>}
                <span class={`friend-status-badge ${myProgress.status || 'online'}`}>
                  {myProgress.statusLabel || '在线'}
                </span>
              </div>

              {/* 第二行：高亮当前真实游玩进度 */}
              <div class="friend-drawer-bottom">
                {myHasRunProgress ? (
                  <>
                    <span class="progress-act">{myActName}</span>
                    <span class="faint">·</span>
                    <span class="progress-floor">第 {myProgress.floor} 层</span>
                    {myProgress.floorNote && (
                      <span class="progress-note faint">({myProgress.floorNote})</span>
                    )}
                    {myProgress.omen ? (
                      <span class="progress-omen">不祥 {ROMAN[myProgress.omen] || myProgress.omen}</span>
                    ) : null}
                  </>
                ) : (
                  <span class="faint">
                    {myProgress.detailText ||
                      (myProgress.status === 'classic'
                        ? '竞技场 · 双人同屏对决'
                        : '主界面 · 准备就绪')}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Filter & Search Toolbar */}
          <div class="friends-drawer-toolbar">
            <div class="row gap6">
              <button
                class={`filter-pill ${filter === 'all' ? 'active' : ''}`}
                onClick={() => setFilter('all')}
              >
                全部 ({sourceFriends.length})
              </button>
              <button
                class={`filter-pill ${filter === 'online' ? 'active' : ''}`}
                onClick={() => setFilter('online')}
              >
                在线 ({onlineCount})
              </button>
            </div>
            <input
              type="text"
              class="mc-input friends-drawer-search"
              placeholder="搜索昵称或 #ID..."
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
            />
          </div>

          {/* 好友列表分割栏 */}
          <div class="friends-list-divider">
            <span>好友列表</span>
            <span class="faint">{onlineCount} 在线 / {sourceFriends.length}</span>
          </div>

          {/* Scrollable Friend Items */}
          <div class="friends-drawer-list">
            {displayedFriends.length === 0 ? (
              <div class="friends-empty faint">
                {sourceFriends.length === 0
                  ? '暂无同样进入玩过该游戏的好友'
                  : '未找到匹配的好友'}
              </div>
            ) : (
              displayedFriends.map((f) => {
                const p = resolveFriendProgress(f);
                return (
                  <div
                    key={f.id}
                    class={`friend-drawer-row ${p.status === 'offline' ? 'offline' : ''}`}
                  >
                    {/* Avatar & status indicator dot */}
                    <div class="friend-avatar-wrap">
                      <img
                        src={getAvatarUrl(p.avatar, p.isCommander)}
                        class="friend-avatar"
                        alt={p.name}
                        onError={(e) => {
                          const el = e.currentTarget as HTMLImageElement;
                          el.onerror = null;
                          el.src = url.cmd('steve');
                        }}
                      />
                      <span class={`status-dot ${p.status}`} />
                    </div>

                    {/* Two-line Info Column */}
                    <div class="friend-drawer-info">
                      {/* Line 1: Nickname, Tag, Status Pill */}
                      <div class="friend-drawer-top">
                        <span class="friend-drawer-name">{p.name}</span>
                        {p.tag && <span class="faint friend-drawer-tag">{p.tag}</span>}
                        <span class={`friend-status-badge ${p.status}`}>
                          {p.statusLabel}
                        </span>
                      </div>

                      {/* Line 2: Act & Floor / Progress / Detailed status */}
                      <div class="friend-drawer-bottom">
                        {p.status === 'in_run' && p.hasRunProgress ? (
                          <>
                            <span class="progress-act">{p.actName}</span>
                            <span class="faint">·</span>
                            <span class="progress-floor">第 {p.floor} 层</span>
                            {p.floorNote && (
                              <span class="progress-note faint">({p.floorNote})</span>
                            )}
                            {p.omen ? (
                              <span class="progress-omen">不祥 {ROMAN[p.omen] || p.omen}</span>
                            ) : null}
                          </>
                        ) : p.status === 'offline' && p.hasRunProgress ? (
                          <>
                            <span class="faint">离线 · 停在</span>
                            <span class="progress-act">{p.actName}</span>
                            <span class="faint">·</span>
                            <span class="progress-floor">第 {p.floor} 层</span>
                            {p.floorNote && (
                              <span class="progress-note faint">({p.floorNote})</span>
                            )}
                          </>
                        ) : (
                          <span class="faint">
                            {p.detailText ||
                              (p.status === 'classic'
                                ? '竞技场 · 双人同屏对决'
                                : p.status === 'online'
                                ? '大厅 · 准备就绪'
                                : '离线')}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// Backward compatibility
export const Friends = FriendsDrawer;
