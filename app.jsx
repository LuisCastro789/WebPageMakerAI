import React, { useState, useEffect, useRef } from 'react';
import { 
  Wand2, Layout, Code2, Eye, Download, RefreshCcw, 
  ChevronRight, Smartphone, Monitor, AlertCircle,
  CheckCircle2, Sparkles, Upload, X, Image as ImageIcon
} from 'lucide-react';

// Firebase imports remain unchanged
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- Firebase Configuration ---
// Notice: These still safely use VITE_ because Firebase needs them on the frontend
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'website-builder-demo';

export default function App() {
  const [userPrompt, setUserPrompt] = useState('');
  const [uploadedImages, setUploadedImages] = useState([]);
  const [generatedHtml, setGeneratedHtml] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('preview');
  const [viewMode, setViewMode] = useState('desktop');
  const iframeRef = useRef(null);

  // Authenticate user anonymously on load
  useEffect(() => {
    signInAnonymously(auth).catch((error) => {
      console.error("Firebase Auth Error:", error);
    });
  }, []);

  // --- UPDATED GENERATION FUNCTION ---
  // Notice there is no longer a SYSTEM_INSTRUCTION here or direct Google SDK calls
  const generateWebsite = async (promptText, imagesData) => {
    setIsLoading(true);
    try {
      // 1. Call YOUR secure Vercel endpoint, NOT Google directly
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          userRequest: promptText, // We pass this to match req.body.userRequest in generate.js
          images: imagesData 
        }),
      });

      // 2. Handle HTTP errors from your backend
      if (!response.ok) {
        throw new Error("Failed to generate from backend");
      }

      // 3. Parse the securely generated text
      const data = await response.json();
      
      // 4. Update the UI with the final HTML
      setGeneratedHtml(data.text);
      setActiveTab('preview');

    } catch (error) {
      console.error("Error generating website:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGenerate = () => {
    if (userPrompt.trim()) {
      generateWebsite(userPrompt, uploadedImages);
    }
  };

  // Render iframe content when generated HTML changes
  useEffect(() => {
    if (iframeRef.current && generatedHtml && activeTab === 'preview') {
      const doc = iframeRef.current.contentWindow.document;
      doc.open();
      doc.write(generatedHtml);
      doc.close();
    }
  }, [generatedHtml, activeTab, viewMode]);

  return (
    <main className="flex h-screen bg-slate-950 text-slate-200 font-sans">
      {/* Sidebar Controls */}
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col">
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar">
          <div className="flex items-center gap-2 mb-8">
            <Sparkles className="w-6 h-6 text-indigo-400" />
            <h1 className="text-xl font-bold bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              PromptSite
            </h1>
          </div>
          
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-2">
                Website Description
              </label>
              <textarea 
                value={userPrompt}
                onChange={(e) => setUserPrompt(e.target.value)}
                placeholder="e.g., A modern coffee shop in Honolulu..."
                className="w-full h-40 bg-slate-800/50 border border-slate-700 rounded-xl p-4 text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 resize-none"
              />
            </div>
            
            <button 
              onClick={handleGenerate}
              disabled={isLoading || !userPrompt.trim()}
              className="w-full py-3 px-4 bg-indigo-500 hover:bg-indigo-600 disabled:bg-slate-800 disabled:text-slate-500 text-white font-medium rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
            >
              {isLoading ? (
                <RefreshCcw className="w-5 h-5 animate-spin" />
              ) : (
                <Wand2 className="w-5 h-5" />
              )}
              {isLoading ? 'Generating...' : 'Generate Site'}
            </button>
          </div>
        </div>
      </aside>

      {/* Main Preview Area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navbar */}
        <header className="h-16 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between px-6">
          <div className="flex items-center gap-1 bg-slate-800/50 p-1 rounded-lg">
            <button 
              onClick={() => setActiveTab('preview')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'preview' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button 
              onClick={() => setActiveTab('code')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'code' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'}`}
            >
              <Code2 className="w-4 h-4" /> Code
            </button>
          </div>

          {activeTab === 'preview' && (
            <div className="flex items-center gap-2">
              <button 
                onClick={() => setViewMode('mobile')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'mobile' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <Smartphone className="w-4 h-4" />
              </button>
              <button 
                onClick={() => setViewMode('desktop')}
                className={`p-2 rounded-lg transition-all ${viewMode === 'desktop' ? 'bg-indigo-500/20 text-indigo-400' : 'text-slate-400 hover:bg-slate-800'}`}
              >
                <Monitor className="w-4 h-4" />
              </button>
            </div>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden p-6 bg-slate-950/50">
          {!generatedHtml && !isLoading ? (
            <div className="h-full flex flex-col items-center justify-center text-slate-500 space-y-4">
              <Layout className="w-16 h-16 opacity-20" />
              <p>Describe your website to start generating</p>
            </div>
          ) : (
            <div className="h-full relative">
              {isLoading && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950/80 backdrop-blur-sm rounded-xl">
                  <div className="flex flex-col items-center gap-4">
                    <RefreshCcw className="w-8 h-8 text-indigo-400 animate-spin" />
                    <p className="text-indigo-400 font-medium animate-pulse">Consulting the Design Spirits...</p>
                  </div>
                </div>
              )}

              {activeTab === 'preview' ? (
                <div className={`mx-auto h-full w-full transition-all duration-500 rounded-xl overflow-hidden shadow-2xl shadow-black/50 border border-slate-800 bg-white ${viewMode === 'mobile' ? 'max-w-[375px]' : 'max-w-full'}`}>
                  <iframe 
                    ref={iframeRef}
                    className="w-full h-full bg-white"
                    title="Site Preview"
                  />
                </div>
              ) : (
                <div className="h-full rounded-xl overflow-hidden border border-slate-800 bg-slate-900">
                  <pre className="p-6 text-xs text-indigo-300 font-mono h-full overflow-auto selection:bg-indigo-500/30 leading-relaxed custom-scrollbar">
                    <code>{generatedHtml}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* Scrollbar Styles */}
      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </main>
  );
}
