import React from 'react';
import { EquityResult } from '../types';

interface EquityDisplayProps {
  results: EquityResult[];
  stage: string;
  simulations: number;
}

export const EquityDisplay: React.FC<EquityDisplayProps> = ({
  results,
  stage,
  simulations,
}) => {
  // Sort by equity descending
  const sortedResults = [...results].sort((a, b) => b.equity - a.equity);

  const getColorClass = (index: number): string => {
    const colors = [
      'bg-green-500',
      'bg-blue-500',
      'bg-yellow-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-orange-500',
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="bg-gray-800/50 rounded-xl p-4">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-white font-medium">Equity Results</h3>
        <div className="text-xs text-gray-500">
          {simulations.toLocaleString()} simulations | {stage}
        </div>
      </div>

      <div className="space-y-3">
        {sortedResults.map((result) => (
          <div key={result.player_index} className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-gray-300">
                Player {result.player_index + 1}
              </span>
              <span className="text-white font-bold">
                {result.equity.toFixed(1)}%
              </span>
            </div>
            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
              <div
                className={`h-full ${getColorClass(result.player_index)} transition-all duration-500`}
                style={{ width: `${result.equity}%` }}
              />
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>Win: {result.win_percentage.toFixed(1)}%</span>
              <span>Tie: {result.tie_percentage.toFixed(1)}%</span>
            </div>
          </div>
        ))}
      </div>

      {/* Pie chart visualization */}
      <div className="mt-6 flex justify-center">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
            {sortedResults.reduce(
              (acc, result) => {
                const start = acc.offset;
                const size = (result.equity / 100) * 100;
                acc.elements.push(
                  <circle
                    key={result.player_index}
                    cx="18"
                    cy="18"
                    r="15.915"
                    fill="transparent"
                    stroke={
                      ['#22c55e', '#3b82f6', '#eab308', '#a855f7', '#ec4899', '#f97316'][
                        result.player_index % 6
                      ]
                    }
                    strokeWidth="3"
                    strokeDasharray={`${size} ${100 - size}`}
                    strokeDashoffset={-start}
                  />
                );
                acc.offset += size;
                return acc;
              },
              { elements: [] as React.ReactNode[], offset: 0 }
            ).elements}
          </svg>
        </div>
      </div>
    </div>
  );
};

export default EquityDisplay;
