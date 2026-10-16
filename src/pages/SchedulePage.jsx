import React from 'react';
import MeasurementCalendar from '../components/MeasurementCalendar';
import { Calendar, Clock, Users, Sparkles, PlusCircle } from 'lucide-react';

function SchedulePage({
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
  return (
    <div className="animate-in fade-in duration-300">
      <header className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-500/20 border border-blue-500/30 text-blue-300 inline-flex items-center gap-1 whitespace-nowrap">
              <Calendar className="w-3.5 h-3.5" />
              チームスケジュール
            </span>
            <span className="text-xs text-slate-400 whitespace-nowrap">
              {profile?.team_name || profile?.team_id || 'チーム'} 専用
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-extrabold text-white">チーム活動 ＆ 測定スケジュール管理</h2>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveView && setActiveView('upload')}
            className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <PlusCircle className="w-3.5 h-3.5 text-blue-400" />
            データを追加読込
          </button>
        </div>
      </header>

      {/* Main Measurement Calendar Component */}
      <div className="max-w-6xl">
        <MeasurementCalendar
          savantFiles={savantFiles}
          savantPitchingFiles={savantPitchingFiles}
          blastFiles={blastFiles}
          combinedFiles={combinedFiles}
          bodyCompFiles={bodyCompFiles}
          setActiveView={setActiveView}
          onViewPlayer={onViewPlayer}
          profile={profile}
          user={user}
        />
      </div>
    </div>
  );
}

export default SchedulePage;
