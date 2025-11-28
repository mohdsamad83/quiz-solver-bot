import axios from 'axios';

// The URL for the AIPipe API
const AIPipeUrl = 'https://api.aipipe.org/v1/chat/completions';

// The interface for the AIPipe request payload
interface AIPipePayload {
    model: string;
    messages: {
        role: 'system' | 'user';
        content: string;
    }[];
    temperature?: number;
    max_tokens?: number;
}

// The interface for the AIPipe API response
interface AIPipeResponse {
    choices: {
        message: {
            content: string;
        };
    }[];
}

/**
 * Solves a quiz question using the AIPipe API.
 * @param page_content The content of the page containing the quiz.
 * @param question The quiz question to solve.
 * @returns The answer to the quiz question.
 */
export async function solveWithAIPipe(page_content: string, question: string): Promise<any> {
    try {
        const token = process.env.AIPIPE_TOKEN;

        if (!token) {
            throw new Error('AIPIPE_TOKEN is not defined in environment variables.');
        }

        const payload: AIPipePayload = {
            model: 'gpt-4-turbo', // Or any other suitable model
            messages: [
                {
                    role: 'system',
                    content: 'You are an expert data analyst. Your task is to analyze the provided data and answer the question. Return only the answer in the requested format, without any additional text or explanations. The answer should be a valid JSON object or a single value.',
                },
                {
                    role: 'user',
                    content: `Here is the data from the page:\n\n${page_content}\n\nHere is the question:\n\n${question}\n\nPlease provide only the answer.`,
                },
            ],
            temperature: 0,
            max_tokens: 1000,
        };

        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
        };

        const response = await axios.post<AIPipeResponse>(AIPipeUrl, payload, { headers });

        if (response.data.choices && response.data.choices.length > 0) {
            const answerText = response.data.choices[0].message.content.trim();
            try {
                // Try to parse the answer as JSON
                return JSON.parse(answerText);
            } catch (e) {
                // If it's not JSON, return the raw text
                return answerText;
            }
        } else {
            throw new Error('No answer found in AIPipe response.');
        }
    } catch (error) {
        console.error('Error solving with AIPipe:', error);
        if (axios.isAxiosError(error)) {
            console.error('AIPipe API response:', error.response?.data);
        }
        throw new Error('Failed to solve quiz with AIPipe.');
    }
}
