'use client';

import { Node } from '@/lib/microcms';

type SkillNodeProps = {
  node: Node;
  x: number;
  y: number;
  color: string;
  isUnlocked: boolean;
  isSelected?: boolean;
  onClick: (node: Node) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
};

export default function SkillNode({ 
  node, x, y, color, isUnlocked, isSelected, onClick, onMouseEnter, onMouseLeave 
}: SkillNodeProps) {
  const radius = isSelected ? 42 : 38;
  
  return (
    <g
      transform={`translate(${x}, ${y})`}
      onClick={() => onClick(node)}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      className="cursor-pointer"
      style={{ opacity: isUnlocked ? 1 : 0.5 }}
    >
      {isSelected && (
        <circle r={radius + 8} fill="none" stroke={color} strokeWidth="2" strokeOpacity="0.5">
          <animate attributeName="r" from={radius + 5} to={radius + 15} dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="stroke-opacity" from="0.5" to="0" dur="1.5s" repeatCount="indefinite" />
        </circle>
      )}
      <circle
        r={radius}
        fill="#1e293b"
        stroke={color}
        strokeWidth={isSelected ? 4 : 3}
        filter={isSelected ? 'url(#glow)' : undefined}
        className="transition-all duration-200 hover:brightness-125"
      />
      <circle r={radius - 6} fill={`${color}25`} />
      <text
        textAnchor="middle"
        y="-3"
        fill="white"
        fontSize="11"
        fontWeight="bold"
        className="pointer-events-none"
      >
        {node.name.length > 5 ? node.name.slice(0, 5) + '..' : node.name}
      </text>
      <text
        textAnchor="middle"
        y="12"
        fill="#94a3b8"
        fontSize="9"
        className="pointer-events-none"
      >
        Lv.{node.level}
      </text>
    </g>
  );
}
