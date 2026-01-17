'use client';

import { Node } from '@/lib/microcms';

type SkillNodeProps = {
  node: Node;
  x: number;
  y: number;
  color: string;
  isUnlocked: boolean;
  onClick: (node: Node) => void;
};

export default function SkillNode({ node, x, y, color, isUnlocked, onClick }: SkillNodeProps) {
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onClick(node)}
      className="cursor-pointer"
      style={{ opacity: isUnlocked ? 1 : 0.5 }}
    >
      <circle
        r="35"
        fill="#1e293b"
        stroke={color}
        strokeWidth="3"
        className="transition-all duration-300 hover:filter hover:brightness-125"
      />
      <circle r="30" fill={`${color}33`} />
      <text
        textAnchor="middle"
        y="-5"
        fill="white"
        fontSize="10"
        fontWeight="bold"
        className="pointer-events-none"
      >
        {node.name.length > 6 ? node.name.slice(0, 6) + '...' : node.name}
      </text>
      <text
        textAnchor="middle"
        y="10"
        fill="#94a3b8"
        fontSize="8"
        className="pointer-events-none"
      >
        Lv.{node.level}
      </text>
    </g>
  );
}
