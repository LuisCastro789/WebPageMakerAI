// api/generate.js
import { GoogleGenerativeAI } from "@google/genai";

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 2. Safely access the key on the server side
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // 3. Get the prompt and user data sent from the React frontend
    const { prompt, images } = req.body; 

    // 4. Call the Gemini API securely
    const response = await ai.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      // Pass the images payload if you have it implemented
    });

    // 5. Send the result back to your frontend
    return res.status(200).json({ text: response.text });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Failed to generate content' });
  }
}
