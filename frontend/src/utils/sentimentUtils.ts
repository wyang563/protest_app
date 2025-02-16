// frontend/src/utils/sentimentUtils.tsx
interface SentimentResult {
  label: string;
  score: number;
}

  
  const API_URL = process.env.NODE_ENV === 'production'
    ? 'https://protest.morelos.dev'
    : 'http://localhost:5001';
  
  export async function getSentiment(text: string): Promise<SentimentResult> {
    try {
      if (!text) {
        return { label: "empty input", score: 0 };
      }
  
      // Define the possible sentiment labels
      const sentiments = [
        "need supplies",
        "fleeing",
        "medical emergency",
        "advancing"
      ];
  
      // Get a random sentiment
      const randomSentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
      
      // Generate a random confidence score between 0.6 and 1.0
      const randomScore = 0.6 + Math.random() * 0.4;
  
      return {
        label: randomSentiment,
        score: randomScore
      };
    } catch (error) {
      console.error('Error getting sentiment:', error);
      return { label: "error", score: 0 };
    }
  }