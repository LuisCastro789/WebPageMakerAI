// api/generate.js
import { GoogleGenerativeAI } from "@google/genai";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Extract ALL the dynamic variables sent from the React frontend
    const { prompt, style, imageInstructions, isRefinement } = req.body; 

    // Build your awesome prompt dynamically on the secure server
    const finalPrompt = `
      You are an expert Senior Web Designer and Frontend Developer. 
      Your task is to generate a beautiful, fully functional, single-file HTML landing page using Tailwind CSS.
      
      RULES:
      1. ONLY return the HTML code. No markdown formatting like \`\`\`html.
      2. Use Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>
      3. Use Google Fonts for typography.
      4. For general placeholder images, use descriptive Unsplash URLs.
      5. The site must be mobile-responsive.
      6. Include a Hero section, Features/Services, About, and a Footer.
      7. Apply a ${style || 'modern'} aesthetic.
      8. Use Lucide icons (as SVGs) or generic semantic icons.
      
      ${imageInstructions || ""}
      
      CURRENT CONTEXT:
      The user wants: ${prompt}
      ${isRefinement ? `This is a REFINEMENT of the previous site. Keep the existing structure but apply these changes: ${prompt}` : ""}
    `;

    // Call the Gemini API securely
    const response = await ai.generateContent({
      model: 'gemini-2.5-flash',
      contents: finalPrompt, 
    });

    return res.status(200).json({ text: response.text });

  } catch (error) {
    console.error("Backend Generation Error:", error);
    return res.status(500).json({ error: 'Failed to generate content' });
  }
}
