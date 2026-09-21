import React, { useState } from 'react';
import { 
  BookOpen, UploadCloud, HardDrive, Users, User, Trophy, LineChart, 
  HelpCircle, ChevronDown, ChevronRight, CheckCircle2, ShieldCheck, 
  Sparkles, FileText, Activity, Sliders, Maximize2, MousePointer, Filter
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
      a: "いいえ、見られません。管理者アカウントであっても、分析画面やクラウド管理画面では他アカウント・他チームのデータは一切表示されず、プライバシーが厳密に保護されます。（管理者権限はユーザーアカウント作成や停止等の管理操作のみに使用されます）"
    },
    {
      q: "グラフの軸（数値の上限・下限）を変更して拡大表示するには？",
      a: "「チーム打撃分析」や「カスタムグラフ」画面にある『グラフ設定』または軸上限入力欄（例: Exit Velocity Max, Bat Speed Maxなど）に希望の数値を入力することで、注目したいデータ領域をピンポイントで拡大・表示できます。"
    },
    {
      q: "アップロードしたデータは他のチームに見られますか？",
      a: "いいえ、絶対に見られません。すべてのデータはログインユーザーIDおよびチームID（team_id / team_name）に紐づいて暗号化・保護されており、別チームのデータが混ざったり閲覧されたりすることは一切ありません。"
    },
    {
      q: "CSVファイルが文字化けしたり読み込めない場合は？",
      a: "ファイルがUTF-8またはShift-JISで保存されているかご確認ください。また、1行目に項目ヘッダー（例: Date, Player Name, Bat Speed等）が含まれていることをご確認ください。"
    },
    {
      q: "1ファイル統合CSVとは何ですか？",
      a: "Rapsodoの打球データ（打球速度・角度・飛距離）とBlast Motionのスイングデータ（バットスピード・アタックアングル）が1つのファイルにまとまったCSVです。アップロードするだけで自動結合されます。"
    }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-12">
      {/* Hero Header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-900/60 via-slate-900 to-purple-900/60 p-8 border border-blue-500/20 shadow-2xl">
        <div className="relative z-10 max-w-3xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/30 text-blue-400 text-xs font-bold">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Baseball Analyzer 公式ガイド</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            アプリの使い方 & 詳細機能解説
          </h1>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            CSV読み込み・クラウド管理から、グラフの上限設定・インタラクティブ分析まで詳しく解説します。
          </p>
        </div>
        <div className="absolute right-0 top-0 -bottom-10 w-96 bg-blue-600/10 blur-3xl rounded-full pointer-events-none" />
      </div>

      {/* Navigation Tabs */}
      <div className="flex overflow-x-auto gap-2 p-1.5 bg-slate-900 border border-slate-800 rounded-2xl no-scrollbar">
        {[
          { id: 'analysis', label: '1. 分析機能の活用（グラフ設定・操作）', icon: Activity },
          { id: 'csv', label: '2. CSV読み込み手順', icon: UploadCloud },
          { id: 'cloud', label: '3. クラウド管理・プライバシー', icon: HardDrive },
          { id: 'faq', label: '4. よくある質問 (FAQ)', icon: HelpCircle },
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
                <h3 className="text-xl font-extrabold text-white">グラフの数値上限変更 & インタラクティブ操作</h3>
                <p className="text-xs text-slate-400">散布図やグラフの表示範囲を自由に変更・拡大して深掘り分析</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-2">
              {/* Feature 1: Scale Adjustments */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
                  <Maximize2 className="w-5 h-5" />
                  <span>1. 軸の数値上限・範囲の変更</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  グラフ上部の入力欄（例: <code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">X軸 Min/Max</code>, <code className="text-blue-300 bg-slate-900 px-1 py-0.5 rounded">Y軸 Min/Max</code>）で表示の上限・下限を変更できます。高初速帯やアタックアングルの特定範囲を拡大ズームして詳細分析が可能です。
                </p>
              </div>

              {/* Feature 2: Node Click Navigation */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-purple-400 font-bold text-sm">
                  <MousePointer className="w-5 h-5" />
                  <span>2. 打球点のクリック移動</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  散布図上の各打球点（丸ノード）にマウスを乗せると詳細データが表示され、クリックすると**直接その選手の「個人成績」画面へジャンプ**します。チーム分析から気になる選手へスムーズに移動できます。
                </p>
              </div>

              {/* Feature 3: Metric Filtering */}
              <div className="bg-slate-950 p-6 rounded-2xl border border-slate-800 space-y-3">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                  <Filter className="w-5 h-5" />
                  <span>3. 日付・選手・指標フィルター</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  表示対象選手のチェックボックス切り替えや日付期間指定（開始日〜終了日）、指標選択（打球速度、バット速度、打球角度、アッパースイング度）を活用して必要なデータのみを抽出できます。
                </p>
              </div>
            </div>
          </div>

          {/* Section: Overview of Pages */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Team Analysis */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-600/20 border border-blue-500/30 rounded-xl text-blue-400">
                  <Users className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">チーム打撃分析</h4>
                  <p className="text-xs text-slate-400">チーム全体の打球速度 vs バットスピード比較</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>チーム全体の平均値・最大値比較散布図</li>
                <li>日付別打撃指標の変動推移グラフ（日別平均・最大プロット）</li>
                <li>軸の上限・下限数値のリアルタイムカスタム調整</li>
                <li>表示選手のチェックボックス切り替え</li>
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
                  <p className="text-xs text-slate-400">選手個人の詳細コンディション分析</p>
                </div>
              </div>
              <ul className="text-xs text-slate-300 space-y-2 list-disc list-inside leading-relaxed">
                <li>期間・安打指定による個別フィルタリング</li>
                <li>月別・日付ごとの指標推移折れ線グラフ</li>
                <li>打球方向の分布マップ・平均/最高指標カード</li>
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
                X軸とY軸の指標（例: 打球角度 vs 飛距離、バットスピード vs アタックアングルなど）を任意に選択し、軸の上限・下限を設定して自由な比較グラフを作成できます。
              </p>
            </div>

            {/* Game Stats */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl space-y-4 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-amber-600/20 border border-amber-500/30 rounded-xl text-amber-400">
                  <Trophy className="w-6 h-6" />
                </div>
                <div>
                  <h4 className="text-lg font-bold text-white">試合スタッツ</h4>
                  <p className="text-xs text-slate-400">実戦での打撃成績集計</p>
                </div>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                試合ごとの打率、長打率、OPSなどの実戦スタッツと計測指標（平均打球速度等）を連動させて傾向を分析します。
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: CSV Upload Guide */}
      {activeTab === 'csv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-900 border border-blue-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-blue-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-blue-600/20 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <FileText className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">RAPSODO / Savant データ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  RapsodoやTrackman等の打撃測定CSV。打球速度（Exit Velocity）、打球角度（Launch Angle）、推定飛距離などを自動判定・解析します。
                </p>
              </div>
            </div>

            <div className="bg-slate-900 border border-purple-500/20 rounded-2xl p-6 flex flex-col justify-between hover:border-purple-500/40 transition-all shadow-xl">
              <div className="space-y-4">
                <div className="w-12 h-12 rounded-xl bg-purple-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400">
                  <Activity className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white">Blast Motion データ</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  スイングセンサー計測CSV。バットスピード（Bat Speed）、アタックアングル（Attack Angle）、インプレーン効率などを計測します。
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
                  Rapsodoの打球データとBlastのスイングデータを1つのCSVにまとめた統合ファイル。一度のアップロードで全指標をリンクします。
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
                  <span>「クラウドから同期」ボタン</span>
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
    </div>
  );
}

export default GuidePage;
