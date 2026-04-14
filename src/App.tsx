/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Play, RotateCcw, Trophy, AlertCircle } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Types & Constants ---

type GamePhase = 'START' | 'MEMORY' | 'ACTION' | 'ROUND_SUCCESS' | 'GAME_OVER';

interface CatColor {
  name: string;
  twClass: string;
  hex: string;
  img: string;
}

const COLORS: CatColor[] = [
  { name: 'Red', twClass: 'text-[#FF8080]', hex: '#FF8080', img: 'input_file_3.png' },
  { name: 'Blue', twClass: 'text-[#80B3FF]', hex: '#80B3FF', img: 'input_file_0.png' },
  { name: 'Green', twClass: 'text-[#80FF80]', hex: '#80FF80', img: 'input_file_1.png' },
  { name: 'Yellow', twClass: 'text-[#FFF080]', hex: '#FFF080', img: 'input_file_4.png' },
  { name: 'Purple', twClass: 'text-[#C080FF]', hex: '#C080FF', img: 'input_file_2.png' },
];

const MEMORY_DISPLAY_TIME = 1200;
const MEMORY_GAP_TIME = 300;
const ACTION_DISPLAY_TIME = 1500;
const INITIAL_SEQUENCE_LENGTH = 3;

// --- Audio Helper ---

const playTone = (freq: number, type: OscillatorType = 'sine', duration: number = 0.1) => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(freq, audioCtx.currentTime);
    
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    oscillator.start();
    oscillator.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.warn('Audio context failed', e);
  }
};

// --- Components ---

const CuteCat = ({ imgUrl, size = 200, className = "" }: { imgUrl: string, size?: number, className?: string }) => {
  return (
    <img 
      src={imgUrl}
      alt="Cute Cat"
      width={size}
      height={size}
      className={`rounded-full shadow-lg object-contain bg-white/50 ${className}`}
      referrerPolicy="no-referrer"
    />
  );
};

export default function App() {
  // Game State
  const [phase, setPhase] = useState<GamePhase>('START');
  const [round, setRound] = useState(1);
  const [score, setScore] = useState(0);
  const [sequence, setSequence] = useState<CatColor[]>([]);
  const [sequenceIndex, setSequenceIndex] = useState(0);
  const [currentDisplayCat, setCurrentDisplayCat] = useState<CatColor | null>(null);
  const [isMemoryShowing, setIsMemoryShowing] = useState(false);
  const [actionCat, setActionCat] = useState<CatColor | null>(null);
  const [feedback, setFeedback] = useState<'correct' | 'wrong' | null>(null);
  
  // Refs for timing
  const actionTimerRef = useRef<NodeJS.Timeout | null>(null);

  // --- Game Actions ---

  const startNewRound = useCallback((len: number) => {
    const newSequence = Array.from({ length: len }, () => COLORS[Math.floor(Math.random() * COLORS.length)]);
    setSequence(newSequence);
    setSequenceIndex(0);
    setPhase('MEMORY');
    setFeedback(null);
  }, []);

  const startGame = () => {
    setScore(0);
    setRound(1);
    startNewRound(INITIAL_SEQUENCE_LENGTH);
  };

  // --- Phase: Memory ---

  useEffect(() => {
    if (phase === 'MEMORY') {
      let idx = 0;
      const showNext = () => {
        if (idx < sequence.length) {
          setCurrentDisplayCat(sequence[idx]);
          setIsMemoryShowing(true);
          playTone(440 + idx * 50, 'sine', 0.1);

          setTimeout(() => {
            setIsMemoryShowing(false);
            idx++;
            setTimeout(showNext, MEMORY_GAP_TIME);
          }, MEMORY_DISPLAY_TIME);
        } else {
          setTimeout(() => {
            setPhase('ACTION');
          }, 1000);
        }
      };
      showNext();
    }
  }, [phase, sequence]);

  // --- Phase: Action ---

  const spawnActionCat = useCallback(() => {
    if (phase !== 'ACTION') return;

    // Decide if we show the correct one or a random one
    // 40% chance of showing the correct one to keep it challenging but fair
    const shouldShowCorrect = Math.random() < 0.4;
    let nextCat: CatColor;
    
    if (shouldShowCorrect) {
      nextCat = sequence[sequenceIndex];
    } else {
      // Pick a random one, but try to avoid the correct one if we decided not to show it
      const others = COLORS.filter(c => c.name !== sequence[sequenceIndex].name);
      nextCat = others[Math.floor(Math.random() * others.length)];
    }

    setActionCat(nextCat);
    setFeedback(null);

    actionTimerRef.current = setTimeout(() => {
      setActionCat(null);
      // If it was the correct one and they missed it
      if (nextCat.name === sequence[sequenceIndex].name && phase === 'ACTION') {
        // Optional: handle miss? The prompt says "Treat as a miss". 
        // We'll just spawn another one after a short delay.
      }
      
      setTimeout(spawnActionCat, 500);
    }, ACTION_DISPLAY_TIME);
  }, [phase, sequence, sequenceIndex]);

  useEffect(() => {
    if (phase === 'ACTION') {
      spawnActionCat();
    }
    return () => {
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    };
  }, [phase, spawnActionCat]);

  const handleCatClick = (clickedCat: CatColor) => {
    if (phase !== 'ACTION' || !actionCat) return;

    if (clickedCat.name === sequence[sequenceIndex].name) {
      // Correct!
      playTone(880, 'sine', 0.1);
      setFeedback('correct');
      setScore(s => s + 10);
      
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
      setActionCat(null);

      const nextIdx = sequenceIndex + 1;
      if (nextIdx >= sequence.length) {
        setPhase('ROUND_SUCCESS');
        playTone(1200, 'triangle', 0.3);
        setTimeout(() => {
          setRound(r => r + 1);
          startNewRound(sequence.length + 1);
        }, 2000);
      } else {
        setSequenceIndex(nextIdx);
        setTimeout(spawnActionCat, 800);
      }
    } else {
      // Wrong!
      playTone(220, 'sawtooth', 0.2);
      setFeedback('wrong');
      setScore(s => Math.max(0, s - 5));
      
      // Reset progress in sequence or just show error?
      // Prompt says: "Show an error feedback. Optionally reset progress or reduce score."
      // We'll reset the sequence index for this round to make it a memory test.
      setSequenceIndex(0);
      
      if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
      setActionCat(null);
      setTimeout(spawnActionCat, 1500);
    }
  };

  // --- Render Helpers ---

  return (
    <div className="min-h-screen bg-vibrant-bg text-vibrant-ink font-sans flex flex-col items-center p-10 overflow-hidden">
      {/* Header / HUD */}
      <header className="w-full max-w-4xl flex justify-between items-center bg-white px-10 py-6 rounded-3xl shadow-[0_8px_30px_rgba(0,0,0,0.05)] border-2 border-vibrant-border mb-10">
        <div className="flex flex-col items-center">
          <span className="text-sm uppercase tracking-widest font-bold text-vibrant-muted mb-1">Round</span>
          <span className="text-3xl font-black text-vibrant-stat">{round.toString().padStart(2, '0')}</span>
        </div>
        
        <div className="flex flex-col items-center">
          <span className="text-sm uppercase tracking-widest font-bold text-vibrant-muted mb-1">Sequence Progress</span>
          <div className="flex gap-3 mt-2">
            {sequence.length > 0 ? sequence.map((_, i) => (
              <div 
                key={i} 
                className={`w-5 h-5 rounded-full border-2 transition-all duration-300 ${
                  i < sequenceIndex ? 'bg-vibrant-success border-vibrant-success' : 
                  i === sequenceIndex ? 'bg-vibrant-active border-vibrant-active scale-125 shadow-[0_0_10px_rgba(255,71,87,0.4)]' : 
                  'bg-[#E0E0E0] border-[#D0D0D0]'
                }`} 
              />
            )) : (
              <div className="w-5 h-5 rounded-full bg-[#E0E0E0] border-2 border-[#D0D0D0]" />
            )}
          </div>
        </div>

        <div className="flex flex-col items-center">
          <span className="text-sm uppercase tracking-widest font-bold text-vibrant-muted mb-1">Score</span>
          <span className="text-3xl font-black text-vibrant-stat">{score.toLocaleString()}</span>
        </div>
      </header>

      {/* Phase Indicator */}
      {phase !== 'START' && phase !== 'GAME_OVER' && (
        <div className="mb-8 text-lg font-extrabold text-vibrant-phase-text bg-white/80 px-6 py-2 rounded-full border-2 border-vibrant-phase-border uppercase tracking-wider">
          {phase} PHASE
        </div>
      )}

      {/* Main Game Stage */}
      <main className="flex-1 w-full max-w-2xl flex flex-col items-center justify-center">
        <AnimatePresence mode="wait">
          {phase === 'START' && (
            <motion.div
              key="start"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.1 }}
              className="text-center space-y-10"
            >
              <div className="relative inline-block">
                <CuteCat imgUrl={COLORS[4].img} size={140} className="mx-auto" />
                <motion.div 
                  animate={{ scale: [1, 1.1, 1] }}
                  transition={{ repeat: Infinity, duration: 2 }}
                  className="absolute -top-4 -right-4 bg-yellow-400 text-white text-sm font-black px-3 py-1.5 rounded-full shadow-md"
                >
                  MEOW!
                </motion.div>
              </div>
              <div className="space-y-4">
                <h1 className="text-6xl font-black tracking-tighter text-vibrant-stat">Squeezing the Cat</h1>
                <p className="text-vibrant-muted text-xl max-w-md mx-auto font-medium">
                  Watch the sequence of colored cats, then click them in the same order when they appear!
                </p>
              </div>
              <button
                onClick={startGame}
                className="group relative bg-vibrant-stat text-white px-14 py-7 rounded-full text-3xl font-black shadow-2xl hover:bg-vibrant-active transition-all active:scale-95 flex items-center gap-4 mx-auto uppercase tracking-tighter"
              >
                <Play fill="currentColor" size={32} />
                Start Game
              </button>
            </motion.div>
          )}

          {phase === 'MEMORY' && (
            <motion.div
              key="memory"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center space-y-12"
            >
              <div className="h-80 flex items-center justify-center">
                <AnimatePresence>
                  {isMemoryShowing && currentDisplayCat && (
                    <motion.div
                      initial={{ scale: 0, rotate: -20 }}
                      animate={{ scale: 1, rotate: 0 }}
                      exit={{ scale: 0, rotate: 20 }}
                    >
                      <CuteCat imgUrl={currentDisplayCat.img} size={280} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              <div className="bg-vibrant-instruction text-white px-12 py-5 rounded-full text-3xl font-black shadow-lg uppercase tracking-widest">
                Memorize!
              </div>
            </motion.div>
          )}

          {phase === 'ACTION' && (
            <motion.div
              key="action"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="w-full h-full flex flex-col items-center justify-center space-y-12"
            >
              <div className="relative h-96 w-96 flex items-center justify-center">
                <AnimatePresence>
                  {actionCat && (
                    <motion.button
                      key={actionCat.name + Date.now()}
                      initial={{ scale: 0, y: 50 }}
                      animate={{ scale: 1, y: 0 }}
                      exit={{ scale: 0, opacity: 0 }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => handleCatClick(actionCat)}
                      className="cursor-pointer transition-transform"
                      aria-label={`Click the ${actionCat.name} cat`}
                    >
                      <CuteCat imgUrl={actionCat.img} size={320} />
                    </motion.button>
                  )}
                </AnimatePresence>

                {/* Feedback Overlay */}
                <AnimatePresence>
                  {feedback && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0 }}
                      className="absolute inset-0 flex items-center justify-center pointer-events-none z-10"
                    >
                      {feedback === 'correct' ? (
                        <div className="bg-vibrant-success text-white p-8 rounded-full shadow-2xl">
                          <Trophy size={80} />
                        </div>
                      ) : (
                        <div className="bg-vibrant-active text-white p-8 rounded-full shadow-2xl">
                          <AlertCircle size={80} />
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="bg-vibrant-instruction text-white px-12 py-5 rounded-full text-3xl font-black shadow-lg uppercase tracking-widest">
                Squeeze if it matches!
              </div>
            </motion.div>
          )}

          {phase === 'ROUND_SUCCESS' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center space-y-8"
            >
              <motion.div
                animate={{ rotate: [0, -10, 10, -10, 10, 0], scale: [1, 1.2, 1] }}
                transition={{ duration: 0.5, repeat: 3 }}
              >
                <Trophy size={160} className="text-yellow-400 mx-auto" />
              </motion.div>
              <h2 className="text-7xl font-black text-vibrant-stat">ROUND COMPLETE!</h2>
              <p className="text-3xl text-vibrant-muted font-bold">Next: Round {round + 1}</p>
            </motion.div>
          )}

          {phase === 'GAME_OVER' && (
            <motion.div
              key="gameover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center space-y-10"
            >
              <h2 className="text-7xl font-black text-vibrant-active">GAME OVER</h2>
              <div className="bg-white p-10 rounded-3xl border-4 border-vibrant-border shadow-xl">
                <p className="text-2xl text-vibrant-muted font-bold uppercase tracking-widest mb-2">Final Score</p>
                <p className="text-8xl font-black text-vibrant-stat">{score.toLocaleString()}</p>
              </div>
              <button
                onClick={startGame}
                className="bg-vibrant-stat text-white px-12 py-6 rounded-full text-2xl font-black shadow-xl hover:bg-vibrant-active flex items-center gap-3 mx-auto uppercase tracking-tighter"
              >
                <RotateCcw size={32} />
                Try Again
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer Instructions */}
      <footer className="mt-auto py-8 text-center text-vibrant-muted text-sm font-black uppercase tracking-[0.2em]">
        {phase === 'START' && "Press Start to Begin"}
        {phase === 'MEMORY' && "Watch the Sequence Carefully"}
        {phase === 'ACTION' && "Click ONLY the cat that matches the sequence"}
        {phase === 'ROUND_SUCCESS' && "Level Up!"}
      </footer>
    </div>
  );
}
