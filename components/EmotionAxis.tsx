
import React, { useState } from 'react';
import { EmotionData } from '../types';
import ParametricShape from './ParametricShape';

interface Props {
  emotions: EmotionData[];
  onSelect: (emotion: EmotionData) => void;
}

const EmotionAxis: React.FC<Props> = ({ emotions, onSelect }) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="relative w-full h-full bg-stone-50 rounded-3xl border border-stone-300 overflow-hidden shadow-[0_0_40px_rgba(0,0,0,0.06)] flex items-center justify-center">
      {/* Background Dots Grid */}
      <div className="absolute inset-0 opacity-[0.15] pointer-events-none" 
           style={{ 
             backgroundImage: 'radial-gradient(circle at 2px 2px, black 1px, transparent 0)',
             backgroundSize: '30px 30px' 
           }}>
      </div>
      
      {/* Axis Labels */}
      <div className="absolute top-10 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
        <span className="text-2xl font-black text-black/60 tracking-widest">ACTIVE</span>
      </div>
      <div className="absolute bottom-10 left-1/2 -translate-x-1/2 flex flex-col items-center z-10 opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
        <span className="text-2xl font-black text-black/60 tracking-widest">PASSIVE</span>
      </div>
      <div className="absolute left-10 top-1/2 -translate-y-1/2 -rotate-90 flex flex-col items-center z-10 opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
        <span className="text-2xl font-black text-black/60 tracking-widest">NEGATIVE</span>
      </div>
      <div className="absolute right-10 top-1/2 -translate-y-1/2 rotate-90 flex flex-col items-center z-10 opacity-50 hover:opacity-100 transition-opacity pointer-events-none">
        <span className="text-2xl font-black text-black/60 tracking-widest">POSITIVE</span>
      </div>

      {/* Shapes Rendering Layer */}
      <div className="absolute inset-0 pointer-events-none">
        {emotions.map((emotion) => {
          // Calculate screen positions with padding to stay within border
          const x = 10 + (((emotion.valence + 1) / 2) * 80);
          const y = 10 + ((1 - (emotion.arousal + 1) / 2)) * 80;

          return (
            <div 
              key={emotion.id}
              className="absolute -translate-x-1/2 -translate-y-1/2 pointer-events-auto cursor-pointer"
              style={{ left: `${x}%`, top: `${y}%` }}
              onClick={() => onSelect(emotion)}
              onMouseEnter={() => setHoveredId(emotion.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <div className="relative w-[85px] h-[85px]">
                  <ParametricShape emotion={emotion} size={85} interactive={true} customConfig={{ shaderMode: 'watercolor' }} />
                  {hoveredId === emotion.id && (
                    <div className="absolute top-full left-1/2 -translate-x-1/2 mt-3 px-3 py-1 bg-black border border-stone-400 rounded-full text-[10px] font-black text-white whitespace-nowrap pointer-events-none z-50 shadow-lg">
                      {emotion.name.toUpperCase()}
                    </div>
                  )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Center Origin and Label */}
      <div className="relative flex flex-col items-center justify-center opacity-50">
        <div className="w-2 h-2 bg-black/30 rounded-full blur-[1px] mb-2"></div>
        <span className="text-[10px] font-black uppercase tracking-[0.5em] text-stone-500">Neutral</span>
      </div>
    </div>
  );
};

export default EmotionAxis;
