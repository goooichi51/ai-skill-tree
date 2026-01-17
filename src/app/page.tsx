import { getGenres, getNodes, getUseCases, Genre, Node, UseCase } from '@/lib/microcms';

export const revalidate = 60;

export default async function Home() {
  let genres: Genre[] = [];
  let nodes: Node[] = [];
  let useCases: UseCase[] = [];

  try {
    [genres, nodes, useCases] = await Promise.all([getGenres(), getNodes(), getUseCases()]);
  } catch (error) {
    console.error('Failed to fetch:', error);
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
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-slate-800/50 rounded-2xl p-6">
            <h2 className="text-lg font-bold text-white mb-4">スキルノード</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {nodes.map((node) => (
                <div key={node.id} className="bg-slate-700/50 rounded-xl p-4 hover:bg-slate-700 transition cursor-pointer">
                  <div className="text-xs text-indigo-400 mb-1">Lv.{node.level}</div>
                  <h3 className="font-semibold text-white">{node.name}</h3>
                  <p className="text-xs text-gray-400 mt-1 line-clamp-2">{node.description}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-slate-800/50 rounded-2xl p-4">
              <h3 className="text-lg font-bold text-white mb-3">ジャンル</h3>
              <div className="space-y-2">
                {genres.map((genre) => (
                  <div key={genre.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition">
                    <div className="w-4 h-4 rounded-full" style={{ backgroundColor: genre.color }} />
                    <span className="text-sm text-gray-200">{genre.name}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-2xl p-4">
              <h3 className="text-lg font-bold text-white mb-3">活用事例</h3>
              <div className="space-y-2">
                {useCases.map((uc) => (
                  <div key={uc.id} className="p-3 bg-slate-700/30 rounded-lg hover:bg-slate-700/50 transition">
                    <h4 className="text-sm font-semibold text-white">{uc.name}</h4>
                    <p className="text-xs text-gray-400 mt-1">{uc.description}</p>
                  </div>
                ))}
              </div>
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
