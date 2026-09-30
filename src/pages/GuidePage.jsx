import React, { useState } from 'react';
import { 
  BookOpen, UploadCloud, HardDrive, Users, User, Trophy, LineChart, 
  HelpCircle, ChevronDown, ChevronRight, CheckCircle2, ShieldCheck, 
  Sparkles, FileText, Activity, Sliders, Maximize2, MousePointer, Filter, Target, ArrowUpDown, Layers
} from 'lucide-react';

function GuidePage({ setActiveView }) {
  const [activeTab, setActiveTab] = useState('analysis');
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  const faqItems = [
    {
      q: "管理者（Admin）アカウントは他のチームやアカウントのデータを見ることができますか？",
      a: "いいえ、見られません。管理者アカウントであっても、分析画面やクラウド管理画面では他アカウント・他チームのデータは一切表示されず、プライバシーが厳密に保護されます。（管理者権限はユーザー管理操作のみに使用されます）"
    },
    {
      q: "投手データと打撃データはどのように切り替えて分析できますか？",
      a: "「個人成績」画面の上部にある選択タブ（「統合データ」「Rapsodo 打撃」「Blast」「Rapsodo 投手」）を選ぶことで、該当データのレポートが自動的に表示されます。投打両方のデータが存在する二刀流選手の場合もスムーズに表示を切り替えられます。"
    },
    {
      q: "選手比較テーブルで打球速度が高い順に並び替えるには？",
      a: "「チーム打撃分析」の選手比較テーブル上部にある「並び替え」メニューを選択するか、各列の項目名（例:「平均打球速度」「最大打球速度」など）を直接クリックすることで、昇順・降順を自由に切り替えられます。"
    },
    {
      q: "グラフの表示範囲を変更して拡大表示するには？",
      a: "「チーム打撃分析」「チーム投手分析」や「カスタムグラフ」画面にある軸範囲入力欄（例: X軸 Min/Max, Y軸 Min/Maxなど）に希望の数値を入力することで、注目したいデータ領域をピンポイントで拡大・表示できます。"
    },
    {
      q: "CSVファイルが文字化けしたり読み込めない場合は？",
      a: "ファイルがUTF-8またはShift-JISで保存されているかご確認ください。また、1行目に項目ヘッダー（例: Date, Player Name, Pitch Velocity, Bat Speed等）が含まれていることをご確認ください。"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/60 via-slate-900 to-purple-900/60 p-8 border border-blue-500/20 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Baseball Analyzer 公式ガイド (ver 1.1.0)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            アプリの使い方 & 機能ガイド
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            CSV読み込みから、打撃・投手データの分析、グラフのズーム機能、選手比較テーブルのソートまで分かりやすく解説します。
          </p>
        </div>
        <div className="absolute right-0 top-0 -bottom-10 w-96 bg-blue-600/10 blur-3xl rounded-full pointer-events-none" />
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl no-scrollbar">
        {[
          { id: 'analysis', label: '1. 分析機能の活用（打撃・投手分析）', icon: Activity },
          { id: 'csv', label: '2. CSV読み込み手順', icon: UploadCloud },
          { id: 'cloud', label: '3. クラウド管理・プライバシー', icon: HardDrive },
          { id: 'faq', label: '4. よくある質問 (FAQ)', icon: HelpCircle },
          { id: 'changelog', label: '5. ver 1.1.0 の主な変更点', icon: Layers },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl font-bold text-xs sm:text-sm whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                  : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* Tab 1: Detailed Analysis Feature Guide */}
      {activeTab === 'analysis' && (
        <div className="space-y-8">
          {/* Section: Chart Scaling & Interactive Controls */}
          <div className="bg-slate-900 border border-blue-500/30 p-8 rounded-3xl space-y-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-2xl text-blue-400">
                <Sliders className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-extrabold text-white">便利な分析機能 & 操作テクニック</h3>
                <p className="text-xs text-slate-400">グラフのズーム表示や比較テーブルの順位並び替え機能を活用した深掘り分析</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {/* Feature 1: Scale Adjustments */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <Maximize2 className="w-5 h-5" />
                  <span>1. 軸の数値範囲指定（拡大表示）</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  グラフ上部の数値入力欄（<code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">X軸 Min/Max</code>, <code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">Y軸 Min/Max</code>）に指定の数値を入力すると、高初速帯や特定の回転数・リリース範囲を拡大して詳細に確認できます。
                </p>
              </div>

              {/* Feature 2: Sortable Tables */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <ArrowUpDown className="w-5 h-5" />
                  <span>2. 選手比較テーブルの並び替え</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「チーム打撃分析」の選手比較テーブルでは、**平均打球速度順（高い順）**や**最大打球速度順**、**バットスピード順**などで自由にソート可能。列項目名のクリックや選択メニューで簡単にランキング表示できます。
                </p>
              </div>

              {/* Feature 3: Metric Filtering & Data Source Switch */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Filter className="w-5 h-5" />
                  <span>3. データ種別の選択 & スマート表示</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「統合データ」「Rapsodo 打撃」「Blast」「Rapsodo 投手」から分析したいデータを切り替え可能。選択したデータ形式に合わせて、閲覧に必要な指標がスッキリ見やすく表示されます。
                </p>
              </div>
            </div>
          </div>

          {/* Section: Overview of Pages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Team Hitting Analysis */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">チーム打撃分析</h4>
                  <p className="text-xs text-slate-400">チーム全体の打撃傾向と選手間比較</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>打球速度順・バット速度順に並び替えられる選手比較テーブル</li>
                <li>チーム全体の打球速度 vs バットスピード比較散布図</li>
                <li>日付別の打撃指標推移グラフ（日別平均・最大プロット）</li>
                <li>軸範囲のカスタム指定によるズーム表示</li>
              </ul>
            </div>

            {/* Team Pitcher Analysis */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600/20 border border-purple-500/30 rounded-xl text-purple-400">
                  <Target className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">チーム投手分析</h4>
                  <p className="text-xs text-slate-400">投手陣の球速・回転数・変化量・フォーム比較</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>投手陣の平均球速・最高球速・平均回転数の全体指標</li>
                <li>縦変化 vs 横変化マップ & リリースポイント散布図</li>
                <li>日付別の球速・回転数・変化量推移グラフ</li>
                <li>投手パフォーマンス重ね合わせ対比グラフ</li>
              </ul>
            </div>

            {/* Player Analysis (Hitting & Pitching) */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">個人成績（打者・投手・二刀流対応）</h4>
                  <p className="text-xs text-slate-400">選手個人の詳細コンディションレポート</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>「Rapsodo打撃」「Blast」「Rapsodo投手」「統合データ」の切り替え</li>
                <li>打者: 打球速度・角度・打球方向マップ・スイング指標</li>
                <li>投手: 球種配分・球速・回転数・変化量・フォームデータ</li>
                <li>期間指定によるコンディション推移グラフ</li>
              </ul>
            </div>

            {/* Custom Charts & Game Stats */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-600/20 border border-amber-500/30 rounded-xl text-amber-400">
                  <LineChart className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">カスタムグラフ ＆ 試合スタッツ</h4>
                  <p className="text-xs text-slate-400">自由な2指標比較と実戦成績の集計</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                任意の2指標を掛け合わせたオリジナルの比較散布図を作成したり、試合ごとの実戦成績（打率・OPS等）と計測データを連動させて評価できます。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: CSV Upload Guide */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">RAPSODO 打撃データ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  打球速度（Exit Velocity）、打球角度（Launch Angle）、推定飛距離などを自動判定・解析します。
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-purple-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-purple-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Target className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">RAPSODO 投手データ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  球速（Pitch Velocity）、回転数（Spin Rate）、変化量（VB/HB）、リリースポイントを詳しく解析します。
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-green-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-green-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-green-600/20 border border-green-500/30 flex items-center justify-center text-green-400">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Blast Motion データ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  バットスピード（Bat Speed）、アタックアングル（Attack Angle）、オンプレーン率などのスイング指標を計測します。
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">1ファイル統合 CSVデータ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Rapsodoの打球データとBlastのスイングデータを1つのCSVにまとめたファイル。一度の読み込みで全指標を網羅します。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Cloud Management & Privacy */}
      {activeTab === 'cloud' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-slate-800 p-8 rounded-2xl space-y-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
                <HardDrive className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-white">クラウド同期 ＆ 厳格なプライバシー保護</h3>
                <p className="text-xs text-slate-400">データ保護とアクセス制限について</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>全アカウントデータ保護（管理者含む）</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  アップロードされたデータは所属チームIDおよびユーザーIDで完全に区別されます。**管理者アカウント（Admin）であっても他チーム・他アカウントのプライベートデータは表示・参照できません。**
                </p>
              </div>

              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>「クラウドから同期」機能</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「クラウド管理」画面の右上ボタンを押すことで、最新のサーバーデータを読み込み直し、全分析画面を同期します。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 4: FAQ Accordion */}
      {activeTab === 'faq' && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
            <HelpCircle className="w-5 h-5 text-blue-400" />
            <span>よくある質問 ＆ トラブルシューティング</span>
          </h3>

          <div className="space-y-3">
            {faqItems.map((item, idx) => (
              <div 
                key={idx}
                className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden transition-all"
              >
                <button
                  onClick={() => toggleFaq(idx)}
                  className="w-full flex items-center justify-between p-5 text-left font-bold text-sm text-slate-200 hover:text-white transition-colors"
                >
                  <span className="flex items-center gap-3">
                    <span className="w-6 h-6 rounded-full bg-blue-600/20 text-blue-400 border border-blue-500/30 text-xs flex items-center justify-center flex-shrink-0">
                      Q
                    </span>
                    {item.q}
                  </span>
                  {openFaq === idx ? (
                    <ChevronDown className="w-5 h-5 text-blue-400 flex-shrink-0" />
                  ) : (
                    <ChevronRight className="w-5 h-5 text-slate-500 flex-shrink-0" />
                  )}
                </button>
                {openFaq === idx && (
                  <div className="px-5 pb-5 pt-1 text-xs text-slate-400 leading-relaxed border-t border-slate-800/60 bg-slate-950/40">
                    {item.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab 5: Version 1.1.0 Changelog / Release Notes */}
      {activeTab === 'changelog' && (
        <div className="space-y-6">
          <div className="bg-slate-900 border border-blue-500/30 p-8 rounded-3xl space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600/20 border border-purple-500/30 rounded-2xl text-purple-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">バージョン 1.1.0 の主な更新内容</h3>
                  <p className="text-xs text-slate-400">投手分析の追加・ソート機能・画面の最適化</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-purple-600/20 border border-purple-500/40 text-purple-300 text-xs font-black rounded-full">
                ver 1.1.0
              </span>
            </div>

            <div className="space-y-4">
              {/* Feature 1 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-purple-300 flex items-center gap-2">
                  <span>⚾ 1. 投手分析機能に対応</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  チーム全体および投手個人の球速・回転数・縦/横変化量・リリースポイント分析に対応しました。「チーム投手分析」画面では各投手の球種比較や投球フォーム（リリース位置）の比較、日付別のコンディション推移を詳しく確認できます。
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-blue-300 flex items-center gap-2">
                  <span>📊 2. 選手比較テーブルのソート機能（打球速度順など）</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「チーム打撃分析」の選手比較テーブルにて、**平均打球速度順（高い順）**や**最大打球速度順**、**バットスピード順**など、見たい指標順に簡単にならび替えられるようになりました。テーブルの各項目名をクリックするか、メニューから手軽にランキング化できます。
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-emerald-300 flex items-center gap-2">
                  <span>🎯 3. データ種別に合わせたスマート表示</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「個人成績」画面にて、選択したデータ（Rapsodo打撃、Blastスイング、Rapsodo投手など）の特性に合わせて表示を最適化。Rapsodo打撃データの閲覧時は打球指標を中心に整理し、計測データにぴったり合わせたレイアウトでレポートを表示します。
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
                  <span>🎨 4. 画面の見やすさ・操作性の向上</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  文字やグラフの配色を見やすく改善し、より快適に分析が行えるよう画面デザインを刷新しました。
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default GuidePage;
