import { getGenres, getNodes, getUseCases } from '@/lib/microcms';

export const revalidate = 60;

export default async function Home() {
  let genres, nodes, useCases;
  try {
    [genres, nodes, useCases] = await Promise.all([getGenres(), getNodes(), getUseCases()]);
  } catch (error) {
    console.error('Failed to fetch:', error);
    genres = []; nodes = []; useCases = [];
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <header className="bg-slate-900/80 border-b border-slate-700 sticky top-0 z-50 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold">AI</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI スキルツリー</h1>
              <p className="text-xs text-gray-400">ビジネスパーソンのためのAI活用ロードマップ</p>
            </div>
          </div>
          <span className="text-sm text-gray-300">{nodes.length} スキル / {useCases.length} 活用事例</span>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6">
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-800/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">スキルノード</h2>
            <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4">
              {nodes.map((node, i) => (
                <div key={node.id} className="p-4 rounded-xl border-2 transition-all hover:scale-105"
                  style={{ borderColor: genres[i % genres.length]?.color || '#6366f1', background: `${genres[i % genres.length]?.color || '#6366f1'}20` }}>
                  <div className="text-xs font-bold mb-1" style={{ color: genres[i % genres.length]?.color || '#6366f1' }}>Lv.{node.level}</div>
                  <h3 className="font-bold text-white">{node.name}</h3>
                  <p className="text-xs text-gray-300 mt-1 line-clamp-2">{node.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl p-4">
              <h3 className="font-bold text-white mb-3">ジャンル</h3>
              {genres.map((g) => (
                <div key={g.id} className="flex items-center gap-2 p-2 rounded hover:bg-slate-700/50">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: g.color }} />
                  <span className="text-sm text-gray-200">{g.name}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-800/50 rounded-2xl p-4">
              <h3 className="font-bold text-white mb-3">活用事例</h3>
              {useCases.map((u) => (
                <div key={u.id} className="p-2 rounded hover:bg-slate-700/50 mb-2">
                  <h4 className="text-sm font-semibold text-white">{u.name}</h4>
                  <p className="text-xs text-gray-400 line-clamp-2">{u.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900/80 border-t border-slate-700 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
          AI Skill Tree - ビジネスパーソンのためのAI活用ガイド
        </div>
      </footer>
    </div>
  );
}
