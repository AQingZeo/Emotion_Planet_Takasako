
import React from 'react';
import { EmotionData, ShapeConfig, ShaderMode } from '../types';

interface Props {
  selectedEmotion: EmotionData | null;
  config: ShapeConfig;
  setConfig: (config: ShapeConfig) => void;
  onDownload: () => void;
}

const Sidebar: React.FC<Props> = ({ selectedEmotion, config, setConfig, onDownload }) => {
  if (!selectedEmotion) {
    return (
      <div className="w-80 h-full border-r border-stone-300 bg-stone-50 p-6 flex flex-col justify-center items-center text-stone-500 italic">
        <i className="fa-solid fa-wand-sparkles text-3xl mb-4 opacity-30 text-black"></i>
        <p className="text-center text-sm text-black/60">Select a shape on the axis to adjust its visual output</p>
      </div>
    );
  }

  const setShader = (mode: ShaderMode) => {
    setConfig({ ...config, shaderMode: mode });
  };

  return (
    <div className="w-80 h-full border-r border-stone-300 bg-stone-50 p-8 flex flex-col gap-10 overflow-y-auto">
      <div>
        <div className="text-[10px] font-black text-stone-500 uppercase tracking-[0.4em] mb-4">Selected Entity</div>
        <h2 className="text-3xl font-black text-black italic tracking-tighter uppercase">{selectedEmotion.name}</h2>
        <div className="h-0.5 w-12 bg-black/20 mt-4"></div>
      </div>

      <div className="space-y-6">
        <div className="flex justify-between items-center border-b border-stone-300 pb-2">
            <h3 className="text-xs font-black text-stone-600 uppercase tracking-widest">Visual Shader</h3>
        </div>
        
        <div className="grid grid-cols-1 gap-3">
          {(['wireframe', 'watercolor'] as ShaderMode[]).map((mode) => (
            <button
              key={mode}
              onClick={() => setShader(mode)}
              className={`w-full py-5 px-6 rounded-xl text-left transition-all flex items-center justify-between group ${
                config.shaderMode === mode 
                ? 'bg-black text-white font-black border border-black' 
                : 'bg-white text-stone-600 hover:bg-stone-100 border border-stone-300'
              }`}
            >
              <span className="uppercase text-xs tracking-[0.2em]">{mode}</span>
              <div className={`w-2 h-2 rounded-full ${config.shaderMode === mode ? 'bg-white' : 'bg-stone-400 group-hover:bg-stone-500'}`}></div>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex justify-between items-center border-b border-stone-300 pb-2">
            <h3 className="text-xs font-black text-stone-600 uppercase tracking-widest">Geometry Density</h3>
        </div>
        <input 
          type="range" 
          min={16} 
          max={128} 
          step={2} 
          value={config.points} 
          onChange={(e) => setConfig({...config, points: parseInt(e.target.value)})}
          className="w-full h-1 bg-stone-300 rounded-lg appearance-none cursor-pointer accent-black"
        />
        <div className="flex justify-between text-[9px] font-mono text-stone-500">
          <span>LOW RES</span>
          <span>{config.points} SEGS</span>
          <span>ULTRA</span>
        </div>
      </div>

      <div className="mt-auto pt-10">
        <button 
          onClick={onDownload}
          className="w-full py-4 bg-black text-white font-black rounded-xl hover:bg-stone-800 transition-all flex items-center justify-center gap-3 active:scale-95 shadow-xl uppercase text-xs tracking-widest"
        >
          <i className="fa-solid fa-camera"></i>
          Capture Frame
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
