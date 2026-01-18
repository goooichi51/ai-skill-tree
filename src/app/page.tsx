import { getGenres, getNodes, getUseCases, Genre, Node, UseCase } from '@/lib/microcms';
import SkillTree from '@/components/SkillTree';

export const revalidate = 60;

export default async function Home() {
  let genres: Genre[] = [];
  let nodes: Node[] = [];
  let useCases: UseCase[] = [];

  try {
    [genres, nodes, useCases] = await Promise.all([
      getGenres(),
      getNodes(),
      getUseCases(),
    ]);
  } catch (error) {
    console.error('Failed to fetch data from microCMS:', error);
  }

  return (
    <div className="skill-tree-container">
      <header className="bg-slate-900/80 backdrop-blur-sm border-b border-slate-700 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center">
              <span className="text-white font-bold text-lg">AI</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI スキルツリー</h1>
              <p className="text-xs text-gray-400">ビジネスパーソンのためのAI活用ロードマップ</p>
            </div>
          </div>
          <nav className="flex items-center gap-4">
            <span className="text-sm text-gray-300">
              {nodes.length} スキル / {useCases.length} 活用事例
            </span>
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto">
        {genres.length === 0 && nodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
            <h2 className="text-2xl font-bold text-white mb-2">データの取得に失敗しました</h2>
            <p className="text-gray-400">microCMSとの接続を確認してください。</p>
          </div>
        ) : (
          <SkillTree genres={genres} nodes={nodes} useCases={useCases} />
        )}
      </main>

      <footer className="bg-slate-900/80 border-t border-slate-700 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
          <p>AI Skill Tree - ビジネスパーソンのためのAI活用ガイド</p>
ジャンルレベル活用事例git add -A && git commit -m "Improve SkillTree: genre colors, selection animation, glow effects" && git push
        </div>
      </footer>
    </div>
  );
}
