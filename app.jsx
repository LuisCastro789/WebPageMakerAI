import React, { useState, useEffect, useRef } from 'react';
import { 
  Wand2, 
  Layout, 
  Code2, 
  Eye, 
  Download, 
  RefreshCcw, 
  ChevronRight, 
  Smartphone, 
  Monitor,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Upload,
  X,
  Image as ImageIcon
} from 'lucide-react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, doc, updateDoc, deleteDoc } from 'firebase/firestore';

// --- Firebase Configuration ---
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

// --- API Constants ---
const apiKey = import.meta.env.VITE_GEMINI_API_KEY; 
const MODEL_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;


const App = () => {
  const [user, setUser] = useState(null);
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState("Modern/Professional");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedHtml, setGeneratedHtml] = useState("");
  const [history, setHistory] = useState([]);
  const [viewMode, setViewMode] = useState('desktop'); 
  const [activeTab, setActiveTab] = useState('preview'); 
  const [error, setError] = useState(null);
  
  // Array to hold up to 5 custom images
  const [uploadedImages, setUploadedImages] = useState([]); 
  
  const iframeRef = useRef(null);

  // --- Auth & Storage Initialization ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // Fetch project history from Firestore
  useEffect(() => {
    if (!user) return;
    const q = collection(db, 'artifacts', appId, 'users', user.uid, 'projects');
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setHistory(docs);
    }, (err) => console.error("Firestore error:", err));
    return () => unsubscribe();
  }, [user]);

  // Update iframe content and inject all uploaded images
  useEffect(() => {
    if (generatedHtml && iframeRef.current) {
      let finalHtml = generatedHtml;
      
      // Replace each unique placeholder with the corresponding base64 image data
      uploadedImages.forEach((img, index) => {
        const regex = new RegExp(`USER_IMAGE_PLACEHOLDER_${index}`, 'g');
        finalHtml = finalHtml.replace(regex, img.data);
      });
        
      const blob = new Blob([finalHtml], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      iframeRef.current.src = url;
      
      return () => URL.revokeObjectURL(url);
    }
  }, [generatedHtml, activeTab, uploadedImages]);

  // Handle uploading a new image (up to 5 limit)
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file && uploadedImages.length < 5) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setUploadedImages(prev => [
          ...prev, 
          { id: Date.now(), data: reader.result, desc: "", placement: "" }
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  // Handle updating description/placement for a specific image
  const updateImageField = (id, field, value) => {
    setUploadedImages(imgs => imgs.map(img =>
      img.id === id ? { ...img, [field]: value } : img
    ));
  };

  const removeImage = (id) => {
    setUploadedImages(imgs => imgs.filter(img => img.id !== id));
  };

  const generateWebsite = async (isRefinement = false) => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setError(null);

    // Build the dynamic instruction block for all uploaded images
    const imageInstructions = uploadedImages.length > 0 ? `
      USER UPLOADED IMAGES:
      The user has provided ${uploadedImages.length} custom images. 
      You MUST include an <img> tag for EACH of these exactly where requested.
      
      ${uploadedImages.map((img, i) => `
      --- Image ${i + 1} ---
      Description: "${img.desc}"
      Desired Placement: "${img.placement}"
      CRITICAL RULE: Use EXACTLY this string for the src attribute: USER_IMAGE_PLACEHOLDER_${i}
      Example: <img src="USER_IMAGE_PLACEHOLDER_${i}" alt="${img.desc}" class="...">
      `).join('\n')}
    ` : "";

    // SYSTEM PROMPT: Role-based + Constraints + Format instructions
    const systemInstruction = `
      You are an expert Senior Web Designer and Frontend Developer. 
      Your task is to generate a beautiful, fully functional, single-file HTML landing page using Tailwind CSS.
      
      RULES:
      1. ONLY return the HTML code. No markdown formatting like \`\`\`html.
      2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
      3. Use Google Fonts for typography.
      4. For general placeholder images, use descriptive Unsplash URLs.
      5. The site must be mobile-responsive.
      6. Include a Hero section, Features/Services, About, and a Footer.
      7. Apply a ${style} aesthetic.
      8. Use Lucide icons (as SVGs) or generic semantic icons.
      
      ${imageInstructions}
      
      CURRENT CONTEXT:
      The user wants: ${prompt}
      ${isRefinement ? `This is a REFINEMENT of the previous site. Keep the existing structure but apply these changes: ${prompt}` : ""}
    `;

    try {
      let retryCount = 0;
      const maxRetries = 5;
      const delays = [1000, 2000, 4000, 8000, 16000];

      const callApi = async () => {
        const response = await fetch(MODEL_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            systemInstruction: { parts: [{ text: systemInstruction }] }
          })
        });

        if (!response.ok) throw new Error(`API Error: ${response.status}`);
        const result = await response.json();
        return result.candidates?.[0]?.content?.parts?.[0]?.text;
      };

      let resultText = "";
      while (retryCount < maxRetries) {
        try {
          resultText = await callApi();
          break;
        } catch (e) {
          retryCount++;
          if (retryCount === maxRetries) throw e;
          await new Promise(res => setTimeout(res, delays[retryCount - 1]));
        }
      }

      // Clean Markdown formatting if the AI ignores the "no markdown" rule
      const cleanHtml = resultText.replace(/```html|```/g, "").trim();
      setGeneratedHtml(cleanHtml);
      
      // Save to Firestore if user is authenticated
      if (user) {
        await addDoc(collection(db, 'artifacts', appId, 'users', user.uid, 'projects'), {
          prompt: prompt,
          style: style,
          timestamp: Date.now(),
          html: cleanHtml
        });
      }
    } catch (err) {
      setError("Failed to generate website. Please check your connection and try again.");
      console.error(err);
    } finally {
      setIsGenerating(false);
    }
  };

  const downloadHtml = () => {
    const element = document.createElement("a");
    const file = new Blob([generatedHtml], {type: 'text/html'});
    element.href = URL.createObjectURL(file);
    element.download = "my-ai-site.html";
    document.body.appendChild(element);
    element.click();
  };

  const loadFromHistory = (proj) => {
    setPrompt(proj.prompt);
    setStyle(proj.style);
    setGeneratedHtml(proj.html);
    setActiveTab('preview');
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      {/* Sidebar - Control Panel */}
      <aside className="w-80 border-r border-slate-800 flex flex-col bg-slate-900/50 backdrop-blur-xl">
        <div className="p-6 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <Wand2 size={20} className="text-white" />
            </div>
            <h1 className="text-xl font-bold tracking-tight">PromptSite</h1>
          </div>
          <p className="text-xs text-slate-400">PCATT Gen AI Project Prototype</p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
          {/* Style Selector */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Design Style</label>
            <div className="grid grid-cols-1 gap-2">
              {["Modern/Professional", "Playful/Colorful", "Minimalist/Dark"].map((s) => (
                <button
                  key={s}
                  onClick={() => setStyle(s)}
                  className={`text-left px-4 py-2.5 rounded-xl text-sm transition-all border ${
                    style === s 
                    ? "bg-indigo-600/10 border-indigo-500 text-indigo-400" 
                    : "bg-slate-800/50 border-slate-700 text-slate-400 hover:border-slate-600"
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt Area */}
          <div>
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2 block">Describe your Site</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="e.g., A luxury real estate landing page with high-res images and a gold accent color..."
              className="w-full h-32 bg-slate-800/50 border border-slate-700 rounded-xl p-3 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none transition-all resize-none placeholder:text-slate-600"
            />
          </div>

          {/* Multiple Custom Asset Upload */}
          <div className="bg-slate-800/30 p-4 rounded-xl border border-slate-700/50">
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
                <ImageIcon size={14} /> Custom Images ({uploadedImages.length}/5)
              </label>
            </div>
            
            <div className="space-y-4">
              {uploadedImages.map((img, index) => (
                <div key={img.id} className="p-3 bg-slate-800/80 border border-slate-700 rounded-lg space-y-2 relative">
                  <div className="flex items-start gap-3">
                    <img src={img.data} alt={`Upload ${index}`} className="w-16 h-16 object-cover rounded border border-slate-600 shrink-0" />
                    <div className="space-y-2 flex-1">
                      <input
                        type="text"
                        value={img.desc}
                        onChange={(e) => updateImageField(img.id, 'desc', e.target.value)}
                        placeholder="What is this? (e.g. My Logo)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-slate-500"
                      />
                      <input
                        type="text"
                        value={img.placement}
                        onChange={(e) => updateImageField(img.id, 'placement', e.target.value)}
                        placeholder="Where to put it? (e.g. Header)"
                        className="w-full bg-slate-900 border border-slate-700 rounded-md p-1.5 text-xs focus:ring-1 focus:ring-indigo-500 outline-none placeholder:text-slate-500"
                      />
                    </div>
                  </div>
                  <button 
                    onClick={() => removeImage(img.id)}
                    className="absolute -top-2 -right-2 p-1 bg-slate-900 border border-slate-700 text-red-400 hover:text-red-300 rounded-full hover:bg-slate-800 transition-all shadow-lg"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}

              {uploadedImages.length < 5 && (
                <label className="flex flex-col items-center justify-center w-full h-16 border-2 border-slate-700 border-dashed rounded-xl cursor-pointer hover:bg-slate-800/50 hover:border-indigo-500/50 transition-all">
                  <div className="flex items-center gap-2">
                    <Upload className="w-4 h-4 text-slate-400" />
                    <p className="text-xs font-medium text-slate-400">Add Image</p>
                  </div>
                  <input type="file" className="hidden" accept="image/*" onChange={handleFileUpload} />
                </label>
              )}
            </div>
          </div>

          <button
            onClick={() => generateWebsite(generatedHtml !== "")}
            disabled={isGenerating || !prompt}
            className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:bg-slate-800 disabled:text-slate-600 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all shadow-lg shadow-indigo-900/20"
          >
            {isGenerating ? (
              <>
                <RefreshCcw size={18} className="animate-spin" />
                Architecting...
              </>
            ) : (
              <>
                {generatedHtml ? <Sparkles size={18} /> : <Layout size={18} />}
                {generatedHtml ? "Refine Design" : "Generate Site"}
              </>
            )}
          </button>

          {/* Recent Projects */}
          {history.length > 0 && (
            <div>
              <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3 block">History</label>
              <div className="space-y-2">
                {history.slice(0, 5).map((proj) => (
                  <button
                    key={proj.id}
                    onClick={() => loadFromHistory(proj)}
                    className="w-full text-left p-3 rounded-lg bg-slate-800/30 border border-slate-700/50 hover:bg-slate-800 transition-colors flex items-center justify-between group"
                  >
                    <div className="truncate pr-2">
                      <p className="text-xs font-medium text-slate-300 truncate">{proj.prompt}</p>
                      <p className="text-[10px] text-slate-500">{new Date(proj.timestamp).toLocaleDateString()}</p>
                    </div>
                    <ChevronRight size={14} className="text-slate-600 group-hover:text-indigo-400 transition-colors" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {user && (
          <div className="p-4 border-t border-slate-800 shrink-0">
            <div className="flex items-center gap-2 px-2 py-1 bg-slate-800/50 rounded-lg">
              <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
              <span className="text-[10px] text-slate-400 truncate">User: {user.uid}</span>
            </div>
          </div>
        )}
      </aside>

      {/* Main Preview Area */}
      <main className="flex-1 flex flex-col bg-slate-950">
        {/* Toolbar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/30">
          <div className="flex items-center gap-4">
            <nav className="flex bg-slate-900 rounded-lg p-1 border border-slate-800">
              <button 
                onClick={() => setActiveTab('preview')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'preview' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Eye size={16} /> Preview
              </button>
              <button 
                onClick={() => setActiveTab('code')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${activeTab === 'code' ? 'bg-slate-800 text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <Code2 size={16} /> Code
              </button>
            </nav>

            {activeTab === 'preview' && (
              <div className="flex gap-1 bg-slate-900 rounded-lg p-1 border border-slate-800">
                <button 
                  onClick={() => setViewMode('desktop')}
                  className={`p-1.5 rounded-md ${viewMode === 'desktop' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500'}`}
                >
                  <Monitor size={18} />
                </button>
                <button 
                  onClick={() => setViewMode('mobile')}
                  className={`p-1.5 rounded-md ${viewMode === 'mobile' ? 'bg-slate-800 text-indigo-400' : 'text-slate-500'}`}
                >
                  <Smartphone size={18} />
                </button>
              </div>
            )}
          </div>

          {generatedHtml && (
            <button 
              onClick={downloadHtml}
              className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 px-4 py-2 rounded-lg text-sm font-medium transition-all"
            >
              <Download size={16} /> Export HTML
            </button>
          )}
        </header>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden relative p-8">
          {!generatedHtml && !isGenerating ? (
            <div className="h-full flex flex-col items-center justify-center text-center space-y-4 max-w-md mx-auto">
              <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center border border-slate-800 mb-2">
                <Sparkles className="text-indigo-500" size={32} />
              </div>
              <h2 className="text-2xl font-bold">Ready to build?</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Describe your project on the left. Our AI will draft a complete landing page with professional layout, typography, and images.
              </p>
              <div className="grid grid-cols-2 gap-3 w-full pt-4">
                <button onClick={() => setPrompt("A modern sushi restaurant in Honolulu called 'Oahu Bites'")} className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2 rounded-lg text-slate-400 italic">"Modern sushi restaurant..."</button>
                <button onClick={() => setPrompt("Portfolio for a freelance graphic designer named Alex")} className="text-[11px] bg-slate-900 hover:bg-slate-800 border border-slate-800 p-2 rounded-lg text-slate-400 italic">"Freelance portfolio..."</button>
              </div>
            </div>
          ) : (
            <div className="h-full flex flex-col">
              {error && (
                <div className="mb-4 bg-red-900/20 border border-red-500/50 text-red-200 px-4 py-3 rounded-xl flex items-center gap-3">
                  <AlertCircle size={20} />
                  <span className="text-sm">{error}</span>
                </div>
              )}

              {isGenerating && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm transition-all">
                  <div className="text-center space-y-4">
                    <div className="relative inline-block">
                      <div className="w-16 h-16 border-4 border-indigo-600/30 border-t-indigo-500 rounded-full animate-spin"></div>
                      <Sparkles className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-indigo-400 animate-pulse" size={24} />
                    </div>
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
                  <pre className="p-6 text-xs text-indigo-300 font-mono h-full overflow-auto selection:bg-indigo-500/30 leading-relaxed">
                    <code>{generatedHtml}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      <style dangerouslySetInnerHTML={{__html: `
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
      `}} />
    </div>
  );
};

export default App;
