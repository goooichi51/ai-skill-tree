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

  // ジャンルIDから色を取得するヘルパー
  const getGenreColor = (genreId: string | undefined) => {
    if (!genreId) return { bg: 'from-gray-600 to-gray-700', border: 'border-gray-500', text: 'text-gray-300' };
    const genre = genres.find(g => g.id === genreId);
    if (!genre) return { bg: 'from-gray-600 to-gray-700', border: 'border-gray-500', text: 'text-gray-300' };
    
    const colorMap: Record<string, { bg: string; border: string; text: string }> = {
      '#8B5CF6': { bg: 'from-purple-600 to-purple-800', border: 'border-purple-400', text: 'text-purple-300' },
      '#EF4444': { bg: 'from-red-600 to-red-800', border: 'border-red-400', text: 'text-red-300' },
      '#F59E0B': { bg: 'from-amber-500 to-amber-700', border: 'border-amber-400', text: 'text-amber-300' },
      '#10B981': { bg: 'from-emerald-500 to-emerald-700', border: 'border-emerald-400', text: 'text-emerald-300' },
      '#3B82F6': { bg: 'from-blue-500 to-blue-700', border: 'border-blue-400', text: 'text-blue-300' },
    };
    return colorMap[genre.color] || { bg: 'from-gray-600 to-gray-700', border: 'border-gray-500', text: 'text-gray-300' };
  };

  // レベルでグループ化
  const nodesByLevel = nodes.reduce((acc, node) => {
    const level = node.level || 1;
    if (!acc[level]) acc[level] = [];
    acc[level].push(node);
    return acc;
  }, {} as Record<number, Node[]>);

  const levels = Object.keys(nodesByLevel).map(Number).sort((a, b) => a - b);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      {/* Header */}
      <header className="bg-slate-900/80 border-b border-slate-700 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-lg shadow-indigo-500/30">
              <span className="text-white font-bold text-xl">AI</span>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">AI スキルツリー</h1>
              <p className="text-slate-400 text-sm">ビジネスパーソンのためのAI活用ロードマップ</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="px-4 py-2 rounded-full bg-slate-800 border border-slate-600">
              <span className="text-emerald-400 font-semibold">{nodes.length} スキル</span>
              <span className="text-slate-500 mx-2">/</span>
              <span className="text-amber-400 font-semibold">{useCases.length} 活用事例</span>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Skill Tree Section */}
          <div className="lg:col-span-3">
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-2xl font-bold text-white mb-6 flex items-center gap-2">
                <span className="text-3xl">🎯</span> スキルツリー
              </h2>
              
              {/* Skill Tree by Level */}
              <div className="space-y-8">
                {levels.map((level, levelIndex) => (
                  <div key={level} className="relative">
                    {/* Level Header */}
                    <div className="flex items-center gap-3 mb-4">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-r from-indigo-500 to-purple-500 flex items-center justify-center text-white font-bold shadow-lg">
                        {level}
                      </div>
                      <span className="text-slate-400 font-medium">レベル {level}</span>
                      <div className="flex-1 h-px bg-gradient-to-r from-slate-600 to-transparent"></div>
                    </div>

                    {/* Connection Lines */}
                    {levelIndex < levels.length - 1 && (
                      <div className="absolute left-5 top-14 w-0.5 h-full bg-gradient-to-b from-indigo-500/50 to-transparent -z-10"></div>
                    )}

                    {/* Nodes Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 ml-6">
                      {nodesByLevel[level]?.map((node) => {
                        const colors = getGenreColor(node.genre?.id);
                        return (
                          <div
                            key={node.id}
                            className={`group relative bg-gradient-to-br ${colors.bg} rounded-xl p-4 border-2 ${colors.border} hover:scale-105 hover:shadow-xl hover:shadow-purple-500/20 transition-all duration-300 cursor-pointer`}
                          >
                            {/* Glow Effect */}
                            <div className="absolute inset-0 rounded-xl bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            
                            {/* Content */}
                            <div className="relative z-10">
                              <div className="flex items-start justify-between mb-2">
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full bg-black/30 ${colors.text}`}>
                                  Lv.{node.level || 1}
                                </span>
                                {node.genre && (
                                  <span className="text-xs text-white/70 bg-black/20 px-2 py-1 rounded-full">
                                    {node.genre.name}
                                  </span>
                                )}
                              </div>
                              <h3 className="text-lg font-bold text-white mb-2 group-hover:text-white/90">
                                {node.name}
                              </h3>
                              <p className="text-sm text-white/70 line-clamp-2">
                                {node.description}
                              </p>
                            </div>

                            {/* Unlock indicator */}
                            <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="text-white text-xs">✓</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Genres */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">🏷️</span> ジャンル
              </h2>
              <div className="space-y-3">
                {genres.map((genre) => (
                  <div
                    key={genre.id}
                    className="flex items-center gap-3 p-3 rounded-lg bg-slate-700/50 hover:bg-slate-700 transition-colors cursor-pointer group"
                  >
                    <div
                      className="w-4 h-4 rounded-full shadow-lg"
                      style={{ backgroundColor: genre.color, boxShadow: `0 0 10px ${genre.color}40` }}
                    />
                    <span className="text-white font-medium group-hover:text-white/90">{genre.name}</span>
                    <span className="ml-auto text-xs text-slate-400 bg-slate-600 px-2 py-1 rounded-full">
                      {nodes.filter(n => n.genre?.id === genre.id).length}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Use Cases */}
            <div className="bg-slate-800/50 rounded-2xl p-6 border border-slate-700">
              <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                <span className="text-2xl">💡</span> 活用事例
              </h2>
              <div className="space-y-3">
                {useCases.map((useCase) => (
                  <div
                    key={useCase.id}
                    className="p-4 rounded-lg bg-gradient-to-r from-slate-700/50 to-slate-700/30 hover:from-slate-700 hover:to-slate-700/50 border border-slate-600 hover:border-slate-500 transition-all cursor-pointer group"
                  >
                    <h3 className="text-white font-semibold mb-1 group-hover:text-amber-300 transition-colors">
                      {useCase.name}
                    </h3>
                    <p className="text-sm text-slate-400 line-clamp-2">
                      {useCase.description}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900/80 border-t border-slate-700 mt-8">
        <div className="max-w-7xl mx-auto px-4 py-6 text-center text-sm text-gray-400">
          AI Skill Tree - ビジネスパーソンのためのAI活用ガイド
        </div>
      </footer>
    </div>
  );
}
