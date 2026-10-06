import React, { useState } from 'react';
import { 
  BookOpen, UploadCloud, HardDrive, Users, User, Trophy, LineChart, 
  HelpCircle, ChevronDown, ChevronRight, CheckCircle2, ShieldCheck, 
  Sparkles, FileText, Activity, Sliders, Maximize2, MousePointer, Filter, ArrowUpDown, Layers
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
      q: "選手比較テーブルで打球速度が高い順に並び替えるには？",
      a: "「チーム打撃分析」の選手比較テーブル上部にある「並び替え」メニューを選択するか、各列の項目名（例:「平均打球速度」「最大打球速度」など）を直接クリックすることで、昇順・降順を自由に切り替えられます。"
    },
    {
      q: "クラウド同期が完了したら読み込み欄はどうなりますか？",
      a: "クラウド同期が正常に完了すると、データはクラウドに安全に保存され、「データ読み込み」の表示枠は自動的にクリアされます。保存されたデータは「クラウド管理」画面でいつでも確認・管理が可能です。"
    },
    {
      q: "グラフの表示範囲を変更して拡大表示するには？",
      a: "「チーム打撃分析」や「カスタムグラフ」画面にある軸範囲入力欄（例: X軸 Min/Max, Y軸 Min/Maxなど）に希望の数値を入力することで、注目したいデータ領域をピンポイントで拡大・表示できます。"
    },
    {
      q: "CSVファイルが文字化けしたり読み込めない場合は？",
      a: "ファイルがUTF-8またはShift-JISで保存されているかご確認ください。また、1行目に項目ヘッダー（例: Date, Player Name, Bat Speed等）が含まれていることをご確認ください。"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/60 via-slate-900 to-purple-900/60 p-8 border border-blue-500/20 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Baseball Analyzer 公式ガイド (ver 2.0.0)</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            アプリの使い方 & 機能ガイド
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            CSV読み込み・クラウド管理から、投手分析、体組成分析、打撃分析、グラフのズーム機能、選手比較テーブルのソートまで分かりやすく解説します。
          </p>
        </div>
        <div className="absolute right-0 top-0 -bottom-10 w-96 bg-blue-600/10 blur-3xl rounded-full pointer-events-none" />
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl no-scrollbar">
        {[
          { id: 'analysis', label: '1. 分析機能の活用（打撃・投手・体組成）', icon: Activity },
          { id: 'csv', label: '2. CSV読み込み手順', icon: UploadCloud },
          { id: 'cloud', label: '3. クラウド管理・プライバシー', icon: HardDrive },
          { id: 'faq', label: '4. よくある質問 (FAQ)', icon: HelpCircle },
          { id: 'changelog', label: '5. 更新履歴 (ver 2.0.0)', icon: Layers },
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
                <p className="text-xs text-slate-400">打撃・投手データのズーム表示や比較テーブルの打球速度・球速ソート機能</p>
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
                  グラフ上部の数値入力欄（<code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">X軸 Min/Max</code>, <code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">Y軸 Min/Max</code>）に指定の数値を入力すると、高初速帯や投手の球種別変化量エリアを拡大して確認できます。
                </p>
              </div>

              {/* Feature 2: Sortable Tables */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <ArrowUpDown className="w-5 h-5" />
                  <span>2. 選手比較テーブルの並び替え</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「チーム打撃分析」の選手比較テーブルでは、**平均打球速度順（高い順）**や**最大打球速度順**、**バットスピード順**などで自由にソート可能。列項目名のクリックで簡単にランキング化できます。
                </p>
              </div>

              {/* Feature 3: Metric Filtering & Data Source Switch */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Filter className="w-5 h-5" />
                  <span>3. データ種別の選択 & スマート表示</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  「統合データ」「Rapsodo 打撃」「Rapsodo 投球」「Blast」から分析したいデータを切り替え可能。選択したフォーマットに合わせて表示が最適化されます。
                </p>
              </div>
            </div>
          </div>

          {/* Section: Overview of Pages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Pitcher Analysis */}
            <div className="bg-slate-900 border border-amber-500/30 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-600/20 border border-amber-500/30 rounded-xl text-amber-400">
                  <Activity className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    投手分析
                    <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded-full font-mono border border-amber-500/30">ver 2.0.0</span>
                  </h4>
                  <p className="text-xs text-slate-400">投球データの球速・変化量・リリースポイント分析</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>Rapsodo 投球データの球速 (km/h)・回転数 (rpm) 集計</li>
                <li>縦変化量 (VB) vs 横変化量 (HB) の散布図（Pitch Movement）</li>
                <li>リリースポイント（高さ・横位置）の安定性チェック</li>
                <li>球種割合・カウント別投球傾向グラフ</li>
              </ul>
            </div>

            {/* Body Composition Analysis */}
            <div className="bg-slate-900 border border-cyan-500/30 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-cyan-600/20 border border-cyan-500/30 rounded-xl text-cyan-400">
                  <Dumbbell className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white flex items-center gap-2">
                    体組成分析
                    <span className="text-[10px] px-2 py-0.5 bg-cyan-500/20 text-cyan-300 rounded-full font-mono border border-cyan-500/30">ver 2.0.0</span>
                  </h4>
                  <p className="text-xs text-slate-400">体重・筋肉量・体脂肪率・FFMI分析</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>FFMI（除脂肪重量指数）自動計算 & アスリート評価</li>
                <li>体幹・左右腕・左右脚の部位別筋肉量バランス分析</li>
                <li>体重・筋肉量・体脂肪率の時系列推移トラッキング</li>
                <li>TANITA・InBody 2行ヘッダー構成CSVの全自動検出・認識</li>
              </ul>
            </div>

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

            {/* Player Analysis */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-600/20 border border-purple-500/30 rounded-xl text-purple-400">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">個人成績</h4>
                  <p className="text-xs text-slate-400">選手個人の詳細コンディションレポート</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>「Rapsodo打撃」「Blast」「統合データ」の切り替え</li>
                <li>打球速度・打球角度・打球方向マップ（スプレーチャート）</li>
                <li>バットスピード・アタックアングル・オンプレーン率等のスイング指標</li>
                <li>期間指定による打撃コンディション推移グラフ</li>
              </ul>
            </div>

            {/* Custom Charts */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-emerald-600/20 border border-emerald-500/30 rounded-xl text-emerald-400">
                  <LineChart className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">カスタムグラフ</h4>
                  <p className="text-xs text-slate-400">好きな2指標を組み合わせたオリジナルグラフ</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                任意の2指標を掛け合わせたオリジナルの比較散布図を作成できます。（例: 打球角度 vs 飛距離、バットスピード vs アタックアングルなど）
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: CSV Upload Guide */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-emerald-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-emerald-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-emerald-600/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">1ファイル統合 CSVデータ（画面最上部）</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Rapsodoの打球データとBlastのスイングデータを1つのCSVにまとめたメインファイル。一番上に配置しスムーズにアップロードできます。
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-amber-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-amber-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-amber-600/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">RAPSODO 投球データ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  球速（Pitch Speed）、回転数（Spin Rate）、縦横変化量（VB/HB）等の投球データを自動認識・解析します。
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">RAPSODO 打撃データ ＆ Blast Motion</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  打球計測およびバットスピード計測用の各機器単体データの読み込み用枠（下部へ再配置）。
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
                <h3 className="text-xl font-bold text-white">クラウド同期 ＆ 端末再起動時の安全対策</h3>
                <p className="text-xs text-slate-400">データ保護とアクセス制限について</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <ShieldCheck className="w-5 h-5" />
                  <span>端末再起動・ブラウザ終了時の安全ログアウト</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  PCやスマートフォンの電源再起動、またはブラウザアプリの完全終了時には自動的にログイン情報がクリアされます。共用端末でも安心してご利用いただけます。
                </p>
              </div>

              <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>アカウントごとのデータ完全隔離</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  アップロードされたデータはメールアドレスごとに厳格に区別されます。他チームや他アカウントのデータが混ざる心配はありません。
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

      {/* Tab 5: Version Changelog / Release Notes (Latest Version Only) */}
      {activeTab === 'changelog' && (
        <div className="space-y-6">
          {/* ver 2.0.0 Release Notes (Latest) */}
          <div className="bg-slate-900 border border-amber-500/30 p-8 rounded-3xl space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-600/20 border border-amber-500/30 rounded-2xl text-amber-400">
                  <Sparkles className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-extrabold text-white">主な更新内容（ver 2.0.0）</h3>
                  <p className="text-xs text-slate-400">投手分析・体組成分析ダブルリリース・カラーテーマ切替・安全ログアウト</p>
                </div>
              </div>
              <span className="px-3 py-1 bg-amber-600/20 border border-amber-500/40 text-amber-300 text-xs font-black rounded-full">
                ver 2.0.0 (最新)
              </span>
            </div>

            <div className="space-y-4">
              {/* Feature 1 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-amber-300 flex items-center gap-2">
                  <span>⚾ 1. 「投手分析」モジュールの正式リリース (Rapsodo Pitching)</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Rapsodo等の投球CSVから、**球速 (km/h)・回転数 (rpm)・変化量（縦VB / 横HB）**の散布図や、**リリースポイントの安定度（高さ・横位置）**、**打者対戦成績・球種割合・カウント別投球傾向**を可視化・分析できるようになりました。
                </p>
              </div>

              {/* Feature 2 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-cyan-300 flex items-center gap-2">
                  <span>💪 2. 「体組成分析」モジュールの正式リリース (Body Composition)</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  体重・筋肉量・体脂肪率のトラッキングに加え、**FFMI（除脂肪重量指数）**を自動計算してアスリート評価判定。**体幹・左右腕・左右脚**の部位別筋肉量バランス分析およびTANITA・InBodyなどの2行ヘッダー構成CSVの全自動認識に対応しました。
                </p>
              </div>

              {/* Feature 3 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-purple-300 flex items-center gap-2">
                  <span>🎨 3. 画面左上のカラーテーマ切替機能（昼 ☀️ / 夜 🌙 モード）</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  画面左上のロゴ横にあるトグルボタンで、屋外の太陽光の下で見やすい「ライトモード（昼 ☀️）」と落ち着いた視認性の「ダークモード（夜 🌙）」をワンタッチで切り替えられるようになりました。
                </p>
              </div>

              {/* Feature 4 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-emerald-300 flex items-center gap-2">
                  <span>📁 4. データ読み込み画面のカード配置の最適化</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  頻繁に使用する「1ファイル統合データ」を画面最上部に移動し、「Rapsodo 打撃データ」「Blast Data」を下部に再配置。現場でのファイル読み込み手順をよりわかりやすくスムーズに改善しました。
                </p>
              </div>

              {/* Feature 5 */}
              <div className="bg-slate-950 p-5 rounded-2xl border border-slate-800 space-y-2">
                <h4 className="text-sm font-extrabold text-blue-300 flex items-center gap-2">
                  <span>🔒 5. 端末再起動・ブラウザ終了時の自動ログアウト安全策</span>
                </h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  PCやスマートフォンの電源再起動、またはブラウザ終了時に自動的にログイン情報を初期化し、次回アクセス時にログイン画面へ戻るセッション安全構造を導入しました。（グラウンドでの共用端末でも安全運用が可能です）
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
