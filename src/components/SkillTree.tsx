'use client';

import { useState } from 'react';
import { Genre, Node, UseCase } from '@/lib/microcms';
import SkillNode from './SkillNode';

type SkillTreeProps = {
  genres: Genre[];
  nodes: Node[];
  useCases: UseCase[];
};

type TooltipState = {
  node: Node;
  x: number;
  y: number;
} | null;

function getNodeColor(node: Node, genres: Genre[]): string {
  if (node.genre) {
    const genre = genres.find(g => g.id === node.genre?.id);
    if (genre) return genre.color;
  }
  return '#6366f1';
}

function calculateNodePositions(nodes: Node[], genres: Genre[], centerX: number, centerY: number) {
  const positions: { [key: string]: { x: number; y: number; color: string } } = {};
  const angleStep = (2 * Math.PI) / Math.max(nodes.length, 1);
  const baseRadius = 180;

  nodes.forEach((node, index) => {
    const angle = angleStep * index - Math.PI / 2;
    const levelRadius = baseRadius + (node.level - 1) * 100;
    positions[node.id] = {
      x: centerX + Math.cos(angle) * levelRadius,
      y: centerY + Math.sin(angle) * levelRadius,
      color: getNodeColor(node, genres)
    };
  });
  return positions;
}

export default function SkillTree({ genres, nodes, useCases }: SkillTreeProps) {
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [selectedUseCase, setSelectedUseCase] = useState<UseCase | null>(null);
  const [tooltip, setTooltip] = useState<TooltipState>(null);

  const svgWidth = 900;
  const svgHeight = 700;
  const centerX = svgWidth / 2;
  const centerY = svgHeight / 2;

  const nodePositions = calculateNodePositions(nodes, genres, centerX, centerY);

  const handleMouseEnter = (node: Node, x: number, y: number) => {
    setTooltip({ node, x, y });
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  return (
    <div className="flex flex-col lg:flex-row gap-6 p-6">
      <div className="flex-1 bg-slate-800/50 rounded-2xl p-4 overflow-hidden relative">
        <svg width="100%" height="550" viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="max-w-full">
          <defs>
            <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#334155" strokeWidth="0.5" />
            </pattern>
            <radialGradient id="coreGradient">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.8" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.2" />
            </radialGradient>
            <filter id="glow">
              <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
              <feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>
          <rect width="100%" height="100%" fill="url(#grid)" />
          
          <g transform={`translate(${centerX}, ${centerY})`} filter="url(#glow)">
            <circle r="55" fill="#1e293b" stroke="#6366f1" strokeWidth="4" />
            <circle r="45" fill="url(#coreGradient)" />
            <text textAnchor="middle" y="5" fill="white" fontSize="14" fontWeight="bold">AI Skills</text>
          </g>

          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            return (
              <line key={`line-${node.id}`} x1={centerX} y1={centerY} x2={pos.x} y2={pos.y}
                stroke={pos.color} strokeWidth="2" strokeOpacity="0.4" strokeDasharray="8,4" />
            );
          })}

          {nodes.map((node) => {
            const pos = nodePositions[node.id];
            if (!pos) return null;
            return (
              <SkillNode key={node.id} node={node} x={pos.x} y={pos.y} color={pos.color}
                isUnlocked={true} isSelected={selectedNode?.id === node.id} 
                onClick={setSelectedNode}
                onMouseEnter={() => handleMouseEnter(node, pos.x, pos.y)}
                onMouseLeave={handleMouseLeave} />
            );
          })}
        </svg>

        {tooltip && (
          <div 
            className="absolute z-50 pointer-events-none"
            style={{
              left: `${(tooltip.x / svgWidth) * 100}%`,
              top: `${(tooltip.y / svgHeight) * 100 - 15}%`,
              transform: 'translate(-50%, -100%)'
            }}
          >
            <div className="bg-slate-900/95 backdrop-blur-sm border border-slate-600 rounded-lg p-3 shadow-xl max-w-[200px]">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getNodeColor(tooltip.node, genres) }} />
                <h4 className="text-white font-bold text-sm">{tooltip.node.name}</h4>
              </div>
              <div className="text-xs text-indigo-400 mb-1">Lv.{tooltip.node.level}</div>
              <p className="text-xs text-gray-300 leading-relaxed">{tooltip.node.description}</p>
              <div className="absolute left-1/2 bottom-0 transform -translate-x-1/2 translate-y-full">
                <div className="border-8 border-transparent border-t-slate-600"></div>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="w-full lg:w-80 space-y-4">
        <div className="bg-slate-800/50 rounded-2xl p-4">
          <h3 className="text-lg font-bold mb-3 text-white">ジャンル</h3>
          <div className="space-y-2">
            {genres.map((genre) => (
              <div key={genre.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-slate-700/50 transition cursor-pointer">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: genre.color }} />
                <span className="text-sm text-gray-200">{genre.name}</span>
              </div>
            ))}
          </div>
        </div>

        {selectedNode && (
          <div className="bg-slate-800/50 rounded-2xl p-4 border-l-4" style={{ borderColor: getNodeColor(selectedNode, genres) }}>
            <h3 className="text-lg font-bold mb-2 text-white">{selectedNode.name}</h3>
            <div className="text-xs text-indigo-400 mb-3">レベル {selectedNode.level}</div>
            <p className="text-sm text-gray-300 leading-relaxed">{selectedNode.description}</p>
          </div>
        )}

        <div className="bg-slate-800/50 rounded-2xl p-4">
          <h3 className="text-lg font-bold mb-3 text-white">活用事例</h3>
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {useCases.map((useCase) => (
              <div key={useCase.id}
                className={`p-3 rounded-lg cursor-pointer transition ${selectedUseCase?.id === useCase.id ? 'bg-indigo-600/30 border border-indigo-500' : 'bg-slate-700/30 hover:bg-slate-700/50'}`}
                onClick={() => setSelectedUseCase(useCase)}>
                <h4 className="text-sm font-semibold text-white">{useCase.name}</h4>
                {selectedUseCase?.id === useCase.id && <p className="text-xs text-gray-300 mt-2 leading-relaxed">{useCase.description}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
