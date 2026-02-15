
import React, { useState, useCallback, useRef, useEffect } from 'react';
import EmotionAxis from './components/EmotionAxis';
import ParametricShape from './components/ParametricShape';
import { EmotionData, ShapeConfig } from './types';
import { classifyEmotion } from './services/geminiService';

const App: React.FC = () => {
  const [input, setInput] = useState('');
  const [emotions, setEmotions] = useState<EmotionData[]>([]);
  const [selectedEmotion, setSelectedEmotion] = useState<EmotionData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [shapeConfig, setShapeConfig] = useState<ShapeConfig>({
    points: 80,
    shaderMode: 'watercolor',
    thickness: 1.0
  });
  const enlargedRef = useRef<HTMLDivElement>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      const result = await classifyEmotion(input);
      const newEmotion: EmotionData = {
        id: Math.random().toString(36).substr(2, 9),
        name: result.canonicalName,
        valence: result.valence,
        arousal: result.arousal,
        timestamp: Date.now()
      };
      setEmotions(prev => [...prev, newEmotion]);
      setSelectedEmotion(newEmotion);
      setInput('');
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDownload = useCallback(() => {
    if (!enlargedRef.current) return;
    const canvas = enlargedRef.current.querySelector('canvas');
    if (!canvas) return;

    const imageUrl = canvas.toDataURL('image/png');
    const downloadLink = document.createElement('a');
    downloadLink.href = imageUrl;
    downloadLink.download = `${selectedEmotion?.name || 'emotion'}-wireframe.png`;
    document.body.appendChild(downloadLink);
    downloadLink.click();
    document.body.removeChild(downloadLink);
  }, [selectedEmotion]);

  return (
    <div className="h-screen w-screen bg-stone-100 text-black select-none overflow-hidden font-sans relative">
      <div className="w-full h-full bg-[radial-gradient(circle_at_center,rgba(245,240,230,1)_0%,rgba(230,220,210,1)_100%)]">
        <EmotionAxis emotions={emotions} onSelect={setSelectedEmotion} />
      </div>
      
      <div className="absolute bottom-0 left-0 right-0 p-6 md:p-12 pt-24 bg-gradient-to-t from-stone-200/95 via-stone-100/90 to-transparent z-20">
        <form onSubmit={handleSubmit} className="relative max-w-4xl mx-auto group">
          <div className="absolute -inset-1 bg-stone-400 rounded-2xl blur opacity-20 group-focus-within:opacity-40 transition duration-700"></div>
          <input 
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Enter Emotional State..."
            className="relative w-full bg-white border border-stone-300 rounded-2xl py-4 md:py-6 px-6 md:px-10 pl-14 md:pl-16 text-lg md:text-xl focus:outline-none focus:border-stone-500 transition-all text-black placeholder:text-stone-400 font-medium tracking-tight shadow-sm"
          />
          <div className="absolute left-6 top-1/2 -translate-y-1/2 text-stone-500">
            {isProcessing ? <i className="fa-solid fa-gear fa-spin"></i> : <i className="fa-solid fa-terminal"></i>}
          </div>
          <button 
            type="submit"
            disabled={isProcessing || !input.trim()}
            className="absolute right-3 md:right-4 top-1/2 -translate-y-1/2 bg-black text-white px-4 md:px-6 py-2 md:py-3 rounded-xl font-black uppercase text-[10px] md:text-xs hover:bg-stone-800 transition-all active:scale-95 shadow-lg pointer-events-auto"
          >
            Process
          </button>
        </form>
      </div>

      {selectedEmotion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-12 animate-in fade-in duration-300 pointer-events-none overflow-hidden">
          <div className="absolute inset-0 bg-stone-200/95 backdrop-blur-[40px] md:backdrop-blur-[100px] pointer-events-auto" onClick={() => setSelectedEmotion(null)}></div>
          
          {/* Fixed Responsive Sidebar */}
          <div className="absolute left-4 md:left-8 top-1/2 -translate-y-1/2 w-44 md:w-64 bg-white/90 border border-stone-300 rounded-3xl p-5 md:p-6 pointer-events-auto backdrop-blur-3xl z-50 shadow-xl flex flex-col scale-90 md:scale-100">
             <div className="text-[8px] md:text-[10px] font-black text-stone-500 tracking-[0.3em] uppercase mb-4 md:mb-6 border-b border-stone-200 pb-2">Display Profile</div>
             <div className="space-y-3 md:space-y-4">
                {(['wireframe', 'watercolor'] as const).map((mode) => (
                  <button 
                    key={mode}
                    onClick={() => setShapeConfig({...shapeConfig, shaderMode: mode})}
                    className={`w-full py-4 md:py-5 px-4 rounded-xl text-[9px] md:text-[11px] font-black tracking-widest uppercase transition-all border ${
                      shapeConfig.shaderMode === mode 
                        ? 'bg-black text-white border-black shadow-md' 
                        : 'bg-stone-100 text-stone-600 border-stone-200 hover:border-stone-400 hover:bg-stone-50'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
             </div>
          </div>

          <div className="relative z-10 w-full h-full flex flex-col items-center justify-center pointer-events-none">
              
              <button 
                  onClick={() => setSelectedEmotion(null)}
                  className="absolute top-0 right-0 w-12 h-12 md:w-16 md:h-16 rounded-full bg-white hover:bg-stone-100 flex items-center justify-center transition-all border border-stone-300 group shadow-xl pointer-events-auto z-50 text-black"
              >
                  <i className="fa-solid fa-xmark text-xl md:text-2xl group-hover:rotate-90 transition-transform"></i>
              </button>
              
              {/* Centered Shape Area */}
              <div ref={enlargedRef} className="flex-1 min-h-0 w-full flex items-center justify-center cursor-grab active:cursor-grabbing pointer-events-auto">
                  <ParametricShape 
                    emotion={selectedEmotion} 
                    size={Math.min(window.innerWidth * 0.98, window.innerHeight * 0.92, 1600)} 
                    isDetailed={true}
                    enableRotation={true}
                    customConfig={shapeConfig} 
                  />
              </div>

              <div className="absolute bottom-0 left-0 right-0 flex flex-col items-center pointer-events-none px-4 md:px-0">
                  <div className="animate-in slide-in-from-bottom-8 duration-700 w-full text-center">
                      <span className="text-[7px] md:text-[10px] font-black text-stone-500 uppercase tracking-[0.6em] mb-2 block">Neural Structural Topography</span>
                      <h2 className="text-5xl md:text-8xl lg:text-[10vw] font-black italic tracking-tighter text-black uppercase leading-none overflow-hidden text-ellipsis whitespace-nowrap mb-6 md:mb-10">
                          {selectedEmotion.name}
                      </h2>
                      
                      <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-12 pointer-events-auto pb-6 md:pb-12">
                          <div className="flex gap-8 font-mono text-[8px] md:text-[10px] text-stone-600 uppercase tracking-[0.3em]">
                              <span>VALENCE: {selectedEmotion.valence.toFixed(2)}</span>
                              <span>AROUSAL: {selectedEmotion.arousal.toFixed(2)}</span>
                          </div>
                          
                          <button 
                              onClick={handleDownload}
                              className="px-8 md:px-12 py-3 md:py-5 bg-black text-white font-black rounded-xl hover:bg-stone-800 transition-all flex items-center gap-4 shadow-xl active:scale-95 uppercase text-[9px] md:text-xs tracking-[0.2em]"
                          >
                              <i className="fa-solid fa-camera text-base md:text-lg"></i>
                              Capture High-Res
                          </button>
                      </div>
                  </div>
              </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
