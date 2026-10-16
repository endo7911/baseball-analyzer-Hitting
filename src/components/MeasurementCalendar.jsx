import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar as CalendarIcon, Clock, Plus, Trash2, Tag, Users,
  ChevronLeft, ChevronRight, Activity, Target, Dumbbell, Sparkles,
  X, FileText, ChevronDown, Edit3, MapPin, Trophy, Moon, HelpCircle
} from 'lucide-react';
import { parseAnyDate, getRawDataValue, DEFAULT_DATE_KEYS, NAME_KEYS, PITCHER_NAME_KEYS } from '../utils/dataHelpers';
import { getBodyName } from '../utils/bodyComp';

const STORAGE_KEY = 'baseball_measurement_schedules_v1';

// Supported Team Event Categories
export const EVENT_TYPES = [
  { id: 'practice', label: '練習', icon: Activity, color: 'emerald', emoji: '⚾️', presets: ['通常練習', '朝練', '午後練習', '夜間練習', '打撃特化練習', '守備・走塁特化', '紅白戦'] },
  { id: 'game', label: '試合', icon: Trophy, color: 'amber', emoji: '🏆', presets: ['公式戦', '練習試合(OP戦)', '地区予選', 'トーナメント', 'リーグ戦'] },
  { id: 'measurement', label: '測定・計測', icon: Target, color: 'cyan', emoji: '📊', presets: ['定期ラプソード測定', '投打・体組成 合同測定', '体組成(InBody)測定', 'Blast Motion計測', '体力測定'] },
  { id: 'rest', label: '休養・オフ', icon: Moon, color: 'purple', emoji: '🛌', presets: ['完全休養日', '交代休', 'アクティブレスト', '自主トレ'] },
  { id: 'camp', label: '遠征・合宿', icon: MapPin, color: 'indigo', emoji: '🚌', presets: ['県外遠征試合', '春季強化合宿', '夏季合宿', '遠征移動日'] },
  { id: 'meeting', label: 'ミーティング', icon: Users, color: 'teal', emoji: '🗣️', presets: ['全体作戦ミーティング', '投手陣ミーティング', '野手陣ミーティング', '栄養・フィジカル指導', '個別面談'] },
  { id: 'other', label: 'その他', icon: Sparkles, color: 'slate', emoji: '📌', presets: ['グラウンド整備', '学校行事', '奉仕活動', 'メディカルチェック'] }
];

export default function MeasurementCalendar({
  savantFiles = [],
  savantPitchingFiles = [],
  blastFiles = [],
  combinedFiles = [],
  bodyCompFiles = [],
  setActiveView,
  onViewPlayer,
  profile,
  user
}) {
  // Calendar current view month
  const [currentDate, setCurrentDate] = useState(() => new Date());
  const [selectedDay, setSelectedDay] = useState(null); // 'YYYY-MM-DD'
  const [viewMode, setViewMode] = useState('calendar'); // 'calendar' | 'timeline'
  const [filterType, setFilterType] = useState('all');

  // Strict Per-Account / Per-Team Storage Key (Guarantees zero cross-team collision for Japanese & custom names)
  const tenantStorageKey = useMemo(() => {
    const rawTeam = (profile?.team_name || profile?.team_id || '').trim();
    const isGenericTeam = !rawTeam || /^team[\s_-]*a$/i.test(rawTeam) || /^unknown/i.test(rawTeam);
    const rawAccount = (user?.email || profile?.email || user?.id || profile?.id || 'guest').trim().toLowerCase();

    if (!isGenericTeam) {
      // URL-safe encoding so Japanese team names (半田高校, 東浦高校 etc.) NEVER collide into generic characters
      return `baseball_team_schedules_v3_team_${encodeURIComponent(rawTeam.toLowerCase())}`;
    }
    // For generic/default teams, isolate strictly by individual account (email/ID)
    return `baseball_team_schedules_v3_user_${encodeURIComponent(rawAccount)}`;
  }, [profile?.team_name, profile?.team_id, profile?.email, profile?.id, user?.email, user?.id]);

  // Modal State for Add & Edit
  const [showModal, setShowModal] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState(null); // null for new, object for edit

  // Form Fields
  const [formDate, setFormDate] = useState('');
  const [formType, setFormType] = useState('practice');
  const [formTitle, setFormTitle] = useState('');
  const [formTime, setFormTime] = useState('');
  const [formLocation, setFormLocation] = useState('');
  const [formPlayers, setFormPlayers] = useState('全員');
  const [formNotes, setFormNotes] = useState('');

  // Sanitize helper: completely removes any initial developer mock/sample schedules (e.g. sched_default_*)
  const sanitizeSchedules = (list) => {
    if (!Array.isArray(list)) return [];
    return list.filter(item => {
      if (!item) return false;
      const id = String(item.id || '');
      // Purge any mock/template schedules from initial development
      if (id.startsWith('sched_default_') || id.startsWith('mock_')) return false;
      return true;
    });
  };

  // Manual schedules state strictly loaded from account-isolated localStorage
  const [manualSchedules, setManualSchedules] = useState(() => {
    try {
      // Purge old shared mock storage key to prevent any cross-team data contamination
      localStorage.removeItem('baseball_measurement_schedules_v1');
      const saved = localStorage.getItem(tenantStorageKey);
      if (saved) {
        const cleaned = sanitizeSchedules(JSON.parse(saved));
        if (cleaned.length !== JSON.parse(saved).length) {
          localStorage.setItem(tenantStorageKey, JSON.stringify(cleaned));
        }
        return cleaned;
      }

      // Safe migration from v2 if valid non-colliding key exists
      const legacyKey = `baseball_team_schedules_v2_${(profile?.team_id || profile?.team_name || user?.email || 'team').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
      if (legacyKey !== 'baseball_team_schedules_v2_____') {
        const legacySaved = localStorage.getItem(legacyKey);
        if (legacySaved) {
          const parsed = JSON.parse(legacySaved);
          if (Array.isArray(parsed) && parsed.length > 0) {
            const cleaned = sanitizeSchedules(parsed);
            localStorage.setItem(tenantStorageKey, JSON.stringify(cleaned));
            return cleaned;
          }
        }
      }
    } catch (e) {
      console.warn("Failed to load schedules from localStorage:", e);
    }
    // Accounts start completely clean with zero mock schedules
    return [];
  });

  // Re-sync when switching accounts / teams
  useEffect(() => {
    try {
      const saved = localStorage.getItem(tenantStorageKey);
      if (saved) {
        const cleaned = sanitizeSchedules(JSON.parse(saved));
        if (cleaned.length !== JSON.parse(saved).length) {
          localStorage.setItem(tenantStorageKey, JSON.stringify(cleaned));
        }
        setManualSchedules(cleaned);
      } else {
        const legacyKey = `baseball_team_schedules_v2_${(profile?.team_id || profile?.team_name || user?.email || 'team').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_')}`;
        if (legacyKey !== 'baseball_team_schedules_v2_____') {
          const legacySaved = localStorage.getItem(legacyKey);
          if (legacySaved) {
            const parsed = JSON.parse(legacySaved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const cleaned = sanitizeSchedules(parsed);
              localStorage.setItem(tenantStorageKey, JSON.stringify(cleaned));
              setManualSchedules(cleaned);
              return;
            }
          }
        }
        setManualSchedules([]);
      }
    } catch (e) {
      setManualSchedules([]);
    }
  }, [tenantStorageKey]);

  const saveManualSchedules = (newList) => {
    setManualSchedules(newList);
    try {
      localStorage.setItem(tenantStorageKey, JSON.stringify(newList));
    } catch (e) {
      console.warn("Failed to save schedules to localStorage:", e);
    }
  };

  // Open modal in Create mode
  const handleOpenAddModal = (dateStr) => {
    setEditingSchedule(null);
    const targetDate = dateStr || selectedDay || new Date().toISOString().slice(0, 10);
    setFormDate(targetDate);
    setFormType('practice');
    setFormTitle('');
    setFormTime('09:00〜13:00');
    setFormLocation('本校グラウンド');
    setFormPlayers('全員');
    setFormNotes('');
    setShowModal(true);
  };

  // Open modal in Edit mode
  const handleOpenEditModal = (schedule) => {
    setEditingSchedule(schedule);
    setFormDate(schedule.date || '');
    setFormType(schedule.type || 'practice');
    setFormTitle(schedule.title || '');
    setFormTime(schedule.time || '');
    setFormLocation(schedule.location || '');
    setFormPlayers(schedule.targetPlayers || '');
    setFormNotes(schedule.notes || '');
    setShowModal(true);
  };

  // Save (Add or Update)
  const handleSaveSchedule = (e) => {
    e.preventDefault();
    if (!formDate || !formTitle.trim()) {
      alert('日付と予定タイトルを入力してください。');
      return;
    }

    if (editingSchedule) {
      // Update existing
      const updatedList = manualSchedules.map(s => {
        if (s.id === editingSchedule.id) {
          return {
            ...s,
            date: formDate,
            type: formType,
            title: formTitle.trim(),
            time: formTime.trim(),
            location: formLocation.trim(),
            targetPlayers: formPlayers.trim(),
            notes: formNotes.trim(),
            updatedAt: new Date().toISOString()
          };
        }
        return s;
      });
      saveManualSchedules(updatedList);
    } else {
      // Create new
      const newEvent = {
        id: `sched_${Date.now()}`,
        date: formDate,
        type: formType,
        title: formTitle.trim(),
        time: formTime.trim(),
        location: formLocation.trim(),
        targetPlayers: formPlayers.trim(),
        notes: formNotes.trim(),
        status: 'scheduled',
        createdAt: new Date().toISOString()
      };
      saveManualSchedules([...manualSchedules, newEvent]);
    }

    setShowModal(false);
    setSelectedDay(formDate);

    const [y, m] = formDate.split('-').map(Number);
    if (y && m) setCurrentDate(new Date(y, m - 1, 1));
  };

  const handleDeleteSchedule = (id) => {
    if (!window.confirm('この予定をカレンダーから削除してもよろしいですか？')) return;
    saveManualSchedules(manualSchedules.filter(s => s.id !== id));
    if (showModal) setShowModal(false);
  };

  // Extract recorded events automatically from uploaded data
  const recordedEvents = useMemo(() => {
    const eventsByDateAndType = {};

    const extractDate = (row, fallback) => {
      const raw = getRawDataValue(row, DEFAULT_DATE_KEYS) || row.date || row.game_date;
      const parsed = parseAnyDate(raw);
      if (parsed) return parsed.slice(0, 10);
      return fallback ? fallback.slice(0, 10) : '';
    };

    const extractPlayer = (row, nameKeys) => {
      for (const k of nameKeys) {
        if (row[k] != null && String(row[k]).trim() !== '') {
          return String(row[k]).trim();
        }
      }
      const bName = getBodyName(row);
      if (bName) return bName;
      return '';
    };

    // 1. Batting events
    const allBattingFiles = [...combinedFiles, ...savantFiles, ...blastFiles];
    allBattingFiles.forEach(file => {
      const fileDate = parseAnyDate(file.filename);
      (file.data || []).forEach(row => {
        const d = extractDate(row, fileDate);
        if (!d) return;
        const p = extractPlayer(row, NAME_KEYS);
        if (!p) return;

        const key = `${d}_batting`;
        if (!eventsByDateAndType[key]) {
          eventsByDateAndType[key] = {
            id: `auto_${key}`,
            date: d,
            type: 'batting',
            category: 'measurement',
            title: '打撃データ計測 (Rapsodo / Blast)',
            status: 'recorded',
            playerSet: new Set(),
            sampleCount: 0
          };
        }
        eventsByDateAndType[key].playerSet.add(p);
        eventsByDateAndType[key].sampleCount++;
      });
    });

    // 2. Pitching events
    savantPitchingFiles.forEach(file => {
      const fileDate = parseAnyDate(file.filename);
      (file.data || []).forEach(row => {
        const d = extractDate(row, fileDate);
        if (!d) return;
        const p = extractPlayer(row, PITCHER_NAME_KEYS);
        if (!p) return;

        const key = `${d}_pitching`;
        if (!eventsByDateAndType[key]) {
          eventsByDateAndType[key] = {
            id: `auto_${key}`,
            date: d,
            type: 'pitching',
            category: 'measurement',
            title: '投球データ計測 (Rapsodo)',
            status: 'recorded',
            playerSet: new Set(),
            sampleCount: 0
          };
        }
        eventsByDateAndType[key].playerSet.add(p);
        eventsByDateAndType[key].sampleCount++;
      });
    });

    // 3. Body composition events
    bodyCompFiles.forEach(file => {
      const fileDate = parseAnyDate(file.filename);
      (file.data || []).forEach(row => {
        const d = extractDate(row, fileDate);
        if (!d) return;
        const p = extractPlayer(row, NAME_KEYS);
        if (!p) return;

        const key = `${d}_body_comp`;
        if (!eventsByDateAndType[key]) {
          eventsByDateAndType[key] = {
            id: `auto_${key}`,
            date: d,
            type: 'body_comp',
            category: 'measurement',
            title: '体組成計測 (InBody)',
            status: 'recorded',
            playerSet: new Set(),
            sampleCount: 0
          };
        }
        eventsByDateAndType[key].playerSet.add(p);
        eventsByDateAndType[key].sampleCount++;
      });
    });

    return Object.values(eventsByDateAndType).map(e => ({
      ...e,
      playerNames: Array.from(e.playerSet).sort()
    }));
  }, [combinedFiles, savantFiles, blastFiles, savantPitchingFiles, bodyCompFiles]);

  // Combine recorded events and manual schedules
  const allEvents = useMemo(() => {
    const list = [
      ...recordedEvents,
      ...manualSchedules.map(s => ({
        ...s,
        category: s.type,
        playerNames: s.targetPlayers ? s.targetPlayers.split(/[,、\s]+/).filter(Boolean) : []
      }))
    ];
    return list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [recordedEvents, manualSchedules]);

  // Default selected day to latest event or today
  useEffect(() => {
    if (!selectedDay && allEvents.length > 0) {
      const latest = allEvents[allEvents.length - 1];
      if (latest?.date) {
        setSelectedDay(latest.date);
        const [y, m] = latest.date.split('-').map(Number);
        if (y && m) {
          setCurrentDate(new Date(y, m - 1, 1));
        }
      }
    }
  }, [allEvents, selectedDay]);

  // Month navigation
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-indexed

  const prevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const nextMonth = () => setCurrentDate(new Date(year, month + 1, 1));
  const goToToday = () => {
    const now = new Date();
    setCurrentDate(new Date(now.getFullYear(), now.getMonth(), 1));
    const pad = n => String(n).padStart(2, '0');
    setSelectedDay(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
  };

  // Calendar grid calculations
  const firstDayOfWeek = new Date(year, month, 1).getDay(); // 0 = Sun
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const calendarDays = useMemo(() => {
    const cells = [];
    const pad = n => String(n).padStart(2, '0');

    // Prev month padding
    for (let i = firstDayOfWeek - 1; i >= 0; i--) {
      const d = daysInPrevMonth - i;
      const prevM = month === 0 ? 12 : month;
      const prevY = month === 0 ? year - 1 : year;
      const dateStr = `${prevY}-${pad(prevM)}-${pad(d)}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${year}-${pad(month + 1)}-${pad(d)}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: true });
    }

    // Next month padding (up to 42 cells = 6 rows)
    const remaining = 42 - cells.length;
    for (let d = 1; d <= remaining; d++) {
      const nextM = month === 11 ? 1 : month + 2;
      const nextY = month === 11 ? year + 1 : year;
      const dateStr = `${nextY}-${pad(nextM)}-${pad(d)}`;
      cells.push({ dayNumber: d, dateStr, isCurrentMonth: false });
    }

    return cells;
  }, [year, month, firstDayOfWeek, daysInMonth, daysInPrevMonth]);

  // Map events to date string
  const eventsByDate = useMemo(() => {
    const map = {};
    allEvents.forEach(e => {
      if (!e.date) return;
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [allEvents]);

  // Filter checker
  const eventMatchesFilter = (ev, fType) => {
    if (fType === 'all') return true;
    if (fType === 'practice') return ev.type === 'practice';
    if (fType === 'game') return ev.type === 'game';
    if (fType === 'measurement') {
      return ev.type === 'measurement' || ev.type === 'batting' || ev.type === 'pitching' || ev.type === 'body_comp';
    }
    if (fType === 'rest') return ev.type === 'rest';
    if (fType === 'camp') return ev.type === 'camp';
    if (fType === 'meeting') return ev.type === 'meeting';
    if (fType === 'other') return ev.type === 'other';
    return true;
  };

  // Filtered events
  const filteredEvents = useMemo(() => {
    return allEvents.filter(e => eventMatchesFilter(e, filterType));
  }, [allEvents, filterType]);

  const selectedDayEvents = useMemo(() => {
    if (!selectedDay) return [];
    return allEvents.filter(e => e.date === selectedDay);
  }, [allEvents, selectedDay]);

  // Helper for styling any event type
  const getBadgeStyle = (type, status) => {
    if (status === 'recorded') {
      if (type === 'batting') {
        return {
          bg: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300',
          dot: 'bg-emerald-400',
          label: '打撃測定 (CSV記録)',
          icon: Activity
        };
      }
      if (type === 'pitching') {
        return {
          bg: 'bg-amber-950/60 border-amber-500/40 text-amber-300',
          dot: 'bg-amber-400',
          label: '投球測定 (CSV記録)',
          icon: Target
        };
      }
      if (type === 'body_comp') {
        return {
          bg: 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300',
          dot: 'bg-cyan-400',
          label: '体組成 (CSV記録)',
          icon: Dumbbell
        };
      }
      return {
        bg: 'bg-blue-950/60 border-blue-500/40 text-blue-300',
        dot: 'bg-blue-400',
        label: '測定データ (CSV記録)',
        icon: Sparkles
      };
    }

    // Manual schedules
    switch (type) {
      case 'practice':
        return {
          bg: 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300',
          dot: 'bg-emerald-400',
          label: '練習',
          icon: Activity
        };
      case 'game':
        return {
          bg: 'bg-amber-950/60 border-amber-500/40 text-amber-300',
          dot: 'bg-amber-400',
          label: '試合',
          icon: Trophy
        };
      case 'measurement':
        return {
          bg: 'bg-cyan-950/60 border-cyan-500/40 text-cyan-300',
          dot: 'bg-cyan-400',
          label: '測定・計測',
          icon: Target
        };
      case 'rest':
        return {
          bg: 'bg-purple-950/60 border-purple-500/40 text-purple-300',
          dot: 'bg-purple-400',
          label: '休養・オフ',
          icon: Moon
        };
      case 'camp':
        return {
          bg: 'bg-indigo-950/60 border-indigo-500/40 text-indigo-300',
          dot: 'bg-indigo-400',
          label: '遠征・合宿',
          icon: MapPin
        };
      case 'meeting':
        return {
          bg: 'bg-teal-950/60 border-teal-500/40 text-teal-300',
          dot: 'bg-teal-400',
          label: 'ミーティング',
          icon: Users
        };
      default:
        return {
          bg: 'bg-slate-800/80 border-slate-600 text-slate-300',
          dot: 'bg-slate-400',
          label: 'その他',
          icon: Sparkles
        };
    }
  };

  const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

  // Current active event type info in modal
  const activeTypeInfo = EVENT_TYPES.find(t => t.id === formType) || EVENT_TYPES[0];

  return (
    <div className="bg-slate-800/80 border-2 border-indigo-500/30 p-4 sm:p-6 rounded-2xl sm:rounded-3xl shadow-2xl space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-700 pb-4">
        <div>
          <h3 className="text-lg sm:text-xl font-black text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-indigo-400" /> チーム活動・測定スケジュール
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            練習・公式戦・OP戦・合宿・休養の登録と、測定データの自動集約
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto shrink-0">
          {/* View mode toggle */}
          <div className="bg-slate-900/90 border border-slate-700 p-1 rounded-xl flex items-center gap-1 text-xs font-bold">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'calendar' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              📅 カレンダー
            </button>
            <button
              onClick={() => setViewMode('timeline')}
              className={`px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'timeline' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'
              }`}
            >
              📋 予定・履歴一覧
            </button>
          </div>

          {/* Add schedule button */}
          <button
            onClick={() => handleOpenAddModal()}
            className="bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white px-3.5 py-1.5 rounded-xl text-xs font-extrabold shadow-lg transition-all flex items-center gap-1.5 border border-indigo-400/30 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> 予定を追加
          </button>
        </div>
      </div>

      {/* Filter Category Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 bg-slate-900/80 p-3 rounded-2xl border border-slate-700/80">
        <div className="flex flex-wrap items-center gap-1.5 text-xs">
          <button
            onClick={() => setFilterType('all')}
            className={`px-3 py-1.5 rounded-xl font-bold transition-all whitespace-nowrap cursor-pointer ${
              filterType === 'all'
                ? 'bg-indigo-600 text-white shadow'
                : 'bg-slate-800 text-slate-400 hover:text-white border border-slate-700/60'
            }`}
          >
            すべて
          </button>
          {EVENT_TYPES.map(cat => (
            <button
              key={cat.id}
              onClick={() => setFilterType(cat.id)}
              className={`px-2.5 py-1.5 rounded-xl font-bold transition-all flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                filterType === cat.id
                  ? 'bg-slate-700 text-white border border-slate-500 shadow'
                  : 'bg-slate-800/60 text-slate-400 hover:text-white border border-slate-700/60'
              }`}
            >
              <span>{cat.emoji}</span>
              <span>{cat.label}</span>
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 font-mono flex items-center gap-2.5 bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700 shrink-0 self-start md:self-auto">
          <span>予定: <strong className="text-indigo-400">{manualSchedules.length}</strong> 件</span>
          <span className="text-slate-600">|</span>
          <span>測定記録: <strong className="text-cyan-400">{recordedEvents.length}</strong> 日</span>
        </div>
      </div>

      {/* Main Content Area */}
      {viewMode === 'calendar' ? (
        <div className="space-y-4">
          {/* Calendar Month Navigation Header */}
          <div className="bg-slate-900/80 border border-slate-700/80 p-3 rounded-2xl flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="前月"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h4 className="text-base sm:text-lg font-black text-white font-mono px-2">
                {year}年 {month + 1}月
              </h4>
              <button
                onClick={nextMonth}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
                title="翌月"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <button
              onClick={goToToday}
              className="text-xs font-bold text-indigo-300 hover:text-white bg-slate-800 hover:bg-slate-700 px-3 py-1.5 rounded-xl border border-slate-700 transition cursor-pointer"
            >
              今月・今日へ移動
            </button>
          </div>

          {/* Calendar Grid */}
          <div className="bg-slate-900/90 border border-slate-700/80 rounded-2xl overflow-hidden p-2 sm:p-3">
            {/* Weekday headers */}
            <div className="grid grid-cols-7 gap-1 text-center font-bold text-xs pb-2 border-b border-slate-800 select-none">
              {dayNames.map((name, i) => (
                <div key={name} className={i === 0 ? 'text-rose-400' : (i === 6 ? 'text-blue-400' : 'text-slate-400')}>
                  {name}
                </div>
              ))}
            </div>

            {/* Days Grid */}
            <div className="grid grid-cols-7 gap-1 sm:gap-1.5 pt-2">
              {calendarDays.map((cell, idx) => {
                const dayEvents = (eventsByDate[cell.dateStr] || []).filter(e => eventMatchesFilter(e, filterType));
                const isSelected = selectedDay === cell.dateStr;
                const todayStr = new Date().toISOString().slice(0, 10);
                const isToday = cell.dateStr === todayStr;

                return (
                  <div
                    key={idx}
                    onClick={() => setSelectedDay(cell.dateStr)}
                    className={`min-h-[76px] sm:min-h-[92px] p-1.5 rounded-xl transition-all cursor-pointer flex flex-col justify-between border ${
                      isSelected
                        ? 'bg-indigo-950/60 border-indigo-400 shadow-lg ring-2 ring-indigo-500/30'
                        : cell.isCurrentMonth
                          ? 'bg-slate-800/40 hover:bg-slate-800/80 border-slate-700/40'
                          : 'bg-slate-950/30 border-transparent opacity-40'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className={`text-xs font-mono font-bold ${
                        isToday
                          ? 'bg-indigo-600 text-white w-5 h-5 rounded-full flex items-center justify-center'
                          : cell.isCurrentMonth ? 'text-white' : 'text-slate-500'
                      }`}>
                        {cell.dayNumber}
                      </span>
                      {dayEvents.length > 0 && (
                        <div className="flex items-center gap-1">
                          {dayEvents.some(e => e.status === 'recorded') && (
                            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" title="測定データ有"></span>
                          )}
                          {dayEvents.some(e => e.status === 'scheduled') && (
                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" title="予定有"></span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Events pills inside day cell */}
                    <div className="space-y-1 mt-1 overflow-hidden">
                      {dayEvents.slice(0, 2).map((ev, evIdx) => {
                        const style = getBadgeStyle(ev.type, ev.status);
                        return (
                          <div
                            key={evIdx}
                            className={`text-[9px] sm:text-[10px] px-1 py-0.5 rounded truncate font-bold border flex items-center gap-1 ${style.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${style.dot}`}></span>
                            <span className="truncate">
                              {ev.status === 'scheduled' ? ev.title : `${style.label} (${ev.playerNames?.length || 0}名)`}
                            </span>
                          </div>
                        );
                      })}
                      {dayEvents.length > 2 && (
                        <div className="text-[9px] text-slate-400 font-mono text-right pr-0.5">
                          +{dayEvents.length - 2}件
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Selected Day Details Panel */}
          {selectedDay && (
            <div className="bg-slate-900/90 border border-slate-700 p-4 sm:p-5 rounded-2xl space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <CalendarIcon className="w-5 h-5 text-indigo-400" />
                  <h4 className="text-base font-extrabold text-white">
                    📅 {selectedDay} の活動・測定予定 ({selectedDayEvents.length} 件)
                  </h4>
                </div>
                <button
                  onClick={() => handleOpenAddModal(selectedDay)}
                  className="self-start sm:self-auto text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white px-3 py-1.5 rounded-xl transition flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> この日に予定を追加
                </button>
              </div>

              {selectedDayEvents.length === 0 ? (
                <div className="py-8 text-center text-slate-500 text-xs">
                  <p>この日に登録されたチーム予定や測定データはありません。</p>
                  <button
                    onClick={() => handleOpenAddModal(selectedDay)}
                    className="mt-2.5 text-indigo-400 hover:text-indigo-300 font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" /> 練習・試合・休養などの予定を追加する
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map((ev, idx) => {
                    const style = getBadgeStyle(ev.type, ev.status);
                    const IconComp = style.icon;
                    const isManual = ev.status === 'scheduled';

                    return (
                      <div
                        key={idx}
                        className="bg-slate-800/60 border border-slate-700/80 p-4 rounded-xl space-y-3 hover:border-slate-600 transition"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                          <div className="flex items-start gap-3">
                            <span className={`p-2 rounded-xl border shrink-0 mt-0.5 ${style.bg}`}>
                              <IconComp className="w-4 h-4" />
                            </span>
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.bg}`}>
                                  {style.label}
                                </span>
                                <h5 className="font-extrabold text-white text-sm sm:text-base">{ev.title}</h5>
                              </div>

                              {/* Time & Location if manual */}
                              {(ev.time || ev.location) && (
                                <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300 font-medium pt-0.5">
                                  {ev.time && (
                                    <span className="flex items-center gap-1 text-slate-300">
                                      <Clock className="w-3.5 h-3.5 text-indigo-400" /> {ev.time}
                                    </span>
                                  )}
                                  {ev.location && ev.location !== '-' && (
                                    <span className="flex items-center gap-1 text-slate-300">
                                      <MapPin className="w-3.5 h-3.5 text-emerald-400" /> {ev.location}
                                    </span>
                                  )}
                                  {ev.targetPlayers && (
                                    <span className="flex items-center gap-1 text-slate-300">
                                      <Users className="w-3.5 h-3.5 text-purple-400" /> 対象: {ev.targetPlayers}
                                    </span>
                                  )}
                                </div>
                              )}

                              {/* Notes */}
                              {ev.notes && (
                                <p className="text-xs text-slate-400 bg-slate-900/60 p-2 rounded-lg border border-slate-800">
                                  {ev.notes}
                                </p>
                              )}

                              {/* Recorded meta */}
                              {ev.status === 'recorded' && (
                                <p className="text-xs text-slate-400">
                                  📊 アップロード済みデータから自動抽出 ({ev.sampleCount || 0} 行)
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons for manual schedules */}
                          {isManual && (
                            <div className="flex items-center gap-1.5 self-end sm:self-start shrink-0">
                              <button
                                onClick={() => handleOpenEditModal(ev)}
                                className="text-xs font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                                title="予定を編集"
                              >
                                <Edit3 className="w-3.5 h-3.5" /> 編集
                              </button>
                              <button
                                onClick={() => handleDeleteSchedule(ev.id)}
                                className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 px-2.5 py-1.5 rounded-lg transition cursor-pointer"
                                title="予定を削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" /> 削除
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Participating Member Tags for Recorded Measurement Events */}
                        {ev.playerNames && ev.playerNames.length > 0 && ev.status === 'recorded' && (
                          <div className="pt-2 border-t border-slate-700/60">
                            <div className="flex items-center gap-1.5 text-xs text-slate-400 font-bold mb-2">
                              <Tag className="w-3.5 h-3.5 text-cyan-400" />
                              <span>測定参加選手 ({ev.playerNames.length} 名) — タップで個人分析へ:</span>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {ev.playerNames.map((pName, pIdx) => (
                                <button
                                  key={pIdx}
                                  onClick={() => {
                                    if (onViewPlayer) {
                                      onViewPlayer(pName, 'Aチーム', ev.type === 'body_comp' ? 'body_comp' : 'combined');
                                    } else if (setActiveView) {
                                      setActiveView('player');
                                    }
                                  }}
                                  className="group bg-slate-900 hover:bg-indigo-900/60 border border-slate-700 hover:border-indigo-500/50 text-slate-200 hover:text-white px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                                  title={`${pName} 選手の分析を見る`}
                                >
                                  <span>{pName}</span>
                                  <span className="text-[10px] text-slate-500 group-hover:text-indigo-300 transition-colors">
                                    →
                                  </span>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        /* Timeline / List View */
        <div className="space-y-3">
          {filteredEvents.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm border-2 border-dashed border-slate-700 rounded-2xl bg-slate-900/30">
              <CalendarIcon className="w-12 h-12 mx-auto mb-2 opacity-30 text-indigo-400" />
              <p className="font-bold">該当する活動・予定がありません</p>
            </div>
          ) : (
            filteredEvents.map((ev, idx) => {
              const style = getBadgeStyle(ev.type, ev.status);
              const IconComp = style.icon;
              const isManual = ev.status === 'scheduled';

              return (
                <div
                  key={idx}
                  className="bg-slate-900/80 border border-slate-700/80 p-4 sm:p-5 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 hover:border-slate-600 transition"
                >
                  <div className="flex items-start gap-3.5 min-w-0">
                    <div className="font-mono text-center shrink-0 min-w-[70px] bg-slate-800 p-2.5 rounded-xl border border-slate-700">
                      <span className="text-[10px] text-slate-400 block font-bold">
                        {ev.date?.slice(0, 4)}年
                      </span>
                      <span className="text-base sm:text-lg font-black text-white block leading-tight">
                        {ev.date?.slice(5)}
                      </span>
                    </div>

                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${style.bg}`}>
                          {style.label}
                        </span>
                        <h4 className="text-base font-extrabold text-white truncate">
                          {ev.title}
                        </h4>
                      </div>

                      {/* Time, location, target */}
                      {(ev.time || ev.location || ev.targetPlayers) && (
                        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
                          {ev.time && <span>🕒 {ev.time}</span>}
                          {ev.location && ev.location !== '-' && <span>📍 {ev.location}</span>}
                          {ev.targetPlayers && <span>👥 {ev.targetPlayers}</span>}
                        </div>
                      )}

                      <p className="text-xs text-slate-400">
                        {ev.status === 'recorded'
                          ? `測定データ読込済 (${ev.sampleCount || 0} 行)`
                          : (ev.notes || '予定')}
                      </p>

                      {/* Member Tags if recorded */}
                      {ev.playerNames && ev.playerNames.length > 0 && ev.status === 'recorded' && (
                        <div className="pt-2 flex flex-wrap gap-1.5 items-center">
                          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-bold mr-1">
                            <Tag className="w-3 h-3 text-cyan-400" /> 参加 ({ev.playerNames.length}):
                          </span>
                          {ev.playerNames.map((pName, pIdx) => (
                            <button
                              key={pIdx}
                              onClick={() => {
                                if (onViewPlayer) {
                                  onViewPlayer(pName, 'Aチーム', ev.type === 'body_comp' ? 'body_comp' : 'combined');
                                } else if (setActiveView) {
                                  setActiveView('player');
                                }
                              }}
                              className="bg-slate-800 hover:bg-indigo-900/60 border border-slate-700 hover:border-indigo-500/50 text-slate-300 hover:text-white px-2 py-0.5 rounded text-[11px] font-bold transition cursor-pointer"
                            >
                              {pName}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {isManual && (
                    <div className="flex items-center gap-2 self-end md:self-auto shrink-0">
                      <button
                        onClick={() => handleOpenEditModal(ev)}
                        className="text-xs font-bold text-indigo-300 hover:text-white flex items-center gap-1 bg-indigo-950/40 hover:bg-indigo-900/50 border border-indigo-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" /> 編集
                      </button>
                      <button
                        onClick={() => handleDeleteSchedule(ev.id)}
                        className="text-xs font-bold text-rose-400 hover:text-rose-300 flex items-center gap-1 bg-rose-950/40 hover:bg-rose-900/50 border border-rose-500/30 px-3 py-1.5 rounded-xl transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> 削除
                      </button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Add / Edit Schedule Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-slate-900 border-2 border-indigo-500/50 rounded-2xl sm:rounded-3xl max-w-xl w-full max-h-[92vh] overflow-y-auto p-4 sm:p-6 shadow-2xl space-y-4 my-auto animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="p-2 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/40">
                  <activeTypeInfo.icon className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-lg font-bold text-white">
                    {editingSchedule ? '予定の編集' : '新しいチーム予定を追加'}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {editingSchedule ? '内容を更新してカレンダーに反映します' : '練習・試合・測定・休養などの予定を登録'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSchedule} className="space-y-4">
              {/* Type Selector (Pill tabs) */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  1. 予定種別
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5">
                  {EVENT_TYPES.map(cat => (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        setFormType(cat.id);
                        if (!formTitle || activeTypeInfo.presets.includes(formTitle)) {
                          setFormTitle(cat.presets[0]);
                        }
                      }}
                      className={`p-2 rounded-xl text-center text-xs font-bold transition flex flex-col items-center gap-1 cursor-pointer ${
                        formType === cat.id
                          ? 'bg-indigo-600 text-white shadow-lg border border-indigo-400'
                          : 'bg-slate-800/80 text-slate-400 hover:text-white border border-slate-700/60 hover:bg-slate-800'
                      }`}
                    >
                      <span className="text-base">{cat.emoji}</span>
                      <span className="text-[10px] leading-tight truncate w-full">{cat.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Date & Time */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    2. 日付 <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm outline-none font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    3. 時間帯
                  </label>
                  <input
                    type="text"
                    placeholder="例: 09:00〜13:00 / 終日"
                    value={formTime}
                    onChange={e => setFormTime(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  />
                  {/* Quick time chips */}
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['終日', '午前 (09:00〜12:00)', '午後 (13:00〜17:00)', '夜間 (18:00〜21:00)'].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setFormTime(chip)}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-300 px-2 py-1 rounded-lg border border-slate-700 transition cursor-pointer whitespace-nowrap"
                      >
                        {chip.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Title & Quick Presets */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  4. 予定タイトル <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  placeholder="例: 通常練習、OP戦 vs ○○高校、定期測定など"
                  value={formTitle}
                  onChange={e => setFormTitle(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  required
                />
                {/* Preset suggestions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <span className="text-[11px] text-slate-400 font-bold self-center mr-1">おすすめ定型文:</span>
                  {activeTypeInfo.presets.map(preset => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setFormTitle(preset)}
                      className="text-[11px] bg-slate-800 hover:bg-indigo-950 hover:text-indigo-300 text-slate-300 px-2.5 py-1 rounded-lg border border-slate-700 transition cursor-pointer whitespace-nowrap"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Location & Target Players */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    5. 実施場所
                  </label>
                  <input
                    type="text"
                    placeholder="例: 本校グラウンド、市民球場"
                    value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['本校グラウンド', '雨天練習場', 'トレーニング室', '遠征球場'].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setFormLocation(chip)}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-300 px-2.5 py-1 rounded-lg border border-slate-700 transition cursor-pointer whitespace-nowrap"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    6. 対象メンバー・カテゴリ
                  </label>
                  <input
                    type="text"
                    placeholder="例: 全員、Aチーム、野手陣、投手陣"
                    value={formPlayers}
                    onChange={e => setFormPlayers(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-sm outline-none"
                  />
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {['全員', 'Aチーム', 'Bチーム', '野手陣', '投手陣'].map(chip => (
                      <button
                        key={chip}
                        type="button"
                        onClick={() => setFormPlayers(chip)}
                        className="text-[11px] bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-indigo-300 px-2.5 py-1 rounded-lg border border-slate-700 transition cursor-pointer whitespace-nowrap"
                      >
                        {chip}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1">
                  7. 連絡・持ち物・特記事項（メモ）
                </label>
                <textarea
                  rows={2}
                  placeholder="例: 集合時間、着用ユニフォーム、弁当持参、雨天時の変更先など"
                  value={formNotes}
                  onChange={e => setFormNotes(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 focus:border-indigo-500 rounded-xl px-3 py-2 text-white text-xs outline-none"
                />
              </div>

              {/* Footer Buttons */}
              <div className="pt-2 flex items-center justify-between border-t border-slate-800">
                {editingSchedule ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteSchedule(editingSchedule.id)}
                    className="px-3.5 py-2 rounded-xl text-xs font-bold text-rose-400 hover:text-white bg-rose-950/40 hover:bg-rose-900/60 border border-rose-500/30 transition flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> この予定を削除
                  </button>
                ) : (
                  <div></div>
                )}

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 rounded-xl text-xs font-bold text-slate-400 hover:text-white transition cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="bg-indigo-600 hover:bg-indigo-500 text-white px-5 py-2 rounded-xl text-xs font-extrabold shadow-lg transition cursor-pointer flex items-center gap-1.5"
                  >
                    {editingSchedule ? '変更を保存する' : 'カレンダーに追加'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
